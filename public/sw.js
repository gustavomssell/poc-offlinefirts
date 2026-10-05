const CACHE = 'poc-offlinefirts-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const chaves = await caches.keys()
      await Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request
  if (requisicao.method !== 'GET') return
  if (new URL(requisicao.url).origin !== self.location.origin) return

  if (requisicao.mode === 'navigate') {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const rede = await fetch(requisicao)
          cache.put(requisicao, rede.clone())
          return rede
        } catch {
          const salvo = (await cache.match(requisicao)) || (await cache.match('/index.html'))
          if (salvo) return salvo
          return new Response('Sem conexão.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          })
        }
      })(),
    )
    return
  }

  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const salvo = await cache.match(requisicao)
      if (salvo) return salvo
      try {
        const rede = await fetch(requisicao)
        if (rede.ok) cache.put(requisicao, rede.clone())
        return rede
      } catch {
        return new Response('', { status: 504 })
      }
    })(),
  )
})
