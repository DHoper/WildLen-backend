import { existsSync } from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { UPLOAD_DIR } from '../src/lib/storage'
import { outbox } from '../src/lib/mailer'
import { env } from '../src/config/env'

const app = createApp()
const api = () => request(app)

// 1×1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)
const delta = (text: string, extra: object[] = []) => ({ ops: [{ insert: `${text}\n` }, ...extra] })

let alice: { token: string; id: number }
let bob: { token: string; id: number }
let admin: { token: string; id: number }

const register = async (email: string, username: string) => {
  const res = await api()
    .post('/api/auth/register')
    .send({ email, username, password: 'password123', avatarIndex: 2, interests: ['birds'] })
  expect(res.status).toBe(201)
  return { token: res.body.accessToken as string, id: res.body.user.id as number }
}
const auth = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` })

const upload = async (u: { token: string }, folder = 'photos') => {
  const res = await api()
    .post(`/api/images?folder=${folder}`)
    .set(auth(u))
    .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
  expect(res.status).toBe(201)
  return res.body[0] as { id: number; url: string }
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE users, articles, photo_posts, community_posts, comments, likes, polls, poll_options, poll_ballots, images, species, notifications, refresh_tokens, email_tokens, follows, blocks, bookmarks, identifications, reports RESTART IDENTITY CASCADE'
  )
  alice = await register('alice@example.com', 'Alice')
  bob = await register('bob@example.com', 'Bob')
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      username: 'Admin',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash('password123', 4)
    }
  })
  const res = await api().post('/api/auth/login').send({ email: 'admin@example.com', password: 'password123' })
  admin = { token: res.body.accessToken, id: adminUser.id }
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('auth', () => {
  it('rejects duplicate email and weak passwords', async () => {
    const dup = await api()
      .post('/api/auth/register')
      .send({ email: 'ALICE@example.com', username: 'A2', password: 'password123' })
    expect(dup.status).toBe(409)

    const weak = await api()
      .post('/api/auth/register')
      .send({ email: 'c@example.com', username: 'C', password: 'short' })
    expect(weak.status).toBe(422)
    expect(weak.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('logs in, returns /me without the password hash', async () => {
    const login = await api().post('/api/auth/login').send({ email: 'alice@example.com', password: 'password123' })
    expect(login.status).toBe(200)
    const me = await api().get('/api/auth/me').set(auth({ token: login.body.accessToken }))
    expect(me.body).toMatchObject({ email: 'alice@example.com', username: 'Alice', role: 'USER' })
    expect(me.body.passwordHash).toBeUndefined()
  })

  it('uses one message for unknown email and wrong password', async () => {
    const a = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'x' })
    const b = await api().post('/api/auth/login').send({ email: 'alice@example.com', password: 'wrong' })
    expect(a.status).toBe(401)
    expect(b.status).toBe(401)
    expect(a.body.error.message).toBe(b.body.error.message)
  })

  it('reports email availability', async () => {
    const res = await api().get('/api/auth/email-available?email=alice@example.com')
    expect(res.body.available).toBe(false)
  })

  it('rejects requests with no or forged tokens', async () => {
    expect((await api().get('/api/auth/me')).status).toBe(401)
    expect((await api().get('/api/auth/me').set('Authorization', 'Bearer nope')).status).toBe(401)
  })
})

describe('photo posts', () => {
  let photoId: number
  let imageUrl: string

  it('creates a post from uploaded images', async () => {
    const img = await upload(alice)
    imageUrl = img.url
    const res = await api()
      .post('/api/photos')
      .set(auth(alice))
      .send({
        title: '赤狐',
        description: '清晨在森林邊緣遇見的赤狐。',
        locationName: '北海道',
        latitude: 44.07,
        longitude: 145.12,
        imageIds: [img.id]
      })
    expect(res.status).toBe(201)
    photoId = res.body.id

    const detail = await api().get(`/api/photos/${photoId}`)
    expect(detail.body).toMatchObject({ title: '赤狐', likeCount: 0, commentCount: 0, likedByMe: false })
    expect(detail.body.images).toHaveLength(1)
    expect(detail.body.author).toMatchObject({ id: alice.id, username: 'Alice' })
  })

  it("refuses to attach someone else's image", async () => {
    const img = await upload(alice)
    const res = await api()
      .post('/api/photos')
      .set(auth(bob))
      .send({ title: '偷圖', description: '這不是我的圖片喔喔喔', locationName: 'x', latitude: 0, longitude: 0, imageIds: [img.id] })
    expect(res.status).toBe(403)
  })

  it('only lets the author (or admin) edit / delete', async () => {
    const patch = await api().patch(`/api/photos/${photoId}`).set(auth(bob)).send({ title: 'hack' })
    expect(patch.status).toBe(403)
    const ok = await api().patch(`/api/photos/${photoId}`).set(auth(alice)).send({ title: '赤狐（更新）' })
    expect(ok.status).toBe(200)
  })

  it('likes are per-user and idempotent', async () => {
    await api().put(`/api/photos/${photoId}/like`).set(auth(bob))
    const second = await api().put(`/api/photos/${photoId}/like`).set(auth(bob))
    expect(second.body).toEqual({ liked: true, likeCount: 1 })
    const alices = await api().put(`/api/photos/${photoId}/like`).set(auth(alice))
    expect(alices.body.likeCount).toBe(2)
    const unlike = await api().delete(`/api/photos/${photoId}/like`).set(auth(bob))
    expect(unlike.body).toEqual({ liked: false, likeCount: 1 })
    const anon = await api().put(`/api/photos/${photoId}/like`)
    expect(anon.status).toBe(401)
  })

  it('comments: create, list, only author/admin may delete', async () => {
    const c = await api().post(`/api/photos/${photoId}/comments`).set(auth(bob)).send({ content: '好美！' })
    expect(c.status).toBe(201)
    const list = await api().get(`/api/photos/${photoId}/comments`)
    expect(list.body.total).toBe(1)
    expect(list.body.items[0].author.username).toBe('Bob')

    expect((await api().delete(`/api/comments/${c.body.id}`).set(auth(alice))).status).toBe(403)
    expect((await api().delete(`/api/comments/${c.body.id}`).set(auth(admin))).status).toBe(204)
  })

  it('lists with search and pagination', async () => {
    const res = await api().get('/api/photos?q=赤狐&pageSize=5')
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 5, totalPages: 1 })
    expect(res.body.items[0].cover.url).toBe(imageUrl)
    const map = await api().get('/api/photos/map')
    expect(map.body[0]).toMatchObject({ latitude: 44.07, longitude: 145.12, coverUrl: imageUrl })
  })

  it('deleting a post removes its stored files', async () => {
    const file = path.join(UPLOAD_DIR, 'photos', path.basename(imageUrl))
    expect(existsSync(file)).toBe(true)
    expect((await api().delete(`/api/photos/${photoId}`).set(auth(alice))).status).toBe(204)
    expect(existsSync(file)).toBe(false)
    expect(await prisma.image.count({ where: { url: imageUrl } })).toBe(0)
  })
})

describe('community posts', () => {
  it('derives excerpt and attaches embedded images by URL', async () => {
    const img = await upload(alice, 'community')
    const res = await api()
      .post('/api/community-posts')
      .set(auth(alice))
      .send({ title: '新手求問', content: delta('拍鳥要用多快的快門？', [{ insert: { image: img.url } }]), tags: ['birds'], categoryKey: 'techniques' })
    expect(res.status).toBe(201)
    const detail = await api().get(`/api/community-posts/${res.body.id}`)
    expect(detail.body.excerpt).toContain('拍鳥要用多快的快門')
    expect(detail.body.coverUrl).toBe(img.url)

    // Removing the image from the content deletes it.
    await api()
      .patch(`/api/community-posts/${res.body.id}`)
      .set(auth(alice))
      .send({ content: delta('改成純文字內容了') })
    expect(await prisma.image.count({ where: { id: img.id } })).toBe(0)
  })

  it('rejects unknown tags', async () => {
    const res = await api()
      .post('/api/community-posts')
      .set(auth(alice))
      .send({ title: '標題標題', content: delta('內容內容內容'), tags: ['不存在'], categoryKey: 'gear' })
    expect(res.status).toBe(422)
  })

  it('filters by tag', async () => {
    const res = await api().get('/api/community-posts?tag=birds')
    expect(res.body.total).toBe(1)
  })

  it('detects the post language and filters by it', async () => {
    const en = await api()
      .post('/api/community-posts')
      .set(auth(alice))
      .send({ title: 'Best lens for owls at night?', content: delta('Looking for advice on low-light lenses for owl photography.'), categoryKey: 'gear' })
    expect(en.status).toBe(201)
    const zh = await api().get('/api/community-posts?language=zh-TW&pageSize=50')
    const enList = await api().get('/api/community-posts?language=en&pageSize=50')
    expect(enList.body.items.map((p: { id: number }) => p.id)).toContain(en.body.id)
    expect(zh.body.items.map((p: { id: number }) => p.id)).not.toContain(en.body.id)
    expect(enList.body.items.every((p: { language: string }) => p.language === 'en')).toBe(true)
    expect((await api().delete(`/api/community-posts/${en.body.id}`).set(auth(alice))).status).toBe(204)
  })
})

describe('polls', () => {
  let pollId: number
  let options: { id: number }[]

  it('hides results until the viewer votes', async () => {
    const created = await api()
      .post('/api/polls')
      .set(auth(alice))
      .send({ title: '最想看的動物？', endsAt: new Date(Date.now() + 86400_000).toISOString(), options: ['雪豹', '藍鯨'] })
    expect(created.status).toBe(201)
    pollId = created.body.id

    const asBob = await api().get(`/api/polls/${pollId}`).set(auth(bob))
    expect(asBob.body.showResults).toBe(false)
    expect(asBob.body.options[0].ballotCount).toBeNull()
    options = asBob.body.options

    const vote = await api().post(`/api/polls/${pollId}/ballots`).set(auth(bob)).send({ optionId: options[1]!.id })
    expect(vote.status).toBe(201)
    expect(vote.body).toMatchObject({ showResults: true, myOptionId: options[1]!.id, ballotCount: 1 })
  })

  it('prevents double voting and invalid options', async () => {
    const again = await api().post(`/api/polls/${pollId}/ballots`).set(auth(bob)).send({ optionId: options[0]!.id })
    expect(again.status).toBe(409)
    const bad = await api().post(`/api/polls/${pollId}/ballots`).set(auth(alice)).send({ optionId: 999999 })
    expect(bad.status).toBe(400)
  })

  it('filters voted / mine', async () => {
    const voted = await api().get('/api/polls?filter=voted').set(auth(bob))
    expect(voted.body.total).toBe(1)
    const mine = await api().get('/api/polls?filter=mine').set(auth(bob))
    expect(mine.body.total).toBe(0)
  })

  it('rejects polls that end in the past', async () => {
    const res = await api()
      .post('/api/polls')
      .set(auth(alice))
      .send({ title: '過去的投票', endsAt: '2020-01-01', options: ['a', 'b'] })
    expect(res.status).toBe(422)
  })
})

describe('articles & admin', () => {
  it('only admins can write articles; drafts are hidden from the public', async () => {
    const body = {
      title: '草稿文章',
      coverImageUrl: 'https://example.com/a.jpg',
      content: delta('內容'),
      tags: ['habitat'],
      status: 'DRAFT'
    }
    expect((await api().post('/api/articles').set(auth(alice)).send(body)).status).toBe(403)
    const created = await api().post('/api/articles').set(auth(admin)).send(body)
    expect(created.status).toBe(201)

    expect((await api().get(`/api/articles/${created.body.id}`)).status).toBe(404)
    expect((await api().get('/api/articles')).body.total).toBe(0)
    expect((await api().get('/api/articles?status=ALL').set(auth(admin))).body.total).toBe(1)

    // A partial update must not reset omitted fields (status / tags).
    await api().patch(`/api/articles/${created.body.id}`).set(auth(admin)).send({ title: '改標題' })
    const draft = await api().get(`/api/articles/${created.body.id}`).set(auth(admin))
    expect(draft.body).toMatchObject({ title: '改標題', status: 'DRAFT', tags: ['habitat'] })

    await api().patch(`/api/articles/${created.body.id}`).set(auth(admin)).send({ status: 'PUBLISHED' })
    const pub = await api().get(`/api/articles/${created.body.id}`)
    expect(pub.status).toBe(200)
    expect(pub.body.publishedAt).toBeTruthy()
  })

  it('protects admin endpoints', async () => {
    expect((await api().get('/api/admin/stats')).status).toBe(401)
    expect((await api().get('/api/admin/stats').set(auth(alice))).status).toBe(403)
    const stats = await api().get('/api/admin/stats').set(auth(admin))
    expect(stats.status).toBe(200)
    expect(stats.body.totals.users).toBe(3)
    expect(stats.body.series).toHaveLength(30)
  })

  it('admin can manage users but not demote / delete themselves', async () => {
    const list = await api().get('/api/admin/users?q=bob').set(auth(admin))
    expect(list.body.items).toHaveLength(1)
    expect((await api().patch(`/api/admin/users/${admin.id}`).set(auth(admin)).send({ role: 'USER' })).status).toBe(400)
    expect((await api().delete(`/api/admin/users/${admin.id}`).set(auth(admin))).status).toBe(400)
    expect((await api().delete(`/api/admin/users/${bob.id}`).set(auth(admin))).status).toBe(204)
    expect((await api().get(`/api/users/${bob.id}`)).status).toBe(404)
  })

  it('serves the tag catalogue', async () => {
    const res = await api().get('/api/meta/tags')
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body[0]).toHaveProperty('tags')
  })
})

describe('profiles', () => {
  it('updates own profile and password', async () => {
    const res = await api().patch('/api/users/me').set(auth(alice)).send({ bio: '愛拍鳥', avatarIndex: 5 })
    expect(res.body).toMatchObject({ bio: '愛拍鳥', avatarIndex: 5 })

    const bad = await api().put('/api/users/me/password').set(auth(alice)).send({ currentPassword: 'nope', newPassword: 'newpass123' })
    expect(bad.status).toBe(400)
    const ok = await api().put('/api/users/me/password').set(auth(alice)).send({ currentPassword: 'password123', newPassword: 'newpass123' })
    expect(ok.status).toBe(204)
    const login = await api().post('/api/auth/login').send({ email: 'alice@example.com', password: 'newpass123' })
    expect(login.status).toBe(200)
  })

  it('returns public profile stats', async () => {
    const res = await api().get(`/api/users/${alice.id}`)
    expect(res.body.email).toBeUndefined()
    expect(res.body.stats).toMatchObject({ postCount: 1, pollCount: 1 })
  })
})

describe('species & field records', () => {
  let carol: { token: string; id: number }
  let foxId: number
  let turtleId: number
  let turtlePhotoId: number
  let hiddenPhotoId: number

  const photoBody = async (u: { token: string }, extra: object) => ({
    title: '野外紀錄',
    description: '這是一筆野外觀察的紀錄。',
    locationName: '台灣 屏東 小琉球',
    latitude: 22.34,
    longitude: 120.37,
    imageIds: [(await upload(u)).id],
    ...extra
  })

  beforeAll(async () => {
    carol = await register('carol@example.com', 'Carol')
  })

  it('only admins manage the species catalogue', async () => {
    const fox = { commonName: '赤狐', scientificName: 'Vulpes vulpes', englishName: 'Red Fox', group: 'MAMMAL' }
    expect((await api().post('/api/species').set(auth(alice)).send(fox)).status).toBe(403)
    const created = await api().post('/api/species').set(auth(admin)).send(fox)
    expect(created.status).toBe(201)
    foxId = created.body.id
    const turtle = await api()
      .post('/api/species')
      .set(auth(admin))
      .send({ commonName: '綠蠵龜', scientificName: 'Chelonia mydas', group: 'REPTILE', status: 'EN', sensitive: true })
    turtleId = turtle.body.id
    expect((await api().post('/api/species').set(auth(admin)).send(fox)).status).toBe(409)

    // PATCH must not reset defaults (status / sensitive) of omitted fields.
    await api().patch(`/api/species/${turtleId}`).set(auth(admin)).send({ englishName: 'Green Sea Turtle' })
    const detail = await api().get(`/api/species/${turtleId}`)
    expect(detail.body).toMatchObject({ status: 'EN', sensitive: true, englishName: 'Green Sea Turtle' })
  })

  it('validates new photo fields', async () => {
    const future = await api()
      .post('/api/photos')
      .set(auth(alice))
      .send(await photoBody(alice, { takenAt: new Date(Date.now() + 86400_000).toISOString() }))
    expect(future.status).toBe(422)
    const unknown = await api().post('/api/photos').set(auth(alice)).send(await photoBody(alice, { speciesId: 99999 }))
    expect(unknown.status).toBe(400)
  })

  it('forces sensitive species to APPROX and fuzzes coordinates for other viewers', async () => {
    const res = await api()
      .post('/api/photos')
      .set(auth(alice))
      .send(
        await photoBody(alice, {
          speciesId: turtleId,
          locationPrecision: 'EXACT',
          takenAt: '2026-07-03T09:15:00+08:00',
          exif: { camera: 'Canon EOS R5', aperture: 'f/7.1', iso: 800 }
        })
      )
    expect(res.status).toBe(201)
    turtlePhotoId = res.body.id

    const anon = await api().get(`/api/photos/${turtlePhotoId}`)
    expect(anon.body).toMatchObject({
      locationPrecision: 'APPROX',
      latitude: 22.35,
      longitude: 120.35,
      exif: { camera: 'Canon EOS R5', iso: 800 },
      species: { id: turtleId, commonName: '綠蠵龜', status: 'EN', sensitive: true }
    })
    const other = await api().get(`/api/photos/${turtlePhotoId}`).set(auth(carol))
    expect(other.body.latitude).toBe(22.35)
    for (const viewer of [alice, admin]) {
      const own = await api().get(`/api/photos/${turtlePhotoId}`).set(auth(viewer))
      expect(own.body).toMatchObject({ latitude: 22.34, longitude: 120.37 })
    }

    // Switching to EXACT later is still refused.
    await api().patch(`/api/photos/${turtlePhotoId}`).set(auth(alice)).send({ locationPrecision: 'EXACT' })
    expect((await api().get(`/api/photos/${turtlePhotoId}`)).body.locationPrecision).toBe('APPROX')

    const list = await api().get(`/api/photos?speciesId=${turtleId}`)
    expect(list.body.total).toBe(1)
    expect(list.body.items[0]).toMatchObject({ latitude: 22.35, longitude: 120.35, locationPrecision: 'APPROX' })
  })

  it('hides HIDDEN locations and excludes them from the map', async () => {
    const res = await api()
      .post('/api/photos')
      .set(auth(alice))
      .send(await photoBody(alice, { speciesId: foxId, locationPrecision: 'HIDDEN', takenAt: '2026-01-18' }))
    hiddenPhotoId = res.body.id
    const anon = await api().get(`/api/photos/${hiddenPhotoId}`)
    expect(anon.body).toMatchObject({ latitude: null, longitude: null, locationPrecision: 'HIDDEN' })
    expect((await api().get(`/api/photos/${hiddenPhotoId}`).set(auth(alice))).body.latitude).toBe(22.34)

    const map = await api().get('/api/photos/map')
    const ids = map.body.map((m: { id: number }) => m.id)
    expect(ids).toContain(turtlePhotoId)
    expect(ids).not.toContain(hiddenPhotoId)
    const turtle = map.body.find((m: { id: number }) => m.id === turtlePhotoId)
    expect(turtle).toMatchObject({ latitude: 22.35, speciesId: turtleId, locationPrecision: 'APPROX' })

    expect((await api().get('/api/photos/map?month=7')).body).toHaveLength(1)
    expect((await api().get('/api/photos/map?month=1')).body).toHaveLength(0)
    expect((await api().get('/api/photos?month=1')).body.total).toBe(1)
  })

  it('lists species with photo counts and per-species stats', async () => {
    const list = await api().get('/api/species?sort=name')
    expect(list.body.total).toBe(2)
    const popular = await api().get('/api/species')
    expect(popular.body.items.map((s: { photoCount: number }) => s.photoCount)).toEqual([1, 1])
    expect(popular.body.items[0].coverUrl).toMatch(/uploads/)
    expect((await api().get('/api/species?q=chelonia')).body.items[0].id).toBe(turtleId)
    expect((await api().get('/api/species?group=BIRD')).body.total).toBe(0)

    await api()
      .post('/api/photos')
      .set(auth(carol))
      .send(await photoBody(carol, { speciesId: turtleId, takenAt: '2026-08-01T00:00:00Z' }))
    expect((await api().get('/api/species')).body.items[0]).toMatchObject({ id: turtleId, photoCount: 2 })
    const detail = await api().get(`/api/species/${turtleId}`)
    expect(detail.body.stats).toMatchObject({ photoCount: 2, observerCount: 2 })
    expect(detail.body.stats.monthly).toHaveLength(12)
    expect(detail.body.stats.monthly[6]).toBe(1)
    expect(detail.body.stats.monthly[7]).toBe(1)
    expect(new Date(detail.body.stats.firstSeenAt).toISOString()).toBe('2026-07-03T01:15:00.000Z')
  })

  it('builds the life list and speciesCount', async () => {
    const profile = await api().get(`/api/users/${alice.id}`)
    expect(profile.body.stats.speciesCount).toBe(2)
    const life = (await api().get(`/api/users/${alice.id}/species`)).body
    expect(life.items).toHaveLength(2)
    // The turtle (July) was first photographed after the fox (January).
    expect(life.items[0]).toMatchObject({ species: { id: turtleId, commonName: '綠蠵龜' }, photoCount: 1 })
    expect(life.items[1].species.id).toBe(foxId)
    expect(life.items[0].coverUrl).toMatch(/uploads/)
    // Year lists and group counts
    expect(life.byYear.reduce((n: number, y: { species: number }) => n + y.species, 0)).toBeGreaterThanOrEqual(2)
    expect(life.byGroup.map((g: { group: string }) => g.group).sort()).toEqual(['MAMMAL', 'REPTILE'])
    expect((await api().get('/api/users/999999/species')).status).toBe(404)
  })

  it('notifies authors about likes and comments', async () => {
    const unread = async () => (await api().get('/api/notifications/unread-count').set(auth(alice))).body.count
    expect((await api().get('/api/notifications')).status).toBe(401)
    expect(await unread()).toBe(0)

    // Liking your own content is silent; repeat likes don't duplicate.
    await api().put(`/api/photos/${turtlePhotoId}/like`).set(auth(alice))
    await api().put(`/api/photos/${turtlePhotoId}/like`).set(auth(carol))
    await api().put(`/api/photos/${turtlePhotoId}/like`).set(auth(carol))
    expect(await unread()).toBe(1)

    // Unliking removes the unread notification.
    await api().delete(`/api/photos/${turtlePhotoId}/like`).set(auth(carol))
    expect(await unread()).toBe(0)
    await api().put(`/api/photos/${turtlePhotoId}/like`).set(auth(carol))

    const long = '好'.repeat(100)
    await api().post(`/api/photos/${turtlePhotoId}/comments`).set(auth(carol)).send({ content: long })
    await api().post(`/api/photos/${turtlePhotoId}/comments`).set(auth(alice)).send({ content: '謝謝！' })
    expect(await unread()).toBe(2)

    const list = await api().get('/api/notifications').set(auth(alice))
    expect(list.body.total).toBe(2)
    const [comment, like] = list.body.items
    expect(comment).toMatchObject({
      type: 'COMMENT',
      readAt: null,
      actor: { id: carol.id, username: 'Carol' },
      target: { type: 'photo', id: turtlePhotoId, title: '野外紀錄' }
    })
    expect(comment.comment.excerpt).toHaveLength(80)
    expect(like).toMatchObject({ type: 'LIKE', comment: null, target: { type: 'photo' } })

    expect((await api().post('/api/notifications/read').set(auth(alice)).send({ ids: [like.id] })).status).toBe(204)
    expect(await unread()).toBe(1)
    expect((await api().post('/api/notifications/read').set(auth(alice))).status).toBe(204)
    expect(await unread()).toBe(0)
    // Carol can't see Alice's notifications.
    expect((await api().get('/api/notifications').set(auth(carol))).body.total).toBe(0)
  })

  it('deleting a species keeps its photos', async () => {
    expect((await api().delete(`/api/species/${foxId}`).set(auth(admin))).status).toBe(204)
    const photo = await api().get(`/api/photos/${hiddenPhotoId}`)
    expect(photo.status).toBe(200)
    expect(photo.body.species).toBeNull()
  })

  it('groups months in Asia/Taipei time, including the createdAt fallback', async () => {
    const owl = await api()
      .post('/api/species')
      .set(auth(admin))
      .send({ commonName: '領角鴞', scientificName: 'Otus lettia', group: 'BIRD' })
    const speciesId = owl.body.id as number

    // 07-01 03:00 in Taipei is still 06-30 in UTC.
    const taken = await api()
      .post('/api/photos')
      .set(auth(alice))
      .send(await photoBody(alice, { speciesId, takenAt: '2026-07-01T03:00:00+08:00' }))
    // No takenAt: falls back to createdAt, 06-30 17:00 UTC = 07-01 01:00 Taipei.
    const untimed = await api().post('/api/photos').set(auth(alice)).send(await photoBody(alice, { speciesId }))
    await prisma.photoPost.update({
      where: { id: untimed.body.id },
      data: { createdAt: new Date('2026-06-30T17:00:00Z') }
    })

    const july = (await api().get(`/api/photos/map?speciesId=${speciesId}&month=7`)).body
    expect(july.map((p: { id: number }) => p.id)).toEqual([taken.body.id])
    expect((await api().get(`/api/photos/map?speciesId=${speciesId}&month=6`)).body).toHaveLength(0)
    expect((await api().get(`/api/photos?speciesId=${speciesId}&month=7`)).body.total).toBe(1)

    const { stats } = (await api().get(`/api/species/${speciesId}`)).body
    expect(stats.monthly[5]).toBe(0)
    expect(stats.monthly[6]).toBe(2)
  })
})

// ── Launch readiness (phase 2) ────────────────────────────────────────────────

type Session = { token: string; refreshToken: string; id: number }

const signUp = async (name: string, extra: object = {}): Promise<Session> => {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ email: `${name}@example.com`, username: name, password: 'password123', ...extra })
  expect(res.status).toBe(201)
  return { token: res.body.accessToken, refreshToken: res.body.refreshToken, id: res.body.user.id }
}

/** Waits for the newest e-mail to `to` and returns the token in its link. */
const mailToken = async (to: string, path: string) => {
  let token = ''
  await vi.waitFor(() => {
    const mail = [...outbox].reverse().find((m) => m.to === to && m.text.includes(path))
    const match = mail?.text.match(/token=([\w-]+)/)
    if (!match?.[1]) throw new Error('mail not sent yet')
    token = match[1]
  })
  return token
}

const createPhoto = async (u: { token: string }, extra: object = {}) => {
  const img = await upload(u)
  const res = await api()
    .post('/api/v1/photos')
    .set(auth(u))
    .send({
      title: '觀察紀錄',
      description: '這是一筆野外觀察的紀錄。',
      locationName: '台灣',
      latitude: 23.5,
      longitude: 121.0,
      imageIds: [img.id],
      ...extra
    })
  expect(res.status).toBe(201)
  return res.body.id as number
}

describe('API versioning & ops', () => {
  it('serves /api/v1 and keeps /api as an alias', async () => {
    const v1 = await api().get('/api/v1/meta/tags')
    const legacy = await api().get('/api/meta/tags')
    expect(v1.status).toBe(200)
    expect(legacy.body).toEqual(v1.body)
  })

  it('checks the database in /health and sets x-request-id', async () => {
    const res = await api().get('/api/v1/health').set('x-request-id', 'trace-123')
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' })
    expect(res.headers['x-request-id']).toBe('trace-123')
    const generated = await api().get('/api/health')
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('auth sessions', () => {
  it('returns access + refresh tokens and the extended user', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .set('Accept-Language', 'en-US,en;q=0.9')
      .send({ email: 'hana@example.com', username: 'Hana', password: 'password123' })
    expect(res.body).toMatchObject({ expiresIn: 900, user: { emailVerified: false, locale: 'en' } })
    expect(res.body.token).toBeUndefined()
    expect(res.body.refreshToken).toHaveLength(64)
    expect(await prisma.refreshToken.count({ where: { tokenHash: res.body.refreshToken } })).toBe(0)

    const explicit = await signUp('ivan', { locale: 'zh-TW' })
    const me = await api().get('/api/v1/auth/me').set(auth(explicit))
    expect(me.body.locale).toBe('zh-TW')
  })

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const s = await signUp('jade')
    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })
    expect(first.status).toBe(200)
    expect(first.body.refreshToken).not.toBe(s.refreshToken)
    expect(first.body.user.id).toBe(s.id)

    // Reusing the old token: rejected, and the token issued from it dies too.
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401)
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: first.body.refreshToken })).status).toBe(401)
  })

  it('logs out one session or all of them', async () => {
    const s = await signUp('kai')
    const login = await api().post('/api/v1/auth/login').send({ email: 'kai@example.com', password: 'password123' })
    expect((await api().post('/api/v1/auth/logout').send({ refreshToken: s.refreshToken })).status).toBe(204)
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401)
    // The other device is still signed in…
    const other = await api().post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken })
    expect(other.status).toBe(200)
    // …until logout-all.
    expect((await api().post('/api/v1/auth/logout-all').set(auth(s))).status).toBe(204)
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: other.body.refreshToken })).status).toBe(401)
  })
})

describe('e-mail verification & password reset', () => {
  it('verifies the address with a one-time token', async () => {
    const s = await signUp('lena', { locale: 'en' })
    const token = await mailToken('lena@example.com', 'http://localhost:5173/en/verify-email?token=')
    expect((await api().post('/api/v1/auth/verify-email').send({ token })).status).toBe(204)
    expect((await api().get('/api/v1/auth/me').set(auth(s))).body.emailVerified).toBe(true)
    expect((await api().post('/api/v1/auth/verify-email').send({ token })).status).toBe(400)

    expect((await api().post('/api/v1/auth/resend-verification')).status).toBe(401)
  })

  it('resends verification, invalidating the previous link', async () => {
    const s = await signUp('milo')
    const first = await mailToken('milo@example.com', '/verify-email?token=')
    expect((await api().post('/api/v1/auth/resend-verification').set(auth(s))).status).toBe(204)
    await vi.waitFor(() => expect(outbox.filter((m) => m.to === 'milo@example.com')).toHaveLength(2))
    const second = await mailToken('milo@example.com', '/verify-email?token=')
    expect(second).not.toBe(first)
    expect((await api().post('/api/v1/auth/verify-email').send({ token: first })).status).toBe(400)
    expect((await api().post('/api/v1/auth/verify-email').send({ token: second })).status).toBe(204)
  })

  it('resets the password and signs out every session', async () => {
    const s = await signUp('nora')
    expect((await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' })).status).toBe(204)
    expect((await api().post('/api/v1/auth/forgot-password').send({ email: 'nora@example.com' })).status).toBe(204)
    const token = await mailToken('nora@example.com', 'http://localhost:5173/reset-password?token=')
    const reset = await api().post('/api/v1/auth/reset-password').send({ token, password: 'brandnew123' })
    expect(reset.status).toBe(204)
    expect((await api().post('/api/v1/auth/reset-password').send({ token, password: 'another123' })).status).toBe(400)
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401)
    const login = await api().post('/api/v1/auth/login').send({ email: 'nora@example.com', password: 'brandnew123' })
    expect(login.status).toBe(200)
    expect(outbox.some((m) => m.to === 'nobody@example.com')).toBe(false)
  })

  it('can require a verified e-mail before creating content', async () => {
    const s = await signUp('otto')
    env.REQUIRE_EMAIL_VERIFICATION = true
    try {
      const res = await api()
        .post('/api/v1/community-posts')
        .set(auth(s))
        .send({ title: '標題標題', content: delta('內容內容內容'), categoryKey: 'beginners' })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED')
      const token = await mailToken('otto@example.com', '/verify-email?token=')
      await api().post('/api/v1/auth/verify-email').send({ token })
      const ok = await api()
        .post('/api/v1/community-posts')
        .set(auth(s))
        .send({ title: '標題標題', content: delta('內容內容內容'), categoryKey: 'beginners' })
      expect(ok.status).toBe(201)
    } finally {
      env.REQUIRE_EMAIL_VERIFICATION = false
    }
  })
})

describe('account rights', () => {
  it('exports the account as a JSON attachment', async () => {
    const s = await signUp('pia')
    await createPhoto(s)
    const res = await api().get('/api/v1/users/me/export').set(auth(s))
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="wildlens-export-\d+\.json"/)
    expect(res.body.profile).toMatchObject({ email: 'pia@example.com' })
    expect(res.body.photos[0].imageUrls[0]).toMatch(/uploads/)
    for (const key of ['communityPosts', 'comments', 'polls', 'ballots', 'bookmarks', 'following', 'followers', 'images']) {
      expect(Array.isArray(res.body[key])).toBe(true)
    }
  })

  it('deletes the account (password required) with its files', async () => {
    const s = await signUp('quin')
    await createPhoto(s)
    const files = await prisma.image.findMany({ where: { ownerId: s.id }, select: { url: true } })
    const file = path.join(UPLOAD_DIR, 'photos', path.basename(files[0]!.url))
    expect((await api().delete('/api/v1/users/me').set(auth(s)).send({ password: 'wrong' })).status).toBe(400)
    expect((await api().delete('/api/v1/users/me').set(auth(s)).send({ password: 'password123' })).status).toBe(204)
    expect((await api().get(`/api/v1/users/${s.id}`)).status).toBe(404)
    expect(existsSync(file)).toBe(false)
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401)
  })
})

describe('follow, feed & bookmarks', () => {
  let rex: Session
  let sam: Session
  let photoId: number

  beforeAll(async () => {
    rex = await signUp('rex')
    sam = await signUp('sam')
    photoId = await createPhoto(sam)
  })

  it('follows / unfollows and reports follower stats', async () => {
    expect((await api().put(`/api/v1/users/${rex.id}/follow`).set(auth(rex))).status).toBe(400)
    const res = await api().put(`/api/v1/users/${sam.id}/follow`).set(auth(rex))
    expect(res.body).toEqual({ following: true, followerCount: 1 })
    await api().put(`/api/v1/users/${sam.id}/follow`).set(auth(rex))

    const profile = await api().get(`/api/v1/users/${sam.id}`).set(auth(rex))
    expect(profile.body).toMatchObject({ followedByMe: true, stats: { followerCount: 1, followingCount: 0 } })
    expect((await api().get(`/api/v1/users/${sam.id}`)).body.followedByMe).toBe(false)

    const followers = await api().get(`/api/v1/users/${sam.id}/followers`)
    expect(followers.body.items).toEqual([expect.objectContaining({ id: rex.id, username: 'rex' })])
    expect((await api().get(`/api/v1/users/${rex.id}/following`)).body.items[0].id).toBe(sam.id)

    const notes = await api().get('/api/v1/notifications').set(auth(sam))
    expect(notes.body.items[0]).toMatchObject({ type: 'FOLLOW', target: null, actor: { id: rex.id } })
  })

  it('builds the feed from followed users', async () => {
    const feed = await api().get('/api/v1/feed').set(auth(rex))
    expect(feed.body.items.map((p: { id: number }) => p.id)).toEqual([photoId])
    expect(feed.body.items[0]).toHaveProperty('quality')
    expect((await api().get('/api/v1/feed').set(auth(sam))).body.total).toBe(0)
    expect((await api().get('/api/v1/feed')).status).toBe(401)

    const unfollow = await api().delete(`/api/v1/users/${sam.id}/follow`).set(auth(rex))
    expect(unfollow.body).toEqual({ following: false, followerCount: 0 })
    expect((await api().get('/api/v1/feed').set(auth(rex))).body.total).toBe(0)
  })

  it('bookmarks photos, posts and articles', async () => {
    expect((await api().put(`/api/v1/photos/${photoId}/bookmark`).set(auth(rex))).body).toEqual({ bookmarked: true })
    await api().put(`/api/v1/photos/${photoId}/bookmark`).set(auth(rex))
    expect((await api().get(`/api/v1/photos/${photoId}`).set(auth(rex))).body.bookmarkedByMe).toBe(true)
    expect((await api().get(`/api/v1/photos/${photoId}`)).body.bookmarkedByMe).toBe(false)

    const post = await api()
      .post('/api/v1/community-posts')
      .set(auth(sam))
      .send({ title: '收藏測試', content: delta('一篇可以收藏的貼文'), categoryKey: 'field-reports' })
    await api().put(`/api/v1/community-posts/${post.body.id}/bookmark`).set(auth(rex))
    const article = (await api().get('/api/v1/articles')).body.items[0]
    await api().put(`/api/v1/articles/${article.id}/bookmark`).set(auth(rex))
    expect((await api().get(`/api/v1/articles/${article.id}`).set(auth(rex))).body.bookmarkedByMe).toBe(true)

    const photos = await api().get('/api/v1/users/me/bookmarks?type=photo').set(auth(rex))
    expect(photos.body.items).toEqual([expect.objectContaining({ id: photoId, cover: expect.any(Object) })])
    const posts = await api().get('/api/v1/users/me/bookmarks?type=community').set(auth(rex))
    expect(posts.body.items[0]).toMatchObject({ id: post.body.id, title: '收藏測試' })
    const articles = await api().get('/api/v1/users/me/bookmarks?type=article').set(auth(rex))
    expect(articles.body.items[0]).toMatchObject({ id: article.id, likeCount: expect.any(Number) })

    expect((await api().delete(`/api/v1/photos/${photoId}/bookmark`).set(auth(rex))).body).toEqual({ bookmarked: false })
    expect((await api().get('/api/v1/users/me/bookmarks').set(auth(rex))).body.total).toBe(0)
  })
})

describe('community identification', () => {
  let owner: Session
  let voters: Session[]
  let fox: number
  let wolf: number
  let photoId: number

  const quality = async () => (await api().get(`/api/v1/photos/${photoId}`)).body.quality

  beforeAll(async () => {
    owner = await signUp('tess')
    voters = [await signUp('uma'), await signUp('vic'), await signUp('wes')]
    fox = (await api().post('/api/v1/species').set(auth(admin)).send({ commonName: '狐', scientificName: 'Vulpes testus', group: 'MAMMAL' })).body.id
    wolf = (await api().post('/api/v1/species').set(auth(admin)).send({ commonName: '狼', scientificName: 'Canis testus', group: 'MAMMAL' })).body.id
    photoId = await createPhoto(owner, { speciesId: fox, takenAt: '2026-05-01' })
  })

  it('grades data quality from identifications', async () => {
    expect(await quality()).toBe('NEEDS_ID')
    const casual = await createPhoto(owner, { speciesId: fox })
    expect((await api().get(`/api/v1/photos/${casual}`)).body.quality).toBe('CASUAL')

    const [uma, vic, wes] = voters as [Session, Session, Session]
    const first = await api().post(`/api/v1/photos/${photoId}/identifications`).set(auth(uma)).send({ speciesId: fox, comment: '耳朵是狐狸' })
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ agrees: true, comment: '耳朵是狐狸', species: { id: fox }, author: { id: uma.id } })
    expect(await quality()).toBe('CONFIRMED') // 2 of 2

    await api().post(`/api/v1/photos/${photoId}/identifications`).set(auth(vic)).send({ speciesId: wolf })
    expect(await quality()).toBe('CONFIRMED') // 2 of 3
    await api().post(`/api/v1/photos/${photoId}/identifications`).set(auth(wes)).send({ speciesId: wolf })
    expect(await quality()).toBe('NEEDS_ID') // 2 of 4

    // Changing one's mind updates the same row.
    const again = await api().post(`/api/v1/photos/${photoId}/identifications`).set(auth(wes)).send({ speciesId: fox })
    expect(again.status).toBe(200)
    expect(await quality()).toBe('CONFIRMED') // 3 of 4

    const list = await api().get(`/api/v1/photos/${photoId}/identifications`)
    expect(list.body).toHaveLength(3)
    expect(list.body.find((i: { author: { id: number } }) => i.author.id === vic.id).agrees).toBe(false)
    const detail = await api().get(`/api/v1/photos/${photoId}`)
    expect(detail.body.identificationCount).toBe(3)

    const confirmed = await api().get('/api/v1/photos?quality=CONFIRMED')
    expect(confirmed.body.items.map((p: { id: number }) => p.id)).toContain(photoId)
    expect((await api().get('/api/v1/photos?quality=CASUAL')).body.items.map((p: { id: number }) => p.id)).toContain(casual)
  })

  it("lets the author's identification replace their implicit vote", async () => {
    // Votes now: uma fox, vic wolf, wes fox, author (implicit) fox → 3/4.
    await api().post(`/api/v1/photos/${photoId}/identifications`).set(auth(owner)).send({ speciesId: wolf })
    expect(await quality()).toBe('NEEDS_ID') // fox 2 of 4
    expect((await api().delete(`/api/v1/photos/${photoId}/identifications/me`).set(auth(owner))).status).toBe(204)
    expect(await quality()).toBe('CONFIRMED')
  })

  it('notifies the photo author and cleans up on withdrawal', async () => {
    const notes = await api().get('/api/v1/notifications').set(auth(owner))
    const ids = notes.body.items.filter((n: { type: string }) => n.type === 'IDENTIFICATION')
    expect(ids).toHaveLength(3)
    expect(ids[0].target).toMatchObject({ type: 'photo', id: photoId })

    await api().delete(`/api/v1/photos/${photoId}/identifications/me`).set(auth(voters[1]!))
    const after = await api().get('/api/v1/notifications').set(auth(owner))
    expect(after.body.items.filter((n: { type: string }) => n.type === 'IDENTIFICATION')).toHaveLength(2)
    expect(await quality()).toBe('CONFIRMED') // fox 3 of 3
    expect((await api().post(`/api/v1/photos/${photoId}/identifications`).set(auth(voters[0]!)).send({ speciesId: 999999 })).status).toBe(400)
  })
})

describe('reports & blocks', () => {
  let xia: Session
  let yan: Session
  let photoId: number
  let commentId: number

  beforeAll(async () => {
    xia = await signUp('xia')
    yan = await signUp('yan')
    photoId = await createPhoto(yan)
    commentId = (await api().post(`/api/v1/photos/${photoId}/comments`).set(auth(yan)).send({ content: '自己的留言' })).body.id
  })

  it('accepts one open report per target and feeds the admin queue', async () => {
    const body = { targetType: 'photo', targetId: photoId, reason: 'SENSITIVE_LOCATION', note: '這是石虎的精確位置' }
    expect((await api().post('/api/v1/reports').set(auth(xia)).send(body)).status).toBe(201)
    expect((await api().post('/api/v1/reports').set(auth(xia)).send(body)).status).toBe(409)
    expect((await api().post('/api/v1/reports').set(auth(xia)).send({ ...body, targetId: 999999 })).status).toBe(404)
    expect((await api().post('/api/v1/reports').set(auth(xia)).send({ targetType: 'user', targetId: xia.id, reason: 'SPAM' })).status).toBe(400)
    await api().post('/api/v1/reports').set(auth(xia)).send({ targetType: 'comment', targetId: commentId, reason: 'HARASSMENT' })

    expect((await api().get('/api/v1/admin/reports').set(auth(xia))).status).toBe(403)
    const stats = await api().get('/api/v1/admin/stats').set(auth(admin))
    expect(stats.body.totals.openReports).toBe(2)

    const queue = await api().get('/api/v1/admin/reports?status=OPEN').set(auth(admin))
    expect(queue.body.total).toBe(2)
    const [photoReport, commentReport] = queue.body.items
    expect(photoReport).toMatchObject({
      targetType: 'photo',
      reason: 'SENSITIVE_LOCATION',
      status: 'OPEN',
      reporter: { id: xia.id },
      target: { title: '觀察紀錄', url: `/gallery/${photoId}`, author: { id: yan.id } }
    })
    expect(commentReport.target).toMatchObject({ excerpt: '自己的留言', url: `/gallery/${photoId}#comment-${commentId}` })

    const resolved = await api()
      .patch(`/api/v1/admin/reports/${photoReport.id}`)
      .set(auth(admin))
      .send({ status: 'RESOLVED', resolutionNote: '已改為模糊位置' })
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolutionNote: '已改為模糊位置', resolvedAt: expect.any(String) })
    // Once handled, the same user may report it again.
    expect((await api().post('/api/v1/reports').set(auth(xia)).send(body)).status).toBe(201)

    // Deleted targets come back as null.
    await api().delete(`/api/v1/comments/${commentId}`).set(auth(yan))
    const after = await api().get('/api/v1/admin/reports').set(auth(admin))
    expect(after.body.items.find((r: { id: number }) => r.id === commentReport.id).target).toBeNull()
  })

  it('blocking hides content both ways and stops interaction', async () => {
    await api().put(`/api/v1/users/${yan.id}/follow`).set(auth(xia))
    await api().put(`/api/v1/users/${xia.id}/follow`).set(auth(yan))
    const xiaPhoto = await createPhoto(xia)

    expect((await api().put(`/api/v1/users/${xia.id}/block`).set(auth(xia))).status).toBe(400)
    expect((await api().put(`/api/v1/users/${yan.id}/block`).set(auth(xia))).body).toEqual({ blocked: true })
    expect((await api().get('/api/v1/users/me/blocks').set(auth(xia))).body).toEqual([expect.objectContaining({ id: yan.id })])
    expect(await prisma.follow.count({ where: { OR: [{ followerId: xia.id }, { followerId: yan.id }] } })).toBe(0)

    // Neither sees the other's photos.
    const ids = async (s: Session) => (await api().get('/api/v1/photos?pageSize=50').set(auth(s))).body.items.map((p: { id: number }) => p.id)
    expect(await ids(xia)).not.toContain(photoId)
    expect(await ids(yan)).not.toContain(xiaPhoto)
    expect((await api().get(`/api/v1/photos/${photoId}`).set(auth(xia))).status).toBe(404)
    expect((await api().get(`/api/v1/photos/${photoId}`)).status).toBe(200)

    // The blocked user can't comment, like, follow or identify (403); reads are hidden (404).
    expect((await api().post(`/api/v1/photos/${xiaPhoto}/comments`).set(auth(yan)).send({ content: 'hi' })).status).toBe(403)
    expect((await api().put(`/api/v1/photos/${xiaPhoto}/like`).set(auth(yan))).status).toBe(403)
    expect((await api().put(`/api/v1/users/${xia.id}/follow`).set(auth(yan))).status).toBe(403)
    const owlId = (await prisma.species.findFirstOrThrow({ select: { id: true } })).id
    expect((await api().post(`/api/v1/photos/${xiaPhoto}/identifications`).set(auth(yan)).send({ speciesId: owlId })).status).toBe(403)
    expect((await api().get(`/api/v1/photos/${xiaPhoto}/comments`).set(auth(yan))).status).toBe(404)

    // Comments by the blocked user disappear from shared threads.
    const third = await signUp('zed')
    const shared = await createPhoto(third)
    await api().post(`/api/v1/photos/${shared}/comments`).set(auth(yan)).send({ content: '被封鎖者的留言' })
    expect((await api().get(`/api/v1/photos/${shared}/comments`).set(auth(xia))).body.total).toBe(0)
    expect((await api().get(`/api/v1/photos/${shared}/comments`)).body.total).toBe(1)

    expect((await api().delete(`/api/v1/users/${yan.id}/block`).set(auth(xia))).body).toEqual({ blocked: false })
    expect((await api().get(`/api/v1/photos/${photoId}`).set(auth(xia))).status).toBe(200)
  })
})

