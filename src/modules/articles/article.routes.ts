import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { deltaSchema, idParam, localeSchema, searchQuery, tagList } from '../../lib/schemas'
import { authorSelect, engagementCount, withCounts } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { deltaImageUrls, type Delta } from '../../lib/delta'
import { currentUser, requireAdmin } from '../../middleware/auth'
import { bookmarkedBy, engagementRoutes, likedBy } from '../engagement/engagement'
import { deleteImagesFor, syncImagesByUrl } from '../images/image.service'

// zod 4 applies `.default()` inside `.partial()`, so defaults live only on the create schema.
const articleFields = z.object({
  title: z.string().trim().min(2).max(80),
  subtitle: z.string().trim().max(160),
  coverImageUrl: z.url(),
  content: deltaSchema,
  tags: tagList,
  status: z.enum(['DRAFT', 'PUBLISHED']),
  locale: localeSchema
})
const articleCreate = articleFields.extend({
  /** Makes this article a translation of another one. */
  translationOf: z.number().int().positive().optional(),
  subtitle: articleFields.shape.subtitle.default(''),
  tags: tagList.default([]),
  status: articleFields.shape.status.default('PUBLISHED'),
  locale: localeSchema.default('zh-TW')
})
const articleUpdate = articleFields.partial().extend({
  /** Link to another article as its translation; null unlinks. */
  translationOf: z.number().int().positive().nullable().optional()
})

/**
 * Resolves the translation group to join when linking to `sourceId`. The source gets a
 * group if it has none. A group holds at most one article per locale.
 */
const groupFor = async (sourceId: number, locale: string, selfId?: number) => {
  const source = await prisma.article.findUnique({ where: { id: sourceId }, select: { id: true, locale: true, translationGroup: true } })
  if (!source || source.id === selfId) throw ApiError.badRequest('article.invalid_translation')
  if (source.locale === locale) throw ApiError.badRequest('article.translation_same_locale')
  const group = source.translationGroup ?? randomUUID()
  if (!source.translationGroup) await prisma.article.update({ where: { id: source.id }, data: { translationGroup: group } })
  const clash = await prisma.article.findFirst({
    where: { translationGroup: group, locale, ...(selfId && { id: { not: selfId } }) },
    select: { id: true }
  })
  if (clash) throw ApiError.conflict('article.translation_exists')
  return group
}

/** Other-language versions of an article (published ones, unless admin). */
const translationsOf = async (id: number, group: string | null, admin: boolean) =>
  group
    ? prisma.article.findMany({
        where: { translationGroup: group, id: { not: id }, ...(!admin && { status: 'PUBLISHED' }) },
        select: { id: true, locale: true, title: true }
      })
    : []

const listQuery = paginationQuery.merge(searchQuery).extend({
  status: z.enum(['PUBLISHED', 'DRAFT', 'ALL']).default('PUBLISHED'),
  /** Omitted = articles in every language. */
  locale: localeSchema.optional()
})

export const articleListSelect = {
  id: true,
  title: true,
  subtitle: true,
  coverImageUrl: true,
  tags: true,
  status: true,
  locale: true,
  viewCount: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  ...engagementCount
} satisfies Prisma.ArticleSelect

export const articleRoutes = Router()

articleRoutes.get('/', async (req, res) => {
  const query = parse(listQuery, req.query)
  // Only admins may see drafts.
  const status = req.user?.role === 'ADMIN' ? query.status : 'PUBLISHED'

  const where: Prisma.ArticleWhereInput = {
    ...(status !== 'ALL' && { status }),
    ...(query.locale && { locale: query.locale }),
    ...(query.tag && { tags: { has: query.tag } }),
    ...(query.authorId && { authorId: query.authorId }),
    ...(query.q && {
      OR: [
        { title: { contains: query.q, mode: 'insensitive' } },
        { subtitle: { contains: query.q, mode: 'insensitive' } }
      ]
    })
  }
  const orderBy: Prisma.ArticleOrderByWithRelationInput[] =
    query.sort === 'popular'
      ? [{ likes: { _count: 'desc' } }, { viewCount: 'desc' }]
      : [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]

  const [rows, total] = await Promise.all([
    prisma.article.findMany({ where, select: articleListSelect, orderBy, ...toSkipTake(query) }),
    prisma.article.count({ where })
  ])
  res.json(paginated(rows.map(withCounts), total, query))
})

articleRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const article = await prisma.article.findUnique({
    where: { id },
    select: { ...articleListSelect, content: true, translationGroup: true, author: { select: authorSelect } }
  })
  const admin = req.user?.role === 'ADMIN'
  if (!article || (article.status !== 'PUBLISHED' && !admin)) {
    throw ApiError.notFound('article')
  }
  const { translationGroup, ...rest } = article
  const [likedByMe, bookmarkedByMe, translations] = await Promise.all([
    likedBy('article', id, req.user?.id),
    bookmarkedBy('article', id, req.user?.id),
    translationsOf(id, translationGroup, admin)
  ])
  res.json({ ...withCounts(rest), likedByMe, bookmarkedByMe, translations })
})

articleRoutes.post('/', requireAdmin, async (req, res) => {
  const user = currentUser(req)
  const { translationOf, ...data } = parse(articleCreate, req.body)
  const translationGroup = translationOf ? await groupFor(translationOf, data.locale) : null
  const article = await prisma.article.create({
    data: {
      ...data,
      translationGroup,
      authorId: user.id,
      publishedAt: data.status === 'PUBLISHED' ? new Date() : null
    },
    select: { id: true }
  })
  await syncArticleImages(user, article.id, data.content, data.coverImageUrl)
  res.status(201).json(article)
})

articleRoutes.patch('/:id', requireAdmin, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const { translationOf, ...data } = parse(articleUpdate, req.body)
  const current = await prisma.article.findUnique({
    where: { id },
    select: { status: true, publishedAt: true, content: true, coverImageUrl: true, locale: true }
  })
  if (!current) throw ApiError.notFound('article')
  const translationGroup =
    translationOf === undefined ? undefined : translationOf === null ? null : await groupFor(translationOf, data.locale ?? current.locale, id)

  const publishing = data.status === 'PUBLISHED' && !current.publishedAt
  const article = await prisma.article.update({
    where: { id },
    data: { ...data, ...(translationGroup !== undefined && { translationGroup }), ...(publishing && { publishedAt: new Date() }) },
    select: { id: true, content: true, coverImageUrl: true }
  })
  await syncArticleImages(user, id, article.content as unknown as Delta, article.coverImageUrl)
  res.json({ id })
})

articleRoutes.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = parse(idParam, req.params)
  await deleteImagesFor('articleId', id)
  await prisma.article.delete({ where: { id } })
  res.status(204).end()
})

articleRoutes.use('/', engagementRoutes('article'))

const syncArticleImages = (
  user: ReturnType<typeof currentUser>,
  id: number,
  content: Delta,
  cover: string
) => syncImagesByUrl(user, 'articleId', id, [cover, ...deltaImageUrls(content)])
