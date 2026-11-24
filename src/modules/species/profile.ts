import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { Locale } from '../../lib/i18n'
import type { AuthUser } from '../../middleware/auth'
import { hiddenUserIds } from '../social/blocks'
import { withCounts } from '../../lib/select'
import { articleListSelect } from '../articles/article.routes'
import { placeEligibleSql } from '../places/privacy'
import { localized, placeRefSelect, toPlaceRef } from '../places/refs'
import { outingOrder, outingSelect, summarize as summarizeOutings } from '../outings/outing.routes'

/**
 * The deeper half of a species page, computed from the records (redesign v4 §3.3):
 * taxonomy, field marks and look-alikes, a shooting guide (focal lengths, active hours, the
 * places with most records) and related articles and journals.
 *
 * Privacy: hours and places only use records that may be tied to a place (placeEligibleSql:
 * exact location, wild, not a sensitive species), so a sensitive species never lists places or
 * hours; journals are not listed for sensitive species either. Focal lengths reveal no location.
 */

/** Local solar hour of a record (UTC + longitude / 15). */
const SOLAR_HOUR = Prisma.sql`floor(mod((extract(hour from p.taken_at) + extract(minute from p.taken_at) / 60.0 + p.longitude / 15.0 + 48)::numeric, 24))::int`

const hiddenSql = (hidden: number[]) => (hidden.length ? Prisma.sql`AND p.author_id NOT IN (${Prisma.join(hidden)})` : Prisma.empty)

export interface ProfileSpecies {
  id: number
  commonName: string
  englishName: string | null
  sensitive: boolean
  taxonOrder: string | null
  taxonFamily: string | null
  orderNames: Prisma.JsonValue
  familyNames: Prisma.JsonValue
  identification: Prisma.JsonValue
  similarSpeciesIds: number[]
}

export async function speciesProfile(sp: ProfileSpecies, viewer: AuthUser | undefined, locale: Locale, toItem: (ids: number[]) => Promise<unknown[]>) {
  const hidden = await hiddenUserIds(viewer?.id)
  const from = Prisma.sql`FROM photo_posts p LEFT JOIN species s ON s.id = p.species_id`
  const base = Prisma.sql`p.species_id = ${sp.id} ${hiddenSql(hidden)}`
  const names = [sp.commonName, sp.englishName].filter((n): n is string => !!n && n.length >= 2)

  const [focal, hours, places, articles, outingRows, similarRows] = await Promise.all([
    prisma.$queryRaw<{ mm: number; n: number }[]>`
      SELECT substring(p.exif->>'focalLength' from '([0-9]+)')::int AS mm, count(*)::int AS n ${from}
      WHERE ${base} AND NOT p.captive AND p.exif->>'focalLength' ~ '[0-9]' GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ k: number; n: number }[]>`
      SELECT ${SOLAR_HOUR} AS k, count(*)::int AS n ${from}
      WHERE ${base} AND ${placeEligibleSql} AND p.taken_at IS NOT NULL GROUP BY 1`,
    prisma.$queryRaw<{ id: number; n: number }[]>`
      SELECT p.place_id AS id, count(*)::int AS n ${from} JOIN places pl ON pl.id = p.place_id AND pl.status = 'CURATED'
      WHERE ${base} AND ${placeEligibleSql} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 6`,
    names.length
      ? prisma.article.findMany({
          where: {
            status: 'PUBLISHED',
            OR: names.flatMap((n) => [{ title: { contains: n, mode: 'insensitive' as const } }, { subtitle: { contains: n, mode: 'insensitive' as const } }])
          },
          select: articleListSelect,
          orderBy: { publishedAt: 'desc' },
          take: 3
        })
      : Promise.resolve([]),
    sp.sensitive
      ? Promise.resolve([])
      : prisma.outing.findMany({
          where: {
            status: 'PUBLISHED',
            authorId: { notIn: hidden },
            OR: [{ species: { some: { speciesId: sp.id } } }, { photos: { some: { speciesId: sp.id } } }]
          },
          select: outingSelect,
          orderBy: outingOrder,
          take: 4
        }),
    sp.similarSpeciesIds.length ? toItem(sp.similarSpeciesIds) : Promise.resolve([])
  ])

  const placeRows = await prisma.place.findMany({ where: { id: { in: places.map((p) => p.id) } }, select: { ...placeRefSelect, region: true } })
  const placeById = new Map(placeRows.map((p) => [p.id, p]))
  const hourHist = Array.from({ length: 24 }, () => 0)
  for (const h of hours) if (h.k >= 0 && h.k < 24) hourHist[h.k] = h.n
  const rank = (sci: string | null, names: Prisma.JsonValue) => (sci ? { scientificName: sci, name: localized(names, locale) ?? sci } : null)

  return {
    taxonomy: { order: rank(sp.taxonOrder, sp.orderNames), family: rank(sp.taxonFamily, sp.familyNames) },
    identification: localized(sp.identification, locale),
    similar: similarRows,
    guide: {
      focalLengths: focal.map((f) => ({ mm: f.mm, count: f.n })),
      hours: hourHist,
      places: places.flatMap((p) => {
        const row = placeById.get(p.id)
        return row ? [{ place: { ...toPlaceRef(row, locale), region: localized(row.region, locale) }, count: p.n }] : []
      })
    },
    related: {
      articles: articles.map(withCounts),
      outings: await summarizeOutings(outingRows, viewer, locale)
    }
  }
}

/**
 * Where a species has been recorded, for the small map. Exact records as points (blurred
 * records at the centre of their 0.1° cell, as everywhere else); for sensitive species only
 * 1° grid cells with counts, never points. Hidden locations and captive animals are left out.
 */
export async function speciesDistribution(speciesId: number, sensitive: boolean, viewer: AuthUser | undefined) {
  const hidden = await hiddenUserIds(viewer?.id)
  const where = Prisma.sql`p.species_id = ${speciesId} AND NOT p.captive AND p.location_precision <> 'HIDDEN' ${hiddenSql(hidden)}`
  if (sensitive) {
    const cells = await prisma.$queryRaw<{ lat: number; lng: number; n: number }[]>`
      SELECT floor(p.latitude)::float + 0.5 AS lat, floor(p.longitude)::float + 0.5 AS lng, count(*)::int AS n
      FROM photo_posts p WHERE ${where} GROUP BY 1, 2`
    return { mode: 'grid' as const, cellDeg: 1, cells: cells.map((c) => ({ latitude: c.lat, longitude: c.lng, count: c.n })) }
  }
  const points = await prisma.$queryRaw<{ lat: number; lng: number; n: number }[]>`
    SELECT CASE WHEN p.location_precision = 'EXACT' THEN round(p.latitude::numeric, 3)::float ELSE floor(p.latitude * 10) / 10 + 0.05 END AS lat,
           CASE WHEN p.location_precision = 'EXACT' THEN round(p.longitude::numeric, 3)::float ELSE floor(p.longitude * 10) / 10 + 0.05 END AS lng,
           count(*)::int AS n
    FROM photo_posts p WHERE ${where} GROUP BY 1, 2`
  return { mode: 'points' as const, points: points.map((p) => ({ latitude: p.lat, longitude: p.lng, count: p.n })) }
}
