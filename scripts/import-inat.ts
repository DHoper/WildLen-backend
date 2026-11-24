/**
 * iNaturalist import: research-grade, CC0 / CC BY observations at the curated places.
 *
 *   npx tsx scripts/import-inat.ts fetch    query the iNaturalist API (≤ 1 request/s) → scripts/.cache/inat-raw.json
 *   npx tsx scripts/import-inat.ts select   choose observations per place → prisma/data/inat-observations.json,
 *                                            then fetch their taxa → prisma/data/inat-taxa.json; prints a report
 *   npx tsx scripts/import-inat.ts taxonomy order & family of every catalogue species → prisma/data/inat-taxonomy.json
 *   npx tsx scripts/import-inat.ts import   offline: upsert places, species, the import account and observations
 *
 * The two JSON files under prisma/data are versioned, so `import` runs without network access and is
 * idempotent (observations are keyed by sourceName + sourceId). It is meant to run in production too.
 *
 * Rules: only CC0 / CC BY (observation and photo); no captive records; coordinates are stored as
 * iNaturalist publishes them. Obscured coordinates are never refined: such records are stored with
 * APPROX precision and without a place.
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { PLACES, type PlaceSeed } from '../prisma/places-data'

const API = 'https://api.inaturalist.org/v1'
const UA = 'WildLens-data-import/1.0'
const ROOT = path.resolve(__dirname, '..')
const CACHE = path.join(ROOT, 'scripts/.cache/inat-raw.json')
const OBS_FILE = path.join(ROOT, 'prisma/data/inat-observations.json')
const TAXA_FILE = path.join(ROOT, 'prisma/data/inat-taxa.json')
const LICENSES = ['cc0', 'cc-by']
const ICONIC = ['Aves', 'Mammalia', 'Reptilia', 'Amphibia']
const SEASONS = [
  [12, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11]
]

// ── HTTP (sequential, ≥ 1.1 s apart, retries on 429 / 5xx) ──
let last = 0
const get = async <T>(url: string): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    const wait = last + 1100 - Date.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    last = Date.now()
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (res.ok) return (await res.json()) as T
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
      continue
    }
    throw new Error(`${res.status} ${url}`)
  }
}

// ── Raw API shapes (only the fields we use) ──
interface RawPhoto {
  id: number
  license_code: string | null
  url: string
  attribution: string
  original_dimensions?: { width: number; height: number } | null
}
interface RawObs {
  id: number
  uri: string
  quality_grade: string
  captive: boolean
  obscured: boolean
  geoprivacy: string | null
  taxon_geoprivacy: string | null
  license_code: string | null
  time_observed_at: string | null
  observed_time_zone: string | null
  positional_accuracy: number | null
  geojson: { coordinates: [number, number] } | null
  cached_votes_total: number
  user: { login: string; name: string | null }
  taxon: { id: number; name: string; rank: string; iconic_taxon_name: string; preferred_common_name?: string } | null
  photos: RawPhoto[]
}

export interface InatPhoto {
  id: number
  url: string
  license: 'cc0' | 'cc-by'
  attribution: string
  width: number | null
  height: number | null
}
export interface InatObservation {
  id: number
  url: string
  /** Curated place, or null when the coordinates are obscured. */
  place: string | null
  /** Country and area of the place the record was found at (also for obscured records). */
  country: string
  area: string
  taxonId: number
  scientificName: string
  iconic: string
  observedAt: string
  timeZone: string | null
  latitude: number
  longitude: number
  accuracyM: number | null
  obscured: boolean
  user: { login: string; name: string | null }
  license: 'cc0' | 'cc-by'
  photos: InatPhoto[]
}
export interface InatTaxon {
  id: number
  scientificName: string
  iconic: string
  names: { en: string | null; zhTW: string | null; zh: string | null; ja: string | null }
  iucn: string | null
  /** iNaturalist obscures this taxon's locations (threatened). */
  obscured: boolean
  wikipediaUrl: string | null
}

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180
  const x = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(x))
}

