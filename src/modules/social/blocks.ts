import { prisma } from '../../lib/prisma'
import { ApiError } from '../../lib/errors'

/**
 * Blocking is enforced in both directions: neither user sees the other's content or
 * comments, and neither can comment on / like / follow / identify the other's content.
 */

/** Ids of users hidden from `viewerId` (blocked by them, or blocking them). */
export const hiddenUserIds = async (viewerId?: number): Promise<number[]> => {
  if (!viewerId) return []
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true }
  })
  return [...new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)))]
}

/** Prisma filter excluding hidden authors (no-op for anonymous viewers). */
export const visibleAuthor = async (viewerId?: number) => {
  const hidden = await hiddenUserIds(viewerId)
  return hidden.length ? { authorId: { notIn: hidden } } : {}
}

export const isBlockedBetween = async (a: number, b: number) => {
  if (a === b) return false
  const row = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a }
      ]
    },
    select: { blockerId: true }
  })
  return !!row
}

/** 403 when either user has blocked the other. */
export const assertNotBlocked = async (actorId: number, otherId: number | null | undefined) => {
  if (otherId && (await isBlockedBetween(actorId, otherId))) throw ApiError.forbidden('block.blocked')
}

/** 404 (as if it didn't exist) when content's author is hidden from the viewer. */
export const assertVisible = async (viewerId: number | undefined, authorId: number | null, resource: Parameters<typeof ApiError.notFound>[0]) => {
  if (viewerId && authorId && (await isBlockedBetween(viewerId, authorId))) throw ApiError.notFound(resource)
}
