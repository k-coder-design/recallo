import { describe, expect, it } from 'vitest'
import { openTestDatabase } from '../db/testDatabase'
import { toAppError } from './errors'
import { SettingsService } from './settings'

describe('Тема оформления (D49)', () => {
  it('по умолчанию как в macOS, выбор сохраняется, неизвестное значение отклоняется', () => {
    const settings = new SettingsService(openTestDatabase())
    expect(settings.theme()).toBe('system')
    expect(settings.setTheme('dark')).toBe('dark')
    expect(settings.theme()).toBe('dark')
    let error: unknown
    try {
      settings.setTheme('blue')
    } catch (e) {
      error = e
    }
    expect(toAppError(error).code).toBe('VALIDATION')
    expect(settings.theme()).toBe('dark')
  })
})
