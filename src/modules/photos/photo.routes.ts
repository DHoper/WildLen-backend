import { Router } from 'express'
import { Prisma, type LocationPrecision } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam, imageIdList, localeSchema, searchQuery } from '../../lib/schemas'
import { detectLanguage } from '../../lib/language'
import { authorSelect, imageSelect, speciesSummarySelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { taipei } from '../../lib/time'
import type { AuthUser } from '../../middleware/auth'
import { assertOwnerOrAdmin, currentUser, requireAuth, requireVerified } from '../../middleware/auth'
import { bookmarkedBy, engagementRoutes, likedBy, notify } from '../engagement/engagement'
import { deleteImagesFor, syncImages, validateImageIds } from '../images/image.service'
import { assertNotBlocked, assertVisible, visibleAuthor } from '../social/blocks'
import { effectivePrecision, presentLocation } from './location'
import { refreshQuality } from './quality'
import { assertTripMember } from '../trips/membership'
import { resolveGear } from '../gear/normalize'
import { gearRefSelect } from '../gear/refs'
import { exposesPlace, placeEligibleWhere } from '../places/privacy'
import { areaOf } from '../places/areas'
import { distanceKm, localized, placeRefSelect, toPlaceRef } from '../places/refs'
import { translateCountry } from '../../lib/countries'
import type { Locale } from '../../lib/i18n'

const exifText = z.string().trim().max(60)
export const exifSchema = z.object({
  camera: exifText.optional(),
  lens: exifText.optional(),
  focalLength: exifText.optional(),
  aperture: exifText.optional(),
  shutterSpeed: exifText.optional(),
  iso: z.number().int().min(1).max(10_000_000).optional()
})

/** Allow a minute of client clock skew. */
const CLOCK_SKEW_MS = 60_000
export const takenAtSchema = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() <= Date.now() + CLOCK_SKEW_MS, 'validation.taken_at_future')

export const precisionSchema = z.enum(['EXACT', 'APPROX', 'HIDDEN'])

// zod 4 applies `.default()` inside `.partial()`, so defaults live only on the create schema.
const photoFields = z.object({
  title: z.string().trim().min(2).max(40),
  description: z.string().trim().min(10).max(1000),
  locationName: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  imageIds: imageIdList.min(1, 'validation.image_required'),
  speciesId: z.number().int().positive().nullable(),
  takenAt: takenAtSchema.nullable(),
  exif: exifSchema.nullable(),
  locationPrecision: precisionSchema,
  critiqueRequested: z.boolean(),
  tripId: z.number().int().positive().nullable(),
  license: z.enum(['ALL_RIGHTS_RESERVED', 'CC0', 'CC_BY', 'CC_BY_NC']),
  captive: z.boolean(),
  placeId: z.number().int().positive().nullable()
})
const photoCreate = photoFields.extend({
  critiqueRequested: z.boolean().default(false),
  tripId: photoFields.shape.tripId.optional(),
  license: photoFields.shape.license.default('ALL_RIGHTS_RESERVED'),
  captive: z.boolean().default(false),
  placeId: photoFields.shape.placeId.optional(),
  speciesId: photoFields.shape.speciesId.optional(),
  takenAt: photoFields.shape.takenAt.optional(),
  exif: photoFields.shape.exif.optional(),
  locationPrecision: precisionSchema.default('EXACT')
})
const photoUpdate = photoFields.partial()

const monthSchema = z.coerce.number().int().min(1).max(12)
const listQuery = paginationQuery.merge(searchQuery).extend({
  speciesId: z.coerce.number().int().positive().optional(),
  month: monthSchema.optional(),
  quality: z.enum(['CASUAL', 'NEEDS_ID', 'CONFIRMED']).optional(),
  /** Only photos whose author asks for critique. */
  critique: z.enum(['1', 'true']).optional(),
  lens: z.string().trim().max(60).optional(),
  camera: z.string().trim().max(60).optional(),
  tripId: z.coerce.number().int().positive().optional(),
  /** Catalogue slug: photos taken with this body or lens. */
  gear: z.string().trim().max(120).optional(),
  /** Place slug: records publicly tied to the place (see places/privacy). */
  place: z.string().trim().max(80).optional(),
  /** Only photos whose title / description is in this language. */
  language: localeSchema.optional()
})
const mapQuery = z.object({
  speciesId: z.coerce.number().int().positive().optional(),
  month: monthSchema.optional()
})

