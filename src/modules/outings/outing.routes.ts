import { Router } from 'express'
import { Prisma, type LocationPrecision } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { deltaSchema, idParam } from '../../lib/schemas'
import { authorSelect, speciesSummarySelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { detectLanguage } from '../../lib/language'
import { deltaToExcerpt } from '../../lib/delta'
import type { Locale } from '../../lib/i18n'
import { assertOwnerOrAdmin, currentUser, requireAuth, requireVerified, type AuthUser } from '../../middleware/auth'
import { hiddenUserIds, visibleAuthor } from '../social/blocks'
import { deleteImagesFor, removeFromStorage, syncImages, validateImageIds } from '../images/image.service'
import { exifJson, exifSchema, loadSpecies, photoListSelect, placeContains, precisionSchema, takenAtSchema, toPhotoSummary } from '../photos/photo.routes'
import { effectivePrecision, presentLocation } from '../photos/location'
import { refreshQuality } from '../photos/quality'
import { resolveGear } from '../gear/normalize'
import { assertTripMember } from '../trips/membership'
import { areaOf, timezoneAt } from '../places/areas'
import { localized, placeRefSelect, toPlaceRef } from '../places/refs'
import { fetchWeather } from './weather'

/**
 * Outings (field journals): one time out in the field — place, time span, weather, a species
 * checklist, the observations made and notes. The batch upload keeps its state in a DRAFT
 * outing (draft JSON + images held by the outing) and publishes it in one step.
 *
 *   GET    /outings                 published outings (authorId, placeId, tripId filters)
 *   GET    /outings/drafts          the viewer's drafts
 *   GET    /outings/:id             one outing (drafts: author / admin only)
 *   POST   /outings                 create a draft
 *   PATCH  /outings/:id             update fields, checklist or the draft
 *   POST   /outings/:id/publish     create the observations and publish
 *   DELETE /outings/:id             drafts: with their uploads; published: observations are kept
 *
 * Privacy (same rule as places): to anyone but the author, an outing never lists sensitive
 * species (checklist or observations) or observations with a hidden location, and its own
 * location is shown with its precision (blurred / hidden).
 */

const MAX_OBSERVATIONS = 100
const STRICTNESS: Record<LocationPrecision, number> = { EXACT: 0, APPROX: 1, HIDDEN: 2 }
const MAX_DURATION_MS = 3 * 86400_000

const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s))

/** One observation being assembled in the batch upload. */
const observationDraft = z.object({
  key: z.string().trim().min(1).max(40),
  imageIds: z.array(z.number().int().positive()).min(1).max(10),
  speciesId: z.number().int().positive().nullable().default(null),
  title: z.string().trim().max(40).default(''),
  description: z.string().trim().max(1000).default(''),
  takenAt: takenAtSchema.nullable().default(null),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  exif: exifSchema.nullable().default(null),
  captive: z.boolean().default(false),
  critiqueRequested: z.boolean().default(false)
})
const draftSchema = z.object({
  observations: z.array(observationDraft).max(MAX_OBSERVATIONS),
  /** Uploads not (yet) assigned to an observation; kept until publish, then discarded. */
  tray: z.array(z.number().int().positive()).max(500).default([])
})
type Draft = z.infer<typeof draftSchema>

const checklistEntry = z.object({
  speciesId: z.number().int().positive(),
  count: z.number().int().min(1).max(100_000).nullable().default(null),
  note: z.string().trim().max(200).nullable().default(null),
  heardOnly: z.boolean().default(false)
})

