import { Prisma } from '@prisma/client'

/** Time zone used for calendar grouping (month filters, monthly stats). */
export const CALENDAR_TZ = 'Asia/Taipei'

/**
 * Converts a `timestamp without time zone` column (stored as UTC by Prisma) to local
 * Taipei wall-clock time. The column must first be tagged as UTC; applying
 * `AT TIME ZONE 'Asia/Taipei'` directly would treat it as Taipei time and shift it the
 * wrong way.
 */
export const taipei = (column: Prisma.Sql) =>
  Prisma.sql`((${column}) AT TIME ZONE 'UTC' AT TIME ZONE ${Prisma.raw(`'${CALENDAR_TZ}'`)})`
