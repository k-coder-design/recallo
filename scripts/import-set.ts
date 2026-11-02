// Import a set from JSON (data/sets/*.json) into the Recallo database: creates the set (or uses an existing one
// with the same name) and its cards. Duplicates of existing cards are skipped.
// Run: npm run import:set -- <file.json> [--dry-run] [--user-data <folder>]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/main/db/database'
import { createServices } from '../src/main/services'
import { findMaskRanges } from '../src/shared/masking'
import type { ExampleInput, SpaceId } from '../src/shared/types'

interface SetFile {
  name: string
  description?: string
  spaceId: SpaceId
  cards: Array<{ term: string; meaning: string; emoji?: string; examples?: ExampleInput[] }>
}

const argv = process.argv.slice(2)
const file = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--user-data')
const dryRun = argv.includes('--dry-run')
const userDataIndex = argv.indexOf('--user-data')
const userData = userDataIndex >= 0 ? (argv[userDataIndex + 1] as string) : join(homedir(), 'Library/Application Support/Recallo')
if (!file) throw new Error('Pass the path to the set JSON file')

const data = JSON.parse(readFileSync(file, 'utf8')) as SetFile
const db = openDatabase(dryRun ? ':memory:' : join(userData, 'recallo.sqlite'))
const { cards, sets } = createServices(db)

const set =
  sets.list(data.spaceId).find((s) => s.name.toLowerCase() === data.name.toLowerCase()) ??
  sets.create({ spaceId: data.spaceId, name: data.name, description: data.description ?? null })

const created: string[] = []
const skipped: string[] = []
const unmasked: string[] = []
for (const card of data.cards) {
  const duplicates = cards.findDuplicates(data.spaceId, card.term)
  if (duplicates.length > 0) {
    skipped.push(`${card.term} (already exists: ${duplicates.map((d) => d.term).join(', ')})`)
    continue
  }
  for (const example of card.examples ?? []) {
    if (findMaskRanges(example.text, card.term, example.maskFragments ?? [], data.spaceId).length === 0) {
      unmasked.push(`${card.term} → ${example.text}`)
    }
  }
  cards.create({
    spaceId: data.spaceId,
    setId: set.id,
    term: card.term,
    meaning: card.meaning,
    ...(card.emoji ? { emoji: card.emoji } : {}),
    examples: card.examples ?? []
  })
  created.push(card.term)
}
db.close()

console.log(`${dryRun ? '[dry-run] ' : ''}Set "${set.name}": added ${created.length}, skipped as duplicates ${skipped.length}`)
if (skipped.length) console.log(`Duplicates: ${skipped.join('; ')}`)
console.log(`Examples where the word was not found for hiding: ${unmasked.length}${unmasked.length ? `\n  ${unmasked.join('\n  ')}` : ''}`)
