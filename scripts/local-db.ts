/**
 * Runs a local PostgreSQL for development without installing Postgres or Docker.
 * Data persists in ./.tmp/pg-dev between runs.
 *
 *   npm run db:local
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/wildlen
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433)
const DATA_DIR = path.resolve(__dirname, '../.tmp/pg-dev')

async function main() {
  const fresh = !existsSync(path.join(DATA_DIR, 'PG_VERSION'))
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
    onLog: () => undefined
  })
  if (fresh) await pg.initialise()
  await pg.start()
  if (fresh) await pg.createDatabase('wildlen')

  console.log(`🐘 Local Postgres running — postgresql://postgres:postgres@localhost:${PORT}/wildlen`)
  if (fresh) console.log('   New database: run `npm run db:deploy && npm run db:seed -- --demo`')

  const stop = async () => {
    await pg.stop()
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
