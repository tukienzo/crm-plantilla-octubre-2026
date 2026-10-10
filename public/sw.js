// Service worker minimo para instalabilidad PWA (Safari iOS), shell offline y avisos push.
// Deliberadamente NO cachea datos del CRM (agendas, pagos, clientes): esto es
// un CRM con datos sensibles y en constante cambio; cachear respuestas de API
// arriesgaria mostrar informacion vieja o filtrar datos entre sesiones/roles.
// Solo cachea el shell offline estatico para que, sin red, el usuario vea un
// mensaje claro en vez de un error de navegador.
const CACHE_NAME = "crm-shell-v3"
const OFFLINE_URL = "/offline.html"

self.addEventListener("install", (event) => {
  event.waitUntil(
    // Si la página offline no se puede cachear (sin sesión, sin red), el worker igual se instala:
    // los avisos push no dependen del shell offline.
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL)).catch(() => {}).then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  )
})

// Avisos push (los manda lib/push.ts con el formato { titulo, cuerpo, url, tag }). El nombre de la
// marca viaja en el título del aviso; si no llega, se usa uno genérico.
self.addEventListener("push", (event) => {
  let datos = {}
  try { datos = event.data ? event.data.json() : {} } catch { datos = { cuerpo: event.data ? event.data.text() : "" } }
  const titulo = datos.titulo || "CRM"
  event.waitUntil(self.registration.showNotification(titulo, {
    body: datos.cuerpo || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: datos.tag || undefined,
    renotify: Boolean(datos.tag),
    data: { url: datos.url || "/" },
  }))
})

// Al tocar el aviso: si el CRM ya está abierto en una pestaña, la trae al frente; si no, lo abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) { if ("navigate" in v) v.navigate(url); return v.focus() }
      }
      return self.clients.openWindow(url)
    })
  )
})
