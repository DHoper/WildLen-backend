import { OAuth2Client } from 'google-auth-library'
import { env } from '../config/env'
import { ApiError } from './errors'

export interface GoogleProfile {
  sub: string
  email: string
  emailVerified: boolean
  name?: string
  locale?: string
}

const client = new OAuth2Client()

/**
 * Verifies a Google ID token (from Google Identity Services on the web, or the
 * native Google Sign-In SDKs in the mobile app) and returns the profile.
 * Any of the configured client IDs is accepted as audience.
 */
export const verifyGoogleIdToken = async (idToken: string): Promise<GoogleProfile> => {
  if (!env.googleClientIds.length) throw new ApiError('SERVICE_UNAVAILABLE', 'auth.google_disabled')
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.googleClientIds })
    const p = ticket.getPayload()
    if (!p?.sub || !p.email) throw new Error('missing claims')
    return { sub: p.sub, email: p.email.toLowerCase(), emailVerified: p.email_verified === true, name: p.name, locale: p.locale }
  } catch {
    throw ApiError.unauthorized('auth.google_invalid')
  }
}
