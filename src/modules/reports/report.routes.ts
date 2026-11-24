import { Router } from 'express'
import type { Prisma, ReportTargetType } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { authorSelect } from '../../lib/select'
import type { ResourceKey } from '../../lib/i18n'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { currentUser, requireAdmin, requireAuth } from '../../middleware/auth'

const TARGET_TYPES = ['photo', 'community', 'comment', 'user', 'poll'] as const
const REASONS = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'WILDLIFE_HARM', 'SENSITIVE_LOCATION', 'COPYRIGHT', 'OTHER'] as const
const STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const

const reportBody = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.number().int().positive(),
  reason: z.enum(REASONS),
  note: z.string().trim().max(500).nullish()
})

const RESOURCE: Record<ReportTargetType, ResourceKey> = {
  photo: 'photo',
  community: 'post',
  comment: 'comment',
  user: 'user',
  poll: 'poll'
}

const EXCERPT = 120
const excerpt = (text: string | null | undefined) =>
  text ? Array.from(text.replace(/\s+/g, ' ').trim()).slice(0, EXCERPT).join('') : null

/** Id of the target's owner, or undefined when the target doesn't exist. */
const targetOwner = async (type: ReportTargetType, id: number): Promise<number | null | undefined> => {
  const select = { authorId: true } as const
  switch (type) {
    case 'photo':
      return (await prisma.photoPost.findUnique({ where: { id }, select }))?.authorId
    case 'community':
      return (await prisma.communityPost.findUnique({ where: { id }, select }))?.authorId
    case 'comment':
      return (await prisma.comment.findUnique({ where: { id }, select }))?.authorId
    case 'poll':
      return (await prisma.poll.findUnique({ where: { id }, select }))?.authorId
    case 'user':
      return (await prisma.user.findUnique({ where: { id }, select: { id: true } }))?.id
  }
}

/** POST /reports — one OPEN report per reporter and target. */
export const reportRoutes = Router()

reportRoutes.post('/', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const data = parse(reportBody, req.body)
  const owner = await targetOwner(data.targetType, data.targetId)
  if (owner === undefined) throw ApiError.notFound(RESOURCE[data.targetType])
  if (data.targetType === 'user' && data.targetId === user.id) throw ApiError.badRequest('report.self')

  const open = await prisma.report.findFirst({
    where: { reporterId: user.id, targetType: data.targetType, targetId: data.targetId, status: 'OPEN' },
    select: { id: true }
  })
  if (open) throw ApiError.conflict('report.duplicate')

  const report = await prisma.report.create({
    data: { ...data, note: data.note ?? null, reporterId: user.id },
    select: { id: true }
  })
  res.status(201).json(report)
})

// ── Admin moderation queue ───────────────────────────────────────────────────

const reportSelect = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  note: true,
  status: true,
  createdAt: true,
  resolutionNote: true,
  resolvedAt: true,
  reporter: { select: authorSelect }
} satisfies Prisma.ReportSelect

type ReportRow = Prisma.ReportGetPayload<{ select: typeof reportSelect }>
type Author = Prisma.UserGetPayload<{ select: typeof authorSelect }>
export interface ReportTarget {
  title: string
  excerpt: string | null
  /** Website path of the reported content. */
  url: string
  author: Author | null
}

const ids = (rows: ReportRow[], type: ReportTargetType) =>
  rows.filter((r) => r.targetType === type).map((r) => r.targetId)

/** Loads every target of a page of reports in one query per type. */
const resolveTargets = async (rows: ReportRow[]) => {
  const titled = { id: true, title: true, author: { select: authorSelect } } as const
  const [photos, posts, comments, users, polls] = await Promise.all([
    prisma.photoPost.findMany({ where: { id: { in: ids(rows, 'photo') } }, select: { ...titled, description: true } }),
    prisma.communityPost.findMany({ where: { id: { in: ids(rows, 'community') } }, select: { ...titled, excerpt: true } }),
    prisma.comment.findMany({
      where: { id: { in: ids(rows, 'comment') } },
      select: {
        id: true,
        content: true,
        author: { select: authorSelect },
        photoPost: { select: { id: true, title: true } },
        communityPost: { select: { id: true, title: true } },
        article: { select: { id: true, title: true } }
      }
    }),
    prisma.user.findMany({ where: { id: { in: ids(rows, 'user') } }, select: { ...authorSelect, bio: true } }),
    prisma.poll.findMany({ where: { id: { in: ids(rows, 'poll') } }, select: { ...titled, description: true } })
  ])

  const targets = new Map<string, ReportTarget>()
  for (const p of photos)
    targets.set(`photo:${p.id}`, { title: p.title, excerpt: excerpt(p.description), url: `/gallery/${p.id}`, author: p.author })
  for (const p of posts)
    targets.set(`community:${p.id}`, { title: p.title, excerpt: excerpt(p.excerpt), url: `/community/posts/${p.id}`, author: p.author })
  for (const p of polls)
    targets.set(`poll:${p.id}`, { title: p.title, excerpt: excerpt(p.description), url: `/community/polls/${p.id}`, author: p.author })
  for (const { bio, ...u } of users)
    targets.set(`user:${u.id}`, { title: u.username, excerpt: excerpt(bio), url: `/users/${u.id}`, author: u })
  for (const c of comments) {
    const parent = c.photoPost
      ? { ...c.photoPost, path: `/gallery/${c.photoPost.id}` }
      : c.communityPost
        ? { ...c.communityPost, path: `/community/posts/${c.communityPost.id}` }
        : c.article
          ? { ...c.article, path: `/articles/${c.article.id}` }
          : null
    targets.set(`comment:${c.id}`, {
      title: parent?.title ?? '',
      excerpt: excerpt(c.content),
      url: parent ? `${parent.path}#comment-${c.id}` : '',
      author: c.author
    })
  }
  return targets
}

const withTargets = async (rows: ReportRow[]) => {
  const targets = await resolveTargets(rows)
  return rows.map((r) => ({ ...r, target: targets.get(`${r.targetType}:${r.targetId}`) ?? null }))
}

const adminListQuery = paginationQuery.extend({ status: z.enum(STATUSES).default('OPEN') })
const adminUpdateBody = z.object({
  status: z.enum(STATUSES),
  resolutionNote: z.string().trim().max(1000).nullish()
})

/** Mounted under /admin (already behind requireAdmin). */
export const adminReportRoutes = Router()
adminReportRoutes.use(requireAdmin)

adminReportRoutes.get('/', async (req, res) => {
  const query = parse(adminListQuery, req.query)
  const where = { status: query.status }
  const [rows, total] = await Promise.all([
    prisma.report.findMany({
      where,
      select: reportSelect,
      // Open reports: oldest first (a queue); handled ones: most recently handled first.
      orderBy: query.status === 'OPEN' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ resolvedAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(query)
    }),
    prisma.report.count({ where })
  ])
  res.json(paginated(await withTargets(rows), total, query))
})

adminReportRoutes.patch('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const { status, resolutionNote } = parse(adminUpdateBody, req.body)
  const closed = status !== 'OPEN'
  const row = await prisma.report.update({
    where: { id },
    data: {
      status,
      ...(resolutionNote !== undefined && { resolutionNote }),
      resolvedAt: closed ? new Date() : null,
      resolvedById: closed ? currentUser(req).id : null
    },
    select: reportSelect
  })
  const [item] = await withTargets([row])
  res.json(item)
})
