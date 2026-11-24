import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { purgeOrphanImages } from '../src/modules/images/image.service'

const app = createApp()
const api = () => request(app)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })
const stamp = Date.now()
const register = async (name: string): Promise<U> => {
  const res = await api().post('/api/auth/register').send({ email: `${name}-${stamp}@outings.test`, username: name, password: 'password123' })
  expect(res.status).toBe(201)
  return { token: res.body.accessToken, id: res.body.user.id }
}
const upload = async (u: U, n = 1) => {
  const req = api().post('/api/images?folder=photos').set(auth(u))
  for (let i = 0; i < n; i++) req.attach('images', PNG, { filename: `a${i}.png`, contentType: 'image/png' })
  const res = await req
  expect(res.status).toBe(201)
  return (res.body as { id: number }[]).map((i) => i.id)
}

// A wetland in Taiwan (Yilan), away from other test files' coordinates.
const LAT = 24.68
const LNG = 121.82
let kim: U, leo: U
let place: { id: number; slug: string }
let egret: number, owl: number, heron: number

beforeAll(async () => {
  ;[kim, leo] = await Promise.all([register('Kim'), register('Leo')])
  place = await prisma.place.create({
    data: { slug: `lanyang-${stamp}`, name: { 'zh-TW': '蘭陽溪口', en: 'Lanyang River Mouth' }, kind: 'WETLAND', countryCode: 'TW', area: 'taiwan', region: { 'zh-TW': '宜蘭縣', en: 'Yilan' }, latitude: LAT, longitude: LNG, radiusM: 3000, timezone: 'Asia/Taipei', status: 'CURATED' },
    select: { id: true, slug: true }
  })
  const sp = (zh: string, en: string, sensitive = false) =>
    prisma.species.create({ data: { commonName: `${zh}-${stamp}`, englishName: en, scientificName: `${en} ${stamp}`, group: 'BIRD', sensitive }, select: { id: true } }).then((s) => s.id)
  ;[egret, owl, heron] = await Promise.all([sp('小白鷺', 'Little Egret'), sp('黃魚鴞', 'Tawny Fish Owl', true), sp('蒼鷺', 'Grey Heron')])
})

const outingBody = (extra: object = {}) => ({
  title: '蘭陽溪口清晨',
  locationName: '宜蘭 蘭陽溪口',
  latitude: LAT,
  longitude: LNG,
  startedAt: '2026-03-02T22:10:00Z',
  endedAt: '2026-03-03T01:40:00Z',
  ...extra
})

