import webpush from "web-push"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { responsableDe, SIN_ASIGNAR } from "@/lib/responsables"
import { BRAND } from "@/lib/brand"

// Avisos push del navegador (Web Push con VAPID). Cada dispositivo que activa los avisos desde el CRM
// queda en crm_push_suscripciones con el email del usuario; acá se les manda la notificación.
//
// Claves: NEXT_PUBLIC_VAPID_PUBLIC_KEY (la ve el navegador), VAPID_PRIVATE_KEY (solo servidor),
// VAPID_SUBJECT (mailto: de contacto; si falta se usa el mail de contacto de la marca). Se generan con
// `npx web-push generate-vapid-keys`.
// El service worker que muestra la notificación es public/sw.js.

export type AvisoPush = { titulo: string; cuerpo: string; url?: string; tag?: string }

let vapidListo = false
export function pushConfigurado() {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privada = process.env.VAPID_PRIVATE_KEY
  if (!publica || !privada) return false
  if (!vapidListo) {
    const contacto = process.env.VAPID_SUBJECT || (BRAND.contactEmail ? `mailto:${BRAND.contactEmail}` : "mailto:avisos@example.com")
    webpush.setVapidDetails(contacto, publica, privada)
    vapidListo = true
  }
  return true
}

// Manda el aviso a todos los dispositivos de esos emails. Las suscripciones vencidas (404/410) se borran solas.
export async function enviarPush(emails: string[], aviso: AvisoPush) {
  const destinatarios = [...new Set(emails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))]
  if (!pushConfigurado() || !destinatarios.length) return { enviados: 0, borrados: 0, dispositivos: 0 }
  const sb = createSupabaseAdmin()
  const { data: subs } = await sb.from("crm_push_suscripciones").select("id,endpoint,p256dh,auth,fallos").in("email", destinatarios)
  let enviados = 0
  let borrados = 0
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
        { TTL: 6 * 60 * 60, urgency: "high" },
      )
      enviados++
      await sb.from("crm_push_suscripciones").update({ last_used_at: new Date().toISOString(), fallos: 0 }).eq("id", s.id)
    } catch (e: unknown) {
      const code = Number((e as { statusCode?: number })?.statusCode || 0)
      if (code === 404 || code === 410) {
        await sb.from("crm_push_suscripciones").delete().eq("id", s.id)
        borrados++
      } else {
        console.warn("[push] no enviado", code, String((e as Error)?.message || e))
        await sb.from("crm_push_suscripciones").update({ fallos: Number(s.fallos || 0) + 1 }).eq("id", s.id)
      }
    }
  }))
  return { enviados, borrados, dispositivos: (subs || []).length }
}

export async function emailsPorRol(roles: string[]) {
  const { data } = await createSupabaseAdmin().from("team_members").select("email").in("rol", roles).eq("estado", "aprobado")
  return (data || []).map((r) => String(r.email || "").toLowerCase()).filter(Boolean)
}

// Quién está logueado en este pedido (email y nombre del equipo), o null si no hay sesión.
export async function usuarioActual() {
  try {
    const sesion = await createSupabaseServer()
    const { data: { user } } = await sesion.auth.getUser()
    if (!user?.email) return null
    const email = user.email.toLowerCase()
    const { data } = await createSupabaseAdmin().from("team_members").select("nombre,rol").eq("email", email).maybeSingle()
    return { email, nombre: String(data?.nombre || ""), rol: String(data?.rol || "") }
  } catch {
    return null
  }
}

// Movimientos del pipeline de contenido que avisan a quienes tienen el rol CEO: grabado → en producción y
// en producción → revisar. El nombre que va en el aviso es el del editor asignado a la pieza; si no
// tiene, el de quien la movió.
const MOVIMIENTOS: Record<string, { hasta: string; texto: string }> = {
  grabado: { hasta: "en_produccion", texto: "producción" },
  en_produccion: { hasta: "en_revision", texto: "revisar" },
}

export async function avisarMovimientoPieza(p: { id: string; antes: string; despues: string; titulo: string; responsable: string | null }) {
  const regla = MOVIMIENTOS[p.antes]
  if (!regla || regla.hasta !== p.despues) return null
  const quien = await usuarioActual()
  const asignado = responsableDe(p.responsable)
  const editor = asignado !== SIN_ASIGNAR ? asignado : (quien?.nombre || "Un editor")
  // A los CEO que activaron avisos, menos al que movió la pieza si es uno de ellos.
  const destinatarios = (await emailsPorRol(["CEO"])).filter((e) => e !== quien?.email)
  return enviarPush(destinatarios, {
    titulo: `${editor} ha movido un video a ${regla.texto}.`,
    cuerpo: p.titulo || "",
    url: "/contenido-angulos",
    tag: `pieza-${p.id}`,
  })
}
