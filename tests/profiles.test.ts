import request from 'supertest'
import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'
import { communityConfirmedWhere, refreshQuality } from '../src/modules/photos/quality'
import { migrateTags } from '../src/lib/tags'
import { decodeEntities } from '../src/lib/entities'

const app = createApp()
const api = () => request(app)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })
const stamp = Date.now()
const register = async (name: string, extra: object = {}): Promise<U> => {
  const res = await api().post('/api/auth/register').send({ email: `${name}-${stamp}@profiles.test`, username: name, password: 'password123', ...extra })
  expect(res.status).toBe(201)
  return { token: res.body.accessToken, id: res.body.user.id }
}
const upload = async (u: U, folder = 'photos') => {
  const res = await api().post(`/api/images?folder=${folder}`).set(auth(u)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
  expect(res.status).toBe(201)
  return res.body[0] as { id: number; url: string }
}

// A place on the Pingtung coast, away from other test files' coordinates
const LAT = 22.03
const LNG = 120.69
let ann: U, bo: U
let place: { id: number; slug: string }
let egret: number, falcon: number, heron: number

const photo = async (u: U, speciesId: number, extra: object = {}) => {
  const img = await upload(u)
  const res = await api()
    .post('/api/photos')
    .set(auth(u))
    .send({ title: 'Coast record', description: 'An observation on the coast.', locationName: 'Coast', latitude: LAT, longitude: LNG, takenAt: '2026-04-11T23:15:00Z', speciesId, imageIds: [img.id], placeId: place.id, ...extra })
  expect(res.status).toBe(201)
  return res.body.id as number
}

beforeAll(async () => {
  ;[ann, bo] = await Promise.all([register('Ann', { interests: ['birds', 'technique'] }), register('Bo')])
  place = await prisma.place.create({
    data: { slug: `pingtung-coast-${stamp}`, name: { 'zh-TW': '屏東海岸', en: 'Pingtung Coast' }, kind: 'COAST', countryCode: 'TW', area: 'taiwan', region: { 'zh-TW': '屏東縣', en: 'Pingtung' }, latitude: LAT, longitude: LNG, radiusM: 3000, timezone: 'Asia/Taipei', status: 'CURATED' },
    select: { id: true, slug: true }
  })
  const family = { taxonOrder: 'Pelecaniformes', orderNames: { 'zh-TW': '鵜形目', en: 'Pelicans, Herons, Ibises' }, taxonFamily: `Ardeidae${stamp}`, familyNames: { 'zh-TW': '鷺科', en: 'Herons' } }
  heron = (await prisma.species.create({ data: { commonName: `蒼鷺-${stamp}`, englishName: `Grey Heron ${stamp}`, scientificName: `Ardea cinerea ${stamp}`, group: 'BIRD', ...family }, select: { id: true } })).id
  egret = (
    await prisma.species.create({
      data: {
        commonName: `小白鷺-${stamp}`,
        englishName: `Little Egret ${stamp}`,
        scientificName: `Egretta garzetta ${stamp}`,
        group: 'BIRD',
        ...family,
        identification: { 'zh-TW': '嘴黑色、趾黃色', en: 'Black bill, yellow feet' },
        similarSpeciesIds: [heron]
      },
      select: { id: true }
    })
  ).id
  falcon = (await prisma.species.create({ data: { commonName: `遊隼-${stamp}`, scientificName: `Falco peregrinus ${stamp}`, group: 'BIRD', sensitive: true }, select: { id: true } })).id
})

describe('species pages', () => {
  it('adds taxonomy, field marks, look-alikes and a shooting guide from the records', async () => {
    for (let i = 0; i < 3; i++) await photo(ann, egret, { exif: { camera: 'Canon EOS R5', focalLength: i ? '500mm' : '400mm' } })
    const res = await api().get(`/api/species/${egret}?lang=en`)
    expect(res.status).toBe(200)
    expect(res.body.taxonomy).toEqual({ order: { scientificName: 'Pelecaniformes', name: 'Pelicans, Herons, Ibises' }, family: { scientificName: `Ardeidae${stamp}`, name: 'Herons' } })
    expect(res.body.identification).toBe('Black bill, yellow feet')
    expect(res.body.similar.map((s: { id: number }) => s.id)).toEqual([heron])
    expect(res.body.guide.focalLengths).toEqual([
      { mm: 400, count: 1 },
      { mm: 500, count: 2 }
    ])
    // 23:15 UTC at 120.69°E ≈ 07:18 solar time
    expect(res.body.guide.hours[7]).toBe(3)
    expect(res.body.guide.places).toEqual([expect.objectContaining({ place: expect.objectContaining({ slug: place.slug }), count: 3 })])
    const dist = (await api().get(`/api/species/${egret}/distribution`)).body
    expect(dist.mode).toBe('points')
    expect(dist.points[0]).toMatchObject({ latitude: LAT, longitude: LNG, count: 3 })
  })

  it('never lists places, hours or journals for a sensitive species, and maps it as a coarse grid', async () => {
    await photo(ann, falcon)
    await photo(bo, falcon)
    const res = (await api().get(`/api/species/${falcon}`)).body
    expect(res.guide.places).toEqual([])
    expect(res.guide.hours.every((n: number) => n === 0)).toBe(true)
    expect(res.related.outings).toEqual([])
    const dist = (await api().get(`/api/species/${falcon}/distribution`)).body
    expect(dist).toMatchObject({ mode: 'grid', cellDeg: 1 })
    expect(dist.points).toBeUndefined()
    expect(dist.cells).toEqual([{ latitude: 22.5, longitude: 120.5, count: 2 }])
  })

  it('browses by family', async () => {
    const families = (await api().get('/api/species/families').query({ group: 'BIRD' })).body
    expect(families.find((f: { family: { scientificName: string } }) => f.family.scientificName === `Ardeidae${stamp}`)).toMatchObject({ family: { name: '鷺科' }, order: { name: '鵜形目' }, speciesCount: 2 })
    const list = (await api().get('/api/species').query({ family: `Ardeidae${stamp}` })).body
    expect(list.items.map((s: { id: number }) => s.id).sort()).toEqual([egret, heron].sort())
    expect(list.items[0].family).toEqual({ scientificName: `Ardeidae${stamp}`, name: '鷺科' })
    expect(list.items[0].familyNames).toBeUndefined()
  })

  it('gives admins the stored field marks to edit, and nobody else', async () => {
    const email = `admin-${stamp}@profiles.test`
    await prisma.user.create({ data: { email, username: 'Profiles admin', passwordHash: await bcrypt.hash('password123', 4), role: 'ADMIN', emailVerified: true } })
    const login = (await api().post('/api/auth/login').send({ email, password: 'password123' })).body
    const admin = { token: login.accessToken as string, id: login.user.id as number }
    const asAdmin = (await api().get(`/api/species/${egret}`).set(auth(admin))).body
    expect(asAdmin.editable).toMatchObject({ identification: { 'zh-TW': '嘴黑色、趾黃色', en: 'Black bill, yellow feet' }, similarSpeciesIds: [heron] })
    expect((await api().get(`/api/species/${egret}`).set(auth(ann))).body.editable).toBeUndefined()

    // An editorial account's articles are listed on its page
    const article = await api()
      .post('/api/articles')
      .set(auth(admin))
      .send({ title: 'Coastal egrets in spring', coverImageUrl: 'https://example.com/e.jpg', content: { ops: [{ insert: 'Notes from the coast.\n' }] }, status: 'PUBLISHED' })
    expect(article.status).toBe(201)
    expect((await api().get('/api/articles').query({ authorId: admin.id })).body.items.map((a: { id: number }) => a.id)).toEqual([article.body.id])
    expect((await api().get('/api/articles').query({ authorId: ann.id })).body.total).toBe(0)
    expect((await api().get(`/api/users/${admin.id}`)).body.stats.articleCount).toBe(1)
    // …and on the species page when the title names the species
    const named = await api()
      .post('/api/articles')
      .set(auth(admin))
      .send({ title: `Watching the Little Egret ${stamp}`, coverImageUrl: 'https://example.com/e.jpg', content: { ops: [{ insert: 'Notes.\n' }] }, status: 'PUBLISHED' })
    expect((await api().get(`/api/species/${egret}`)).body.related.articles.map((a: { id: number }) => a.id)).toEqual([named.body.id])
  })
})

describe('photographer pages', () => {
  it('saves home area, specialties and an uploaded avatar', async () => {
    const mine = await upload(ann, 'avatars')
    const res = await api().patch('/api/users/me').set(auth(ann)).send({ homeArea: 'taiwan', specialties: ['BIRD', 'BIRD', 'MAMMAL'], avatarUrl: mine.url })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ homeArea: 'taiwan', specialties: ['BIRD', 'MAMMAL'], avatarUrl: mine.url })
    // Someone else's upload can't be used
    const theirs = await upload(bo, 'avatars')
    expect((await api().patch('/api/users/me').set(auth(ann)).send({ avatarUrl: theirs.url })).status).toBe(400)
    expect((await api().patch('/api/users/me').set(auth(ann)).send({ homeArea: 'mars' })).status).toBe(422)
    const profile = (await api().get(`/api/users/${ann.id}`)).body
    expect(profile).toMatchObject({ homeArea: 'taiwan', specialties: ['BIRD', 'MAMMAL'], avatarUrl: mine.url, system: false })
    expect(profile.stats).toMatchObject({ outingCount: 0, identificationCount: 0, articleCount: 0 })
  })

  it('lists identifications, frequent places and trips', async () => {
    const p = await photo(bo, heron)
    await api().post(`/api/photos/${p}/identifications`).set(auth(ann)).send({ speciesId: heron })
    const ids = (await api().get(`/api/users/${ann.id}/identifications`)).body
    expect(ids).toMatchObject({ total: 1, agreeing: 1 })
    expect(ids.items[0]).toMatchObject({ agrees: true, species: { id: heron }, photo: { id: p } })

    const places = (await api().get(`/api/users/${ann.id}/places`)).body
    // The sensitive falcon is not tied to the place; the three egrets are
    expect(places).toEqual([expect.objectContaining({ place: expect.objectContaining({ slug: place.slug }), observationCount: 3 })])

    const trip = await api()
      .post('/api/trips')
      .set(auth(ann))
      .send({ title: 'Coastal waders at dawn', description: 'Meet at the harbour car park for the morning tide.', startsAt: new Date(Date.now() + 6 * 86400_000).toISOString(), endsAt: new Date(Date.now() + 6 * 86400_000 + 3 * 3600_000).toISOString(), meetingPoint: 'Harbour car park', latitude: LAT, longitude: LNG, capacity: 6 })
    expect(trip.status).toBe(201)
    expect((await api().get(`/api/users/${ann.id}/trips`)).body.map((t: { id: number }) => t.id)).toContain(trip.body.id)
    expect((await api().get(`/api/users/${bo.id}/trips`)).body).toEqual([])
  })
})

