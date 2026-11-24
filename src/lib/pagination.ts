import { z } from 'zod'

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12)
})

export type Pagination = z.infer<typeof paginationQuery>

export const toSkipTake = ({ page, pageSize }: Pagination) => ({
  skip: (page - 1) * pageSize,
  take: pageSize
})

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const paginated = <T>(items: T[], total: number, p: Pagination): Paginated<T> => ({
  items,
  total,
  page: p.page,
  pageSize: p.pageSize,
  totalPages: Math.max(1, Math.ceil(total / p.pageSize))
})
