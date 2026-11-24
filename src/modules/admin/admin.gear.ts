import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { gearSlug, normalizeGearName, relinkPhotoGear, unmatchedGearStrings } from '../gear/normalize'

/**
 * Admin: the gear catalogue and its EXIF aliases. Mounted under /admin/gear
 * (requireAdmin already applied). Every write re-links photos, so a new alias or
 * item takes effect on existing observations immediately.
 */
export const adminGearRoutes = Router()

const TYPES = ['CAMERA', 'LENS', 'TELECONVERTER'] as const
const optInt = (max: number) => z.number().int().positive().max(max).nullable().optional()
const optNum = (max: number) => z.number().positive().max(max).nullable().optional()

const gearFields = z.object({
  type: z.enum(TYPES),
  brand: z.string().trim().min(1).max(40),
  model: z.string().trim().min(1).max(80),
  mount: z.string().trim().min(1).max(40),
  focalMinMm: optInt(3000),
  focalMaxMm: optInt(3000),
  apertureWide: optNum(64),
  apertureTele: optNum(64),
  magnification: optNum(4),
  sensor: z.string().trim().max(40).nullable().optional(),
  megapixels: optNum(400),
  maxFps: optNum(240),
  weightG: optInt(20000),
  releasedYear: z.number().int().min(1950).max(2100).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(40).default([])
})

const listQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  type: z.enum(TYPES).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
})

/** Lenses and teleconverters share one EXIF lookup table; bodies have their own. */
const tableOf = (type: (typeof TYPES)[number]) => (type === 'CAMERA' ? 'CAMERA' : 'LENS')

/**
 * The lookup keys an item claims (model, "brand model", each alias — normalised).
 * Rejects the write if another item in the same table already claims one of them:
 * the resolver keeps whichever loaded first, so a silent clash would mis-file photos.
 */
const assertNoKeyClash = async (item: { type: (typeof TYPES)[number]; brand: string; model: string; aliases: string[] }, selfId?: number) => {
  const keys = new Set([item.model, `${item.brand} ${item.model}`, ...item.aliases].map(normalizeGearName).filter(Boolean))
  const others = await prisma.gear.findMany({
    where: { ...(selfId && { NOT: { id: selfId } }), type: tableOf(item.type) === 'CAMERA' ? 'CAMERA' : { in: ['LENS', 'TELECONVERTER'] } },
    select: { brand: true, model: true, aliases: true }
  })
  for (const o of others) {
    const clash = [o.model, `${o.brand} ${o.model}`, ...o.aliases].find((k) => keys.has(normalizeGearName(k)))
    if (clash) throw new ApiError('CONFLICT', 'admin.gear_alias_taken', { alias: clash, gear: `${o.brand} ${o.model}` })
  }
}

const dedupeAliases = (aliases: string[]) => {
  const seen = new Set<string>()
  return aliases.filter((a) => {
    const k = normalizeGearName(a)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const withCounts = { _count: { select: { photosAsCamera: true, photosAsLens: true } } } satisfies Prisma.GearInclude
const present = <T extends { _count: { photosAsCamera: number; photosAsLens: number } }>({ _count, ...g }: T) => ({
  ...g,
  photoCount: _count.photosAsCamera + _count.photosAsLens
})

adminGearRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  const where: Prisma.GearWhereInput = {
    ...(query.type && { type: query.type }),
    ...(query.q && {
      OR: [
        { brand: { contains: query.q, mode: 'insensitive' } },
        { model: { contains: query.q, mode: 'insensitive' } },
        { aliases: { has: query.q } }
      ]
    })
  }
  const [rows, total] = await Promise.all([
    prisma.gear.findMany({ where, include: withCounts, orderBy: [{ type: 'asc' }, { brand: 'asc' }, { model: 'asc' }], ...toSkipTake(query) }),
    prisma.gear.count({ where })
  ])
  res.json(paginated(rows.map(present), total, query))
})

/** EXIF camera / lens strings on photos that no catalogue item claims, most used first. */
adminGearRoutes.get('/unmatched', async (_req, res) => {
  res.json(await unmatchedGearStrings(200))
})

/** Re-runs EXIF matching over every photo (after bulk catalogue changes). */
adminGearRoutes.post('/relink', async (_req, res) => {
  res.json(await relinkPhotoGear())
})

adminGearRoutes.post('/', async (req, res) => {
  const data = parse(gearFields, req.body)
  const slug = gearSlug(data.brand, data.model)
  if (await prisma.gear.findUnique({ where: { slug }, select: { id: true } })) throw ApiError.conflict('admin.gear_exists')
  const aliases = dedupeAliases(data.aliases)
  await assertNoKeyClash({ ...data, aliases })
  const { id } = await prisma.gear.create({ data: { ...data, aliases, slug }, select: { id: true } })
  const relinked = await relinkPhotoGear()
  // Read back after re-linking so photoCount includes the photos just matched.
  const gear = await prisma.gear.findUniqueOrThrow({ where: { id }, include: withCounts })
  res.status(201).json({ ...present(gear), relinked })
})

adminGearRoutes.patch('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const data = parse(gearFields.partial().omit({ aliases: true }).extend({ aliases: gearFields.shape.aliases.optional() }), req.body)
  const current = await prisma.gear.findUnique({ where: { id } })
  if (!current) throw ApiError.notFound('gear')
  const merged = { ...current, ...data, aliases: dedupeAliases(data.aliases ?? current.aliases) }
  // The slug is the public URL; keep it stable unless the name itself changes.
  const slug = data.brand || data.model ? gearSlug(merged.brand, merged.model) : current.slug
  if (slug !== current.slug && (await prisma.gear.findUnique({ where: { slug }, select: { id: true } }))) throw ApiError.conflict('admin.gear_exists')
  await assertNoKeyClash(merged, id)
  await prisma.gear.update({ where: { id }, data: { ...data, aliases: merged.aliases, slug } })
  const relinked = await relinkPhotoGear()
  const gear = await prisma.gear.findUniqueOrThrow({ where: { id }, include: withCounts })
  res.json({ ...present(gear), relinked })
})

/** Files an unmatched EXIF string under an existing item. */
adminGearRoutes.post('/:id/aliases', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const { alias } = parse(z.object({ alias: z.string().trim().min(1).max(120) }), req.body)
  const current = await prisma.gear.findUnique({ where: { id } })
  if (!current) throw ApiError.notFound('gear')
  const aliases = dedupeAliases([...current.aliases, alias])
  await assertNoKeyClash({ ...current, aliases }, id)
  await prisma.gear.update({ where: { id }, data: { aliases } })
  res.json(await relinkPhotoGear())
})

adminGearRoutes.delete('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  if (!(await prisma.gear.findUnique({ where: { id }, select: { id: true } }))) throw ApiError.notFound('gear')
  // Photos keep their raw EXIF; cameraId / lensId fall back to null (onDelete: SetNull).
  await prisma.gear.delete({ where: { id } })
  await relinkPhotoGear()
  res.status(204).end()
})
