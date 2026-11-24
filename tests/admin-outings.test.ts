import request from 'supertest'
import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'

const app = createApp()
const api = () => request(app)
const stamp = Date.now()
type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })
let admin: U
let member: U

const makeUser = async (email: string, username: string, role: 'USER' | 'ADMIN'): Promise<U> => {
  const u = await prisma.user.create({ data: { email, username, passwordHash: await bcrypt.hash('password123', 4), role, emailVerified: true } })
  const login = await api().post('/api/auth/login').send({ email, password: 'password123' })
  return { token: login.body.accessToken, id: u.id }
}

const outing = (title: string, status: 'DRAFT' | 'PUBLISHED') =>
  prisma.outing.create({
    data: {
      title,
      status,
      authorId: member.id,
      locationName: 'Test ridge',
      latitude: 24.2,
      longitude: 121.3,
      timezone: 'Asia/Taipei',
      startedAt: new Date(Date.now() - 7200_000),
      endedAt: new Date(Date.now() - 3600_000),
      ...(status === 'PUBLISHED' && { publishedAt: new Date() })
    }
  })

beforeAll(async () => {
  admin = await makeUser(`admin-${stamp}@outings-admin.test`, 'Outings admin', 'ADMIN')
  member = await makeUser(`member-${stamp}@outings-admin.test`, `Walker${stamp}`, 'USER')
})

describe('admin: outings', () => {
  it('is admin-only', async () => {
    expect((await api().get('/api/admin/outings').set(auth(member))).status).toBe(403)
  })

  it('lists published journals and drafts separately, with counts', async () => {
    const published = await outing(`Ridge walk ${stamp}`, 'PUBLISHED')
    const draft = await outing(`Unfinished ${stamp}`, 'DRAFT')
    await prisma.photoPost.create({
      data: { title: 'Ridge record', description: 'A record from the ridge walk.', locationName: 'Test ridge', latitude: 24.2, longitude: 121.3, authorId: member.id, outingId: published.id }
    })

    const pub = await api().get(`/api/admin/outings?q=${stamp}`).set(auth(admin))
    expect(pub.body.items.map((o: { id: number }) => o.id)).toEqual([published.id])
    expect(pub.body.items[0]).toMatchObject({ status: 'PUBLISHED', observationCount: 1, author: { id: member.id } })
    expect(pub.body.draftCount).toBeGreaterThanOrEqual(1)

    const drafts = await api().get(`/api/admin/outings?status=DRAFT&q=Walker${stamp}`).set(auth(admin))
    expect(drafts.body.items.map((o: { id: number }) => o.id)).toEqual([draft.id])

    // Admins remove journals through the public route; the observation survives.
    expect((await api().delete(`/api/outings/${published.id}`).set(auth(admin))).status).toBe(204)
    expect(await prisma.photoPost.count({ where: { authorId: member.id, outingId: null } })).toBe(1)
  })
})
