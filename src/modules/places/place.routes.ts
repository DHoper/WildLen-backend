import { Router } from 'express'
import { Prisma, PlaceKind } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { authorSelect, speciesSummarySelect } from '../../lib/select'
import type { Locale } from '../../lib/i18n'
import { currentUser, requireVerified } from '../../middleware/auth'
import { hiddenUserIds } from '../social/blocks'
import { photoListSelect, toPhotoSummary } from '../photos/photo.routes'
import { presentTrips, tripSelect } from '../trips/trip.routes'
import { outingOrder, outingSelect, summarize as summarizeOutings } from '../outings/outing.routes'
import { AREA_KEYS, areaOf, timezoneAt } from './areas'
import { placeEligibleSql } from './privacy'
import { distanceKm, localized, placeRefSelect, placesAt, toPlaceRef } from './refs'

/**
 * Places: curated sites with statistics computed from the observations recorded there.
 *
 *   GET  /places               list (area, kind, q, or nearest to lat/lng)
 *   GET  /places/match         places containing a point (upload form, scouting)
 *   GET  /places/:slug         a place with its statistics
 *   POST /places               propose a new place (verified users; reviewed by admins)
 *
 * Every statistic uses only records allowed by placeEligibleSql (see privacy.ts).
 */

const PROPOSAL_LIMIT = 5

const placeSelect = {
  ...placeRefSelect,
  region: true,
  latitude: true,
  longitude: true,
  radiusM: true,
  timezone: true,
  description: true,
  access: true,
  guidelines: true,
  coverUrl: true,
  createdById: true
} satisfies Prisma.PlaceSelect
type PlaceRow = Prisma.PlaceGetPayload<{ select: typeof placeSelect }>

const hiddenSql = (hidden: number[]) => (hidden.length ? Prisma.sql`AND p.author_id NOT IN (${Prisma.join(hidden)})` : Prisma.empty)

/** Observation counts and a cover photo per place (eligible records only). */
const statsFor = async (ids: number[], hidden: number[]) => {
  if (!ids.length) return { stats: new Map(), covers: new Map() }
  const where = Prisma.sql`p.place_id IN (${Prisma.join(ids)}) AND ${placeEligibleSql} ${hiddenSql(hidden)}`
  const [rows, coverRows] = await Promise.all([
    prisma.$queryRaw<{ id: number; n: number; species: number; last: Date | null }[]>`
      SELECT p.place_id AS id, count(*)::int AS n, count(DISTINCT p.species_id)::int AS species, max(p.taken_at) AS last
      FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id WHERE ${where} GROUP BY 1`,
    prisma.$queryRaw<{ placeId: number; photoId: number }[]>`
      SELECT DISTINCT ON (p.place_id) p.place_id AS "placeId", p.id AS "photoId"
      FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id
      WHERE ${where} AND EXISTS (SELECT 1 FROM images i WHERE i.photo_post_id = p.id)
      ORDER BY p.place_id, (SELECT count(*) FROM likes l WHERE l.photo_post_id = p.id) DESC, p.taken_at DESC NULLS LAST, p.id`
  ])
  const photos = await prisma.photoPost.findMany({
    where: { id: { in: coverRows.map((c) => c.photoId) } },
    select: { id: true, license: true, sourceName: true, sourceAuthor: true, author: { select: { username: true } }, images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 } }
  })
  const byId = new Map(photos.map((p) => [p.id, p]))
  const covers = new Map<number, { url: string; photoId: number; credit: string; license: string; sourceName: string | null }>()
  for (const c of coverRows) {
    const p = byId.get(c.photoId)
    if (p?.images[0]) covers.set(c.placeId, { url: p.images[0].url, photoId: p.id, credit: p.sourceAuthor ?? p.author.username, license: p.license, sourceName: p.sourceName })
  }
  return { stats: new Map(rows.map((r) => [r.id, { observationCount: r.n, speciesCount: r.species, lastObservedAt: r.last }])), covers }
}

const presentSummary = (p: PlaceRow, locale: Locale, extra: Awaited<ReturnType<typeof statsFor>>) => ({
  ...toPlaceRef(p, locale),
  region: localized(p.region, locale),
  latitude: p.latitude,
  longitude: p.longitude,
  radiusM: p.radiusM,
  timezone: p.timezone,
  cover: p.coverUrl ? { url: p.coverUrl, photoId: null, credit: null, license: null, sourceName: null } : (extra.covers.get(p.id) ?? null),
  stats: extra.stats.get(p.id) ?? { observationCount: 0, speciesCount: 0, lastObservedAt: null }
})

