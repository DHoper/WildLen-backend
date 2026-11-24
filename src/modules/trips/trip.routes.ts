import { Router } from 'express'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam } from '../../lib/schemas'
import { placeRefSelect, toPlaceRef, curatedPlaceAt } from '../places/refs'
import type { Locale } from '../../lib/i18n'
import { authorSelect, speciesSummarySelect } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { detectLanguage } from '../../lib/language'
import { assertOwnerOrAdmin, currentUser, requireAuth, requireVerified, type AuthUser } from '../../middleware/auth'
import { notify } from '../engagement/engagement'
import { visibleAuthor } from '../social/blocks'
import { photoListSelect, toPhotoSummary } from '../photos/photo.routes'
import { outingOrder, outingSelect, summarize as summarizeOutings } from '../outings/outing.routes'

/**
 * Field trips: a member organises a photo walk with a meeting point, time, capacity and
 * target species. Others join (or wait-list when full). The trip gets a discussion thread
 * on the "Trips & Meetups" board, and photos shot on the trip form its album.
 */

const TRIP_BOARD = 'meetups'

const tripFields = z.object({
  title: z.string().trim().min(4).max(80),
  description: z.string().trim().min(10).max(3000),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  meetingPoint: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  capacity: z.number().int().min(2).max(50),
  difficulty: z.enum(['EASY', 'MODERATE', 'HARD']),
  targetSpeciesIds: z.array(z.number().int().positive()).max(10),
  gear: z.string().trim().max(500)
})
const tripCreate = tripFields
  .extend({ difficulty: tripFields.shape.difficulty.default('EASY'), targetSpeciesIds: tripFields.shape.targetSpeciesIds.default([]), gear: tripFields.shape.gear.default('') })
  .refine((t) => t.endsAt > t.startsAt, { message: 'validation.trip_time', path: ['endsAt'] })
  .refine((t) => t.startsAt.getTime() > Date.now(), { message: 'validation.trip_past', path: ['startsAt'] })
const tripUpdate = tripFields.partial()

const listQuery = paginationQuery.extend({
  when: z.enum(['upcoming', 'past', 'mine']).default('upcoming'),
  pageSize: z.coerce.number().int().min(1).max(50).default(12)
})

export const tripSelect = {
  id: true,
  title: true,
  description: true,
  startsAt: true,
  endsAt: true,
  meetingPoint: true,
  latitude: true,
  longitude: true,
  capacity: true,
  difficulty: true,
  targetSpeciesIds: true,
  gear: true,
  language: true,
  cancelled: true,
  discussionId: true,
  createdAt: true,
  place: { select: placeRefSelect },
  organizer: { select: authorSelect },
  _count: { select: { photos: true } }
} satisfies Prisma.TripSelect
type TripRow = Prisma.TripGetPayload<{ select: typeof tripSelect }>

const memberCounts = async (ids: number[]) => {
  const rows = ids.length ? await prisma.tripMember.groupBy({ by: ['tripId', 'status'], where: { tripId: { in: ids } }, _count: true }) : []
  const m = new Map<number, { going: number; waitlist: number }>()
  for (const id of ids) m.set(id, { going: 0, waitlist: 0 })
  for (const r of rows) m.get(r.tripId)![r.status === 'GOING' ? 'going' : 'waitlist'] = r._count
  return m
}

const speciesFor = async (ids: number[]) => {
  const rows = ids.length ? await prisma.species.findMany({ where: { id: { in: ids } }, select: { ...speciesSummarySelect, coverImageUrl: true } }) : []
  return new Map(rows.map((s) => [s.id, s]))
}

/**
 * Cover: the newest album photo; otherwise the newest public community photo of one of
 * the trip's target species (never of a sensitive species, so no location is implied).
 */
const coversFor = async (trips: TripRow[]) => {
  const ids = trips.map((t) => t.id)
  const imageSel = { images: { select: { url: true }, orderBy: { position: 'asc' as const }, take: 1 } }
  const album = ids.length
    ? await prisma.photoPost.findMany({ where: { tripId: { in: ids } }, select: { tripId: true, ...imageSel }, orderBy: { createdAt: 'desc' } })
    : []
  const m = new Map<number, string>()
  for (const p of album) if (p.tripId && !m.has(p.tripId) && p.images[0]) m.set(p.tripId, p.images[0].url)

  const targets = [...new Set(trips.filter((t) => !m.has(t.id)).flatMap((t) => t.targetSpeciesIds))]
  if (targets.length) {
    const bySpecies = await prisma.photoPost.findMany({
      where: { speciesId: { in: targets }, species: { sensitive: false }, locationPrecision: { not: 'HIDDEN' } },
      select: { speciesId: true, ...imageSel },
      orderBy: { createdAt: 'desc' }
    })
    const speciesCover = new Map<number, string>()
    for (const p of bySpecies) if (p.speciesId && !speciesCover.has(p.speciesId) && p.images[0]) speciesCover.set(p.speciesId, p.images[0].url)
    for (const t of trips) {
      if (m.has(t.id)) continue
      const url = t.targetSpeciesIds.map((id) => speciesCover.get(id)).find(Boolean)
      if (url) m.set(t.id, url)
    }
  }
  return m
}