const outingFields = z.object({
  title: z.string().trim().min(2).max(80),
  locationName: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  locationPrecision: precisionSchema,
  placeId: z.number().int().positive().nullable(),
  startedAt: isoDate,
  endedAt: isoDate,
  notes: deltaSchema.nullable(),
  distanceKm: z.number().min(0).max(500).nullable(),
  tripId: z.number().int().positive().nullable(),
  species: z.array(checklistEntry).max(500),
  draft: draftSchema.nullable()
})
const outingCreate = outingFields.extend({
  locationPrecision: precisionSchema.default('EXACT'),
  placeId: outingFields.shape.placeId.default(null),
  notes: outingFields.shape.notes.default(null),
  distanceKm: outingFields.shape.distanceKm.default(null),
  tripId: outingFields.shape.tripId.default(null),
  species: outingFields.shape.species.default([]),
  draft: outingFields.shape.draft.default({ observations: [], tray: [] })
})
const outingUpdate = outingFields.partial()

const listQuery = paginationQuery.extend({
  authorId: z.coerce.number().int().positive().optional(),
  placeId: z.coerce.number().int().positive().optional(),
  tripId: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(12)
})

// ── helpers ──

const assertTimes = (startedAt: Date, endedAt: Date) => {
  if (endedAt < startedAt) throw ApiError.badRequest('outing.time_order')
  if (endedAt.getTime() - startedAt.getTime() > MAX_DURATION_MS) throw ApiError.badRequest('outing.too_long')
  if (startedAt.getTime() > Date.now() + 60_000) throw ApiError.badRequest('validation.taken_at_future')
}

/** Curated (or the author's own proposal; admins any) and containing the outing's location. */
const assertPlace = async (placeId: number, ownerId: number, actor: AuthUser, lat: number, lng: number, locale: Locale) => {
  const place = await prisma.place.findUnique({ where: { id: placeId }, select: { status: true, createdById: true, latitude: true, longitude: true, radiusM: true, name: true } })
  if (!place || (place.status !== 'CURATED' && place.createdById !== ownerId && actor.role !== 'ADMIN')) throw ApiError.badRequest('place.unavailable')
  if (!placeContains(place, lat, lng)) throw ApiError.badRequest('place.outside', { name: localized(place.name, locale) ?? '' })
  return place
}

const validSpecies = async (ids: number[]) => {
  if (!ids.length) return
  const found = await prisma.species.count({ where: { id: { in: [...new Set(ids)] } } })
  if (found !== new Set(ids).size) throw ApiError.badRequest('species.missing')
}

/** Draft uploads are held by the outing so they aren't purged as orphans. */
const holdDraftImages = async (user: AuthUser, outingId: number, draft: Draft) => {
  const ids = [...new Set([...draft.observations.flatMap((o) => o.imageIds), ...draft.tray])]
  const valid = await validateImageIds(user, ids, 'outingId', outingId)
  await syncImages('outingId', outingId, valid)
}

export const outingSelect = {
  id: true,
  title: true,
  locationName: true,
  latitude: true,
  longitude: true,
  locationPrecision: true,
  area: true,
  startedAt: true,
  endedAt: true,
  timezone: true,
  distanceKm: true,
  weather: true,
  status: true,
  language: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  author: { select: authorSelect },
  place: { select: placeRefSelect },
  trip: { select: { id: true, title: true, startsAt: true } }
} satisfies Prisma.OutingSelect
type OutingRow = Prisma.OutingGetPayload<{ select: typeof outingSelect }>

/**
 * Location fields as others may see them. The place only when it is curated and the location
 * is exact; the trip (whose meeting point is public) only when the location is exact.
 * The author and admins see everything.
 */
const presentOuting = (o: OutingRow, viewer: AuthUser | undefined, locale: Locale) => {
  const { authorId: _a, place, trip, ...rest } = o
  const own = viewer?.id === o.author.id || viewer?.role === 'ADMIN'
  const exact = o.locationPrecision === 'EXACT'
  return {
    ...presentLocation(rest, o.author.id, viewer),
    place: place && (own || (exact && place.status === 'CURATED')) ? toPlaceRef(place, locale) : null,
    trip: trip && (own || exact) ? trip : null
  }
}