// ── fetch ──
/** Keeps only the fields used here (API records are large). */
const slim = (o: RawObs): RawObs => ({
  id: o.id,
  uri: o.uri,
  quality_grade: o.quality_grade,
  captive: o.captive,
  obscured: o.obscured,
  geoprivacy: o.geoprivacy,
  taxon_geoprivacy: o.taxon_geoprivacy,
  license_code: o.license_code,
  time_observed_at: o.time_observed_at,
  observed_time_zone: o.observed_time_zone,
  positional_accuracy: o.positional_accuracy,
  geojson: o.geojson ? { coordinates: o.geojson.coordinates } : null,
  cached_votes_total: o.cached_votes_total,
  user: { login: o.user.login, name: o.user.name },
  taxon: o.taxon ? { id: o.taxon.id, name: o.taxon.name, rank: o.taxon.rank, iconic_taxon_name: o.taxon.iconic_taxon_name } : null,
  photos: o.photos.map((p) => ({ id: p.id, license_code: p.license_code, url: p.url, attribution: p.attribution, original_dimensions: p.original_dimensions ?? null }))
})

/** Fetches places missing from the cache (all of them with --refresh). */
async function fetchRaw() {
  const out: Record<string, RawObs[]> = fs.existsSync(CACHE) && !process.argv.includes('--refresh') ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {}
  for (const k of Object.keys(out)) if (!PLACES.some((p) => p.slug === k)) delete out[k]
  for (const p of PLACES) {
    if (out[p.slug]) continue
    const seen = new Map<number, RawObs>()
    for (const months of SEASONS) {
      const q = new URLSearchParams({
        quality_grade: 'research',
        license: LICENSES.join(','),
        photo_license: LICENSES.join(','),
        captive: 'false',
        photos: 'true',
        rank: 'species',
        iconic_taxa: ICONIC.join(','),
        lat: String(p.latitude),
        lng: String(p.longitude),
        radius: String(p.radiusM / 1000),
        month: months.join(','),
        order_by: 'votes',
        order: 'desc',
        per_page: '200'
      })
      const res = await get<{ total_results: number; results: RawObs[] }>(`${API}/observations?${q}`)
      for (const o of res.results) seen.set(o.id, slim(o))
      process.stdout.write(`  ${p.slug} months ${months.join('/')}: ${res.results.length} of ${res.total_results}\n`)
    }
    out[p.slug] = [...seen.values()]
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, JSON.stringify(out))
  console.log(`raw cache → ${path.relative(ROOT, CACHE)}`)
}

// ── select ──
const okLicense = (l: string | null): l is 'cc0' | 'cc-by' => !!l && LICENSES.includes(l)
const toObs = (o: RawObs, place: PlaceSeed): InatObservation | null => {
  if (o.quality_grade !== 'research' || o.captive || !o.taxon || o.taxon.rank !== 'species') return null
  if (!ICONIC.includes(o.taxon.iconic_taxon_name) || !o.time_observed_at || !o.geojson || !okLicense(o.license_code)) return null
  const photos = o.photos.filter((ph) => okLicense(ph.license_code)).slice(0, 3)
  if (!photos.length) return null
  const [lng, lat] = o.geojson.coordinates
  const obscured = o.obscured || o.geoprivacy === 'obscured' || o.taxon_geoprivacy === 'obscured'
  // Unobscured records must actually lie inside the place.
  if (!obscured && km(place.latitude, place.longitude, lat, lng) > place.radiusM / 1000) return null
  return {
    id: o.id,
    url: o.uri,
    place: obscured ? null : place.slug,
    country: place.countryCode,
    area: place.area,
    taxonId: o.taxon.id,
    scientificName: o.taxon.name,
    iconic: o.taxon.iconic_taxon_name,
    observedAt: o.time_observed_at,
    timeZone: o.observed_time_zone,
    latitude: lat,
    longitude: lng,
    accuracyM: o.positional_accuracy,
    obscured,
    user: { login: o.user.login, name: o.user.name || null },
    license: o.license_code as 'cc0' | 'cc-by',
    photos: photos.map((ph) => ({
      id: ph.id,
      url: ph.url.replace(/\/square\.(\w+)/, '/large.$1'),
      license: ph.license_code as 'cc0' | 'cc-by',
      attribution: ph.attribution,
      width: ph.original_dimensions?.width ?? null,
      height: ph.original_dimensions?.height ?? null
    }))
  }
}
const monthOf = (o: InatObservation) => Number(o.observedAt.slice(5, 7))

/** Per place: up to 4 "main" species with 5 records over ≥ 3 months, then secondary species. */
const MAIN_SPECIES = 4
const MAIN_RECORDS = 5
const SECONDARY_SPECIES = 6
const MAX_PER_OBSERVER = 6
const MAX_OBSCURED = 3

