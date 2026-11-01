import { ZodError } from 'zod'
import type { AppError, ErrorCode } from '../../shared/types'

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

/** Приводит любую ошибку к стабильной структуре ответа (API-12). */
export function toAppError(error: unknown): AppError {
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message, details: error.details }
  }
  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION',
      message: error.issues[0]?.message ?? 'Invalid data',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    }
  }
  console.error(error)
  return { code: 'INTERNAL', message: 'Internal application error' }
}
