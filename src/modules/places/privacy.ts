import { Prisma, type LocationPrecision } from '@prisma/client'

/**
 * Which observations may be publicly tied to a place (redesign v4 §3.2; not to be relaxed).
 *
 * Only records with an exact location, of a wild animal, and not of a sensitive species.
 * Everything else is left out of every place statistic and list, and its own page does not
 * say which place it belongs to (otherwise a blurred location could be narrowed down to a site).
 * The same rule applies to area reports in scouting.
 */
export const placeEligibleWhere = {
  locationPrecision: 'EXACT',
  captive: false,
  OR: [{ speciesId: null }, { species: { sensitive: false } }]
} satisfies Prisma.PhotoPostWhereInput

/** The rule in SQL, for photo_posts `p` LEFT JOIN species `s`. */
export const placeEligibleSql = Prisma.sql`p.location_precision = 'EXACT' AND NOT p.captive AND (s.id IS NULL OR NOT s.sensitive)`

/** Whether a record's page may show its place. */
export const exposesPlace = (p: { locationPrecision: LocationPrecision; captive: boolean; species: { sensitive: boolean } | null }) =>
  p.locationPrecision === 'EXACT' && !p.captive && !p.species?.sensitive
