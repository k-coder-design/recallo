/**
 * iOS Home Screen apps with a see-through status bar may get a viewport shorter than the screen by the
 * status bar height: everything pinned to the bottom stops above the real edge and a strip shows below it.
 * Measure that gap (CSS variable --viewport-gap, see styles.css) so the tab bar color can fill it.
 *
 * The gap exists only when the page is drawn under the status bar (a top safe-area inset). With a solid
 * status bar the viewport rightly starts below it, so a shorter innerHeight is not a gap — measuring it then
 * would push sheets and buttons below the screen edge. Measured, not hard-coded: the same on a notch
 * (iPhone 13 Pro Max) and a Dynamic Island (14 Pro Max).
 */
export function fitStandaloneViewport(): void {
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (!standalone) return
  document.documentElement.classList.add('standalone')

  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)'
  document.body.append(probe)

  const update = () => {
    const underStatusBar = parseFloat(getComputedStyle(probe).paddingTop) > 0
    const portrait = window.innerHeight >= window.innerWidth
    const screenHeight = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
    const gap = screenHeight - window.innerHeight
    // Only a status-bar-sized gap under a see-through status bar is this problem; anything else is left alone.
    const fix = underStatusBar && gap > 0 && gap <= 80 ? gap : 0
    document.documentElement.style.setProperty('--viewport-gap', `${fix}px`)
  }
  update()
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)
}
