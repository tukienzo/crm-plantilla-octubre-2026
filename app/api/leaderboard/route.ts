import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { applyStrikes, BECCU_TYPES, closerMidTarget, closerTopTarget, closerUnlockedRate, FECCU_TYPES, frontendCohort, setterUnlockedRate, withinSetterWindow } from "@/lib/commission-scheme"
import { META_CASH_MENSUAL } from "@/lib/brand"
import { FEE_TIPOS } from "@/lib/cash-collected"
import { FRONT_END_SALE_TYPES } from "@/lib/revenue"
import { CEO, esCalendarioGeneral, nombreCanonico } from "@/lib/equipo"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}

// CC Nuevo: cash de CLIENTE NUEVO (front end: fee + venta que da acceso).
// Las ventas internas/upsell (cliente que ya pagó) NO cuentan acá.
const CC_NUEVO_TIPOS = FECCU_TYPES

// Unidades: solo adquisiciones de cliente NUEVO (no fees, no ventas internas/upsell a cliente existente)
const UNIDAD_TIPOS = FRONT_END_SALE_TYPES

// Esquema anterior de comisiones: se aplica a los meses previos a agosto de
// 2026 (ver uses2026Scheme) para no recalcularlos con las reglas nuevas.
const LEGACY_CC_100 = new Set([
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)", "Venta Nueva Interna",
  "Venta Nueva Interna (Post Fee)",
  "Venta Interna", "Completó PIF", "Completó PIF (Post Fee)", "Fee", "Fee Venta Interna",
  "Refuerzo de Fee", "Adentro en Seguimiento", "Adentro en Seguimiento y Post Fee",
  "Upsell",
])
const LEGACY_CC_50 = new Set([
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5", "Cuota 6", "Cuota 7", "Cuota 8",
  "Cuota 9", "Cuota 10",
  "Cuota Venta Interna", "Completa Total (Post Venta)", "Completa Total y Finaliza Pago",
  "Completa Total + Acceso Acción",
  "Completó PIF + Acceso Total Consulting",
])

// Ex-integrantes que haya que ocultar del ranking a partir de un mes dado.
// Los que ya no están desaparecen solos cuando no tienen actividad en el mes,
// así que normalmente no hace falta listarlos.
const SETTERS_FUERA = new Set<string>()
const SETTERS_FUERA_DESDE = "2026-06"
const CLOSERS_FUERA = new Set<string>()
const CLOSERS_FUERA_DESDE = "2026-06"

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0]
}

// Metas personales por mes (clave = primer nombre en minúsculas, sin tildes).
// Vacío = sin metas por persona. Formato: { "AAAA-MM": { ana: 20000 } }.
const PERSONAL_MONTHLY_GOALS: Record<string, Record<string, number>> = {}