const visibleTo = (viewerId?: number, isAdmin = false): Prisma.PlaceWhereInput =>
  isAdmin ? {} : { OR: [{ status: 'CURATED' }, ...(viewerId ? [{ createdById: viewerId }] : [])] }

export const placeRoutes = Router()

const listQuery = z.object({
  area: z.enum([...AREA_KEYS, 'other']).optional(),
  kind: z.enum(PlaceKind).optional(),
  q: z.string().trim().max(60).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  /** Only the viewer's own proposals. */
  mine: z.enum(['1']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100)
})

placeRoutes.get('/', async (req, res) => {
  const q = parse(listQuery, req.query)
  const viewer = req.user
  const where: Prisma.PlaceWhereInput = {
    AND: [
      q.mine ? { createdById: viewer?.id ?? -1, status: 'PROPOSED' } : { status: 'CURATED' },
      q.area ? { area: q.area } : {},
      q.kind ? { kind: q.kind } : {},
      q.q ? { OR: [{ slug: { contains: q.q.toLowerCase() } }, { name: { path: ['zh-TW'], string_contains: q.q } }, { name: { path: ['en'], string_contains: q.q } }] } : {}
    ]
  }
  const rows = await prisma.place.findMany({ where, select: placeSelect })
  const extra = await statsFor(
    rows.map((r) => r.id),
    await hiddenUserIds(viewer?.id)
  )
  let items = rows.map((r) => presentSummary(r, req.locale, extra))
  if (q.lat !== undefined && q.lng !== undefined) {
    const withDist = items.map((i) => ({ ...i, distanceKm: Math.round(distanceKm(q.lat!, q.lng!, i.latitude, i.longitude) * 10) / 10 }))
    withDist.sort((a, b) => a.distanceKm - b.distanceKm)
    items = withDist
  } else {
    const order = (a: string) => (AREA_KEYS as readonly string[]).indexOf(a) + 1 || 99
    items.sort((a, b) => order(a.area) - order(b.area) || b.stats.observationCount - a.stats.observationCount || a.name.localeCompare(b.name))
  }
  res.json(items.slice(0, q.limit))
})

/** Areas with their place and observation counts (for filters). */
placeRoutes.get('/areas', async (_req, res) => {
  const rows = await prisma.$queryRaw<{ area: string; places: number; observations: number }[]>`
    SELECT pl.area, count(DISTINCT pl.id)::int AS places, count(p.id)::int AS observations
    FROM places pl
    LEFT JOIN (photo_posts p LEFT JOIN species s ON s.id = p.species_id) ON p.place_id = pl.id AND ${placeEligibleSql}
    WHERE pl.status = 'CURATED'
    GROUP BY 1`
  const byKey = new Map(rows.map((r) => [r.area, r]))
  res.json(AREA_KEYS.map((key) => ({ key, places: byKey.get(key)?.places ?? 0, observations: byKey.get(key)?.observations ?? 0 })).filter((a) => a.places))
})

const pointQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) })

/** Places containing a point, and others close by (within 10 km of their edge). */
placeRoutes.get('/match', async (req, res) => {
  const { lat, lng } = parse(pointQuery, req.query)
  const rows = await placesAt(lat, lng, req.user?.id, 10)
  const ref = (p: (typeof rows)[number]) => ({ ...toPlaceRef(p, req.locale), latitude: p.latitude, longitude: p.longitude, radiusM: p.radiusM, distanceKm: Math.round(p.distanceKm * 10) / 10 })
  res.json({
    inside: rows.filter((p) => p.distanceKm <= p.radiusM / 1000).map(ref),
    nearby: rows.filter((p) => p.distanceKm > p.radiusM / 1000).map(ref)
  })
})

const slugParam = z.object({ slug: z.string().trim().min(1).max(80) })