export const presentTrips = async (rows: TripRow[], viewer: AuthUser | undefined, locale: Locale = 'zh-TW') => {
  const ids = rows.map((r) => r.id)
  const [counts, species, covers, mine] = await Promise.all([
    memberCounts(ids),
    speciesFor([...new Set(rows.flatMap((r) => r.targetSpeciesIds))]),
    coversFor(rows),
    viewer && ids.length ? prisma.tripMember.findMany({ where: { tripId: { in: ids }, userId: viewer.id }, select: { tripId: true, status: true } }) : Promise.resolve([])
  ])
  const myStatus = new Map(mine.map((m) => [m.tripId, m.status]))
  return rows.map(({ targetSpeciesIds, _count, place, ...t }) => {
    const target = targetSpeciesIds.flatMap((id) => species.get(id) ?? [])
    const c = counts.get(t.id)!
    return {
      ...t,
      targetSpecies: target.map(({ coverImageUrl: _c, ...s }) => s),
      coverUrl: covers.get(t.id) ?? target.find((s) => s.coverImageUrl)?.coverImageUrl ?? null,
      goingCount: c.going,
      waitlistCount: c.waitlist,
      photoCount: _count.photos,
      place: place ? toPlaceRef(place, locale) : null,
      myStatus: myStatus.get(t.id) ?? null,
      past: t.endsAt.getTime() < Date.now()
    }
  })
}

const loadTrip = async (id: number) => {
  const trip = await prisma.trip.findUnique({ where: { id }, select: tripSelect })
  if (!trip) throw ApiError.notFound('trip')
  return trip
}

/** Moves wait-listed members up while there is room; notifies each one. */
const promoteWaitlist = async (tripId: number, actorId: number) => {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { capacity: true } })
  if (!trip) return
  let going = await prisma.tripMember.count({ where: { tripId, status: 'GOING' } })
  while (going < trip.capacity) {
    const next = await prisma.tripMember.findFirst({ where: { tripId, status: 'WAITLIST' }, orderBy: { createdAt: 'asc' } })
    if (!next) break
    await prisma.tripMember.update({ where: { tripId_userId: { tripId, userId: next.userId } }, data: { status: 'GOING' } })
    await notify({ type: 'TRIP_CONFIRMED', recipientId: next.userId, actorId, tripId })
    going++
  }
}

/** Plain-text Quill delta for the trip's discussion thread. */
const discussionDelta = (text: string) => ({ ops: [{ insert: `${text}\n` }] })

export const tripRoutes = Router()

tripRoutes.get('/', async (req, res) => {
  const q = parse(listQuery, req.query)
  const now = new Date()
  const where: Prisma.TripWhereInput =
    q.when === 'mine'
      ? { members: { some: { userId: req.user?.id ?? -1 } } }
      : q.when === 'past'
        ? { endsAt: { lt: now } }
        : { endsAt: { gte: now }, cancelled: false }
  const orderBy: Prisma.TripOrderByWithRelationInput = q.when === 'upcoming' ? { startsAt: 'asc' } : { startsAt: 'desc' }
  const [rows, total] = await Promise.all([
    prisma.trip.findMany({ where, select: tripSelect, orderBy, ...toSkipTake(q) }),
    prisma.trip.count({ where })
  ])
  res.json(paginated(await presentTrips(rows, req.user, req.locale), total, q))
})

tripRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const trip = await loadTrip(id)
  const [[item], members, photos] = await Promise.all([
    presentTrips([trip], req.user, req.locale),
    prisma.tripMember.findMany({ where: { tripId: id }, select: { status: true, createdAt: true, user: { select: authorSelect } }, orderBy: { createdAt: 'asc' } }),
    prisma.photoPost.findMany({ where: { tripId: id }, select: photoListSelect, orderBy: { createdAt: 'desc' }, take: 48 })
  ])
  // The meeting point is public, so only journals whose location is too (or the viewer's own).
  const outings = await prisma.outing.findMany({
    where: { tripId: id, status: 'PUBLISHED', ...(await visibleAuthor(req.user?.id)), OR: [{ locationPrecision: 'EXACT' }, ...(req.user ? [{ authorId: req.user.id }] : [])] },
    select: outingSelect,
    orderBy: outingOrder
  })
  res.json({
    ...item,
    members: members.filter((m) => m.status === 'GOING').map((m) => m.user),
    waitlist: members.filter((m) => m.status === 'WAITLIST').map((m) => m.user),
    album: photos.map((p) => toPhotoSummary(p, req.user, req.locale)),
    /** Participants' field journals from the trip. */
    outings: await summarizeOutings(outings, req.user, req.locale)
  })
})

