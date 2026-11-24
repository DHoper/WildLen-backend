import type { z } from 'zod'
import { ApiError, type Issue } from './errors'
import { isMessageKey, type MessageKey } from './i18n'

type ZodIssue = z.core.$ZodIssue & { input?: unknown }

const bound = (value: unknown) => (typeof value === 'bigint' ? Number(value) : (value as number))

/** Maps a zod issue to a message key. Custom messages that are keys win. */
const toIssue = (issue: ZodIssue): Issue => {
  const path = issue.path.map(String).join('.')
  if (isMessageKey(issue.message)) {
    const params: Issue['params'] = {}
    if ('minimum' in issue) params.min = bound(issue.minimum)
    if ('maximum' in issue) params.max = bound(issue.maximum)
    return { path, key: issue.message, params }
  }
  let key: MessageKey = 'validation.invalid_value'
  const params: Issue['params'] = {}
  switch (issue.code) {
    case 'invalid_type':
      key = issue.input === undefined ? 'validation.required' : 'validation.invalid_type'
      break
    case 'too_small':
    case 'too_big': {
      const small = issue.code === 'too_small'
      const origin = issue.origin
      const kind = origin === 'string' ? 'string' : origin === 'array' || origin === 'set' ? 'array' : 'number'
      key = `validation.${kind}_${small ? 'min' : 'max'}` as MessageKey
      if (small) params.min = bound(issue.minimum)
      else params.max = bound(issue.maximum)
      // An empty required string reads better as "please fill in".
      if (small && origin === 'string' && issue.minimum === 1) key = 'validation.required'
      break
    }
    case 'invalid_format':
      key =
        issue.format === 'email'
          ? 'validation.email'
          : issue.format === 'url'
            ? 'validation.url'
            : 'validation.invalid_format'
      break
    case 'invalid_union':
      key = 'validation.invalid_format'
      break
  }
  return { path, key, params }
}

/** Parse untrusted input with a zod schema, throwing a 422 ApiError on failure. */
export const parse = <S extends z.ZodType>(schema: S, data: unknown): z.infer<S> => {
  const result = schema.safeParse(data, { reportInput: true })
  if (!result.success) {
    const issues = result.error.issues.map((i) => toIssue(i as ZodIssue))
    const first = issues[0]
    const field = first?.path.split('.').filter((s) => !/^\d+$/.test(s)).pop() ?? ''
    throw new ApiError(
      'VALIDATION_ERROR',
      first?.key ?? 'error.validation',
      first ? { field, ...first.params } : undefined,
      issues
    )
  }
  return result.data
}
