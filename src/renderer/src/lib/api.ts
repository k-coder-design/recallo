import type { ApiContract, ApiMethod } from '../../../shared/api'
import type { AppError } from '../../../shared/types'

export class ApiError extends Error {
  constructor(readonly error: AppError) {
    super(error.message)
    this.name = 'ApiError'
  }

  get code(): AppError['code'] {
    return this.error.code
  }
}

/** Вызов main-процесса; ошибка домена превращается в исключение ApiError. */
export async function call<M extends ApiMethod>(
  method: M,
  ...args: Parameters<ApiContract[M]>
): Promise<ReturnType<ApiContract[M]>> {
  const result = await window.recallo.invoke(method, ...args)
  if (!result.ok) throw new ApiError(result.error)
  return result.data
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}
