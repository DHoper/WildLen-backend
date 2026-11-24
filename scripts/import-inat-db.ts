/**
 * Offline half of the iNaturalist import: reads prisma/data/inat-*.json and upserts
 * places, species, the import account and the observations with their photos.
 * Idempotent: observations are keyed by (sourceName, sourceId), images by publicId.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { ConservationStatus, PhotoLicense, SpeciesGroup } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { refreshQuality } from '../src/modules/photos/quality'
import { seedPlaces } from '../prisma/places'
import { applyTaxonomy } from '../prisma/taxonomy'
import { areaOf } from '../src/modules/places/areas'
import { PLACES } from '../prisma/places-data'
import { TAXON_NAMES_ZH } from '../prisma/data/taxon-names-zh'
import type { InatObservation, InatTaxon } from './import-inat'
import { decodeEntities } from '../src/lib/entities'

export const SOURCE_NAME = 'iNaturalist'
export const IMPORT_ACCOUNT_EMAIL = 'inaturalist-import@system.wildlens'

const ROOT = path.resolve(__dirname, '..')
const read = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8')) as T

const GROUP: Record<string, SpeciesGroup> = { Aves: 'BIRD', Mammalia: 'MAMMAL', Reptilia: 'REPTILE', Amphibia: 'AMPHIBIAN' }
const STATUS = new Set<ConservationStatus>(['LC', 'NT', 'VU', 'EN', 'CR'])
const LICENSE: Record<string, PhotoLicense> = { cc0: 'CC0', 'cc-by': 'CC_BY' }
/** Regions whose records are written in Chinese on WildLens; elsewhere in English. */
const ZH_AREAS = new Set(['taiwan', 'japan'])
const COUNTRY: Record<string, { 'zh-TW': string; en: string }> = {
  TW: { 'zh-TW': '台灣', en: 'Taiwan' },
  JP: { 'zh-TW': '日本', en: 'Japan' },
  KE: { 'zh-TW': '肯亞', en: 'Kenya' },
  TZ: { 'zh-TW': '坦尚尼亞', en: 'Tanzania' },
  GB: { 'zh-TW': '英國', en: 'United Kingdom' },
  ES: { 'zh-TW': '西班牙', en: 'Spain' },
  NO: { 'zh-TW': '挪威', en: 'Norway' },
  US: { 'zh-TW': '美國', en: 'United States' },
  AU: { 'zh-TW': '澳洲', en: 'Australia' },
  NZ: { 'zh-TW': '紐西蘭', en: 'New Zealand' }
}

async function importAccount() {
  return prisma.user.upsert({
    where: { email: IMPORT_ACCOUNT_EMAIL },
    create: {
      email: IMPORT_ACCOUNT_EMAIL,
      username: 'iNaturalist import',
      system: true,
      emailVerified: true,
      bio: 'Research-grade observations imported from iNaturalist under CC0 or CC BY. Each record credits its original observer and links to the source.',
      avatarIndex: 1
    },
    update: { system: true },
    select: { id: true }
  })
}

async function upsertSpecies(taxa: InatTaxon[]) {
  const ids = new Map<number, number>()
  for (const t of taxa) {
    const group = GROUP[t.iconic]
    if (!group) continue
    const zh = TAXON_NAMES_ZH[t.id] ?? t.names.zhTW ?? t.names.en ?? t.scientificName
    const existing = await prisma.species.findUnique({ where: { scientificName: t.scientificName }, select: { id: true, sensitive: true } })
    if (existing) {
      // Keep curated names and texts; only tighten the sensitive flag.
      if (t.obscured && !existing.sensitive) await prisma.species.update({ where: { id: existing.id }, data: { sensitive: true } })
      ids.set(t.id, existing.id)
      continue
    }
    const clash = await prisma.species.findUnique({ where: { commonName: zh }, select: { id: true } })
    const row = await prisma.species.create({
      data: {
        commonName: clash ? `${zh}（${t.scientificName}）` : zh,
        scientificName: t.scientificName,
        englishName: t.names.en,
        group,
        status: t.iucn && STATUS.has(t.iucn as ConservationStatus) ? (t.iucn as ConservationStatus) : 'LC',
        sensitive: t.obscured
      },
      select: { id: true }
    })
    ids.set(t.id, row.id)
  }
  return ids
}

