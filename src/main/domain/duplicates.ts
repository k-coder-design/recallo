/**
 * Нормализация выражения для поиска дублей: «To embrace!» и «embrace» — одно слово,
 * «¡Hola!» и «hola» — тоже. Варианты через « / » сравниваются по отдельности.
 */
export function termKeys(term: string): string[] {
  return term
    .split(/\s+\/\s+/)
    .map((variant) =>
      variant
        .normalize('NFC')
        .toLowerCase()
        .replace(/[’]/g, "'")
        .replace(/^[\s¡¿!?.,;:"«»“”]+|[\s¡¿!?.,;:"«»“”]+$/gu, '')
        .replace(/^(to|a|an|the)\s+/, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(Boolean)
}

export function isSameTerm(a: string, b: string): boolean {
  const keys = new Set(termKeys(a))
  return termKeys(b).some((key) => keys.has(key))
}
