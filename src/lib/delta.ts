/** Helpers for Quill Delta documents stored as JSON. */
export interface DeltaOp {
  insert?: string | Record<string, unknown>
  attributes?: Record<string, unknown>
}
export interface Delta {
  ops: DeltaOp[]
}

/** Plain-text excerpt of a delta, used for list views and search. */
export const deltaToExcerpt = (delta: Delta, max = 140): string => {
  const text = delta.ops
    .map((op) => (typeof op.insert === 'string' ? op.insert : ' '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/** URLs of every embedded image in a delta. */
export const deltaImageUrls = (delta: Delta): string[] =>
  delta.ops.flatMap((op) =>
    op.insert && typeof op.insert === 'object' && typeof op.insert.image === 'string'
      ? [op.insert.image]
      : []
  )
