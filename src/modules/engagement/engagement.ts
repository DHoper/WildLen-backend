import { Router, type Request } from 'express'
import type { NotificationType, Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { authorSelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { assertOwnerOrAdmin, currentUser, requireAuth, requireVerified } from '../../middleware/auth'
import { assertNotBlocked, hiddenUserIds, isBlockedBetween, visibleAuthor } from '../social/blocks'

/**
 * Comments, likes, bookmarks and view counters work identically for articles, photo
 * posts and community posts. Each content router mounts `engagementRoutes(kind)` to get:
 *
 *   GET    /:id/comments      list (paginated; ?threaded=1 for top-level + replies)
 *   POST   /:id/comments      add a comment / reply     (auth, verified)
 *   PUT    /:id/like          like (idempotent)         (auth)
 *   DELETE /:id/like          unlike (idempotent)       (auth)
 *   PUT    /:id/bookmark      bookmark (idempotent)     (auth)
 *   DELETE /:id/bookmark      remove bookmark           (auth)
 *   POST   /:id/views         record a view
 *
 * Stand-alone comment routes (edit, delete, like) live in `commentRoutes`.
 */
export type EngagementKind = 'article' | 'photo' | 'community'

export const FK = {
  article: 'articleId',
  photo: 'photoPostId',
  community: 'communityPostId'
} as const

const RESOURCE = { article: 'article', photo: 'photo', community: 'post' } as const

interface Target {
  authorId: number | null
  /** Forum topics can be locked against new replies. */
  locked: boolean
}

/** The target, or undefined when it doesn't exist / isn't visible to the caller. */
const loadTargetRow = async (kind: EngagementKind, id: number, req: Request): Promise<Target | undefined> => {
  switch (kind) {
    case 'article': {
      const a = await prisma.article.findUnique({ where: { id }, select: { status: true, authorId: true } })
      if (!a || (a.status !== 'PUBLISHED' && req.user?.role !== 'ADMIN')) return undefined
      return { authorId: a.authorId, locked: false }
    }
    case 'photo': {
      const p = await prisma.photoPost.findUnique({ where: { id }, select: { authorId: true } })
      return p ? { authorId: p.authorId, locked: false } : undefined
    }
    case 'community': {
      const p = await prisma.communityPost.findUnique({ where: { id }, select: { authorId: true, locked: true } })
      return p ?? undefined
    }
  }
}

const incrementViews = (kind: EngagementKind, id: number) => {
  const data = { viewCount: { increment: 1 } }
  switch (kind) {
    case 'article':
      return prisma.article.update({ where: { id }, data, select: { viewCount: true } })
    case 'photo':
      return prisma.photoPost.update({ where: { id }, data, select: { viewCount: true } })
    case 'community':
      return prisma.communityPost.update({ where: { id }, data, select: { viewCount: true } })
  }
}

/** Notifies `recipientId` unless they are the actor (or there is no recipient). */
export const notify = async (data: {
  type: NotificationType
  recipientId: number | null | undefined
  actorId: number
  photoPostId?: number
  communityPostId?: number
  articleId?: number
  commentId?: number
  tripId?: number
}) => {
  const { recipientId, ...rest } = data
  if (!recipientId || recipientId === data.actorId) return
  await prisma.notification.create({ data: { ...rest, recipientId } })
}

// ── Comment payloads ──────────────────────────────────────────────────────────

export const commentSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  edited: true,
  parentId: true,
  author: { select: authorSelect },
  _count: { select: { likes: true } }
} satisfies Prisma.CommentSelect

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>

/**
 * API shape of comments: adds `likeCount`, `likedByMe` and `isAuthor` (the comment's
 * author wrote the content it is on — the "OP" badge).
 */
export const presentComments = async (rows: CommentRow[], contentAuthorId: number | null, viewerId?: number) => {
  const liked = viewerId && rows.length
    ? new Set(
        (
          await prisma.like.findMany({
            where: { userId: viewerId, commentId: { in: rows.map((r) => r.id) } },
            select: { commentId: true }
          })
        ).map((l) => l.commentId)
      )
    : new Set<number | null>()
  return rows.map(({ _count, ...c }) => ({
    ...c,
    likeCount: _count.likes,
    likedByMe: liked.has(c.id),
    isAuthor: contentAuthorId !== null && c.author.id === contentAuthorId
  }))
}

const commentListQuery = paginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  threaded: z.enum(['1', 'true', '0', 'false']).optional(),
  sort: z.enum(['oldest', 'newest', 'top']).optional()
})

const commentOrder = (sort: 'oldest' | 'newest' | 'top'): Prisma.CommentOrderByWithRelationInput[] =>
  sort === 'top'
    ? [{ likes: { _count: 'desc' } }, { createdAt: 'asc' }, { id: 'asc' }]
    : sort === 'oldest'
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }]

