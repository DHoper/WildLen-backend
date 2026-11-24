import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { ALL_TAGS } from './tags'
import { LOCALES } from './i18n'
import type { Delta } from './delta'

export const idParam = z.object({ id: z.coerce.number().int().positive() })

export const localeSchema = z.enum(LOCALES)

/** Tag keys from the catalogue (see lib/tags.ts). */
export const tagList = z
  .array(z.string())
  .max(8)
  .refine((tags) => tags.every((t) => ALL_TAGS.has(t)), 'validation.tags_unknown')
  .transform((tags) => [...new Set(tags)])

/** Quill Delta document. Capped so a single post can't be an unbounded blob. */
export const deltaSchema = z
  .object({
    ops: z
      .array(
        z.looseObject({
          insert: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
          attributes: z.record(z.string(), z.unknown()).optional()
        })
      )
      .min(1, 'validation.content_empty')
      .max(5000, 'validation.content_too_long')
  })
  .transform((d) => d as Delta & Prisma.InputJsonObject)

export const imageIdList = z.array(z.number().int().positive()).max(10)

export const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(30).optional(),
  authorId: z.coerce.number().int().positive().optional(),
  sort: z.enum(['latest', 'popular']).default('latest')
})