function personalMonthlyGoal(month: string, name: string): number | null {
  const key = firstWord(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return PERSONAL_MONTHLY_GOALS[month]?.[key] ?? null
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}
// Los apodos del equipo se configuran en lib/equipo.ts (NEXT_PUBLIC_CRM_ALIAS).
function canonical(name: string): string {
  return nombreCanonico(name)
}

// Closer de un pago o agenda. Lo que llega con el nombre del calendario general
// (por ejemplo, el nombre del negocio) no es una persona: queda sin closer,
// a menos que tenga un alias configurado en lib/equipo.ts.
function closerDe(raw: string | null | undefined): string {
  return esCalendarioGeneral(raw) ? "" : canonical(raw || "")
}

function isRealMember(name: string): boolean {
  const value = stripAccents(name).replace(/[^a-z0-9]+/g, " ").trim()
  return Boolean(value) && !["sin", "sin setter", "sin asignar", "sin asignado", "no setter"].includes(value)
}

// Fees (FEE_TIPOS, lib/cash-collected.ts): mismo concepto que usa Carga de
// Pagos / Pipeline para "seña". Back end upfront: lib/commission-scheme.ts.
const BECCU_TIPOS = BECCU_TYPES

function round2(n: number) { return Math.round(n * 100) / 100 }

// Cuando aplica, la base comisionable del closer descuenta la comisión de la
// plataforma de cobro (6 % aproximado). Ajustalo a tu plataforma.
const RATIO_NETO_PLATAFORMA = 0.94

function closerNetCommissionBase(amount: number, appliesPlatformDiscount: boolean) {
  if (!appliesPlatformDiscount || amount <= 0) return amount
  return amount * RATIO_NETO_PLATAFORMA
}

function closerLevel(rate: number): 1 | 2 | 3 { return rate >= 0.12 ? 3 : rate >= 0.11 ? 2 : 1 }
function setterLevel(rate: number): 1 | 2 | 3 { return rate >= 0.06 ? 3 : rate >= 0.055 ? 2 : 1 }

function identityKey(row: { person_id?: string | null; telefono?: string | null; cliente?: string | null }): string {
  if (row.person_id) return `p:${row.person_id}`
  const phone = String(row.telefono || "").replace(/\D/g, "")
  if (phone) return `t:${phone}`
  return `n:${stripAccents(String(row.cliente || "")).replace(/[^a-z0-9]/g, "")}`
}

function legacyCloserNivel(ccPond: number, tcAB: number, strikes: number): 1 | 2 | 3 {
  if (ccPond >= 20000 && tcAB >= 45 && strikes <= 1) return 3
  if (ccPond >= 10000 && tcAB >= 30 && strikes <= 2) return 2
  return 1
}

function legacyCloserRate(nivel: 1 | 2 | 3, strikes: number, teamCC: number): number {
  const base = nivel === 3 ? 0.10 : nivel === 2 ? 0.09 : 0.08
  if (nivel >= 2 && strikes <= 1 && teamCC >= 40000) return Math.min(base + 0.02, 0.12)
  if (nivel >= 2 && strikes <= 1 && teamCC >= 30000) return Math.min(base + 0.01, 0.12)
  return base
}

function legacySetterNivel(ccPond: number, tAgenda: number | null, strikes: number): 1 | 2 | 3 {
  if (tAgenda === null || tAgenda < 50) return 1
  if (ccPond >= 20000 && tAgenda >= 65 && strikes <= 1) return 3
  if (ccPond >= 10000 && tAgenda >= 80 && strikes <= 2) return 2
  return 1
}

function legacySetterRate(nivel: 1 | 2 | 3, strikes: number, teamCC: number): number {
  const base = nivel === 3 ? 0.05 : nivel === 2 ? 0.045 : 0.04
  if (nivel >= 2 && strikes <= 1 && teamCC >= 40000) return Math.min(base + 0.02, 0.065)
  if (nivel >= 2 && strikes <= 1 && teamCC >= 30000) return Math.min(base + 0.01, 0.065)
  return base
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get("month") || new Date().toISOString().slice(0, 7)
    // Meses anteriores a CRM_ESQUEMA_COMISIONES_DESDE (AAAA-MM) se calculan con el esquema anterior por niveles;
    // sin la variable, todos los meses usan el esquema por escalones de lib/commission-scheme.ts.
    const uses2026Scheme = month >= (process.env.CRM_ESQUEMA_COMISIONES_DESDE || "2000-01")
    const [year, mon] = month.split("-").map(Number)
    const start = `${month}-01`
    const end = `${month}-${String(new Date(year, mon, 0).getDate()).padStart(2, "0")}`
    // Límite superior exclusivo para las agendas: con `lte(end)` el timestamp 'YYYY-MM-31' es la medianoche y se perdía el último día.
    const nextStart = `${mon === 12 ? year + 1 : year}-${String(mon === 12 ? 1 : mon + 1).padStart(2, "0")}-01`

    const sb = getSupabase()

    // es_reactivacion es una columna nueva — si todavia no se corrio la
    // migracion, se reintenta sin ella para no romper el leaderboard entero.
    const paymentFields = "id,monto,tipo,operacion,closer,setter,es_reactivacion,fecha,person_id,telefono,cliente"
    const paymentFallbackFields = "id,monto,tipo,operacion,closer,setter,fecha,person_id,telefono,cliente"
    const pagosConReactivacion = await sb.from("pagos").select(paymentFields).eq("record_status", "active").gte("fecha", start).lte("fecha", end)
    const pagosRes = pagosConReactivacion.error?.code === "42703"
      ? await sb.from("pagos").select(paymentFallbackFields).eq("record_status", "active").gte("fecha", start).lte("fecha", end)
      : pagosConReactivacion
    const [
      { data: agendas, error: aErr },
      { data: strikesData },
      { data: csmMembers },
      { data: agendasLlamada, error: alErr },
    ] = await Promise.all([
      // Setters: agendas por fecha de RESERVA (su trabajo es agendar en el mes).
      sb.from("agendas").select("id,nombre,closer,setter,show,cerro,calificacion,estado,fecha_agenda").or("estado.is.null,estado.neq.Archivada manualmente").gte("fecha_agenda", start).lt("fecha_agenda", nextStart),
      sb.from("strikes").select("nombre,count,updated_at"),
      // El CSM sale de team_members (rol "CSM"): su cash cuenta como Back-End
      // con comisión flat, no entra al ranking de closers.
      sb.from("team_members").select("nombre").eq("rol", "CSM").eq("estado", "aprobado"),
      // Closers: llamadas por fecha de LLAMADA (fecha_closer). Por fecha de reserva, las agendadas a fin de mes
      // para el mes siguiente caerían en el mes equivocado.
      sb.from("agendas").select("id,nombre,closer,setter,show,cerro,calificacion,estado,fecha_agenda,fecha_closer")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .or(`and(fecha_closer.gte.${start},fecha_closer.lt.${nextStart}),and(fecha_closer.is.null,fecha_agenda.gte.${start},fecha_agenda.lt.${nextStart})`),
    ])
    const CSM_NOMBRES = new Set((csmMembers || []).map(m => canonical(m.nombre || "")).filter(Boolean))
    const { error: pErr } = pagosRes
    const pagos = (pagosRes.data || []).map((row) => ({
      ...row,
      es_reactivacion: "es_reactivacion" in row ? row.es_reactivacion : false,
    }))
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    if (alErr) return NextResponse.json({ error: alErr.message }, { status: 500 })

    // La ventana de comisión del setter se ancla al primer pago FE histórico
    // de cada cliente, no al tipo escrito manualmente en un pago posterior.
    // Supabase limita cada respuesta a 1.000 filas aunque se pida un limit
    // mayor: sin paginar, con más de 1.000 pagos históricos quedarían afuera
    // las identidades recientes. Se pagina explícitamente.
    const paymentHistory: Array<{ fecha: string | null; tipo: string | null; person_id: string | null; telefono: string | null; cliente: string | null }> = []
    for (let from = 0; ; from += 1000) {
      const { data: page, error: historyError } = await sb
        .from("pagos")
        .select("fecha,tipo,person_id,telefono,cliente")
        .eq("record_status", "active")
        .not("fecha", "is", null)
        .order("fecha", { ascending: true })
        .range(from, from + 999)
      if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 })
      paymentHistory.push(...(page || []))
      if (!page || page.length < 1000) break
    }
    const firstFrontendPayment = new Map<string, string>()
    for (const payment of paymentHistory) {
      if (!frontendCohort(payment.tipo)) continue
      const key = identityKey(payment)
      if (!firstFrontendPayment.has(key) && payment.fecha) firstFrontendPayment.set(key, payment.fecha)
    }

    // Conversaciones asignadas per setter
    const convAsigMap = new Map<string, number>()
    try {
      const { data: convData } = await sb
        .from("metricas_manual")
        .select("persona,valor")
        .eq("mes", month)
        .eq("tipo", "conversaciones_asignadas")
      for (const row of convData || []) {
        convAsigMap.set(firstWord(row.persona), row.valor || 0)
      }
    } catch {
      // table may not exist yet — skip silently
    }

    const strikesMap = new Map<string, number>()
    for (const s of strikesData || []) {
      // Los strikes son mensuales y se reinician el día 1. La tabla histórica
      // conserva el último contador; solo aplica si fue actualizado dentro del
      // mes seleccionado. Así un strike de julio no reduce agosto.
      const strikeMonth = s.updated_at ? String(s.updated_at).slice(0, 7) : ""
      strikesMap.set(firstWord(s.nombre), strikeMonth === month ? (s.count ?? 0) : 0)
    }

    // cc_ponderado es igual a cc_total: el CRM opera una sola cuenta de negocio
    // y no pondera el cash por cuenta. Se conserva el campo porque el esquema
    // anterior de niveles (antes de agosto de 2026) lo lee.
    type DetallePagoCloser = {
      id?: string | number
      cliente: string
      monto: number
      tipo: string
      operacion?: string | null
      fecha: string | null
      closer?: string | null
      setter?: string | null
      cohort?: string | null
      comisionable: number
      es_unidad: boolean
    }
    type DetalleLlamadaCloser = {
      id?: string | number
      nombre: string
      fecha_agenda: string | null
      show: boolean
      cerro: boolean
      calificacion?: string | null
      estado?: string | null
      closer?: string | null
      setter?: string | null
    }

    type DetallePagoSetter = {
      id?: string | number
      cliente: string
      monto: number
      tipo: string
      operacion?: string | null
      fecha: string | null
      closer?: string | null
      cohort?: string | null
      comisionable: number
      en_ventana: boolean
      es_unidad: boolean
    }
    type DetalleAgendaSetter = {
      id?: string | number
      nombre: string
      fecha_agenda: string | null
      show: boolean
      cerro: boolean
      calificacion?: string | null
      estado?: string | null
      closer?: string | null
    }

    type CM = {
      cc_nuevo: number; cc_total: number; commission_base: number; cc_ponderado: number; feccu: number; feccpp: number; unidades: number; fees: number
      llamadas: number; cerradas: number; total_ag: number; pres_ab: number; cerr_ab: number
      detalles_pagos: DetallePagoCloser[]
      detalles_llamadas: DetalleLlamadaCloser[]
    }
    type SM = {
      cc_nuevo: number; cc_total: number; cc_ponderado: number; feccu: number; feccpp: number; feccpp_excluido: number; unidades: number; fees: number
      agendas: number; agendas_ab: number; shows: number
      detalles_pagos: DetallePagoSetter[]
      detalles_agendas: DetalleAgendaSetter[]
    }

    const closerMap = new Map<string, CM>()
    const setterMap = new Map<string, SM>()
    let csmCc = 0
    let teamFeccu = 0
    let teamFeccpp = 0
    let teamBeccu = 0
    const teamDetallesPagos: DetallePagoCloser[] = []
    const teamDetallesAgendas: DetalleLlamadaCloser[] = []

    // El CEO también cierra. Debe permanecer visible en el ranking aun cuando
    // en el mes seleccionado todavía no tenga pagos o llamadas. El resto del
    // equipo aparece solo con actividad real en el mes (ver filtros abajo).
    closerMap.set(CEO, { cc_nuevo: 0, cc_total: 0, commission_base: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, unidades: 0, fees: 0, llamadas: 0, cerradas: 0, total_ag: 0, pres_ab: 0, cerr_ab: 0, detalles_pagos: [], detalles_llamadas: [] })

    for (const pago of pagos || []) {
      const closer = closerDe(pago.closer)
      const setter = canonical(pago.setter || "")
      const monto = pago.monto || 0
      const tipo = pago.tipo || ""
      const cohort = frontendCohort(tipo)
      if (cohort === "FECCU") teamFeccu += monto
      if (cohort === "FECCPP") teamFeccpp += monto
      if (BECCU_TIPOS.has(tipo)) teamBeccu += monto
      const isReactivation = !!pago.es_reactivacion
      const legacy100 = LEGACY_CC_100.has(tipo)
      const legacy50 = LEGACY_CC_50.has(tipo)
      const closerCommissionableCc = uses2026Scheme
        ? cohort ? monto : 0
        : (legacy100 || isReactivation) ? monto : legacy50 ? monto * 0.5 : 0
      const setterWindow = cohort && withinSetterWindow(pago.fecha, firstFrontendPayment.get(identityKey(pago)))
      const setterCommissionableCc = uses2026Scheme
        ? setterWindow ? monto : 0
        : legacy100 ? monto : legacy50 ? monto * 0.5 : 0

      if (CSM_NOMBRES.has(closer)) { csmCc += monto; continue }

      const pagoItem: DetallePagoCloser = {
        id: (pago as any).id,
        cliente: (pago as any).cliente || (pago as any).nombre || "Cliente",
        monto,
        tipo,
        operacion: (pago as any).operacion || null,
        fecha: (pago as any).fecha || null,
        closer: closer || null,
        setter: (pago as any).setter || null,
        cohort: cohort || null,
        comisionable: closerCommissionableCc,
        es_unidad: UNIDAD_TIPOS.has(tipo),
      }
      teamDetallesPagos.push(pagoItem)

      if (isRealMember(closer)) {
        if (!closerMap.has(closer)) closerMap.set(closer, { cc_nuevo: 0, cc_total: 0, commission_base: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, unidades: 0, fees: 0, llamadas: 0, cerradas: 0, total_ag: 0, pres_ab: 0, cerr_ab: 0, detalles_pagos: [], detalles_llamadas: [] })
        const c = closerMap.get(closer)!
        c.cc_total += closerCommissionableCc
        c.commission_base += closerNetCommissionBase(closerCommissionableCc, uses2026Scheme)
        c.cc_ponderado += closerCommissionableCc
        if (cohort === "FECCU") c.feccu += monto
        if (cohort === "FECCPP") c.feccpp += monto
        if (CC_NUEVO_TIPOS.has(tipo)) c.cc_nuevo += monto
        if (UNIDAD_TIPOS.has(tipo)) c.unidades++
        if (FEE_TIPOS.has(tipo)) c.fees++
        c.detalles_pagos.push(pagoItem)
      }

      if (isRealMember(setter)) {
        if (!setterMap.has(setter)) setterMap.set(setter, { cc_nuevo: 0, cc_total: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, feccpp_excluido: 0, unidades: 0, fees: 0, agendas: 0, agendas_ab: 0, shows: 0, detalles_pagos: [], detalles_agendas: [] })
        const s = setterMap.get(setter)!
        s.cc_total += setterCommissionableCc
        s.cc_ponderado += setterCommissionableCc
        if (setterWindow && cohort === "FECCU") s.feccu += monto
        if (setterWindow && cohort === "FECCPP") s.feccpp += monto
        if (!setterWindow && cohort === "FECCPP") s.feccpp_excluido += monto
        if (CC_NUEVO_TIPOS.has(tipo)) s.cc_nuevo += monto
        if (UNIDAD_TIPOS.has(tipo)) s.unidades++
        if (FEE_TIPOS.has(tipo)) s.fees++
        s.detalles_pagos.push({
          id: (pago as any).id,
          cliente: (pago as any).cliente || (pago as any).nombre || "Cliente",
          monto,
          tipo,
          operacion: (pago as any).operacion || null,
          fecha: (pago as any).fecha || null,
          closer: closerDe((pago as any).closer) || null,
          cohort: cohort || null,
          comisionable: setterCommissionableCc,
          en_ventana: Boolean(setterWindow),
          es_unidad: UNIDAD_TIPOS.has(tipo),
        })
      }
    }

    const CALIFS_AB = new Set(["S", "A", "B", "C", "LEAD A", "LEAD B", "LEAD C"])  // S, A, B y C califican; D no

    const ahoraMs = Date.now()
    for (const ag of agendasLlamada || []) {
      const closerNorm = closerDe(ag.closer)
      // Las llamadas que todavía no pasaron no cuentan para el show up del closer.
      const cuando = Date.parse(`${String(ag.fecha_closer || ag.fecha_agenda || "").replace(" ", "T")}Z`)
      if (Number.isFinite(cuando) && cuando > ahoraMs && !ag.show) continue

      const agItem: DetalleLlamadaCloser = {
        id: (ag as any).id,
        nombre: (ag as any).nombre || (ag as any).cliente || "Lead",
        fecha_agenda: (ag as any).fecha_agenda || null,
        show: Boolean(ag.show),
        cerro: Boolean(ag.cerro),
        calificacion: ag.calificacion || null,
        estado: ag.estado || null,
        closer: closerNorm || null,
        setter: (ag as any).setter || null,
      }
      if (isRealMember(closerNorm)) {
        if (!closerMap.has(closerNorm)) closerMap.set(closerNorm, { cc_nuevo: 0, cc_total: 0, commission_base: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, unidades: 0, fees: 0, llamadas: 0, cerradas: 0, total_ag: 0, pres_ab: 0, cerr_ab: 0, detalles_pagos: [], detalles_llamadas: [] })
        const c = closerMap.get(closerNorm)!
        c.total_ag++
        if (ag.show) {
          c.llamadas++
          if (ag.cerro) c.cerradas++
          if (CALIFS_AB.has(ag.calificacion || "")) {
            c.pres_ab++
            if (ag.cerro) c.cerr_ab++
          }
        }
        c.detalles_llamadas.push(agItem)
      }
    }

    for (const ag of agendas || []) {
      const closerEquipo = closerDe(ag.closer)
      const setter = canonical(ag.setter || "")
      teamDetallesAgendas.push({
        id: (ag as any).id,
        nombre: (ag as any).nombre || (ag as any).cliente || "Lead",
        fecha_agenda: (ag as any).fecha_agenda || null,
        show: Boolean(ag.show),
        cerro: Boolean(ag.cerro),
        calificacion: ag.calificacion || null,
        estado: ag.estado || null,
        closer: closerEquipo || null,
        setter: (ag as any).setter || null,
      })

      if (isRealMember(setter)) {
        if (!setterMap.has(setter)) setterMap.set(setter, { cc_nuevo: 0, cc_total: 0, cc_ponderado: 0, feccu: 0, feccpp: 0, feccpp_excluido: 0, unidades: 0, fees: 0, agendas: 0, agendas_ab: 0, shows: 0, detalles_pagos: [], detalles_agendas: [] })
        const s = setterMap.get(setter)!
        s.agendas++
        if (ag.show) {
          s.shows++
          // Solo cuenta calificadas (A/B/C) sobre llamadas que se presentaron
          if (CALIFS_AB.has(ag.calificacion || "")) s.agendas_ab++
        }
        s.detalles_agendas.push({
          id: (ag as any).id,
          nombre: (ag as any).nombre || (ag as any).cliente || "Lead",
          fecha_agenda: (ag as any).fecha_agenda || null,
          show: Boolean(ag.show),
          cerro: Boolean(ag.cerro),
          calificacion: ag.calificacion || null,
          estado: ag.estado || null,
          closer: closerDe((ag as any).closer) || null,
        })
      }
    }

    const teamCCTotal = Array.from(closerMap.values()).reduce((sum, c) => sum + c.cc_total, 0)
    const legacyTeamCC = Array.from(closerMap.values()).reduce((sum, c) => sum + c.cc_ponderado, 0)
    const topCloser = Array.from(closerMap.entries()).sort((a, b) => b[1].cc_total - a[1].cc_total || b[1].feccu - a[1].feccu)[0]?.[0]
    const topSetter = Array.from(setterMap.entries()).sort((a, b) => b[1].cc_total - a[1].cc_total || b[1].feccu - a[1].feccu)[0]?.[0]

    const closers = Array.from(closerMap.entries())
      .map(([nombre, d]) => {
        const strikes = strikesMap.get(nombre) ?? 0
        const tcAB = d.pres_ab > 0 ? round2((d.cerr_ab / d.pres_ab) * 100) : 0
        const legacyNivel = legacyCloserNivel(d.cc_ponderado, tcAB, strikes)
        const unlockedRate = uses2026Scheme ? closerUnlockedRate(d.cc_total, nombre === topCloser, month) : legacyCloserRate(legacyNivel, strikes, legacyTeamCC)
        const rate = uses2026Scheme ? applyStrikes(unlockedRate, strikes, 0.08) : unlockedRate
        const nivel = uses2026Scheme ? closerLevel(unlockedRate) : legacyNivel
        const midCloser = closerMidTarget(month)
        const nextTarget = midCloser > 0 && d.cc_total < midCloser ? midCloser : closerTopTarget(month)
        const nextRate = midCloser > 0 && d.cc_total < midCloser ? 11 : 12
        return {
          nombre, initials: getInitials(nombre),
          cc_nuevo: round2(d.cc_nuevo), cc_total: round2(d.cc_total), cc_ponderado: round2(d.cc_ponderado),
          feccu: round2(d.feccu), feccpp: round2(d.feccpp), commissionable_cc: round2(d.commission_base),
          unidades: d.unidades, fees: d.fees, llamadas: d.llamadas, cerradas: d.cerradas,
          tasa_cierre: d.llamadas > 0 ? round2((d.unidades / d.llamadas) * 100) : 0,
          tc_ab: tcAB, aov: d.unidades > 0 ? round2(d.cc_nuevo / d.unidades) : 0,
          show_up: d.total_ag > 0 ? round2((d.llamadas / d.total_ag) * 100) : 0,
          nivel, rate: round2(rate * 100), unlocked_rate: round2(unlockedRate * 100), strikes,
          is_top: nombre === topCloser, next_target: nextTarget, next_rate: nextRate,
          personal_goal: personalMonthlyGoal(month, nombre),
          comisiones: round2((uses2026Scheme ? d.commission_base : d.cc_ponderado) * rate),
          detalles_pagos: d.detalles_pagos.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")),
          detalles_llamadas: d.detalles_llamadas.sort((a, b) => (b.fecha_agenda || "").localeCompare(a.fecha_agenda || "")),
        }
      })
      .filter(c => isRealMember(c.nombre) && !esCalendarioGeneral(c.nombre) && (c.nombre === CEO || c.personal_goal || c.cc_total > 0 || c.llamadas > 0) && !(month >= CLOSERS_FUERA_DESDE && CLOSERS_FUERA.has(c.nombre)))
      .sort((a, b) => b.cc_total - a.cc_total || Number(Boolean(b.personal_goal)) - Number(Boolean(a.personal_goal)) || b.feccu - a.feccu)

    const setters = Array.from(setterMap.entries())
      .map(([nombre, d]) => {
        const strikes = strikesMap.get(nombre) ?? 0
        const convAsig = convAsigMap.get(nombre) ?? 0
        // T. Agenda = total agendas / conversaciones asignadas (per user definition)
        const t_agenda = convAsig > 0 ? round2((d.agendas / convAsig) * 100) : null
        const legacyNivel = legacySetterNivel(d.cc_ponderado, t_agenda, strikes)
        const unlockedRate = uses2026Scheme ? setterUnlockedRate(d.cc_total, nombre === topSetter) : legacySetterRate(legacyNivel, strikes, legacyTeamCC)
        const rate = uses2026Scheme ? applyStrikes(unlockedRate, strikes, 0.04) : unlockedRate
        const nivel = uses2026Scheme ? setterLevel(unlockedRate) : legacyNivel
        const midSetter = Math.round(META_CASH_MENSUAL * 0.5), metaTopSetter = Math.round(META_CASH_MENSUAL * 0.6)
        const nextTarget = midSetter > 0 && d.cc_total < midSetter ? midSetter : metaTopSetter
        const nextRate = midSetter > 0 && d.cc_total < midSetter ? 5.5 : 6
        return {
          nombre, initials: getInitials(nombre),
          cc_nuevo: round2(d.cc_nuevo), cc_total: round2(d.cc_total), cc_ponderado: round2(d.cc_ponderado),
          feccu: round2(d.feccu), feccpp: round2(d.feccpp), feccpp_excluido: round2(d.feccpp_excluido), commissionable_cc: round2(d.cc_total),
          unidades: d.unidades, fees: d.fees, agendas: d.agendas, agendas_ab: d.agendas_ab,
          t_agenda,
          show_up: d.agendas > 0 ? round2((d.shows / d.agendas) * 100) : 0,
          nivel, rate: round2(rate * 100), unlocked_rate: round2(unlockedRate * 100), strikes,
          is_top: nombre === topSetter, next_target: nextTarget, next_rate: nextRate,
          personal_goal: personalMonthlyGoal(month, nombre),
          comisiones: round2((uses2026Scheme ? d.cc_total : d.cc_ponderado) * rate),
          detalles_pagos: d.detalles_pagos.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")),
          detalles_agendas: d.detalles_agendas.sort((a, b) => (b.fecha_agenda || "").localeCompare(a.fecha_agenda || "")),
        }
      })
      .filter(s => isRealMember(s.nombre) && (s.personal_goal || s.cc_total > 0 || s.agendas > 0) && !(month >= SETTERS_FUERA_DESDE && SETTERS_FUERA.has(s.nombre)))
      .sort((a, b) => b.cc_total - a.cc_total || b.feccu - a.feccu)

    // CSM: 5 % fijo sobre el cash de back end
    const csmComision = round2(csmCc * 0.05)

    return NextResponse.json({
      closers,
      setters,
      csm_nombres: [...CSM_NOMBRES],
      csm_cc: round2(csmCc),
      csm_comision: csmComision,
      team_cc_total: round2(teamCCTotal),
      team_feccu: round2(teamFeccu),
      team_feccpp: round2(teamFeccpp),
      team_beccu: round2(teamBeccu),
      team_cc_pond: round2(teamCCTotal),
      team_detalles_pagos: teamDetallesPagos.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")),
      team_detalles_agendas: teamDetallesAgendas.sort((a, b) => (b.fecha_agenda || "").localeCompare(a.fecha_agenda || "")),
      scheme: {
        closer_top_target: closerTopTarget(month), closer_mid_target: closerMidTarget(month),
        setter_top_target: Math.round(META_CASH_MENSUAL * 0.6), setter_mid_target: Math.round(META_CASH_MENSUAL * 0.5), setter_window_days: 30,
      },
    })
  } catch {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
