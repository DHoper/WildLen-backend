import type { Locale } from './i18n'

/** Country names used for imported records whose location is blurred (only the country is named). */
export const COUNTRY_NAMES: Record<string, Record<Locale, string>> = {
  TW: { 'zh-TW': '台灣', en: 'Taiwan' },
  JP: { 'zh-TW': '日本', en: 'Japan' },
  KE: { 'zh-TW': '肯亞', en: 'Kenya' },
  TZ: { 'zh-TW': '坦尚尼亞', en: 'Tanzania' },
  GB: { 'zh-TW': '英國', en: 'United Kingdom' },
  ES: { 'zh-TW': '西班牙', en: 'Spain' },
  NO: { 'zh-TW': '挪威', en: 'Norway' },
  US: { 'zh-TW': '美國', en: 'United States' },
  AU: { 'zh-TW': '澳洲', en: 'Australia' },
  NZ: { 'zh-TW': '紐西蘭', en: 'New Zealand' }
}

/** The same country name in another language, or the input unchanged when it isn't a known country. */
export const translateCountry = (name: string, locale: Locale) => {
  const hit = Object.values(COUNTRY_NAMES).find((c) => c['zh-TW'] === name || c.en === name)
  return hit ? hit[locale] : name
}
