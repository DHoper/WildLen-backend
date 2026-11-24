import type { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { MulterError } from 'multer'
import { ApiError } from '../lib/errors'
import { DEFAULT_LOCALE } from '../lib/i18n'
import { logger } from '../lib/logger'

export const notFound: RequestHandler = (req) => {
  throw new ApiError('NOT_FOUND', 'error.route_not_found', { method: req.method, path: req.path })
}

const toApiError = (err: unknown): ApiError => {
  if (err instanceof ApiError) return err
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2025: record not found for update/delete; P2002: unique constraint
    if (err.code === 'P2025') return ApiError.notFound()
    if (err.code === 'P2002') return ApiError.conflict()
    if (err.code === 'P2003') return ApiError.badRequest('error.relation_missing')
    return new ApiError('INTERNAL_ERROR', 'error.database')
  }
  if (err instanceof MulterError) {
    return ApiError.badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'error.file_too_large' : 'error.upload_failed')
  }
  const type = (err as { type?: string } | null)?.type
  if (type === 'entity.parse.failed') return ApiError.badRequest('error.invalid_json')
  if (type === 'entity.too.large') return ApiError.badRequest('error.payload_too_large')
  return new ApiError('INTERNAL_ERROR', 'error.internal')
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const error = toApiError(err)
  if (error.status >= 500) (req.log ?? logger).error({ err }, 'Unhandled error')
  res.status(error.status).json({ error: error.render(req.locale ?? DEFAULT_LOCALE) })
}