const commentBody = z.object({
  content: z.string().trim().min(1, 'validation.comment_empty').max(1000),
  parentId: z.number().int().positive().nullish()
})

/** Whether the current user liked a target (false for anonymous callers). */
export const likedBy = async (kind: EngagementKind, id: number, userId?: number) => {
  if (!userId) return false
  const like = await prisma.like.findFirst({ where: { userId, [FK[kind]]: id }, select: { id: true } })
  return !!like
}

/** Whether the current user bookmarked a target (false for anonymous callers). */
export const bookmarkedBy = async (kind: EngagementKind, id: number, userId?: number) => {
  if (!userId) return false
  const row = await prisma.bookmark.findFirst({ where: { userId, [FK[kind]]: id }, select: { id: true } })
  return !!row
}

export const engagementRoutes = (kind: EngagementKind) => {
  const router = Router()
  const fk = FK[kind]

  /**
   * Reads: content by someone in a block relationship with the viewer behaves as
   * missing (404). Writes: the interaction is refused (403).
   */
  const loadTarget = async (req: Request, mode: 'read' | 'write' = 'read') => {
    const { id } = parse(idParam, req.params)
    const target = await loadTargetRow(kind, id, req)
    if (!target) throw ApiError.notFound(RESOURCE[kind])
    const { authorId } = target
    if (req.user && authorId) {
      if (mode === 'write') await assertNotBlocked(req.user.id, authorId)
      else if (await isBlockedBetween(req.user.id, authorId)) throw ApiError.notFound(RESOURCE[kind])
    }
    return { id, ...target }
  }

  const likeState = async (id: number, userId: number) => ({
    liked: await likedBy(kind, id, userId),
    likeCount: await prisma.like.count({ where: { [fk]: id } })
  })

  /**
   * Flat (default, newest first — the original behaviour) or `?threaded=1`: top-level
   * comments paginated (oldest first by default), each with all its `replies`.
   */
  router.get('/:id/comments', async (req, res) => {
    const { id, authorId } = await loadTarget(req)
    const query = parse(commentListQuery, req.query)
    const threaded = query.threaded === '1' || query.threaded === 'true'
    const sort = query.sort ?? (threaded ? 'oldest' : 'newest')
    const visible = await visibleAuthor(req.user?.id)
    const where: Prisma.CommentWhereInput = { [fk]: id, ...visible, ...(threaded && { parentId: null }) }

    const [rows, total] = await Promise.all([
      prisma.comment.findMany({ where, select: commentSelect, orderBy: commentOrder(sort), ...toSkipTake(query) }),
      prisma.comment.count({ where })
    ])
    const items = await presentComments(rows, authorId, req.user?.id)
    if (!threaded) {
      res.json(paginated(items, total, query))
      return
    }

    const replyRows = rows.length
      ? await prisma.comment.findMany({
          where: { parentId: { in: rows.map((r) => r.id) }, ...visible },
          select: commentSelect,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
        })
      : []
    const replies = await presentComments(replyRows, authorId, req.user?.id)
    res.json(
      paginated(
        items.map((c) => {
          const mine = replies.filter((r) => r.parentId === c.id)
          return { ...c, replies: mine, replyCount: mine.length }
        }),
        total,
        query
      )
    )
  })

  router.post('/:id/comments', requireVerified, async (req, res) => {
    const target = await loadTarget(req, 'write')
    const { id, authorId } = target
    const user = currentUser(req)
    if (target.locked && user.role !== 'ADMIN') throw new ApiError('POST_LOCKED', 'forum.locked')
    const { content, parentId } = parse(commentBody, req.body)

    // Replies are one level deep: replying to a reply attaches to its top-level parent,
    // while the person replied to directly is the one notified.
    let parent: { topLevelId: number; repliedToAuthorId: number } | null = null
    if (parentId) {
      const row = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, authorId: true, parentId: true, articleId: true, photoPostId: true, communityPostId: true }
      })
      if (!row || row[fk] !== id) throw ApiError.badRequest('comment.parent_mismatch')
      await assertNotBlocked(user.id, row.authorId)
      parent = { topLevelId: row.parentId ?? row.id, repliedToAuthorId: row.authorId }
    }

    const comment = await prisma.comment.create({
      data: { content, authorId: user.id, [fk]: id, parentId: parent?.topLevelId ?? null },
      select: commentSelect
    })
    if (kind === 'community') {
      await prisma.communityPost.update({ where: { id }, data: { lastActivityAt: comment.createdAt } })
    }
    await notify({ type: 'COMMENT', recipientId: authorId, actorId: user.id, [fk]: id, commentId: comment.id })
    if (parent && parent.repliedToAuthorId !== authorId) {
      await notify({ type: 'COMMENT', recipientId: parent.repliedToAuthorId, actorId: user.id, [fk]: id, commentId: comment.id })
    }
    const [item] = await presentComments([comment], authorId, user.id)
    res.status(201).json(item)
  })

  router.put('/:id/like', requireAuth, async (req, res) => {
    const { id, authorId } = await loadTarget(req, 'write')
    const userId = currentUser(req).id
    // createMany + skipDuplicates makes this idempotent without a race on the unique index.
    const { count } = await prisma.like.createMany({ data: [{ userId, [fk]: id }], skipDuplicates: true })
    // Only a like that was actually created notifies (repeat PUTs are no-ops).
    if (count > 0) await notify({ type: 'LIKE', recipientId: authorId, actorId: userId, [fk]: id })
    res.json(await likeState(id, userId))
  })

  router.delete('/:id/like', requireAuth, async (req, res) => {
    const { id } = await loadTarget(req)
    const userId = currentUser(req).id
    const { count } = await prisma.like.deleteMany({ where: { userId, [fk]: id } })
    if (count > 0) {
      await prisma.notification.deleteMany({ where: { type: 'LIKE', actorId: userId, [fk]: id, readAt: null } })
    }
    res.json(await likeState(id, userId))
  })

  router.put('/:id/bookmark', requireAuth, async (req, res) => {
    const { id } = await loadTarget(req, 'write')
    await prisma.bookmark.createMany({ data: [{ userId: currentUser(req).id, [fk]: id }], skipDuplicates: true })
    res.json({ bookmarked: true })
  })

  router.delete('/:id/bookmark', requireAuth, async (req, res) => {
    const { id } = parse(idParam, req.params)
    await prisma.bookmark.deleteMany({ where: { userId: currentUser(req).id, [fk]: id } })
    res.json({ bookmarked: false })
  })

  router.post('/:id/views', async (req, res) => {
    const { id } = await loadTarget(req)
    res.json(await incrementViews(kind, id))
  })

  return router
}

