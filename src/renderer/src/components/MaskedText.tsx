import type { Segment } from '../../../shared/types'

interface Props {
  segments: Segment[]
  /** reveal: скрытые фрагменты подсвечиваются; иначе вместо них заглушка. */
  mode: 'hide' | 'reveal'
}

export function MaskedText({ segments, mode }: Props) {
  return (
    <>
      {segments.map((segment, i) => {
        if (!segment.masked) return <span key={i}>{segment.text}</span>
        if (mode === 'reveal') {
          return (
            <mark key={i} className="answer">
              {segment.text}
            </mark>
          )
        }
        return (
          <span key={i} className="blank" role="img" aria-label="missing word" />
        )
      })}
    </>
  )
}