/**
 * Picks n records spread over the year: months are visited in a stride-5 order (0, 5, 10, 3, 8…)
 * from a per-species starting month, so consecutive picks land months apart and different
 * species cover different parts of the year. Within a month, most-faved first; at most
 * MAX_PER_OBSERVER records per observer and place.
 */
const pickSpread = (list: InatObservation[], n: number, perUser: Map<string, number>, offset: number) => {
  const byMonth = new Map<number, InatObservation[]>()
  for (const o of list) byMonth.set(monthOf(o), [...(byMonth.get(monthOf(o)) ?? []), o])
  const queues = Array.from({ length: 12 }, (_, k) => byMonth.get(((offset + 5 * k) % 12) + 1)).filter((q): q is InatObservation[] => !!q)
  const out: InatObservation[] = []
  while (out.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      while (q.length) {
        const o = q.shift()!
        if ((perUser.get(o.user.login) ?? 0) >= MAX_PER_OBSERVER) continue
        out.push(o)
        perUser.set(o.user.login, (perUser.get(o.user.login) ?? 0) + 1)
        break
      }
      if (out.length >= n) break
    }
  }
  return out
}

async function select() {
  if (!fs.existsSync(CACHE)) throw new Error('run "fetch" first')
  const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8')) as Record<string, RawObs[]>
  const taken = new Set<number>()
  const chosen: InatObservation[] = []
  const report: string[] = []

  for (const place of PLACES) {
    const pool = (raw[place.slug] ?? []).map((o) => toObs(o, place)).filter((o): o is InatObservation => !!o && !taken.has(o.id))
    const byTaxon = new Map<number, InatObservation[]>()
    for (const o of pool) byTaxon.set(o.taxonId, [...(byTaxon.get(o.taxonId) ?? []), o])
    const months = (l: InatObservation[]) => new Set(l.map(monthOf)).size
    const ranked = [...byTaxon.values()].sort((a, b) => months(b) - months(a) || b.length - a.length)
    const perUser = new Map<string, number>()
    const picks: InatObservation[] = []
    let obscured = 0
    const take = (list: InatObservation[], n: number) => {
      const offset = (list[0]!.taxonId * 7 + place.slug.length * 5) % 12
      const usable = list.filter((o) => !o.obscured || obscured < MAX_OBSCURED)
      const got = pickSpread(usable, n, perUser, offset)
      obscured += got.filter((o) => o.obscured).length
      picks.push(...got)
      return got
    }
    // Main species: unobscured, with enough records spread over the year
    const main = ranked.filter((l) => !l[0]!.obscured && l.length >= MAIN_RECORDS && months(l) >= 3)
    let mainCount = 0
    for (const l of main) {
      if (mainCount >= MAIN_SPECIES) break
      const got = take(l, MAIN_RECORDS)
      if (got.length === MAIN_RECORDS && months(got) >= 3) mainCount++
      else for (const o of got) picks.splice(picks.indexOf(o), 1)
    }
    // Secondary species: two records in different months where possible
    const used = new Set(picks.map((o) => o.taxonId))
    let secondary = 0
    for (const l of ranked) {
      if (secondary >= SECONDARY_SPECIES) break
      if (used.has(l[0]!.taxonId)) continue
      const got = take(l, Math.min(2, l.length))
      if (got.length) secondary++
    }
    for (const o of picks) taken.add(o.id)
    chosen.push(...picks)
    const species = new Set(picks.map((o) => o.taxonId)).size
    const placed = picks.filter((o) => o.place)
    const flag = placed.length >= 15 && new Set(placed.map((o) => o.taxonId)).size >= 8 ? 'ok ' : 'LOW'
    report.push(`${flag} ${place.area.padEnd(14)} ${place.slug.padEnd(20)} pool ${String(pool.length).padStart(4)}  picked ${String(picks.length).padStart(3)} (${placed.length} at place, ${picks.length - placed.length} obscured)  species ${species}  main ${mainCount}`)
  }

  // Taxa: names in all languages, IUCN status, whether iNaturalist obscures the taxon
  const ids = [...new Set(chosen.map((o) => o.taxonId))]
  const taxa: InatTaxon[] = []
  for (let i = 0; i < ids.length; i += 30) {
    const batch = ids.slice(i, i + 30)
    const res = await get<{ results: RawTaxon[] }>(`${API}/taxa/${batch.join(',')}?all_names=true`)
    for (const t of res.results) taxa.push(toTaxon(t))
  }
  fs.mkdirSync(path.dirname(OBS_FILE), { recursive: true })
  chosen.sort((a, b) => a.id - b.id)
  taxa.sort((a, b) => a.id - b.id)
  fs.writeFileSync(OBS_FILE, JSON.stringify(chosen, null, 1) + '\n')
  fs.writeFileSync(TAXA_FILE, JSON.stringify(taxa, null, 1) + '\n')

  // Report
  const counts = new Map<number, InatObservation[]>()
  for (const o of chosen) counts.set(o.taxonId, [...(counts.get(o.taxonId) ?? []), o])
  const majors = [...counts.values()].filter((l) => l.length >= 5 && new Set(l.map(monthOf)).size >= 3)
  console.log(report.join('\n'))
  console.log(`\n${chosen.length} observations, ${taxa.length} species (${majors.length} with ≥5 records over ≥3 months)`)
  const byArea = new Map<string, InatObservation[]>()
  for (const o of chosen) {
    const area = o.area
    byArea.set(area, [...(byArea.get(area) ?? []), o])
  }
  for (const [area, list] of byArea) console.log(`  ${area.padEnd(14)} ${list.length} observations, ${new Set(list.map((o) => o.taxonId)).size} species`)
  const { TAXON_NAMES_ZH } = await import('../prisma/data/taxon-names-zh')
  const missingZh = taxa.filter((t) => !t.names.zhTW && !TAXON_NAMES_ZH[t.id])
  console.log(`\ntaxa without a Traditional Chinese name (iNaturalist or prisma/data/taxon-names-zh.ts): ${missingZh.length}`)
  console.log(missingZh.map((t) => `  ${t.id} ${t.scientificName} | en: ${t.names.en} | zh: ${t.names.zh} | ja: ${t.names.ja}`).join('\n'))
}

