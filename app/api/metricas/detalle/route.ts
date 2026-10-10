import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { armarEnlazador, cargarAgendasEnlace, embudoDe, leerEmbudos } from "@/lib/embudo-atribucion"
import { BECCPP_TYPES, BECCU_TYPES, FECCPP_TYPES, FECCU_TYPES } from "@/lib/commission-scheme"
import { ALL_SALE_TYPES, BACK_END_SALE_TYPES, CLOSED_IN_CALL_TYPES } from "@/lib/revenue"
import { FEE_TIPOS, FRONT_END_FEE_TIPOS } from "@/lib/cash-collected"
import { BRAND } from "@/lib/brand"
import { semanasDelMes } from "@/lib/semanas"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}


// Conjuntos compartidos con app/api/metricas/route.ts (vocabulario de pagos del CRM).
const FECCU_TIPOS = FECCU_TYPES
const FECCP_TIPOS = FECCPP_TYPES
const BECCU_TIPOS = BECCU_TYPES
const BECCPP_TIPOS = BECCPP_TYPES
const CIERRES_TIPOS = ALL_SALE_TYPES

function getDateRange(mes: string, weekIdx: number): { start: string; end: string } {
  const [year, mon] = mes.split("-").map(Number)
  const lastDay = new Date(year, mon, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, "0")
  if (weekIdx > 0) {
    const weeks = semanasDelMes(mes)
    if (weeks && weeks[weekIdx - 1]) {
      const [s, e] = weeks[weekIdx - 1]
      return { start: `${mes}-${pad(s)}`, end: `${mes}-${pad(Math.min(e, lastDay))}` }
    }
  }
  return { start: `${mes}-01`, end: `${mes}-${pad(lastDay)}` }
}

function argentinaAgendaBoundary(date: string, end = false): string {
  return new Date(`${date}T${end ? "23:59:59" : "00:00:00"}-03:00`).toISOString().slice(0, 19)
}

// Para "cash collected por call": SOLO Fee y Venta Nueva (cerrada en la
// llamada) — los unicos tipos que efectivamente pasan por una llamada.
const CASH_POR_CALL_TIPOS = new Set(["Fee", ...CLOSED_IN_CALL_TYPES])

// Filtros de pagos por "card" de la pantalla de Métricas — deben coincidir
// exactamente con las definiciones usadas en app/api/metricas/route.ts.
type PagoRow = { tipo: string; operacion?: string | null }
// La categoría depende del tipo de cobro, no del producto. Un programa avanzado
// puede ser una venta nueva frontend y no debe convertirse en backend por su nombre.
const backend = (r: PagoRow) => BECCU_TIPOS.has(r.tipo) || BECCPP_TIPOS.has(r.tipo)
const beccpp = (r: PagoRow) => BECCPP_TIPOS.has(r.tipo)
const beccu = (r: PagoRow) => backend(r) && !beccpp(r)
const PAGO_FILTERS: Record<string, (row: PagoRow) => boolean> = {
  feccu: r => !backend(r) && FECCU_TIPOS.has(r.tipo),
  feccp: r => !backend(r) && FECCP_TIPOS.has(r.tipo),
  beccu,
  beccpp,
  fees: r => FRONT_END_FEE_TIPOS.has(r.tipo),
  cierres_be: r => BACK_END_SALE_TYPES.has(r.tipo),
  cierres_llamada: r => CLOSED_IN_CALL_TYPES.has(r.tipo),
  cierres_seguimiento: r => CIERRES_TIPOS.has(r.tipo) && !CLOSED_IN_CALL_TYPES.has(r.tipo),
  cierres_totales: r => CIERRES_TIPOS.has(r.tipo),
  fe_total: r => !backend(r) && (FECCU_TIPOS.has(r.tipo) || FECCP_TIPOS.has(r.tipo)),
  be_total: backend,
  ingresos_totales: r => backend(r) || FECCU_TIPOS.has(r.tipo) || FECCP_TIPOS.has(r.tipo),
  aov_dia1: r => CLOSED_IN_CALL_TYPES.has(r.tipo) || r.tipo === "Fee",
  aov_tc: r => CIERRES_TIPOS.has(r.tipo),
  pagos_totales: r => CIERRES_TIPOS.has(r.tipo) || FEE_TIPOS.has(r.tipo),
  unidades_cerradas: r => CIERRES_TIPOS.has(r.tipo),
}