const identificationBody = z.object({
  speciesId: z.number().int().positive(),
  comment: z.string().trim().max(500).nullish()
})

/** Fields of a PhotoSummary (list items, feed, bookmarks). */
export const photoListSelect = {
  language: true,
  id: true,
  title: true,
  locationName: true,
  latitude: true,
  longitude: true,
  locationPrecision: true,
  takenAt: true,
  quality: true,
  captive: true,
  license: true,
  sourceName: true,
  sourceAuthor: true,
  sourceUrl: true,
  place: { select: { name: true } },
  critiqueRequested: true,
  viewCount: true,
  createdAt: true,
  author: { select: authorSelect },
  species: { select: speciesSummarySelect },
  images: { select: imageSelect, orderBy: { position: 'asc' }, take: 1 },
  _count: { select: { likes: true, comments: true, identifications: true, critiques: true } }
} satisfies Prisma.PhotoPostSelect

type CountedRow = { _count: { likes: number; comments: number; identifications: number; critiques: number } }
const flattenCounts = <T extends CountedRow>(row: T) => {
  const { _count, ...rest } = row
  return {
    ...rest,
    likeCount: _count.likes,
    commentCount: _count.comments,
    identificationCount: _count.identifications,
    critiqueCount: _count.critiques
  }
}

/**
 * Imported records carry no text of their own: the title is the species name and the location
 * is the place (or, when blurred, the country). Both are given in the viewer's language.
 */
export const localizeImported = (
  row: {
    sourceName: string | null
    title: string
    locationName: string
    locationPrecision: LocationPrecision
    captive: boolean
    species: { commonName: string; englishName: string | null; sensitive: boolean } | null
    place: { name: Prisma.JsonValue } | null
  },
  locale?: Locale
) => {
  if (!row.sourceName || !locale) return { title: row.title, locationName: row.locationName }
  const title = row.species ? (locale === 'en' ? (row.species.englishName ?? row.species.commonName) : row.species.commonName) : row.title
  const placeName = row.place && exposesPlace(row) ? localized(row.place.name, locale) : null
  return { title, locationName: placeName ?? translateCountry(row.locationName, locale) }
}

/** Shapes a list row for `viewer` (location privacy applied). The place itself is never exposed in lists. */
export const toPhotoSummary = (
  row: Prisma.PhotoPostGetPayload<{ select: typeof photoListSelect }>,
  viewer: AuthUser | undefined,
  locale?: Locale
) => {
  const { images, place: _place, ...rest } = flattenCounts(row)
  return { ...presentLocation({ ...rest, ...localizeImported(row, locale) }, row.author.id, viewer), cover: images[0] ?? null }
}

export const exifJson = (exif: z.infer<typeof exifSchema> | null | undefined) =>
  exif === undefined ? undefined : exif === null ? Prisma.DbNull : exif

/** Resolves a species id, rejecting unknown ones. */
export const loadSpecies = async (speciesId: number | null | undefined) => {
  if (speciesId == null) return null
  const species = await prisma.species.findUnique({
    where: { id: speciesId },
    select: { id: true, sensitive: true }
  })
  if (!species) throw ApiError.badRequest('species.missing')
  return species
}

