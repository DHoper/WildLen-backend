import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { requireAdmin } from '../../middleware/auth'
import { CALENDAR_TZ, taipei } from '../../lib/time'
import { refreshQuality } from '../photos/quality'
import { AREA_KEYS, AREA_SQL, LOCAL_MONTH_SQL } from '../places/areas'
import { localized } from '../places/refs'
import type { Locale } from '../../lib/i18n'
import { speciesDistribution, speciesProfile } from './profile'

const groupSchema = z.enum(['BIRD', 'MAMMAL', 'REPTILE', 'AMPHIBIAN', 'FISH', 'INSECT', 'OTHER'])
const statusSchema = z.enum(['LC', 'NT', 'VU', 'EN', 'CR'])

// zod 4 applies `.default()` inside `.partial()`, so defaults live only on the create schema.
const speciesFields = z.object({
  commonName: z.string().trim().min(1).max(40),
  scientificName: z.string().trim().min(2).max(100),
  englishName: z.string().trim().max(100).nullable(),
  group: groupSchema,
  status: statusSchema,
  sensitive: z.boolean(),
  description: z.string().trim().max(2000).nullable(),
  descriptionEn: z.string().trim().max(2000).nullable(),
  coverImageUrl: z.url().nullable(),
  /** Field marks { zh-TW, en }. */
  identification: z.object({ 'zh-TW': z.string().trim().max(1000), en: z.string().trim().max(1000) }).nullable(),
  similarSpeciesIds: z.array(z.number().int().positive()).max(6)
})
const speciesCreate = speciesFields.extend({
  englishName: speciesFields.shape.englishName.optional(),
  description: speciesFields.shape.description.optional(),
  descriptionEn: speciesFields.shape.descriptionEn.optional(),
  coverImageUrl: speciesFields.shape.coverImageUrl.optional(),
  identification: speciesFields.shape.identification.optional(),
  similarSpeciesIds: speciesFields.shape.similarSpeciesIds.default([]),
  status: statusSchema.default('LC'),
  sensitive: z.boolean().default(false)
})
const speciesUpdate = speciesFields.partial()

const listQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  group: groupSchema.optional(),
  /** Scientific family name (taxonFamily). */
  family: z.string().trim().max(60).optional(),
  sort: z.enum(['popular', 'name']).default('popular')
})

const itemSelect = {
  id: true,
  commonName: true,
  scientificName: true,
  englishName: true,
  group: true,
  status: true,
  sensitive: true,
  description: true,
  descriptionEn: true,
  coverImageUrl: true,
  taxonFamily: true,
  familyNames: true,
  _count: { select: { photoPosts: true } },
  // Fallback cover: first image of the most recent photo of this species.
  photoPosts: {
    select: { images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 } },
    where: { images: { some: {} } },
    orderBy: { createdAt: 'desc' },
    take: 1
  }
} satisfies Prisma.SpeciesSelect

const toItem = (row: Prisma.SpeciesGetPayload<{ select: typeof itemSelect }>, locale: Locale) => {
  const { _count, photoPosts, coverImageUrl, taxonFamily, familyNames, ...rest } = row
  return {
    ...rest,
    family: taxonFamily ? { scientificName: taxonFamily, name: localized(familyNames, locale) ?? taxonFamily } : null,
    coverUrl: coverImageUrl ?? photoPosts[0]?.images[0]?.url ?? null,
    photoCount: _count.photoPosts
  }
}

