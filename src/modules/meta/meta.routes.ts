import { Router } from 'express'
import { TAG_GROUPS } from '../../lib/tags'
import { AVATAR_COUNT } from '../auth/auth.routes'
import { translateProvider } from '../translate/translate.routes'
import { env } from '../../config/env'

export const metaRoutes = Router()

metaRoutes.get('/tags', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').json(TAG_GROUPS)
})

metaRoutes.get('/config', (_req, res) => {
  // Which optional features this deployment has configured.
  res.json({ avatarCount: AVATAR_COUNT, translate: !!translateProvider(), googleSignIn: env.googleClientIds.length > 0 })
})