describe('outing drafts and publishing', () => {
  let outingId: number
  let images: number[]

  it('creates a private draft that holds its uploads', async () => {
    images = await upload(kim, 4)
    const res = await api()
      .post('/api/outings')
      .set(auth(kim))
      .send(
        outingBody({
          placeId: place.id,
          species: [{ speciesId: heron, count: 3, heardOnly: false, note: '在對岸沙洲' }],
          draft: {
            observations: [
              { key: 'a', imageIds: [images[0], images[1]], speciesId: egret, takenAt: '2026-03-02T22:30:00Z', latitude: LAT + 0.005, longitude: LNG, exif: { camera: 'Canon EOS R5', focalLength: '500mm' } },
              { key: 'b', imageIds: [images[2]], speciesId: owl, takenAt: '2026-03-02T23:05:00Z' },
              { key: 'c', imageIds: [images[3]], speciesId: null, title: '' }
            ]
          }
        })
      )
    expect(res.status).toBe(201)
    outingId = res.body.id
    expect((await api().get(`/api/outings/${outingId}`).set(auth(leo))).status).toBe(404)
    const own = (await api().get(`/api/outings/${outingId}`).set(auth(kim))).body
    expect(own).toMatchObject({ status: 'DRAFT', timezone: 'Asia/Taipei', area: 'taiwan', place: { slug: place.slug } })
    expect(own.draft.observations).toHaveLength(3)
    expect((await api().get('/api/outings/drafts').set(auth(kim))).body.map((d: { id: number }) => d.id)).toContain(outingId)
    // Held images survive the orphan purge
    await purgeOrphanImages(0)
    expect(await prisma.image.count({ where: { id: { in: images } } })).toBe(4)
  })

  it('validates before publishing', async () => {
    // Observation c has neither species nor title
    expect((await api().post(`/api/outings/${outingId}/publish`).set(auth(kim))).status).toBe(400)
    // The same photo in two observations
    const twice = await api()
      .patch(`/api/outings/${outingId}`)
      .set(auth(kim))
      .send({ draft: { observations: [{ key: 'a', imageIds: [images[0]], speciesId: egret }, { key: 'b', imageIds: [images[0]], speciesId: heron }], tray: [images[1], images[2], images[3]] } })
    expect(twice.status).toBe(200)
    expect((await api().post(`/api/outings/${outingId}/publish`).set(auth(kim))).status).toBe(400)
    // Someone else can't edit or publish
    expect((await api().patch(`/api/outings/${outingId}`).set(auth(leo)).send({ title: 'Mine now' })).status).toBe(403)
  })

  it('publishes observations, the checklist and the place', async () => {
    // Final draft: image 1 dropped from the draft (it gets deleted), c gets a title
    const res = await api()
      .patch(`/api/outings/${outingId}`)
      .set(auth(kim))
      .send({
        draft: {
          observations: [
            { key: 'a', imageIds: [images[0]], speciesId: egret, takenAt: '2026-03-02T22:30:00Z', latitude: LAT + 0.005, longitude: LNG, exif: { camera: 'Canon EOS R5', focalLength: '500mm' } },
            { key: 'b', imageIds: [images[2]], speciesId: owl, takenAt: '2026-03-02T23:05:00Z' },
            { key: 'c', imageIds: [images[3]], speciesId: null, title: '遠方的鷺科' }
          ]
        }
      })
    expect(res.status).toBe(200)
    expect(await prisma.image.count({ where: { id: images[1] } })).toBe(0)

    const pub = await api().post(`/api/outings/${outingId}/publish`).set(auth(kim))
    expect(pub.status).toBe(200)
    expect(pub.body.observationIds).toHaveLength(3)
    const [a, b, c] = pub.body.observationIds as number[]
    const pa = (await api().get(`/api/photos/${a}`)).body
    // Title defaults to the species name; place inherited; images moved; gear resolved from EXIF
    expect(pa).toMatchObject({ title: `小白鷺-${stamp}`, place: { slug: place.slug }, locationName: '宜蘭 蘭陽溪口' })
    expect(pa.images).toHaveLength(1)
    expect((await api().get(`/api/photos/${c}`)).body.title).toBe('遠方的鷺科')
    // Sensitive species: blurred, and not tied to the place
    const pb = (await api().get(`/api/photos/${b}`)).body
    expect(pb.locationPrecision).toBe('APPROX')
    expect(pb.place).toBeNull()
    // The observation links to its journal, unless it may not be tied to it publicly
    expect(pa.outing).toEqual({ id: outingId, title: '蘭陽溪口清晨' })
    expect(pb.outing).toBeNull()
    expect((await api().get(`/api/photos/${b}`).set(auth(kim))).body.outing).toMatchObject({ id: outingId })
    // The place lists the journal
    expect((await api().get(`/api/places/${place.slug}`)).body.outings.map((x: { id: number }) => x.id)).toContain(outingId)

    const o = (await api().get(`/api/outings/${outingId}`)).body
    expect(o.status).toBe('PUBLISHED')
    expect(o.draft).toBeUndefined()
    // Public view: the sensitive species and its photo are left out; the heard heron stays
    // (c has no capture time, so it takes the outing's start and comes first)
    expect(o.observations.map((p: { id: number }) => p.id)).toEqual([c, a])
    expect(o.species.map((s: { species: { id: number } }) => s.species.id).sort()).toEqual([egret, heron].sort())
    expect(o.species.find((s: { species: { id: number } }) => s.species.id === heron)).toMatchObject({ count: 3, note: '在對岸沙洲', photoCount: 0 })
    // The author sees everything
    const own = (await api().get(`/api/outings/${outingId}`).set(auth(kim))).body
    expect(own.observations).toHaveLength(3)
    expect(own.species).toHaveLength(3)
    // Lists: by author and by place
    const byPlace = (await api().get('/api/outings').query({ placeId: place.id })).body
    expect(byPlace.items[0]).toMatchObject({ id: outingId, observationCount: 2, speciesCount: 2 })
    expect((await api().post(`/api/outings/${outingId}/publish`).set(auth(kim))).status).toBe(400)
  })

  it('hides the place of outings whose location is blurred', async () => {
    const res = await api().post('/api/outings').set(auth(leo)).send(outingBody({ title: '夜間調查', placeId: place.id, locationPrecision: 'APPROX' }))
    expect(res.status).toBe(201)
    await api().post(`/api/outings/${res.body.id}/publish`).set(auth(leo))
    const pub = (await api().get(`/api/outings/${res.body.id}`)).body
    expect(pub.place).toBeNull()
    expect(pub.latitude).not.toBe(LAT)
    expect((await api().get('/api/outings').query({ placeId: place.id })).body.items.map((x: { id: number }) => x.id)).not.toContain(res.body.id)
    expect((await api().get(`/api/outings/${res.body.id}`).set(auth(leo))).body.place).toMatchObject({ slug: place.slug })
  })

  it('refuses a place the outing is not in, and bad times', async () => {
    expect((await api().post('/api/outings').set(auth(leo)).send(outingBody({ latitude: 23.0, longitude: 120.2, placeId: place.id }))).status).toBe(400)
    expect((await api().post('/api/outings').set(auth(leo)).send(outingBody({ endedAt: '2026-03-01T00:00:00Z' }))).status).toBe(400)
    expect((await api().post('/api/outings').set(auth(leo)).send(outingBody({ endedAt: '2026-03-09T00:00:00Z' }))).status).toBe(400)
  })

  it('deletes drafts with their uploads, and published outings without their observations', async () => {
    const imgs = await upload(leo, 1)
    const d = await api().post('/api/outings').set(auth(leo)).send(outingBody({ draft: { observations: [{ key: 'x', imageIds: imgs, speciesId: egret }] } }))
    expect((await api().delete(`/api/outings/${d.body.id}`).set(auth(leo))).status).toBe(204)
    expect(await prisma.image.count({ where: { id: { in: imgs } } })).toBe(0)

    const photos = await prisma.photoPost.findMany({ where: { outingId }, select: { id: true } })
    expect((await api().delete(`/api/outings/${outingId}`).set(auth(kim))).status).toBe(204)
    expect(await prisma.photoPost.count({ where: { id: { in: photos.map((p) => p.id) }, outingId: null } })).toBe(photos.length)
  })
})

