/** Repeatable data upgrades after deploying: `npm run db:backfill`. */
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { backfillPhotoAreas, backfillSourceAuthors, backfillTags } from '../src/modules/places/backfill'

const main = async () => {
  console.log(`✔ photo areas: ${await backfillPhotoAreas()} updated`)
  console.log(`✔ tags mapped to the current catalogue: ${await backfillTags()} rows updated`)
  console.log(`✔ imported observer names decoded: ${await backfillSourceAuthors()} updated`)
}
main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
