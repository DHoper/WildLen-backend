import request from 'supertest'
import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'

const app = createApp()
const api = () => request(app)
const day = 24 * 3600_000
const stamp = Date.now()

type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })

let admin: U
let member: U

beforeAll(async () => {
  const email = `admin-${stamp}@activities.test`
  const a = await prisma.user.create({
    data: { email, username: 'Activities admin', passwordHash: await bcrypt.hash('password123', 4), role: 'ADMIN', emailVerified: true }
  })
  const login = await api().post('/api/auth/login').send({ email, password: 'password123' })
  admin = { token: login.body.accessToken, id: a.id }
  const reg = await api().post('/api/auth/register').send({ email: `member-${stamp}@activities.test`, username: 'Member', password: 'password123' })
  member = { token: reg.body.accessToken, id: reg.body.user.id }
})

const challengeInput = (slug: string, offsetDays = 1) => ({
  slug,
  title: { 'zh-TW': '水鳥', en: 'Waterbirds' },
  brief: { 'zh-TW': '主題：濕地水鳥。', en: 'Theme: wetland birds.' },
  rules: { 'zh-TW': ['不得誘拍'], en: ['No baiting'] },
  coverUrl: 'https://example.com/c.jpg',
  startsAt: new Date(Date.now() + offsetDays * day).toISOString(),
  submitEndsAt: new Date(Date.now() + (offsetDays + 7) * day).toISOString(),
  voteEndsAt: new Date(Date.now() + (offsetDays + 10) * day).toISOString()
})

describe('admin: challenges', () => {
  const slug = `waterbirds-${stamp}`
  let id: number

  it('is admin-only', async () => {
    expect((await api().get('/api/admin/challenges').set(auth(member))).status).toBe(403)
  })

  it('creates, lists with raw locales, and filters by phase', async () => {
    const created = await api().post('/api/admin/challenges').set(auth(admin)).send(challengeInput(slug))
    expect(created.status).toBe(201)
    id = created.body.id
    const list = await api().get('/api/admin/challenges?phase=upcoming').set(auth(admin))
    const row = list.body.items.find((c: { id: number }) => c.id === id)
    expect(row).toMatchObject({ phase: 'upcoming', title: { 'zh-TW': '水鳥', en: 'Waterbirds' }, entryCount: 0, voteCount: 0 })
    const open = await api().get('/api/admin/challenges?phase=open').set(auth(admin))
    expect(open.body.items.some((c: { id: number }) => c.id === id)).toBe(false)
  })

  it('rejects duplicate slugs and invalid timelines', async () => {
    expect((await api().post('/api/admin/challenges').set(auth(admin)).send(challengeInput(slug))).status).toBe(409)
    const bad = await api()
      .patch(`/api/admin/challenges/${id}`)
      .set(auth(admin))
      .send({ voteEndsAt: new Date(Date.now()).toISOString() })
    expect(bad.status).toBe(400)
  })

  it('patches one locale field and the cover crop', async () => {
    const res = await api()
      .patch(`/api/admin/challenges/${id}`)
      .set(auth(admin))
      .send({ title: { 'zh-TW': '濕地水鳥', en: 'Wetland birds' }, coverPosition: '50% 20%' })
    expect(res.status).toBe(200)
    const detail = await api().get(`/api/admin/challenges/${id}`).set(auth(admin))
    expect(detail.body).toMatchObject({ title: { 'zh-TW': '濕地水鳥', en: 'Wetland birds' }, coverPosition: '50% 20%', phase: 'upcoming' })
  })

  it('locks the submission deadline once voting has started', async () => {
    const voting = await prisma.challenge.create({
      data: {
        ...challengeInput(`voting-${stamp}`),
        startsAt: new Date(Date.now() - 10 * day),
        submitEndsAt: new Date(Date.now() - day),
        voteEndsAt: new Date(Date.now() + day)
      }
    })
    const res = await api()
      .patch(`/api/admin/challenges/${voting.id}`)
      .set(auth(admin))
      .send({ submitEndsAt: new Date(Date.now() - 2 * day).toISOString() })
    expect(res.status).toBe(400)
    // Extending the vote is still allowed.
    const extend = await api()
      .patch(`/api/admin/challenges/${voting.id}`)
      .set(auth(admin))
      .send({ voteEndsAt: new Date(Date.now() + 3 * day).toISOString() })
    expect(extend.status).toBe(200)
  })

  it('deletes', async () => {
    expect((await api().delete(`/api/admin/challenges/${id}`).set(auth(admin))).status).toBe(204)
    expect((await api().get(`/api/admin/challenges/${id}`).set(auth(admin))).status).toBe(404)
  })
})

