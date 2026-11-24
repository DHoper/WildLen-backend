import { Router, type RequestHandler } from 'express'
import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { idParam, localeSchema, tagList } from '../../lib/schemas'
import { authorSelect, privateUserSelect, speciesSummarySelect, withCounts } from '../../lib/select'
import { paginated, paginationQuery, toSkipTake } from '../../lib/pagination'
import { currentUser, requireAuth } from '../../middleware/auth'
import { avatarSchema, passwordSchema, usernameSchema } from '../auth/auth.routes'
import { notify } from '../engagement/engagement'
import { photoListSelect, toPhotoSummary } from '../photos/photo.routes'
import { communityListSelect, summarizePosts } from '../community/community.routes'
import { articleListSelect } from '../articles/article.routes'
import { assertNotBlocked, hiddenUserIds, visibleAuthor } from '../social/blocks'
import { deleteAccount } from './account.service'
import { AREA_KEYS } from '../places/areas'
import { placeEligibleSql } from '../places/privacy'
import { localized, placeRefSelect, toPlaceRef } from '../places/refs'
import { presentTrips, tripSelect } from '../trips/trip.routes'

const profileBody = z
  .object({
    username: usernameSchema,
    avatarIndex: avatarSchema,
    bio: z.string().trim().max(300).nullable(),
    interests: tagList,
    locale: localeSchema,
    /** An image the member uploaded (folder=avatars); null → the drawn avatar. */
    avatarUrl: z.string().trim().max(500).nullable(),
    /** Area the member is based in. */
    homeArea: z.enum([...AREA_KEYS, 'other']).nullable(),
    /** Species groups the member specialises in. */
    specialties: z.array(z.enum(['BIRD', 'MAMMAL', 'REPTILE', 'AMPHIBIAN', 'FISH', 'INSECT', 'OTHER'])).max(4)
  })
  .partial()

const passwordBody = z.object({
  currentPassword: z.string().max(200).default(''),
  newPassword: passwordSchema
})

const bookmarkQuery = paginationQuery.extend({
  type: z.enum(['photo', 'community', 'article']).default('photo')
})

const followPageQuery = paginationQuery.extend({
  pageSize: z.coerce.number().int().min(1).max(50).default(30)
})

const loadUser = async (id: number) => {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) throw ApiError.notFound('user')
}

const followerCount = (id: number) => prisma.follow.count({ where: { followingId: id } })

export const userRoutes = Router()

const GROUPS = ['BIRD', 'MAMMAL', 'REPTILE', 'AMPHIBIAN', 'FISH', 'INSECT', 'OTHER'] as const
const memberQuery = paginationQuery.extend({
  q: z.string().trim().max(50).optional(),
  area: z.enum([...AREA_KEYS, 'other']).optional(),
  group: z.enum(GROUPS).optional(),
  sort: z.enum(['active', 'species', 'new']).default('active')
})

/**
 * Member directory (redesign v4 §4.1 "成員"): photographers with at least one observation,
 * filterable by home area and specialty. System accounts (the import) are not members.
 */
userRoutes.get('/', async (req, res) => {
  const query = parse(memberQuery, req.query)
  const hidden = await hiddenUserIds(req.user?.id)
  const where: Prisma.UserWhereInput = {
    system: false,
    id: { notIn: hidden },
    photoPosts: { some: {} },
    ...(query.q && { username: { contains: query.q, mode: 'insensitive' } }),
    ...(query.area && { homeArea: query.area }),
    ...(query.group && { specialties: { has: query.group } })
  }
  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    query.sort === 'new' ? [{ createdAt: 'desc' }] : [{ photoPosts: { _count: 'desc' } }, { id: 'asc' }]
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { ...authorSelect, bio: true, homeArea: true, specialties: true, createdAt: true, _count: { select: { photoPosts: true, followers: true } } },
      orderBy,
      ...(query.sort === 'species' ? {} : toSkipTake(query))
    }),
    prisma.user.count({ where })
  ])
  const ids = rows.map((r) => r.id)
  const species = ids.length
    ? await prisma.$queryRaw<{ id: number; n: number }[]>`
        SELECT author_id AS id, count(DISTINCT species_id)::int AS n FROM photo_posts
        WHERE author_id IN (${Prisma.join(ids)}) AND species_id IS NOT NULL AND NOT captive GROUP BY 1`
    : []
  const speciesBy = new Map(species.map((s) => [s.id, s.n]))
  let items = rows.map(({ _count, ...u }) => ({ ...u, stats: { photoCount: _count.photoPosts, followerCount: _count.followers, speciesCount: speciesBy.get(u.id) ?? 0 } }))
  if (query.sort === 'species') {
    // Species counts are computed, so this order is applied after loading (the directory is small).
    const { skip, take } = toSkipTake(query)
    items = items.sort((a, b) => b.stats.speciesCount - a.stats.speciesCount || a.id - b.id).slice(skip, skip + take)
  }
  res.json(paginated(items, total, query))
})