tripRoutes.post('/', requireVerified, async (req, res) => {
  const user = currentUser(req)
  const data = parse(tripCreate, req.body)
  const language = detectLanguage(data.title, data.description)
  const placeId = await curatedPlaceAt(data.latitude, data.longitude)
  const trip = await prisma.$transaction(async (tx) => {
    const discussion = await tx.communityPost.create({
      data: {
        title: data.title,
        content: discussionDelta(data.description),
        excerpt: Array.from(data.description).slice(0, 140).join(''),
        language,
        categoryKey: TRIP_BOARD,
        authorId: user.id
      },
      select: { id: true }
    })
    const t = await tx.trip.create({ data: { ...data, language, placeId, organizerId: user.id, discussionId: discussion.id }, select: { id: true } })
    await tx.tripMember.create({ data: { tripId: t.id, userId: user.id, status: 'GOING' } })
    return t
  })
  res.status(201).json(trip)
})

tripRoutes.patch('/:id', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const data = parse(tripUpdate, req.body)
  const trip = await loadTrip(id)
  assertOwnerOrAdmin(user, trip.organizer.id)
  const startsAt = data.startsAt ?? trip.startsAt
  const endsAt = data.endsAt ?? trip.endsAt
  if (endsAt <= startsAt) throw ApiError.badRequest('validation.trip_time')
  const going = await prisma.tripMember.count({ where: { tripId: id, status: 'GOING' } })
  if (data.capacity !== undefined && data.capacity < going) throw ApiError.badRequest('trip.capacity_below_going', { n: going })
  await prisma.trip.update({
    where: { id },
    data: {
      ...data,
      ...((data.title || data.description) && { language: detectLanguage(data.title ?? trip.title, data.description ?? trip.description) }),
      // The trip belongs to the curated place its meeting point falls in.
      ...(data.latitude !== undefined && data.longitude !== undefined && { placeId: await curatedPlaceAt(data.latitude, data.longitude) })
    }
  })
  if (data.capacity !== undefined) await promoteWaitlist(id, user.id)
  res.json({ id })
})

tripRoutes.post('/:id/cancel', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const trip = await loadTrip(id)
  assertOwnerOrAdmin(user, trip.organizer.id)
  await prisma.trip.update({ where: { id }, data: { cancelled: true } })
  if (trip.discussionId) await prisma.communityPost.update({ where: { id: trip.discussionId }, data: { locked: true } })
  res.status(204).end()
})

tripRoutes.put('/:id/join', requireVerified, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const trip = await loadTrip(id)
  if (trip.cancelled) throw ApiError.badRequest('trip.cancelled')
  if (trip.startsAt.getTime() < Date.now()) throw ApiError.badRequest('trip.started')
  const existing = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: id, userId: user.id } } })
  if (existing) return void res.json({ status: existing.status })
  const going = await prisma.tripMember.count({ where: { tripId: id, status: 'GOING' } })
  const status = going < trip.capacity ? 'GOING' : 'WAITLIST'
  await prisma.tripMember.create({ data: { tripId: id, userId: user.id, status } })
  if (status === 'GOING') await notify({ type: 'TRIP_JOINED', recipientId: trip.organizer.id, actorId: user.id, tripId: id })
  res.json({ status })
})

tripRoutes.delete('/:id/join', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const { id } = parse(idParam, req.params)
  const trip = await loadTrip(id)
  if (trip.organizer.id === user.id) throw ApiError.badRequest('trip.organizer_cannot_leave')
  const member = await prisma.tripMember.findUnique({ where: { tripId_userId: { tripId: id, userId: user.id } } })
  if (member) {
    await prisma.tripMember.delete({ where: { tripId_userId: { tripId: id, userId: user.id } } })
    if (member.status === 'GOING' && !trip.cancelled) await promoteWaitlist(id, user.id)
  }
  res.status(204).end()
})

/** Trips the caller may attach a photo to (joined as GOING; recent or ongoing). */
tripRoutes.get('/me/attachable', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const rows = await prisma.trip.findMany({
    where: { members: { some: { userId: user.id, status: 'GOING' } }, cancelled: false, startsAt: { lte: new Date(Date.now() + 24 * 3600_000) } },
    select: { id: true, title: true, startsAt: true },
    orderBy: { startsAt: 'desc' },
    take: 20
  })
  res.json(rows)
})
