/** "or" for a slash inside a phrase: hold/keep → hold or keep. */
const OR: Record<string, string> = { en: 'or', es: 'o' }
/** Dictionary abbreviations of English cards: the voice would spell them out. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bsth\b/gi, 'something'],
  [/\bsb\b/gi, 'somebody']
]

/**
 * Card text → text for speech synthesis (D47). Voices read symbols aloud ("inverted question mark",
 * "slash"), so before speaking: ¿ and ¡ are removed, " / " between variants becomes a pause,
 * a slash inside a phrase becomes "or"/"o", sth/sb become something/somebody. The card text does not change.
 */
export function toSpeechText(text: string, lang: string): string {
  const language = lang.split('-')[0] ?? lang
  let result = text.replace(/[¿¡]/g, '')
  // Variants split by " / ": after ?, ! or . a space is enough, otherwise add a period for a pause.
  result = result.replace(/([.?!…])?\s+\/\s+/g, (_, end: string | undefined) => (end ? `${end} ` : '. '))
  result = result.replace(/(\p{L})\/(\p{L})/gu, `$1 ${OR[language] ?? 'or'} $2`)
  if (language === 'en') for (const [pattern, word] of ABBREVIATIONS) result = result.replace(pattern, word)
  return result.replace(/\s+/g, ' ').trim()
}