describe('bilingual API', () => {
  it('localises errors from Accept-Language or ?lang=', async () => {
    const zh = await api().get('/api/v1/photos/999999')
    expect(zh.body.error.message).toBe('找不到此照片')
    const en = await api().get('/api/v1/photos/999999').set('Accept-Language', 'en-GB,en;q=0.8')
    expect(en.body.error.message).toBe('Photo not found')
    const query = await api().get('/api/v1/photos/999999?lang=en').set('Accept-Language', 'zh-TW')
    expect(query.body.error.message).toBe('Photo not found')
    expect((await api().post('/api/v1/auth/login?lang=en').send({ email: 'x@example.com', password: 'nope' })).body.error.message).toBe(
      'Incorrect email or password'
    )
  })

  it('localises validation messages', async () => {
    const send = (lang: string) =>
      api().post(`/api/v1/auth/register?lang=${lang}`).send({ email: 'bad', username: 'A', password: 'short' })
    const zh = await send('zh-TW')
    expect(zh.status).toBe(422)
    expect(zh.body.error.message).toBe('請輸入有效的信箱')
    const en = await send('en')
    expect(en.body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'email', message: 'Please enter a valid email address' },
        { path: 'password', message: 'Password must be at least 8 characters' },
        { path: 'username', message: 'Name must be at least 2 characters' }
      ])
    )
    const missing = await api().post('/api/v1/photos?lang=en').set(auth(alice)).send({})
    expect(missing.body.error.message).toBe('Title is required')
  })

  it('serves bilingual tag keys and rejects labels as input', async () => {
    const tags = await api().get('/api/v1/meta/tags')
    expect(tags.body[0]).toMatchObject({ key: 'taxa', label: { 'zh-TW': '類群', en: 'Species groups' } })
    expect(tags.body[0].tags).toContainEqual({ key: 'birds', label: { 'zh-TW': '鳥類', en: 'Birds' } })
    const res = await api().patch('/api/v1/users/me').set(auth(alice)).send({ interests: ['鳥類'] })
    expect(res.status).toBe(422)
  })

  it('filters articles by language', async () => {
    const created = await api()
      .post('/api/v1/articles')
      .set(auth(admin))
      .send({ title: 'Field notes in English', coverImageUrl: 'https://example.com/b.jpg', content: delta('Hello'), locale: 'en' })
    expect(created.status).toBe(201)
    const en = await api().get('/api/v1/articles?locale=en')
    expect(en.body.items.map((a: { id: number }) => a.id)).toEqual([created.body.id])
    expect(en.body.items[0].locale).toBe('en')
    const all = await api().get('/api/v1/articles')
    expect(all.body.total).toBeGreaterThan(en.body.total)
  })

  it('includes English names and descriptions for species', async () => {
    const created = await api()
      .post('/api/v1/species')
      .set(auth(admin))
      .send({ commonName: '大冠鷲', scientificName: 'Spilornis cheela', englishName: 'Crested Serpent Eagle', group: 'BIRD', description: '吃蛇的猛禽', descriptionEn: 'A snake-eating raptor' })
    const list = await api().get('/api/v1/species?q=serpent')
    expect(list.body.items[0]).toMatchObject({ id: created.body.id, description: '吃蛇的猛禽', descriptionEn: 'A snake-eating raptor' })
    const s = await signUp('yoko')
    const photo = await createPhoto(s, { speciesId: created.body.id, takenAt: '2026-03-10' })
    expect((await api().get(`/api/v1/photos/${photo}`)).body.species.englishName).toBe('Crested Serpent Eagle')
    expect((await api().get(`/api/v1/users/${s.id}/species`)).body.items[0].species.englishName).toBe('Crested Serpent Eagle')
  })
})