describe('admin: trips', () => {
  let upcoming: number
  let discussionId: number | null

  beforeAll(async () => {
    const board = await prisma.forumCategory.upsert({
      where: { key: 'meetups' },
      update: {},
      create: { key: 'meetups', name: { 'zh-TW': '外拍活動', en: 'Field trips' }, description: { 'zh-TW': '外拍', en: 'Trips' }, color: '#7a5c99', icon: '💬' }
    })
    const post = await prisma.communityPost.create({
      data: { title: 'Trip thread', content: { ops: [{ insert: 'x\n' }] }, authorId: member.id, categoryKey: board.key }
    })
    discussionId = post.id
    const base = { organizerId: member.id, meetingPoint: 'Gate', latitude: 25, longitude: 121, capacity: 5, description: 'Morning walk' }
    upcoming = (
      await prisma.trip.create({
        data: { ...base, title: `Upcoming ${stamp}`, startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + day + 3600_000), discussionId }
      })
    ).id
    await prisma.trip.create({ data: { ...base, title: `Past ${stamp}`, startsAt: new Date(Date.now() - 2 * day), endsAt: new Date(Date.now() - day) } })
    await prisma.tripMember.create({ data: { tripId: upcoming, userId: member.id, status: 'GOING' } })
  })

  it('lists by status with member counts', async () => {
    const res = await api().get(`/api/admin/trips?status=upcoming&q=${stamp}`).set(auth(admin))
    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({ id: upcoming, goingCount: 1, waitlistCount: 0, cancelled: false })
    const past = await api().get(`/api/admin/trips?status=past&q=${stamp}`).set(auth(admin))
    expect(past.body.items.map((t: { title: string }) => t.title)).toEqual([`Past ${stamp}`])
  })

  it('admins can cancel through the public route, then hard-delete with the thread', async () => {
    expect((await api().post(`/api/trips/${upcoming}/cancel`).set(auth(admin))).status).toBe(204)
    const cancelled = await api().get(`/api/admin/trips?status=cancelled&q=${stamp}`).set(auth(admin))
    expect(cancelled.body.items.map((t: { id: number }) => t.id)).toEqual([upcoming])
    expect((await api().delete(`/api/admin/trips/${upcoming}`).set(auth(admin))).status).toBe(204)
    expect(await prisma.trip.findUnique({ where: { id: upcoming } })).toBeNull()
    expect(await prisma.communityPost.findUnique({ where: { id: discussionId! } })).toBeNull()
  })
})

describe('admin: forum boards', () => {
  const key = `board-${stamp}`
  const other = `other-${stamp}`
  const board = (k: string) => ({
    key: k,
    name: { 'zh-TW': '水下攝影', en: 'Underwater' },
    description: { 'zh-TW': '潛水與水下拍攝。', en: 'Diving and underwater photography.' },
    color: '#1d6f8a'
  })

  it('creates boards at the end and rejects duplicate keys', async () => {
    const res = await api().post('/api/admin/forum/boards').set(auth(admin)).send(board(key))
    expect(res.status).toBe(201)
    expect((await api().post('/api/admin/forum/boards').set(auth(admin)).send(board(key))).status).toBe(409)
    await api().post('/api/admin/forum/boards').set(auth(admin)).send(board(other))
    const list = await api().get('/api/admin/forum/boards').set(auth(admin))
    expect(list.body.at(-1).key).toBe(other)
    // The public list shows it localised.
    const pub = await api().get('/api/community/categories?lang=en')
    expect(pub.body.find((b: { key: string }) => b.key === key)).toMatchObject({ name: 'Underwater', postCount: 0 })
  })

  it('edits and reorders', async () => {
    const patch = await api().patch(`/api/admin/forum/boards/${key}`).set(auth(admin)).send({ adminOnly: true, color: '#225577' })
    expect(patch.body).toMatchObject({ adminOnly: true, color: '#225577' })
    const keys: string[] = (await api().get('/api/admin/forum/boards').set(auth(admin))).body.map((b: { key: string }) => b.key)
    const reordered = [key, ...keys.filter((k) => k !== key)]
    expect((await api().put('/api/admin/forum/boards/order').set(auth(admin)).send({ keys: reordered })).status).toBe(204)
    const after = await api().get('/api/admin/forum/boards').set(auth(admin))
    expect(after.body[0].key).toBe(key)
    // A partial list is rejected.
    expect((await api().put('/api/admin/forum/boards/order').set(auth(admin)).send({ keys: [key] })).status).toBe(400)
  })

  it('requires a target board before deleting a board with topics', async () => {
    const post = await prisma.communityPost.create({
      data: { title: 'Housing for a TG-7', content: { ops: [{ insert: 'x\n' }] }, authorId: member.id, categoryKey: key }
    })
    const blocked = await api().delete(`/api/admin/forum/boards/${key}`).set(auth(admin))
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.message).toContain('1')
    expect((await api().delete(`/api/admin/forum/boards/${key}?moveTo=${key}`).set(auth(admin))).status).toBe(400)
    expect((await api().delete(`/api/admin/forum/boards/${key}?moveTo=${other}`).set(auth(admin))).status).toBe(204)
    expect((await prisma.communityPost.findUnique({ where: { id: post.id } }))?.categoryKey).toBe(other)
    expect((await api().delete(`/api/admin/forum/boards/${other}`).set(auth(admin))).status).toBe(409)
  })
})

describe('admin: dashboard activity', () => {
  it('reports activity metrics', async () => {
    const res = await api().get('/api/admin/stats').set(auth(admin))
    expect(res.body.activity).toEqual({ activeChallenges: expect.any(Number), upcomingTrips: expect.any(Number), needsId: expect.any(Number), unmatchedGear: expect.any(Number), proposedPlaces: expect.any(Number) })
  })
})
