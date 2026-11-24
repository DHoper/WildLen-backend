import { prisma } from '../../lib/prisma'
import { migrateTags } from '../../lib/tags'
import { areaOf } from './areas'
import { decodeEntities } from '../../lib/entities'

/**
 * Recomputes photo_posts.area from the coordinates (time-zone based). Idempotent; run once
 * after the 20261111100000_photo_area migration, and again if the area rules change.
 */
export const backfillPhotoAreas = async () => {
  let updated = 0
  for (const p of await prisma.photoPost.findMany({ select: { id: true, latitude: true, longitude: true, area: true } })) {
    const area = areaOf(p.latitude, p.longitude)
    if (area !== p.area) {
      await prisma.photoPost.update({ where: { id: p.id }, data: { area } })
      updated++
    }
  }
  return updated
}

/** Maps interest and content tags from the earlier catalogue to the current one. Idempotent. */
export const backfillTags = async () => {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  let updated = 0
  for (const u of await prisma.user.findMany({ select: { id: true, interests: true } })) {
    const next = migrateTags(u.interests)
    if (!same(next, u.interests)) (await prisma.user.update({ where: { id: u.id }, data: { interests: next } }), updated++)
  }
  for (const a of await prisma.article.findMany({ select: { id: true, tags: true } })) {
    const next = migrateTags(a.tags)
    if (!same(next, a.tags)) (await prisma.article.update({ where: { id: a.id }, data: { tags: next } }), updated++)
  }
  for (const p of await prisma.communityPost.findMany({ select: { id: true, tags: true } })) {
    const next = migrateTags(p.tags)
    if (!same(next, p.tags)) (await prisma.communityPost.update({ where: { id: p.id }, data: { tags: next } }), updated++)
  }
  return updated
}

/** Decodes HTML entities left in imported observers' names by earlier imports. */
export const backfillSourceAuthors = async () => {
  let updated = 0
  for (const p of await prisma.photoPost.findMany({ where: { sourceAuthor: { contains: '&' } }, select: { id: true, sourceAuthor: true } })) {
    const name = decodeEntities(p.sourceAuthor!)
    if (name !== p.sourceAuthor) {
      await prisma.photoPost.update({ where: { id: p.id }, data: { sourceAuthor: name } })
      updated++
    }
  }
  return updated
}
