import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { speciesSummarySelect } from '../../lib/select'
import { hiddenUserIds } from '../social/blocks'
import { photoListSelect, toPhotoSummary } from './photo.routes'
import { placeEligibleSql } from '../places/privacy'
import { placesAt, toPlaceRef } from '../places/refs'
import type { Locale } from '../../lib/i18n'

const placeAtPoint = async (lat: number, lng: number, locale: Locale) => {
  const p = (await placesAt(lat, lng)).find((x) => x.status === 'CURATED' && x.distanceKm <= x.radiusM / 1000)
  return p ? toPlaceRef(p, locale) : null
}

/**
 * Field-planning data for photographers, all aggregated from observations:
 *
 *   GET /scouting/area              what has been seen around a point: species,
 *                                   best months, best (solar) hours, gear used
 *   GET /users/:id/photo-stats      a photographer's habits (gear, focal lengths, light)
 *
 * Privacy: HIDDEN photos, captive animals and photos of sensitive species never contribute; point-radius
 * queries only use EXACT locations, so probing cannot narrow down protected sightings.
 */

/** Hour of day in local *solar* time (sun-based), from UTC taken_at and longitude. */
const SOLAR_HOUR = Prisma.sql`floor(mod((extract(hour from p.taken_at) + extract(minute from p.taken_at) / 60.0 + p.longitude / 15.0 + 48)::numeric, 24))::int`

const baseWhere = async (viewerId?: number) => {
  const hidden = await hiddenUserIds(viewerId)
  return Prisma.sql`p.location_precision <> 'HIDDEN' AND NOT p.captive AND (s.id IS NULL OR NOT s.sensitive)
    ${hidden.length ? Prisma.sql`AND p.author_id NOT IN (${Prisma.join(hidden)})` : Prisma.empty}`
}

const hist = (rows: { k: number; n: number }[], size: number, offset = 0) => {
  const out = Array.from({ length: size }, () => 0)
  for (const r of rows) if (r.k != null && r.k - offset >= 0 && r.k - offset < size) out[r.k - offset] = Number(r.n)
  return out
}

export const scoutingRoutes = Router()

const areaQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(2).max(100).default(15)
})

scoutingRoutes.get('/area', async (req, res) => {
  const q = parse(areaQuery, req.query)
  const dist = Prisma.sql`6371 * acos(least(1, cos(radians(${q.lat})) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians(${q.lng})) + sin(radians(${q.lat})) * sin(radians(p.latitude))))`
  const where = Prisma.sql`${await baseWhere(req.user?.id)} AND ${placeEligibleSql} AND ${dist} <= ${q.radiusKm}`
  const [ids, bySpecies, months, hours, lenses] = await Promise.all([
    prisma.$queryRaw<{ id: number; author: number }[]>`SELECT p.id, p.author_id AS author FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id WHERE ${where} ORDER BY p.created_at DESC`,
    prisma.$queryRaw<{ speciesId: number; n: number; m: number | null; last: Date | null }[]>`
      SELECT p.species_id AS "speciesId", count(*)::int AS n, extract(month from p.taken_at)::int AS m, max(p.taken_at) AS last
      FROM photo_posts p JOIN species s ON s.id = p.species_id WHERE ${where} GROUP BY 1, 3`,
    prisma.$queryRaw<{ k: number; n: number }[]>`SELECT extract(month from p.taken_at)::int AS k, count(*)::int AS n FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id WHERE ${where} AND p.taken_at IS NOT NULL GROUP BY 1`,
    prisma.$queryRaw<{ k: number; n: number }[]>`SELECT ${SOLAR_HOUR} AS k, count(*)::int AS n FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id WHERE ${where} AND p.taken_at IS NOT NULL GROUP BY 1`,
    prisma.$queryRaw<{ name: string; slug: string | null; n: number }[]>`SELECT coalesce(g.brand || ' ' || g.model, p.exif->>'lens') AS name, g.slug, count(*)::int AS n FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id LEFT JOIN gear g ON g.id = p.lens_id WHERE ${where} AND (p.lens_id IS NOT NULL OR p.exif->>'lens' IS NOT NULL) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5`
  ])
  const speciesRows = await prisma.species.findMany({ where: { id: { in: [...new Set(bySpecies.map((r) => r.speciesId))] } }, select: speciesSummarySelect })
  const species = speciesRows
    .map((s) => {
      const rows = bySpecies.filter((r) => r.speciesId === s.id)
      return {
        species: s,
        count: rows.reduce((n, r) => n + r.n, 0),
        months: hist(rows.flatMap((r) => (r.m ? [{ k: r.m, n: r.n }] : [])), 12, 1),
        lastSeen: rows.reduce<Date | null>((d, r) => (r.last && (!d || r.last > d) ? r.last : d), null)
      }
    })
    .sort((a, b) => b.count - a.count)
  const recent = await prisma.photoPost.findMany({ where: { id: { in: ids.slice(0, 8).map((r) => r.id) } }, select: photoListSelect, orderBy: { createdAt: 'desc' } })
  res.json({
    center: { latitude: q.lat, longitude: q.lng },
    radiusKm: q.radiusKm,
    /** Curated place containing the point: the client opens its page instead. */
    place: await placeAtPoint(q.lat, q.lng, req.locale),
    photoCount: ids.length,
    photographerCount: new Set(ids.map((r) => r.author)).size,
    speciesCount: species.length,
    species: species.slice(0, 20),
    months: hist(months, 12, 1),
    solarHours: hist(hours, 24),
    lenses: lenses.map((l) => ({ name: l.name, slug: l.slug, count: l.n })),
    photos: recent.map((p) => toPhotoSummary(p, req.user, req.locale))
  })
})

