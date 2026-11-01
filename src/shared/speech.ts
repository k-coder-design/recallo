/** «или» для слэша внутри фразы: hold/keep → hold or keep. */
const OR: Record<string, string> = { en: 'or', es: 'o' }
/** Словарные сокращения английских карточек: голос читает их по буквам. */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bsth\b/gi, 'something'],
  [/\bsb\b/gi, 'somebody']
]

/**
 * Текст карточки → текст для синтеза речи (D47). Голоса читают символы вслух («inverted question mark»,
 * «slash»), поэтому перед озвучкой: ¿ и ¡ убираются, « / » между вариантами становится паузой,
 * слэш внутри фразы — «or»/«o», sth/sb — something/somebody. На карточке текст не меняется.
 */
export function toSpeechText(text: string, lang: string): string {
  const language = lang.split('-')[0] ?? lang
  let result = text.replace(/[¿¡]/g, '')
  // Варианты через « / »: после ?, ! или . достаточно пробела, иначе ставим точку для паузы.
  result = result.replace(/([.?!…])?\s+\/\s+/g, (_, end: string | undefined) => (end ? `${end} ` : '. '))
  result = result.replace(/(\p{L})\/(\p{L})/gu, `$1 ${OR[language] ?? 'or'} $2`)
  if (language === 'en') for (const [pattern, word] of ABBREVIATIONS) result = result.replace(pattern, word)
  return result.replace(/\s+/g, ' ').trim()
}
