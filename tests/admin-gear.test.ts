import request from 'supertest'
import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'

const app = createApp()
const api = () => request(app)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const stamp = Date.now()
const BRAND = `Admco${stamp}`

type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })
let admin: U
let member: U

const photo = async (exif: object) => {
  const img = await api().post('/api/images?folder=photos').set(auth(member)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
  const res = await api()
    .post('/api/photos')
    .set(auth(member))
    .send({ title: 'Admin gear record', description: 'An observation from the field.', locationName: 'Ridge', latitude: 24.2, longitude: 121.3, imageIds: [img.body[0].id], exif })
  expect(res.status).toBe(201)
  return res.body.id as number
}
const lensOf = async (id: number) => (await prisma.photoPost.findUniqueOrThrow({ where: { id }, select: { lensId: true } })).lensId

beforeAll(async () => {
  const email = `admin-${stamp}@gear-admin.test`
  const a = await prisma.user.create({ data: { email, username: 'Gear admin', passwordHash: await bcrypt.hash('password123', 4), role: 'ADMIN', emailVerified: true } })
  admin = { token: (await api().post('/api/auth/login').send({ email, password: 'password123' })).body.accessToken, id: a.id }
  const reg = await api().post('/api/auth/register').send({ email: `member-${stamp}@gear-admin.test`, username: 'Gear member', password: 'password123' })
  member = { token: reg.body.accessToken, id: reg.body.user.id }
})

describe('admin: gear catalogue', () => {
  const raw = `${BRAND} ZX 150-600 F5-6.3`
  let photoId: number
  let lensId: number
  let otherId: number

  it('is admin-only', async () => {
    expect((await api().get('/api/admin/gear').set(auth(member))).status).toBe(403)
  })

  it('lists EXIF strings that nothing in the catalogue claims', async () => {
    photoId = await photo({ lens: raw, focalLength: '600mm' })
    expect(await lensOf(photoId)).toBeNull()
    const res = await api().get('/api/admin/gear/unmatched').set(auth(admin))
    expect(res.body).toContainEqual({ type: 'LENS', name: raw, photoCount: 1 })
  })

  it('creates an item with a generated slug and links existing photos', async () => {
    const res = await api()
      .post('/api/admin/gear')
      .set(auth(admin))
      .send({ type: 'LENS', brand: BRAND, model: 'ZX 150-600mm F5-6.3', mount: 'ZX', focalMinMm: 150, focalMaxMm: 600, apertureWide: 5, apertureTele: 6.3, aliases: [raw, raw.toLowerCase()] })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ slug: `admco${stamp}-zx-150-600mm-f5-6-3`, aliases: [raw], photoCount: 1 })
    expect(res.body.relinked.updated).toBeGreaterThanOrEqual(1)
    lensId = res.body.id
    expect(await lensOf(photoId)).toBe(lensId)
    const dup = await api().post('/api/admin/gear').set(auth(admin)).send({ type: 'LENS', brand: BRAND, model: 'ZX 150-600mm F5-6.3', mount: 'ZX' })
    expect(dup.status).toBe(409)
  })

  it('refuses an alias another item already claims', async () => {
    const other = await api().post('/api/admin/gear').set(auth(admin)).send({ type: 'LENS', brand: BRAND, model: 'ZX 400mm F2.8', mount: 'ZX' })
    otherId = other.body.id
    const clash = await api().post(`/api/admin/gear/${otherId}/aliases`).set(auth(admin)).send({ alias: raw.toUpperCase() })
    expect(clash.status).toBe(409)
    expect(clash.body.error.message).toContain('ZX 150-600mm')
    // The same string on a camera body is a different lookup table, so it is allowed.
    const body = await api().post('/api/admin/gear').set(auth(admin)).send({ type: 'CAMERA', brand: BRAND, model: 'B1', mount: 'ZX', aliases: [raw] })
    expect(body.status).toBe(201)
  })

  it('files an unmatched string under an existing item', async () => {
    const second = await photo({ lens: `${BRAND} four hundred` })
    const res = await api().post(`/api/admin/gear/${otherId}/aliases`).set(auth(admin)).send({ alias: `${BRAND} four hundred` })
    expect(res.body.updated).toBeGreaterThanOrEqual(1)
    expect(await lensOf(second)).toBe(otherId)
  })

  it('edits specs, searches, and unlinks photos when an alias is removed', async () => {
    const patch = await api().patch(`/api/admin/gear/${lensId}`).set(auth(admin)).send({ weightG: 1930, aliases: [] })
    expect(patch.body).toMatchObject({ weightG: 1930, aliases: [], photoCount: 0 })
    expect(await lensOf(photoId)).toBeNull()
    const list = await api().get(`/api/admin/gear?type=LENS&q=${BRAND}`).set(auth(admin))
    expect(list.body.items.map((g: { id: number }) => g.id).sort()).toEqual([lensId, otherId].sort())
  })

  it('deletes an item and leaves the photos with their raw EXIF', async () => {
    expect((await api().delete(`/api/admin/gear/${otherId}`).set(auth(admin))).status).toBe(204)
    expect((await api().get(`/api/admin/gear?q=${BRAND}&type=LENS`).set(auth(admin))).body.total).toBe(1)
    const unmatched = await api().get('/api/admin/gear/unmatched').set(auth(admin))
    expect(unmatched.body.some((u: { name: string }) => u.name === `${BRAND} four hundred`)).toBe(true)
  })
})
