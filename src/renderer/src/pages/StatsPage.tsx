import { useCallback, useEffect, useState } from 'react'
import type { Card, DayActivity, SpaceId, StatsOverview, WordStage } from '../../../shared/types'
import { call, errorMessage } from '../lib/api'
import { SwellCard } from '../components/Swell'
import { plural } from '../lib/format'
import { CardEditor } from './CardEditor'

interface Props {
  spaceId: SpaceId
  onChanged: () => void
}

const STAGES: Array<{ id: WordStage; label: string; hint: string }> = [
  { id: 'new', label: 'New', hint: 'calm water · not met yet' },
  { id: 'introduced', label: 'Introduced', hint: 'ripples · met, not recalled yet' },
  { id: 'learning', label: 'Learning', hint: 'small waves · minutes apart' },
  { id: 'familiar', label: 'Familiar', hint: 'rolling waves · under 3 weeks apart' },
  { id: 'learned', label: 'Learned', hint: 'big waves · 3+ weeks apart' }
]

const SERIES: Array<{ key: keyof Omit<DayActivity, 'date'>; label: string }> = [
  { key: 'remembered', label: 'Remembered' },
  { key: 'forgot', label: 'Forgot' },
  { key: 'introduced', label: 'New words' }
]

export function StatsPage({ spaceId, onChanged }: Props) {
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Card | null>(null)

  const load = useCallback(() => {
    call('stats.overview', spaceId)
      .then((data) => {
        setStats(data)
        setError(null)
      })
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [spaceId])

  useEffect(() => {
    setStats(null)
    load()
  }, [load])

  const edit = async (cardId: string) => {
    try {
      setEditing(await call('cards.get', cardId))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (error) return <section className="page"><p className="error">{error}</p></section>
  if (!stats) return <section className="page"><p className="muted">Loading…</p></section>

  const answeredToday = stats.today.remembered + stats.today.forgot
  return (
    <section className="page stats">
      <h1>Stats</h1>

      <SwellCard swell={stats.swell} />

      <div className="tiles">
        <Tile label="Words" value={String(stats.total)} />
        <Tile
          label="Answers today"
          value={String(answeredToday)}
          note={stats.today.introduced > 0 ? `+ ${stats.today.introduced} new ${plural(stats.today.introduced, 'word', 'words')}` : undefined}
        />
        <Tile
          label="Remembered, 30 days"
          value={stats.retention30d === null ? '—' : `${Math.round(stats.retention30d * 100)}%`}
        />
        <Tile label="Streak" value={`${stats.streakDays} ${plural(stats.streakDays, 'day', 'days')}`} />
        <Tile label="Due tomorrow" value={String(stats.dueTomorrow)} />
      </div>

      <section className="panel">
        <h2>Words by stage</h2>
        <StageBar stats={stats} />
      </section>

      <section className="panel">
        <h2>Last 14 days</h2>
        <ActivityChart days={stats.activity} />
      </section>

      <section className="panel">
        <h2>Hardest words</h2>
        {stats.hardest.length === 0 ? (
          <p className="muted">No hard words yet. Words you forget two or more times will show up here.</p>
        ) : (
          <>
            <p className="muted small">
              These keep slipping away. A clearer meaning or a better example often helps.
            </p>
            <ul className="hard-list">
              {stats.hardest.map((word) => (
                <li key={word.cardId}>
                  <div className="hard-main">
                    <span className="term">{word.term}</span>
                    <span className="muted">{word.meaning}</span>
                  </div>
                  <span className="muted small nowrap">forgot {word.forgotCount}×</span>
                  <button type="button" className="link-button" onClick={() => void edit(word.cardId)}>
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {editing && (
        <CardEditor
          spaceId={spaceId}
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
            onChanged()
          }}
        />
      )}
    </section>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {note && <span className="tile-note">{note}</span>}
    </div>
  )
}

/** Доли стадий: одна полоса «часть от целого», легенда с числами под ней. */
function StageBar({ stats }: { stats: StatsOverview }) {
  const [hovered, setHovered] = useState<WordStage | null>(null)
  if (stats.total === 0) return <p className="muted">No cards in this language yet.</p>

  return (
    <div className="stage-chart">
      <div className="stage-bar" role="img" aria-label="Words by stage">
        {STAGES.filter((s) => stats.stages[s.id] > 0).map((s) => (
          <div
            key={s.id}
            className={`stage-segment stage-${s.id} ${hovered && hovered !== s.id ? 'dimmed' : ''}`}
            style={{ flexGrow: stats.stages[s.id] }}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            title={`${s.label}: ${stats.stages[s.id]}`}
          />
        ))}
      </div>
      <ul className="stage-legend">
        {STAGES.map((s) => (
          <li
            key={s.id}
            className={hovered && hovered !== s.id ? 'dimmed' : ''}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={`swatch stage-${s.id}`} />
            <span className="stage-count">{stats.stages[s.id]}</span>
            <span className="stage-name">{s.label}</span>
            <span className="muted small">{s.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function niceMax(value: number): number {
  if (value <= 4) return 4
  const step = Math.pow(10, Math.floor(Math.log10(value)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= value) return m * step
  return 10 * step
}

const DAY_LABEL = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })
const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'short' })

function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

/** Ответы по дням: столбцы с сегментами remembered / forgot / new words, подсказка на весь столбец. */
function ActivityChart({ days }: { days: DayActivity[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const totals = days.map((d) => d.remembered + d.forgot + d.introduced)
  const max = niceMax(Math.max(...totals, 0))
  const ticks = [max, max / 2, 0]
  const hoveredDay = hovered === null ? null : days[hovered]

  if (totals.every((t) => t === 0)) {
    return <p className="muted">No activity in the last 14 days yet. Start a session and it will show up here.</p>
  }

  return (
    <div className="activity">
      <ul className="legend">
        {SERIES.map((s) => (
          <li key={s.key}>
            <span className={`swatch series-${s.key}`} />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="activity-plot">
        <div className="y-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick}>{Number.isInteger(tick) ? tick : tick.toFixed(1)}</span>
          ))}
        </div>
        <div className="columns" onMouseLeave={() => setHovered(null)}>
          {ticks.map((tick) => (
            <div key={tick} className="gridline" style={{ bottom: `${(tick / max) * 100}%` }} />
          ))}
          {days.map((day, index) => (
            <div
              key={day.date}
              className={`column ${hovered !== null && hovered !== index ? 'dimmed' : ''}`}
              onMouseEnter={() => setHovered(index)}
              aria-label={`${DAY_LABEL.format(parseLocalDate(day.date))}: remembered ${day.remembered}, forgot ${day.forgot}, new words ${day.introduced}`}
            >
              <div className="stack" style={{ height: `${((totals[index] ?? 0) / max) * 100}%` }}>
                {/* Снизу вверх: remembered, forgot, new words. */}
                {[...SERIES].reverse().map((s) =>
                  day[s.key] > 0 ? (
                    <div key={s.key} className={`segment series-${s.key}`} style={{ flexGrow: day[s.key] }} />
                  ) : null
                )}
              </div>
            </div>
          ))}
          {hoveredDay && hovered !== null && (
            <div
              // Тултип сбоку от столбца, чтобы не закрывать его: слева на правой половине графика.
              className={`chart-tooltip ${hovered >= days.length / 2 ? 'to-left' : 'to-right'}`}
              style={{ left: `${((hovered + 0.5) / days.length) * 100}%` }}
              role="status"
            >
              <strong>{DAY_LABEL.format(parseLocalDate(hoveredDay.date))}</strong>
              {SERIES.map((s) => (
                <span key={s.key} className="tooltip-row">
                  <span className={`swatch series-${s.key}`} />
                  {s.label}
                  <span className="tooltip-value">{hoveredDay[s.key]}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="x-axis" aria-hidden="true">
        {days.map((day, index) => (
          <span key={day.date}>
            {index % 2 === 1 || index === days.length - 1 ? WEEKDAY.format(parseLocalDate(day.date)) : ''}
          </span>
        ))}
      </div>

      <details className="table-view">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th>Day</th>
              {SERIES.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day.date}>
                <td>{DAY_LABEL.format(parseLocalDate(day.date))}</td>
                {SERIES.map((s) => (
                  <td key={s.key}>{day[s.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
