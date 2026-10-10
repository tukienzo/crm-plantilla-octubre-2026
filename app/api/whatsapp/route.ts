import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { BRAND } from "@/lib/brand"
import { contextoNegocio } from "@/lib/negocio"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// Lectura de los grupos de WhatsApp que el bot va guardando, y resumen con IA de un grupo en un rango.
const CLAUDE_URL = "https://api.anthropic.com/v1/messages"
const MODELOS = ["claude-sonnet-5", "claude-sonnet-4-6"]

type Fila = { chat_id: string; chat_name: string | null; sender: string | null; sender_name: string | null; text: string | null; media_type: string | null; from_me: boolean; sent_at: string }

async function claude(system: string, user: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta configurar ANTHROPIC_API_KEY")
  let ultimo = ""
  for (const model of MODELOS) {
    const r = await fetch(CLAUDE_URL, { method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model, max_tokens: 4000, system, messages: [{ role: "user", content: user }] }) })
    if (r.status === 404) { ultimo = await r.text(); continue }
    if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const j = await r.json()
    return (j.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n")
  }
  throw new Error(`Ningún modelo disponible: ${ultimo.slice(0, 200)}`)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const chat = searchParams.get("chat")
    const desde = searchParams.get("desde") || new Date(Date.now() - 7 * 86400000).toISOString()
    const hasta = searchParams.get("hasta") || new Date(Date.now() + 86400000).toISOString()
    const sb = createSupabaseAdmin()
    if (!chat) {
      // lista de chats: se agrupa en memoria sobre los últimos mensajes (no hay group by en PostgREST)
      const { data, error } = await sb.from("crm_whatsapp_messages").select("chat_id,chat_name,sent_at,is_group").order("sent_at", { ascending: false }).limit(8000)
      if (error) throw new Error(error.message)
      const chats = new Map<string, { chat_id: string; chat_name: string | null; mensajes: number; ultimo: string; is_group: boolean }>()
      for (const m of data || []) {
        const c = chats.get(m.chat_id) || { chat_id: m.chat_id, chat_name: m.chat_name, mensajes: 0, ultimo: m.sent_at, is_group: m.is_group }
        c.mensajes++
        if (!c.chat_name && m.chat_name) c.chat_name = m.chat_name
        chats.set(m.chat_id, c)
      }
      const { data: bot } = await sb.from("crm_integration_assets").select("metadata,last_seen_at").eq("source", "whatsapp").eq("asset_type", "estado").eq("source_id", "bot").maybeSingle()
      const estado = bot ? { ...(bot.metadata as Record<string, unknown>), visto: bot.last_seen_at } : null
      return NextResponse.json({ chats: [...chats.values()].sort((a, b) => b.ultimo.localeCompare(a.ultimo)), total: (data || []).length, estado })
    }
    const { data, error } = await sb.from("crm_whatsapp_messages").select("chat_id,chat_name,sender,sender_name,text,media_type,from_me,sent_at").eq("chat_id", chat).gte("sent_at", desde).lte("sent_at", hasta).order("sent_at", { ascending: true }).limit(3000)
    if (error) throw new Error(error.message)
    return NextResponse.json({ mensajes: data || [] })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const chat = String(body.chat || "")
    if (!chat) return NextResponse.json({ error: "Falta el chat" }, { status: 400 })
    const desde = body.desde ? new Date(body.desde).toISOString() : new Date(Date.now() - 7 * 86400000).toISOString()
    const hasta = body.hasta ? new Date(body.hasta).toISOString() : new Date(Date.now() + 86400000).toISOString()
    const pregunta = String(body.pregunta || "").trim().slice(0, 600)
    const sb = createSupabaseAdmin()
    const { data, error } = await sb.from("crm_whatsapp_messages").select("chat_name,sender_name,sender,text,media_type,from_me,sent_at").eq("chat_id", chat).gte("sent_at", desde).lte("sent_at", hasta).order("sent_at", { ascending: true }).limit(4000)
    if (error) throw new Error(error.message)
    const filas = (data || []) as Fila[]
    if (!filas.length) return NextResponse.json({ error: "No hay mensajes en ese rango" }, { status: 404 })
    let texto = ""
    for (const m of filas) {
      const linea = `[${m.sent_at.slice(0, 16).replace("T", " ")}] ${m.sender_name || m.sender || "?"}: ${m.text || (m.media_type ? `<${m.media_type}>` : "")}\n`
      if (texto.length + linea.length > 150000) break
      texto += linea
    }
    const system = `Sos el analista de ventas de ${BRAND.name}. Leés la conversación de un grupo de WhatsApp del equipo (closers, setters, dirección) y devolvés un resumen operativo en español rioplatense, sin relleno.

CONTEXTO DEL NEGOCIO
${contextoNegocio()}

Estructura: **Qué pasó** (hechos y decisiones, con quién y cuándo) · **Leads y ventas mencionados** (nombre, estado, monto si aparece, próximo paso) · **Pendientes y compromisos** (quién debe qué y para cuándo) · **Alertas** (objeciones repetidas, problemas de proceso, cosas que se pisan) · **Números que aparecen** (solo los que están escritos en los mensajes).
No inventes: si algo no está en los mensajes, no lo digas. Citá frases textuales entre comillas cuando aporten. Máximo 500 palabras.`
    const user = `Grupo: ${filas[0].chat_name || chat}. Rango: ${desde.slice(0, 10)} a ${hasta.slice(0, 10)}. Mensajes: ${filas.length}.${pregunta ? `\nPregunta puntual de quien pide el resumen: ${pregunta}` : ""}\n\nCONVERSACIÓN:\n${texto}`
    const resumen = await claude(system, user)
    return NextResponse.json({ ok: true, resumen, mensajes: filas.length, desde, hasta })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
