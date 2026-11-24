import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app'
import { prisma } from '../src/lib/prisma'

const app = createApp()
const api = () => request(app)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
const day = 24 * 3600_000

type U = { token: string; id: number }
const auth = (u: U) => ({ Authorization: `Bearer ${u.token}` })
const stamp = Date.now()
const register = async (name: string): Promise<U> => {
  const res = await api().post('/api/auth/register').send({ email: `${name}-${stamp}@v3.test`, username: name, password: 'password123' })
  expect(res.status).toBe(201)
  return { token: res.body.accessToken, id: res.body.user.id }
}
const photo = async (u: U, extra: object = {}) => {
  const img = await api().post('/api/images?folder=photos').set(auth(u)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
  const res = await api()
    .post('/api/photos')
    .set(auth(u))
    .send({ title: 'Field record', description: 'An observation from the field.', locationName: 'Somewhere', latitude: 25.12, longitude: 121.47, imageIds: [img.body[0].id], ...extra })
  expect(res.status).toBe(201)
  return res.body.id as number
}

let ana: U, ben: U, cal: U

beforeAll(async () => {
  ;[ana, ben, cal] = await Promise.all([register('Ana'), register('Ben'), register('Cal')])
})

describe('challenges', () => {
  const slug = `night-${stamp}`
  let challengeId: number

  beforeAll(async () => {
    const c = await prisma.challenge.create({
      data: {
        slug,
        title: { 'zh-TW': '夜行動物', en: 'Night creatures' },
        brief: { 'zh-TW': '拍攝夜間活動的動物', en: 'Animals active after dark' },
        rules: { 'zh-TW': ['不使用誘餌'], en: ['No baiting'] },
        coverUrl: 'https://example.com/c.jpg',
        startsAt: new Date(Date.now() - day),
        submitEndsAt: new Date(Date.now() + day),
        voteEndsAt: new Date(Date.now() + 2 * day)
      }
    })
    challengeId = c.id
  })

  it('lists and localises challenges', async () => {
    const list = await api().get('/api/challenges?lang=en')
    const item = list.body.find((c: { slug: string }) => c.slug === slug)
    expect(item).toMatchObject({ title: 'Night creatures', phase: 'open', entryCount: 0 })
    const detail = await api().get(`/api/challenges/${slug}`).set(auth(ana))
    expect(detail.body).toMatchObject({ rules: ['不使用誘餌'], limits: { entries: 3, votes: 3 }, me: { entries: [], votes: [] } })
  })

  it('accepts own photos only, up to the entry limit', async () => {
    const mine = await photo(ana)
    const theirs = await photo(ben)
    expect((await api().post(`/api/challenges/${slug}/entries`).set(auth(ana)).send({ photoId: theirs })).status).toBe(400)
    expect((await api().post(`/api/challenges/${slug}/entries`).set(auth(ana)).send({ photoId: mine })).status).toBe(201)
    expect((await api().post(`/api/challenges/${slug}/entries`).set(auth(ana)).send({ photoId: mine })).status).toBe(409)
    for (let i = 0; i < 2; i++) expect((await api().post(`/api/challenges/${slug}/entries`).set(auth(ana)).send({ photoId: await photo(ana) })).status).toBe(201)
    const fourth = await api().post(`/api/challenges/${slug}/entries`).set(auth(ana)).send({ photoId: await photo(ana) })
    expect(fourth.status).toBe(400)
    expect((await api().post(`/api/challenges/${slug}/entries`).set(auth(ben)).send({ photoId: theirs })).status).toBe(201)
  })

  it('votes only during voting, never for yourself, and reveals counts at the end', async () => {
    const entries = (await api().get(`/api/challenges/${slug}/entries`).set(auth(cal))).body.items
    const anaEntry = entries.find((e: { photo: { author: { id: number } } }) => e.photo.author.id === ana.id)
    const benEntry = entries.find((e: { photo: { author: { id: number } } }) => e.photo.author.id === ben.id)
    expect(anaEntry.voteCount).toBeNull()
    expect((await api().put(`/api/challenges/${slug}/entries/${anaEntry.id}/vote`).set(auth(cal))).status).toBe(400) // still open

    await prisma.challenge.update({ where: { id: challengeId }, data: { submitEndsAt: new Date(Date.now() - 1000) } })
    expect((await api().put(`/api/challenges/${slug}/entries/${anaEntry.id}/vote`).set(auth(ana))).status).toBe(400) // own entry
    const v = await api().put(`/api/challenges/${slug}/entries/${benEntry.id}/vote`).set(auth(cal))
    expect(v.body).toEqual({ voted: true, votesLeft: 2 })
    await api().put(`/api/challenges/${slug}/entries/${benEntry.id}/vote`).set(auth(ana))
    await api().put(`/api/challenges/${slug}/entries/${anaEntry.id}/vote`).set(auth(cal))

    await prisma.challenge.update({ where: { id: challengeId }, data: { voteEndsAt: new Date(Date.now() - 500) } })
    const results = (await api().get(`/api/challenges/${slug}/entries?sort=top`)).body.items
    expect(results[0]).toMatchObject({ id: benEntry.id, voteCount: 2, rank: 1 })
    expect(results[1]).toMatchObject({ id: anaEntry.id, voteCount: 1, rank: 2 })
    const card = (await api().get('/api/challenges')).body.find((c: { slug: string }) => c.slug === slug)
    expect(card.phase).toBe('ended')
    expect(card.preview[0].entryId).toBe(benEntry.id)
  })
})

describe('trips', () => {
  let tripId: number

  it('creates a trip with a discussion thread; the organiser is going', async () => {
    const res = await api()
      .post('/api/trips')
      .set(auth(ana))
      .send({
        title: 'Dawn birding at Guandu',
        description: 'Meet at the visitor centre; we will walk the outer loop for waders and kingfishers.',
        startsAt: new Date(Date.now() + 3 * day).toISOString(),
        endsAt: new Date(Date.now() + 3 * day + 4 * 3600_000).toISOString(),
        meetingPoint: 'Guandu Nature Park visitor centre',
        latitude: 25.12,
        longitude: 121.47,
        capacity: 2
      })
    expect(res.status).toBe(201)
    tripId = res.body.id
    const trip = (await api().get(`/api/trips/${tripId}`)).body
    expect(trip).toMatchObject({ goingCount: 1, waitlistCount: 0, language: 'en', difficulty: 'EASY' })
    expect(trip.members.map((m: { id: number }) => m.id)).toEqual([ana.id])
    const thread = await api().get(`/api/community-posts/${trip.discussionId}`)
    expect(thread.body.category.key).toBe('meetups')
  })

  it('wait-lists when full and promotes when someone leaves', async () => {
    expect((await api().put(`/api/trips/${tripId}/join`).set(auth(ben))).body.status).toBe('GOING')
    expect((await api().put(`/api/trips/${tripId}/join`).set(auth(cal))).body.status).toBe('WAITLIST')
    expect((await api().delete(`/api/trips/${tripId}/join`).set(auth(ana))).status).toBe(400) // organiser
    expect((await api().delete(`/api/trips/${tripId}/join`).set(auth(ben))).status).toBe(204)
    const trip = (await api().get(`/api/trips/${tripId}`).set(auth(cal))).body
    expect(trip).toMatchObject({ goingCount: 2, waitlistCount: 0, myStatus: 'GOING' })
    const notes = (await api().get('/api/notifications').set(auth(cal))).body.items
    expect(notes[0]).toMatchObject({ type: 'TRIP_CONFIRMED', target: { type: 'trip', id: tripId } })
  })

  it('only participants can add photos to the album', async () => {
    expect((await api().post('/api/photos').set(auth(ben)).send({ title: 'x', tripId })).status).toBe(422)
    await expect(photo(ben, { tripId })).rejects.toThrow()
    const id = await photo(cal, { tripId })
    const album = (await api().get(`/api/photos?tripId=${tripId}`)).body.items
    expect(album.map((p: { id: number }) => p.id)).toEqual([id])
    expect((await api().get('/api/trips?when=upcoming')).body.items.some((t: { id: number }) => t.id === tripId)).toBe(true)
  })
})

describe('critiques', () => {
  it('scores a photo, keeps one critique per reviewer, and notifies the author', async () => {
    const id = await photo(ana, { critiqueRequested: true })
    const body = { composition: 4, light: 5, focus: 3, moment: 4, comment: 'Lovely light — try a lower angle next time.' }
    expect((await api().put(`/api/photos/${id}/critiques`).set(auth(ana)).send(body)).status).toBe(400)
    expect((await api().put(`/api/photos/${id}/critiques`).set(auth(ben)).send(body)).status).toBe(201)
    expect((await api().put(`/api/photos/${id}/critiques`).set(auth(ben)).send({ ...body, focus: 5 })).status).toBe(200)
    await api().put(`/api/photos/${id}/critiques`).set(auth(cal)).send({ ...body, composition: 2 })
    const res = (await api().get(`/api/photos/${id}/critiques`)).body
    expect(res.count).toBe(2)
    expect(res.averages).toEqual({ composition: 3, light: 5, focus: 4, moment: 4 })
    const list = (await api().get('/api/photos?critique=1')).body.items
    expect(list.find((p: { id: number }) => p.id === id)).toMatchObject({ critiqueRequested: true, critiqueCount: 2 })
    const notes = (await api().get('/api/notifications').set(auth(ana))).body.items
    expect(notes.filter((n: { type: string }) => n.type === 'CRITIQUE')).toHaveLength(2)
  })
})

describe('scouting', () => {
  it('builds area reports and photographer stats', async () => {
    const exif = { camera: 'Test Cam X', lens: 'Test 150-600mm', focalLength: '600mm', aperture: 'f/6.3', shutterSpeed: '1/2000s', iso: 800 }
    await photo(ben, { latitude: -54.8, longitude: -68.3, exif, takenAt: '2026-05-01T22:30:00Z' })
    await photo(ben, { latitude: -54.81, longitude: -68.31, exif: { ...exif, focalLength: '420mm' }, takenAt: '2026-05-02T23:00:00Z' })

    const area = (await api().get('/api/scouting/area?lat=-54.8&lng=-68.3&radiusKm=5')).body
    expect(area.photoCount).toBe(2)
    // Not in the catalogue: the raw EXIF name, without a slug
    expect(area.lenses[0]).toEqual({ name: 'Test 150-600mm', slug: null, count: 2 })
    expect(area.months[4]).toBe(2) // May
    expect(area.solarHours.reduce((a: number, b: number) => a + b, 0)).toBe(2)
    expect((await api().get('/api/photos').query({ lens: 'Test 150-600mm' })).body.total).toBe(2)

    const stats = (await api().get(`/api/users/${ben.id}/photo-stats`)).body
    expect(stats.lenses[0]).toEqual({ name: 'Test 150-600mm', slug: null, count: 2 })
    expect(stats.focalBuckets.find((b: { key: string }) => b.key === 'super').count).toBe(1)
  })
})
