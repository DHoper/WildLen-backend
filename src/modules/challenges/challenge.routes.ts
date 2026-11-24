import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import type { Locale } from '../../lib/i18n'
import { currentUser, requireAdmin, requireAuth, requireVerified } from '../../middleware/auth'
import { localize } from '../community/forum'
import { photoListSelect, toPhotoSummary } from '../photos/photo.routes'

/**
 * Photo challenges. Timeline: upcoming → open (submissions) → voting → ended (results).
 * Each member may enter up to MAX_ENTRIES of their own photos and cast MAX_VOTES votes
 * (never on their own entries). Vote counts stay hidden until the challenge ends.
 */
export const MAX_ENTRIES = 3
export const MAX_VOTES = 3

export type Phase = 'upcoming' | 'open' | 'voting' | 'ended'
export const phaseOf = (c: { startsAt: Date; submitEndsAt: Date; voteEndsAt: Date }, now = Date.now()): Phase =>
  now < c.startsAt.getTime() ? 'upcoming' : now < c.submitEndsAt.getTime() ? 'open' : now < c.voteEndsAt.getTime() ? 'voting' : 'ended'

const PHASE_ORDER: Record<Phase, number> = { open: 0, voting: 1, upcoming: 2, ended: 3 }

const localized = z.object({ 'zh-TW': z.string().trim().min(1).max(200), en: z.string().trim().min(1).max(200) })
const localizedLong = z.object({ 'zh-TW': z.string().trim().min(1).max(2000), en: z.string().trim().min(1).max(2000) })
/** Challenge fields without the timeline check, so the admin PATCH can use `.partial()`. */
export const challengeFields = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{3,60}$/),
  title: localized,
  brief: localizedLong,
  rules: z.object({ 'zh-TW': z.array(z.string().max(300)).max(10), en: z.array(z.string().max(300)).max(10) }),
  coverUrl: z.url(),
  coverPosition: z.string().regex(/^\d{1,3}% \d{1,3}%$/).optional(),
  startsAt: z.coerce.date(),
  submitEndsAt: z.coerce.date(),
  voteEndsAt: z.coerce.date(),
  speciesGroup: z.enum(['BIRD', 'MAMMAL', 'REPTILE', 'AMPHIBIAN', 'FISH', 'INSECT', 'OTHER']).nullable().optional()
})
export const validTimeline = (c: { startsAt: Date; submitEndsAt: Date; voteEndsAt: Date }) =>
  c.startsAt < c.submitEndsAt && c.submitEndsAt < c.voteEndsAt
const challengeBody = challengeFields.refine(validTimeline, { message: 'validation.challenge_timeline', path: ['voteEndsAt'] })

const entriesQuery = paginationQuery.extend({
  sort: z.enum(['recent', 'top']).default('recent'),
  pageSize: z.coerce.number().int().min(1).max(48).default(24)
})
const entryBody = z.object({ photoId: z.number().int().positive() })
const slugParam = z.object({ slug: z.string().trim().max(60) })
const entryParam = slugParam.extend({ entryId: z.coerce.number().int().positive() })

type ChallengeRow = Prisma.ChallengeGetPayload<{ include: { _count: { select: { entries: true } } } }>

const present = (c: ChallengeRow, locale: Locale, extra: { participants: number }) => ({
  id: c.id,
  slug: c.slug,
  title: localize(c.title, locale),
  brief: localize(c.brief, locale),
  coverUrl: c.coverUrl,
  coverPosition: c.coverPosition,
  startsAt: c.startsAt,
  submitEndsAt: c.submitEndsAt,
  voteEndsAt: c.voteEndsAt,
  speciesGroup: c.speciesGroup,
  phase: phaseOf(c),
  entryCount: c._count.entries,
  participantCount: extra.participants
})

const loadChallenge = async (slug: string) => {
  const c = await prisma.challenge.findUnique({ where: { slug }, include: { _count: { select: { entries: true } } } })
  if (!c) throw ApiError.notFound('challenge')
  return c
}

const participantCounts = async (ids: number[]) => {
  if (!ids.length) return new Map<number, number>()
  const rows = await prisma.challengeEntry.groupBy({ by: ['challengeId', 'userId'], where: { challengeId: { in: ids } } })
  const m = new Map<number, number>()
  for (const r of rows) m.set(r.challengeId, (m.get(r.challengeId) ?? 0) + 1)
  return m
}