describe('member directory', () => {
  it('lists photographers by home area and specialty, without system accounts', async () => {
    const res = await api().get('/api/users').query({ area: 'taiwan', group: 'BIRD', pageSize: 50 })
    expect(res.status).toBe(200)
    const ids = res.body.items.map((u: { id: number }) => u.id)
    expect(ids).toContain(ann.id)
    expect(ids).not.toContain(bo.id)
    const me = res.body.items.find((u: { id: number }) => u.id === ann.id)
    expect(me).toMatchObject({ homeArea: 'taiwan', specialties: ['BIRD', 'MAMMAL'], stats: { photoCount: expect.any(Number), speciesCount: expect.any(Number) } })
    expect(me.email).toBeUndefined()
    const all = (await api().get('/api/users').query({ q: 'import', pageSize: 50 })).body
    expect(all.items.every((u: { system?: boolean }) => !u.system)).toBe(true)
    expect((await api().get('/api/users').query({ sort: 'species', pageSize: 5 })).status).toBe(200)
    expect((await api().get('/api/users').query({ area: 'mars' })).status).toBe(422)
  })
})

describe('photographer species count', () => {
  it('counts the same species as the species list (captive animals excluded)', async () => {
    await photo(bo, egret, { captive: true })
    const [profile, list] = await Promise.all([api().get(`/api/users/${bo.id}`), api().get(`/api/users/${bo.id}/species`)])
    expect(list.body.items.map((e: { species: { id: number } }) => e.species.id)).not.toContain(egret)
    expect(profile.body.stats.speciesCount).toBe(list.body.items.length)
  })
})

