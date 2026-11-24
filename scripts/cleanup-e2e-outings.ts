/**
 * Removes outings created by end-to-end runs, with their observations and uploads.
 *   npx tsx scripts/cleanup-e2e-outings.ts <id> [id…]
 * Only outings whose observations are all titled "E2E …" (or that have none) are deleted.
 */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { deleteImagesFor } from '../src/modules/images/image.service'

const main = async () => {
  const ids = process.argv.slice(2).map(Number).filter(Number.isInteger)
  const removed: number[] = []
  for (const id of ids) {
    const photos = await prisma.photoPost.findMany({ where: { outingId: id }, select: { id: true, title: true } })
    if (photos.some((p) => !p.title.startsWith('E2E'))) {
      console.log(`skipped ${id}: has observations not created by E2E`)
      continue
    }
    for (const p of photos) {
      await deleteImagesFor('photoPostId', p.id)
      await prisma.photoPost.delete({ where: { id: p.id } })
    }
    await deleteImagesFor('outingId', id)
    await prisma.outing.deleteMany({ where: { id } })
    removed.push(id)
  }
  console.log(`removed ${removed.length} E2E outing(s): ${removed.join(', ')}`)
}
main().finally(() => prisma.$disconnect())
