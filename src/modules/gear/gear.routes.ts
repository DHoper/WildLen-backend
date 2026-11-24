import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { authorSelect, speciesSummarySelect } from '../../lib/select'
import { paginated, paginationQuery } from '../../lib/pagination'
import { currentUser, requireAuth, requireVerified } from '../../middleware/auth'
import { hiddenUserIds } from '../social/blocks'
import { photoListSelect, toPhotoSummary } from '../photos/photo.routes'

/**
 * Gear catalogue: bodies, lenses and teleconverters, with what the community actually
 * shoots with them (photos linked through EXIF), structured reviews and owners.
 */

/** Situations a review can recommend the item for. */
export const GEAR_USE_CASES = ['birds-in-flight', 'perched-birds', 'mammals', 'low-light', 'hiking', 'travel', 'macro', 'video'] as const

export { gearRefSelect } from './refs'
import { gearRefSelect } from './refs'

const gearSelect = {
  ...gearRefSelect,
  mount: true,
  focalMinMm: true,
  focalMaxMm: true,
  apertureWide: true,
  apertureTele: true,
  magnification: true,
  sensor: true,
  megapixels: true,
  maxFps: true,
  weightG: true,
  releasedYear: true,
  _count: { select: { photosAsCamera: true, photosAsLens: true, owners: true, reviews: true } }
} satisfies Prisma.GearSelect
type GearRow = Prisma.GearGetPayload<{ select: typeof gearSelect }>

const ASPECTS = ['sharpness', 'autofocus', 'portability', 'value'] as const
type Aspect = (typeof ASPECTS)[number]

const reviewAverages = async (ids: number[]) => {
  if (!ids.length) return new Map<number, Record<Aspect, number> & { overall: number }>()
  const rows = await prisma.gearReview.groupBy({ by: ['gearId'], where: { gearId: { in: ids } }, _avg: { sharpness: true, autofocus: true, portability: true, value: true } })
  const round = (n: number | null) => Math.round((n ?? 0) * 10) / 10
  return new Map(
    rows.map((r) => {
      const a = { sharpness: round(r._avg.sharpness), autofocus: round(r._avg.autofocus), portability: round(r._avg.portability), value: round(r._avg.value) }
      return [r.gearId, { ...a, overall: round((a.sharpness + a.autofocus + a.portability + a.value) / 4) }]
    })
  )
}

const present = (g: GearRow, avg?: Record<Aspect, number> & { overall: number }) => {
  const { _count, ...rest } = g
  return {
    ...rest,
    name: `${g.brand} ${g.model}`,
    photoCount: _count.photosAsCamera + _count.photosAsLens,
    ownerCount: _count.owners,
    reviewCount: _count.reviews,
    rating: avg?.overall ?? null
  }
}

const listQuery = paginationQuery.extend({
  type: z.enum(['CAMERA', 'LENS', 'TELECONVERTER']).optional(),
  brand: z.string().trim().max(40).optional(),
  mount: z.string().trim().max(40).optional(),
  q: z.string().trim().max(60).optional(),
  /** Lenses only: "≤400", "400–600", "600+" by maximum focal length. */
  reach: z.enum(['short', 'mid', 'long']).optional(),
  used: z.enum(['1', 'true']).optional(),
  sort: z.enum(['popular', 'name', 'newest', 'rating']).default('popular'),
  pageSize: z.coerce.number().int().min(1).max(100).default(24)
})

const slugParam = z.object({ slug: z.string().trim().max(120) })
const reviewBody = z.object({
  sharpness: z.number().int().min(1).max(5),
  autofocus: z.number().int().min(1).max(5),
  portability: z.number().int().min(1).max(5),
  value: z.number().int().min(1).max(5),
  useCases: z.array(z.enum(GEAR_USE_CASES)).max(GEAR_USE_CASES.length).default([]),
  comment: z.string().trim().min(20).max(3000)
})

const loadGear = async (slug: string) => {
  const g = await prisma.gear.findUnique({ where: { slug }, select: gearSelect })
  if (!g) throw ApiError.notFound('gear')
  return g
}

export const gearRoutes = Router()

