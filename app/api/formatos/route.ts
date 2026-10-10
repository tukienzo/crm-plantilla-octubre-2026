import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { canalDe } from "@/lib/panel-negocio"

export const dynamic = "force-dynamic"

// Rendimiento real por tipo de pieza (recurso: Reel, Carrusel, Historia, Webinar, Ads, Nuevo seguidor)
// y por pieza concreta (angulo_entrada = tag de ManyChat con el nombre del contenido), medido en
// agendas, llamadas presentadas, cierres y cash del día 1. Nada se inventa: sale de `agendas`.
type Fila = { nombre: string; formato?: string; agendas: number; presentadas: number; calificadas: number; cierres: number; cash: number; ultima?: string | null }

const CALIF = new Set(["lead a", "lead b", "lead c", "a", "b", "c", "s"])
const minus = (s: unknown) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = Math.min(365, Math.max(7, Number(searchParams.get("dias") || 90) || 90))
    const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
    const sb = createSupabaseAdmin()
    const filas: Array<Record<string, unknown>> = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("agendas")
        .select("nombre,fecha_closer,fecha_agenda,fuente,recurso,angulo_entrada,calificacion,show,cerro,cc_dia_1,closer")
        .gte("fecha_agenda", `${desde}T00:00:00`).range(from, from + 999)
      if (error) throw error
      filas.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    const porFormato = new Map<string, Fila>()
    const porPieza = new Map<string, Fila>()
    const porCanal = new Map<string, Fila>()
    const suma = (m: Map<string, Fila>, k: string, a: Record<string, unknown>, extra: Partial<Fila> = {}) => {
      if (!m.has(k)) m.set(k, { nombre: k, agendas: 0, presentadas: 0, calificadas: 0, cierres: 0, cash: 0, ultima: null, ...extra })
      const f = m.get(k)!
      f.agendas++
      if (a.show === true) { f.presentadas++; if (CALIF.has(minus(a.calificacion))) f.calificadas++ }
      if (a.cerro) { f.cierres++; f.cash += Number(a.cc_dia_1 || 0) }
      const d = String(a.fecha_agenda || "").slice(0, 10)
      if (d && (!f.ultima || d > f.ultima)) f.ultima = d
    }
    for (const a of filas) {
      const formato = String(a.recurso || "").trim() || "Sin pieza identificada"
      suma(porFormato, formato, a)
      if (a.angulo_entrada) suma(porPieza, String(a.angulo_entrada).trim(), a, { formato })
      suma(porCanal, canalDe(a.fuente as string), a)
    }
    const orden = (x: Fila, y: Fila) => y.cierres - x.cierres || y.agendas - x.agendas
    return NextResponse.json({
      desde, dias, total: filas.length,
      formatos: [...porFormato.values()].sort(orden),
      piezas: [...porPieza.values()].sort(orden).slice(0, 40),
      canales: [...porCanal.values()].sort(orden),
    })
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
  }
}