// ── Stand-alone comment routes: /api/v1/comments/:id ──────────────────────────

/** A comment with what's needed to authorize actions on it. */
const loadComment = async (id: number) => {
  const comment = await prisma.comment.findUnique({
    where: { id },
    select: {
      authorId: true,
      article: { select: { authorId: true, status: true } },
      photoPost: { select: { authorId: true } },
      communityPost: { select: { authorId: true } }
    }
  })
  if (!comment) throw ApiError.notFound('comment')
  const contentAuthorId = comment.article?.authorId ?? comment.photoPost?.authorId ?? comment.communityPost?.authorId ?? null
  return { ...comment, contentAuthorId }
}

const editBody = z.object({ content: commentBody.shape.content })

export const commentRoutes = Router()

commentRoutes.patch('/:id', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const { content } = parse(editBody, req.body)
  const comment = await loadComment(id)
  assertOwnerOrAdmin(user, comment.authorId)
  const row = await prisma.comment.update({ where: { id }, data: { content, edited: true }, select: commentSelect })
  const [item] = await presentComments([row], comment.contentAuthorId, user.id)
  res.json(item)
})

commentRoutes.delete('/:id', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const comment = await prisma.comment.findUnique({ where: { id }, select: { authorId: true } })
  if (!comment) throw ApiError.notFound('comment')
  assertOwnerOrAdmin(currentUser(req), comment.authorId)
  await prisma.comment.delete({ where: { id } })
  res.status(204).end()
})

const commentLikeState = async (commentId: number, userId: number) => ({
  liked: !!(await prisma.like.findFirst({ where: { userId, commentId }, select: { id: true } })),
  likeCount: await prisma.like.count({ where: { commentId } })
})

/** Likes are refused (403) between users in a block relationship, in either direction. */
commentRoutes.put('/:id/like', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const comment = await loadComment(id)
  if (comment.article && comment.article.status !== 'PUBLISHED' && user.role !== 'ADMIN') throw ApiError.notFound('comment')
  const hidden = await hiddenUserIds(user.id)
  if (hidden.includes(comment.authorId) || (comment.contentAuthorId && hidden.includes(comment.contentAuthorId))) {
    throw ApiError.forbidden('block.blocked')
  }
  await prisma.like.createMany({ data: [{ userId: user.id, commentId: id }], skipDuplicates: true })
  res.json(await commentLikeState(id, user.id))
})

commentRoutes.delete('/:id/like', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  await prisma.like.deleteMany({ where: { userId: user.id, commentId: id } })
  res.json(await commentLikeState(id, user.id))
})