/** Entries ranked by votes (ties: earlier entry first). Only meaningful once a challenge ends. */
const rankedEntryIds = async (challengeId: number, take: number) => {
  const rows = await prisma.challengeEntry.findMany({
    where: { challengeId },
    select: { id: true, createdAt: true, _count: { select: { votes: true } } },
    orderBy: [{ votes: { _count: 'desc' } }, { createdAt: 'asc' }],
    take
  })
  return rows.map((r) => ({ id: r.id, votes: r._count.votes }))
}

const entrySelect = {
  id: true,
  createdAt: true,
  userId: true,
  photoPost: { select: photoListSelect },
  _count: { select: { votes: true } }
} satisfies Prisma.ChallengeEntrySelect

export const challengeRoutes = Router()

challengeRoutes.get('/', async (req, res) => {
  const rows = await prisma.challenge.findMany({ include: { _count: { select: { entries: true } } }, orderBy: { startsAt: 'desc' } })
  const participants = await participantCounts(rows.map((r) => r.id))
  const items = await Promise.all(
    rows.map(async (c) => {
      const base = present(c, req.locale, { participants: participants.get(c.id) ?? 0 })
      // Winners for finished challenges; a few recent entries otherwise (for card previews).
      const preview =
        base.phase === 'ended'
          ? (await rankedEntryIds(c.id, 3)).map((r) => r.id)
          : (await prisma.challengeEntry.findMany({ where: { challengeId: c.id }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 4 })).map((r) => r.id)
      const entries = preview.length
        ? await prisma.challengeEntry.findMany({ where: { id: { in: preview } }, select: { id: true, photoPost: { select: { id: true, images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 } } } } })
        : []
      const byId = new Map(entries.map((e) => [e.id, e]))
      return {
        ...base,
        preview: preview.flatMap((id) => {
          const e = byId.get(id)
          return e ? [{ entryId: e.id, photoId: e.photoPost.id, url: e.photoPost.images[0]?.url ?? null }] : []
        })
      }
    })
  )
  items.sort((a, b) => PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || (a.phase === 'ended' ? b.voteEndsAt.getTime() - a.voteEndsAt.getTime() : a.startsAt.getTime() - b.startsAt.getTime()))
  res.json(items)
})

challengeRoutes.get('/:slug', async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const c = await loadChallenge(slug)
  const participants = await participantCounts([c.id])
  const viewerId = req.user?.id
  const [myEntries, myVotes] = viewerId
    ? await Promise.all([
        prisma.challengeEntry.findMany({ where: { challengeId: c.id, userId: viewerId }, select: { id: true, photoPostId: true } }),
        prisma.challengeVote.findMany({ where: { challengeId: c.id, userId: viewerId }, select: { entryId: true } })
      ])
    : [[], []]
  const rules = (c.rules ?? {}) as Partial<Record<Locale, string[]>>
  res.json({
    ...present(c, req.locale, { participants: participants.get(c.id) ?? 0 }),
    rules: rules[req.locale] ?? rules['zh-TW'] ?? [],
    limits: { entries: MAX_ENTRIES, votes: MAX_VOTES },
    me: viewerId
      ? { entries: myEntries.map((e) => ({ entryId: e.id, photoId: e.photoPostId })), votes: myVotes.map((v) => v.entryId) }
      : null
  })
})

challengeRoutes.get('/:slug/entries', async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const q = parse(entriesQuery, req.query)
  const c = await loadChallenge(slug)
  const phase = phaseOf(c)
  const revealVotes = phase === 'ended' || req.user?.role === 'ADMIN'
  const where = { challengeId: c.id }
  const orderBy: Prisma.ChallengeEntryOrderByWithRelationInput[] =
    q.sort === 'top' && revealVotes ? [{ votes: { _count: 'desc' } }, { createdAt: 'asc' }] : [{ createdAt: 'desc' }]
  const [rows, total, ranked, myVotes] = await Promise.all([
    prisma.challengeEntry.findMany({ where, select: entrySelect, orderBy, ...toSkipTake(q) }),
    prisma.challengeEntry.count({ where }),
    phase === 'ended' ? rankedEntryIds(c.id, 3) : Promise.resolve([]),
    req.user ? prisma.challengeVote.findMany({ where: { challengeId: c.id, userId: req.user.id }, select: { entryId: true } }) : Promise.resolve([])
  ])
  const rank = new Map(ranked.map((r, i) => [r.id, i + 1]))
  const voted = new Set(myVotes.map((v) => v.entryId))
  res.json(
    paginated(
      rows.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        photo: toPhotoSummary(e.photoPost, req.user, req.locale),
        voteCount: revealVotes ? e._count.votes : null,
        rank: rank.get(e.id) ?? null,
        votedByMe: voted.has(e.id),
        mine: e.userId === req.user?.id
      })),
      total,
      q
    )
  )
})