export async function importObservations() {
  const observations = read<InatObservation[]>('prisma/data/inat-observations.json')
  const taxa = read<InatTaxon[]>('prisma/data/inat-taxa.json')
  const placeIds = await seedPlaces()
  const account = await importAccount()
  const speciesIds = await upsertSpecies(taxa)
  const taxonById = new Map(taxa.map((t) => [t.id, t]))
  // Blurring follows WildLens's own sensitive list (after the upsert above, which only tightens it),
  // not just iNaturalist's: a species sensitive here is blurred even when iNaturalist shows it exactly.
  const sensitiveIds = new Set((await prisma.species.findMany({ where: { id: { in: [...speciesIds.values()] }, sensitive: true }, select: { id: true } })).map((s) => s.id))
  const placeBySlug = new Map(PLACES.map((p) => [p.slug, p]))

  const ids: number[] = []
  let created = 0
  for (const o of observations) {
    const taxon = taxonById.get(o.taxonId)
    const speciesId = speciesIds.get(o.taxonId)
    if (!taxon || !speciesId) continue
    const zh = ZH_AREAS.has(o.area)
    const lang = zh ? 'zh-TW' : 'en'
    const place = o.place ? placeBySlug.get(o.place) : undefined
    const blurred = o.obscured || sensitiveIds.has(speciesId)
    const name = zh ? (TAXON_NAMES_ZH[taxon.id] ?? taxon.names.zhTW ?? taxon.names.en!) : (taxon.names.en ?? taxon.scientificName)
    const license = o.photos.some((p) => p.license === 'cc-by') || o.license === 'cc-by' ? 'CC_BY' : 'CC0'
    const data = {
      title: name,
      description: '',
      language: lang,
      // Blurred records name only the country, so the page can't point to a site.
      locationName: place && !blurred ? place.name[lang] : (COUNTRY[o.country]?.[lang] ?? o.country),
      latitude: o.latitude,
      longitude: o.longitude,
      area: areaOf(o.latitude, o.longitude),
      locationPrecision: blurred ? ('APPROX' as const) : ('EXACT' as const),
      placeId: place && !blurred ? (placeIds.get(place.slug) ?? null) : null,
      takenAt: new Date(o.observedAt),
      speciesId,
      captive: false,
      license: LICENSE[license === 'CC_BY' ? 'cc-by' : 'cc0']!,
      sourceUrl: o.url,
      sourceAuthor: decodeEntities(o.user.name || o.user.login),
      sourceLicense: o.license
    }
    const key = { sourceName_sourceId: { sourceName: SOURCE_NAME, sourceId: String(o.id) } }
    const existing = await prisma.photoPost.findUnique({ where: key, select: { id: true } })
    const photo = existing
      ? await prisma.photoPost.update({ where: { id: existing.id }, data, select: { id: true } })
      : await prisma.photoPost.create({ data: { ...data, authorId: account.id, sourceName: SOURCE_NAME, sourceId: String(o.id), createdAt: new Date(o.observedAt) }, select: { id: true } })
    if (!existing) created++
    for (const [position, ph] of o.photos.entries()) {
      const img = { url: ph.url, width: ph.width, height: ph.height, position, ownerId: account.id, photoPostId: photo.id }
      await prisma.image.upsert({ where: { publicId: `inat-photo-${ph.id}` }, create: { publicId: `inat-photo-${ph.id}`, ...img }, update: img })
    }
    ids.push(photo.id)
  }
  await applyTaxonomy()
  await refreshQuality(...ids)

  // Sync: imported records no longer in the list are removed (only this source, only the import account).
  const stale = await prisma.photoPost.findMany({
    where: { sourceName: SOURCE_NAME, authorId: account.id, id: { notIn: ids } },
    select: { id: true }
  })
  if (stale.length) {
    const staleIds = stale.map((s) => s.id)
    await prisma.image.deleteMany({ where: { photoPostId: { in: staleIds } } })
    await prisma.photoPost.deleteMany({ where: { id: { in: staleIds } } })
  }
  const confirmed = await prisma.photoPost.count({ where: { id: { in: ids }, quality: 'CONFIRMED' } })
  console.log(`✔ iNaturalist: ${ids.length} observations (${created} new, ${stale.length} removed), ${speciesIds.size} species, ${confirmed} research grade`)
  await prisma.$disconnect()
}
