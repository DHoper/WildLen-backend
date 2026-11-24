import 'dotenv/config'
import { z } from 'zod'

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .default('false')
  .transform((v) => v === 'true' || v === '1')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  /** Public base URL of this API (used for locally stored image URLs). */
  PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  /** Public URL of the website (used for links in e-mails). */
  APP_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:4000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Access token lifetime in seconds. */
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(15 * 60),
  /** Refresh token lifetime in days. */
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Per-IP requests per 15 minutes on auth routes (login, register, …). 0 = no limit. */
  AUTH_RATE_LIMIT: z.coerce.number().int().min(0).default(30),
  /** When true, creating content requires a verified e-mail address. */
  REQUIRE_EMAIL_VERIFICATION: bool,
  /** Resend (https://resend.com) API key. Without it, e-mails are logged instead of sent. */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('WildLens <no-reply@wildlens.dev>'),
  /** Google OAuth client IDs (comma-separated: web, iOS, Android). Empty = Google sign-in off. */
  GOOGLE_CLIENT_IDS: z.string().default(''),
  /** Machine translation of user content: DeepL (preferred) or Google Cloud Translation. */
  DEEPL_API_KEY: z.string().optional(),
  GOOGLE_TRANSLATE_API_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_KEY: z.string().optional(),
  CLOUDINARY_SECRET: z.string().optional()
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = {
  ...parsed.data,
  googleClientIds: parsed.data.GOOGLE_CLIENT_IDS.split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  cloudinaryEnabled: Boolean(
    parsed.data.CLOUDINARY_CLOUD_NAME && parsed.data.CLOUDINARY_KEY && parsed.data.CLOUDINARY_SECRET
  )
}
