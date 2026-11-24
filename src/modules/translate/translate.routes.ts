import { createHash } from 'node:crypto'
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'
import { parse } from '../../lib/validate'
import { localeSchema } from '../../lib/schemas'
import { env } from '../../config/env'

/**
 * Machine translation of user-generated content ("Translate" buttons on posts,
 * replies and photo descriptions). Provider: DeepL when DEEPL_API_KEY is set,
 * otherwise Google Cloud Translation when GOOGLE_TRANSLATE_API_KEY is set.
 * Results are cached by (text, target) so repeated views cost nothing.
 */

export type Provider = 'deepl' | 'google'
export const translateProvider = (): Provider | null =>
  env.DEEPL_API_KEY ? 'deepl' : env.GOOGLE_TRANSLATE_API_KEY ? 'google' : null

const body = z.object({
  texts: z.array(z.string().max(5000)).min(1).max(50),
  target: localeSchema
})

const hash = (text: string, target: string) => createHash('sha256').update(`${target}\u0000${text}`).digest('hex')

const deepl = async (texts: string[], target: string) => {
  const key = env.DEEPL_API_KEY!
  const host = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com'
  const res = await fetch(`${host}/v2/translate`, {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texts, target_lang: target === 'en' ? 'EN-US' : 'ZH-HANT' })
  })
  if (!res.ok) throw new Error(`deepl ${res.status}`)
  const data = (await res.json()) as { translations: { text: string }[] }
  return data.translations.map((t) => t.text)
}

const google = async (texts: string[], target: string) => {
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${env.GOOGLE_TRANSLATE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target: target === 'en' ? 'en' : 'zh-TW', format: 'text' })
  })
  if (!res.ok) throw new Error(`google ${res.status}`)
  const data = (await res.json()) as { data: { translations: { translatedText: string }[] } }
  return data.data.translations.map((t) => t.translatedText)
}

/** Translates `texts` into `target`, using the cache where possible. Blank strings pass through. */
export const translate = async (texts: string[], target: 'zh-TW' | 'en') => {
  const provider = translateProvider()
  if (!provider) throw new ApiError('SERVICE_UNAVAILABLE', 'translate.disabled')

  const keys = texts.map((t) => hash(t, target))
  const cached = await prisma.translationCache.findMany({ where: { hash: { in: keys } }, select: { hash: true, text: true } })
  const hit = new Map(cached.map((c) => [c.hash, c.text]))

  const missing = [...new Set(texts.filter((t, i) => t.trim() && !hit.has(keys[i]!)))]
  if (missing.length) {
    let out: string[]
    try {
      out = provider === 'deepl' ? await deepl(missing, target) : await google(missing, target)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE', 'translate.failed')
    }
    const rows = missing.map((text, i) => ({ hash: hash(text, target), target, text: out[i] ?? text }))
    await prisma.translationCache.createMany({ data: rows, skipDuplicates: true })
    for (const r of rows) hit.set(r.hash, r.text)
  }
  return texts.map((t, i) => (t.trim() ? (hit.get(keys[i]!) ?? t) : t))
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: () => {
    throw new ApiError('TOO_MANY_REQUESTS', 'error.too_many_requests')
  }
})

export const translateRoutes = Router()

translateRoutes.post('/', limiter, async (req, res) => {
  const { texts, target } = parse(body, req.body)
  res.json({ translations: await translate(texts, target), provider: translateProvider() })
})
