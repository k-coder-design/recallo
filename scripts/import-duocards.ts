// Импорт CSV-экспорта DuoCards в базу Recallo (для тестовых данных до полноценного импорта в MVP-4).
// Запуск: npm run import:duocards -- <файл.csv> [--space en|es] [--dry-run] [--user-data <папка>]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/main/db/database'
import { parseDuoCardsExport } from '../src/main/import/duocards'
import { createServices } from '../src/main/services'
import { findMaskRanges } from '../src/shared/masking'
import type { SpaceId } from '../src/shared/types'

function readArgs(argv: string[]) {
  const args = { file: '', space: 'en' as SpaceId, dryRun: false, userData: join(homedir(), 'Library/Application Support/Recallo') }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') args.dryRun = true
    else if (arg === '--space') args.space = argv[++i] as SpaceId
    else if (arg === '--user-data') args.userData = argv[++i] ?? args.userData
    else if (arg) args.file = arg
  }
  if (!args.file) throw new Error('Укажите путь к CSV-файлу')
  if (args.space !== 'en' && args.space !== 'es') throw new Error('--space: en или es')
  return args
}

const args = readArgs(process.argv.slice(2))
const records = parseDuoCardsExport(readFileSync(args.file, 'utf8'), args.space)
  // Старые карточки первыми — как они появлялись в DuoCards.
  .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))

const unmasked: string[] = []
for (const { input } of records) {
  for (const example of input.examples ?? []) {
    if (findMaskRanges(example.text, input.term, [], args.space).length === 0) {
      unmasked.push(`  ${input.term}  →  ${example.text}`)
    }
  }
}

const dbFile = join(args.userData, 'recallo.sqlite')
const db = openDatabase(args.dryRun ? ':memory:' : dbFile)
let clock = new Date()
const { cards } = createServices(db, { now: () => clock })

const existing = new Set(cards.list(args.space).map((c) => c.term.toLowerCase()))
let created = 0
let skipped = 0
for (const record of records) {
  if (existing.has(record.input.term.toLowerCase())) {
    skipped++
    continue
  }
  clock = record.publishedAt ? new Date(record.publishedAt) : new Date()
  cards.create(record.input)
  existing.add(record.input.term.toLowerCase())
  created++
}
db.close()

console.log(`${args.dryRun ? '[dry-run] ' : ''}База: ${args.dryRun ? '(в памяти)' : dbFile}`)
console.log(`В файле: ${records.length}, добавлено: ${created}, пропущено как дубли: ${skipped}`)
console.log(`Примеров, где выражение не нашлось автоматически: ${unmasked.length}`)
if (unmasked.length) console.log(unmasked.join('\n'))
