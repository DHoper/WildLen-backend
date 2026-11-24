import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import type { Locale } from '../../lib/i18n'

/** Picks the viewer's language from a { "zh-TW", "en" } object, falling back to the other one. */
export const localized = <T = string>(value: unknown, locale: Locale): T | null => {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<Record<Locale, T>>
  return v[locale] ?? v['zh-TW'] ?? v.en ?? null
}

/** Minimal place reference embedded in observations, trips and lists. */
export const placeRefSelect = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  area: true,
  countryCode: true,
  status: true
} satisfies Prisma.PlaceSelect
type PlaceRefRow = Prisma.PlaceGetPayload<{ select: typeof placeRefSelect }>

export const toPlaceRef = (p: PlaceRefRow, locale: Locale) => ({ ...p, name: localized(p.name, locale) ?? p.slug })

export const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180
  const x = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(x))
}

/**
 * Places whose radius contains the point (nearest centre first). Curated places, plus the
 * viewer's own proposals. The catalogue is small, so a coarse SQL box + exact distance is enough.
 */
export const placesAt = async (lat: number, lng: number, viewerId?: number, slackKm = 0) => {
  const box = 1 + slackKm / 100 // degrees; the largest radius is ~50 km
  const rows = await prisma.place.findMany({
    where: {
      latitude: { gte: lat - box, lte: lat + box },
      longitude: { gte: lng - box * 2, lte: lng + box * 2 },
      OR: [{ status: 'CURATED' }, ...(viewerId ? [{ createdById: viewerId }] : [])]
    },
    select: { ...placeRefSelect, latitude: true, longitude: true, radiusM: true }
  })
  return rows
    .map((p) => ({ ...p, distanceKm: distanceKm(lat, lng, p.latitude, p.longitude) }))
    .filter((p) => p.distanceKm <= p.radiusM / 1000 + slackKm)
    .sort((a, b) => a.distanceKm / (a.radiusM / 1000) - b.distanceKm / (b.radiusM / 1000))
}

/** The curated place a point falls in, if any (used for trips' meeting points). */
export const curatedPlaceAt = async (lat: number, lng: number) => (await placesAt(lat, lng)).find((p) => p.status === 'CURATED')?.id ?? null
