import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { authorSelect } from '../../lib/select'
import { currentUser, requireAuth, requireVerified } from '../../middleware/auth'
import { notify } from '../engagement/engagement'
import { assertNotBlocked, assertVisible, hiddenUserIds } from '../social/blocks'

/**
 * Structured critiques: each reviewer scores composition, light, focus and moment
 * (1–5) and writes a note. One critique per reviewer per photo (editable).
 * Mounted at /photos/:id/critiques.
 */
const score = z.number().int().min(1).max(5)
const critiqueBody = z.object({
  composition: score,
  light: score,
  focus: score,
  moment: score,
  comment: z.string().trim().min(10).max(1500)
})

export const ASPECTS = ['composition', 'light', 'focus', 'moment'] as const

export const critiqueRoutes = Router({ mergeParams: true })

const loadPhoto = async (id: number, viewerId?: number) => {
  const p = await prisma.photoPost.findUnique({ where: { id }, select: { authorId: true, critiqueRequested: true } })
  if (!p) throw ApiError.notFound('photo')
  await assertVisible(viewerId, p.authorId, 'photo')
  return p
}

critiqueRoutes.get('/', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await loadPhoto(id, req.user?.id)
  const hidden = await hiddenUserIds(req.user?.id)
  const rows = await prisma.critique.findMany({
    where: { photoPostId: id, userId: { notIn: hidden } },
    select: { id: true, composition: true, light: true, focus: true, moment: true, comment: true, createdAt: true, updatedAt: true, user: { select: authorSelect } },
    orderBy: { createdAt: 'asc' }
  })
  const avg = (k: (typeof ASPECTS)[number]) => (rows.length ? Math.round((rows.reduce((s, r) => s + r[k], 0) / rows.length) * 10) / 10 : null)
  res.json({
    count: rows.length,
    averages: Object.fromEntries(ASPECTS.map((k) => [k, avg(k)])),
    items: rows.map(({ user, ...r }) => ({ ...r, author: user, mine: user.id === req.user?.id }))
  })
})

critiqueRoutes.put('/', requireVerified, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const data = parse(critiqueBody, req.body)
  const user = currentUser(req)
  const photo = await loadPhoto(id, user.id)
  if (photo.authorId === user.id) throw ApiError.badRequest('critique.own_photo')
  await assertNotBlocked(user.id, photo.authorId)
  const existing = await prisma.critique.findUnique({ where: { photoPostId_userId: { photoPostId: id, userId: user.id } }, select: { id: true } })
  const row = await prisma.critique.upsert({
    where: { photoPostId_userId: { photoPostId: id, userId: user.id } },
    create: { ...data, photoPostId: id, userId: user.id },
    update: data,
    select: { id: true }
  })
  if (!existing) await notify({ type: 'CRITIQUE', recipientId: photo.authorId, actorId: user.id, photoPostId: id })
  res.status(existing ? 200 : 201).json(row)
})

critiqueRoutes.delete('/', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const user = currentUser(req)
  const target = z.object({ userId: z.coerce.number().int().positive().optional() }).parse(req.query)
  // Admins may remove someone else's critique with ?userId=.
  const userId = user.role === 'ADMIN' && target.userId ? target.userId : user.id
  await prisma.critique.deleteMany({ where: { photoPostId: id, userId } })
  res.status(204).end()
})
