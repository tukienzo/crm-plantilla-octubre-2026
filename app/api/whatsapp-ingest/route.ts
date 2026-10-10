import { NextResponse } from "next/server"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Entrada de mensajes de WhatsApp. Los manda un bot local (no viene incluido en esta plantilla),
// logueado con un número del equipo agregado a los grupos de ventas. Autoriza con el mismo
// Bearer CRON_SECRET que los crons. Idempotente: (chat_id, msg_id) es único.
type Mensaje = { chat_id: string; chat_name?: string | null; msg_id: string; sender?: string | null; sender_name?: string | null; text?: string | null; media_type?: string | null; is_group?: boolean; from_me?: boolean; sent_at: string; raw?: unknown }

export async function POST(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const body = await request.json().catch(() => ({}))
    const sb = createSupabaseAdmin()
    // estado del bot (QR para vincular, conectado, último latido): lo lee la pantalla Ventas → WhatsApp
    if (body?.estado && typeof body.estado === "object") {
      const e = body.estado as Record<string, unknown>
      const { data: previo } = await sb.from("crm_integration_assets").select("metadata").eq("source", "whatsapp").eq("asset_type", "estado").eq("source_id", "bot").maybeSingle()
      const metadata = { ...((previo?.metadata as Record<string, unknown>) || {}), ...e, qr: e.qr === undefined ? (previo?.metadata as Record<string, unknown> | null)?.qr ?? null : e.qr }
      const { error } = await sb.from("crm_integration_assets").upsert({ source: "whatsapp", asset_type: "estado", source_id: "bot", name: "Bot de WhatsApp", metadata, last_seen_at: new Date().toISOString() }, { onConflict: "source,asset_type,source_id" })
      if (error) throw new Error(error.message)
      if (!Array.isArray(body?.mensajes)) return NextResponse.json({ ok: true, estado: true })
    }
    const mensajes: Mensaje[] = Array.isArray(body?.mensajes) ? body.mensajes : []
    const filas = mensajes
      .filter((m) => m && m.chat_id && m.msg_id && m.sent_at)
      .map((m) => ({
        chat_id: String(m.chat_id), chat_name: m.chat_name ? String(m.chat_name).slice(0, 200) : null, msg_id: String(m.msg_id),
        sender: m.sender ? String(m.sender).slice(0, 120) : null, sender_name: m.sender_name ? String(m.sender_name).slice(0, 120) : null,
        text: m.text ? String(m.text).slice(0, 20000) : null, media_type: m.media_type ? String(m.media_type).slice(0, 40) : null,
        is_group: m.is_group !== false, from_me: m.from_me === true, sent_at: new Date(m.sent_at).toISOString(), raw: m.raw ?? null,
      }))
    if (!filas.length) return NextResponse.json({ ok: true, recibidos: 0 })
    let guardados = 0
    for (let i = 0; i < filas.length; i += 200) {
      const { error, data } = await sb.from("crm_whatsapp_messages").upsert(filas.slice(i, i + 200), { onConflict: "chat_id,msg_id", ignoreDuplicates: true }).select("id")
      if (error) throw new Error(error.message)
      guardados += data?.length || 0
    }
    return NextResponse.json({ ok: true, recibidos: filas.length, guardados })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
