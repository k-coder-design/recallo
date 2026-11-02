/**
 * Offline mode and updates (W4). The service worker (sw.js, generated at build time) keeps the whole app
 * on the phone. A new version downloads in the background and takes over by itself (sw.js calls skipWaiting);
 * the page then reloads to it — unless a Study session is running: then "New version ready · Reload" waits at
 * the bottom, so a session is never interrupted. An app that missed an update gets it on its next launch.
 */
export function startOffline(): void {
  // In development the cache would hide changes.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  // The first install (no service worker controlled the page yet) is not an update: nothing to reload.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    if (document.querySelector('.app.in-session')) return offerReload()
    reloading = true
    window.location.reload()
  })

  void navigator.serviceWorker.register('./sw.js').then((registration) => {
    // Check for a new version every time the user returns to the app.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update()
    })
  })
}

function offerReload(): void {
  if (document.querySelector('.update-toast')) return
  const toast = document.createElement('div')
  toast.className = 'update-toast'
  toast.setAttribute('role', 'status')
  const text = document.createElement('span')
  text.textContent = 'New version ready'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Reload'
  button.addEventListener('click', () => window.location.reload())
  toast.append(text, button)
  document.body.append(toast)
}

/**
 * Ask the browser to keep the data persistently: otherwise iOS may clear the storage of a site
 * that has not been used for a long time. For a Home Screen app it is usually granted right away.
 */
export function keepStorage(): void {
  void navigator.storage?.persist?.().catch(() => undefined)
}
