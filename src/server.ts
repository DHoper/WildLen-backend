import { env } from './config/env'
import { createApp } from './app'
import { prisma } from './lib/prisma'
import { logger } from './lib/logger'
import { purgeOrphanImages } from './modules/images/image.service'

const app = createApp()

const server = app.listen(env.PORT, () => {
  logger.info(`🦌 WildLens API listening on http://localhost:${env.PORT} (v1 at /api/v1)`)
  if (!env.cloudinaryEnabled) logger.info('Cloudinary not configured — storing uploads in ./uploads')
  if (!env.RESEND_API_KEY) logger.info('RESEND_API_KEY not set — e-mails are logged instead of sent')
})

// Hourly sweep of uploads that were never attached to a post.
const sweep = setInterval(
  () => {
    purgeOrphanImages()
      .then((n) => n && logger.info(`🧹 Purged ${n} orphan image(s)`))
      .catch((err) => logger.error({ err }, 'Orphan image sweep failed'))
  },
  60 * 60 * 1000
)
sweep.unref()

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down…`)
  server.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