/** Ids of photos taken (takenAt, Asia/Taipei) in a given month; used for the `month` filter. */
const idsTakenInMonth = async (month: number) => {
  const rows = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM photo_posts
    WHERE taken_at IS NOT NULL AND EXTRACT(MONTH FROM ${taipei(Prisma.raw('taken_at'))}) = ${month}`
  return rows.map((r) => r.id)
}

const filterWhere = async (q: { speciesId?: number; month?: number }) => {
  const where: Prisma.PhotoPostWhereInput = {}
  if (q.speciesId) where.speciesId = q.speciesId
  if (q.month) where.id = { in: await idsTakenInMonth(q.month) }
  return where
}

/** Proposals are visible to their proposer and admins only. */
const visiblePlace = (viewer?: AuthUser): Prisma.PlaceWhereInput =>
  viewer?.role === 'ADMIN' ? {} : { OR: [{ status: 'CURATED' }, ...(viewer ? [{ createdById: viewer.id }] : [])] }

/** Slack beyond a place's radius when attaching an observation (GPS error, edge of the site). */
const PLACE_TOLERANCE_KM = 1
export const placeContains = (p: { latitude: number; longitude: number; radiusM: number }, lat: number, lng: number) =>
  distanceKm(p.latitude, p.longitude, lat, lng) <= p.radiusM / 1000 + PLACE_TOLERANCE_KM

/**
 * A place can be attached when it is curated (or a proposal by the observation's author; admins
 * may attach any) and the observation lies inside it; otherwise one far-away record would distort
 * the place's statistics.
 */
const assertPlaceUsable = async (placeId: number, ownerId: number, actor: AuthUser, lat: number, lng: number, locale: Locale) => {
  const place = await prisma.place.findUnique({ where: { id: placeId }, select: { status: true, createdById: true, latitude: true, longitude: true, radiusM: true, name: true } })
  if (!place || (place.status !== 'CURATED' && place.createdById !== ownerId && actor.role !== 'ADMIN')) throw ApiError.badRequest('place.unavailable')
  if (!placeContains(place, lat, lng)) throw ApiError.badRequest('place.outside', { name: localized(place.name, locale) ?? '' })
}

/** Loads a photo the viewer may see (404 otherwise). */
const loadVisiblePhoto = async (id: number, viewer?: AuthUser) => {
  const photo = await prisma.photoPost.findUnique({ where: { id }, select: { authorId: true, speciesId: true } })
  if (!photo) throw ApiError.notFound('photo')
  await assertVisible(viewer?.id, photo.authorId, 'photo')
  return photo
}

const identificationSelect = {
  id: true,
  comment: true,
  createdAt: true,
  speciesId: true,
  species: { select: speciesSummarySelect },
  user: { select: authorSelect }
} satisfies Prisma.IdentificationSelect

/** API shape of an identification; `agrees` = same species as the photo currently has. */
const toIdentification = (
  { speciesId, user, ...rest }: Prisma.IdentificationGetPayload<{ select: typeof identificationSelect }>,
  photoSpeciesId: number | null
) => ({ ...rest, author: user, agrees: speciesId === photoSpeciesId })

export const photoRoutes = Router()

photoRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  const where: Prisma.PhotoPostWhereInput = {
    AND: [
      await filterWhere(query),
      await visibleAuthor(req.user?.id),
      query.authorId ? { authorId: query.authorId } : {},
      query.quality ? { quality: query.quality } : {},
      query.critique ? { critiqueRequested: true } : {},
      query.lens ? { exif: { path: ['lens'], equals: query.lens } } : {},
      query.camera ? { exif: { path: ['camera'], equals: query.camera } } : {},
      query.tripId ? { tripId: query.tripId } : {},
      query.gear ? { OR: [{ camera: { slug: query.gear } }, { lens: { slug: query.gear } }] } : {},
      query.place ? { AND: [{ place: { slug: query.place, ...visiblePlace(req.user) } }, placeEligibleWhere] } : {},
      query.language ? { language: query.language } : {},
      query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { locationName: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        : {}
    ]
  }
  const orderBy: Prisma.PhotoPostOrderByWithRelationInput[] =
    query.sort === 'popular'
      ? [{ likes: { _count: 'desc' } }, { viewCount: 'desc' }, { createdAt: 'desc' }]
      : [{ createdAt: 'desc' }]

  const [rows, total] = await Promise.all([
    prisma.photoPost.findMany({ where, select: photoListSelect, orderBy, ...toSkipTake(query) }),
    prisma.photoPost.count({ where })
  ])
  res.json(paginated(rows.map((row) => toPhotoSummary(row, req.user, req.locale)), total, query))
})

/** Light-weight list of photo locations for the Explore map (HIDDEN photos excluded). */
photoRoutes.get('/map', async (req, res) => {
  const query = parse(mapQuery, req.query)
  const rows = await prisma.photoPost.findMany({
    where: {
      AND: [await filterWhere(query), await visibleAuthor(req.user?.id), { locationPrecision: { not: 'HIDDEN' }, captive: false }]
    },
    select: {
      id: true,
      title: true,
      locationName: true,
      latitude: true,
      longitude: true,
      locationPrecision: true,
      takenAt: true,
      speciesId: true,
      authorId: true,
      captive: true,
      sourceName: true,
      place: { select: { name: true } },
      species: { select: speciesSummarySelect },
      images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 }
    },
    orderBy: { createdAt: 'desc' },
    take: 5000
  })
  res.json(
    rows.map(({ images, authorId, captive: _c, sourceName: _s, place: _p, ...r }) => ({
      ...presentLocation({ ...r, ...localizeImported({ ...r, captive: _c, sourceName: _s, place: _p }, req.locale) }, authorId, req.user),
      coverUrl: images[0]?.url ?? null
    }))
  )
})

photoRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const post = await prisma.photoPost.findUnique({
    where: { id },
    select: {
      ...photoListSelect,
      description: true,
      exif: true,
      edited: true,
      updatedAt: true,
      trip: { select: { id: true, title: true, startsAt: true } },
      license: true,
      camera: { select: gearRefSelect },
      lens: { select: gearRefSelect },
      place: { select: placeRefSelect },
      sourceLicense: true,
      outing: { select: { id: true, title: true, status: true } },
      images: { select: imageSelect, orderBy: { position: 'asc' } }
    }
  })
  if (!post) throw ApiError.notFound('photo')
  await assertVisible(req.user?.id, post.author.id, 'photo')
  // Records that may not be tied to a place publicly don't reveal it (the author still sees it).
  const { place, outing, ...rest } = flattenCounts(post)
  const own = req.user?.id === post.author.id
  const showOuting = outing?.status === 'PUBLISHED' && (own || (post.locationPrecision !== 'HIDDEN' && !post.species?.sensitive))
  const showPlace = place && (exposesPlace(post) || req.user?.id === post.author.id)
  Object.assign(rest, localizeImported(post, req.locale))
  const [likedByMe, bookmarkedByMe] = await Promise.all([
    likedBy('photo', id, req.user?.id),
    bookmarkedBy('photo', id, req.user?.id)
  ])
  res.json({
    ...presentLocation(rest, post.author.id, req.user),
    place: showPlace ? toPlaceRef(place, req.locale) : null,
    outing: showOuting ? { id: outing.id, title: outing.title } : null,
    likedByMe,
    bookmarkedByMe
  })
})

photoRoutes.post('/', requireVerified, async (req, res) => {
  const user = currentUser(req)
  const { imageIds, exif, ...data } = parse(photoCreate, req.body)
  if (data.tripId) await assertTripMember(data.tripId, user.id)
  if (data.placeId) await assertPlaceUsable(data.placeId, user.id, user, data.latitude, data.longitude, req.locale)
  const species = await loadSpecies(data.speciesId)
  const ids = await validateImageIds(user, imageIds, 'photoPostId')
  const post = await prisma.photoPost.create({
    data: {
      ...data,
      ...(await resolveGear(exif)),
      exif: exifJson(exif),
      locationPrecision: effectivePrecision(data.locationPrecision, species),
      area: areaOf(data.latitude, data.longitude),
      language: detectLanguage(data.title, data.description),
      authorId: user.id
    },
    select: { id: true }
  })
  await syncImages('photoPostId', post.id, ids)
  await refreshQuality(post.id)
  res.status(201).json(post)
})

photoRoutes.patch('/:id', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const { imageIds, exif, ...data } = parse(photoUpdate, req.body)
  if (data.tripId) await assertTripMember(data.tripId, user.id)

  const post = await prisma.photoPost.findUnique({
    where: { id },
    select: { authorId: true, speciesId: true, locationPrecision: true, title: true, description: true, latitude: true, longitude: true, placeId: true, place: { select: { latitude: true, longitude: true, radiusM: true } } }
  })
  if (!post) throw ApiError.notFound('photo')
  assertOwnerOrAdmin(user, post.authorId)

  // Place vs. resulting coordinates: a requested place must contain them; a kept place that
  // no longer does is dropped.
  const lat = data.latitude ?? post.latitude
  const lng = data.longitude ?? post.longitude
  if (data.placeId) await assertPlaceUsable(data.placeId, post.authorId, user, lat, lng, req.locale)
  else if (data.placeId === undefined && post.place && !placeContains(post.place, lat, lng)) data.placeId = null

  // Re-check the sensitive-species rule against the post's resulting state.
  const species = await loadSpecies(data.speciesId === undefined ? post.speciesId : data.speciesId)
  const requested: LocationPrecision = data.locationPrecision ?? post.locationPrecision
  const locationPrecision = effectivePrecision(requested, species)

  const ids = imageIds && (await validateImageIds(user, imageIds, 'photoPostId', id))
  await prisma.photoPost.update({
    where: { id },
    data: {
      ...data,
      exif: exifJson(exif),
      ...(exif !== undefined && (await resolveGear(exif))),
      locationPrecision,
      ...((data.latitude !== undefined || data.longitude !== undefined) && { area: areaOf(lat, lng) }),
      ...((data.title !== undefined || data.description !== undefined) && { language: detectLanguage(data.title ?? post.title, data.description ?? post.description) }),
      edited: true
    }
  })
  if (ids) await syncImages('photoPostId', id, ids)
  await refreshQuality(id)
  res.json({ id })
})

photoRoutes.delete('/:id', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const post = await prisma.photoPost.findUnique({ where: { id }, select: { authorId: true } })
  if (!post) throw ApiError.notFound('photo')
  assertOwnerOrAdmin(currentUser(req), post.authorId)
  await deleteImagesFor('photoPostId', id)
  await prisma.photoPost.delete({ where: { id } })
  res.status(204).end()
})

// ── Community identification ─────────────────────────────────────────────────

photoRoutes.get('/:id/identifications', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const photo = await loadVisiblePhoto(id, req.user)
  const rows = await prisma.identification.findMany({
    where: { photoPostId: id, ...(await visibleUserFilter(req.user?.id)) },
    select: identificationSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
  })
  res.json(rows.map((r) => toIdentification(r, photo.speciesId)))
})

/** One identification per user per photo; posting again replaces it. */
photoRoutes.post('/:id/identifications', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const photo = await prisma.photoPost.findUnique({ where: { id }, select: { authorId: true, speciesId: true, sourceName: true } })
  if (!photo) throw ApiError.notFound('photo')
  // Imported records are identified on their source; votes here would change nothing.
  if (photo.sourceName) throw new ApiError('CONFLICT', 'photo.source_identification', { source: photo.sourceName })
  await assertNotBlocked(user.id, photo.authorId)
  const { speciesId, comment } = parse(identificationBody, req.body)
  await loadSpecies(speciesId)

  const existing = await prisma.identification.findUnique({
    where: { photoPostId_userId: { photoPostId: id, userId: user.id } },
    select: { id: true }
  })
  const row = await prisma.identification.upsert({
    where: { photoPostId_userId: { photoPostId: id, userId: user.id } },
    create: { photoPostId: id, userId: user.id, speciesId, comment: comment ?? null },
    update: { speciesId, comment: comment ?? null },
    select: identificationSelect
  })
  if (!existing) {
    await notify({ type: 'IDENTIFICATION', recipientId: photo.authorId, actorId: user.id, photoPostId: id })
  }
  await refreshQuality(id)
  res.status(existing ? 200 : 201).json(toIdentification(row, photo.speciesId))
})

photoRoutes.delete('/:id/identifications/me', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const { count } = await prisma.identification.deleteMany({ where: { photoPostId: id, userId: user.id } })
  if (count) {
    await prisma.notification.deleteMany({
      where: { type: 'IDENTIFICATION', actorId: user.id, photoPostId: id, readAt: null }
    })
    await refreshQuality(id)
  }
  res.status(204).end()
})

/** `visibleAuthor` for rows keyed by `userId`. */
const visibleUserFilter = async (viewerId?: number) => {
  const filter = await visibleAuthor(viewerId)
  return 'authorId' in filter ? { userId: filter.authorId } : {}
}

photoRoutes.use('/', engagementRoutes('photo'))
