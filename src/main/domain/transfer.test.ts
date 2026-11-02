import { describe, expect, it } from 'vitest'
import { detectFormat, parseImport } from '../import/formats'
import { SettingsService } from './settings'
import { toAppError } from './errors'
import { setup } from './test-helpers'

const codeOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return toAppError(error).code
  }
  return undefined
}

// Sample data is in Russian on purpose: the user's meanings are Russian, and files must carry them through intact.
describe('import formats', () => {
  it('detects the format from the content', () => {
    expect(detectFormat('{"cards": []}')).toBe('recallo-json')
    expect(detectFormat('front,back,hint,publishedAt\n"a","b","",""')).toBe('duocards')
    expect(detectFormat('﻿term,meaning,set\nrun,to run,')).toBe('recallo-csv')
    expect(detectFormat('dramatic\tдраматичный\nthrilling\tзахватывающий')).toBe('quizlet')
  })

  it('reads Quizlet "term⇥definition" and swaps the columns on request', () => {
    const text = 'драматичный\tdramatic\nзахватывающий\tthrilling'
    expect(parseImport(text, 'quizlet').map((c) => [c.term, c.meaning])).toEqual([
      ['драматичный', 'dramatic'],
      ['захватывающий', 'thrilling']
    ])
    expect(parseImport(text, 'quizlet', true)[0]).toMatchObject({ term: 'dramatic', meaning: 'драматичный' })
    expect(parseImport('dull,"скучный, нудный"', 'quizlet')[0]).toMatchObject({ term: 'dull', meaning: 'скучный, нудный' })
  })
})

describe('import', () => {
  it('previews new words, duplicates (in the database and in the file) and errors without changing anything', () => {
    const t = setup()
    t.addCard({ term: 'dull', meaning: 'скучный' })
    const preview = t.transfer.preview('gripping\tзахватывающий\nDull\tскучный\ngripping\tещё раз\nhilarious\t', {
      spaceId: 'en',
      destination: { kind: 'none' }
    })
    expect(preview.format).toBe('quizlet')
    expect(preview.rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'duplicate', 'error'])
    expect(preview.rows[2]?.message).toBe('Repeated in this file')
    expect(preview.summary).toEqual({ new: 1, duplicates: 2, errors: 1 })
    expect(t.cards.list('en')).toHaveLength(1)
  })

  it('creates new ones, skips duplicates and reports errors', () => {
    const t = setup()
    t.addCard({ term: 'dull', meaning: 'скучный' })
    const result = t.transfer.import('gripping\tзахватывающий\ndull\tскучный\nhilarious\t', {
      spaceId: 'en',
      destination: { kind: 'new-set', name: 'Movie' }
    })
    expect(result.summary).toEqual({ created: 1, skipped: 1, errors: 1 })
    const movie = t.sets.list('en').find((s) => s.name === 'Movie')
    expect(movie?.cardCount).toBe(1)
    expect(t.cards.list('en', { search: 'gripping' })[0]?.transcription).toBe('ˈɡrɪpɪŋ')
  })

  it('puts cards into an existing set, into "no set" or into the sets from the file; duplicates on request', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    t.transfer.import('a\tA', { spaceId: 'en', destination: { kind: 'set', setId: set.id } })
    t.transfer.import('b\tB', { spaceId: 'en', destination: { kind: 'none' } })
    t.transfer.import('{"cards":[{"term":"c","meaning":"C","set":"Travel"},{"term":"d","meaning":"D","set":"movie"}]}', {
      spaceId: 'en',
      destination: { kind: 'file-sets' }
    })
    t.transfer.import('a\tA again', { spaceId: 'en', destination: { kind: 'none' }, includeDuplicates: true })

    const byTerm = Object.fromEntries(t.cards.list('en').map((c) => [`${c.term}:${c.meaning}`, c.setId]))
    const travel = t.sets.list('en').find((s) => s.name === 'Travel')
    expect(byTerm).toEqual({ 'a:A': set.id, 'b:B': null, 'c:C': travel?.id, 'd:D': set.id, 'a:A again': null })
  })

  it('reads a DuoCards export with examples', () => {
    const t = setup()
    const csv = 'front,back,hint,publishedAt\n"loophole","лазейка","They found a loophole.","2026-09-12T12:03:27.042Z"\n'
    expect(t.transfer.import(csv, { spaceId: 'en', destination: { kind: 'none' } }).summary.created).toBe(1)
    expect(t.cards.list('en')[0]?.examples[0]?.text).toBe('They found a loophole.')
  })

  it('refuses with a clear message if the file has no cards or is a full backup', () => {
    const t = setup()
    expect(codeOf(() => t.transfer.preview('   ', { spaceId: 'en', destination: { kind: 'none' } }))).toBe('VALIDATION')
    expect(() => t.transfer.preview(t.transfer.backup().content, { spaceId: 'en', destination: { kind: 'none' } })).toThrow('full backup')
  })
})

