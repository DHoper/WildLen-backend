import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { EmailTokenType, Role } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { signToken } from '../../lib/jwt'
import { ApiError } from '../../lib/errors'
import { env } from '../../config/env'

const DAY = 24 * 60 * 60 * 1000

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const newSecret = () => randomBytes(48).toString('base64url')

// ── Refresh tokens ────────────────────────────────────────────────────────────

const createRefreshToken = async (userId: number, familyId: string) => {
  const token = newSecret()
  await prisma.refreshToken.create({
    data: {
      tokenHash: sha256(token),
      familyId,
      userId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY)
    }
  })
  return token
}

/** `{ accessToken, refreshToken, expiresIn, user }` for a new or rotated session. */
export const issueSession = async <U extends { id: number; role: Role }>(user: U, familyId: string = randomUUID()) => ({
  accessToken: signToken({ sub: user.id, role: user.role }),
  refreshToken: await createRefreshToken(user.id, familyId),
  expiresIn: env.ACCESS_TOKEN_TTL,
  user
})

/**
 * Exchanges a refresh token for a new one (rotation). Presenting a token that was
 * already rotated means it leaked: the whole family (that login session) is revoked.
 */
export const rotateRefreshToken = async (token: string) => {
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('auth.invalid_refresh_token')
  }
  // Conditional update: of two concurrent uses, exactly one wins.
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() }
  })
  if (count === 0) {
    await revokeFamily(row.familyId)
    throw ApiError.unauthorized('auth.invalid_refresh_token')
  }
  return { userId: row.userId, familyId: row.familyId }
}

export const revokeFamily = (familyId: string) =>
  prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } })

export const revokeAllSessions = (userId: number) =>
  prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })

/** Logs out the session a refresh token belongs to; unknown tokens are ignored. */
export const revokeByToken = async (token: string) => {
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
    select: { familyId: true }
  })
  if (row) await revokeFamily(row.familyId)
}

// ── One-time e-mail tokens ────────────────────────────────────────────────────

const EMAIL_TOKEN_TTL: Record<EmailTokenType, number> = {
  VERIFY_EMAIL: 48 * 60 * 60 * 1000,
  RESET_PASSWORD: 60 * 60 * 1000
}

/** Creates a token, invalidating earlier unused ones of the same type. */
export const createEmailToken = async (userId: number, type: EmailTokenType) => {
  const token = newSecret()
  await prisma.$transaction([
    prisma.emailToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.emailToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL[type]) }
    })
  ])
  return token
}

/** Marks a token used and returns its user id; throws for unknown / used / expired tokens. */
export const consumeEmailToken = async (token: string, type: EmailTokenType) => {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest('auth.invalid_token')
  }
  const { count } = await prisma.emailToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() }
  })
  if (count === 0) throw ApiError.badRequest('auth.invalid_token')
  return row.userId
}
