import { env } from '../../config/env'
import { logger } from '../../lib/logger'

/**
 * Weather during an outing, from Open-Meteo (no API key). Recent dates use the forecast API's
 * past days; older ones the historical archive. Any failure returns null: weather is optional
 * and never blocks publishing. Disabled in tests (no network).
 */
export interface OutingWeather {
  temperatureMin: number | null
  temperatureMax: number | null
  /** Mean cloud cover over the outing, %. */
  cloudCover: number | null
  /** Highest wind speed at 10 m, km/h. */
  windSpeed: number | null
  /** Total precipitation, mm. */
  precipitation: number | null
  source: 'open-meteo'
  fetchedAt: string
}

/** Recent days (the archive lags by about five days). */
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive'
const ARCHIVE_DELAY_DAYS = 6
const TIMEOUT_MS = 10_000
/** The forecast API also serves roughly the last three months. */
const FORECAST_PAST_DAYS = 90

/** YYYY-MM-DD of an instant in a time zone. */
const localDate = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const round = (n: number | null, step = 1) => (n === null ? null : Number((Math.round(n / step) * step).toFixed(1)))

type Span = { latitude: number; longitude: number; startedAt: Date; endedAt: Date; timezone: string }

export async function fetchWeather(o: Span): Promise<OutingWeather | null> {
  if (env.NODE_ENV === 'test' || process.env.WEATHER_DISABLED === '1') return null
  const ageDays = (Date.now() - o.endedAt.getTime()) / 86400_000
  if (ageDays <= ARCHIVE_DELAY_DAYS) return lookup(FORECAST, o)
  // The archive is slower and occasionally unavailable; recent-enough dates fall back to the forecast API.
  return (await lookup(ARCHIVE, o)) ?? (ageDays <= FORECAST_PAST_DAYS ? lookup(FORECAST, o) : null)
}

async function lookup(endpoint: string, o: Span): Promise<OutingWeather | null> {
  const url = new URL(endpoint)
  url.search = new URLSearchParams({
    latitude: o.latitude.toFixed(3),
    longitude: o.longitude.toFixed(3),
    start_date: localDate(o.startedAt, o.timezone),
    end_date: localDate(o.endedAt, o.timezone),
    hourly: 'temperature_2m,cloud_cover,wind_speed_10m,precipitation',
    timezone: 'UTC',
    timeformat: 'unixtime'
  }).toString()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'WildLens/1.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as {
      hourly?: { time: number[]; temperature_2m: (number | null)[]; cloud_cover: (number | null)[]; wind_speed_10m: (number | null)[]; precipitation: (number | null)[] }
    }
    const h = data.hourly
    if (!h?.time?.length) return null
    // Hours overlapping the outing (whole hours around short outings).
    const from = Math.floor(o.startedAt.getTime() / 3600_000) * 3600
    const to = Math.ceil(o.endedAt.getTime() / 3600_000) * 3600
    const idx = h.time.flatMap((t, i) => (t >= from && t <= to ? [i] : []))
    if (!idx.length) return null
    const pick = (arr: (number | null)[]) => idx.map((i) => arr[i]).filter((v): v is number => typeof v === 'number')
    const temps = pick(h.temperature_2m)
    const clouds = pick(h.cloud_cover)
    const winds = pick(h.wind_speed_10m)
    const rain = pick(h.precipitation)
    if (!temps.length && !clouds.length) return null
    return {
      temperatureMin: temps.length ? round(Math.min(...temps), 0.1) : null,
      temperatureMax: temps.length ? round(Math.max(...temps), 0.1) : null,
      cloudCover: clouds.length ? round(clouds.reduce((a, b) => a + b, 0) / clouds.length) : null,
      windSpeed: winds.length ? round(Math.max(...winds)) : null,
      precipitation: rain.length ? round(rain.reduce((a, b) => a + b, 0), 0.1) : null,
      source: 'open-meteo',
      fetchedAt: new Date().toISOString()
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, endpoint }, 'weather lookup failed')
    return null
  }
}
