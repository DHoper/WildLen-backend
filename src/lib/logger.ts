import { randomUUID } from 'node:crypto'
import pino from 'pino'
import { pinoHttp } from 'pino-http'
import { env } from '../config/env'

/** JSON logs in production, pretty-printed in development, silent in tests. */
export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
  })
})

const REQUEST_ID = /^[\w.-]{1,100}$/

/** Request logging + `x-request-id` (an incoming, well-formed id is reused). */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers['x-request-id']
    const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader('x-request-id', id)
    return id
  },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode })
  },
  autoLogging: { ignore: (req) => req.url === '/api/health' || req.url === '/api/v1/health' }
})
