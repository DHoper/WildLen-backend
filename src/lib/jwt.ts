import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../config/env'

export interface TokenPayload {
  sub: number
  role: Role
}

/** Short-lived access token (ACCESS_TOKEN_TTL seconds). */
export const signToken = (payload: TokenPayload) =>
  jwt.sign({ role: payload.role }, env.JWT_SECRET, {
    subject: String(payload.sub),
    expiresIn: env.ACCESS_TOKEN_TTL
  })

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload
    const sub = Number(decoded.sub)
    if (!Number.isInteger(sub)) return null
    return { sub, role: decoded.role as Role }
  } catch {
    return null
  }
}