/** Proposed places are visible to their proposer and admins only. */
const visiblePlace = (viewer?: AuthUser): Prisma.PlaceWhereInput =>
  viewer?.role === 'ADMIN' ? {} : { OR: [{ status: 'CURATED' }, ...(viewer ? [{ createdById: viewer.id }] : [])] }

/** Journals with photos first, then the most recent. */
export const outingOrder: Prisma.OutingOrderByWithRelationInput[] = [{ photos: { _count: 'desc' } }, { startedAt: 'desc' }, { id: 'desc' }]

/** Observations of an outing that the viewer may see listed on it. */
const visibleObservationWhere = (own: boolean): Prisma.PhotoPostWhereInput =>
  own ? {} : { locationPrecision: { not: 'HIDDEN' }, OR: [{ speciesId: null }, { species: { sensitive: false } }] }

const loadOuting = async (id: number) => {
  const o = await prisma.outing.findUnique({ where: { id }, select: { ...outingSelect, draft: true, notes: true } })
  if (!o) throw ApiError.notFound('outing')
  return o
}

export const outingRoutes = Router()

// ── list ──
outingRoutes.get('/', async (req, res) => {
  const q = parse(listQuery, req.query)
  const where: Prisma.OutingWhereInput = {
    AND: [
      { status: 'PUBLISHED' },
      await visibleAuthor(req.user?.id),
      q.authorId ? { authorId: q.authorId } : {},
      // Place and trip listings show outings whose location is public at that place.
      q.placeId ? { placeId: q.placeId, locationPrecision: 'EXACT', place: visiblePlace(req.user) } : {},
      // A trip's meeting point is public: list only journals whose location is too (or the viewer's own).
      q.tripId ? { tripId: q.tripId, OR: [{ locationPrecision: 'EXACT' }, ...(req.user ? [{ authorId: req.user.id }] : [])] } : {}
    ]
  }
  const [rows, total] = await Promise.all([
    prisma.outing.findMany({ where, select: outingSelect, orderBy: outingOrder, ...toSkipTake(q) }),
    prisma.outing.count({ where })
  ])
  res.json(paginated(await summarize(rows, req.user, req.locale), total, q))
})

/** Cards: cover photo, observation and species counts (as the viewer may see them). */
export const summarize = async (rows: OutingRow[], viewer: AuthUser | undefined, locale: Locale) => {
  const ids = rows.map((r) => r.id)
  if (!ids.length) return []
  const [photos, checklist] = await Promise.all([
    prisma.photoPost.findMany({
      where: { outingId: { in: ids } },
      select: { id: true, outingId: true, authorId: true, speciesId: true, locationPrecision: true, species: { select: { sensitive: true } }, images: { select: { url: true, width: true, height: true }, orderBy: { position: 'asc' }, take: 1 } },
      orderBy: { takenAt: 'asc' }
    }),
    prisma.outingSpecies.findMany({ where: { outingId: { in: ids } }, select: { outingId: true, speciesId: true, species: { select: { sensitive: true } } } })
  ])
  return rows.map((r) => {
    const own = viewer?.id === r.author.id || viewer?.role === 'ADMIN'
    const mine = photos.filter((p) => p.outingId === r.id && (own || (p.locationPrecision !== 'HIDDEN' && !p.species?.sensitive)))
    const species = new Set([
      ...checklist.filter((c) => c.outingId === r.id && (own || !c.species.sensitive)).map((c) => c.speciesId),
      ...mine.flatMap((p) => (p.speciesId ? [p.speciesId] : []))
    ])
    return { ...presentOuting(r, viewer, locale), cover: mine.find((p) => p.images[0])?.images[0] ?? null, observationCount: mine.length, speciesCount: species.size }
  })
}

outingRoutes.get('/drafts', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const rows = await prisma.outing.findMany({ where: { authorId: user.id, status: 'DRAFT' }, select: { ...outingSelect, draft: true }, orderBy: { updatedAt: 'desc' } })
  res.json(
    rows.map(({ draft, ...r }) => ({
      ...presentOuting(r, req.user, req.locale),
      observationCount: (draft as Draft | null)?.observations?.length ?? 0
    }))
  )
})

