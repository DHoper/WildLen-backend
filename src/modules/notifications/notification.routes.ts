import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { parse } from '../../lib/validate'
import { authorSelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { currentUser, requireAuth } from '../../middleware/auth'
import { hiddenUserIds } from '../social/blocks'

const EXCERPT_LENGTH = 80

const readBody = z.object({
  ids: z.array(z.number().int().positive()).max(500).optional()
})

const titleSelect = { select: { id: true, title: true } } as const
const notificationSelect = {
  id: true,
  type: true,
  readAt: true,
  createdAt: true,
  actor: { select: authorSelect },
  photoPost: titleSelect,
  communityPost: titleSelect,
  article: titleSelect,
  trip: titleSelect,
  comment: { select: { id: true, content: true } }
} satisfies Prisma.NotificationSelect

type Row = Prisma.NotificationGetPayload<{ select: typeof notificationSelect }>

const toItem = ({ photoPost, communityPost, article, trip, comment, ...rest }: Row) => ({
  ...rest,
  target: photoPost
    ? { type: 'photo' as const, ...photoPost }
    : communityPost
      ? { type: 'community' as const, ...communityPost }
      : article
        ? { type: 'article' as const, ...article }
        : trip
          ? { type: 'trip' as const, ...trip }
          : null,
  comment: comment
    ? { id: comment.id, excerpt: Array.from(comment.content).slice(0, EXCERPT_LENGTH).join('') }
    : null
})

export const notificationRoutes = Router()
notificationRoutes.use(requireAuth)

notificationRoutes.get('/', async (req, res) => {
  const page = parse(paginationQuery, req.query)
  const where = await visibleWhere(currentUser(req).id)
  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(page)
    }),
    prisma.notification.count({ where })
  ])
  res.json(paginated(rows.map(toItem), total, page))
})

notificationRoutes.get('/unread-count', async (req, res) => {
  const count = await prisma.notification.count({
    where: { ...(await visibleWhere(currentUser(req).id)), readAt: null }
  })
  res.json({ count })
})

/** Notifications from users in a block relationship with the viewer are hidden. */
const visibleWhere = async (userId: number): Promise<Prisma.NotificationWhereInput> => {
  const hidden = await hiddenUserIds(userId)
  return { recipientId: userId, ...(hidden.length && { actorId: { notIn: hidden } }) }
}

/** Marks the given notifications (or all, when `ids` is omitted) as read. */
notificationRoutes.post('/read', async (req, res) => {
  const { ids } = parse(readBody, req.body ?? {})
  await prisma.notification.updateMany({
    where: { recipientId: currentUser(req).id, readAt: null, ...(ids && { id: { in: ids } }) },
    data: { readAt: new Date() }
  })
  res.status(204).end()
})
