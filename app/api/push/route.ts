import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { enviarPush, pushConfigurado, usuarioActual } from "@/lib/push"

export const runtime = "nodejs"

// Suscripciones a los avisos push del navegador (ver lib/push.ts y components/avisos-push.tsx).
//
//   GET  ?endpoint=...          → { publicKey, configurado, activo }  (activo = este dispositivo ya está anotado)
//   POST { subscription }       → guarda la suscripción de este dispositivo para el usuario logueado
//   POST { prueba: true }       → manda un aviso de prueba a todos los dispositivos del usuario
//   DELETE { endpoint }         → borra la suscripción de este dispositivo

export async function GET(request: Request) {
  const quien = await usuarioActual()
  if (!quien) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const endpoint = new URL(request.url).searchParams.get("endpoint")
  let activo = false
  if (endpoint) {
    const { data } = await createSupabaseAdmin().from("crm_push_suscripciones").select("id").eq("endpoint", endpoint).eq("email", quien.email).maybeSingle()
    activo = Boolean(data)
  }
  return NextResponse.json({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null, configurado: pushConfigurado(), activo })
}

export async function POST(request: Request) {
  const quien = await usuarioActual()
  if (!quien) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  if (body?.prueba) {
    const r = await enviarPush([quien.email], {
      titulo: "Avisos activados",
      cuerpo: "Así te va a llegar cuando un editor mueva un video a producción o a revisar.",
      url: "/contenido-angulos",
      tag: "prueba",
    })
    return NextResponse.json({ ok: true, ...r })
  }
  const s = body?.subscription
  const endpoint = String(s?.endpoint || "")
  const p256dh = String(s?.keys?.p256dh || "")
  const auth = String(s?.keys?.auth || "")
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "Suscripción incompleta" }, { status: 400 })
  const { error } = await createSupabaseAdmin().from("crm_push_suscripciones").upsert({
    email: quien.email, endpoint, p256dh, auth,
    user_agent: String(body?.userAgent || request.headers.get("user-agent") || "").slice(0, 300),
    fallos: 0,
  }, { onConflict: "endpoint" })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const quien = await usuarioActual()
  if (!quien) return NextResponse.json({ error: "Sin sesión" }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const endpoint = String(body?.endpoint || "")
  if (!endpoint) return NextResponse.json({ error: "Falta el endpoint" }, { status: 400 })
  await createSupabaseAdmin().from("crm_push_suscripciones").delete().eq("endpoint", endpoint).eq("email", quien.email)
  return NextResponse.json({ ok: true })
}
