import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { autoScoreLead } from "@/lib/lead-scoring"

export const maxDuration = 120
export const dynamic = "force-dynamic"

// Lead scoring automático: calcula el tipo de lead (S/A/B/C/D) de cada agenda con las respuestas del
// formulario de iClosed y lo guarda en lead_score / lead_score_grade / lead_score_detalle. La calificación
// del closer (`calificacion`) solo se completa cuando está vacía o cuando la había puesto este mismo
// scoring antes; una calificación cargada a mano nunca se pisa.
// Corre por cron cada 15 minutos y también a mano: GET /api/lead-scoring-sync?todo=1 recalcula todas.
const DESDE = "2026-07-01"

async function correr(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const todo = new URL(request.url).searchParams.get("todo") === "1"
    const admin = createSupabaseAdmin()
    const filas: Array<Record<string, unknown>> = []
    for (let desde = 0; desde < 20000; desde += 1000) {
      let q = admin.from("agendas")
        .select("id,edad,problema_actual,tiempo_problema,intentos_previos,motivo_urgencia,ocupacion,ingresos,inversion,calificacion,lead_score_grade,lead_score_at,updated_at")
        .or(`fecha_agenda.gte.${DESDE},fecha_closer.gte.${DESDE}`)
        .order("fecha_agenda", { ascending: false })
        .range(desde, desde + 999)
      if (!todo) q = q.is("lead_score_at", null)
      const { data, error } = await q
      if (error) throw error
      filas.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    let puntuadas = 0, sinDatos = 0, calificacionCompletada = 0
    const porTipo: Record<string, number> = {}
    const ahora = new Date().toISOString()
    for (const a of filas) {
      const r = autoScoreLead(a)
      const parche: Record<string, unknown> = { lead_score_at: ahora, lead_score: r ? r.puntos : null, lead_score_grade: r ? r.calificacion : null, lead_score_detalle: r ? { motivo: r.motivo, ...r.desglose } : { motivo: "formulario incompleto: sin capital y sin ingresos ni etapa" } }
      if (r && (!a.calificacion || a.calificacion === a.lead_score_grade)) { parche.calificacion = r.calificacion; if (a.calificacion !== r.calificacion) calificacionCompletada++ }
      const { error } = await admin.from("agendas").update(parche).eq("id", a.id)
      if (error) throw error
      if (r) { puntuadas++; porTipo[r.calificacion] = (porTipo[r.calificacion] || 0) + 1 } else sinDatos++
    }
    return NextResponse.json({ ok: true, evaluadas: filas.length, puntuadas, sinDatos, calificacionCompletada, porTipo })
  } catch (error) {
    return NextResponse.json({ error: String((error as Error)?.message || error) }, { status: 500 })
  }
}

export async function GET(request: Request) { return correr(request) }
export async function POST(request: Request) { return correr(request) }