/** Photo statistics for one species. Months use takenAt, falling back to createdAt (Asia/Taipei). */
const speciesStats = async (speciesId: number, photoCount: number) => {
  const [observers, months, range, byArea] = await Promise.all([
    // Observers: members, plus the original observers of imported records (not the import account).
    prisma.$queryRaw<{ n: number }[]>`SELECT count(DISTINCT coalesce('s:' || source_author, 'u:' || author_id))::int AS n FROM photo_posts WHERE species_id = ${speciesId} AND NOT captive`,
    prisma.$queryRaw<{ month: number; count: number }[]>`
      SELECT EXTRACT(MONTH FROM ${taipei(Prisma.raw('COALESCE(taken_at, created_at)'))})::int AS month,
             COUNT(*)::int AS count
      FROM photo_posts WHERE species_id = ${speciesId} AND NOT captive GROUP BY 1`,
    prisma.$queryRaw<{ first: Date | null; last: Date | null }[]>`
      SELECT MIN(COALESCE(taken_at, created_at)) AS first, MAX(COALESCE(taken_at, created_at)) AS last
      FROM photo_posts WHERE species_id = ${speciesId} AND NOT captive`,
    // Seasons differ by hemisphere: one row per area, months in local (solar) time.
    prisma.$queryRaw<{ area: string; month: number; count: number }[]>`
      SELECT ${AREA_SQL} AS area, ${LOCAL_MONTH_SQL} AS month, COUNT(*)::int AS count
      FROM photo_posts p WHERE p.species_id = ${speciesId} AND NOT p.captive AND p.location_precision <> 'HIDDEN' AND p.taken_at IS NOT NULL GROUP BY 1, 2`
  ])
  const monthly = Array.from({ length: 12 }, () => 0)
  for (const m of months) monthly[m.month - 1] = m.count
  const areas = new Map<string, number[]>()
  for (const r of byArea) {
    const row = areas.get(r.area) ?? areas.set(r.area, Array<number>(12).fill(0)).get(r.area)!
    row[r.month - 1] = (row[r.month - 1] ?? 0) + r.count
  }
  return {
    photoCount,
    observerCount: observers[0]?.n ?? 0,
    monthly,
    monthlyByArea: [...areas]
      .map(([area, m]) => ({ area, months: m, total: m.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total),
    firstSeenAt: range[0]?.first ?? null,
    lastSeenAt: range[0]?.last ?? null
  }
}

export const speciesRoutes = Router()

speciesRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  const where: Prisma.SpeciesWhereInput = {
    ...(query.group && { group: query.group }),
    ...(query.family && { taxonFamily: query.family }),
    ...(query.q && {
      OR: [
        { commonName: { contains: query.q, mode: 'insensitive' } },
        { scientificName: { contains: query.q, mode: 'insensitive' } },
        { englishName: { contains: query.q, mode: 'insensitive' } }
      ]
    })
  }
  const orderBy: Prisma.SpeciesOrderByWithRelationInput[] =
    query.sort === 'name'
      ? [{ commonName: 'asc' }]
      : [{ photoPosts: { _count: 'desc' } }, { commonName: 'asc' }]

  const [rows, total] = await Promise.all([
    prisma.species.findMany({ where, select: itemSelect, orderBy, ...toSkipTake(query) }),
    prisma.species.count({ where })
  ])
  res.json(paginated(rows.map((r) => toItem(r, req.locale)), total, query))
})

/** Current month (1–12) in Asia/Taipei. */
const currentTaipeiMonth = () =>
  Number(new Intl.DateTimeFormat('en-US', { timeZone: CALENDAR_TZ, month: 'numeric' }).format(new Date()))

const inSeasonQuery = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(8),
  /** Restrict to one regional cluster (months in local time there). */
  area: z.enum([...AREA_KEYS, 'other']).optional()
})

/** Species with the most wild records in `month`, optionally within one area. */
const inSeason = async (locale: Locale, month: number, limit: number, area?: string) => {
  const counts = area
    ? await prisma.$queryRaw<{ speciesId: number; count: number }[]>`
        SELECT p.species_id AS "speciesId", COUNT(*)::int AS count
        FROM photo_posts p
        WHERE p.species_id IS NOT NULL AND NOT p.captive AND p.location_precision <> 'HIDDEN' AND p.taken_at IS NOT NULL
          AND ${AREA_SQL} = ${area} AND ${LOCAL_MONTH_SQL} = ${month}
        GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT ${limit}`
    : await prisma.$queryRaw<{ speciesId: number; count: number }[]>`
        SELECT species_id AS "speciesId", COUNT(*)::int AS count
        FROM photo_posts
        WHERE species_id IS NOT NULL AND NOT captive
          AND EXTRACT(MONTH FROM ${taipei(Prisma.raw('COALESCE(taken_at, created_at)'))}) = ${month}
        GROUP BY species_id ORDER BY count DESC, species_id ASC LIMIT ${limit}`
  const rows = await prisma.species.findMany({ where: { id: { in: counts.map((c) => c.speciesId) } }, select: itemSelect })
  const byId = new Map(rows.map((r) => [r.id, toItem(r, locale)]))
  return counts.flatMap(({ speciesId, count }) => {
    const item = byId.get(speciesId)
    return item ? [{ ...item, monthCount: count }] : []
  })
}

/**
 * Species most often recorded in a given month (any year), most records first.
 * A record's month is takenAt, falling back to createdAt, in Asia/Taipei.
 */
speciesRoutes.get('/in-season', async (req, res) => {
  const { month = currentTaipeiMonth(), limit, area } = parse(inSeasonQuery, req.query)
  res.json(await inSeason(req.locale, month, limit, area))
})

