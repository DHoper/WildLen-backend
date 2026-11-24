import type { LocationPrecision } from '@prisma/client'
import type { AuthUser } from '../../middleware/auth'

/**
 * Location privacy for photo posts.
 *
 * - EXACT  → coordinates as stored
 * - APPROX → snapped to the centre of a 0.1° grid cell (~11 km), e.g. 22.34 → 22.35
 * - HIDDEN → no coordinates at all
 *
 * The author and admins always see the exact location. Photos of sensitive species are
 * never EXACT (enforced on write, and defensively here too).
 */
export const effectivePrecision = (
  precision: LocationPrecision,
  species: { sensitive: boolean } | null | undefined
): LocationPrecision => (precision === 'EXACT' && species?.sensitive ? 'APPROX' : precision)

const snap = (x: number) => Math.round((Math.floor(x * 10) / 10 + 0.05) * 100) / 100

interface Locatable {
  latitude: number
  longitude: number
  locationPrecision: LocationPrecision
  species?: { sensitive: boolean } | null
}

/** Returns the row with latitude / longitude / locationPrecision adjusted for `viewer`. */
export const presentLocation = <T extends Locatable>(
  row: T,
  authorId: number,
  viewer: AuthUser | undefined
): Omit<T, 'latitude' | 'longitude'> & { latitude: number | null; longitude: number | null } => {
  const locationPrecision = effectivePrecision(row.locationPrecision, row.species)
  const privileged = !!viewer && (viewer.role === 'ADMIN' || viewer.id === authorId)
  if (privileged || locationPrecision === 'EXACT') return { ...row, locationPrecision }
  if (locationPrecision === 'HIDDEN') return { ...row, locationPrecision, latitude: null, longitude: null }
  return { ...row, locationPrecision, latitude: snap(row.latitude), longitude: snap(row.longitude) }
}
