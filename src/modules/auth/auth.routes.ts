import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { localeSchema, tagList } from '../../lib/schemas'
import { privateUserSelect } from '../../lib/select'
import { appLink, sendMailInBackground, templates } from '../../lib/mailer'
import { toLocale, type Locale } from '../../lib/i18n'
import { currentUser, requireAuth } from '../../middleware/auth'
import { env } from '../../config/env'
import { verifyGoogleIdToken } from '../../lib/google'
import {
  consumeEmailToken,
  createEmailToken,
  issueSession,
  revokeAllSessions,
  revokeByToken,
  rotateRefreshToken
} from './tokens'

export const AVATAR_COUNT = 12

export const emailSchema = z.string().trim().toLowerCase().email('validation.email')
export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .regex(/[A-Za-z]/, 'validation.password_letter')
  .regex(/\d/, 'validation.password_digit')
export const usernameSchema = z.string().trim().min(2).max(20)
export const avatarSchema = z.number().int().min(1).max(AVATAR_COUNT)

const registerBody = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  avatarIndex: avatarSchema.default(1),
  interests: tagList.default([]),
  locale: localeSchema.optional()
})

const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1)
})

const refreshBody = z.object({ refreshToken: z.string().min(1).max(200) })
const tokenBody = z.object({ token: z.string().min(1).max(200) })

const tooMany = () => {
  throw new ApiError('TOO_MANY_REQUESTS', 'error.too_many_requests')
}

/** Per-IP limit on auth routes; AUTH_RATE_LIMIT=0 turns it off (e.g. for local e2e runs). */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.AUTH_RATE_LIMIT || 1,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test' || env.AUTH_RATE_LIMIT === 0,
  handler: tooMany
})

/** Per-account limit for e-mail sending endpoints. */
const mailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `body:${String(req.body?.email ?? '')}`),
  skip: () => env.NODE_ENV === 'test',
  handler: tooMany
})

/** Creates a verification token and e-mails it (in the user's language). */
export const sendVerificationEmail = (user: { id: number; email: string; username: string; locale: string }) => {
  const locale = (toLocale(user.locale) ?? 'zh-TW') as Locale
  sendMailInBackground(
    createEmailToken(user.id, 'VERIFY_EMAIL').then((token) => ({
      to: user.email,
      ...templates.verifyEmail(locale, user.username, appLink(locale, `/verify-email?token=${token}`))
    }))
  )
}

export const authRoutes = Router()

authRoutes.post('/register', limiter, async (req, res) => {
  const data = parse(registerBody, req.body)
  const exists = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })
  if (exists) throw ApiError.conflict('auth.email_taken')

  const user = await prisma.user.create({
    data: {
      email: data.email,
      username: data.username,
      passwordHash: await bcrypt.hash(data.password, 12),
      avatarIndex: data.avatarIndex,
      interests: data.interests,
      // Without an explicit choice, use the language the user is browsing in.
      locale: data.locale ?? req.locale
    },
    select: privateUserSelect
  })
  sendVerificationEmail(user)
  res.status(201).json(await issueSession(user))
})

authRoutes.post('/login', limiter, async (req, res) => {
  const { email, password } = parse(loginBody, req.body)
  const record = await prisma.user.findUnique({
    where: { email },
    select: { ...privateUserSelect, passwordHash: true }
  })
  // Same message for unknown email and bad password, to avoid account enumeration.
  if (!record?.passwordHash || !(await bcrypt.compare(password, record.passwordHash))) {
    throw ApiError.unauthorized('auth.invalid_credentials')
  }
  const { passwordHash: _omit, ...user } = record
  res.json(await issueSession(user))
})

/** Rotates the refresh token; the old one becomes unusable. */
authRoutes.post('/refresh', limiter, async (req, res) => {
  const { refreshToken } = parse(refreshBody, req.body)
  const { userId, familyId } = await rotateRefreshToken(refreshToken)
  const user = await prisma.user.findUnique({ where: { id: userId }, select: privateUserSelect })
  if (!user) throw ApiError.unauthorized('auth.invalid_refresh_token')
  res.json(await issueSession(user, familyId))
})

authRoutes.post('/logout', async (req, res) => {
  const { refreshToken } = parse(refreshBody, req.body)
  await revokeByToken(refreshToken)
  res.status(204).end()
})

authRoutes.post('/logout-all', requireAuth, async (req, res) => {
  await revokeAllSessions(currentUser(req).id)
  res.status(204).end()
})

authRoutes.get('/me', requireAuth, async (req, res) => {
  const record = await prisma.user.findUnique({
    where: { id: currentUser(req).id },
    select: { ...privateUserSelect, passwordHash: true, googleId: true }
  })
  if (!record) throw ApiError.unauthorized('auth.account_missing')
  const { passwordHash, googleId, ...user } = record
  res.json({ ...user, hasPassword: !!passwordHash, googleLinked: !!googleId })
})

