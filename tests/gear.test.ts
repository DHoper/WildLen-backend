import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { invalidateGearIndex, normalizeGearName, relinkPhotoGear, unmatchedGearStrings } from '../src/modules/gear/normalize'

const app = createApp()
const api = () => request(app)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })
const stamp = Date.now()
const BRAND = `Gearco${stamp}`
const register = async (name: string): Promise<U> => {
  const res = await api().post('/api/auth/register').send({ email: `${name}-${stamp}@gear.test`, username: name, password: 'password123' })
  expect(res.status).toBe(201)
  return { token: res.body.accessToken, id: res.body.user.id }
}
const photo = async (u: U, extra: object = {}) => {
  const img = await api().post('/api/images?folder=photos').set(auth(u)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
  const res = await api()
    .post('/api/photos')
    .set(auth(u))
    .send({ title: 'Gear record', description: 'An observation from the field.', locationName: 'Ridge', latitude: 24.2, longitude: 121.3, imageIds: [img.body[0].id], ...extra })
  expect(res.status).toBe(201)
  return res.body.id as number
}

let dee: U
let camera: { id: number; slug: string }
let lens: { id: number; slug: string }

beforeAll(async () => {
  dee = await register('Dee')
  camera = await prisma.gear.create({
    data: { slug: `gearco-${stamp}-t1`, type: 'CAMERA', brand: BRAND, model: 'T1', mount: 'GC', sensor: 'FULL_FRAME', megapixels: 45, maxFps: 20, weightG: 700, releasedYear: 2024, aliases: ['GC-T1 Mark I'] },
    select: { id: true, slug: true }
  })
  lens = await prisma.gear.create({
    data: { slug: `gearco-${stamp}-200-800`, type: 'LENS', brand: BRAND, model: '200-800mm F6.3-9', mount: 'GC', focalMinMm: 200, focalMaxMm: 800, apertureWide: 6.3, apertureTele: 9, weightG: 2050, releasedYear: 2024 },
    select: { id: true, slug: true }
  })
  invalidateGearIndex()
})

describe('gear normalisation', () => {
  it('compares names ignoring case, spacing, punctuation and α', () => {
    expect(normalizeGearName('Sony α1')).toBe('sonya1')
    expect(normalizeGearName('RF100-500mm F4.5-7.1 L IS USM')).toBe(normalizeGearName('rf 100–500mm f/4.5-7.1 L IS-USM'))
  })

  it('links EXIF strings to catalogue items on upload, by "brand model", model or alias', async () => {
    const a = await photo(dee, { exif: { camera: `${BRAND.toUpperCase()} t1`, lens: '200-800MM f/6.3-9', focalLength: '800mm', aperture: 'f/9' } })
    const b = await photo(dee, { exif: { camera: 'gc t1 mark i', lens: 'Mystery 50mm', focalLength: '640mm', aperture: 'f/9' } })
    const pa = (await api().get(`/api/photos/${a}`)).body
    expect(pa.camera).toMatchObject({ slug: camera.slug, type: 'CAMERA' })
    expect(pa.lens).toMatchObject({ slug: lens.slug, type: 'LENS' })
    const pb = (await api().get(`/api/photos/${b}`)).body
    expect(pb.camera?.slug).toBe(camera.slug)
    expect(pb.lens).toBeNull()

    expect((await api().get('/api/photos').query({ gear: camera.slug })).body.total).toBe(2)
    expect((await api().get('/api/photos').query({ gear: lens.slug })).body.total).toBe(1)
  })

  it('lists unmatched strings and relinks photos after an alias is added', async () => {
    expect(await unmatchedGearStrings()).toContainEqual({ type: 'LENS', name: 'Mystery 50mm', photoCount: 1 })
    await prisma.gear.update({ where: { id: lens.id }, data: { aliases: ['Mystery 50mm'] } })
    const r = await relinkPhotoGear({ authorId: dee.id })
    expect(r).toEqual({ checked: 2, updated: 1 })
    expect((await unmatchedGearStrings()).some((u) => u.name === 'Mystery 50mm')).toBe(false)
    expect((await api().get('/api/photos').query({ gear: lens.slug })).body.total).toBe(2)
    // Idempotent
    expect(await relinkPhotoGear({ authorId: dee.id })).toEqual({ checked: 2, updated: 0 })
  })
})

describe('gear catalogue API', () => {
  it('lists items with usage counts and filters', async () => {
    const list = (await api().get('/api/gear').query({ q: BRAND, used: 1, sort: 'name' })).body
    expect(list.total).toBe(2)
    expect(list.items.map((i: { slug: string }) => i.slug)).toEqual([lens.slug, camera.slug])
    expect(list.items[1]).toMatchObject({ name: `${BRAND} T1`, photoCount: 2 })
    expect((await api().get('/api/gear').query({ q: BRAND, type: 'LENS', reach: 'long' })).body.items).toHaveLength(1)
    expect((await api().get('/api/gear').query({ type: 'lens' })).status).toBe(422)
  })

  it('reports specs and how an item is used', async () => {
    const res = await api().get(`/api/gear/${lens.slug}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ focalMaxMm: 800, apertureTele: 9, weightG: 2050 })
    expect(res.body.usage).toMatchObject({ photoCount: 2, photographerCount: 1 })
    expect(res.body.usage.focalLengths).toEqual([
      { mm: 640, count: 1 },
      { mm: 800, count: 1 }
    ])
    expect(res.body.usage.pairedWith[0]).toMatchObject({ gear: { slug: camera.slug }, count: 2 })
    expect(res.body.photos).toHaveLength(2)
    expect((await api().get('/api/gear/no-such-item')).status).toBe(404)
  })

  it('tags forum topics with catalogue items (unknown ids ignored)', async () => {
    const res = await api()
      .post('/api/community-posts')
      .set(auth(dee))
      .send({ title: '200-800 對焦測試', content: { ops: [{ insert: '在大雪山測試對焦速度。\n' }] }, categoryKey: 'gear', gearIds: [lens.id, 99999999] })
    expect(res.status).toBe(201)
    const list = (await api().get('/api/community-posts').query({ gear: lens.slug })).body
    expect(list.items.map((p: { id: number }) => p.id)).toEqual([res.body.id])
    expect(list.items[0].gear).toEqual([expect.objectContaining({ slug: lens.slug })])
    const detail = (await api().get(`/api/gear/${lens.slug}`)).body
    expect(detail.threads.map((t: { id: number }) => t.id)).toContain(res.body.id)
  })
})

describe('licence and captive records', () => {
  it('stores the licence and defaults to all rights reserved', async () => {
    const a = await photo(dee, { license: 'CC_BY' })
    const b = await photo(dee)
    expect((await api().get(`/api/photos/${a}`)).body.license).toBe('CC_BY')
    expect((await api().get(`/api/photos/${b}`)).body.license).toBe('ALL_RIGHTS_RESERVED')
    expect((await api().post('/api/photos').set(auth(dee)).send({ license: 'CC0' })).status).toBe(422)
  })

  it('keeps captive animals out of maps, area statistics and research grade', async () => {
    const lat = 23.456
    const lng = 120.987
    const wild = await photo(dee, { latitude: lat, longitude: lng, takenAt: '2026-03-01T22:00:00Z' })
    const zoo = await photo(dee, { latitude: lat, longitude: lng, takenAt: '2026-03-01T23:00:00Z', captive: true })
    const z = (await api().get(`/api/photos/${zoo}`)).body
    expect(z).toMatchObject({ captive: true, quality: 'CASUAL' })
    const map = (await api().get('/api/photos/map')).body as { id: number }[]
    expect(map.some((p) => p.id === wild)).toBe(true)
    expect(map.some((p) => p.id === zoo)).toBe(false)
    const area = (await api().get('/api/scouting/area').query({ lat, lng, radiusKm: 2 })).body
    expect(area.photoCount).toBe(1)
  })
})
