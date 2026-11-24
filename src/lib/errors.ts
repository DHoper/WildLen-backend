import { t, type Locale, type MessageKey, type MessageParams, type ResourceKey } from './i18n'

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'EMAIL_NOT_VERIFIED'
  | 'POST_LOCKED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  EMAIL_NOT_VERIFIED: 403,
  POST_LOCKED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
}

/** A validation problem on one field; rendered in the request's locale. */
export interface Issue {
  path: string
  key: MessageKey
  params?: MessageParams
}

/**
 * An error with a stable `code` and a translatable message key. The error handler
 * renders `key` in the caller's locale; `message` (zh-TW) is only for logs.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(
    readonly code: ErrorCode,
    readonly key: MessageKey,
    readonly params?: MessageParams,
    readonly issues?: Issue[]
  ) {
    super(t(key, 'zh-TW', params))
    this.status = STATUS[code]
  }

  render(locale: Locale) {
    return {
      code: this.code,
      message: t(this.key, locale, this.params),
      details: this.issues?.map((i) => ({
        path: i.path,
        message: t(i.key, locale, { field: i.path.split('.').filter((s) => !/^\d+$/.test(s)).pop() ?? '', ...i.params })
      }))
    }
  }

  static badRequest(key: MessageKey = 'error.bad_request', params?: MessageParams) {
    return new ApiError('BAD_REQUEST', key, params)
  }
  static unauthorized(key: MessageKey = 'error.unauthorized') {
    return new ApiError('UNAUTHORIZED', key)
  }
  static forbidden(key: MessageKey = 'error.forbidden', params?: MessageParams) {
    return new ApiError('FORBIDDEN', key, params)
  }
  static notFound(resource: ResourceKey = 'resource') {
    return new ApiError('NOT_FOUND', 'error.not_found', { resource })
  }
  static conflict(key: MessageKey = 'error.conflict') {
    return new ApiError('CONFLICT', key)
  }
}