/** In-season species for every area at once (home page), each in its own local month. */
speciesRoutes.get('/in-season/areas', async (req, res) => {
  const { month = currentTaipeiMonth(), limit } = parse(inSeasonQuery, req.query)
  const lists = await Promise.all(AREA_KEYS.map(async (area) => ({ area, items: await inSeason(req.locale, month, limit, area) })))
  res.json(lists.filter((l) => l.items.length))
})

/** Families (with their order) and how many species of each are in the guide; optional group filter. */
speciesRoutes.get('/families', async (req, res) => {
  const { group } = parse(z.object({ group: groupSchema.optional() }), req.query)
  const rows = await prisma.$queryRaw<{ family: string; familyNames: Prisma.JsonValue; order: string | null; orderNames: Prisma.JsonValue; species: number }[]>`
    SELECT taxon_family AS family, (array_agg(family_names))[1] AS "familyNames", (array_agg(taxon_order))[1] AS "order",
           (array_agg(order_names))[1] AS "orderNames", count(*)::int AS species
    FROM species WHERE taxon_family IS NOT NULL ${group ? Prisma.sql`AND "group" = ${group}::"SpeciesGroup"` : Prisma.empty}
    GROUP BY 1 ORDER BY 3, 1`
  res.json(
    rows.map((r) => ({
      family: { scientificName: r.family, name: localized(r.familyNames, req.locale) ?? r.family },
      order: r.order ? { scientificName: r.order, name: localized(r.orderNames, req.locale) ?? r.order } : null,
      speciesCount: r.species
    }))
  )
})

speciesRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const row = await prisma.species.findUnique({
    where: { id },
    select: { ...itemSelect, taxonOrder: true, orderNames: true, identification: true, similarSpeciesIds: true }
  })
  if (!row) throw ApiError.notFound('species')
  const { taxonOrder, orderNames, identification, similarSpeciesIds, ...rest } = row
  const item = toItem(rest, req.locale)
  const items = async (ids: number[]) => {
    const found = await prisma.species.findMany({ where: { id: { in: ids } }, select: { ...itemSelect, identification: true } })
    const byId = new Map(found.map(({ identification: idf, ...r }) => [r.id, { ...toItem(r, req.locale), identification: localized(idf, req.locale) }]))
    return ids.flatMap((i) => (byId.has(i) ? [byId.get(i)!] : []))
  }
  const [stats, profile] = await Promise.all([
    speciesStats(id, item.photoCount),
    speciesProfile({ ...row, taxonOrder, orderNames, identification, similarSpeciesIds }, req.user, req.locale, items)
  ])
  // Admins edit the stored (both-language) values; the public page gets the localized ones.
  const editable = req.user?.role === 'ADMIN' ? { editable: { identification, similarSpeciesIds, taxonOrder, taxonFamily: rest.taxonFamily } } : {}
  res.json({ ...item, stats, ...profile, ...editable })
})

speciesRoutes.get('/:id/distribution', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const sp = await prisma.species.findUnique({ where: { id }, select: { sensitive: true } })
  if (!sp) throw ApiError.notFound('species')
  res.json(await speciesDistribution(id, sp.sensitive, req.user))
})

speciesRoutes.post('/', requireAdmin, async (req, res) => {
  const { identification, ...data } = parse(speciesCreate, req.body)
  const species = await prisma.species.create({ data: { ...data, identification: identification ?? Prisma.DbNull }, select: { id: true } })
  res.status(201).json(species)
})

speciesRoutes.patch('/:id', requireAdmin, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const { identification, ...data } = parse(speciesUpdate, req.body)
  await prisma.$transaction(async (tx) => {
    await tx.species.update({ where: { id }, data: { ...data, ...(identification !== undefined && { identification: identification ?? Prisma.DbNull }) } })
    // Newly sensitive species: existing exact locations get downgraded.
    if (data.sensitive) {
      await tx.photoPost.updateMany({
        where: { speciesId: id, locationPrecision: 'EXACT' },
        data: { locationPrecision: 'APPROX' }
      })
    }
  })
  res.json({ id })
})

speciesRoutes.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = parse(idParam, req.params)
  // Photos lose their species and identifications of it are removed: re-grade them.
  const affected = await prisma.photoPost.findMany({
    where: { OR: [{ speciesId: id }, { identifications: { some: { speciesId: id } } }] },
    select: { id: true }
  })
  await prisma.species.delete({ where: { id } })
  await refreshQuality(...affected.map((p) => p.id))
  res.status(204).end()
})