// ── The signed-in user ────────────────────────────────────────────────────────

userRoutes.patch('/me', requireAuth, async (req, res) => {
  const data = parse(profileBody, req.body)
  // The avatar must be one of the member's own uploads.
  if (data.avatarUrl) {
    const img = await prisma.image.findFirst({ where: { url: data.avatarUrl, ownerId: currentUser(req).id }, select: { id: true } })
    if (!img) throw ApiError.badRequest('image.not_allowed', { id: 0 })
  }
  if (data.specialties) data.specialties = [...new Set(data.specialties)]
  const user = await prisma.user.update({
    where: { id: currentUser(req).id },
    data,
    select: privateUserSelect
  })
  res.json(user)
})

userRoutes.put('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = parse(passwordBody, req.body)
  const id = currentUser(req).id
  const record = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } })
  if (!record) throw ApiError.unauthorized('auth.account_missing')
  if (record.passwordHash && !(await bcrypt.compare(currentPassword, record.passwordHash))) {
    throw ApiError.badRequest('auth.wrong_current_password')
  }
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) }
  })
  res.status(204).end()
})

/** Deletes the caller's account and everything they created (requires the password). */
userRoutes.delete('/me', requireAuth, async (req, res) => {
  // Password accounts confirm with the password; Google-only accounts by typing their e-mail.
  const { password, confirmEmail } = parse(z.object({ password: z.string().max(200).default(''), confirmEmail: z.string().max(200).default('') }), req.body ?? {})
  const id = currentUser(req).id
  const record = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true, email: true } })
  if (!record) throw ApiError.unauthorized('auth.account_missing')
  const ok = record.passwordHash
    ? !!password && (await bcrypt.compare(password, record.passwordHash))
    : confirmEmail.trim().toLowerCase() === record.email
  if (!ok) throw ApiError.badRequest(record.passwordHash ? 'auth.wrong_password' : 'auth.wrong_confirm_email')
  await deleteAccount(id)
  res.status(204).end()
})