describe('species in season', () => {
  it('ranks species by records in a month (Asia/Taipei)', async () => {
    const s = await signUp('zara')
    const owl = (await api().post('/api/v1/species').set(auth(admin)).send({ commonName: '黃魚鴞', scientificName: 'Ketupa flavipes', group: 'BIRD' })).body.id
    const egret = (await api().post('/api/v1/species').set(auth(admin)).send({ commonName: '小白鷺', scientificName: 'Egretta garzetta', group: 'BIRD' })).body.id
    // 12-01 02:00 Taipei is still November in UTC: must count as December.
    await createPhoto(s, { speciesId: owl, takenAt: '2025-12-01T02:00:00+08:00' })
    await createPhoto(s, { speciesId: egret, takenAt: '2025-12-05' })
    await createPhoto(s, { speciesId: egret, takenAt: '2024-12-24' })

    const dec = await api().get('/api/v1/species/in-season?month=12')
    expect(dec.body.map((x: { id: number; monthCount: number }) => [x.id, x.monthCount])).toEqual([
      [egret, 2],
      [owl, 1]
    ])
    expect(dec.body[0]).toMatchObject({ commonName: '小白鷺', photoCount: 2, coverUrl: expect.any(String) })
    expect((await api().get('/api/v1/species/in-season?month=12&limit=1')).body).toHaveLength(1)
    expect((await api().get('/api/v1/species/in-season?month=11')).body.map((x: { id: number }) => x.id)).not.toContain(owl)
    expect((await api().get('/api/v1/species/in-season')).status).toBe(200)
  })
})

