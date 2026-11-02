/**
 * Normalizing an expression for duplicate search: "To embrace!" and "embrace" are one word,
 * so are "¡Hola!" and "hola". Variants split by " / " are compared separately.
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