interface RawTaxon {
  id: number
  name: string
  iconic_taxon_name: string
  preferred_common_name?: string
  wikipedia_url?: string | null
  names?: { name: string; locale: string; lexicon: string; is_valid: boolean; position: number }[]
  conservation_status?: { iucn?: number; status?: string; geoprivacy?: string | null } | null
  conservation_statuses?: { place?: unknown; iucn?: number; geoprivacy?: string | null }[]
}
const IUCN: Record<number, string> = { 10: 'LC', 20: 'NT', 30: 'VU', 40: 'EN', 50: 'CR', 60: 'EW', 70: 'EX' }
const toTaxon = (t: RawTaxon): InatTaxon => {
  const first = (ok: (n: NonNullable<RawTaxon['names']>[number]) => boolean) => t.names?.filter((n) => n.is_valid !== false && ok(n)).sort((a, b) => a.position - b.position)[0]?.name ?? null
  const global = t.conservation_statuses?.find((s) => !s.place && s.iucn)
  return {
    id: t.id,
    scientificName: t.name,
    iconic: t.iconic_taxon_name,
    names: {
      en: first((n) => n.locale === 'en') ?? t.preferred_common_name ?? null,
      zhTW: first((n) => n.lexicon === 'chinese-traditional' || n.locale === 'zh-TW'),
      zh: first((n) => n.lexicon === 'chinese-simplified' || n.locale === 'zh-CN'),
      ja: first((n) => n.locale === 'ja')
    },
    iucn: global?.iucn ? (IUCN[global.iucn] ?? null) : t.conservation_status?.iucn ? (IUCN[t.conservation_status.iucn] ?? null) : null,
    // Only global statuses: a taxon obscured in one country isn't sensitive everywhere (records
    // obscured locally are handled per observation).
    obscured: !!t.conservation_statuses?.some((s) => !s.place && (s.geoprivacy === 'obscured' || s.geoprivacy === 'private')),
    wikipediaUrl: t.wikipedia_url ?? null
  }
}

// ── taxonomy (order & family for every species in the catalogue) ──
export interface Taxonomy {
  /** By scientific name. */
  species: Record<string, { taxonId: number; order: string | null; family: string | null }>
  /** Localised names of orders and families, by scientific name. */
  ranks: Record<string, { rank: 'order' | 'family'; taxonId: number; zhTW: string | null; en: string | null }>
}
const TAXONOMY_FILE = path.join(ROOT, 'prisma/data/inat-taxonomy.json')

