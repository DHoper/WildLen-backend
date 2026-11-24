import { Router, type Request } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { deltaSchema, idParam, localeSchema, searchQuery, tagList } from '../../lib/schemas'
import { detectLanguage } from '../../lib/language'
import { gearRefSelect } from '../gear/refs'
import { authorSelect, engagementCount, withCounts } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { deltaImageUrls, deltaToExcerpt } from '../../lib/delta'
import type { Locale } from '../../lib/i18n'
import type { AuthUser } from '../../middleware/auth'
import { assertOwnerOrAdmin, currentUser, requireAdmin, requireAuth, requireVerified } from '../../middleware/auth'
import { bookmarkedBy, engagementRoutes, likedBy, notify } from '../engagement/engagement'
import { deleteImagesFor, syncImagesByUrl } from '../images/image.service'
import { assertVisible, visibleAuthor } from '../social/blocks'
import { categoryRefSelect, localize, replyActivity } from './forum'

const typeSchema = z.enum(['DISCUSSION', 'QUESTION'])

// Note: zod 4 applies `.default()` even inside `.partial()`, so defaults live only on
// the create schema — otherwise a PATCH would silently reset omitted fields.
const postFields = z.object({
  title: z.string().trim().min(2).max(60),
  content: deltaSchema.refine((d) => deltaToExcerpt(d).length >= 5, 'validation.content_min'),
  tags: tagList,
  categoryKey: z.string().trim().min(1).max(40),
  type: typeSchema,
  /** Gear the topic is about (catalogue ids). */
  gearIds: z.array(z.number().int().positive()).max(5)
})
const postCreate = postFields.extend({ tags: tagList.default([]), type: typeSchema.default('DISCUSSION'), gearIds: postFields.shape.gearIds.default([]) })
const postUpdate = postFields.partial()

const listQuery = paginationQuery.merge(searchQuery).extend({
  category: z.string().trim().max(40).optional(),
  type: typeSchema.optional(),
  filter: z.enum(['unanswered', 'solved', 'unsolved']).optional(),
  sort: z.enum(['activity', 'latest', 'popular']).default('activity'),
  /** Topics tagged with this gear (catalogue slug). */
  gear: z.string().trim().max(120).optional(),
  /** Only posts written in this language. */
  language: localeSchema.optional()
})

const moderationBody = z.object({ pinned: z.boolean().optional(), locked: z.boolean().optional() })
const acceptBody = z.object({ commentId: z.number().int().positive() })

export const communityListSelect = {
  id: true,
  title: true,
  gear: { select: { gear: { select: gearRefSelect } } },
  language: true,
  excerpt: true,
  tags: true,
  type: true,
  pinned: true,
  locked: true,
  acceptedCommentId: true,
  lastActivityAt: true,
  viewCount: true,
  edited: true,
  createdAt: true,
  updatedAt: true,
  author: { select: authorSelect },
  category: { select: categoryRefSelect },
  images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 },
  ...engagementCount
} satisfies Prisma.CommunityPostSelect

type ListRow = Prisma.CommunityPostGetPayload<{ select: typeof communityListSelect }>

/** List items for a page of posts (adds forum activity: lastReplier, participants). */
export const summarizePosts = async (rows: ListRow[], viewer: AuthUser | undefined, locale: Locale) => {
  const activity = await replyActivity(rows.map((r) => ({ id: r.id, authorId: r.author.id })), viewer)
  return rows.map((row) => {
    const { images, category, acceptedCommentId, gear, ...rest } = withCounts(row)
    return {
      ...rest,
      gear: gear.map((g) => g.gear),
      category: { ...category, name: localize(category.name, locale) },
      solved: acceptedCommentId !== null,
      replyCount: rest.commentCount,
      lastReplier: activity.get(row.id)?.lastReplier ?? null,
      participants: activity.get(row.id)?.participants ?? [],
      coverUrl: images[0]?.url ?? null
    }
  })
}

/** Full post payload (GET /:id, and the result of accept / moderation). */
const loadDetail = async (id: number, req: Request) => {
  const post = await prisma.communityPost.findUnique({ where: { id }, select: { ...communityListSelect, content: true } })
  if (!post) throw ApiError.notFound('post')
  await assertVisible(req.user?.id, post.author.id, 'post')
  const [[summary], likedByMe, bookmarkedByMe] = await Promise.all([
    summarizePosts([post], req.user, req.locale),
    likedBy('community', id, req.user?.id),
    bookmarkedBy('community', id, req.user?.id)
  ])
  return { ...summary!, acceptedCommentId: post.acceptedCommentId, content: post.content, likedByMe, bookmarkedByMe }
}

/** Keeps only ids that exist in the gear catalogue (unknown ids are ignored). */
const validGearIds = async (ids: number[]) =>
  ids.length ? (await prisma.gear.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true } })).map((g) => g.id) : []

/** Validates the board and that the user may post on it. */
const assertCategory = async (key: string, user: AuthUser) => {
  const category = await prisma.forumCategory.findUnique({ where: { key }, select: { adminOnly: true } })
  if (!category) throw ApiError.badRequest('forum.unknown_category')
  if (category.adminOnly && user.role !== 'ADMIN') throw ApiError.forbidden('forum.admin_only')
}

export const communityRoutes = Router()

communityRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  const filter: Prisma.CommunityPostWhereInput =
    query.filter === 'unanswered'
      ? { comments: { none: {} } }
      : query.filter === 'solved'
        ? { type: 'QUESTION', acceptedCommentId: { not: null } }
        : query.filter === 'unsolved'
          ? { type: 'QUESTION', acceptedCommentId: null }
          : {}
  const where: Prisma.CommunityPostWhereInput = {
    AND: [
      await visibleAuthor(req.user?.id),
      filter,
      query.category ? { categoryKey: query.category } : {},
      query.gear ? { gear: { some: { gear: { slug: query.gear } } } } : {},
      query.language ? { language: query.language } : {},
      query.type ? { type: query.type } : {},
      query.authorId ? { authorId: query.authorId } : {},
      query.tag ? { tags: { has: query.tag } } : {},
      query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { excerpt: { contains: query.q, mode: 'insensitive' } }
            ]
          }
        : {}
    ]
  }
  // Pinned topics always come first.
  const orderBy: Prisma.CommunityPostOrderByWithRelationInput[] = [
    { pinned: 'desc' },
    ...(query.sort === 'popular'
      ? ([{ likes: { _count: 'desc' } }, { comments: { _count: 'desc' } }, { createdAt: 'desc' }] as const)
      : query.sort === 'latest'
        ? ([{ createdAt: 'desc' }] as const)
        : ([{ lastActivityAt: 'desc' }, { id: 'desc' }] as const))
  ]

  const [rows, total] = await Promise.all([
    prisma.communityPost.findMany({ where, select: communityListSelect, orderBy, ...toSkipTake(query) }),
    prisma.communityPost.count({ where })
  ])
  res.json(paginated(await summarizePosts(rows, req.user, req.locale), total, query))
})

communityRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  res.json(await loadDetail(id, req))
})

communityRoutes.post('/', requireVerified, async (req, res) => {
  const user = currentUser(req)
  const data = parse(postCreate, req.body)
  const { gearIds, ...postData } = data
  await assertCategory(data.categoryKey, user)
  const post = await prisma.communityPost.create({
    data: {
      ...postData,
      excerpt: deltaToExcerpt(data.content),
      language: detectLanguage(data.title, deltaToExcerpt(data.content)),
      authorId: user.id,
      gear: { create: (await validGearIds(gearIds)).map((gearId) => ({ gearId })) }
    },
    select: { id: true }
  })
  await syncImagesByUrl(user, 'communityPostId', post.id, deltaImageUrls(data.content))
  res.status(201).json(post)
})

communityRoutes.patch('/:id', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const { gearIds, ...data } = parse(postUpdate, req.body)

  const post = await prisma.communityPost.findUnique({ where: { id }, select: { authorId: true, title: true, excerpt: true } })
  if (!post) throw ApiError.notFound('post')
  assertOwnerOrAdmin(user, post.authorId)
  if (data.categoryKey) await assertCategory(data.categoryKey, user)
  const excerpt = data.content ? deltaToExcerpt(data.content) : post.excerpt

  await prisma.communityPost.update({
    where: { id },
    data: {
      ...data,
      ...(data.content && { excerpt }),
      ...((data.title || data.content) && { language: detectLanguage(data.title ?? post.title, excerpt) }),
      // A discussion has no accepted answer.
      ...(data.type === 'DISCUSSION' && { acceptedCommentId: null }),
      ...(gearIds && { gear: { deleteMany: {}, create: (await validGearIds(gearIds)).map((gearId) => ({ gearId })) } }),
      edited: true
    }
  })
  if (data.content) {
    await syncImagesByUrl(user, 'communityPostId', id, deltaImageUrls(data.content))
  }
  res.json({ id })
})

communityRoutes.delete('/:id', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const post = await prisma.communityPost.findUnique({ where: { id }, select: { authorId: true } })
  if (!post) throw ApiError.notFound('post')
  assertOwnerOrAdmin(currentUser(req), post.authorId)
  await deleteImagesFor('communityPostId', id)
  await prisma.communityPost.delete({ where: { id } })
  res.status(204).end()
})

// ── Accepted answer ───────────────────────────────────────────────────────────

/** Marks a reply as the answer of a QUESTION (post author or admin). */
communityRoutes.post('/:id/accept', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const { commentId } = parse(acceptBody, req.body)
  const post = await prisma.communityPost.findUnique({
    where: { id },
    select: { authorId: true, type: true, acceptedCommentId: true }
  })
  if (!post) throw ApiError.notFound('post')
  assertOwnerOrAdmin(user, post.authorId)
  if (post.type !== 'QUESTION') throw ApiError.badRequest('forum.not_question')
  const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { communityPostId: true, authorId: true } })
  if (!comment || comment.communityPostId !== id) throw ApiError.badRequest('forum.comment_not_in_post')

  if (post.acceptedCommentId !== commentId) {
    await prisma.communityPost.update({ where: { id }, data: { acceptedCommentId: commentId } })
    await notify({ type: 'ANSWER_ACCEPTED', recipientId: comment.authorId, actorId: user.id, communityPostId: id, commentId })
  }
  res.json(await loadDetail(id, req))
})

communityRoutes.delete('/:id/accept', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const post = await prisma.communityPost.findUnique({ where: { id }, select: { authorId: true } })
  if (!post) throw ApiError.notFound('post')
  assertOwnerOrAdmin(user, post.authorId)
  await prisma.communityPost.update({ where: { id }, data: { acceptedCommentId: null } })
  res.json(await loadDetail(id, req))
})

// ── Moderation ────────────────────────────────────────────────────────────────

communityRoutes.patch('/:id/moderation', requireAdmin, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const data = parse(moderationBody, req.body)
  await prisma.communityPost.update({ where: { id }, data })
  res.json(await loadDetail(id, req))
})

communityRoutes.use('/', engagementRoutes('community'))
