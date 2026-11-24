import { Prisma, type LocationPrecision, type PhotoQuality } from '@prisma/client'
import { prisma } from '../../lib/prisma'

/**
 * Observation data quality.
 *
 * - CASUAL     no takenAt, the location is HIDDEN, or the animal is captive (not a wild record)
 * - CONFIRMED  has a species, and votes agreeing with it are ≥ 2 and ≥ 2/3 of all votes
 * - NEEDS_ID   everything else
 *
 * Imported records (sourceName set) arrive research grade from their source and keep it: their
 * quality is CONFIRMED (shown as the source's grade), and no WildLens votes are invented for them.
 *
 * Votes: the author's speciesId counts as one vote, plus one per identification. If the
 * author also submitted an identification, it replaces the author's implicit vote.
 */
export interface QualityInput {
  authorId: number
  speciesId: number | null
  takenAt: Date | null
  locationPrecision: LocationPrecision
  captive?: boolean
  sourceName?: string | null
  identifications: { userId: number; speciesId: number }[]
}

export const computeQuality = (p: QualityInput): PhotoQuality => {
  if (!p.takenAt || p.locationPrecision === 'HIDDEN' || p.captive) return 'CASUAL'
  if (!p.speciesId) return 'NEEDS_ID'
  if (p.sourceName) return 'CONFIRMED'

  const votes = p.identifications.map((i) => i.speciesId)
  const authorIdentified = p.identifications.some((i) => i.userId === p.authorId)
  if (!authorIdentified) votes.push(p.speciesId)

  const agree = votes.filter((s) => s === p.speciesId).length
  return agree >= 2 && agree * 3 >= votes.length * 2 ? 'CONFIRMED' : 'NEEDS_ID'
}

/** Recomputes and stores the quality of the given photos. */
export const refreshQuality = async (...photoIds: number[]) => {
  if (!photoIds.length) return
  const photos = await prisma.photoPost.findMany({
    where: { id: { in: [...new Set(photoIds)] } },
    select: {
      id: true,
      authorId: true,
      speciesId: true,
      takenAt: true,
      locationPrecision: true,
      captive: true,
      sourceName: true,
      quality: true,
      identifications: { select: { userId: true, speciesId: true } }
    }
  })
  for (const photo of photos) {
    const quality = computeQuality(photo)
    if (quality !== photo.quality) await prisma.photoPost.update({ where: { id: photo.id }, data: { quality } })
  }
}

/**
 * "Community confirmed": research grade reached on WildLens itself. Imported records (research
 * grade on their source) still count for distribution, place statistics and shooting guides, but
 * not for features defined by community confirmation: season firsts, data gaps, identification
 * expertise and exports (redesign v4 §4.1, §4.4; review decision B1).
 */
export const communityConfirmedWhere = { quality: 'CONFIRMED', sourceName: null } satisfies Prisma.PhotoPostWhereInput

/** The same rule in SQL, for photo_posts `p`. */
export const communityConfirmedSql = Prisma.sql`p.quality = 'CONFIRMED' AND p.source_name IS NULL`
