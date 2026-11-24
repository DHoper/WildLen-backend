/**
 * Gear catalogue (reference data, always seeded).
 * Idempotent: catalogue upserted by slug; photo links recomputed from EXIF.
 *
 * Gear is an attribute of observations (redesign v4 §4.6): no seeded reviews or owned gear.
 */
import type { PrismaClient } from '@prisma/client'
import { GEAR, gearSlug } from './gear-data'
import { invalidateGearIndex } from '../src/modules/gear/normalize'

export async function seedGear(prisma: PrismaClient) {
  for (const g of GEAR) {
    const slug = gearSlug(g.brand, g.model)
    const data = {
      slug,
      type: g.type,
      brand: g.brand,
      model: g.model,
      mount: g.mount,
      focalMinMm: g.focal?.[0] ?? null,
      focalMaxMm: g.focal?.[1] ?? null,
      apertureWide: g.aperture?.[0] ?? null,
      apertureTele: g.aperture?.[1] ?? null,
      magnification: g.magnification ?? null,
      sensor: g.sensor ?? null,
      megapixels: g.megapixels ?? null,
      maxFps: g.maxFps ?? null,
      weightG: g.weightG,
      releasedYear: g.year,
      aliases: g.aliases ?? []
    }
    await prisma.gear.upsert({ where: { slug }, create: data, update: data })
  }
  invalidateGearIndex()
  console.log(`✔ gear catalogue: ${GEAR.length} items`)
}
