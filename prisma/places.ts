import { prisma } from '../src/lib/prisma'
import { PLACES } from './places-data'
import { curatedPlaceAt } from '../src/modules/places/refs'
import { backfillPhotoAreas } from '../src/modules/places/backfill'

/** Upserts the curated places (base data). Admin edits to existing rows are kept except for coordinates & text from the file. */
export async function seedPlaces() {
  const ids = new Map<string, number>()
  for (const p of PLACES) {
    const data = {
      name: p.name,
      kind: p.kind,
      countryCode: p.countryCode,
      area: p.area,
      region: p.region,
      latitude: p.latitude,
      longitude: p.longitude,
      radiusM: p.radiusM,
      timezone: p.timezone,
      description: p.description,
      access: p.access,
      guidelines: p.guidelines
    }
    const row = await prisma.place.upsert({
      where: { slug: p.slug },
      create: { slug: p.slug, ...data, status: 'CURATED', reviewedAt: new Date() },
      update: data,
      select: { id: true }
    })
    ids.set(p.slug, row.id)
  }
  // Trips created before their place existed: attach by meeting point.
  let trips = 0
  for (const t of await prisma.trip.findMany({ where: { placeId: null }, select: { id: true, latitude: true, longitude: true } })) {
    const placeId = await curatedPlaceAt(t.latitude, t.longitude)
    if (placeId) {
      await prisma.trip.update({ where: { id: t.id }, data: { placeId } })
      trips++
    }
  }
  const areas = await backfillPhotoAreas()
  console.log(`✔ places: ${PLACES.length} (${trips} trips attached, ${areas} observation areas updated)`)
  return ids
}
