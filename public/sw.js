const CACHE = 'milkyway-v4'
const SCOPE = self.registration.scope
const PRECACHE = [
  '',
  'manifest.webmanifest',
  'icons/app-192.png',
  'icons/app-512.png',
  'icons/badge-96.png',
  ...['play', 'pause', 'check', 'switch', 'drop', 'bell', 'side', 'clock', 'sun', 'moon', 'app', 'pump', 'bottle'].map((n) => `icons/${n}.webp`),
].map((path) => new URL(path, SCOPE).href)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(SCOPE, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(SCOPE)
    if (cached) return cached
    throw err
  }
}

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch((err) => {
      if (cached) return cached
      throw err
    })
  return cached ?? refresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return
  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : staleWhileRevalidate(request))
})

const readPushData = (event) => {
  try {
    return event.data?.json() ?? {}
  } catch {
    return {}
  }
}

self.addEventListener('push', (event) => {
  const data = readPushData(event)
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Time for a feed', {
      body: data.body ?? 'Tap to start a feed.',
      tag: 'feed-reminder',
      renotify: true,
      requireInteraction: true,
      icon: new URL('icons/app-192.png', SCOPE).href,
      badge: new URL('icons/badge-96.png', SCOPE).href,
      data: { url: data.url ?? '?start=1' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '?start=1', SCOPE).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => c.url.startsWith(SCOPE))
      if (client) {
        client.postMessage({ type: 'start-feed' })
        return client.focus()
      }
      return self.clients.openWindow(url)
    }),
  )
})
