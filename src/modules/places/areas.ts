import { Prisma } from '@prisma/client'
import tzlookup from '@photostructure/tz-lookup'

/**
 * Regional clusters used for seasonal statistics. Seasons differ by hemisphere and climate,
 * so "in season this month" and seasonal charts are computed per area, never site-wide.
 *
 * The area is derived from the IANA time zone at the coordinates (political boundaries, so
 * Seoul or Fujian don't fall into "japan" or "taiwan" the way a lat/lng box would), and
 * stored on each observation when it is written. Places store theirs explicitly.
 */
export const AREA_KEYS = ['taiwan', 'japan', 'east-africa', 'europe', 'north-america', 'oceania'] as const
export type AreaKey = (typeof AREA_KEYS)[number] | 'other'

const EAST_AFRICA = new Set([
  'Africa/Nairobi',
  'Africa/Dar_es_Salaam',
  'Africa/Kampala',
  'Africa/Kigali',
  'Africa/Bujumbura',
  'Africa/Addis_Ababa',
  'Africa/Mogadishu',
  'Africa/Djibouti',
  'Africa/Asmara',
  'Africa/Juba'
])
const EUROPE_ATLANTIC = new Set(['Atlantic/Reykjavik', 'Atlantic/Faroe', 'Atlantic/Madeira', 'Atlantic/Canary', 'Atlantic/Azores', 'Arctic/Longyearbyen'])
/** America/* zones that are not North or Central America. */
const NOT_NORTH_AMERICA = new Set([
  // Caribbean islands
  'America/Puerto_Rico', 'America/Santo_Domingo', 'America/Havana', 'America/Jamaica', 'America/Port-au-Prince', 'America/Nassau',
  'America/Barbados', 'America/Martinique', 'America/Guadeloupe', 'America/St_Thomas', 'America/Tortola', 'America/Anguilla',
  'America/Antigua', 'America/Dominica', 'America/Grenada', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Vincent',
  'America/Curacao', 'America/Aruba', 'America/Kralendijk', 'America/Lower_Princes', 'America/Marigot', 'America/St_Barthelemy',
  'America/Montserrat', 'America/Cayman', 'America/Grand_Turk', 'America/Port_of_Spain',
  // South America north of 7°
  'America/Bogota', 'America/Caracas', 'America/Guyana', 'America/Paramaribo', 'America/Cayenne'
])
const OCEANIA = new Set(['Pacific/Auckland', 'Pacific/Chatham', 'Antarctica/Macquarie'])

export const timezoneAt = (lat: number, lng: number) => {
  try {
    return tzlookup(lat, lng)
  } catch {
    return 'UTC'
  }
}

export const areaOfZone = (tz: string, lat: number): AreaKey => {
  if (tz === 'Asia/Taipei') return 'taiwan'
  if (tz === 'Asia/Tokyo') return 'japan'
  if (EAST_AFRICA.has(tz)) return 'east-africa'
  if (tz.startsWith('Europe/') || EUROPE_ATLANTIC.has(tz)) return 'europe'
  if (tz.startsWith('America/') && lat >= 7 && !NOT_NORTH_AMERICA.has(tz)) return 'north-america'
  if (tz.startsWith('Australia/') || OCEANIA.has(tz)) return 'oceania'
  return 'other'
}

export const areaOf = (lat: number, lng: number): AreaKey => areaOfZone(timezoneAt(lat, lng), lat)

/** The stored area of photo_posts `p`. */
export const AREA_SQL = Prisma.sql`p.area`

/**
 * Local calendar month of a record. Uses solar time (UTC + longitude / 15 h), which is within
 * a day of civil time everywhere and needs no time-zone lookup per row.
 */
export const LOCAL_MONTH_SQL = Prisma.sql`extract(month from p.taken_at + (p.longitude / 15.0) * interval '1 hour')::int`
