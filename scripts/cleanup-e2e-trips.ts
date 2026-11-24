/** Removes field trips created by local E2E runs (exact test title only) and their discussion threads. */
import { PrismaClient } from '@prisma/client'

const TITLE = 'E2E 測試外拍（請忽略）'
const prisma = new PrismaClient()

async function main() {
  const trips = await prisma.trip.findMany({ where: { title: TITLE }, select: { id: true, discussionId: true } })
  for (const t of trips) {
    await prisma.trip.delete({ where: { id: t.id } })
    if (t.discussionId) await prisma.communityPost.delete({ where: { id: t.discussionId } }).catch(() => undefined)
  }
  console.log(`removed ${trips.length} E2E trip(s): ${trips.map((t) => t.id).join(', ')}`)
}

main().finally(() => prisma.$disconnect())