// ── Photographer stats ──
export const photoStatsRoutes = Router()

/** Focal-length buckets used on profiles. */
const FOCAL_BUCKETS = [
  { key: 'wide', max: 99 },
  { key: 'mid', max: 299 },
  { key: 'tele', max: 499 },
  { key: 'super', max: 799 },
  { key: 'extreme', max: Infinity }
] as const

photoStatsRoutes.get('/:id/photo-stats', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) throw ApiError.notFound('user')
  const where = Prisma.sql`p.author_id = ${id}`
  const [totals, cameras, lenses, focal, hours, months] = await Promise.all([
    prisma.$queryRaw<{ photos: number; species: number; first: Date | null }[]>`SELECT count(*)::int AS photos, count(DISTINCT p.species_id)::int AS species, min(p.taken_at) AS first FROM photo_posts p WHERE ${where}`,
    prisma.$queryRaw<{ name: string; slug: string | null; n: number }[]>`SELECT coalesce(g.brand || ' ' || g.model, p.exif->>'camera') AS name, g.slug, count(*)::int AS n FROM photo_posts p LEFT JOIN gear g ON g.id = p.camera_id WHERE ${where} AND (p.camera_id IS NOT NULL OR p.exif->>'camera' IS NOT NULL) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5`,
    prisma.$queryRaw<{ name: string; slug: string | null; n: number }[]>`SELECT coalesce(g.brand || ' ' || g.model, p.exif->>'lens') AS name, g.slug, count(*)::int AS n FROM photo_posts p LEFT JOIN gear g ON g.id = p.lens_id WHERE ${where} AND (p.lens_id IS NOT NULL OR p.exif->>'lens' IS NOT NULL) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5`,
    prisma.$queryRaw<{ mm: number }[]>`SELECT substring(p.exif->>'focalLength' from '([0-9]+)')::int AS mm FROM photo_posts p WHERE ${where} AND p.exif->>'focalLength' ~ '[0-9]'`,
    prisma.$queryRaw<{ k: number; n: number }[]>`SELECT ${SOLAR_HOUR} AS k, count(*)::int AS n FROM photo_posts p WHERE ${where} AND p.taken_at IS NOT NULL GROUP BY 1`,
    prisma.$queryRaw<{ k: number; n: number }[]>`SELECT extract(month from p.taken_at)::int AS k, count(*)::int AS n FROM photo_posts p WHERE ${where} AND p.taken_at IS NOT NULL GROUP BY 1`
  ])
  const t = totals[0]!
  res.json({
    photoCount: t.photos,
    speciesCount: t.species,
    firstObservationAt: t.first,
    cameras: cameras.map((c) => ({ name: c.name, slug: c.slug, count: c.n })),
    lenses: lenses.map((l) => ({ name: l.name, slug: l.slug, count: l.n })),
    focalBuckets: FOCAL_BUCKETS.map((b, i) => ({
      key: b.key,
      count: focal.filter((f) => f.mm <= b.max && (i === 0 || f.mm > FOCAL_BUCKETS[i - 1]!.max)).length
    })),
    medianFocalLength: focal.length ? focal.map((f) => f.mm).sort((a, b) => a - b)[Math.floor(focal.length / 2)] : null,
    solarHours: hist(hours, 24),
    months: hist(months, 12, 1)
  })
})
