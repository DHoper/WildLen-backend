import { prisma } from '../../lib/prisma'
import { removeFromStorage } from '../images/image.service'
import { refreshQuality } from '../photos/quality'

/**
 * Permanently deletes a user. Their content cascades with them; every stored file
 * (uploads, photo / post images) is collected first so nothing is left in storage, and
 * photos they had identified are re-graded afterwards.
 */
export async function deleteAccount(id: number) {
  const [images, identified] = await Promise.all([
    prisma.image.findMany({
      where: { OR: [{ ownerId: id }, { photoPost: { authorId: id } }, { communityPost: { authorId: id } }] },
      select: { id: true, publicId: true }
    }),
    prisma.identification.findMany({
      where: { userId: id, photoPost: { authorId: { not: id } } },
      select: { photoPostId: true }
    })
  ])
  await prisma.$transaction([
    prisma.image.deleteMany({ where: { id: { in: images.map((i) => i.id) } } }),
    prisma.user.delete({ where: { id } })
  ])
  await removeFromStorage(images.map((i) => i.publicId))
  await refreshQuality(...identified.map((i) => i.photoPostId))
}