const googleBody = z.object({
  credential: z.string().min(1).max(4096),
  locale: localeSchema.optional()
})

/** Usernames are 2–20 chars; derive one from the Google name or the e-mail. */
const usernameFrom = (name: string | undefined, email: string) => {
  const base = (name ?? '').trim() || email.split('@')[0]!
  const chars = Array.from(base).slice(0, 20).join('')
  return chars.length >= 2 ? chars : `${chars}_wl`
}

/**
 * Sign in (or sign up) with a Google ID token. Matching order: linked Google account,
 * then an existing account with the same verified e-mail (linked automatically),
 * otherwise a new password-less account. `created` tells clients to show onboarding.
 */
authRoutes.post('/google', limiter, async (req, res) => {
  const { credential, locale } = parse(googleBody, req.body)
  const g = await verifyGoogleIdToken(credential)
  g.email = g.email.trim().toLowerCase()

  const linked = await prisma.user.findUnique({ where: { googleId: g.sub }, select: privateUserSelect })
  if (linked) return void res.json({ ...(await issueSession(linked)), created: false })

  if (!g.emailVerified) throw ApiError.unauthorized('auth.google_unverified')
  const byEmail = await prisma.user.findUnique({ where: { email: g.email }, select: { id: true } })
  if (byEmail) {
    const user = await prisma.user.update({
      where: { id: byEmail.id },
      data: { googleId: g.sub, emailVerified: true },
      select: privateUserSelect
    })
    return void res.json({ ...(await issueSession(user)), created: false })
  }

  const user = await prisma.user.create({
    data: {
      email: g.email,
      username: usernameFrom(g.name, g.email),
      googleId: g.sub,
      emailVerified: true,
      avatarIndex: 1 + Math.floor(Math.random() * AVATAR_COUNT),
      locale: locale ?? req.locale
    },
    select: privateUserSelect
  })
  res.status(201).json({ ...(await issueSession(user)), created: true })
})

/** Links Google to the signed-in account (e.g. from settings). */
authRoutes.post('/google/link', requireAuth, limiter, async (req, res) => {
  const { credential } = parse(googleBody, req.body)
  const g = await verifyGoogleIdToken(credential)
  const id = currentUser(req).id
  const other = await prisma.user.findUnique({ where: { googleId: g.sub }, select: { id: true } })
  if (other && other.id !== id) throw ApiError.conflict('auth.google_already_linked')
  await prisma.user.update({ where: { id }, data: { googleId: g.sub } })
  res.status(204).end()
})

authRoutes.delete('/google/link', requireAuth, async (req, res) => {
  const id = currentUser(req).id
  const user = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } })
  if (!user?.passwordHash) throw ApiError.badRequest('auth.password_required_to_unlink')
  await prisma.user.update({ where: { id }, data: { googleId: null } })
  res.status(204).end()
})

authRoutes.get('/email-available', limiter, async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.query)
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  res.json({ available: !exists })
})

// ── E-mail verification ───────────────────────────────────────────────────────

authRoutes.post('/verify-email', limiter, async (req, res) => {
  const { token } = parse(tokenBody, req.body)
  const userId = await consumeEmailToken(token, 'VERIFY_EMAIL')
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } })
  res.status(204).end()
})

authRoutes.post('/resend-verification', requireAuth, mailLimiter, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: currentUser(req).id },
    select: { id: true, email: true, username: true, locale: true, emailVerified: true }
  })
  if (user && !user.emailVerified) sendVerificationEmail(user)
  res.status(204).end()
})

// ── Password reset ────────────────────────────────────────────────────────────

/** Always 204, whether or not the account exists (no account enumeration). */
authRoutes.post('/forgot-password', limiter, mailLimiter, async (req, res) => {
  const { email } = parse(z.object({ email: emailSchema }), req.body)
  // Not awaited, so the response time doesn't reveal whether the account exists.
  void prisma.user
    .findUnique({ where: { email }, select: { id: true, email: true, username: true, locale: true } })
    .then((user) => {
      if (!user) return
      const locale = (toLocale(user.locale) ?? 'zh-TW') as Locale
      sendMailInBackground(
        createEmailToken(user.id, 'RESET_PASSWORD').then((token) => ({
          to: user.email,
          ...templates.resetPassword(locale, user.username, appLink(locale, `/reset-password?token=${token}`))
        }))
      )
    })
    .catch((err) => req.log.error({ err }, 'forgot-password lookup failed'))
  res.status(204).end()
})

authRoutes.post('/reset-password', limiter, async (req, res) => {
  const { token, password } = parse(z.object({ token: tokenBody.shape.token, password: passwordSchema }), req.body)
  const userId = await consumeEmailToken(token, 'RESET_PASSWORD')
  await prisma.user.update({
    where: { id: userId },
    // Receiving the e-mail proves ownership of the address.
    data: { passwordHash: await bcrypt.hash(password, 12), emailVerified: true }
  })
  await revokeAllSessions(userId)
  res.status(204).end()
})
