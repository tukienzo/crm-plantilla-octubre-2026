import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { getMetaSpend } from "@/lib/meta-spend"
import { BECCPP_TYPES, BECCU_TYPES, FECCPP_TYPES, FECCU_TYPES, frontendCohort, withinSetterWindow } from "@/lib/commission-scheme"
import { ALL_SALE_TYPES, BACK_END_SALE_TYPES, CLOSED_IN_CALL_TYPES, FRONT_END_SALE_TYPES } from "@/lib/revenue"
import { FEE_TIPOS, FRONT_END_FEE_TIPOS } from "@/lib/cash-collected"
import { nombreCanonico } from "@/lib/equipo"
import { BRAND } from "@/lib/brand"
import { armarEnlazador, cargarAgendasEnlace, embudoDe, EMBUDOS, leerEmbudos, nombreEmbudos, type Embudo } from "@/lib/embudo-atribucion"
import { gastoAdsPorEmbudo } from "@/lib/ads-embudos"
import { seguidoresPeriodo } from "@/lib/seguidores"
import { semanasDelMes } from "@/lib/semanas"

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
  return createClient(url, key)
}


// Setters que ya no trabajan con el equipo — se excluyen de la tabla de
// Setting (conversaciones asignadas) en los meses indicados, sin tocar las
// agendas historicas reales (esos registros siguen intactos en la base).
// Los setters que ya no están no tienen conversaciones asignadas en los meses
// en que ya no setean, así que normalmente no hace falta excluirlos a mano.
// Se deja el mecanismo por si hiciera falta. Formato: { "AAAA-MM": ["Ana"] }.
const SETTERS_EXCLUIDOS: Record<string, string[]> = {}
// Personas que no son setters activos. Sus registros históricos permanecen
// intactos para auditoría, pero nunca deben aparecer en la tabla de Setting.
const SETTERS_NO_ACTIVOS = new Set<string>()

// Closers que ya no son closers activos — se sacan de la tabla de Cash
// Collected por Closer para siempre, sin tocar sus pagos/agendas historicos
// (esos registros siguen intactos en la base, solo se ocultan de este cuadro).
// Claves en minúsculas y sin tildes (ver closerKey). El CEO también puede cerrar.
const CLOSERS_EXCLUIDOS = new Set<string>()

// Definición operativa: una agenda calificada es LEAD S, A, B o C; LEAD D no.
const CALIFS_AB = new Set(["S", "A", "B", "C", "LEAD A", "LEAD B", "LEAD C"])

// Conjuntos compartidos (lib/commission-scheme.ts, lib/revenue.ts,
// lib/cash-collected.ts) con el vocabulario de pagos del CRM.
const FECCU_TIPOS = FECCU_TYPES
const FECCP_TIPOS = FECCPP_TYPES
const BECCU_TIPOS = BECCU_TYPES
const BECCPP_TIPOS = BECCPP_TYPES
// Cierres = pagos que dan acceso (FE + BE). Un Fee no es cierre.
const CIERRES_TIPOS = ALL_SALE_TYPES
// Revenue contractual de ventas nuevas externas (front end: fee + venta que
// da acceso). Se conserva como métrica separada, pero NO es la base del ROAS.
const VENTA_NUEVA_EXTERNA = FECCU_TYPES
const CALIFS_SABCD = ["S", "A", "B", "C", "D"]

