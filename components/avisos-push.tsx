"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useSession } from "@/components/session-provider"
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react"

// Botón "Activar avisos" del módulo Contenido: registra este navegador para recibir notificaciones
// push cuando un editor mueve una pieza (grabado → producción, producción → revisar). Cada
// dispositivo se activa por separado (la compu, el celular). En iPhone solo funciona con el CRM
// agregado a la pantalla de inicio. Lo ven los roles de dirección; los editores no reciben avisos.

type Estado = "cargando" | "sin-soporte" | "necesita-instalar" | "bloqueado" | "inactivo" | "activo"

function claveAUint8(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4)
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(Array.from(crudo, (c) => c.charCodeAt(0)))
}

const cabeceras = { "Content-Type": "application/json" }

// Registro del service worker con tope de espera: si `ready` no resuelve (instalación trabada),
// el botón igual aparece y el error real se muestra al intentar activar.
async function workerListo(ms = 6000): Promise<ServiceWorkerRegistration | null> {
  try {
    const reg = await navigator.serviceWorker.register("/sw.js")
    const listo = navigator.serviceWorker.ready
    const tope = new Promise<null>((r) => setTimeout(() => r(null), ms))
    return (await Promise.race([listo, tope])) || reg
  } catch {
    return null
  }
}

export function AvisosPush() {
  const session = useSession()
  const [estado, setEstado] = useState<Estado>("cargando")
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState("")
  const paraDireccion = ["CEO", "Sales Manager", "Manager MKT"].includes(session.rol)

  const revisar = useCallback(async () => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const instalada = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches
      setEstado(ios && !instalada ? "necesita-instalar" : "sin-soporte")
      return
    }
    if (Notification.permission === "denied") { setEstado("bloqueado"); return }
    try {
      const reg = await workerListo()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (!sub) { setEstado("inactivo"); return }
      const r = await fetch(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`).then((x) => x.json()).catch(() => null)
      if (r?.activo) { setEstado("activo"); return }
      // El navegador ya tenía la suscripción pero el CRM no la conoce (otro usuario, base nueva): se anota.
      const ok = await fetch("/api/push", { method: "POST", headers: cabeceras, body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }) }).then((x) => x.ok).catch(() => false)
      setEstado(ok ? "activo" : "inactivo")
    } catch {
      setEstado("inactivo")
    }
  }, [])

  useEffect(() => { void revisar() }, [revisar])

  async function activar() {
    setOcupado(true); setMsg("")
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== "granted") { setEstado(permiso === "denied" ? "bloqueado" : "inactivo"); return }
      const { publicKey } = await fetch("/api/push").then((x) => x.json())
      if (!publicKey) { setMsg("Faltan las claves de avisos en el servidor."); return }
      const reg = await workerListo()
      if (!reg) throw new Error("No se pudo registrar el service worker en este navegador.")
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveAUint8(publicKey) })
      const r = await fetch("/api/push", { method: "POST", headers: cabeceras, body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "No se pudo guardar la suscripción")
      setEstado("activo"); setMsg("Listo: este dispositivo va a recibir los avisos.")
    } catch (e) {
      setMsg(String((e as Error)?.message || e))
    } finally {
      setOcupado(false)
    }
  }

  async function desactivar() {
    setOcupado(true); setMsg("")
    try {
      const reg = await workerListo()
      const sub = reg ? await reg.pushManager.getSubscription() : null
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: cabeceras, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setEstado("inactivo")
    } finally {
      setOcupado(false)
    }
  }

  async function probar() {
    setOcupado(true); setMsg("")
    try {
      const r = await fetch("/api/push", { method: "POST", headers: cabeceras, body: JSON.stringify({ prueba: true }) }).then((x) => x.json())
      setMsg(r?.enviados ? `Aviso de prueba enviado a ${r.enviados} dispositivo${r.enviados === 1 ? "" : "s"}.` : "No se pudo enviar: revisá que los avisos estén activos.")
    } finally {
      setOcupado(false)
    }
  }

  if (!paraDireccion || estado === "cargando") return null

  const nota = (texto: string) => <span className="max-w-xs text-[11px] leading-tight text-muted-foreground">{texto}</span>
  if (estado === "sin-soporte") return nota("Este navegador no soporta avisos.")
  if (estado === "necesita-instalar") return nota("Para recibir avisos en el iPhone: Compartir → Agregar a pantalla de inicio, y abrí el CRM desde ahí.")
  if (estado === "bloqueado") return nota("Los avisos están bloqueados en este navegador: habilitalos desde el candado de la barra de direcciones.")

  return (
    <div className="flex flex-wrap items-center gap-2">
      {estado === "inactivo" ? (
        <Button size="sm" variant="outline" disabled={ocupado} onClick={activar}>
          {ocupado ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Bell className="mr-1.5 h-4 w-4" />}Activar avisos
        </Button>
      ) : (
        <>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"><BellRing className="h-3.5 w-3.5" />Avisos activos</span>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={probar}>Probar</Button>
          <Button size="icon" variant="ghost" title="Desactivar avisos en este dispositivo" disabled={ocupado} onClick={desactivar}><BellOff className="h-4 w-4" /></Button>
        </>
      )}
      {msg ? <span className="max-w-xs text-[11px] leading-tight text-muted-foreground">{msg}</span> : null}
    </div>
  )
}