/** Everything we hold about the caller, as a downloadable JSON file. */
userRoutes.get('/me/export', requireAuth, async (req, res) => {
  const id = currentUser(req).id
  const target = { select: { id: true, title: true } }
  const [profile, photos, posts, comments, polls, ballots, bookmarks, following, followers, identifications, blocks, images] =
    await Promise.all([
      prisma.user.findUnique({ where: { id }, select: privateUserSelect }),
      prisma.photoPost.findMany({
        where: { authorId: id },
        select: {
          id: true,
          title: true,
          description: true,
          locationName: true,
          latitude: true,
          longitude: true,
          locationPrecision: true,
          takenAt: true,
          exif: true,
          quality: true,
          createdAt: true,
          updatedAt: true,
          species: { select: { id: true, commonName: true, scientificName: true } },
          images: { select: { url: true }, orderBy: { position: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.communityPost.findMany({
        where: { authorId: id },
        select: { id: true, title: true, content: true, tags: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.comment.findMany({
        where: { authorId: id },
        select: { id: true, content: true, createdAt: true, photoPost: target, communityPost: target, article: target },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.poll.findMany({
        where: { authorId: id },
        select: {
          id: true,
          title: true,
          description: true,
          endsAt: true,
          createdAt: true,
          options: { select: { text: true }, orderBy: { position: 'asc' } }
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.pollBallot.findMany({
        where: { userId: id },
        select: { createdAt: true, poll: { select: { id: true, title: true } }, option: { select: { text: true } } }
      }),
      prisma.bookmark.findMany({
        where: { userId: id },
        select: { createdAt: true, photoPost: target, communityPost: target, article: target }
      }),
      prisma.follow.findMany({
        where: { followerId: id },
        select: { createdAt: true, following: { select: { id: true, username: true } } }
      }),
      prisma.follow.findMany({
        where: { followingId: id },
        select: { createdAt: true, follower: { select: { id: true, username: true } } }
      }),
      prisma.identification.findMany({
        where: { userId: id },
        select: { photoPostId: true, comment: true, createdAt: true, species: { select: { id: true, scientificName: true } } }
      }),
      prisma.block.findMany({
        where: { blockerId: id },
        select: { createdAt: true, blocked: { select: { id: true, username: true } } }
      }),
      prisma.image.findMany({ where: { ownerId: id }, select: { url: true, createdAt: true } })
    ])

  res
    .set('Content-Disposition', `attachment; filename="wildlens-export-${id}.json"`)
    .json({
      exportedAt: new Date().toISOString(),
      profile,
      photos: photos.map(({ images, ...p }) => ({ ...p, imageUrls: images.map((i) => i.url) })),
      communityPosts: posts,
      comments,
      polls: polls.map(({ options, ...p }) => ({ ...p, options: options.map((o) => o.text) })),
      ballots,
      bookmarks,
      following: following.map((f) => ({ ...f.following, since: f.createdAt })),
      followers: followers.map((f) => ({ ...f.follower, since: f.createdAt })),
      identifications,
      blocks: blocks.map((b) => ({ ...b.blocked, since: b.createdAt })),
      images
    })
})

/** The caller's bookmarks of one content type, newest first, as list summaries. */
userRoutes.get('/me/bookmarks', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const query = parse(bookmarkQuery, req.query)
  const hidden = await hiddenUserIds(user.id)
  const author = hidden.length ? { authorId: { notIn: hidden } } : {}

  // Each bookmark row points at exactly one content type.
  const where: Prisma.BookmarkWhereInput = { userId: user.id }
  if (query.type === 'photo') Object.assign(where, { photoPostId: { not: null }, photoPost: { is: author } })
  else if (query.type === 'community') Object.assign(where, { communityPostId: { not: null }, communityPost: { is: author } })
  else Object.assign(where, { articleId: { not: null }, ...(user.role !== 'ADMIN' && { article: { is: { status: 'PUBLISHED' } } }) })

  const page = { where, orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], ...toSkipTake(query) }
  const total = await prisma.bookmark.count({ where })
  let items: unknown[]
  if (query.type === 'photo') {
    const rows = await prisma.bookmark.findMany({ ...page, select: { photoPost: { select: photoListSelect } } })
    items = rows.flatMap((r) => (r.photoPost ? [toPhotoSummary(r.photoPost, user, req.locale)] : []))
  } else if (query.type === 'community') {
    const rows = await prisma.bookmark.findMany({ ...page, select: { communityPost: { select: communityListSelect } } })
    items = await summarizePosts(rows.flatMap((r) => r.communityPost ?? []), user, req.locale)
  } else {
    const rows = await prisma.bookmark.findMany({ ...page, select: { article: { select: articleListSelect } } })
    items = rows.flatMap((r) => (r.article ? [withCounts(r.article)] : []))
  }
  res.json(paginated(items, total, query))
})

userRoutes.get('/me/blocks', requireAuth, async (req, res) => {
  const rows = await prisma.block.findMany({
    where: { blockerId: currentUser(req).id },
    select: { blocked: { select: authorSelect } },
    orderBy: { createdAt: 'desc' }
  })
  res.json(rows.map((r) => r.blocked))
})

// ── Public profiles ───────────────────────────────────────────────────────────

/** Public profile + activity stats. */
userRoutes.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params)
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      avatarIndex: true,
      avatarUrl: true,
      role: true,
      system: true,
      bio: true,
      interests: true,
      homeArea: true,
      specialties: true,
      createdAt: true,
      _count: { select: { photoPosts: true, communityPosts: true, polls: true, followers: true, following: true, identifications: true, articles: true } }
    }
  })
  if (!user) throw ApiError.notFound('user')

  const viewerId = req.user?.id
  const [likesReceived, species, follow, outingCount] = await Promise.all([
    prisma.like.count({
      where: {
        OR: [{ photoPost: { authorId: id } }, { communityPost: { authorId: id } }]
      }
    }),
    prisma.photoPost.findMany({
      // Same rule as the species list: wild records only.
      where: { authorId: id, speciesId: { not: null }, captive: false },
      distinct: ['speciesId'],
      select: { speciesId: true }
    }),
    viewerId
      ? prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: viewerId, followingId: id } },
          select: { createdAt: true }
        })
      : null,
    prisma.outing.count({ where: { authorId: id, status: 'PUBLISHED' } })
  ])
  const { _count, ...profile } = user
  res.json({
    ...profile,
    followedByMe: !!follow,
    stats: {
      photoCount: _count.photoPosts,
      postCount: _count.communityPosts,
      pollCount: _count.polls,
      likesReceived,
      speciesCount: species.length,
      followerCount: _count.followers,
      followingCount: _count.following,
      outingCount,
      identificationCount: _count.identifications,
      articleCount: _count.articles
    }
  })
})

/**
 * Life list: every species the user has photographed, newest first sighting first.
 * A sighting's date is takenAt, falling back to the post's createdAt.
 */
userRoutes.get('/:id/species', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await loadUser(id)
  const photos = await prisma.photoPost.findMany({
    // Captive animals don't count toward a life list (as on eBird / iNaturalist).
    where: { authorId: id, speciesId: { not: null }, captive: false },
    select: {
      takenAt: true,
      createdAt: true,
      species: {
        select: { id: true, commonName: true, scientificName: true, englishName: true, group: true, status: true }
      },
      images: { select: { url: true }, orderBy: { position: 'asc' }, take: 1 }
    },
    orderBy: { createdAt: 'desc' }
  })

  type Entry = {
    species: NonNullable<(typeof photos)[number]['species']>
    photoCount: number
    firstPhotoAt: Date
    coverUrl: string | null
    /** Years with at least one record of the species. */
    years: number[]
  }
  const bySpecies = new Map<number, Entry>()
  for (const photo of photos) {
    if (!photo.species) continue
    const seenAt = photo.takenAt ?? photo.createdAt
    const entry = bySpecies.get(photo.species.id)
    if (!entry) {
      // Photos are newest-first, so the first one seen supplies the cover.
      bySpecies.set(photo.species.id, {
        species: photo.species,
        photoCount: 1,
        firstPhotoAt: seenAt,
        coverUrl: photo.images[0]?.url ?? null,
        years: [seenAt.getUTCFullYear()]
      })
      continue
    }
    entry.photoCount += 1
    if (!entry.years.includes(seenAt.getUTCFullYear())) entry.years.push(seenAt.getUTCFullYear())
    if (seenAt < entry.firstPhotoAt) entry.firstPhotoAt = seenAt
    entry.coverUrl ??= photo.images[0]?.url ?? null
  }
  const entries = [...bySpecies.values()].sort((a, b) => b.firstPhotoAt.getTime() - a.firstPhotoAt.getTime())
  for (const e of entries) e.years.sort((a, b) => b - a)
  const tally = <K extends string | number>(keys: K[]) => {
    const m = new Map<K, number>()
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1)
    return m
  }
  res.json({
    items: entries,
    /** Species recorded per year (year lists). */
    byYear: [...tally(entries.flatMap((e) => e.years))].map(([year, species]) => ({ year, species })).sort((a, b) => b.year - a.year),
    /** Species per group. */
    byGroup: [...tally(entries.map((e) => e.species.group))].map(([group, species]) => ({ group, species })).sort((a, b) => b.species - a.species)
  })
})

