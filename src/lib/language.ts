import type { Locale } from './i18n'

/**
 * Best-effort language of user-written text, for "show content in my language"
 * filters. A CJK character carries roughly a word's worth of meaning, so it is
 * weighted accordingly against Latin letters. Mixed or empty text counts as zh-TW.
 */
export const detectLanguage = (...parts: (string | null | undefined)[]): Locale => {
  const text = parts.filter(Boolean).join(' ')
  const cjk = (text.match(/[㐀-鿿豈-﫿]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return latin > cjk * 4 ? 'en' : 'zh-TW'
}
