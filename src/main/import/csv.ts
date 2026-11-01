/**
 * Разбор CSV по RFC 4180: поля в кавычках, удвоенные кавычки внутри, переносы строк внутри полей.
 * Возвращает строки как массивы полей; пустые строки пропускаются.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    if (row.some((f) => f !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') endField()
    else if (char === '\n') endRow()
    else if (char !== '\r') field += char
  }
  if (field !== '' || row.length > 0) endRow()
  return rows
}

/** CSV с заголовком → объекты по именам колонок. */
export function parseCsvRecords(input: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(input)
  if (!header) return []
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name.trim(), row[i] ?? ''])))
}
