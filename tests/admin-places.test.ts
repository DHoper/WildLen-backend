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

// A patch of open ocean, so nothing from other test files overlaps.
const LAT = -48.2
const LNG = -123.4
const input = (slug: string, extra: object = {}) => ({
  slug,
  name: { 'zh-TW': '測試濕地', en: 'Test Wetland' },
  region: { 'zh-TW': '測試縣', en: 'Test County' },
  kind: 'WETLAND',
  countryCode: 'tw',
  latitude: LAT,
  longitude: LNG,
  radiusM: 2000,
  ...extra
})

const makeUser = async (email: string, username: string, role: 'USER' | 'ADMIN'): Promise<U> => {
  const u = await prisma.user.create({ data: { email, username, passwordHash: await bcrypt.hash('password123', 4), role, emailVerified: true } })
  const login = await api().post('/api/auth/login').send({ email, password: 'password123' })
  return { token: login.body.accessToken, id: u.id }
}

beforeAll(async () => {
  admin = await makeUser(`admin-${stamp}@places-admin.test`, 'Places admin', 'ADMIN')
  member = await makeUser(`member-${stamp}@places-admin.test`, 'Places member', 'USER')
})

describe('admin: places', () => {
  const slug = `test-wetland-${stamp}`
  let curatedId: number
  let proposalId: number
  let photoId: number
  let tripId: number

  it('is admin-only', async () => {
    expect((await api().get('/api/admin/places').set(auth(member))).status).toBe(403)
  })

  it('creates a curated place with area and time zone derived from the coordinates', async () => {
    const res = await api().post('/api/admin/places').set(auth(admin)).send(input(slug))
    expect(res.status).toBe(201)
    curatedId = res.body.id
    const detail = await api().get(`/api/admin/places/${curatedId}`).set(auth(admin))
    expect(detail.body).toMatchObject({ status: 'CURATED', countryCode: 'TW', area: 'other', name: { en: 'Test Wetland' }, photoCount: 0, overlaps: [] })
    expect(detail.body.timezone).toBeTruthy()
    expect(detail.body.reviewedAt).toBeTruthy()
    expect((await api().post('/api/admin/places').set(auth(admin)).send(input(slug))).status).toBe(409)
  })

  it('queues proposals, shows overlapping curated places, and approves with edits', async () => {
    const p = await prisma.place.create({
      data: { slug: `proposal-${stamp}`, name: { en: 'North pond' }, region: {}, kind: 'OTHER', countryCode: 'TW', latitude: LAT + 0.5, longitude: LNG, radiusM: 800, timezone: 'UTC', createdById: member.id }
    })
    proposalId = p.id
    const photo = await prisma.photoPost.create({
      data: { title: 'Pond record', description: 'A record at the proposed pond.', locationName: 'North pond', latitude: LAT + 0.5, longitude: LNG, authorId: member.id, placeId: proposalId }
    })
    photoId = photo.id
    const trip = await prisma.trip.create({
      data: { title: `Pond walk ${stamp}`, description: 'Morning walk', organizerId: member.id, meetingPoint: 'Pond gate', latitude: LAT + 0.5, longitude: LNG, capacity: 4, startsAt: new Date(Date.now() + 86400_000), endsAt: new Date(Date.now() + 90000_000) }
    })
    tripId = trip.id

    const queue = await api().get('/api/admin/places?status=PROPOSED').set(auth(admin))
    expect(queue.body.proposedCount).toBeGreaterThanOrEqual(1)
    const row = queue.body.items.find((x: { id: number }) => x.id === proposalId)
    expect(row).toMatchObject({ status: 'PROPOSED', photoCount: 1, createdBy: { id: member.id } })

    // 55 km apart: no overlap until the curated place is widened.
    expect((await api().get(`/api/admin/places/${proposalId}`).set(auth(admin))).body.overlaps).toEqual([])
    await api().patch(`/api/admin/places/${curatedId}`).set(auth(admin)).send({ radiusM: 50000 })
    await prisma.place.update({ where: { id: proposalId }, data: { radiusM: 10000 } })
    const detail = await api().get(`/api/admin/places/${proposalId}`).set(auth(admin))
    expect(detail.body.overlaps.map((o: { id: number }) => o.id)).toEqual([curatedId])
    await api().patch(`/api/admin/places/${curatedId}`).set(auth(admin)).send({ radiusM: 2000 })

    const approved = await api()
      .patch(`/api/admin/places/${proposalId}`)
      .set(auth(admin))
      .send({ approve: true, name: { 'zh-TW': '北池', en: 'North Pond' }, region: { 'zh-TW': '測試縣', en: 'Test County' }, radiusM: 800, guidelines: { 'zh-TW': ['不得離開步道'], en: ['Stay on the path'] } })
    expect(approved.body).toMatchObject({ status: 'CURATED', name: { 'zh-TW': '北池' }, guidelines: { en: ['Stay on the path'] } })
    expect(approved.body.tripsRelinked).toBeGreaterThanOrEqual(1)
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).placeId).toBe(proposalId)
    // Now public.
    expect((await api().get(`/api/places/proposal-${stamp}`)).status).toBe(200)
  })

  it('clears optional text with null', async () => {
    const res = await api().patch(`/api/admin/places/${proposalId}`).set(auth(admin)).send({ guidelines: null })
    expect(res.body.guidelines).toBeNull()
  })

  it('merges a place into another, or unlinks its records when deleted outright', async () => {
    expect((await api().delete(`/api/admin/places/${proposalId}?mergeInto=${proposalId}`).set(auth(admin))).status).toBe(400)
    expect((await api().delete(`/api/admin/places/${proposalId}?mergeInto=${curatedId}`).set(auth(admin))).status).toBe(204)
    expect((await prisma.photoPost.findUniqueOrThrow({ where: { id: photoId } })).placeId).toBe(curatedId)
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).placeId).toBe(curatedId)
    expect((await api().delete(`/api/admin/places/${curatedId}`).set(auth(admin))).status).toBe(204)
    expect((await prisma.photoPost.findUniqueOrThrow({ where: { id: photoId } })).placeId).toBeNull()
  })
})

describe('admin: system accounts', () => {
  it('cannot be edited, re-keyed or deleted', async () => {
    const sys = await prisma.user.create({ data: { email: `import-${stamp}@system.test`, username: 'Importer', system: true } })
    expect((await api().patch(`/api/admin/users/${sys.id}`).set(auth(admin)).send({ role: 'ADMIN' })).status).toBe(400)
    expect((await api().put(`/api/admin/users/${sys.id}/password`).set(auth(admin)).send({ password: 'password123' })).status).toBe(400)
    expect((await api().delete(`/api/admin/users/${sys.id}`).set(auth(admin))).status).toBe(400)
    expect(await prisma.user.findUnique({ where: { id: sys.id } })).not.toBeNull()
  })
})