challengeRoutes.post('/:slug/entries', requireVerified, async (req, res) => {
  const { slug } = parse(slugParam, req.params)
  const { photoId } = parse(entryBody, req.body)
  const user = currentUser(req)
  const c = await loadChallenge(slug)
  if (phaseOf(c) !== 'open') throw ApiError.badRequest('challenge.not_open')
  const photo = await prisma.photoPost.findUnique({ where: { id: photoId }, select: { authorId: true, species: { select: { group: true } } } })
  if (!photo || photo.authorId !== user.id) throw ApiError.badRequest('challenge.not_your_photo')
  if (c.speciesGroup && photo.species?.group !== c.speciesGroup) throw ApiError.badRequest('challenge.wrong_group')
  const mine = await prisma.challengeEntry.count({ where: { challengeId: c.id, userId: user.id } })
  if (mine >= MAX_ENTRIES) throw ApiError.badRequest('challenge.entry_limit', { n: MAX_ENTRIES })
  const exists = await prisma.challengeEntry.findUnique({ where: { challengeId_photoPostId: { challengeId: c.id, photoPostId: photoId } } })
  if (exists) throw ApiError.conflict('challenge.already_entered')
  const entry = await prisma.challengeEntry.create({ data: { challengeId: c.id, photoPostId: photoId, userId: user.id }, select: { id: true } })
  res.status(201).json(entry)
})

challengeRoutes.delete('/:slug/entries/:entryId', requireAuth, async (req, res) => {
  const { slug, entryId } = parse(entryParam, req.params)
  const user = currentUser(req)
  const c = await loadChallenge(slug)
  const entry = await prisma.challengeEntry.findUnique({ where: { id: entryId }, select: { challengeId: true, userId: true } })
  if (!entry || entry.challengeId !== c.id) throw ApiError.notFound('challenge')
  const admin = user.role === 'ADMIN'
  if (!admin && entry.userId !== user.id) throw ApiError.forbidden()
  if (!admin && phaseOf(c) !== 'open') throw ApiError.badRequest('challenge.not_open')
  await prisma.challengeEntry.delete({ where: { id: entryId } })
  res.status(204).end()
})

challengeRoutes.put('/:slug/entries/:entryId/vote', requireAuth, async (req, res) => {
  const { slug, entryId } = parse(entryParam, req.params)
  const user = currentUser(req)
  const c = await loadChallenge(slug)
  if (phaseOf(c) !== 'voting') throw ApiError.badRequest('challenge.not_voting')
  const entry = await prisma.challengeEntry.findUnique({ where: { id: entryId }, select: { challengeId: true, userId: true } })
  if (!entry || entry.challengeId !== c.id) throw ApiError.notFound('challenge')
  if (entry.userId === user.id) throw ApiError.badRequest('challenge.own_entry')
  const already = await prisma.challengeVote.findUnique({ where: { entryId_userId: { entryId, userId: user.id } } })
  if (!already) {
    const used = await prisma.challengeVote.count({ where: { challengeId: c.id, userId: user.id } })
    if (used >= MAX_VOTES) throw ApiError.badRequest('challenge.vote_limit', { n: MAX_VOTES })
    await prisma.challengeVote.create({ data: { entryId, userId: user.id, challengeId: c.id } })
  }
  const votesLeft = MAX_VOTES - (await prisma.challengeVote.count({ where: { challengeId: c.id, userId: user.id } }))
  res.json({ voted: true, votesLeft })
})

challengeRoutes.delete('/:slug/entries/:entryId/vote', requireAuth, async (req, res) => {
  const { slug, entryId } = parse(entryParam, req.params)
  const user = currentUser(req)
  const c = await loadChallenge(slug)
  if (phaseOf(c) !== 'voting') throw ApiError.badRequest('challenge.not_voting')
  await prisma.challengeVote.deleteMany({ where: { entryId, userId: user.id, challengeId: c.id } })
  const votesLeft = MAX_VOTES - (await prisma.challengeVote.count({ where: { challengeId: c.id, userId: user.id } }))
  res.json({ voted: false, votesLeft })
})

// ── Admin ──
challengeRoutes.post('/', requireAdmin, async (req, res) => {
  const data = parse(challengeBody, req.body)
  if (await prisma.challenge.findUnique({ where: { slug: data.slug }, select: { id: true } })) throw ApiError.conflict('challenge.slug_taken')
  const c = await prisma.challenge.create({ data, select: { id: true, slug: true } })
  res.status(201).json(c)
})
