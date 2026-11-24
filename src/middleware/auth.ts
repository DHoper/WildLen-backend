import type { NextFunction, Request, Response } from 'express'
import type { Role } from '@prisma/client'
import { verifyToken } from '../lib/jwt'
import { ApiError } from '../lib/errors'
import { localeFromRequest, type Locale } from '../lib/i18n'
import { prisma } from '../lib/prisma'
import { env } from '../config/env'

export interface AuthUser {
  id: number
  role: Role
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser
      /** Response language: `?lang=` → Accept-Language → zh-TW. */
      locale: Locale
    }
  }
}

/** Resolves the response language. Mount before everything that can throw. */
export const attachLocale = (req: Request, _res: Response, next: NextFunction) => {
  req.locale = localeFromRequest(req)
  next()
}

/** Reads a Bearer token if present; never rejects. Mount globally. */
export const attachUser = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const payload = verifyToken(header.slice(7))
    if (payload) req.user = { id: payload.sub, role: payload.role }
  }
  next()
}

export const requireAuth = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw ApiError.unauthorized()
  next()
}

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw ApiError.unauthorized()
  if (req.user.role !== 'ADMIN') throw ApiError.forbidden()
  next()
}

/**
 * Authenticated, and — when REQUIRE_EMAIL_VERIFICATION is on — e-mail verified.
 * Use for creating user content (photos, posts, polls, comments).
 */
export const requireVerified = async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) throw ApiError.unauthorized()
  if (env.REQUIRE_EMAIL_VERIFICATION) {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { emailVerified: true } })
    if (!user?.emailVerified) throw new ApiError('EMAIL_NOT_VERIFIED', 'auth.email_not_verified')
  }
  next()
}

/** The authenticated user; use only behind requireAuth / requireAdmin. */
export const currentUser = (req: Request): AuthUser => {
  if (!req.user) throw ApiError.unauthorized()
  return req.user
}

/** Throws 403 unless the caller owns the resource or is an admin. */
export const assertOwnerOrAdmin = (user: AuthUser, ownerId: number | null) => {
  if (user.role !== 'ADMIN' && user.id !== ownerId) throw ApiError.forbidden()
}
