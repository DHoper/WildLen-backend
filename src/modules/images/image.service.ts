import { prisma } from '../../lib/prisma'
import { storage } from '../../lib/storage'
import { ApiError } from '../../lib/errors'
import type { AuthUser } from '../../middleware/auth'

/** outingId holds a draft outing's uploads until it is published. */
export type ImageTargetKey = 'photoPostId' | 'communityPostId' | 'articleId' | 'outingId'
const TARGET_KEYS: ImageTargetKey[] = ['photoPostId', 'communityPostId', 'articleId', 'outingId']

type ImageRow = { id: number; ownerId: number | null } & Record<ImageTargetKey, number | null>

const unattached = () => ({ photoPostId: null, communityPostId: null, articleId: null, outingId: null })

const assertUsable = (user: AuthUser, image: ImageRow, key: ImageTargetKey, targetId?: number) => {
  for (const k of TARGET_KEYS) {
    const attachedTo = image[k]
    if (attachedTo === null) continue
    if (k !== key || attachedTo !== targetId) {
      throw ApiError.badRequest('image.in_use', { id: image.id })
    }
  }
  const alreadyHere = targetId !== undefined && image[key] === targetId
  if (!alreadyHere && user.role !== 'ADMIN' && image.ownerId !== user.id) {
    throw ApiError.forbidden('image.not_allowed', { id: image.id })
  }
}

/**
 * Validates that the given image ids can be attached to a target before anything is
 * written, so invalid requests fail without side-effects. Returns de-duplicated ids.
 */
export async function validateImageIds(
  user: AuthUser,
  ids: number[],
  key: ImageTargetKey,
  targetId?: number
) {
  const unique = [...new Set(ids)]
  const images = await prisma.image.findMany({ where: { id: { in: unique } } })
  if (images.length !== unique.length) throw ApiError.badRequest('image.missing')
  for (const img of images) assertUsable(user, img, key, targetId)
  return unique
}

/**
 * Makes `ids` (in order) the exact image set of a target. Images previously attached
 * but no longer listed are deleted from the database and from storage.
 */
export async function syncImages(key: ImageTargetKey, targetId: number, ids: number[]) {
  const removed = await prisma.image.findMany({
    where: { [key]: targetId, id: { notIn: ids } },
    select: { id: true, publicId: true }
  })

  await prisma.$transaction([
    ...ids.map((id, position) =>
      prisma.image.update({ where: { id }, data: { [key]: targetId, position } })
    ),
    prisma.image.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } })
  ])

  await removeFromStorage(removed.map((r) => r.publicId))
}

/**
 * For rich-text content: resolves the uploaded images actually embedded in the
 * document (by URL) and syncs them. External URLs are ignored.
 */
export async function syncImagesByUrl(
  user: AuthUser,
  key: ImageTargetKey,
  targetId: number,
  urls: string[]
) {
  const ownership = user.role === 'ADMIN' ? {} : { ownerId: user.id }
  const candidates = urls.length
    ? await prisma.image.findMany({
        where: {
          url: { in: urls },
          OR: [{ [key]: targetId }, { ...unattached(), ...ownership }]
        },
        select: { id: true, url: true }
      })
    : []
  const order = new Map(urls.map((u, i) => [u, i]))
  const ids = candidates
    .sort((a, b) => (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0))
    .map((c) => c.id)
  await syncImages(key, targetId, ids)
}

/** Storage ids of every image attached to a target (collect before deleting it). */
export async function imagePublicIdsFor(key: ImageTargetKey, targetId: number) {
  const rows = await prisma.image.findMany({
    where: { [key]: targetId },
    select: { publicId: true }
  })
  return rows.map((r) => r.publicId)
}

export async function deleteImagesFor(key: ImageTargetKey, targetId: number) {
  const ids = await imagePublicIdsFor(key, targetId)
  await prisma.image.deleteMany({ where: { [key]: targetId } })
  await removeFromStorage(ids)
}

export async function removeFromStorage(publicIds: string[]) {
  await Promise.all(publicIds.map((id) => storage.remove(id)))
}

/** Deletes uploads that were never attached to any content (abandoned drafts). */
export async function purgeOrphanImages(olderThanMs = 24 * 60 * 60 * 1000) {
  const stale = await prisma.image.findMany({
    where: { ...unattached(), createdAt: { lt: new Date(Date.now() - olderThanMs) } },
    select: { id: true, publicId: true }
  })
  if (!stale.length) return 0
  await prisma.image.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
  await removeFromStorage(stale.map((s) => s.publicId))
  return stale.length
}
