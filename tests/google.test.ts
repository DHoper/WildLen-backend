import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

// Google's token check is mocked: the "credential" is a JSON profile.
vi.mock('../src/lib/google', async () => {
  const { ApiError } = await import('../src/lib/errors')
  return {
    verifyGoogleIdToken: async (token: string) => {
      try {
        return JSON.parse(token)
      } catch {
        throw ApiError.unauthorized('auth.google_invalid')
      }
    }
  }
})

const { createApp } = await import('../src/app')
const api = () => request(createApp())
const cred = (p: object) => JSON.stringify({ emailVerified: true, ...p })

describe('google sign-in', () => {
  it('creates a password-less, verified account on first sign-in', async () => {
    const res = await api().post('/api/auth/google').send({ credential: cred({ sub: 'g-new', email: 'NewUser@Gmail.com', name: 'New User' }) })
    expect(res.status).toBe(201)
    expect(res.body.created).toBe(true)
    expect(res.body.user).toMatchObject({ email: 'newuser@gmail.com', username: 'New User', emailVerified: true })

    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`)
    expect(me.body).toMatchObject({ hasPassword: false, googleLinked: true })
    expect(me.body.passwordHash).toBeUndefined()
    expect(me.body.googleId).toBeUndefined()

    // Signing in again finds the same account.
    const again = await api().post('/api/auth/google').send({ credential: cred({ sub: 'g-new', email: 'newuser@gmail.com' }) })
    expect(again.status).toBe(200)
    expect(again.body.created).toBe(false)
    expect(again.body.user.id).toBe(res.body.user.id)

    // Password login is impossible until a password is set; setting one needs no current password.
    const login = await api().post('/api/auth/login').send({ email: 'newuser@gmail.com', password: 'whatever1' })
    expect(login.status).toBe(401)
    const set = await api().put('/api/users/me/password').set('Authorization', `Bearer ${res.body.accessToken}`).send({ newPassword: 'password123' })
    expect(set.status).toBe(204)
    expect((await api().post('/api/auth/login').send({ email: 'newuser@gmail.com', password: 'password123' })).status).toBe(200)
  })

  it('links to an existing account with the same verified e-mail', async () => {
    const reg = await api().post('/api/auth/register').send({ email: 'linkme@example.com', username: 'Linker', password: 'password123' })
    expect(reg.status).toBe(201)
    const res = await api().post('/api/auth/google').send({ credential: cred({ sub: 'g-link', email: 'linkme@example.com' }) })
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(reg.body.user.id)
    expect(res.body.user.emailVerified).toBe(true)
  })

  it('refuses unverified Google e-mails and bad tokens', async () => {
    const res = await api().post('/api/auth/google').send({ credential: cred({ sub: 'g-x', email: 'x@example.com', emailVerified: false }) })
    expect(res.status).toBe(401)
    expect((await api().post('/api/auth/google').send({ credential: 'garbage' })).status).toBe(401)
  })

  it('unlinking requires a password; Google-only accounts delete by confirming their e-mail', async () => {
    const res = await api().post('/api/auth/google').send({ credential: cred({ sub: 'g-only', email: 'only@gmail.com', name: 'Only' }) })
    const h = { Authorization: `Bearer ${res.body.accessToken}` }
    expect((await api().delete('/api/auth/google/link').set(h)).status).toBe(400)
    expect((await api().delete('/api/users/me').set(h).send({ confirmEmail: 'wrong@gmail.com' })).status).toBe(400)
    expect((await api().delete('/api/users/me').set(h).send({ confirmEmail: 'ONLY@gmail.com' })).status).toBe(204)
  })
})
