import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { authorSelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { challengeFields, phaseOf, validTimeline, type Phase } from '../challenges/challenge.routes'

/**
 * Admin management for challenges, field trips and forum boards. Mounted under
 * /admin (requireAdmin already applied). Unlike the public routes, these return the
 * raw `{ 'zh-TW', en }` values so both languages can be edited side by side.
 */

// ── Challenges ───────────────────────────────────────────────────────────────

export const adminChallengeRoutes = Router()

const challengeListQuery = paginationQuery.extend({
  phase: z.enum(['upcoming', 'open', 'voting', 'ended']).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
})

const loadChallenge = async (id: number) => {
  const c = await prisma.challenge.findUnique({ where: { id } })
  if (!c) throw ApiError.notFound('challenge')
  return c
}

adminChallengeRoutes.get('/', async (req, res) => {
  const query = parse(challengeListQuery, req.query)
  const rows = await prisma.challenge.findMany({
    include: { _count: { select: { entries: true } } },
    orderBy: { startsAt: 'desc' }
  })
  const [participants, votes] = await Promise.all([
    prisma.challengeEntry.groupBy({ by: ['challengeId', 'userId'] }),
    prisma.challengeVote.groupBy({ by: ['challengeId'], _count: { _all: true } })
  ])
  const participantCount = new Map<number, number>()
  for (const p of participants) participantCount.set(p.challengeId, (participantCount.get(p.challengeId) ?? 0) + 1)
  const voteCount = new Map(votes.map((v) => [v.challengeId, v._count._all]))

  const items = rows
    .map(({ _count, ...c }) => ({
      ...c,
      phase: phaseOf(c) as Phase,
      entryCount: _count.entries,
      participantCount: participantCount.get(c.id) ?? 0,
      voteCount: voteCount.get(c.id) ?? 0
    }))
    .filter((c) => !query.phase || c.phase === query.phase)
  const { skip, take } = toSkipTake(query)
  res.json(paginated(items.slice(skip, skip + take), items.length, query))
})

adminChallengeRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const c = await loadChallenge(id)
  res.json({ ...c, phase: phaseOf(c) })
})

adminChallengeRoutes.post('/', async (req, res) => {
  const data = parse(challengeFields.refine(validTimeline, { message: 'validation.challenge_timeline', path: ['voteEndsAt'] }), req.body)
  if (await prisma.challenge.findUnique({ where: { slug: data.slug }, select: { id: true } })) throw ApiError.conflict('challenge.slug_taken')
  const c = await prisma.challenge.create({ data, select: { id: true, slug: true } })
  res.status(201).json(c)
})

adminChallengeRoutes.patch('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const data = parse(challengeFields.partial(), req.body)
  const current = await loadChallenge(id)
  const merged = { ...current, ...data }
  if (!validTimeline(merged)) throw ApiError.badRequest('validation.challenge_timeline')
  // Once voting has begun, entries are fixed: moving the submission deadline or the
  // group restriction would change which entries are valid.
  const phase = phaseOf(current)
  if (
    (phase === 'voting' || phase === 'ended') &&
    ((data.submitEndsAt && data.submitEndsAt.getTime() !== current.submitEndsAt.getTime()) ||
      (data.speciesGroup !== undefined && data.speciesGroup !== current.speciesGroup))
  ) {
    throw ApiError.badRequest('admin.challenge_has_votes')
  }
  if (data.slug && data.slug !== current.slug) {
    if (await prisma.challenge.findUnique({ where: { slug: data.slug }, select: { id: true } })) throw ApiError.conflict('challenge.slug_taken')
  }
  const c = await prisma.challenge.update({ where: { id }, data, select: { id: true, slug: true } })
  res.json(c)
})

adminChallengeRoutes.delete('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await loadChallenge(id)
  // Entries and votes cascade; the photos themselves are untouched.
  await prisma.challenge.delete({ where: { id } })
  res.status(204).end()
})

// ── Field trips ──────────────────────────────────────────────────────────────

export const adminTripRoutes = Router()

const tripListQuery = paginationQuery.extend({
  status: z.enum(['upcoming', 'past', 'cancelled', 'all']).default('all'),
  q: z.string().trim().max(100).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
})

