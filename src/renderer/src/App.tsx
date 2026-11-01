import { useCallback, useEffect, useState } from 'react'
import type { Space, SpaceId, StudyCounts } from '../../shared/types'
import { call, errorMessage } from './lib/api'
import { IS_PHONE } from './lib/platform'
import { applyTheme } from './lib/theme'
import { usePersistentState } from './lib/usePersistentState'
import { CardsPage } from './pages/CardsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'
import { StudyPage } from './pages/StudyPage'

const SPACE_IDS: readonly SpaceId[] = ['en', 'es']
const PAGES = ['study', 'cards', 'stats', 'settings'] as const
type Page = (typeof PAGES)[number]

export function App() {
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceId, setSpaceId] = usePersistentState<SpaceId>('space', 'en', SPACE_IDS)
  const [page, setPage] = usePersistentState<Page>('page', 'study', PAGES)
  const [counts, setCounts] = useState<StudyCounts | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Идёт сессия Study: на телефоне шапка и нижние вкладки прячутся, остаются карточка и ответ (W2). */
  const [inSession, setInSession] = useState(false)

  useEffect(() => {
    call('spaces.list')
      .then(setSpaces)
      .catch((e: unknown) => setError(errorMessage(e)))
    // Тема из настройки в базе (D58); при ошибке остаётся тема, применённая при запуске.
    call('settings.theme')
      .then(applyTheme)
      .catch(() => undefined)
  }, [])

  const refreshCounts = useCallback(() => {
    call('study.counts', spaceId)
      .then(setCounts)
      .catch((e: unknown) => setError(errorMessage(e)))
  }, [spaceId])

  useEffect(() => {
    setCounts(null)
    refreshCounts()
  }, [refreshCounts])

  /** Study присылает счётчики, которые уже пришли вместе с карточкой, — тогда запрос не нужен. */
  const onStudyProgress = useCallback(
    (known?: StudyCounts) => (known ? setCounts(known) : refreshCounts()),
    [refreshCounts]
  )

  const tab = (id: Page, label: string) => (
    <button type="button" className={page === id ? 'active' : ''} onClick={() => setPage(id)} aria-current={page === id}>
      {IS_PHONE && <TabIcon page={id} />}
      {label}
      {id === 'study' && counts && counts.due > 0 && (
        <span className="pill" title="To review">
          {counts.due}
        </span>
      )}
    </button>
  )
  // На Mac вкладки — в шапке, на телефоне — внизу под большим пальцем (W2).
  const nav = (
    <nav className={IS_PHONE ? 'nav tabbar' : 'nav'} aria-label="Sections">
      {tab('study', 'Study')}
      {tab('cards', 'Cards')}
      {tab('stats', 'Stats')}
      {tab('settings', 'Settings')}
    </nav>
  )

  return (
    <div className={['app', IS_PHONE && 'phone', inSession && 'in-session'].filter(Boolean).join(' ')}>
      <header className="topbar">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 28 16" aria-hidden="true">
            <path d="M1 11c3.5 0 3.5-6 7-6s3.5 6 7 6 3.5-6 7-6 3.5 4 5 4" />
            <path d="M1 15c3.5 0 3.5-4 7-4s3.5 4 7 4 3.5-4 7-4 3.5 3 5 3" />
          </svg>
          Recallo
        </div>
        <div className="segmented" role="tablist" aria-label="Language">
          {spaces.map((space) => (
            <button
              key={space.id}
              type="button"
              role="tab"
              aria-selected={space.id === spaceId}
              className={space.id === spaceId ? 'active' : ''}
              onClick={() => setSpaceId(space.id)}
            >
              {space.name}
            </button>
          ))}
        </div>
        {!IS_PHONE && nav}
      </header>

      {error && <p className="error banner">{error}</p>}

      <main className="content">
        {page === 'study' ? (
          // key: при смене языка сессия начинается заново, прогресс уже сохранён (LANG-04).
          <StudyPage
            key={spaceId}
            spaceId={spaceId}
            onProgress={onStudyProgress}
            onGoToCards={() => setPage('cards')}
            onSessionChange={setInSession}
          />
        ) : page === 'cards' ? (
          <CardsPage key={spaceId} spaceId={spaceId} onChanged={refreshCounts} />
        ) : page === 'stats' ? (
          <StatsPage key={spaceId} spaceId={spaceId} onChanged={refreshCounts} />
        ) : (
          <SettingsPage />
        )}
      </main>

      {IS_PHONE && nav}
    </div>
  )
}

/** Значки нижних вкладок телефона: волна, стопка карточек, столбики, ползунки. */
function TabIcon({ page }: { page: Page }) {
  const paths: Record<Page, string[]> = {
    study: ['M2 14c3 0 3-5 6-5s3 5 6 5 3-5 6-5 2 3 2 3', 'M2 19c3 0 3-3 6-3s3 3 6 3 3-3 6-3 2 2 2 2'],
    cards: ['M7 4h11a2 2 0 0 1 2 2v11', 'M4 8h11a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z'],
    stats: ['M5 20V11', 'M12 20V5', 'M19 20v-6'],
    settings: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', 'M16 5v4', 'M10 15v4']
  }
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[page].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