// ── detail ──
outingRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const viewer = req.user
  const o = await loadOuting(id)
  const own = viewer?.id === o.author.id || viewer?.role === 'ADMIN'
  if (o.status === 'DRAFT' && !own) throw ApiError.notFound('outing')
  if ((await hiddenUserIds(viewer?.id)).includes(o.author.id)) throw ApiError.notFound('outing')

  const [photos, checklist] = await Promise.all([
    prisma.photoPost.findMany({ where: { outingId: id, ...visibleObservationWhere(own) }, select: photoListSelect, orderBy: [{ takenAt: 'asc' }, { id: 'asc' }] }),
    prisma.outingSpecies.findMany({ where: { outingId: id, ...(own ? {} : { species: { sensitive: false } }) }, select: { count: true, note: true, heardOnly: true, species: { select: speciesSummarySelect } } })
  ])
  // Checklist = entered species ∪ species observed on photos (with photo counts).
  const bySpecies = new Map<number, { species: (typeof checklist)[number]['species']; count: number | null; note: string | null; heardOnly: boolean; photoCount: number }>()
  for (const c of checklist) bySpecies.set(c.species.id, { species: c.species, count: c.count, note: c.note, heardOnly: c.heardOnly, photoCount: 0 })
  for (const p of photos) {
    if (!p.species) continue
    const e = bySpecies.get(p.species.id) ?? bySpecies.set(p.species.id, { species: p.species, count: null, note: null, heardOnly: false, photoCount: 0 }).get(p.species.id)!
    e.photoCount++
  }
  const { draft, notes, ...rest } = o
  res.json({
    ...presentOuting(rest, viewer, req.locale),
    notes,
    species: [...bySpecies.values()].sort((a, b) => b.photoCount - a.photoCount || a.species.commonName.localeCompare(b.species.commonName)),
    observations: photos.map((p) => toPhotoSummary(p, viewer, req.locale)),
    ...(own && o.status === 'DRAFT' && {
      draft,
      // Uploads held by the draft, to show them when the batch upload is resumed.
      draftImages: await prisma.image.findMany({ where: { outingId: id }, select: { id: true, url: true, width: true, height: true } }),
      draftSpecies: await prisma.species.findMany({
        where: { id: { in: draftSchema.parse(draft ?? { observations: [] }).observations.flatMap((ob) => (ob.speciesId ? [ob.speciesId] : [])) } },
        select: speciesSummarySelect
      })
    })
  })
})

// ── create / update ──
outingRoutes.post('/', requireVerified, async (req, res) => {
  const user = currentUser(req)
  const data = parse(outingCreate, req.body)
  assertTimes(data.startedAt, data.endedAt)
  if (data.placeId) await assertPlace(data.placeId, user.id, user, data.latitude, data.longitude, req.locale)
  if (data.tripId) await assertTripMember(data.tripId, user.id)
  await validSpecies(data.species.map((s) => s.speciesId))
  const { species, draft, notes, ...fields } = data
  const outing = await prisma.outing.create({
    data: {
      ...fields,
      notes: notes ?? Prisma.DbNull,
      draft: draft ?? Prisma.DbNull,
      area: areaOf(data.latitude, data.longitude),
      timezone: timezoneAt(data.latitude, data.longitude),
      language: detectLanguage(data.title, notes ? deltaToExcerpt(notes) : ''),
      authorId: user.id,
      species: { create: species }
    },
    select: { id: true }
  })
  if (draft) await holdDraftImages(user, outing.id, draft)
  res.status(201).json(outing)
})

