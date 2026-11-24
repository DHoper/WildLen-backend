import type { Prisma } from '@prisma/client'

/** Public author fields embedded in every content payload. */
export const authorSelect = {
  id: true,
  username: true,
  avatarIndex: true,
  avatarUrl: true,
  role: true,
  system: true
} satisfies Prisma.UserSelect

/** Private fields only returned to the account owner / admins. */
export const privateUserSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  avatarIndex: true,
  avatarUrl: true,
  homeArea: true,
  specialties: true,
  bio: true,
  interests: true,
  emailVerified: true,
  locale: true,
  createdAt: true
} satisfies Prisma.UserSelect

export const imageSelect = {
  id: true,
  url: true,
  width: true,
  height: true
} satisfies Prisma.ImageSelect

export const engagementCount = {
  _count: { select: { likes: true, comments: true } }
} as const

/** Flattens Prisma's `_count` into `likeCount` / `commentCount`. */
export const withCounts = <T extends { _count: { likes: number; comments: number } }>(row: T) => {
  const { _count, ...rest } = row
  return { ...rest, likeCount: _count.likes, commentCount: _count.comments }
}

/** Species summary embedded in photo payloads. */
export const speciesSummarySelect = {
  id: true,
  commonName: true,
  scientificName: true,
  englishName: true,
  group: true,
  status: true,
  sensitive: true
} satisfies Prisma.SpeciesSelect