function r2(n: number) { return Math.round(n * 100) / 100 }
function pct(a: number, b: number): number | null { return b > 0 ? r2((a / b) * 100) : null }
function firstWord(s: string) { return (s || "").trim().split(/\s+/)[0] }
function identityKey(row: { person_id?: string | null; telefono?: string | null; cliente?: string | null }): string {
  if (row.person_id) return `p:${row.person_id}`
  const phone = String(row.telefono || "").replace(/\D/g, "")
  if (phone) return `t:${phone}`
  const name = String(row.cliente || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return `n:${name}`
}
type PagoBucket = { tipo?: string | null; operacion?: string | null }
function isBackendContext(p: PagoBucket) {
  return BECCU_TIPOS.has(p.tipo || "")
    || BECCPP_TIPOS.has(p.tipo || "")
}
function isBeccpp(p: PagoBucket) { return BECCPP_TIPOS.has(p.tipo || "") }
function isBeccu(p: PagoBucket) { return isBackendContext(p) && !isBeccpp(p) }

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

// iClosed persiste fecha_agenda en UTC sin sufijo de zona. Los cortes de las
// semanas comerciales se interpretan en Argentina (UTC-3), no a medianoche UTC.
function argentinaAgendaBoundary(date: string, end = false): string {
  return new Date(`${date}T${end ? "23:59:59" : "00:00:00"}-03:00`).toISOString().slice(0, 19)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    const mes = searchParams.get("month") || currentMes
    const weekIdx = parseInt(searchParams.get("week") || "0")

    // Vista General filtra por rango libre (hoy, esta semana, rango custom,
    // etc.) en vez de mes+semana fijos — si vienen start/end directos, se usan
    // tal cual en lugar de derivarlos de mes+semana.
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")
    const { start, end } = (startParam && endParam) ? { start: startParam, end: endParam } : getDateRange(mes, weekIdx)
    const sb = getSupabase()
    // ?embudo=Webinar|Orgánico|Outbound|Sin fuente, uno o varios separados por coma: todo se recorta a esos embudos
    // (misma regla que Ventas → Embudos). Agendas por su fuente; pagos y planes por la agenda del cliente. Con varios
    // (por ejemplo, orgánico y outbound juntos), se suman y las tasas salen de los totales. Sin el parámetro, todos.
    const embudos = leerEmbudos(searchParams.get("embudo"))
    const embudo = nombreEmbudos(embudos)
    const enEmb = (e: Embudo) => !embudos || embudos.includes(e)

    const [
      { data: pagos, error: pErr },
      { data: planesRaw, error: plansErr },
      { data: agendasRaw, error: aErr },
      { data: agendasSetterRaw, error: asErr },
      metaSpend,
    ] = await Promise.all([
      sb.from("pagos").select("fecha,cliente,tipo,operacion,ppp,monto,closer,setter,calificacion,person_id,telefono,fuente").eq("record_status", "active").gte("fecha", start).lte("fecha", end),
      // Fuente de verdad igual a producción: contrato estructurado cargado en
      // el período, sumando los ítems del plan, estén pagos o pendientes.
      sb.from("planes_pago")
        .select("id,person_id,telefono,fecha_alta,created_at,plan_pago_items(monto,concepto)")
        .gte("created_at", `${start}T00:00:00`)
        .lte("created_at", `${end}T23:59:59.999`),
      sb.from("agendas")
        .select("id,person_id,telefono,cuenta,fuente,closer,setter,show,estado,calificacion,fecha_closer,created_at,call_confirmer,calificaba_realmente")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_closer", `${start}T00:00:00`)
        .lte("fecha_closer", `${end}T23:59:59`),
      // Setting (agendas por setter) y Volumen (cuenta/fuente/ocupacion/manychat)
      // se miden por fecha_agenda (cuando se agendo), no por fecha_closer (cuando
      // cae la llamada) — asi coincide con como lo mide la planilla de setting y evita que
      // agendas de fin de mes "salten" al mes siguiente.
      sb.from("agendas")
        .select("id,person_id,nombre,telefono,setter,cuenta,fuente,ocupacion,manychat,calificacion,estado,fecha_agenda")
        .or("estado.is.null,estado.neq.Archivada manualmente")
        .gte("fecha_agenda", argentinaAgendaBoundary(start))
        .lte("fecha_agenda", argentinaAgendaBoundary(end, true)),
      getMetaSpend(start, end),
    ])

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
    if (plansErr) return NextResponse.json({ error: plansErr.message }, { status: 500 })
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    if (asErr) return NextResponse.json({ error: asErr.message }, { status: 500 })

    // El CRM opera una sola cuenta de negocio: se toman todos los pagos (o los del embudo elegido).
    // El enlace pago → embudo se arma siempre: ROAS y CAC se calculan embudo por embudo y nunca se mezclan.
    const enlace = armarEnlazador(await cargarAgendasEnlace(sb))
    const p = (pagos || []).filter((x) => enEmb(enlace.embudoDePago(x)))
    // Inversión en Meta separada por embudo, campaña por campaña (lib/ads-embudos.ts decide a qué embudo va cada
    // campaña). Con embudo elegido, la inversión es la de ese
    // embudo; sin embudo, la de toda la cuenta (solo como total: el ROAS y el CAC van por embudo en `por_embudo`).
    const gastoEmbudos = await gastoAdsPorEmbudo(sb, start, end).catch(() => null)
    // costo por seguidor del período (gasto de las campañas del embudo orgánico ÷ seguidores nuevos de ManyChat)
    const seguidoresP = seguidoresPeriodo(sb, start, end).catch(() => null)
    if (embudos) Object.assign(metaSpend, gastoEmbudos
      ? { spend: r2(embudos.reduce((s, e) => s + (gastoEmbudos[e] || 0), 0)), available: true, source: "meta", estimated: false }
      : { spend: 0, available: false, source: "unavailable", estimated: false })

    // La ventana del setter se cuenta desde el primer pago frontend histórico
    // de cada cliente, aunque el período visible empiece después.
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
    // Deduplicación por identidad para que ninguna métrica cuente con leads duplicados
    const closingAgendaSeen = new Set<string>()
    const a = (agendasRaw || []).filter((agenda: any) => {
      const phone = String(agenda.telefono || "").replace(/\D/g, "")
      const identity = agenda.person_id ? `person:${agenda.person_id}` : phone && phone.length >= 7 ? `phone:${phone}` : `id:${agenda.id}`
      if (closingAgendaSeen.has(identity)) return false
      closingAgendaSeen.add(identity)
      return true
    }).filter((x) => enEmb(embudoDe(x.fuente)))
    const setterAgendaSeen = new Set<string>()
    // primero se sacan los repetidos (mismo setter + misma persona) y después se recorta al embudo: así los embudos suman el total
    const aBySetterFecha = (agendasSetterRaw || []).filter((agenda: any) => {
      const phone = String(agenda.telefono || "").replace(/\D/g, "")
      const name = String(agenda.nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
      const identity = agenda.person_id ? `person:${agenda.person_id}` : phone ? `phone:${phone}` : `name:${name}`
      const key = `${firstWord(agenda.setter || "").toLowerCase()}:${identity}`
      if (setterAgendaSeen.has(key)) return false
      setterAgendaSeen.add(key)
      return true
    }).filter((agenda: any) => enEmb(embudoDe(agenda.fuente)))
    const planes = (planesRaw || []).filter((plan: any) => enEmb(enlace.embudoDePago({ person_id: plan.person_id, telefono: plan.telefono, fecha: plan.fecha_alta || plan.created_at })))
    const revenue = r2(planes.reduce((total, plan: any) =>
      total + (plan.plan_pago_items || []).reduce(
        (subtotal: number, item: any) => subtotal + Number(item.monto || 0),
        0,
      ), 0))
    const ventas_nuevas_revenue = r2(planes.reduce((total, plan: any) =>
      total + (plan.plan_pago_items || []).reduce(
        (subtotal: number, item: any) =>
          subtotal + (VENTA_NUEVA_EXTERNA.has(item.concepto || "") ? Number(item.monto || 0) : 0),
        0,
      ), 0))
    // FUNNEL
    const total_agendas = a.length
    const calificadas = a.filter(x => CALIFS_AB.has(x.calificacion || "")).length
    const nowMs = Date.now()
    // `show=null` no equivale a no-show, pero tampoco se puede excluir del
    // denominador una vez que la llamada ya ocurrió: eso infla artificialmente
    // el show. Las llamadas ocurridas sin resultado se exponen por separado.
    const callsOccurred = a.filter(x => {
      const scheduled = x.fecha_closer ? new Date(x.fecha_closer).getTime() : NaN
      return Number.isFinite(scheduled) && scheduled <= nowMs
    })
    const presentadas = callsOccurred.filter(x => x.show === true).length
    const calificadasOcurridas = callsOccurred.filter(x => CALIFS_AB.has(x.calificacion || ""))
    const calif_presentadas = calificadasOcurridas.filter(x => x.show === true).length
    const cierres = p.filter(x => CIERRES_TIPOS.has(x.tipo)).length
    const cierres_fe = p.filter(x => FRONT_END_SALE_TYPES.has(x.tipo)).length
    const cierres_be = p.filter(x => BACK_END_SALE_TYPES.has(x.tipo)).length
    // Cerro en la llamada original (Venta Nueva) vs cerro despues via seguimiento
    // (Adentro en Seguimiento / Completó PIF / venta interna, que siempre se
    // cierran aparte).
    const cierres_llamada = p.filter(x => CLOSED_IN_CALL_TYPES.has(x.tipo)).length
    const cierres_seguimiento = p.filter(x => CIERRES_TIPOS.has(x.tipo) && !CLOSED_IN_CALL_TYPES.has(x.tipo)).length

    // PAGOS TOTALES vs UNIDADES CERRADAS: dos formas distintas de medir "tasa
    // de cierre". Pagos totales = Unidades Cerradas + Fees (fees SI cuentan
    // porque son el pago del día 1, ligado a la llamada) — pero NO cuotas,
    // que se cobran después sin que exista una llamada nueva ese período.
    // Unidades cerradas = solo gente que efectivamente entró al programa
    // (Venta Nueva / Adentro en Seguimiento / Completó PIF / Interna), FE + BE combinados.
    const unidades_cerradas = cierres
    const PAGOS_TOTALES_TIPOS = new Set([...CIERRES_TIPOS, ...FEE_TIPOS])
    const pagos_totales = p.filter(x => PAGOS_TOTALES_TIPOS.has(x.tipo)).length

    // No shows: call_confirmer distingue por que no hubo show.
    // Cancelado es un resultado válido: no es no-show ni resultado pendiente.
    const noShows = callsOccurred.filter(x => x.show !== true && x.estado !== "Cancelado")
    const canceladas_triage = noShows.filter(x => (x.call_confirmer || "").includes("Triage")).length
    const canceladas_triage_calif = noShows.filter(x =>
      CALIFS_AB.has(x.calificacion || "") && (x.call_confirmer || "").includes("Triage")
    ).length
    const no_response = noShows.filter(x => x.call_confirmer === "No Respondió").length
    const no_show = noShows.filter(x =>
      x.show === false
      && x.call_confirmer !== "No Respondió"
      && !(x.call_confirmer || "").includes("Triage")
    ).length
    const sin_resultado = callsOccurred.filter(x => x.show == null
      && x.estado !== "Cancelado"
      && x.call_confirmer !== "No Respondió"
      && !(x.call_confirmer || "").includes("Triage")
    ).length

    // Calificaban de verdad audita exclusivamente si el scoring S/A/B estuvo
    // bien asignado. C/D no entran: ya estaban declaradas como no calificadas.
    const presentadasArr = callsOccurred.filter(x => x.show === true && CALIFS_AB.has(x.calificacion || ""))
    const con_calificaba_realmente = presentadasArr.filter(x => x.calificaba_realmente === "Si" || x.calificaba_realmente === "No").length
    const calificaron_si_realmente = presentadasArr.filter(x => x.calificaba_realmente === "Si").length

    // CASH
    const feccuDe = (lista: typeof p) => r2(lista.filter(x => !isBackendContext(x) && FECCU_TIPOS.has(x.tipo)).reduce((s, x) => s + (x.monto || 0), 0))
    const feccu = feccuDe(p)
    // Definición: ROAS usa solo FECCU efectivamente cobrado en el período.
    // No entran cuotas/FECCP, ventas internas/backend ni revenue contractual pendiente.
    // El ROAS y el CAC no se mezclan entre embudos. Sin embudo elegido no hay un ROAS "de todo":
    // cada embudo tiene el suyo en `por_embudo` (su FECCU sobre lo invertido en sus campañas). Con varios embudos
    // elegidos a propósito, el ROAS es el de esa combinación: su FECCU sobre lo invertido en sus campañas.
    const roas = embudo && metaSpend.available && metaSpend.spend > 0 ? r2(feccu / metaSpend.spend) : null
    const por_embudo = Object.fromEntries(EMBUDOS.map((e) => {
      const pe = (pagos || []).filter((x) => enlace.embudoDePago(x) === e)
      const inversion = gastoEmbudos ? r2(gastoEmbudos[e] || 0) : null
      const feccuE = feccuDe(pe)
      const cierresE = pe.filter(x => FRONT_END_SALE_TYPES.has(x.tipo)).length
      return [e, {
        inversion, feccu: feccuE, cierres_fe: cierresE,
        roas: inversion ? r2(feccuE / inversion) : null,
        cac: inversion && cierresE > 0 ? r2(inversion / cierresE) : null,
      }]
    })) as Record<string, { inversion: number | null; feccu: number; cierres_fe: number; roas: number | null; cac: number | null }>
    const feccp = r2(p.filter(x => !isBackendContext(x) && FECCP_TIPOS.has(x.tipo)).reduce((s, x) => s + (x.monto || 0), 0))
    const beccu = r2(p.filter(isBeccu).reduce((s, x) => s + (x.monto || 0), 0))
    const beccpp = r2(p.filter(isBeccpp).reduce((s, x) => s + (x.monto || 0), 0))
    const cc_total = r2(feccu + feccp + beccu + beccpp)

    const fees_arr = p.filter(x => FRONT_END_FEE_TIPOS.has(x.tipo))
    const fees_sum = r2(fees_arr.reduce((s, x) => s + (x.monto || 0), 0))

    // AOV día 1 = lo que se cobra en la llamada misma: Venta Nueva o Fee.
    const aov_d1_arr = p.filter(x => CLOSED_IN_CALL_TYPES.has(x.tipo) || x.tipo === "Fee")
    const aov_dia1 = aov_d1_arr.length > 0
      ? r2(aov_d1_arr.reduce((s, x) => s + (x.monto || 0), 0) / aov_d1_arr.length) : null

    const aov_tc_arr = p.filter(x => CIERRES_TIPOS.has(x.tipo))
    const aov_tc = aov_tc_arr.length > 0
      ? r2(aov_tc_arr.reduce((s, x) => s + (x.monto || 0), 0) / aov_tc_arr.length) : null

    // CAC (costo de adquisicion): mismo gasto de ads que ROAS, pero como costo
    // por unidad en vez de retorno. Denominador = mismo universo de "ventas
    // nuevas del mes" que usa ROAS (Front End, sin ventas internas) contado
    // como unidades, no como monto — usa cierres_fe (ya calculado en FUNNEL,
    // mismo set de tipos que FRONT_END_SALE_TYPES/newSalesRevenue).
    const cac = metaSpend.available && cierres_fe > 0 ? r2(metaSpend.spend / cierres_fe) : null

    // CASH COLLECTED POR CALIFICACIÓN DE LEAD, con atribución por cohorte.
    // Un pago no hereda su score desde pagos.calificacion: se ata por identidad
    // a la agenda del período y conserva score + closer de esa call. Incluye
    // todo el Cash Collected real cobrado en el período (fees, ventas, cuotas,
    // refuerzos y backend); cada pago se cuenta una sola vez. Así coincide con
    // la auditoría de Lead Scoring y no mezcla cash sin agenda atribuible.
    const agendaByIdentity = new Map<string, any>()
    const sortedAgendas = [...a].sort((x, y) => {
      if (Boolean(x.show) !== Boolean(y.show)) return x.show ? -1 : 1
      return new Date(y.fecha_closer || y.created_at || 0).getTime() - new Date(x.fecha_closer || x.created_at || 0).getTime()
    })
    for (const agenda of sortedAgendas) {
      for (const key of [agenda.person_id ? `p:${agenda.person_id}` : "", agenda.telefono ? `t:${String(agenda.telefono).replace(/\D/g, "")}` : ""].filter(Boolean)) {
        if (!agendaByIdentity.has(key)) agendaByIdentity.set(key, agenda)
      }
    }
    const attributedPayments = p.map((payment) => {
      const keys = [payment.person_id ? `p:${payment.person_id}` : "", payment.telefono ? `t:${String(payment.telefono).replace(/\D/g, "")}` : ""].filter(Boolean)
      const agenda = keys.map(key => agendaByIdentity.get(key)).find(Boolean)
      return agenda ? { payment, agenda } : null
    }).filter(Boolean) as Array<{ payment: any; agenda: any }>

    const cash_por_calificacion = CALIFS_SABCD.map((tier) => {
      const label = `LEAD ${tier}`
      const callsTier = a.filter(x => x.calificacion === label)
      const presentadasTier = callsTier.filter(x => x.show).length
      const pagosTier = attributedPayments.filter(x => x.agenda.calificacion === label)
      const ccTier = r2(pagosTier.reduce((s, x) => s + Number(x.payment.monto || 0), 0))
      return {
        calificacion: label,
        cc_total: ccTier,
        llamadas: callsTier.length,
        presentadas: presentadasTier,
        pagaron: new Set(pagosTier.map(x => identityKey(x.payment))).size,
        cc_por_call: presentadasTier > 0 ? r2(ccTier / presentadasTier) : null,
      }
    })

    // CASH COLLECTED POR CALIFICACIÓN, DESGLOSADO POR CLOSER. Los apodos
    // se unifican con lib/equipo.ts (NEXT_PUBLIC_CRM_ALIAS) para que una
    // misma persona no aparezca dos veces.
    function closerKey(s: string | null | undefined): string {
      return nombreCanonico(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
    }
    function closerLabel(_key: string, raw: string | null | undefined): string {
      return nombreCanonico(raw) || firstWord(raw || "")
    }
    const closerLabels = new Map<string, string>()
    for (const x of a) {
      const k = closerKey(x.closer)
      if (k && k !== "sin" && !CLOSERS_EXCLUIDOS.has(k) && !closerLabels.has(k)) closerLabels.set(k, closerLabel(k, x.closer))
    }
    for (const x of p) {
      const k = closerKey(x.closer)
      if (k && k !== "sin" && !CLOSERS_EXCLUIDOS.has(k)) closerLabels.set(k, closerLabel(k, x.closer))
    }
    const cash_por_closer = Array.from(closerLabels.entries())
      .map(([key, label]) => ({
        closer: label,
        tiers: CALIFS_SABCD.map((tier) => {
          const lbl = `LEAD ${tier}`
          const callsTier = a.filter(x => closerKey(x.closer) === key && x.calificacion === lbl)
          const presentadasTier = callsTier.filter(x => x.show).length
          const pagosTier = attributedPayments.filter(x => closerKey(x.agenda.closer) === key && x.agenda.calificacion === lbl)
          const ccTier = r2(pagosTier.reduce((s, x) => s + Number(x.payment.monto || 0), 0))
          return {
            calificacion: lbl,
            cc_total: ccTier,
            llamadas: callsTier.length,
            presentadas: presentadasTier,
            pagaron: new Set(pagosTier.map(x => identityKey(x.payment))).size,
            cc_por_call: presentadasTier > 0 ? r2(ccTier / presentadasTier) : null,
          }
        }),
      }))
      .sort((x, y) => x.closer.localeCompare(y.closer))

    // SETTING
    const excluidos = new Set(SETTERS_EXCLUIDOS[mes] || [])
    const setterData = new Map<string, { conv_asig: number; agendas: number; calendarios_enviados: number; agendas_calificadas: number; cash_collected: number }>()
    for (const ag of aBySetterFecha) {
      const s = firstWord(ag.setter || "")
      if (!s || s === "Sin" || excluidos.has(s) || SETTERS_NO_ACTIVOS.has(s)) continue
      if (!setterData.has(s)) setterData.set(s, { conv_asig: 0, agendas: 0, calendarios_enviados: 0, agendas_calificadas: 0, cash_collected: 0 })
      const d = setterData.get(s)!
      d.agendas++
      if (CALIFS_AB.has(ag.calificacion || "")) d.agendas_calificadas++
    }

    // Cash comisionable del setter: solo frontend efectivamente cobrado entre
    // el primer pago y el día 30 inclusive. Backend y cuotas posteriores no
    // pertenecen al setter.
    for (const pago of p) {
      const s = firstWord(pago.setter || "")
      if (!s || s === "Sin" || excluidos.has(s) || SETTERS_NO_ACTIVOS.has(s)) continue
      const cohort = frontendCohort(pago.tipo)
      if (!cohort || !withinSetterWindow(pago.fecha, firstFrontendPayment.get(identityKey(pago)))) continue
      if (!setterData.has(s)) setterData.set(s, { conv_asig: 0, agendas: 0, calendarios_enviados: 0, agendas_calificadas: 0, cash_collected: 0 })
      setterData.get(s)!.cash_collected += Number(pago.monto || 0)
    }

    // Metricas cargadas a mano (conversaciones asignadas, calendarios enviados,
    // nuevos leads). Se guardan por semana real (columna "semana") para que un
    // valor cargado en una semana no se arrastre a las semanas siguientes.
    // En vista "Mes completo" (weekIdx 0) se suman todas las semanas del mes.
    let nuevos_leads: number | null = null
    try {
      let q = sb.from("metricas_manual")
        .select("persona,valor,tipo")
        .eq("mes", mes)
        .in("tipo", ["conversaciones_asignadas", "calendarios_enviados", "nuevos_leads"])
      q = weekIdx > 0 ? q.eq("semana", weekIdx) : q.not("semana", "is", null)
      const { data: manualData } = await q
      for (const row of manualData || []) {
        if (row.tipo === "nuevos_leads") {
          nuevos_leads = (nuevos_leads || 0) + (row.valor || 0)
          continue
        }
        const nombre = firstWord(row.persona || "")
        if (excluidos.has(nombre) || SETTERS_NO_ACTIVOS.has(nombre)) continue
        if (!setterData.has(nombre)) setterData.set(nombre, { conv_asig: 0, agendas: 0, calendarios_enviados: 0, agendas_calificadas: 0, cash_collected: 0 })
        const d = setterData.get(nombre)!
        if (row.tipo === "conversaciones_asignadas") d.conv_asig += row.valor || 0
        else if (row.tipo === "calendarios_enviados") d.calendarios_enviados += row.valor || 0
      }
    } catch { /* table may not exist yet */ }

    const setters = Array.from(setterData.entries())
      .map(([nombre, d]) => ({
        nombre,
        conv_asig: d.conv_asig || null,
        calendarios_enviados: d.calendarios_enviados || null,
        agendas: d.agendas,
        agendas_calificadas: d.agendas_calificadas,
        cash_collected: r2(d.cash_collected),
        t_agenda: d.conv_asig > 0 ? r2((d.agendas / d.conv_asig) * 100) : null,
      }))
      .sort((a, b) => b.agendas - a.agendas)
    const conversaciones_asignadas_total = setters.reduce((total, setter) => total + (setter.conv_asig || 0), 0)

    const weekCount = (semanasDelMes(mes)).length

    // VOLUMEN — agregaciones de agendas por dimensión
    type Row = { cuenta?: string | null; fuente?: string | null; ocupacion?: string | null; manychat?: string | null }
    const SIN = "Sin dato"
    function tally(rows: Row[], field: keyof Row, opts: { normalize?: (v: string) => string; emptyLabel?: string } = {}) {
      const fallback = opts.emptyLabel || SIN
      const map = new Map<string, number>()
      for (const r of rows) {
        let v = (r[field] || "").toString().trim()
        if (!v || v === "-" || v === "No se le envió") v = fallback
        else if (opts.normalize) v = opts.normalize(v)
        map.set(v, (map.get(v) || 0) + 1)
      }
      return Array.from(map.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((x, y) => y.cantidad - x.cantidad)
    }

    // El CRM opera una sola cuenta: todo lo cargado en "cuenta" se agrupa
    // bajo la cuenta del negocio (misma regla que en detalle/route.ts).
    const cuentaNorm = () => (BRAND.igArroba ? `${BRAND.name} (${BRAND.igArroba})` : BRAND.name)

    const volumen = {
      total: aBySetterFecha.length,
      por_cuenta: tally(aBySetterFecha as Row[], "cuenta", { normalize: cuentaNorm }),
      por_ocupacion: tally(aBySetterFecha as Row[], "ocupacion", { emptyLabel: "No se le envió" }),
      por_fuente: tally(aBySetterFecha as Row[], "fuente").slice(0, 15),
      por_manychat: tally(aBySetterFecha as Row[], "manychat", { emptyLabel: "No se le envió" }),
    }

    return NextResponse.json({
      mes, weekIdx, weekCount, volumen, embudo, embudos,
      funnel: {
        total_agendas, calls_evaluables: callsOccurred.length, calificadas, presentadas, calif_presentadas,
        cierres, cierres_fe, cierres_be, cierres_llamada, cierres_seguimiento,
        canceladas_triage, no_show, no_response, sin_resultado,
        pct_calificadas: pct(calificadas, total_agendas),
        show_total: pct(presentadas, callsOccurred.length),
        show_calif: pct(calif_presentadas, calificadasOcurridas.length),
        // Si no hubo triage, esta tasa sería idéntica al show calificado y no
        // agrega información. Se devuelve null para que la UI diga "No aplica"
        // en vez de mostrar dos porcentajes iguales que parecen un error.
        show_sin_triage: canceladas_triage_calif > 0
          ? pct(calif_presentadas, calificadasOcurridas.length - canceladas_triage_calif)
          : null,
        pct_canceladas_triage: pct(canceladas_triage, callsOccurred.length),
        pct_no_show: pct(no_show, callsOccurred.length),
        pct_no_response: pct(no_response, callsOccurred.length),
        pct_sin_resultado: pct(sin_resultado, callsOccurred.length),
        con_calificaba_realmente, calificaron_si_realmente,
        pct_calificaba_realmente: pct(calificaron_si_realmente, con_calificaba_realmente),
        // TC (tasa de cierre) del funnel de Front End: solo unidades FE.
        // Las ventas internas (Venta Nueva Interna / BE) no cuentan acá.
        tc_total: pct(cierres_fe, total_agendas),
        tc_presentadas: pct(cierres_fe, presentadas),
        tc_calificadas: pct(cierres_fe, calif_presentadas),
      },
      cash: {
        feccu, feccp, beccu, beccpp, cc_total, fees_count: fees_arr.length,
        fees_sum, aov_dia1, aov_tc, revenue, ventas_nuevas_revenue, roas, cac,
        ad_spend: metaSpend.spend, ad_spend_available: metaSpend.available,
        ad_spend_source: metaSpend.source, ad_spend_estimated: metaSpend.estimated,
      },
      cash_por_calificacion,
      cash_por_closer,
      comparacion_cierre: {
        pagos_totales,
        unidades_cerradas,
        tc_pagos_totales_agendas: pct(pagos_totales, total_agendas),
        tc_pagos_totales_presentadas: pct(pagos_totales, presentadas),
        tc_pagos_totales_calificadas: pct(pagos_totales, calif_presentadas),
        tc_unidades_agendas: pct(unidades_cerradas, total_agendas),
        tc_unidades_presentadas: pct(unidades_cerradas, presentadas),
        tc_unidades_calificadas: pct(unidades_cerradas, calif_presentadas),
      },
      seguidores: await seguidoresP.then((x) => x && { nuevos: x.nuevos, gasto: x.gasto, costo_por_seguidor: x.costo_por_seguidor, neto: x.neto, costo_por_seguidor_neto: x.costo_por_seguidor_neto }),
      setters,
      nuevos_leads,
      conversaciones_asignadas_total,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