adminTripRoutes.get('/', async (req, res) => {
  const query = parse(tripListQuery, req.query)
  const now = new Date()
  const where: Prisma.TripWhereInput = {
    ...(query.status === 'upcoming' && { cancelled: false, endsAt: { gte: now } }),
    ...(query.status === 'past' && { cancelled: false, endsAt: { lt: now } }),
    ...(query.status === 'cancelled' && { cancelled: true }),
    ...(query.q && {
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { meetingPoint: { contains: query.q, mode: 'insensitive' } }
      ]
    })
  }
  const [rows, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        meetingPoint: true,
        latitude: true,
        longitude: true,
        capacity: true,
        difficulty: true,
        language: true,
        cancelled: true,
        discussionId: true,
        createdAt: true,
        organizer: { select: authorSelect },
        _count: { select: { photos: true } }
      },
      orderBy: { startsAt: query.status === 'past' ? 'desc' : 'asc' },
      ...toSkipTake(query)
    }),
    prisma.trip.count({ where })
  ])
  const members = rows.length
    ? await prisma.tripMember.groupBy({ by: ['tripId', 'status'], where: { tripId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
    : []
  const count = (tripId: number, status: 'GOING' | 'WAITLIST') =>
    members.find((m) => m.tripId === tripId && m.status === status)?._count._all ?? 0
  const items = rows.map(({ _count, ...t }) => ({
    ...t,
    goingCount: count(t.id, 'GOING'),
    waitlistCount: count(t.id, 'WAITLIST'),
    photoCount: _count.photos
  }))
  res.json(paginated(items, total, query))
})

/** Hard delete (spam, abuse). Normal cancellation goes through POST /trips/:id/cancel. */
adminTripRoutes.delete('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const trip = await prisma.trip.findUnique({ where: { id }, select: { discussionId: true } })
  if (!trip) throw ApiError.notFound('trip')
  await prisma.$transaction(async (tx) => {
    await tx.trip.delete({ where: { id } })
    // The discussion thread was generated for the trip; it goes with it.
    if (trip.discussionId) await tx.communityPost.delete({ where: { id: trip.discussionId } })
  })
  res.status(204).end()
})

// ── Forum boards ─────────────────────────────────────────────────────────────

export const adminForumRoutes = Router()

const boardText = (max: number) => z.object({ 'zh-TW': z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) })
const boardFields = z.object({
  name: boardText(40),
  description: boardText(200),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  adminOnly: z.boolean()
})
const boardCreate = boardFields.extend({
  key: z.string().trim().regex(/^[a-z0-9-]{2,40}$/),
  adminOnly: z.boolean().default(false)
})
const keyParam = z.object({ key: z.string().trim().max(40) })

const loadBoard = async (key: string) => {
  const b = await prisma.forumCategory.findUnique({ where: { key } })
  if (!b) throw ApiError.notFound('category')
  return b
}

adminForumRoutes.get('/boards', async (_req, res) => {
  const rows = await prisma.forumCategory.findMany({ include: { _count: { select: { posts: true } } }, orderBy: { position: 'asc' } })
  res.json(rows.map(({ _count, ...b }) => ({ ...b, postCount: _count.posts })))
})

adminForumRoutes.post('/boards', async (req, res) => {
  const data = parse(boardCreate, req.body)
  if (await prisma.forumCategory.findUnique({ where: { key: data.key }, select: { id: true } })) throw ApiError.conflict('admin.board_key_taken')
  const last = await prisma.forumCategory.aggregate({ _max: { position: true } })
  const board = await prisma.forumCategory.create({
    // `icon` is a legacy emoji column; the site picks line icons by key instead.
    data: { ...data, icon: '💬', position: (last._max.position ?? 0) + 1 }
  })
  res.status(201).json(board)
})

/** Reorder: `keys` must list every board exactly once, in the new order. */
adminForumRoutes.put('/boards/order', async (req, res) => {
  const { keys } = parse(z.object({ keys: z.array(z.string().trim().max(40)).min(1).max(100) }), req.body)
  const existing = await prisma.forumCategory.findMany({ select: { key: true } })
  const all = new Set(existing.map((b) => b.key))
  if (keys.length !== all.size || new Set(keys).size !== keys.length || keys.some((k) => !all.has(k))) throw ApiError.badRequest()
  await prisma.$transaction(keys.map((key, i) => prisma.forumCategory.update({ where: { key }, data: { position: i + 1 } })))
  res.status(204).end()
})

adminForumRoutes.patch('/boards/:key', async (req, res) => {
  const { key } = parse(keyParam, req.params)
  const data = parse(boardFields.partial(), req.body)
  await loadBoard(key)
  res.json(await prisma.forumCategory.update({ where: { key }, data }))
})

/** Deleting a board with topics requires `?moveTo=<key>`; its topics move there first. */
adminForumRoutes.delete('/boards/:key', async (req, res) => {
  const { key } = parse(keyParam, req.params)
  const { moveTo } = parse(z.object({ moveTo: z.string().trim().max(40).optional() }), req.query)
  await loadBoard(key)
  const posts = await prisma.communityPost.count({ where: { categoryKey: key } })
  if (posts && !moveTo) throw new ApiError('CONFLICT', 'admin.board_has_posts', { n: posts })
  if (moveTo && (moveTo === key || !(await prisma.forumCategory.findUnique({ where: { key: moveTo }, select: { id: true } })))) {
    throw ApiError.badRequest('admin.board_move_target')
  }
  await prisma.$transaction(async (tx) => {
    if (moveTo) await tx.communityPost.updateMany({ where: { categoryKey: key }, data: { categoryKey: moveTo } })
    await tx.forumCategory.delete({ where: { key } })
  })
  res.status(204).end()
})