describe('dictionary export', () => {
  function sample() {
    const t = setup()
    const movie = t.sets.create({ spaceId: 'en', name: 'Movie' })
    t.addCard({
      term: 'gripping',
      meaning: 'захватывающий, увлекательный',
      setId: movie.id,
      emoji: '🍿',
      examples: [
        { text: 'It\'s a gripping thriller, "really".', translation: 'Захватывающий триллер.' },
        { text: 'She went home.', maskFragments: ['went'] }
      ]
    })
    t.addCard({ term: 'loophole', meaning: 'лазейка' })
    return t
  }

  it('the CSV reads back through import without loss (sets, emoji, examples, quotes, commas)', () => {
    const source = sample()
    const csv = source.transfer.exportDictionary('en', undefined, 'csv')
    expect(csv.filename).toMatch(/^Recallo English all \d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv.content.startsWith('﻿term,meaning,set,transcription,transcription_alt,emoji,example_1')).toBe(true)

    const target = setup()
    expect(target.transfer.import(csv.content, { spaceId: 'en', destination: { kind: 'file-sets' } }).summary.created).toBe(2)
    const gripping = target.cards.list('en', { search: 'gripping' })[0]
    expect(gripping).toMatchObject({ meaning: 'захватывающий, увлекательный', emoji: '🍿' })
    expect(gripping?.examples).toEqual([
      { text: 'It\'s a gripping thriller, "really".', translation: 'Захватывающий триллер.', maskFragments: [] },
      { text: 'She went home.', translation: null, maskFragments: ['went'] }
    ])
    expect(target.sets.list('en').map((s) => s.name)).toEqual(['Movie'])
  })

  it('a single-set JSON contains only its cards and reads back', () => {
    const source = sample()
    const movie = source.sets.list('en')[0]!
    const json = source.transfer.exportDictionary('en', { kind: 'set', setId: movie.id }, 'json')
    expect(json.filename).toMatch(/^Recallo English Movie /)
    const parsed = JSON.parse(json.content)
    expect(parsed).toMatchObject({ format: 'recallo-dictionary', language: 'en', sets: [{ name: 'Movie' }] })
    expect(parsed.cards.map((c: { term: string }) => c.term)).toEqual(['gripping'])
    expect(parsed.cards[0]).not.toHaveProperty('progress')

    const target = setup()
    target.transfer.import(json.content, { spaceId: 'en', destination: { kind: 'file-sets' } })
    expect(target.cards.list('en')[0]?.examples).toHaveLength(2)
  })
})

describe('full backup', () => {
  it('saves and restores sets, cards, progress and history, but not the token', () => {
    const t = setup()
    const set = t.sets.create({ spaceId: 'en', name: 'Movie' })
    const card = t.addCard({ setId: set.id })
    t.introduceAll()
    t.answer('forgot')
    const progress = t.cards.get(card.id).progress
    const token = new SettingsService(t.db).agentApi().token

    const backup = t.transfer.backup()
    expect(backup.content).not.toContain(token)
    expect(t.transfer.inspectBackup(backup.content)).toMatchObject({ cards: 1, sets: 1, reviews: 2 })

    t.addCard({ term: 'extra' })
    t.cards.delete(card.id)
    expect(t.transfer.restore(backup.content)).toMatchObject({ cards: 1, sets: 1, reviews: 2 })
    expect(t.cards.list('en').map((c) => c.term)).toEqual(['run'])
    expect(t.cards.get(card.id)).toMatchObject({ setId: set.id, progress })
    expect(t.stats.overview('en').today.forgot).toBe(1)
  })

  it('does not restore a foreign file or a backup from a newer version', () => {
    const t = setup()
    expect(() => t.transfer.restore('{"cards": []}')).toThrow('not a Recallo backup')
    const newer = JSON.stringify({ format: 'recallo-backup', schemaVersion: 999, data: {} })
    expect(() => t.transfer.restore(newer)).toThrow('newer version')
  })
})
