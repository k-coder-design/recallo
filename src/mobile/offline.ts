/**
 * Работа без сети и обновления (W4). Service worker (sw.js, создаётся при сборке) хранит всё приложение
 * на телефоне. Когда на сайте появилась новая версия, она скачивается в фоне и ждёт: внизу экрана
 * появляется «New version ready · Update». Посреди сессии приложение само не перезагружается.
 */
export function startOffline(): void {
  // В режиме разработки кэш мешал бы видеть изменения.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  void navigator.serviceWorker.register('./sw.js').then((registration) => {
    // Новая версия уже скачана и ждёт (например, приложение открыли после обновления сайта).
    if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting)
    registration.addEventListener('updatefound', () => {
      const incoming = registration.installing
      incoming?.addEventListener('statechange', () => {
        // Первая установка (страницей ещё никто не управляет) — не обновление.
        if (incoming.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(incoming)
      })
    })
    // Проверять новую версию при каждом возвращении в приложение.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update()
    })
  })
}

function offerUpdate(waiting: ServiceWorker): void {
  if (document.querySelector('.update-toast')) return
  const toast = document.createElement('div')
  toast.className = 'update-toast'
  toast.setAttribute('role', 'status')
  const text = document.createElement('span')
  text.textContent = 'New version ready'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = 'Update'
  button.addEventListener('click', () => {
    button.disabled = true
    waiting.postMessage('skipWaiting')
  })
  toast.append(text, button)
  document.body.append(toast)
}

/**
 * Попросить браузер хранить данные постоянно: иначе iOS может очистить хранилище сайта,
 * которым давно не пользовались. У приложения на экране «Домой» обычно разрешается сразу.
 */
export function keepStorage(): void {
  void navigator.storage?.persist?.().catch(() => undefined)
}
