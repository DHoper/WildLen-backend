import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse } from '../../lib/validate'
import { authorSelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'

/**
 * Admin: field journals (outings). Mounted under /admin/outings (requireAdmin already
 * applied). Read-only listing — removal goes through DELETE /outings/:id, which handles
 * a draft's uploads and keeps a published journal's observations.
 */
export const adminOutingRoutes = Router()

const listQuery = paginationQuery.extend({
  status: z.enum(['PUBLISHED', 'DRAFT']).default('PUBLISHED'),
  q: z.string().trim().max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
})

adminOutingRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  const where: Prisma.OutingWhereInput = {
    status: query.status,
    ...(query.q && {
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { locationName: { contains: query.q, mode: 'insensitive' } },
        { author: { username: { contains: query.q, mode: 'insensitive' } } }
      ]
    })
  }
  const [rows, total, drafts] = await Promise.all([
    prisma.outing.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        locationName: true,
        locationPrecision: true,
        startedAt: true,
        endedAt: true,
        timezone: true,
        language: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        author: { select: authorSelect },
        place: { select: { id: true, slug: true, name: true, status: true } },
        trip: { select: { id: true, title: true } },
        // Published: observations made from it. Drafts: uploads it still holds.
        _count: { select: { photos: true, species: true, images: true } }
      },
      orderBy: query.status === 'DRAFT' ? { updatedAt: 'asc' } : [{ publishedAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query)
    }),
    prisma.outing.count({ where }),
    prisma.outing.count({ where: { status: 'DRAFT' } })
  ])
  const items = rows.map(({ _count, ...o }) => ({ ...o, observationCount: _count.photos, speciesCount: _count.species, heldImageCount: _count.images }))
  res.json({ ...paginated(items, total, query), draftCount: drafts })
})
