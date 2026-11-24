/**
 * Spins up a throw-away PostgreSQL (embedded-postgres) for the integration tests
 * and applies all migrations. No local Postgres / Docker needed.
 */
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const PORT = 54329
const DATA_DIR = path.resolve(__dirname, '../.tmp/pg-test')
export const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:${PORT}/wildlen_test`

export default async function setup() {
  rmSync(DATA_DIR, { recursive: true, force: true })
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    onLog: () => undefined
  })
  await pg.initialise()
  await pg.start()
  await pg.createDatabase('wildlen_test')

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe'
  })

  return async () => {
    await pg.stop()
    rmSync(DATA_DIR, { recursive: true, force: true })
  }
}
