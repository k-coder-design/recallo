/**
 * iOS Home Screen apps with a translucent status bar may get a viewport shorter than the screen by the
 * status bar height: everything pinned to the bottom (tabs, answer buttons) stops above the real edge and
 * a strip of background shows below it. Measure that gap on the device and let the layout extend into it
 * (CSS variable --viewport-gap, see styles.css). Where there is no gap the value is 0, so nothing changes.
 * Measured, not hard-coded: it works the same with a notch (iPhone 13 Pro Max) and a Dynamic Island (14 Pro Max).
 */
export function fitStandaloneViewport(): void {
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (!standalone) return
  document.documentElement.classList.add('standalone')

  const update = () => {
    const portrait = window.innerHeight >= window.innerWidth
    const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
    const gap = screenHeight - window.innerHeight
    // Only a status-bar-sized gap is this problem; anything bigger (split view, a resized window) is left alone.
    const fix = gap > 0 && gap <= 80 ? gap : 0
    document.documentElement.style.setProperty('--viewport-gap', `${fix}px`)
  }
  update()
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)
}
