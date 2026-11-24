import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import { prisma } from './lib/prisma'
import { httpLogger } from './lib/logger'
import { UPLOAD_DIR } from './lib/storage'
import { ApiError } from './lib/errors'
import { attachLocale, attachUser } from './middleware/auth'
import { errorHandler, notFound } from './middleware/error'
import { authRoutes } from './modules/auth/auth.routes'
import { feedRoutes, userRoutes } from './modules/users/user.routes'
import { articleRoutes } from './modules/articles/article.routes'
import { photoRoutes } from './modules/photos/photo.routes'
import { communityRoutes } from './modules/community/community.routes'
import { pollRoutes } from './modules/polls/poll.routes'
import { imageRoutes } from './modules/images/image.routes'
import { commentRoutes } from './modules/engagement/engagement'
import { adminRoutes } from './modules/admin/admin.routes'
import { metaRoutes } from './modules/meta/meta.routes'
import { speciesRoutes } from './modules/species/species.routes'
import { notificationRoutes } from './modules/notifications/notification.routes'
import { reportRoutes } from './modules/reports/report.routes'
import { forumRoutes } from './modules/community/forum'
import { translateRoutes } from './modules/translate/translate.routes'
import { challengeRoutes } from './modules/challenges/challenge.routes'
import { tripRoutes } from './modules/trips/trip.routes'
import { critiqueRoutes } from './modules/photos/critique.routes'
import { photoStatsRoutes, scoutingRoutes } from './modules/photos/scouting.routes'
import { gearRoutes, userGearRoutes } from './modules/gear/gear.routes'
import { placeRoutes } from './modules/places/place.routes'
import { outingRoutes } from './modules/outings/outing.routes'

export const createApp = () => {
  const app = express()

  app.set('trust proxy', 1)
  app.disable('x-powered-by')
  app.use(httpLogger)
  app.use(attachLocale)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      exposedHeaders: ['x-request-id', 'Content-Disposition'],
      maxAge: 86400
    })
  )
  app.use(express.json({ limit: '2mb' }))

  // Locally stored uploads (only used when Cloudinary is not configured).
  if (!env.cloudinaryEnabled) {
    app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }))
  }

  const api = express.Router()

  /** Liveness + database connectivity (503 when the database is unreachable). */
  api.get('/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() })
    } catch (err) {
      req.log.error({ err }, 'Health check: database unreachable')
      const error = new ApiError('SERVICE_UNAVAILABLE', 'error.unavailable').render(req.locale)
      res.status(503).json({ status: 'error', db: 'unreachable', time: new Date().toISOString(), error })
    }
  })

  api.use(attachUser)
  api.use('/auth', authRoutes)
  api.use('/users', userRoutes)
  api.use('/users', photoStatsRoutes)
  api.use('/users', userGearRoutes)
  api.use('/feed', feedRoutes)
  api.use('/articles', articleRoutes)
  api.use('/photos/:id/critiques', critiqueRoutes)
  api.use('/photos', photoRoutes)
  api.use('/community-posts', communityRoutes)
  api.use('/community', forumRoutes)
  api.use('/polls', pollRoutes)
  api.use('/comments', commentRoutes)
  api.use('/images', imageRoutes)
  api.use('/admin', adminRoutes)
  api.use('/meta', metaRoutes)
  api.use('/species', speciesRoutes)
  api.use('/notifications', notificationRoutes)
  api.use('/reports', reportRoutes)
  api.use('/translate', translateRoutes)
  api.use('/challenges', challengeRoutes)
  api.use('/trips', tripRoutes)
  api.use('/scouting', scoutingRoutes)
  api.use('/gear', gearRoutes)
  api.use('/places', placeRoutes)
  api.use('/outings', outingRoutes)

  // Versioned API; the unversioned /api prefix stays as an alias for existing clients.
  app.use('/api/v1', api)
  app.use('/api', api)

  app.use(notFound)
  app.use(errorHandler)
  return app
}