describe('data definitions', () => {
  it('counts only WildLens identifications as community confirmation', async () => {
    const account = await prisma.user.create({ data: { email: `import-${stamp}@profiles.test`, username: 'import', system: true }, select: { id: true } })
    const imported = await prisma.photoPost.create({
      data: { title: 'Imported', description: '', locationName: 'Coast', latitude: LAT, longitude: LNG, takenAt: new Date(), speciesId: heron, authorId: account.id, sourceName: 'iNaturalist', sourceId: `p-${stamp}` },
      select: { id: true }
    })
    await refreshQuality(imported.id)
    expect((await prisma.photoPost.findUnique({ where: { id: imported.id }, select: { quality: true } }))?.quality).toBe('CONFIRMED')
    expect(await prisma.photoPost.count({ where: { id: imported.id, ...communityConfirmedWhere } })).toBe(0)
  })

  it('decodes HTML entities in imported names', () => {
    expect(decodeEntities('Jan Ebr &amp; Ivana Ebrová')).toBe('Jan Ebr & Ivana Ebrová')
    expect(decodeEntities('O&#39;Neil &quot;Birder&quot; &#x6797;')).toBe('O\'Neil "Birder" 林')
    expect(decodeEntities('Fish & Chips &unknown;')).toBe('Fish & Chips &unknown;')
  })

  it('maps tags from the earlier catalogue', () => {
    expect(migrateTags(['photography-tips', 'dangerous-animals', 'birds', 'australia', 'critical-issues', 'conservation'])).toEqual(['technique', 'birds', 'oceania', 'conservation'])
    expect(migrateTags(['nonsense'])).toEqual([])
  })
})