placeRoutes.get('/:slug', async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const viewer = req.user
  const place = await prisma.place.findFirst({ where: { slug, ...visibleTo(viewer?.id, viewer?.role === 'ADMIN') }, select: { ...placeSelect, createdBy: { select: authorSelect } } })
  if (!place) throw ApiError.notFound('place')
  const hidden = await hiddenUserIds(viewer?.id)
  const where = Prisma.sql`p.place_id = ${place.id} AND ${placeEligibleSql} ${hiddenSql(hidden)}`
  const local = (unit: 'month' | 'hour') => Prisma.sql`extract(${Prisma.raw(unit)} from p.taken_at AT TIME ZONE 'UTC' AT TIME ZONE ${place.timezone})::int`
  const from = Prisma.sql`FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id`

  const [totals, speciesMonths, speciesHours, recentIds, photographers, focal, lenses, sources] = await Promise.all([
    prisma.$queryRaw<{ n: number; species: number; first: Date | null; last: Date | null }[]>`
      SELECT count(*)::int AS n, count(DISTINCT p.species_id)::int AS species, min(p.taken_at) AS first, max(p.taken_at) AS last ${from} WHERE ${where}`,
    prisma.$queryRaw<{ id: number; m: number; n: number }[]>`
      SELECT p.species_id AS id, ${local('month')} AS m, count(*)::int AS n ${from} WHERE ${where} AND p.species_id IS NOT NULL AND p.taken_at IS NOT NULL GROUP BY 1, 2`,
    prisma.$queryRaw<{ id: number; h: number; n: number }[]>`
      SELECT p.species_id AS id, ${local('hour')} AS h, count(*)::int AS n ${from} WHERE ${where} AND p.species_id IS NOT NULL AND p.taken_at IS NOT NULL GROUP BY 1, 2`,
    prisma.$queryRaw<{ id: number }[]>`SELECT p.id ${from} WHERE ${where} ORDER BY p.taken_at DESC NULLS LAST, p.id DESC LIMIT 12`,
    prisma.$queryRaw<{ id: number; n: number }[]>`
      SELECT p.author_id AS id, count(*)::int AS n ${from} JOIN users u ON u.id = p.author_id
      WHERE ${where} AND NOT u.is_system GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6`,
    prisma.$queryRaw<{ mm: number; n: number }[]>`
      SELECT substring(p.exif->>'focalLength' from '([0-9]+)')::int AS mm, count(*)::int AS n ${from}
      WHERE ${where} AND p.exif->>'focalLength' ~ '[0-9]' GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ name: string; slug: string | null; n: number }[]>`
      SELECT coalesce(g.brand || ' ' || g.model, p.exif->>'lens') AS name, g.slug, count(*)::int AS n ${from} LEFT JOIN gear g ON g.id = p.lens_id
      WHERE ${where} AND (p.lens_id IS NOT NULL OR p.exif->>'lens' IS NOT NULL) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5`,
    prisma.$queryRaw<{ name: string; n: number; observers: number }[]>`
      SELECT p.source_name AS name, count(*)::int AS n, count(DISTINCT p.source_author)::int AS observers ${from}
      WHERE ${where} AND p.source_name IS NOT NULL GROUP BY 1`
  ])

  // Species × month and species × hour tables
  const speciesIds = [...new Set(speciesMonths.map((r) => r.id))]
  const [speciesRows, recent, people, trips, nearby] = await Promise.all([
    prisma.species.findMany({ where: { id: { in: speciesIds } }, select: speciesSummarySelect }),
    prisma.photoPost.findMany({ where: { id: { in: recentIds.map((r) => r.id) } }, select: photoListSelect }),
    prisma.user.findMany({ where: { id: { in: photographers.map((p) => p.id) } }, select: authorSelect }),
    prisma.trip.findMany({ where: { placeId: place.id, cancelled: false }, select: tripSelect, orderBy: { startsAt: 'desc' }, take: 12 }),
    prisma.place.findMany({ where: { area: place.area, status: 'CURATED', NOT: { id: place.id } }, select: placeSelect })
  ])
  const table = new Map<number, { months: number[]; hours: number[]; total: number }>()
  const row = (id: number) => table.get(id) ?? table.set(id, { months: Array(12).fill(0), hours: Array(24).fill(0), total: 0 }).get(id)!
  const add = (list: number[], i: number, n: number) => {
    if (i >= 0 && i < list.length) list[i] = (list[i] ?? 0) + n
  }
  for (const r of speciesMonths) {
    add(row(r.id).months, r.m - 1, r.n)
    row(r.id).total += r.n
  }
  for (const r of speciesHours) add(row(r.id).hours, r.h, r.n)
  const speciesById = new Map(speciesRows.map((s) => [s.id, s]))
  const months: number[] = Array(12).fill(0)
  const hours: number[] = Array(24).fill(0)
  for (const t of table.values()) t.months.forEach((n, i) => add(months, i, n))
  for (const t of table.values()) t.hours.forEach((n, i) => add(hours, i, n))
  const recentById = new Map(recent.map((p) => [p.id, p]))
  const peopleById = new Map(people.map((p) => [p.id, p]))
  const now = Date.now()
  const presentedTrips = await presentTrips(trips, viewer)
  const nearbyExtra = await statsFor(
    nearby.map((n) => n.id),
    hidden
  )
  const discussions = await prisma.communityPost.findMany({
    where: { tripDiscussion: { placeId: place.id }, authorId: { notIn: hidden } },
    select: { id: true, title: true, createdAt: true, lastActivityAt: true, _count: { select: { comments: true } } },
    orderBy: { lastActivityAt: 'desc' },
    take: 5
  })
  const own = await statsFor([place.id], hidden)
  const outingRows = await prisma.outing.findMany({
    where: { placeId: place.id, status: 'PUBLISHED', locationPrecision: 'EXACT', authorId: { notIn: hidden } },
    select: outingSelect,
    orderBy: outingOrder,
    take: 6
  })

  res.json({
    ...presentSummary(place, req.locale, own),
    description: localized(place.description, req.locale),
    access: localized<{ transport: string; hours?: string }>(place.access, req.locale),
    guidelines: localized<string[]>(place.guidelines, req.locale) ?? [],
    proposedBy: place.status === 'PROPOSED' ? place.createdBy : null,
    stats: {
      observationCount: totals[0]?.n ?? 0,
      speciesCount: totals[0]?.species ?? 0,
      photographerCount: photographers.length,
      firstObservedAt: totals[0]?.first ?? null,
      lastObservedAt: totals[0]?.last ?? null
    },
    months,
    hours,
    species: [...table]
      .flatMap(([id, t]) => (speciesById.get(id) ? [{ species: speciesById.get(id)!, ...t }] : []))
      .sort((a, b) => b.total - a.total || a.species.commonName.localeCompare(b.species.commonName)),
    photos: recentIds.flatMap((r) => (recentById.get(r.id) ? [toPhotoSummary(recentById.get(r.id)!, viewer, req.locale)] : [])),
    photographers: photographers.flatMap((p) => (peopleById.get(p.id) ? [{ author: peopleById.get(p.id)!, count: p.n }] : [])),
    sources: sources.map((s) => ({ name: s.name, observationCount: s.n, observerCount: s.observers })),
    focalLengths: focal.map((f) => ({ mm: f.mm, count: f.n })),
    lenses: lenses.map((l) => ({ name: l.name, slug: l.slug, count: l.n })),
    trips: {
      upcoming: presentedTrips.filter((t) => t.startsAt.getTime() >= now).reverse(),
      past: presentedTrips.filter((t) => t.startsAt.getTime() < now).slice(0, 4)
    },
    outings: await summarizeOutings(outingRows, viewer, req.locale),
    discussions: discussions.map((d) => ({ id: d.id, title: d.title, replyCount: d._count.comments, lastActivityAt: d.lastActivityAt ?? d.createdAt })),
    nearby: nearby
      .map((n) => ({ ...presentSummary(n, req.locale, nearbyExtra), distanceKm: Math.round(distanceKm(place.latitude, place.longitude, n.latitude, n.longitude)) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 3)
  })
})

const localizedText = (max: number) =>
  z
    .object({ 'zh-TW': z.string().trim().min(1).max(max).optional(), en: z.string().trim().min(1).max(max).optional() })
    .refine((v) => v['zh-TW'] || v.en, { message: 'At least one language is required' })

const proposal = z.object({
  name: localizedText(80),
  kind: z.enum(PlaceKind),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase()),
  region: localizedText(80).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(100).max(50_000),
  description: localizedText(1000).optional()
})

const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)

/**
 * Propose a place. It stays PROPOSED (visible to its proposer and admins, usable on the
 * proposer's own observations) until an admin curates it. A point already inside a curated
 * place is refused with that place's name.
 */
placeRoutes.post('/', requireVerified, async (req, res) => {
  const data = parse(proposal, req.body)
  const user = currentUser(req)
  const inside = (await placesAt(data.latitude, data.longitude)).find((p) => p.status === 'CURATED' && p.distanceKm <= p.radiusM / 1000)
  if (inside) throw new ApiError('CONFLICT', 'place.inside_existing', { name: localized(inside.name, req.locale) ?? inside.slug })
  const pending = await prisma.place.count({ where: { createdById: user.id, status: 'PROPOSED' } })
  if (pending >= PROPOSAL_LIMIT) throw new ApiError('CONFLICT', 'place.proposal_limit', { n: PROPOSAL_LIMIT })

  const base = slugify(data.name.en ?? '') || 'place'
  let slug = base
  for (let i = 2; await prisma.place.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`
  const created = await prisma.place.create({
    data: {
      slug,
      name: data.name,
      kind: data.kind,
      countryCode: data.countryCode,
      area: areaOf(data.latitude, data.longitude),
      region: data.region ?? {},
      latitude: data.latitude,
      longitude: data.longitude,
      radiusM: data.radiusM,
      timezone: timezoneAt(data.latitude, data.longitude),
      description: data.description ?? Prisma.JsonNull,
      status: 'PROPOSED',
      createdById: user.id
    },
    select: placeRefSelect
  })
  res.status(201).json(toPlaceRef(created, req.locale))
})
