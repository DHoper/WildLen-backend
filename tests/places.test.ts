import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { refreshQuality } from '../src/modules/photos/quality'

const app = createApp()
const api = () => request(app)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const day = 24 * 3600_000

type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })
const stamp = Date.now()
const register = async (name: string): Promise<U> => {
  const res = await api().post('/api/auth/register').send({ email: `${name}-${stamp}@places.test`, username: name, password: 'password123' })
  expect(res.status).toBe(201)
  return { token: res.body.accessToken, id: res.body.user.id }
}

// A place in Taiwan (Hualien coast), far from the other test files' coordinates.
const LAT = 23.95
const LNG = 121.62
const photo = async (u: U, extra: object = {}) => {
  const img = await api().post('/api/images?folder=photos').set(auth(u)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
  const res = await api()
    .post('/api/photos')
    .set(auth(u))
    .send({ title: 'Field record', description: 'An observation from the field.', locationName: 'Coast', latitude: LAT, longitude: LNG, takenAt: '2026-03-10T22:30:00Z', imageIds: [img.body[0].id], ...extra })
  expect(res.status).toBe(201)
  return res.body.id as number
}

let ivy: U, jon: U
let place: { id: number; slug: string }
let common: number, sensitive: number
const ids: Record<string, number> = {}

beforeAll(async () => {
  ;[ivy, jon] = await Promise.all([register('Ivy'), register('Jon')])
  place = await prisma.place.create({
    data: {
      slug: `hualien-coast-${stamp}`,
      name: { 'zh-TW': '花蓮海岸', en: 'Hualien Coast' },
      kind: 'COAST',
      countryCode: 'TW',
      area: 'taiwan',
      region: { 'zh-TW': '花蓮縣', en: 'Hualien' },
      latitude: LAT,
      longitude: LNG,
      radiusM: 3000,
      timezone: 'Asia/Taipei',
      guidelines: { 'zh-TW': ['請勿餵食'], en: ['Do not feed wildlife'] },
      status: 'CURATED'
    },
    select: { id: true, slug: true }
  })
  common = (await prisma.species.create({ data: { commonName: `岩鷺-${stamp}`, scientificName: `Egretta sacra ${stamp}`, group: 'BIRD' }, select: { id: true } })).id
  sensitive = (await prisma.species.create({ data: { commonName: `熊鷹-${stamp}`, scientificName: `Nisaetus nipalensis ${stamp}`, group: 'BIRD', sensitive: true }, select: { id: true } })).id

  ids.public = await photo(ivy, { speciesId: common, placeId: place.id })
  ids.sensitive = await photo(ivy, { speciesId: sensitive, placeId: place.id })
  ids.approx = await photo(ivy, { speciesId: common, placeId: place.id, locationPrecision: 'APPROX' })
  ids.hidden = await photo(ivy, { speciesId: common, placeId: place.id, locationPrecision: 'HIDDEN' })
  ids.captive = await photo(ivy, { speciesId: common, placeId: place.id, captive: true })
})

describe('place privacy (sensitive, blurred, hidden and captive records never tied to a place)', () => {
  it('counts only eligible records in the place statistics', async () => {
    const res = await api().get(`/api/places/${place.slug}`)
    expect(res.status).toBe(200)
    expect(res.body.stats).toMatchObject({ observationCount: 1, speciesCount: 1 })
    expect(res.body.species.map((s: { species: { id: number } }) => s.species.id)).toEqual([common])
    expect(res.body.photos.map((p: { id: number }) => p.id)).toEqual([ids.public])
    expect(res.body.months.reduce((a: number, b: number) => a + b, 0)).toBe(1)
    // 22:30 UTC on 10 March = 06:30 on 11 March in Taipei
    expect(res.body.months[2]).toBe(1)
    expect(res.body.hours[6]).toBe(1)
  })

  it('applies the same rule to lists, filters and area reports', async () => {
    const list = (await api().get('/api/places').query({ area: 'taiwan' })).body
    expect(list.find((p: { slug: string }) => p.slug === place.slug).stats.observationCount).toBe(1)
    expect((await api().get('/api/photos').query({ place: place.slug })).body.total).toBe(1)
    const area = (await api().get('/api/scouting/area').query({ lat: LAT, lng: LNG, radiusKm: 2 })).body
    expect(area.photoCount).toBe(1)
    expect(area.place).toMatchObject({ slug: place.slug, name: '花蓮海岸' })
  })

  it("doesn't reveal the place on the pages of ineligible records (except to their author)", async () => {
    expect((await api().get(`/api/photos/${ids.public}`)).body.place).toMatchObject({ slug: place.slug })
    for (const key of ['sensitive', 'approx', 'hidden', 'captive']) {
      expect((await api().get(`/api/photos/${ids[key]}`).set(auth(jon))).body.place, key).toBeNull()
    }
    expect((await api().get(`/api/photos/${ids.sensitive}`).set(auth(ivy))).body.place).toMatchObject({ slug: place.slug })
    // A sensitive species is blurred even when an exact location was requested
    expect((await api().get(`/api/photos/${ids.sensitive}`)).body.locationPrecision).toBe('APPROX')
  })
})

describe('places API', () => {
  it('localises text and finds places containing a point', async () => {
    const en = (await api().get(`/api/places/${place.slug}?lang=en`)).body
    expect(en).toMatchObject({ name: 'Hualien Coast', region: 'Hualien', guidelines: ['Do not feed wildlife'], area: 'taiwan', timezone: 'Asia/Taipei' })
    const match = (await api().get('/api/places/match').query({ lat: LAT + 0.01, lng: LNG })).body
    expect(match.inside.map((p: { slug: string }) => p.slug)).toContain(place.slug)
    const far = (await api().get('/api/places/match').query({ lat: LAT + 0.2, lng: LNG })).body
    expect(far.inside).toEqual([])
    expect((await api().get('/api/places/no-such-place')).status).toBe(404)
  })

  it('lists trips whose meeting point is inside the place', async () => {
    const res = await api()
      .post('/api/trips')
      .set(auth(ivy))
      .send({
        title: 'Reef egrets at dawn',
        description: 'Meet at the car park; we will walk the coast path north.',
        startsAt: new Date(Date.now() + 5 * day).toISOString(),
        endsAt: new Date(Date.now() + 5 * day + 3 * 3600_000).toISOString(),
        meetingPoint: 'Coast car park',
        latitude: LAT + 0.005,
        longitude: LNG,
        capacity: 6
      })
    expect(res.status).toBe(201)
    expect((await api().get(`/api/trips/${res.body.id}`)).body.place).toMatchObject({ slug: place.slug })
    const detail = (await api().get(`/api/places/${place.slug}`)).body
    expect(detail.trips.upcoming.map((t: { id: number }) => t.id)).toContain(res.body.id)
    expect(detail.discussions.length).toBeGreaterThan(0)
  })

  it('takes proposals, visible to the proposer until curated', async () => {
    const body = { name: { en: 'Qingshui Cliffs' }, kind: 'COAST', countryCode: 'tw', latitude: 24.2, longitude: 121.66, radiusM: 2000 }
    // Inside an existing curated place → refused with its name
    const inside = await api()
      .post('/api/places')
      .set(auth(jon))
      .send({ ...body, latitude: LAT, longitude: LNG })
    expect(inside.status).toBe(409)
    expect(inside.body.error.message).toContain('花蓮海岸')

    const res = await api().post('/api/places').set(auth(jon)).send(body)
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ status: 'PROPOSED', countryCode: 'TW', area: 'taiwan', slug: 'qingshui-cliffs' })
    const slug = res.body.slug
    expect((await api().get(`/api/places/${slug}`).set(auth(jon))).status).toBe(200)
    expect((await api().get(`/api/places/${slug}`).set(auth(ivy))).status).toBe(404)
    expect((await api().get('/api/places').query({ mine: 1 }).set(auth(jon))).body.map((p: { slug: string }) => p.slug)).toEqual([slug])
    expect((await api().get('/api/places')).body.some((p: { slug: string }) => p.slug === slug)).toBe(false)

    // Only the proposer can attach observations to a proposal
    const img = await api().post('/api/images?folder=photos').set(auth(ivy)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
    const bad = await api()
      .post('/api/photos')
      .set(auth(ivy))
      .send({ title: 'Cliff swifts', description: 'Swifts along the cliff face.', locationName: 'Qingshui', latitude: 24.2, longitude: 121.66, imageIds: [img.body[0].id], placeId: res.body.id })
    expect(bad.status).toBe(400)
    const own = await photo(jon, { latitude: 24.2, longitude: 121.66, placeId: res.body.id })
    // Proposals stay private in the place filter too
    expect((await api().get('/api/photos').query({ place: slug })).body.total).toBe(0)
    expect((await api().get('/api/photos').query({ place: slug }).set(auth(ivy))).body.total).toBe(0)
    expect((await api().get('/api/photos').query({ place: slug }).set(auth(jon))).body.items.map((p: { id: number }) => p.id)).toEqual([own])
  })

  it('only attaches observations that lie inside the place', async () => {
    // Kenya → refused
    const img = await api().post('/api/images?folder=photos').set(auth(ivy)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
    const far = await api()
      .post('/api/photos')
      .set(auth(ivy))
      .send({ title: 'Far away', description: 'An observation from Kenya.', locationName: 'Mara', latitude: -1.5, longitude: 35.1, imageIds: [img.body[0].id], placeId: place.id })
    expect(far.status).toBe(400)
    expect(far.body.error.message).toContain('花蓮海岸')
    // Within radius + 1 km tolerance → accepted
    const id = await photo(ivy, { latitude: LAT + 0.03, longitude: LNG, placeId: place.id })
    expect((await api().get(`/api/photos/${id}`)).body.place?.slug).toBe(place.slug)
    // Moving it away drops the place; asking for the place with far coordinates is refused
    expect((await api().patch(`/api/photos/${id}`).set(auth(ivy)).send({ latitude: 22.0, longitude: 120.7 })).status).toBe(200)
    expect((await api().get(`/api/photos/${id}`)).body.place).toBeNull()
    expect((await api().patch(`/api/photos/${id}`).set(auth(ivy)).send({ placeId: place.id })).status).toBe(400)
  })
})

describe('imported records', () => {
  it('keep the source research grade and take identifications on the source only', async () => {
    const account = await prisma.user.create({ data: { email: `import-${stamp}@system.test`, username: 'iNaturalist import', system: true }, select: { id: true } })
    const p = await prisma.photoPost.create({
      data: {
        title: 'Pacific Reef Heron',
        description: '',
        locationName: 'Hualien Coast',
        latitude: LAT,
        longitude: LNG,
        takenAt: new Date('2026-04-02T01:00:00Z'),
        speciesId: common,
        placeId: place.id,
        authorId: account.id,
        license: 'CC_BY',
        sourceName: 'iNaturalist',
        sourceId: `${stamp}`,
        sourceUrl: `https://www.inaturalist.org/observations/${stamp}`,
        sourceAuthor: 'A. Observer',
        sourceLicense: 'cc-by'
      },
      select: { id: true }
    })
    await refreshQuality(p.id)
    const detail = (await api().get(`/api/photos/${p.id}`)).body
    expect(detail).toMatchObject({ quality: 'CONFIRMED', sourceName: 'iNaturalist', sourceAuthor: 'A. Observer', license: 'CC_BY', author: { system: true } })
    // No text of its own: the title is the species name, the location the place, both in the viewer's language
    expect((await api().get(`/api/photos/${p.id}?lang=en`)).body.locationName).toBe('Hualien Coast')
    expect((await api().get(`/api/photos/${p.id}`)).body.locationName).toBe('花蓮海岸')
    const listed = (await api().get('/api/photos').query({ place: place.slug, lang: 'en' })).body.items.find((x: { id: number }) => x.id === p.id)
    expect(listed).toMatchObject({ locationName: 'Hualien Coast', title: `岩鷺-${stamp}` })
    expect(listed.place).toBeUndefined()
    const id = await api().post(`/api/photos/${p.id}/identifications`).set(auth(jon)).send({ speciesId: sensitive })
    expect(id.status).toBe(409)
    // The import account isn't listed among the place's photographers
    const placeDetail = (await api().get(`/api/places/${place.slug}`)).body
    expect(placeDetail.photographers.map((x: { author: { id: number } }) => x.author.id)).not.toContain(account.id)
    expect(placeDetail.sources).toEqual([{ name: 'iNaturalist', observationCount: 1, observerCount: 1 }])
  })
})

describe('areas from time zones', () => {
  it('derives the area from the time zone, not a lat/lng box', async () => {
    const { areaOf } = await import('../src/modules/places/areas')
    expect(areaOf(25.03, 121.56)).toBe('taiwan') // Taipei
    expect(areaOf(24.43, 118.32)).toBe('taiwan') // Kinmen
    expect(areaOf(26.07, 119.3)).toBe('other') // Fuzhou
    expect(areaOf(37.56, 126.98)).toBe('other') // Seoul
    expect(areaOf(43.06, 141.35)).toBe('japan') // Sapporo
    expect(areaOf(36.75, 3.06)).toBe('other') // Algiers
    expect(areaOf(36.72, -4.42)).toBe('europe') // Málaga
    expect(areaOf(21.31, -157.86)).toBe('other') // Honolulu
    expect(areaOf(18.47, -66.1)).toBe('other') // San Juan
    expect(areaOf(44.6, -110.5)).toBe('north-america') // Yellowstone
    expect(areaOf(-1.5, 35.15)).toBe('east-africa') // Maasai Mara
    expect(areaOf(-42.4, 173.68)).toBe('oceania') // Kaikōura
  })
})

describe('seasons per area', () => {
  it('splits a species’ months by area and lists in-season species per area', async () => {
    const stats = (await api().get(`/api/species/${common}`)).body
    const tw = stats.stats?.monthlyByArea ?? stats.monthlyByArea
    expect(tw.find((a: { area: string }) => a.area === 'taiwan').months[2]).toBeGreaterThan(0)
    const lists = (await api().get('/api/species/in-season/areas').query({ month: 3, limit: 50 })).body
    const taiwan = lists.find((l: { area: string }) => l.area === 'taiwan')
    expect(taiwan.items.map((s: { id: number }) => s.id)).toContain(common)
    const single = (await api().get('/api/species/in-season').query({ month: 3, area: 'taiwan', limit: 50 })).body
    expect(single.map((s: { id: number }) => s.id)).toContain(common)
    expect((await api().get('/api/species/in-season').query({ month: 3, area: 'oceania', limit: 50 })).body.map((s: { id: number }) => s.id)).not.toContain(common)
  })
})
