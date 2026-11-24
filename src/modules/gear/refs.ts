import type { Prisma } from '@prisma/client'

/** Minimal gear reference embedded in photos, posts and profiles. */
export const gearRefSelect = { id: true, slug: true, type: true, brand: true, model: true } satisfies Prisma.GearSelect
