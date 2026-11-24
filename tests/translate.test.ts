import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

// Configure DeepL before the env module is loaded, and fake its HTTP API.
process.env.DEEPL_API_KEY = 'test-key:fx'
const calls: { url: string; body: { text: string[]; target_lang: string } }[] = []
vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
  const body = JSON.parse(init.body)
  calls.push({ url, body })
  return new Response(JSON.stringify({ translations: body.text.map((t: string) => ({ text: `[${body.target_lang}] ${t}` })) }), { status: 200 })
})

const { createApp } = await import('../src/app')
const api = () => request(createApp())

describe('translation', () => {
  it('reports the feature in /meta/config', async () => {
    const res = await api().get('/api/meta/config')
    expect(res.body.translate).toBe(true)
  })

  it('translates with DeepL, keeps blanks, and serves repeats from the cache', async () => {
    const texts = ['今天在關渡看到翠鳥', '  ', `cache-test-${Date.now()}`]
    const first = await api().post('/api/translate').send({ texts, target: 'en' })
    expect(first.status).toBe(200)
    expect(first.body.translations).toEqual(['[EN-US] 今天在關渡看到翠鳥', '  ', `[EN-US] ${texts[2]}`])
    expect(calls.at(-1)!.url).toBe('https://api-free.deepl.com/v2/translate')

    const before = calls.length
    const again = await api().post('/api/translate').send({ texts, target: 'en' })
    expect(again.body.translations).toEqual(first.body.translations)
    expect(calls.length).toBe(before)
  })

  it('validates input', async () => {
    expect((await api().post('/api/translate').send({ texts: [], target: 'en' })).status).toBe(422)
    expect((await api().post('/api/translate').send({ texts: ['x'], target: 'fr' })).status).toBe(422)
  })
})

describe('content language', () => {
  it('detects the language of text', async () => {
    const { detectLanguage } = await import('../src/lib/language')
    expect(detectLanguage('今天在關渡看到翠鳥')).toBe('zh-TW')
    expect(detectLanguage('Saw a kingfisher at Guandu today')).toBe('en')
    expect(detectLanguage('第一支超望遠：100-400 還是 150-600？')).toBe('zh-TW')
    expect(detectLanguage('Shooting from a safari vehicle', '在馬賽馬拉')).toBe('en')
  })
})