// ── Forum (phase 3) ───────────────────────────────────────────────────────────

describe('forum', () => {
  let op: Session // asks questions
  let helper: Session // answers
  let other: Session
  let questionId: number
  let answerId: number
  let replyId: number
  let opReplyId: number

  const thread = (u: { token: string }, extra: object = {}) =>
    api()
      .post('/api/v1/community-posts')
      .set(auth(u))
      .send({ title: '論壇測試主題', content: delta('這是一篇論壇測試主題的內容'), categoryKey: 'identification', ...extra })
  const comment = (u: { token: string }, postId: number, content: string, parentId?: number) =>
    api().post(`/api/v1/community-posts/${postId}/comments`).set(auth(u)).send({ content, parentId })
  const notes = async (u: { token: string }) => (await api().get('/api/v1/notifications?pageSize=50').set(auth(u))).body.items

  beforeAll(async () => {
    op = await signUp('forum-op')
    helper = await signUp('forum-helper')
    other = await signUp('forum-other')
  })

  it('lists the boards in the request language', async () => {
    const zh = await api().get('/api/v1/community/categories')
    expect(zh.body).toHaveLength(8)
    expect(zh.body[0]).toMatchObject({ key: 'identification', name: '物種鑑定求助', color: '#22577a', icon: '🔍', adminOnly: false })
    expect(zh.body[0].description).toContain('鑑定')
    expect(zh.body.find((c: { key: string }) => c.key === 'announcements').adminOnly).toBe(true)
    const en = await api().get('/api/v1/community/categories?lang=en')
    expect(en.body[0]).toMatchObject({ name: 'ID Help' })
    for (const c of en.body) expect(c).toHaveProperty('postCount')
  })

  it('requires a valid board and respects admin-only boards', async () => {
    const noBoard = await api().post('/api/v1/community-posts').set(auth(op)).send({ title: '論壇測試', content: delta('沒有選看板的主題') })
    expect(noBoard.status).toBe(422)
    expect((await thread(op, { categoryKey: 'nope' })).status).toBe(400)
    const forbidden = await thread(op, { categoryKey: 'announcements' })
    expect(forbidden.status).toBe(403)
    expect((await thread(admin, { categoryKey: 'announcements', title: '站務公告測試' })).status).toBe(201)
  })

  it('threads replies one level deep and marks the OP', async () => {
    const q = await thread(op, { type: 'QUESTION', title: '這是什麼鳥？' })
    expect(q.status).toBe(201)
    questionId = q.body.id

    answerId = (await comment(helper, questionId, '應該是普通翠鳥')).body.id
    const reply = await comment(other, questionId, '同意，看嘴型就是', answerId)
    expect(reply.body).toMatchObject({ parentId: answerId, isAuthor: false, likeCount: 0, likedByMe: false, edited: false })
    replyId = reply.body.id
    // Replying to a reply attaches to the top-level comment.
    const opReply = await comment(op, questionId, '謝謝兩位！', replyId)
    expect(opReply.body).toMatchObject({ parentId: answerId, isAuthor: true })
    opReplyId = opReply.body.id
    expect((await comment(op, questionId, '錯誤的父留言', 999999)).status).toBe(400)

    const threaded = await api().get(`/api/v1/community-posts/${questionId}/comments?threaded=1`)
    expect(threaded.body.total).toBe(1)
    const [top] = threaded.body.items
    expect(top).toMatchObject({ id: answerId, parentId: null, replyCount: 2 })
    expect(top.replies.map((r: { id: number }) => r.id)).toEqual([replyId, opReplyId])

    // Without ?threaded the flat list is unchanged (newest first, replies included).
    const flat = await api().get(`/api/v1/community-posts/${questionId}/comments`)
    expect(flat.body.items.map((c: { id: number }) => c.id)).toEqual([opReplyId, replyId, answerId])
    expect(flat.body.items[0].replies).toBeUndefined()
  })

  it('notifies the author of the comment being replied to', async () => {
    const helperNotes = await notes(helper)
    expect(helperNotes.find((n: { comment: { id: number } | null }) => n.comment?.id === replyId)).toMatchObject({ type: 'COMMENT' })
    // op replied to other's reply: other is notified (op owns the post, so no self-notification).
    const otherNotes = await notes(other)
    expect(otherNotes.find((n: { comment: { id: number } | null }) => n.comment?.id === opReplyId)).toMatchObject({
      type: 'COMMENT',
      actor: { id: op.id },
      target: { type: 'community', id: questionId }
    })
    expect((await notes(op)).filter((n: { comment: { id: number } | null }) => n.comment?.id === opReplyId)).toHaveLength(0)
  })

  it('accepts an answer on questions only, by the author or an admin', async () => {
    expect((await api().post(`/api/v1/community-posts/${questionId}/accept`).set(auth(other)).send({ commentId: answerId })).status).toBe(403)
    const discussion = (await thread(op, { title: '一般討論' })).body.id
    const foreign = (await comment(helper, discussion, '另一篇的留言')).body.id
    expect((await api().post(`/api/v1/community-posts/${questionId}/accept`).set(auth(op)).send({ commentId: foreign })).status).toBe(400)
    expect((await api().post(`/api/v1/community-posts/${discussion}/accept`).set(auth(op)).send({ commentId: foreign })).status).toBe(400)

    const accepted = await api().post(`/api/v1/community-posts/${questionId}/accept`).set(auth(op)).send({ commentId: answerId })
    expect(accepted.status).toBe(200)
    expect(accepted.body).toMatchObject({ id: questionId, solved: true, acceptedCommentId: answerId, type: 'QUESTION' })
    const note = (await notes(helper)).find((n: { type: string }) => n.type === 'ANSWER_ACCEPTED')
    expect(note).toMatchObject({ actor: { id: op.id }, target: { type: 'community', id: questionId } })

    const ids = async (filter: string) =>
      (await api().get(`/api/v1/community-posts?category=identification&filter=${filter}`)).body.items.map((p: { id: number }) => p.id)
    expect(await ids('solved')).toContain(questionId)
    expect(await ids('unsolved')).not.toContain(questionId)

    const undone = await api().delete(`/api/v1/community-posts/${questionId}/accept`).set(auth(op))
    expect(undone.body).toMatchObject({ solved: false, acceptedCommentId: null })
    expect(await ids('unsolved')).toContain(questionId)
    await api().post(`/api/v1/community-posts/${questionId}/accept`).set(auth(admin)).send({ commentId: answerId })
    expect((await api().get(`/api/v1/community-posts/${questionId}`)).body.solved).toBe(true)
  })

  it('sorts by activity with pinned topics first and shows who is replying', async () => {
    const older = (await thread(op, { categoryKey: 'meetups', title: '較早的揪團' })).body.id
    const newer = (await thread(other, { categoryKey: 'meetups', title: '較新的揪團', type: 'QUESTION' })).body.id
    const list = async (qs = '') => (await api().get(`/api/v1/community-posts?category=meetups${qs}`)).body.items
    expect((await list()).map((p: { id: number }) => p.id)).toEqual([newer, older])

    await comment(helper, older, '我也要參加')
    await comment(other, older, '+1')
    const [first] = await list()
    expect(first).toMatchObject({
      id: older,
      type: 'DISCUSSION',
      pinned: false,
      locked: false,
      solved: false,
      replyCount: 2,
      commentCount: 2,
      category: { key: 'meetups', name: '行程揪團', color: '#8a5a9e', icon: '🚐' },
      lastReplier: { id: other.id }
    })
    expect(first.participants.map((u: { id: number }) => u.id)).toEqual([other.id, helper.id])
    expect(new Date(first.lastActivityAt).getTime()).toBeGreaterThan(new Date(first.createdAt).getTime())
    expect((await api().get('/api/v1/community-posts?category=meetups&lang=en')).body.items[0].category.name).toBe('Trips & Meetups')

    expect((await list('&sort=latest')).map((p: { id: number }) => p.id)).toEqual([newer, older])
    expect((await list('&filter=unanswered')).map((p: { id: number }) => p.id)).toEqual([newer])
    expect((await list('&type=QUESTION')).map((p: { id: number }) => p.id)).toEqual([newer])

    // Pinned first regardless of sort; only admins moderate.
    expect((await api().patch(`/api/v1/community-posts/${newer}/moderation`).set(auth(op)).send({ pinned: true })).status).toBe(403)
    const pinned = await api().patch(`/api/v1/community-posts/${newer}/moderation`).set(auth(admin)).send({ pinned: true })
    expect(pinned.body).toMatchObject({ id: newer, pinned: true })
    expect((await list()).map((p: { id: number }) => p.id)).toEqual([newer, older])
    expect((await list('&sort=popular'))[0].id).toBe(newer)
  })

  it('locks topics against new replies (admins excepted)', async () => {
    const id = (await thread(op, { categoryKey: 'gear', title: '鎖定測試' })).body.id
    await api().patch(`/api/v1/community-posts/${id}/moderation`).set(auth(admin)).send({ locked: true })
    const blocked = await comment(helper, id, '還能回覆嗎？')
    expect(blocked.status).toBe(403)
    expect(blocked.body.error.code).toBe('POST_LOCKED')
    expect((await comment(admin, id, '管理員說明')).status).toBe(201)
    expect((await api().get(`/api/v1/community-posts/${id}`)).body.locked).toBe(true)
  })

  it('edits and likes comments', async () => {
    expect((await api().patch(`/api/v1/comments/${answerId}`).set(auth(other)).send({ content: '改別人的' })).status).toBe(403)
    const edited = await api().patch(`/api/v1/comments/${answerId}`).set(auth(helper)).send({ content: '是普通翠鳥（母鳥）' })
    expect(edited.body).toMatchObject({ id: answerId, content: '是普通翠鳥（母鳥）', edited: true, isAuthor: false })

    expect((await api().put(`/api/v1/comments/${replyId}/like`).set(auth(op))).body).toEqual({ liked: true, likeCount: 1 })
    await api().put(`/api/v1/comments/${replyId}/like`).set(auth(op))
    expect((await api().put(`/api/v1/comments/${replyId}/like`).set(auth(helper))).body).toEqual({ liked: true, likeCount: 2 })
    expect((await api().put('/api/v1/comments/999999/like').set(auth(op))).status).toBe(404)

    const threaded = await api().get(`/api/v1/community-posts/${questionId}/comments?threaded=1`).set(auth(op))
    const reply = threaded.body.items[0].replies.find((r: { id: number }) => r.id === replyId)
    expect(reply).toMatchObject({ likeCount: 2, likedByMe: true })

    // sort=top orders top-level comments by likes.
    const second = (await comment(other, questionId, '補充一張照片')).body.id
    await api().put(`/api/v1/comments/${second}/like`).set(auth(op))
    await api().put(`/api/v1/comments/${second}/like`).set(auth(helper))
    const top = await api().get(`/api/v1/community-posts/${questionId}/comments?threaded=1&sort=top`)
    expect(top.body.items[0].id).toBe(second)
    const newest = await api().get(`/api/v1/community-posts/${questionId}/comments?threaded=1&sort=newest`)
    expect(newest.body.items[0].id).toBe(second)

    expect((await api().delete(`/api/v1/comments/${replyId}/like`).set(auth(op))).body).toEqual({ liked: false, likeCount: 1 })
  })

  it('applies blocks to replies and comment likes', async () => {
    const troll = await signUp('forum-troll')
    await api().put(`/api/v1/users/${troll.id}/block`).set(auth(helper))
    expect((await api().put(`/api/v1/comments/${answerId}/like`).set(auth(troll))).status).toBe(403)
    expect((await comment(troll, questionId, '回覆被封鎖者', answerId)).status).toBe(403)
    // The troll can still reply elsewhere in the thread.
    expect((await comment(troll, questionId, '一般留言')).status).toBe(201)
    const forHelper = await api().get(`/api/v1/community-posts/${questionId}/comments`).set(auth(helper))
    expect(forHelper.body.items.some((c: { author: { id: number } }) => c.author.id === troll.id)).toBe(false)
  })

  it('ranks top contributors', async () => {
    const res = await api().get('/api/v1/community/top-contributors?days=7&limit=20')
    const row = (u: Session) => res.body.find((r: { user: { id: number } }) => r.user.id === u.id)
    // helper: 0 topics, 3 replies (the answer, 我也要參加, 另一篇的留言), 1 accepted answer.
    const h = row(helper)
    expect(h).toMatchObject({ postCount: 0, acceptedCount: 1, user: { username: 'forum-helper' } })
    expect(h.score).toBe(h.postCount * 3 + h.replyCount + h.acceptedCount * 5)
    const o = row(op)
    expect(o.postCount).toBeGreaterThanOrEqual(4)
    expect(o.acceptedCount).toBe(0)
    const scores = res.body.map((r: { score: number }) => r.score)
    expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a))
    expect((await api().get('/api/v1/community/top-contributors?limit=1')).body).toHaveLength(1)
  })
})