/** The catalogue is small (tens of items), so filtering + sorting happens in memory. */
gearRoutes.get('/', async (req, res) => {
  const q = parse(listQuery, req.query)
  const where: Prisma.GearWhereInput = {
    ...(q.type && { type: q.type }),
    ...(q.brand && { brand: q.brand }),
    ...(q.mount && { mount: { contains: q.mount } }),
    ...(q.q && { OR: [{ model: { contains: q.q, mode: 'insensitive' } }, { brand: { contains: q.q, mode: 'insensitive' } }] }),
    ...(q.reach === 'short' && { focalMaxMm: { lte: 400 } }),
    ...(q.reach === 'mid' && { focalMaxMm: { gt: 400, lte: 600 } }),
    ...(q.reach === 'long' && { focalMaxMm: { gt: 600 } })
  }
  const rows = await prisma.gear.findMany({ where, select: gearSelect })
  const avg = await reviewAverages(rows.map((r) => r.id))
  let items = rows.map((r) => present(r, avg.get(r.id)))
  if (q.used) items = items.filter((i) => i.photoCount > 0)
  const by = {
    popular: (a: (typeof items)[number], b: (typeof items)[number]) => b.photoCount - a.photoCount || b.ownerCount - a.ownerCount || a.name.localeCompare(b.name),
    name: (a: (typeof items)[number], b: (typeof items)[number]) => a.name.localeCompare(b.name),
    newest: (a: (typeof items)[number], b: (typeof items)[number]) => (b.releasedYear ?? 0) - (a.releasedYear ?? 0) || a.name.localeCompare(b.name),
    rating: (a: (typeof items)[number], b: (typeof items)[number]) => (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount
  }[q.sort]
  items.sort(by)
  const start = (q.page - 1) * q.pageSize
  res.json(paginated(items.slice(start, start + q.pageSize), items.length, q))
})

/** Brands and mounts per type, for filters. */
gearRoutes.get('/facets', async (_req, res) => {
  const rows = await prisma.gear.findMany({ select: { type: true, brand: true, mount: true } })
  const count = (key: 'brand' | 'mount') => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1)
    return [...m].map(([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }
  res.json({ brands: count('brand'), mounts: count('mount'), useCases: GEAR_USE_CASES })
})

/** Hour of day in local solar time, from UTC taken_at and longitude. */
const SOLAR_HOUR = Prisma.sql`floor(mod((extract(hour from p.taken_at) + extract(minute from p.taken_at) / 60.0 + p.longitude / 15.0 + 48)::numeric, 24))::int`

gearRoutes.get('/:slug', async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const g = await loadGear(slug)
  const viewer = req.user
  const hidden = await hiddenUserIds(viewer?.id)
  const col = g.type === 'CAMERA' ? Prisma.sql`p.camera_id` : Prisma.sql`p.lens_id`
  const where = Prisma.sql`${col} = ${g.id} ${hidden.length ? Prisma.sql`AND p.author_id NOT IN (${Prisma.join(hidden)})` : Prisma.empty}`
  const pairCol = g.type === 'CAMERA' ? Prisma.sql`p.lens_id` : Prisma.sql`p.camera_id`

  const [ids, focal, apertures, shutters, groups, species, hours, paired, reviews, threads, avg, mine] = await Promise.all([
    prisma.$queryRaw<{ id: number; author: number }[]>`SELECT p.id, p.author_id AS author FROM photo_posts p WHERE ${where} ORDER BY p.created_at DESC`,
    prisma.$queryRaw<{ mm: number; n: number }[]>`SELECT substring(p.exif->>'focalLength' from '([0-9]+)')::int AS mm, count(*)::int AS n FROM photo_posts p WHERE ${where} AND p.exif->>'focalLength' ~ '[0-9]' GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ v: string; n: number }[]>`SELECT p.exif->>'aperture' AS v, count(*)::int AS n FROM photo_posts p WHERE ${where} AND p.exif->>'aperture' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6`,
    prisma.$queryRaw<{ v: string; n: number }[]>`SELECT p.exif->>'shutterSpeed' AS v, count(*)::int AS n FROM photo_posts p WHERE ${where} AND p.exif->>'shutterSpeed' IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6`,
    prisma.$queryRaw<{ g: string; n: number }[]>`SELECT s."group"::text AS g, count(*)::int AS n FROM photo_posts p JOIN species s ON s.id = p.species_id WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`,
    prisma.$queryRaw<{ id: number; n: number }[]>`SELECT p.species_id AS id, count(*)::int AS n FROM photo_posts p WHERE ${where} AND p.species_id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    prisma.$queryRaw<{ k: number; n: number }[]>`SELECT ${SOLAR_HOUR} AS k, count(*)::int AS n FROM photo_posts p WHERE ${where} AND p.taken_at IS NOT NULL GROUP BY 1`,
    prisma.$queryRaw<{ id: number; n: number }[]>`SELECT ${pairCol} AS id, count(*)::int AS n FROM photo_posts p WHERE ${where} AND ${pairCol} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    prisma.gearReview.findMany({
      where: { gearId: g.id, userId: { notIn: hidden } },
      select: { id: true, sharpness: true, autofocus: true, portability: true, value: true, useCases: true, comment: true, createdAt: true, updatedAt: true, user: { select: authorSelect } },
      orderBy: { updatedAt: 'desc' }
    }),
    prisma.postGear.findMany({
      where: { gearId: g.id, post: { authorId: { notIn: hidden } } },
      select: { post: { select: { id: true, title: true, createdAt: true, lastActivityAt: true, categoryKey: true, _count: { select: { comments: true } } } } },
      orderBy: { post: { lastActivityAt: 'desc' } },
      take: 8
    }),
    reviewAverages([g.id]),
    viewer ? prisma.userGear.findUnique({ where: { userId_gearId: { userId: viewer.id, gearId: g.id } } }) : Promise.resolve(null)
  ])

  const [speciesRows, pairedRows, photos] = await Promise.all([
    prisma.species.findMany({ where: { id: { in: species.map((s) => s.id) } }, select: speciesSummarySelect }),
    prisma.gear.findMany({ where: { id: { in: paired.map((p) => p.id) } }, select: gearRefSelect }),
    prisma.photoPost.findMany({ where: { id: { in: ids.slice(0, 24).map((r) => r.id) } }, select: photoListSelect, orderBy: { createdAt: 'desc' } })
  ])
  const speciesById = new Map(speciesRows.map((s) => [s.id, s]))
  const pairedById = new Map(pairedRows.map((p) => [p.id, p]))
  const hist = Array.from({ length: 24 }, () => 0)
  for (const h of hours) if (h.k >= 0 && h.k < 24) hist[h.k] = h.n
  const useCaseCounts = Object.fromEntries(GEAR_USE_CASES.map((u) => [u, reviews.filter((r) => r.useCases.includes(u)).length]))

  res.json({
    ...present(g, avg.get(g.id)),
    owned: !!mine,
    usage: {
      photoCount: ids.length,
      photographerCount: new Set(ids.map((r) => r.author)).size,
      focalLengths: focal.map((f) => ({ mm: f.mm, count: f.n })),
      apertures: apertures.map((a) => ({ value: a.v, count: a.n })),
      shutterSpeeds: shutters.map((s) => ({ value: s.v, count: s.n })),
      groups: groups.map((x) => ({ group: x.g, count: x.n })),
      species: species.flatMap((s) => (speciesById.get(s.id) ? [{ species: speciesById.get(s.id)!, count: s.n }] : [])),
      solarHours: hist,
      pairedWith: paired.flatMap((p) => (pairedById.get(p.id) ? [{ gear: { ...pairedById.get(p.id)!, name: `${pairedById.get(p.id)!.brand} ${pairedById.get(p.id)!.model}` }, count: p.n }] : []))
    },
    reviews: {
      count: reviews.length,
      averages: avg.get(g.id) ?? null,
      useCases: useCaseCounts,
      items: reviews.map(({ user, ...r }) => ({ ...r, author: user, mine: user.id === viewer?.id }))
    },
    threads: threads.map(({ post }) => ({ id: post.id, title: post.title, categoryKey: post.categoryKey, replyCount: post._count.comments, lastActivityAt: post.lastActivityAt ?? post.createdAt })),
    photos: photos.map((p) => toPhotoSummary(p, viewer, req.locale))
  })
})

gearRoutes.put('/:slug/review', requireVerified, async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const data = parse(reviewBody, req.body)
  const user = currentUser(req)
  const g = await loadGear(slug)
  const existing = await prisma.gearReview.findUnique({ where: { gearId_userId: { gearId: g.id, userId: user.id } }, select: { id: true } })
  const row = await prisma.gearReview.upsert({
    where: { gearId_userId: { gearId: g.id, userId: user.id } },
    create: { ...data, gearId: g.id, userId: user.id },
    update: data,
    select: { id: true }
  })
  res.status(existing ? 200 : 201).json(row)
})

gearRoutes.delete('/:slug/review', requireAuth, async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const user = currentUser(req)
  const g = await loadGear(slug)
  await prisma.gearReview.deleteMany({ where: { gearId: g.id, userId: user.id } })
  res.status(204).end()
})

gearRoutes.put('/:slug/own', requireAuth, async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const user = currentUser(req)
  const g = await loadGear(slug)
  await prisma.userGear.upsert({ where: { userId_gearId: { userId: user.id, gearId: g.id } }, create: { userId: user.id, gearId: g.id }, update: {} })
  res.json({ owned: true })
})

gearRoutes.delete('/:slug/own', requireAuth, async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const user = currentUser(req)
  const g = await loadGear(slug)
  await prisma.userGear.deleteMany({ where: { userId: user.id, gearId: g.id } })
  res.json({ owned: false })
})

// ── A photographer's gear (mounted under /users) ──
export const userGearRoutes = Router()

userGearRoutes.get('/:id/gear', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const [owned, usedCam, usedLens] = await Promise.all([
    prisma.userGear.findMany({ where: { userId: id }, select: { gear: { select: gearRefSelect } }, orderBy: { createdAt: 'asc' } }),
    prisma.photoPost.groupBy({ by: ['cameraId'], where: { authorId: id, cameraId: { not: null } }, _count: true }),
    prisma.photoPost.groupBy({ by: ['lensId'], where: { authorId: id, lensId: { not: null } }, _count: true })
  ])
  const counts = new Map<number, number>()
  for (const r of usedCam) counts.set(r.cameraId!, r._count)
  for (const r of usedLens) counts.set(r.lensId!, r._count)
  const ids = [...new Set([...owned.map((o) => o.gear.id), ...counts.keys()])]
  const rows = await prisma.gear.findMany({ where: { id: { in: ids } }, select: gearSelect })
  const ownedIds = new Set(owned.map((o) => o.gear.id))
  const items = rows
    .map((g) => ({ ...present(g), owned: ownedIds.has(g.id), photosByUser: counts.get(g.id) ?? 0 }))
    .sort((a, b) => Number(b.owned) - Number(a.owned) || b.photosByUser - a.photosByUser || a.name.localeCompare(b.name))
  res.json(items)
})
