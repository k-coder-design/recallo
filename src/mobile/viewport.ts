/**
 * iOS Home Screen app: mark the page (class "standalone" on <html>) so styles.css can apply the fixes for
 * the Home Screen viewport — a full-height page so iOS does not leave a strip under the tabs, and a solid
 * strip under the status bar so iOS does not blur the header.
 */
export function markStandalone(): void {
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (standalone) document.documentElement.classList.add('standalone')
}