outingRoutes.patch('/:id', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const data = parse(outingUpdate, req.body)
  const o = await loadOuting(id)
  assertOwnerOrAdmin(user, o.author.id)
  if (data.draft && o.status !== 'DRAFT') throw ApiError.badRequest('outing.not_draft')
  const startedAt = data.startedAt ?? o.startedAt
  const endedAt = data.endedAt ?? o.endedAt
  assertTimes(startedAt, endedAt)
  const lat = data.latitude ?? o.latitude
  const lng = data.longitude ?? o.longitude
  const placeId = data.placeId === undefined ? (o.place?.id ?? null) : data.placeId
  if (placeId) await assertPlace(placeId, o.author.id, user, lat, lng, req.locale)
  if (data.tripId) await assertTripMember(data.tripId, o.author.id)
  if (data.species) await validSpecies(data.species.map((s) => s.speciesId))
  if (data.draft) await holdDraftImages(user, id, data.draft)

  const { species, draft, notes, ...fields } = data
  const moved = data.latitude !== undefined || data.longitude !== undefined
  // Stricter location on a published journal: its observations follow (and lose their place
  // when no longer exact). Loosening it leaves them alone — some may be stricter on purpose.
  if (o.status === 'PUBLISHED' && data.locationPrecision && STRICTNESS[data.locationPrecision] > STRICTNESS[o.locationPrecision]) {
    const looser = (Object.keys(STRICTNESS) as LocationPrecision[]).filter((p) => STRICTNESS[p] < STRICTNESS[data.locationPrecision!])
    await prisma.photoPost.updateMany({ where: { outingId: id, locationPrecision: { in: looser } }, data: { locationPrecision: data.locationPrecision, placeId: null } })
  }
  await prisma.outing.update({
    where: { id },
    data: {
      ...fields,
      ...(notes !== undefined && { notes: notes ?? Prisma.DbNull }),
      ...(draft !== undefined && { draft: draft ?? Prisma.DbNull }),
      ...(moved && { area: areaOf(lat, lng), timezone: timezoneAt(lat, lng) }),
      ...((data.title !== undefined || notes !== undefined) && { language: detectLanguage(data.title ?? o.title, notes ? deltaToExcerpt(notes) : '') }),
      ...(species && { species: { deleteMany: {}, create: species } })
    }
  })
  // Published outings: refresh the weather when time or place changed.
  if (o.status === 'PUBLISHED' && (moved || data.startedAt || data.endedAt)) {
    const weather = await fetchWeather({ latitude: lat, longitude: lng, startedAt, endedAt, timezone: timezoneAt(lat, lng) })
    await prisma.outing.update({ where: { id }, data: { weather: weather ? (weather as unknown as Prisma.InputJsonObject) : Prisma.DbNull } })
  }
  res.json({ id })
})