describe('review fixes', () => {
  const publishDraft = async (u: U, extra: object = {}) => {
    const imgs = await upload(u, 2)
    const res = await api()
      .post('/api/outings')
      .set(auth(u))
      .send(outingBody({ draft: { observations: [{ key: 'a', imageIds: [imgs[0]], speciesId: egret }, { key: 'b', imageIds: [imgs[1]], speciesId: heron }], tray: [] }, ...extra }))
    expect(res.status).toBe(201)
    return res.body.id as number
  }

  it('publishes once, even when the request is sent twice at the same time', async () => {
    const id = await publishDraft(kim)
    const results = await Promise.all([api().post(`/api/outings/${id}/publish`).set(auth(kim)), api().post(`/api/outings/${id}/publish`).set(auth(kim))])
    expect(results.map((r) => r.status).sort()).toEqual([200, 400])
    const photos = await prisma.photoPost.findMany({ where: { outingId: id }, select: { _count: { select: { images: true } } } })
    expect(photos).toHaveLength(2)
    expect(photos.every((p) => p._count.images === 1)).toBe(true)
  })

  it('never exposes a proposed place through journals', async () => {
    const proposal = await api().post('/api/places').set(auth(leo)).send({ name: { en: `Hidden Pond ${stamp}` }, kind: 'WETLAND', countryCode: 'TW', latitude: 24.4, longitude: 121.75, radiusM: 1500 })
    expect(proposal.status).toBe(201)
    const id = await publishDraft(leo, { latitude: 24.4, longitude: 121.75, placeId: proposal.body.id })
    await api().post(`/api/outings/${id}/publish`).set(auth(leo))
    expect((await api().get(`/api/outings/${id}`)).body.place).toBeNull()
    expect((await api().get(`/api/outings/${id}`).set(auth(kim))).body.place).toBeNull()
    expect((await api().get(`/api/outings/${id}`).set(auth(leo))).body.place).toMatchObject({ id: proposal.body.id })
    expect((await api().get('/api/outings').query({ placeId: proposal.body.id })).body.total).toBe(0)
    expect((await api().get('/api/outings').query({ placeId: proposal.body.id }).set(auth(leo))).body.total).toBe(1)
  })

  it('lowers the observations when a published journal hides its location, not the other way round', async () => {
    const id = await publishDraft(kim, { placeId: place.id })
    await api().post(`/api/outings/${id}/publish`).set(auth(kim))
    const before = await prisma.photoPost.findMany({ where: { outingId: id }, select: { locationPrecision: true, placeId: true } })
    expect(before.every((p) => p.locationPrecision === 'EXACT' && p.placeId === place.id)).toBe(true)
    expect((await api().patch(`/api/outings/${id}`).set(auth(kim)).send({ locationPrecision: 'HIDDEN' })).status).toBe(200)
    const hidden = await prisma.photoPost.findMany({ where: { outingId: id }, select: { locationPrecision: true, placeId: true } })
    expect(hidden.every((p) => p.locationPrecision === 'HIDDEN' && p.placeId === null)).toBe(true)
    // Loosening the journal again leaves the observations as they are
    expect((await api().patch(`/api/outings/${id}`).set(auth(kim)).send({ locationPrecision: 'EXACT' })).status).toBe(200)
    expect((await prisma.photoPost.findMany({ where: { outingId: id }, select: { locationPrecision: true } })).every((p) => p.locationPrecision === 'HIDDEN')).toBe(true)
  })

  it('hides the trip of a journal whose location is not public', async () => {
    const trip = await api()
      .post('/api/trips')
      .set(auth(kim))
      .send({ title: 'Lanyang river mouth waders', description: 'Meet at the levee car park for the falling tide.', startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), endsAt: new Date(Date.now() + 5 * 86400_000 + 4 * 3600_000).toISOString(), meetingPoint: 'Levee car park', latitude: LAT, longitude: LNG, capacity: 8 })
    expect(trip.status).toBe(201)
    const id = await publishDraft(kim, { tripId: trip.body.id, locationPrecision: 'APPROX' })
    await api().post(`/api/outings/${id}/publish`).set(auth(kim))
    expect((await api().get(`/api/outings/${id}`)).body.trip).toBeNull()
    expect((await api().get(`/api/outings/${id}`).set(auth(kim))).body.trip).toMatchObject({ id: trip.body.id })
    expect((await api().get(`/api/trips/${trip.body.id}`)).body.outings.map((o: { id: number }) => o.id)).not.toContain(id)
    expect((await api().get(`/api/trips/${trip.body.id}`).set(auth(kim))).body.outings.map((o: { id: number }) => o.id)).toContain(id)
  })
})
