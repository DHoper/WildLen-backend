import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse } from '../../lib/validate'
import { authorSelect } from '../../lib/select'
import type { Locale } from '../../lib/i18n'
import type { AuthUser } from '../../middleware/auth'
import { hiddenUserIds } from '../social/blocks'

type Localized = Record<Locale, string>
type Author = Prisma.UserGetPayload<{ select: typeof authorSelect }>

/** Picks the request's language from a `{ 'zh-TW', en }` JSON value. */
export const localize = (value: Prisma.JsonValue, locale: Locale): string => {
  const v = (value ?? {}) as Partial<Localized>
  return v[locale] ?? v['zh-TW'] ?? ''
}

export const categoryRefSelect = { key: true, name: true, color: true, icon: true } satisfies Prisma.ForumCategorySelect

/** How many recent participants a list item shows. */
const PARTICIPANTS = 5

/**
 * Who has been replying to each post: `lastReplier` (newest commenter) and up to five
 * distinct recent commenters other than the post's author. One query per page of posts.
 */
export const replyActivity = async (posts: { id: number; authorId: number }[], viewer?: AuthUser) => {
  const result = new Map<number, { lastReplier: Author | null; participants: Author[] }>()
  if (!posts.length) return result
  const [rows, hidden] = await Promise.all([
    prisma.$queryRaw<{ postId: number; authorId: number; last: Date }[]>`
      SELECT community_post_id AS "postId", author_id AS "authorId", MAX(created_at) AS last
      FROM comments
      WHERE community_post_id IN (${Prisma.join(posts.map((p) => p.id))})
      GROUP BY 1, 2`,
    hiddenUserIds(viewer?.id)
  ])
  const hiddenSet = new Set(hidden)
  const visible = rows.filter((r) => !hiddenSet.has(r.authorId)).sort((a, b) => b.last.getTime() - a.last.getTime())
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(visible.map((r) => r.authorId))] } },
    select: authorSelect
  })
  const byId = new Map(users.map((u) => [u.id, u]))
  for (const post of posts) {
    const mine = visible.filter((r) => r.postId === post.id)
    result.set(post.id, {
      lastReplier: (mine[0] && byId.get(mine[0].authorId)) ?? null,
      participants: mine
        .filter((r) => r.authorId !== post.authorId)
        .slice(0, PARTICIPANTS)
        .flatMap((r) => byId.get(r.authorId) ?? [])
    })
  }
  return result
}

export const forumRoutes = Router()

/** GET /community/categories — boards with post counts, in display order. */
forumRoutes.get('/categories', async (req, res) => {
  const [categories, latest] = await Promise.all([
    prisma.forumCategory.findMany({
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { ...categoryRefSelect, description: true, adminOnly: true, _count: { select: { posts: true } } }
    }),
    prisma.communityPost.groupBy({ by: ['categoryKey'], _max: { createdAt: true } })
  ])
  const latestBy = new Map(latest.map((l) => [l.categoryKey, l._max.createdAt]))
  res.json(
    categories.map((c) => ({
      key: c.key,
      name: localize(c.name, req.locale),
      description: localize(c.description, req.locale),
      color: c.color,
      icon: c.icon,
      adminOnly: c.adminOnly,
      postCount: c._count.posts,
      latestPostAt: latestBy.get(c.key) ?? null
    }))
  )
})

const topQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(7),
  limit: z.coerce.number().int().min(1).max(20).default(5)
})

/**
 * GET /community/top-contributors — forum activity in the last `days` days.
 * score = posts × 3 + replies × 1 + accepted answers × 5. An accepted answer counts in
 * the window of the answer's creation; accepting your own reply earns nothing.
 */
forumRoutes.get('/top-contributors', async (req, res) => {
  const { days, limit } = parse(topQuery, req.query)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const hidden = await hiddenUserIds(req.user?.id)
  const rows = await prisma.$queryRaw<{ userId: number; postCount: number; replyCount: number; acceptedCount: number; score: number }[]>`
    WITH p AS (
      SELECT author_id AS uid, COUNT(*)::int AS n FROM community_posts WHERE created_at >= ${since} GROUP BY 1
    ), r AS (
      SELECT author_id AS uid, COUNT(*)::int AS n FROM comments
      WHERE community_post_id IS NOT NULL AND created_at >= ${since} GROUP BY 1
    ), a AS (
      SELECT c.author_id AS uid, COUNT(*)::int AS n
      FROM community_posts cp JOIN comments c ON c.id = cp.accepted_comment_id
      WHERE c.created_at >= ${since} AND c.author_id <> cp.author_id GROUP BY 1
    ), u AS (SELECT uid FROM p UNION SELECT uid FROM r UNION SELECT uid FROM a)
    SELECT u.uid AS "userId",
           COALESCE(p.n, 0) AS "postCount",
           COALESCE(r.n, 0) AS "replyCount",
           COALESCE(a.n, 0) AS "acceptedCount",
           (COALESCE(p.n, 0) * 3 + COALESCE(r.n, 0) + COALESCE(a.n, 0) * 5)::int AS score
    FROM u LEFT JOIN p ON p.uid = u.uid LEFT JOIN r ON r.uid = u.uid LEFT JOIN a ON a.uid = u.uid
    WHERE ${hidden.length ? Prisma.sql`u.uid NOT IN (${Prisma.join(hidden)})` : Prisma.sql`TRUE`}
    ORDER BY score DESC, "acceptedCount" DESC, u.uid ASC
    LIMIT ${limit}`
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: authorSelect })
  const byId = new Map(users.map((u) => [u.id, u]))
  res.json(
    rows.flatMap(({ userId, ...stats }) => {
      const user = byId.get(userId)
      return user ? [{ user, ...stats }] : []
    })
  )
})
