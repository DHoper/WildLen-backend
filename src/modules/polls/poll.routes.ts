import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { authorSelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { assertOwnerOrAdmin, currentUser, requireAuth, requireVerified, type AuthUser } from '../../middleware/auth'
import { assertVisible, visibleAuthor } from '../social/blocks'

const DAY = 24 * 60 * 60 * 1000

const pollBody = z.object({
  title: z.string().trim().min(4).max(80),
  description: z.string().trim().max(500).optional(),
  endsAt: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now() + 60 * 60 * 1000, 'validation.poll_ends_soon')
    .refine((d) => d.getTime() < Date.now() + 90 * DAY, 'validation.poll_ends_far'),
  options: z
    .array(z.string().trim().min(1).max(60))
    .min(2)
    .max(8)
    .refine((o) => new Set(o).size === o.length, 'validation.poll_options_unique')
})

const listQuery = paginationQuery.extend({
  filter: z.enum(['all', 'active', 'ended', 'mine', 'voted']).default('active'),
  sort: z.enum(['latest', 'popular']).default('latest'),
  authorId: z.coerce.number().int().positive().optional()
})

const pollSelect = (userId?: number) =>
  ({
    id: true,
    title: true,
    description: true,
    endsAt: true,
    createdAt: true,
    author: { select: authorSelect },
    _count: { select: { ballots: true } },
    options: {
      select: { id: true, text: true, _count: { select: { ballots: true } } },
      orderBy: { position: 'asc' }
    },
    ballots: { where: { userId: userId ?? -1 }, select: { optionId: true } }
  }) satisfies Prisma.PollSelect

type PollRow = Prisma.PollGetPayload<{ select: ReturnType<typeof pollSelect> }>

/**
 * Results are hidden until the viewer has voted, the poll has ended, or the viewer
 * is the author / an admin — so early totals don't sway voters.
 */
const toPayload = (poll: PollRow, user?: AuthUser) => {
  const isEnded = poll.endsAt.getTime() <= Date.now()
  const myOptionId = poll.ballots[0]?.optionId ?? null
  const showResults =
    isEnded || myOptionId !== null || user?.role === 'ADMIN' || user?.id === poll.author.id
  return {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    endsAt: poll.endsAt,
    createdAt: poll.createdAt,
    author: poll.author,
    isEnded,
    ballotCount: poll._count.ballots,
    myOptionId,
    showResults,
    options: poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      ballotCount: showResults ? o._count.ballots : null
    }))
  }
}

export const pollRoutes = Router()

pollRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  const user = req.user
  if ((query.filter === 'mine' || query.filter === 'voted') && !user) throw ApiError.unauthorized()

  const now = new Date()
  const where: Prisma.PollWhereInput = {
    ...(await visibleAuthor(user?.id)),
    ...(query.authorId && { authorId: query.authorId }),
    ...(query.filter === 'active' && { endsAt: { gt: now } }),
    ...(query.filter === 'ended' && { endsAt: { lte: now } }),
    ...(query.filter === 'mine' && { authorId: user!.id }),
    ...(query.filter === 'voted' && { ballots: { some: { userId: user!.id } } })
  }
  const orderBy: Prisma.PollOrderByWithRelationInput[] =
    query.sort === 'popular' ? [{ ballots: { _count: 'desc' } }, { createdAt: 'desc' }] : [{ createdAt: 'desc' }]

  const [rows, total] = await Promise.all([
    prisma.poll.findMany({ where, select: pollSelect(user?.id), orderBy, ...toSkipTake(query) }),
    prisma.poll.count({ where })
  ])
  res.json(paginated(rows.map((r) => toPayload(r, user)), total, query))
})

pollRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const poll = await prisma.poll.findUnique({ where: { id }, select: pollSelect(req.user?.id) })
  if (!poll) throw ApiError.notFound('poll')
  await assertVisible(req.user?.id, poll.author.id, 'poll')
  res.json(toPayload(poll, req.user))
})

pollRoutes.post('/', requireVerified, async (req, res) => {
  const user = currentUser(req)
  const { options, ...data } = parse(pollBody, req.body)
  const poll = await prisma.poll.create({
    data: {
      ...data,
      authorId: user.id,
      options: { create: options.map((text, position) => ({ text, position })) }
    },
    select: { id: true }
  })
  res.status(201).json(poll)
})

pollRoutes.post('/:id/ballots', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const { optionId } = parse(z.object({ optionId: z.number().int().positive() }), req.body)

  const poll = await prisma.poll.findUnique({
    where: { id },
    select: { endsAt: true, options: { where: { id: optionId }, select: { id: true } } }
  })
  if (!poll) throw ApiError.notFound('poll')
  if (poll.endsAt.getTime() <= Date.now()) throw ApiError.badRequest('poll.ended')
  if (!poll.options.length) throw ApiError.badRequest('poll.invalid_option')

  try {
    await prisma.pollBallot.create({ data: { userId: user.id, pollId: id, optionId } })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') throw ApiError.conflict('poll.already_voted')
    throw err
  }

  const updated = await prisma.poll.findUniqueOrThrow({ where: { id }, select: pollSelect(user.id) })
  res.status(201).json(toPayload(updated, user))
})

pollRoutes.delete('/:id', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const poll = await prisma.poll.findUnique({ where: { id }, select: { authorId: true } })
  if (!poll) throw ApiError.notFound('poll')
  assertOwnerOrAdmin(currentUser(req), poll.authorId)
  await prisma.poll.delete({ where: { id } })
  res.status(204).end()
})