/** Identifications the member has made: total, how many agree with the record now, and the latest. */
userRoutes.get('/:id/identifications', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await loadUser(id)
  const hidden = await hiddenUserIds(req.user?.id)
  const where: Prisma.IdentificationWhereInput = { userId: id, photoPost: { authorId: { notIn: hidden } } }
  const [total, rows] = await Promise.all([
    prisma.identification.count({ where }),
    prisma.identification.findMany({
      where,
      select: { id: true, createdAt: true, comment: true, speciesId: true, species: { select: speciesSummarySelect }, photoPost: { select: photoListSelect } },
      orderBy: { createdAt: 'desc' },
      take: 24
    })
  ])
  const agreeing = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM identifications i JOIN photo_posts p ON p.id = i.photo_post_id
    WHERE i.user_id = ${id} AND p.species_id = i.species_id`
  res.json({
    total,
    agreeing: agreeing[0]?.n ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      comment: r.comment,
      species: r.species,
      agrees: r.photoPost.species?.id === r.speciesId,
      photo: toPhotoSummary(r.photoPost, req.user, req.locale)
    }))
  })
})

/** Places the member records at most (their observations that may be tied to a place, and journals with a public location). */
userRoutes.get('/:id/places', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await loadUser(id)
  const rows = await prisma.$queryRaw<{ id: number; n: number; outings: number }[]>`
    SELECT pl.id, count(DISTINCT p.id)::int AS n, count(DISTINCT o.id)::int AS outings
    FROM places pl
    LEFT JOIN (photo_posts p LEFT JOIN species s ON s.id = p.species_id) ON p.place_id = pl.id AND p.author_id = ${id} AND ${placeEligibleSql}
    LEFT JOIN outings o ON o.place_id = pl.id AND o.author_id = ${id} AND o.status = 'PUBLISHED' AND o.location_precision = 'EXACT'
    WHERE pl.status = 'CURATED'
    GROUP BY 1 HAVING count(DISTINCT p.id) + count(DISTINCT o.id) > 0
    ORDER BY count(DISTINCT p.id) + count(DISTINCT o.id) DESC LIMIT 8`
  const places = await prisma.place.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { ...placeRefSelect, region: true } })
  const byId = new Map(places.map((p) => [p.id, p]))
  res.json(rows.flatMap((r) => (byId.get(r.id) ? [{ place: { ...toPlaceRef(byId.get(r.id)!, req.locale), region: localized(byId.get(r.id)!.region, req.locale) }, observationCount: r.n, outingCount: r.outings }] : [])))
})

/** Trips the member organised or joined (going), newest first. */
userRoutes.get('/:id/trips', async (req, res) => {
  const { id } = parse(idParam, req.params)
  await loadUser(id)
  const trips = await prisma.trip.findMany({
    where: { cancelled: false, members: { some: { userId: id, status: 'GOING' } } },
    select: tripSelect,
    orderBy: { startsAt: 'desc' },
    take: 12
  })
  res.json(await presentTrips(trips, req.user, req.locale))
})

// ── Follow ────────────────────────────────────────────────────────────────────

const followList =
  (direction: 'followers' | 'following'): RequestHandler =>
  async (req, res) => {
    const { id } = parse(idParam, req.params)
    await loadUser(id)
    const query = parse(followPageQuery, req.query)
    const hidden = await hiddenUserIds(req.user?.id)
    const other = direction === 'followers' ? 'followerId' : 'followingId'
    const where: Prisma.FollowWhereInput = {
      [direction === 'followers' ? 'followingId' : 'followerId']: id,
      ...(hidden.length && { [other]: { notIn: hidden } })
    }
    const [rows, total] = await Promise.all([
      prisma.follow.findMany({
        where,
        select: { follower: { select: authorSelect }, following: { select: authorSelect } },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query)
      }),
      prisma.follow.count({ where })
    ])
    const items = rows.map((r) => (direction === 'followers' ? r.follower : r.following))
    res.json(paginated(items, total, query))
  }

userRoutes.get('/:id/followers', followList('followers'))
userRoutes.get('/:id/following', followList('following'))

userRoutes.put('/:id/follow', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const me = currentUser(req).id
  if (id === me) throw ApiError.badRequest('follow.self')
  await loadUser(id)
  await assertNotBlocked(me, id)
  const { count } = await prisma.follow.createMany({
    data: [{ followerId: me, followingId: id }],
    skipDuplicates: true
  })
  if (count > 0) await notify({ type: 'FOLLOW', recipientId: id, actorId: me })
  res.json({ following: true, followerCount: await followerCount(id) })
})

userRoutes.delete('/:id/follow', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const me = currentUser(req).id
  const { count } = await prisma.follow.deleteMany({ where: { followerId: me, followingId: id } })
  if (count > 0) {
    await prisma.notification.deleteMany({ where: { type: 'FOLLOW', actorId: me, recipientId: id, readAt: null } })
  }
  res.json({ following: false, followerCount: await followerCount(id) })
})

// ── Block ─────────────────────────────────────────────────────────────────────

/** Blocking also removes follows in both directions. */
userRoutes.put('/:id/block', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  const me = currentUser(req).id
  if (id === me) throw ApiError.badRequest('block.self')
  await loadUser(id)
  await prisma.$transaction([
    prisma.block.createMany({ data: [{ blockerId: me, blockedId: id }], skipDuplicates: true }),
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: me, followingId: id },
          { followerId: id, followingId: me }
        ]
      }
    })
  ])
  res.json({ blocked: true })
})

userRoutes.delete('/:id/block', requireAuth, async (req, res) => {
  const { id } = parse(idParam, req.params)
  await prisma.block.deleteMany({ where: { blockerId: currentUser(req).id, blockedId: id } })
  res.json({ blocked: false })
})

/** Signed-in user's feed: photos by people they follow, newest first. */
export const feedRoutes = Router()

feedRoutes.get('/', requireAuth, async (req, res) => {
  const user = currentUser(req)
  const query = parse(paginationQuery, req.query)
  const where: Prisma.PhotoPostWhereInput = {
    author: { followers: { some: { followerId: user.id } } },
    ...(await visibleAuthor(user.id))
  }
  const [rows, total] = await Promise.all([
    prisma.photoPost.findMany({ where, select: photoListSelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
    prisma.photoPost.count({ where })
  ])
  res.json(paginated(rows.map((r) => toPhotoSummary(r, user, req.locale)), total, query))
})
