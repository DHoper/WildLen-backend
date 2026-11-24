import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'

/**
 * Matching EXIF camera / lens strings to catalogue items.
 *
 * Strings are compared after normalisation (lower-case, α→a, alphanumerics only), against
 * each item's "model", "brand model" and aliases. EXIF typically gives "Canon EOS R5" /
 * "RF100-500mm F4.5-7.1 L IS USM", which both normalise onto the catalogue names.
 */
export const normalizeGearName = (s: string) =>
  s
    .toLowerCase()
    .replace(/α/g, 'a')
    .replace(/[^a-z0-9]/g, '')

/** URL slug from brand + model ("Canon", "RF 100-500mm F4.5-7.1 L IS USM" → "canon-rf-100-500mm-f4-5-7-1-l-is-usm"). */
export const gearSlug = (brand: string, model: string) =>
  `${brand} ${model}`
    .toLowerCase()
    .replace(/α/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

interface Index {
  camera: Map<string, number>
  lens: Map<string, number>
  at: number
}
let index: Index | null = null
const TTL = 5 * 60_000

/** Lookup tables, rebuilt at most every few minutes (the catalogue changes rarely). */
const loadIndex = async (): Promise<Index> => {
  if (index && Date.now() - index.at < TTL) return index
  const rows = await prisma.gear.findMany({ select: { id: true, type: true, brand: true, model: true, aliases: true } })
  const next: Index = { camera: new Map(), lens: new Map(), at: Date.now() }
  for (const g of rows) {
    const map = g.type === 'CAMERA' ? next.camera : next.lens
    for (const key of [g.model, `${g.brand} ${g.model}`, ...g.aliases]) {
      const k = normalizeGearName(key)
      if (k && !map.has(k)) map.set(k, g.id)
    }
  }
  index = next
  return next
}

/** Forget the cached index (after catalogue edits). */
export const invalidateGearIndex = () => {
  index = null
}

/** Catalogue ids for an EXIF block, or null where the string is unknown / absent. */
export const resolveGear = async (exif: { camera?: string | null; lens?: string | null } | null | undefined) => {
  if (!exif) return { cameraId: null, lensId: null }
  const idx = await loadIndex()
  const find = (map: Map<string, number>, s?: string | null) => (s ? (map.get(normalizeGearName(s)) ?? null) : null)
  return { cameraId: find(idx.camera, exif.camera), lensId: find(idx.lens, exif.lens) }
}

/**
 * Re-matches photos' EXIF against the current catalogue and rewrites cameraId / lensId
 * where the result changed (links can also be removed, e.g. after an alias is deleted).
 * Call after adding items or editing aliases. Pass `where` to limit the photos checked.
 */
export const relinkPhotoGear = async (where: Prisma.PhotoPostWhereInput = {}) => {
  invalidateGearIndex()
  const photos = await prisma.photoPost.findMany({ where, select: { id: true, exif: true, cameraId: true, lensId: true } })
  let updated = 0
  for (const p of photos) {
    const exif = p.exif as { camera?: string | null; lens?: string | null } | null
    const { cameraId, lensId } = await resolveGear(exif)
    if (cameraId === p.cameraId && lensId === p.lensId) continue
    await prisma.photoPost.update({ where: { id: p.id }, data: { cameraId, lensId } })
    updated++
  }
  return { checked: photos.length, updated }
}

/** EXIF camera / lens strings that no catalogue item matches, most used first. */
export const unmatchedGearStrings = (limit = 200) =>
  prisma.$queryRaw<{ type: 'CAMERA' | 'LENS'; name: string; photoCount: number }[]>`
    SELECT * FROM (
      SELECT 'CAMERA' AS type, exif->>'camera' AS name, count(*)::int AS "photoCount"
        FROM photo_posts WHERE camera_id IS NULL AND coalesce(exif->>'camera', '') <> '' GROUP BY 2
      UNION ALL
      SELECT 'LENS' AS type, exif->>'lens' AS name, count(*)::int AS "photoCount"
        FROM photo_posts WHERE lens_id IS NULL AND coalesce(exif->>'lens', '') <> '' GROUP BY 2
    ) t
    ORDER BY "photoCount" DESC, name
    LIMIT ${limit}`
