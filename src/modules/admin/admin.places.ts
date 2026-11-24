import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { authorSelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { areaOf, timezoneAt } from '../places/areas'
import { curatedPlaceAt, distanceKm } from '../places/refs'
import { placeEligibleWhere } from '../places/privacy'

/**
 * Admin: curated places and the review queue for member proposals. Mounted under
 * /admin/places (requireAdmin already applied). Returns the raw `{ 'zh-TW', en }`
 * values so both languages are edited side by side.
 */
export const adminPlaceRoutes = Router()

const KINDS = ['PROTECTED_AREA', 'WETLAND', 'FOREST', 'COAST', 'MOUNTAIN', 'URBAN_PARK', 'OTHER'] as const
const text = (max: number) => z.object({ 'zh-TW': z.string().trim().max(max), en: z.string().trim().max(max) })
const requiredText = (max: number) => z.object({ 'zh-TW': z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) })
const accessText = z.object({ transport: z.string().trim().max(1000), hours: z.string().trim().max(300).optional() })

const placeFields = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/),
  name: requiredText(80),
  region: requiredText(120),
  kind: z.enum(KINDS),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((c) => c.toUpperCase()),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(100).max(50000),
  description: text(2000).nullable().optional(),
  access: z.object({ 'zh-TW': accessText, en: accessText }).nullable().optional(),
  guidelines: z.object({ 'zh-TW': z.array(z.string().trim().min(1).max(300)).max(12), en: z.array(z.string().trim().min(1).max(300)).max(12) }).nullable().optional(),
  coverUrl: z.url().nullable().optional()
})

const listQuery = paginationQuery.extend({
  status: z.enum(['CURATED', 'PROPOSED']).default('CURATED'),
  q: z.string().trim().max(100).optional(),
  area: z.string().trim().max(40).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})

const placeInclude = { createdBy: { select: authorSelect }, _count: { select: { photos: true, trips: true } } } satisfies Prisma.PlaceInclude
type PlaceRow = Prisma.PlaceGetPayload<{ include: typeof placeInclude }>

/** Adds the number of observations that count towards the place's public statistics. */
const withStats = async (rows: PlaceRow[]) => {
  const eligible = rows.length
    ? await prisma.photoPost.groupBy({ by: ['placeId'], where: { placeId: { in: rows.map((r) => r.id) }, ...placeEligibleWhere }, _count: { _all: true } })
    : []
  const byPlace = new Map(eligible.map((e) => [e.placeId, e._count._all]))
  return rows.map(({ _count, ...p }) => ({ ...p, photoCount: _count.photos, tripCount: _count.trips, eligiblePhotoCount: byPlace.get(p.id) ?? 0 }))
}

const load = async (id: number) => {
  const place = await prisma.place.findUnique({ where: { id }, include: placeInclude })
  if (!place) throw ApiError.notFound('place')
  return place
}

/** Curated places whose circle overlaps this one — shown to the reviewer as likely duplicates. */
const overlapping = async (p: { id?: number; latitude: number; longitude: number; radiusM: number }) => {
  const curated = await prisma.place.findMany({
    where: { status: 'CURATED', ...(p.id && { NOT: { id: p.id } }) },
    select: { id: true, slug: true, name: true, latitude: true, longitude: true, radiusM: true }
  })
  return curated
    .map((c) => ({ ...c, distanceKm: distanceKm(p.latitude, p.longitude, c.latitude, c.longitude) }))
    .filter((c) => c.distanceKm * 1000 < c.radiusM + p.radiusM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map(({ latitude: _lat, longitude: _lng, ...c }) => ({ ...c, distanceKm: Math.round(c.distanceKm * 10) / 10 }))
}

/** Points trips whose meeting point now falls inside a curated place at it (and clears stale links). */
const relinkTrips = async () => {
  const trips = await prisma.trip.findMany({ select: { id: true, latitude: true, longitude: true, placeId: true } })
  let updated = 0
  for (const t of trips) {
    const placeId = await curatedPlaceAt(t.latitude, t.longitude)
    if (placeId === t.placeId) continue
    await prisma.trip.update({ where: { id: t.id }, data: { placeId } })
    updated++
  }
  return updated
}

adminPlaceRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  const where: Prisma.PlaceWhereInput = {
    status: query.status,
    ...(query.area && { area: query.area }),
    ...(query.q && {
      OR: [
        { slug: { contains: query.q.toLowerCase() } },
        { name: { path: ['zh-TW'], string_contains: query.q } },
        { name: { path: ['en'], string_contains: query.q } }
      ]
    })
  }
  const [rows, total, proposed] = await Promise.all([
    prisma.place.findMany({
      where,
      include: placeInclude,
      orderBy: query.status === 'PROPOSED' ? { createdAt: 'asc' } : [{ area: 'asc' }, { slug: 'asc' }],
      ...toSkipTake(query)
    }),
    prisma.place.count({ where }),
    prisma.place.count({ where: { status: 'PROPOSED' } })
  ])
  res.json({ ...paginated(await withStats(rows), total, query), proposedCount: proposed })
})

adminPlaceRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const place = await load(id)
  const [[row], overlaps] = await Promise.all([withStats([place]), overlapping(place)])
  res.json({ ...row, overlaps })
})

adminPlaceRoutes.post('/', async (req, res) => {
  const data = parse(placeFields, req.body)
  if (await prisma.place.findUnique({ where: { slug: data.slug }, select: { id: true } })) throw ApiError.conflict('admin.place_slug_taken')
  const place = await prisma.place.create({
    data: {
      ...data,
      description: data.description ?? undefined,
      access: data.access ?? undefined,
      guidelines: data.guidelines ?? undefined,
      area: areaOf(data.latitude, data.longitude),
      timezone: timezoneAt(data.latitude, data.longitude),
      status: 'CURATED',
      reviewedAt: new Date()
    },
    select: { id: true, slug: true }
  })
  await relinkTrips()
  res.status(201).json(place)
})

/** Edit any field; `approve: true` also publishes a proposal. */
adminPlaceRoutes.patch('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const { approve, ...data } = parse(placeFields.partial().extend({ approve: z.boolean().optional() }), req.body)
  const current = await load(id)
  if (data.slug && data.slug !== current.slug && (await prisma.place.findUnique({ where: { slug: data.slug }, select: { id: true } }))) {
    throw ApiError.conflict('admin.place_slug_taken')
  }
  const moved = data.latitude !== undefined || data.longitude !== undefined
  const latitude = data.latitude ?? current.latitude
  const longitude = data.longitude ?? current.longitude
  const nullable = <T>(v: T | null | undefined) => (v === null ? Prisma.DbNull : v)
  await prisma.place.update({
    where: { id },
    data: {
      ...data,
      description: nullable(data.description),
      access: nullable(data.access),
      guidelines: nullable(data.guidelines),
      ...(moved && { area: areaOf(latitude, longitude), timezone: timezoneAt(latitude, longitude) }),
      ...(approve && current.status === 'PROPOSED' && { status: 'CURATED', reviewedAt: new Date() })
    }
  })
  const tripsRelinked = approve || moved || data.radiusM !== undefined ? await relinkTrips() : 0
  const [row] = await withStats([await load(id)])
  res.json({ ...row, tripsRelinked })
})

/**
 * Removes a place. Observations and trips keep their own coordinates and place name;
 * with `?mergeInto=<id>` they are moved to that curated place instead of being unlinked
 * (used to fold a duplicate proposal into the existing place).
 */
adminPlaceRoutes.delete('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const { mergeInto } = parse(z.object({ mergeInto: z.coerce.number().int().positive().optional() }), req.query)
  await load(id)
  if (mergeInto !== undefined) {
    const target = mergeInto === id ? null : await prisma.place.findUnique({ where: { id: mergeInto }, select: { status: true } })
    if (!target || target.status !== 'CURATED') throw ApiError.badRequest('admin.place_merge_target')
  }
  await prisma.$transaction(async (tx) => {
    if (mergeInto !== undefined) {
      await tx.photoPost.updateMany({ where: { placeId: id }, data: { placeId: mergeInto } })
      await tx.trip.updateMany({ where: { placeId: id }, data: { placeId: mergeInto } })
    }
    await tx.place.delete({ where: { id } })
  })
  res.status(204).end()
})
