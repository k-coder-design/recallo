import { describe, expect, it } from 'vitest'
import { parseCsv } from './csv'
import { parseDuoCardsExport, splitExamples } from './duocards'

describe('parseCsv', () => {
  it('разбирает кавычки, запятые, удвоенные кавычки и переносы внутри поля', () => {
    const csv = 'a,b\r\n"x, y","line 1\nline 2 ""quoted"""\n\n'
    expect(parseCsv(csv)).toEqual([
      ['a', 'b'],
      ['x, y', 'line 1\nline 2 "quoted"']
    ])
  })
})

describe('splitExamples', () => {
  it('делит подсказку на примеры и убирает нумерацию', () => {
    expect(splitExamples('1) First one.\n2) Second one.')).toEqual(['First one.', 'Second one.'])
    expect(splitExamples('Only one.')).toEqual(['Only one.'])
    expect(splitExamples('')).toEqual([])
  })

  it('оставляет диалог одним примером', () => {
    expect(splitExamples('- ¿Cómo estás?\n- Muy bien')).toEqual(['- ¿Cómo estás?\n- Muy bien'])
    expect(splitExamples('Intro line.\n- A?\n- B')).toEqual(['Intro line.', '- A?\n- B'])
  })
})

describe('parseDuoCardsExport', () => {
  it('превращает строки экспорта в карточки', () => {
    const csv = [
      'front,back,hint,publishedAt',
      '"loophole","лазейка","They found a loophole.","2026-09-12T12:03:27.042Z"',
      '"reckless","безрассудный","1) Her reckless spending.\n2) He drove in a reckless manner.","2025-07-07T11:11:25.507Z"',
      '"in the best light","в лучшем свете","","2025-06-29T10:03:57.119Z"',
      '"","пусто","",""'
    ].join('\n')

    const records = parseDuoCardsExport(csv, 'en')
    expect(records).toHaveLength(3)
    expect(records[0]).toEqual({
      input: { spaceId: 'en', term: 'loophole', meaning: 'лазейка', examples: [{ text: 'They found a loophole.' }] },
      publishedAt: '2026-09-12T12:03:27.042Z'
    })
    expect(records[1]?.input.examples).toEqual([
      { text: 'Her reckless spending.' },
      { text: 'He drove in a reckless manner.' }
    ])
    expect(records[2]?.input.examples).toEqual([])
  })
})