// ── publish ──
outingRoutes.post('/:id/publish', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const o = await loadOuting(id)
  assertOwnerOrAdmin(user, o.author.id)
  if (o.status !== 'DRAFT') throw ApiError.badRequest('outing.not_draft')
  const draft = draftSchema.parse(o.draft ?? { observations: [], tray: [] })
  const owner: AuthUser = o.author.id === user.id ? user : { ...user, id: o.author.id, role: 'USER' }

  // Validate everything before writing anything.
  const speciesRows = new Map<number, { id: number; sensitive: boolean; commonName: string; englishName: string | null }>()
  for (const sid of new Set(draft.observations.flatMap((ob) => (ob.speciesId ? [ob.speciesId] : [])))) {
    await loadSpecies(sid)
    const s = await prisma.species.findUnique({ where: { id: sid }, select: { id: true, sensitive: true, commonName: true, englishName: true } })
    speciesRows.set(sid, s!)
  }
  const place = o.place ? await prisma.place.findUnique({ where: { id: o.place.id }, select: { latitude: true, longitude: true, radiusM: true } }) : null
  const items = draft.observations.map((ob, i) => {
    const species = ob.speciesId ? speciesRows.get(ob.speciesId)! : null
    const title = ob.title || (species ? (o.language === 'en' ? (species.englishName ?? species.commonName) : species.commonName) : '')
    if ([...title].length < 2) throw ApiError.badRequest('outing.observation_title', { n: i + 1 })
    const lat = ob.latitude ?? o.latitude
    const lng = ob.longitude ?? o.longitude
    return { ob, species, title, lat, lng, takenAt: ob.takenAt ?? o.startedAt }
  })
  const allImages = items.flatMap((it) => it.ob.imageIds)
  if (new Set(allImages).size !== allImages.length) throw ApiError.badRequest('outing.image_twice')
  await validateImageIds(owner, allImages, 'outingId', id)

  // Reads outside the transaction (gear lookup is cached; the place doesn't change here).
  const gear = await Promise.all(items.map((it) => resolveGear(it.ob.exif)))
  const observed = [...new Set(items.flatMap((it) => (it.species ? [it.species.id] : [])))]

  // All or nothing. The first statement claims the draft: a second (or concurrent) publish
  // finds no DRAFT row and fails without writing anything.
  const { created, discarded } = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.outing.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PUBLISHED', publishedAt: new Date(), draft: Prisma.DbNull } })
      if (!claimed.count) throw ApiError.badRequest('outing.not_draft')
      const ids: number[] = []
      for (const [k, it] of items.entries()) {
        const post = await tx.photoPost.create({
          data: {
            title: it.title,
            description: it.ob.description,
            locationName: o.locationName,
            latitude: it.lat,
            longitude: it.lng,
            area: areaOf(it.lat, it.lng),
            takenAt: it.takenAt,
            speciesId: it.species?.id ?? null,
            exif: exifJson(it.ob.exif),
            ...gear[k],
            locationPrecision: effectivePrecision(o.locationPrecision, it.species),
            // Observations inherit the outing's place when they lie inside it (and the location is exact).
            placeId: o.place && place && o.locationPrecision === 'EXACT' && placeContains(place, it.lat, it.lng) ? o.place.id : null,
            tripId: o.trip?.id ?? null,
            outingId: id,
            captive: it.ob.captive,
            critiqueRequested: it.ob.critiqueRequested,
            language: detectLanguage(it.title, it.ob.description),
            authorId: o.author.id
          },
          select: { id: true }
        })
        // Move the uploads from the outing to the observation.
        for (const [position, imageId] of it.ob.imageIds.entries()) {
          await tx.image.update({ where: { id: imageId }, data: { outingId: null, photoPostId: post.id, position } })
        }
        ids.push(post.id)
      }
      // Uploads left in the draft (tray) are discarded.
      const leftover = await tx.image.findMany({ where: { outingId: id }, select: { id: true, publicId: true } })
      await tx.image.deleteMany({ where: { id: { in: leftover.map((l) => l.id) } } })
      // Observed species join the checklist (manual entries keep their count/note).
      if (observed.length) await tx.outingSpecies.createMany({ data: observed.map((speciesId) => ({ outingId: id, speciesId })), skipDuplicates: true })
      return { created: ids, discarded: leftover.map((l) => l.publicId) }
    },
    { timeout: 60_000 }
  )
  await removeFromStorage(discarded)
  await refreshQuality(...created)

  const weather = await fetchWeather({ latitude: o.latitude, longitude: o.longitude, startedAt: o.startedAt, endedAt: o.endedAt, timezone: o.timezone })
  if (weather) await prisma.outing.update({ where: { id }, data: { weather: weather as unknown as Prisma.InputJsonObject } })
  res.json({ id, observationIds: created })
})

// ── delete ──
outingRoutes.delete('/:id', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const o = await loadOuting(id)
  assertOwnerOrAdmin(user, o.author.id)
  if (o.status === 'DRAFT') await deleteImagesFor('outingId', id)
  // Published: the observations stay (outingId is set to null).
  await prisma.outing.delete({ where: { id } })
  res.status(204).end()
})