// Misma normalización que usa el tally() de Volumen en app/api/metricas/route.ts,
// para que el detalle de una barra (ej. "Instagram RMKT") filtre exactamente
// los mismos registros que se contaron ahí.
const SIN = "Sin dato"
function normalizeVolumenVal(field: string, raw: unknown): string {
  const v = (raw || "").toString().trim()
  if (field === "cuenta") {
    if (!v || v === "-" || v === "No se le envió") return SIN
    // El CRM opera una sola cuenta: todo lo cargado en "cuenta" se agrupa
    // bajo la cuenta del negocio (misma regla que en metricas/route.ts).
    return BRAND.igArroba ? `${BRAND.name} (${BRAND.igArroba})` : BRAND.name
  }
  if (field === "ocupacion" || field === "manychat") {
    if (!v || v === "-" || v === "No se le envió") return "No se le envió"
    return v
  }
  // fuente (y cualquier otro campo por default)
  if (!v || v === "-" || v === "No se le envió") return SIN
  return v
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mes = searchParams.get("month")
    const weekIdx = parseInt(searchParams.get("week") || "0")
    const key = searchParams.get("key") || ""
    if (!mes) return NextResponse.json({ error: "Falta month" }, { status: 400 })

    const { start, end } = getDateRange(mes, weekIdx)
    const sb = getSupabase()
    // ?embudo=: mismo recorte que /api/metricas (agendas por fuente, pagos por la agenda del cliente)
    // Uno o varios embudos separados por coma: se suman.
    const embudos = leerEmbudos(searchParams.get("embudo"))
    const deEmbudo = (r: { fuente?: string | null }) => !embudos || embudos.includes(embudoDe(r.fuente))
    const enlace = embudos ? armarEnlazador(await cargarAgendasEnlace(sb)) : null
    const pagoDeEmbudo = (r: { fecha?: string | null; cliente?: string | null; telefono?: string | null; person_id?: string | null; fuente?: string | null }) => !enlace || !embudos || embudos.includes(enlace.embudoDePago(r))

    if (key === "agendas") {
      const { data, error } = await sb
        .from("agendas")
        .select("id,person_id,telefono,nombre,instagram,closer,setter,calificacion,show,fecha_agenda,fecha_closer,fuente")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_agenda", argentinaAgendaBoundary(start))
        .lte("fecha_agenda", argentinaAgendaBoundary(end, true))
        .order("fecha_agenda", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const seen = new Set<string>()
      const rows = (data || []).filter(deEmbudo).filter((agenda: any) => {
        const phone = String(agenda.telefono || "").replace(/\D/g, "")
        const name = String(agenda.nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
        const identity = agenda.person_id ? `person:${agenda.person_id}` : phone ? `phone:${phone}` : `name:${name}`
        const dedupeKey = `${String(agenda.setter || "").trim().split(/\s+/)[0].toLowerCase()}:${identity}`
        if (seen.has(dedupeKey)) return false
        seen.add(dedupeKey)
        return true
      })
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "canceladas_triage" || key === "no_show" || key === "no_response" || key === "sin_resultado") {
      const { data, error } = await sb
        .from("agendas")
        .select("id,nombre,instagram,closer,setter,calificacion,show,estado,fecha_agenda,fecha_closer,call_confirmer,fuente")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_closer", `${start}T00:00:00`)
        .lte("fecha_closer", `${end}T23:59:59`)
        .order("fecha_agenda", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const nowMs = Date.now()
      const noShows = (data || []).filter(deEmbudo).filter((r: any) => {
        const scheduled = r.fecha_closer ? new Date(r.fecha_closer).getTime() : NaN
        return Number.isFinite(scheduled) && scheduled <= nowMs && r.show !== true && r.estado !== "Cancelado"
      })
      const rows = key === "canceladas_triage"
        ? noShows.filter((r: any) => (r.call_confirmer || "").includes("Triage"))
        : key === "no_response"
        ? noShows.filter((r: any) => r.call_confirmer === "No Respondió")
        : key === "sin_resultado"
        ? noShows.filter((r: any) => r.show == null && !(r.call_confirmer || "").includes("Triage") && r.call_confirmer !== "No Respondió")
        : noShows.filter((r: any) => r.show === false && !(r.call_confirmer || "").includes("Triage") && r.call_confirmer !== "No Respondió")
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "calificaba_realmente") {
      const { data, error } = await sb
        .from("agendas")
        .select("id,nombre,instagram,closer,setter,calificacion,show,fecha_agenda,fecha_closer,calificaba_realmente,fuente")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .eq("show", true)
        .in("calificacion", ["LEAD S", "LEAD A", "LEAD B"])
        .gte("fecha_closer", `${start}T00:00:00`)
        .lte("fecha_closer", `${end}T23:59:59`)
        .order("fecha_closer", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const rows = (data || []).filter(deEmbudo).filter((r: any) => r.calificaba_realmente === "Si" || r.calificaba_realmente === "No")
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "volumen") {
      const field = searchParams.get("field") || ""
      const value = searchParams.get("value") || ""
      if (!["cuenta", "ocupacion", "fuente", "manychat"].includes(field)) {
        return NextResponse.json({ error: "field inválido" }, { status: 400 })
      }
      const { data, error } = await sb
        .from("agendas")
        .select("id,nombre,instagram,closer,setter,calificacion,show,fecha_agenda,cuenta,fuente,ocupacion,manychat")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_agenda", `${start}T00:00:00`)
        .lte("fecha_agenda", `${end}T23:59:59`)
        .order("fecha_agenda", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const rows = (data || []).filter(deEmbudo).filter((r: any) => normalizeVolumenVal(field, r[field]) === value)
      return NextResponse.json({ kind: "agendas", rows })
    }

    if (key === "cash_calificacion") {
      const tier = searchParams.get("tier") || ""
      const closer = searchParams.get("closer") || ""
      if (!["S", "A", "B", "C"].includes(tier)) {
        return NextResponse.json({ error: "tier inválido" }, { status: 400 })
      }
      const label = `LEAD ${tier}`
      const { data, error } = await sb
        .from("pagos")
        .select("cliente,tipo,monto,fecha,closer,calificacion,person_id,telefono,fuente")
        .eq("record_status", "active")
        .eq("calificacion", label)
        .gte("fecha", start)
        .lte("fecha", end)
        .order("fecha", { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const closerKeyOf = (s: string) => (s || "").trim().split(/\s+/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      const closerTarget = closerKeyOf(closer)
      const rows = (data || [])
        .filter(pagoDeEmbudo)
        .filter(r => CASH_POR_CALL_TIPOS.has(r.tipo))
        .filter(r => !closer || closerKeyOf(r.closer || "") === closerTarget)
      return NextResponse.json({ kind: "pagos", rows })
    }

    const filterFn = PAGO_FILTERS[key]
    if (!filterFn) return NextResponse.json({ error: "key inválida" }, { status: 400 })

    const { data, error } = await sb
      .from("pagos")
      .select("cliente,tipo,monto,fecha,closer,operacion,person_id,telefono,fuente")
      .eq("record_status", "active")
      .gte("fecha", start)
      .lte("fecha", end)
      .order("fecha", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const rows = (data || []).filter(pagoDeEmbudo).filter(r => filterFn(r as PagoRow))
    return NextResponse.json({ kind: "pagos", rows })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
