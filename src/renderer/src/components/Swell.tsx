import type { Swell } from '../../../shared/types'

// The scene is wider than any card: it is pinned to the right edge and cropped on the left; the text stays in the "sky".
const WIDTH = 960
const HEIGHT = 220
const MIN_SWELL = 0.3
const MAX_SWELL = 4

/** A wave crest: a sine with a slight skew so the peaks are steeper, like a breaking wave. */
function waveY(x: number, base: number, amp: number, length: number, phase: number): number {
  const angle = (x / length + phase) * Math.PI * 2
  return base - amp * (Math.sin(angle) + 0.28 * Math.sin(angle * 2 - 0.6))
}

function wavePath(base: number, amp: number, length: number, phase: number, closed: boolean): string {
  // The path is wider than the scene by one wavelength: the layer shifts by it in the animation and joins without a seam.
  const points: string[] = []
  for (let x = 0; x <= WIDTH + length; x += 6) points.push(`${x} ${waveY(x, base, amp, length, phase).toFixed(1)}`)
  const line = `M${points.join(' L')}`
  return closed ? `${line} L${WIDTH + length} ${HEIGHT} L0 ${HEIGHT} Z` : line
}

/** Today's swell illustration (D41): the higher the swell, the higher and steeper the waves. */
export function WaveScene({ height }: { height: number }) {
  const t = Math.min(Math.max((height - MIN_SWELL) / (MAX_SWELL - MIN_SWELL), 0), 1)
  const layers = [
    { name: 'far', base: 150 - 10 * t, amp: 4 + 12 * t, length: 150, phase: 0.1 },
    { name: 'mid', base: 174 - 8 * t, amp: 5 + 17 * t, length: 190, phase: 0.45 },
    { name: 'near', base: 198 - 4 * t, amp: 4 + 19 * t, length: 230, phase: 0.8 }
  ]
  const near = layers[2] as (typeof layers)[number]
  // The surfer is on the nearest crest of the near wave, in the middle of the visible part of the scene.
  let surferX = 620
  for (let x = 620; x <= 780; x += 2) {
    if (waveY(x, near.base, near.amp, near.length, near.phase) < waveY(surferX, near.base, near.amp, near.length, near.phase)) surferX = x
  }
  const surferY = waveY(surferX, near.base, near.amp, near.length, near.phase)
  return (
    <svg className="wave-scene" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <defs>
        <clipPath id="wave-sun-disc">
          <circle cx="880" cy="70" r="30" />
        </clipPath>
      </defs>
      <g className="wave-sun" clipPath="url(#wave-sun-disc)">
        <circle cx="880" cy="70" r="30" />
        <rect x="840" y="76" width="80" height="4" />
        <rect x="840" y="86" width="80" height="5" />
      </g>
      {layers.map((layer) => (
        <g key={layer.name} className={`wave-layer wave-${layer.name}`} style={{ ['--wave-length' as string]: `${layer.length}px` }}>
          <path className="wave-body" d={wavePath(layer.base, layer.amp, layer.length, layer.phase, true)} />
          <path className="wave-foam" d={wavePath(layer.base + 7, layer.amp * 0.85, layer.length, layer.phase, false)} />
        </g>
      ))}
      <text className="wave-surfer" x={surferX} y={surferY - 2} textAnchor="middle">
        🏄
      </text>
    </svg>
  )
}

function hintText(swell: Swell): string {
  const next = swell.next.height.toFixed(1)
  const grows = swell.next.height > swell.height
  if (swell.next.when === 'today') return grows ? `Paddle out today → ${next} m` : 'Paddle out today to keep it'
  return grows ? `Come back tomorrow → ${next} m` : `Come back tomorrow to hold ${swell.height.toFixed(1)} m`
}

/** "Today's swell": wave height from regularity, accuracy and mastered words (D40). */
export function SwellCard({ swell }: { swell: Swell }) {
  return (
    <section className="swell" aria-label="Today's swell">
      <div className="swell-card">
        <WaveScene height={swell.height} />
        <div className="swell-info">
        <p className="swell-eyebrow">Today’s swell</p>
        <p className="swell-height">
          {swell.height.toFixed(1)}
          <span> m</span>
        </p>
        <p className="swell-label">{swell.label}</p>
          <p className="swell-hint">{hintText(swell)}</p>
        </div>
      </div>
      <dl className="swell-factors">
        <div title="Days you studied this week. Steady practice matters most.">
          <dt>Steady days</dt>
          <dd>
            {swell.activeDays}/{swell.windowDays}
          </dd>
        </div>
        <div title="Remembered answers over the last 2 weeks. Counts after 5 answers.">
          <dt>Recall</dt>
          <dd>{swell.accuracy === null ? '—' : `${Math.round(swell.accuracy * 100)}%`}</dd>
        </div>
        <div title="Words you are learning that reached Familiar or Learned.">
          <dt>Mastered</dt>
          <dd>{Math.round(swell.mastery * 100)}%</dd>
        </div>
      </dl>
    </section>
  )
}