interface RawAncestorTaxon {
  id: number
  name: string
  rank: string
  preferred_common_name?: string
  ancestors?: { id: number; name: string; rank: string }[]
  names?: { name: string; locale: string; lexicon: string; is_valid: boolean; position: number }[]
}

async function fetchTaxonomy() {
  const { prisma } = await import('../src/lib/prisma')
  const names = (await prisma.species.findMany({ select: { scientificName: true }, orderBy: { id: 'asc' } })).map((s) => s.scientificName)
  await prisma.$disconnect()
  const imported = fs.existsSync(TAXA_FILE) ? (JSON.parse(fs.readFileSync(TAXA_FILE, 'utf8')) as InatTaxon[]) : []
  const ids = new Map(imported.map((t) => [t.scientificName, t.id]))
  // Catalogue species not from the import: look the name up (exact, active species)
  const { TAXON_ALIASES } = await import('../prisma/data/taxon-names-zh')
  for (const n of names.filter((n) => !ids.has(n))) {
    const q = TAXON_ALIASES[n] ?? n
    const r = await get<{ results: { id: number; name: string; rank: string; is_active: boolean }[] }>(`${API}/taxa?${new URLSearchParams({ q, rank: 'species', per_page: '5' })}`)
    const hit = r.results.find((t) => t.name === q && t.rank === 'species')
    if (hit) ids.set(n, hit.id)
    else console.log(`  no exact iNaturalist match: ${n}`)
  }
  const out: Taxonomy = { species: {}, ranks: {} }
  const wanted = names.filter((n) => ids.has(n))
  for (let i = 0; i < wanted.length; i += 30) {
    const batch = wanted.slice(i, i + 30).map((n) => ids.get(n)!)
    const res = await get<{ results: RawAncestorTaxon[] }>(`${API}/taxa/${batch.join(',')}`)
    const byId = new Map(wanted.map((n) => [ids.get(n)!, n]))
    for (const t of res.results) {
      const order = t.ancestors?.find((a) => a.rank === 'order')
      const family = t.ancestors?.find((a) => a.rank === 'family')
      // Keyed by the catalogue's own name (aliases resolve to another iNaturalist name).
      out.species[byId.get(t.id) ?? t.name] = { taxonId: t.id, order: order?.name ?? null, family: family?.name ?? null }
      for (const a of [order, family]) if (a) out.ranks[a.name] = { rank: a.rank as 'order' | 'family', taxonId: a.id, zhTW: null, en: null }
    }
  }
  const rankIds = Object.values(out.ranks).map((r) => r.taxonId)
  for (let i = 0; i < rankIds.length; i += 30) {
    const res = await get<{ results: RawAncestorTaxon[] }>(`${API}/taxa/${rankIds.slice(i, i + 30).join(',')}?all_names=true`)
    for (const t of res.results) {
      const first = (ok: (n: NonNullable<RawAncestorTaxon['names']>[number]) => boolean) => t.names?.filter((n) => n.is_valid !== false && ok(n)).sort((a, b) => a.position - b.position)[0]?.name ?? null
      const r = out.ranks[t.name]
      if (!r) continue
      r.zhTW = first((n) => n.lexicon === 'chinese-traditional' || n.locale === 'zh-TW')
      r.en = first((n) => n.locale === 'en') ?? t.preferred_common_name ?? null
    }
  }
  fs.writeFileSync(TAXONOMY_FILE, JSON.stringify(out, null, 1) + '\n')
  const sp = Object.values(out.species)
  const ranks = Object.values(out.ranks)
  console.log(`species: ${sp.length}/${names.length} matched; with order ${sp.filter((s) => s.order).length}, with family ${sp.filter((s) => s.family).length}`)
  console.log(`orders/families: ${ranks.length}; zh-TW names ${ranks.filter((r) => r.zhTW).length}, English ${ranks.filter((r) => r.en).length}`)
  console.log('without zh-TW:', ranks.filter((r) => !r.zhTW).map((r) => `${r.rank} ${Object.keys(out.ranks).find((k) => out.ranks[k] === r)}`).join(', '))
}

// ── main ──
const cmd = process.argv[2]
const run = async () => {
  if (cmd === 'fetch') return fetchRaw()
  if (cmd === 'select') return select()
  if (cmd === 'taxonomy') return fetchTaxonomy()
  if (cmd === 'import') return (await import('./import-inat-db')).importObservations()
  console.log('usage: import-inat.ts fetch | select | taxonomy | import')
}
run().catch((err) => {
  console.error(err)
  process.exit(1)
})
