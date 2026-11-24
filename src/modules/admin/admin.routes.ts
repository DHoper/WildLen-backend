import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam, tagList } from '../../lib/schemas'
import { authorSelect, privateUserSelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { currentUser, requireAdmin } from '../../middleware/auth'
import { avatarSchema, emailSchema, passwordSchema, usernameSchema } from '../auth/auth.routes'
import { deleteAccount } from '../users/account.service'
import { adminReportRoutes } from '../reports/report.routes'
import { adminChallengeRoutes, adminForumRoutes, adminTripRoutes } from './admin.activities'
import { adminGearRoutes } from './admin.gear'
import { adminPlaceRoutes } from './admin.places'
import { adminOutingRoutes } from './admin.outings'
import { unmatchedGearStrings } from '../gear/normalize'
import { phaseOf } from '../challenges/challenge.routes'

export const adminRoutes = Router()
adminRoutes.use(requireAdmin)

// ── Dashboard ────────────────────────────────────────────────────────────────

const DAYS = 30

/** Daily row counts for the last DAYS days, zero-filled. */
const dailySeries = async (table: 'users' | 'photo_posts' | 'community_posts' | 'comments') => {
  const rows = await prisma.$queryRaw<{ day: Date; count: bigint }[]>(Prisma.sql`
    SELECT date_trunc('day', created_at) AS day, COUNT(*)::bigint AS count
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE created_at >= now() - (${DAYS} * interval '1 day')
    GROUP BY 1`)
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.count)]))
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - (DAYS - 1 - i))
    const key = d.toISOString().slice(0, 10)
    return { date: key, count: byDay.get(key) ?? 0 }
  })
}

adminRoutes.get('/stats', async (_req, res) => {
  const [users, articles, photos, posts, polls, comments, likes, openReports] = await Promise.all([
    prisma.user.count(),
    prisma.article.count(),
    prisma.photoPost.count(),
    prisma.communityPost.count(),
    prisma.poll.count(),
    prisma.comment.count(),
    prisma.like.count(),
    prisma.report.count({ where: { status: 'OPEN' } })
  ])
  const [userSeries, photoSeries, postSeries, commentSeries] = await Promise.all([
    dailySeries('users'),
    dailySeries('photo_posts'),
    dailySeries('community_posts'),
    dailySeries('comments')
  ])
  const now = new Date()
  const [challenges, upcomingTrips, needsId, unmatched, proposedPlaces] = await Promise.all([
    prisma.challenge.findMany({ select: { startsAt: true, submitEndsAt: true, voteEndsAt: true } }),
    prisma.trip.count({ where: { cancelled: false, endsAt: { gte: now } } }),
    prisma.photoPost.count({ where: { quality: 'NEEDS_ID' } }),
    unmatchedGearStrings(200),
    prisma.place.count({ where: { status: 'PROPOSED' } })
  ])
  const activeChallenges = challenges.filter((c) => ['open', 'voting'].includes(phaseOf(c))).length
  const [recentUsers, topArticles] = await Promise.all([
    prisma.user.findMany({ select: privateUserSelect, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.article.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true, viewCount: true, _count: { select: { likes: true, comments: true } } },
      orderBy: { viewCount: 'desc' },
      take: 5
    })
  ])

  res.json({
    totals: { users, articles, photos, posts, polls, comments, likes, openReports },
    activity: { activeChallenges, upcomingTrips, needsId, unmatchedGear: unmatched.length, proposedPlaces },
    series: userSeries.map((u, i) => ({
      date: u.date,
      users: u.count,
      photos: photoSeries[i]?.count ?? 0,
      posts: postSeries[i]?.count ?? 0,
      comments: commentSeries[i]?.count ?? 0
    })),
    recentUsers,
    topArticles: topArticles.map(({ _count, ...a }) => ({
      ...a,
      likeCount: _count.likes,
      commentCount: _count.comments
    }))
  })
})

// ── Users ────────────────────────────────────────────────────────────────────

const userListQuery = paginationQuery.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(['USER', 'ADMIN']).optional()
})

const userUpdateBody = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    role: z.enum(['USER', 'ADMIN']),
    avatarIndex: avatarSchema,
    bio: z.string().trim().max(300).nullable(),
    interests: tagList
  })
  .partial()

adminRoutes.get('/users', async (req, res) => {
  const query = parse(userListQuery, req.query)
  const where: Prisma.UserWhereInput = {
    ...(query.role && { role: query.role }),
    ...(query.q && {
      OR: [
        { email: { contains: query.q, mode: 'insensitive' } },
        { username: { contains: query.q, mode: 'insensitive' } }
      ]
    })
  }
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        ...privateUserSelect,
        _count: { select: { photoPosts: true, communityPosts: true, comments: true } }
      },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query)
    }),
    prisma.user.count({ where })
  ])
  const items = rows.map(({ _count, ...u }) => ({
    ...u,
    photoCount: _count.photoPosts,
    postCount: _count.communityPosts,
    commentCount: _count.comments
  }))
  res.json(paginated(items, total, query))
})

adminRoutes.get('/users/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const user = await prisma.user.findUnique({ where: { id }, select: privateUserSelect })
  if (!user) throw ApiError.notFound('user')
  res.json(user)
})

/** System accounts (e.g. the iNaturalist import owner) hold imported records and must stay intact. */
const assertNotSystem = async (id: number) => {
  const u = await prisma.user.findUnique({ where: { id }, select: { system: true } })
  if (u?.system) throw ApiError.badRequest('admin.system_account')
}

adminRoutes.patch('/users/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await assertNotSystem(id)
  const data = parse(userUpdateBody, req.body)
  if (id === currentUser(req).id && data.role === 'USER') {
    throw ApiError.badRequest('admin.cannot_demote_self')
  }
  if (data.email) {
    const taken = await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })
    if (taken) throw ApiError.conflict('admin.email_taken')
  }
  const user = await prisma.user.update({ where: { id }, data, select: privateUserSelect })
  res.json(user)
})

adminRoutes.put('/users/:id/password', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await assertNotSystem(id)
  const { password } = parse(z.object({ password: passwordSchema }), req.body)
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 12) } })
  res.status(204).end()
})

adminRoutes.delete('/users/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await assertNotSystem(id)
  if (id === currentUser(req).id) throw ApiError.badRequest('admin.cannot_delete_self')
  if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw ApiError.notFound('user')
  await deleteAccount(id)
  res.status(204).end()
})

// ── Comments moderation ──────────────────────────────────────────────────────

adminRoutes.get('/comments', async (req, res) => {
  const query = parse(paginationQuery.extend({ q: z.string().trim().max(100).optional() }), req.query)
  const where: Prisma.CommentWhereInput = query.q
    ? { content: { contains: query.q, mode: 'insensitive' } }
    : {}
  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: { select: authorSelect },
        article: { select: { id: true, title: true } },
        photoPost: { select: { id: true, title: true } },
        communityPost: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query)
    }),
    prisma.comment.count({ where })
  ])
  const items = rows.map(({ article, photoPost, communityPost, ...c }) => ({
    ...c,
    target: article
      ? { type: 'article' as const, ...article }
      : photoPost
        ? { type: 'photo' as const, ...photoPost }
        : communityPost
          ? { type: 'community' as const, ...communityPost }
          : null
  }))
  res.json(paginated(items, total, query))
})

// ── Reports (moderation queue) ───────────────────────────────────────────────

adminRoutes.use('/reports', adminReportRoutes)

// ── Challenges, field trips, forum boards ────────────────────────────────────

adminRoutes.use('/challenges', adminChallengeRoutes)
adminRoutes.use('/trips', adminTripRoutes)
adminRoutes.use('/forum', adminForumRoutes)
adminRoutes.use('/gear', adminGearRoutes)
adminRoutes.use('/places', adminPlaceRoutes)
adminRoutes.use('/outings', adminOutingRoutes)
