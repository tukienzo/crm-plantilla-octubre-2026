import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { CALENDARIO_GENERAL, CEO, CLOSERS_ACTIVOS, CLOSERS_PRIMER_NOMBRE, nombreCanonico } from "@/lib/equipo"
import { containsFullName, HORA, matchReason, norm, scheduledUtcMs } from "@/lib/fathom-cruce"

// Cierre diario del área de ventas: todos los días a las 22 h se pone al día la data de ventas con lo que grabó
// Fathom. Lo corre /api/ventas-diario.
//
// Qué arregla solo, con evidencia de Fathom:
//  · asistencia: una agenda con una llamada de venta grabada de verdad (≥ 10.000 caracteres de transcripción, unos
//    10 minutos) pasa a «se presentó», aunque alguien la haya dejado en «no se presentó» antes de la llamada
//    (/api/fathom-show-reconcile solo completa las vacías).
//  · closer: si la agenda quedó en el calendario general (el nombre del negocio) o sin closer, se le pone quien grabó.
//  · grabación ↔ agenda: se deja el vínculo en crm_call_records para que el resto del CRM la encuentre.
// Qué NO toca y deja para revisar: grabaciones de venta sin agenda (no se inventan agendas), cruces ambiguos y
// pagos que parecen duplicados (los anula una persona, nunca el sistema).

export const MIN_TRANSCRIPCION = 10_000

function escapeRegExp(texto: string) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const NO_VENTA = /EOD|weekly|1\s*[-a]\s*1|onboarding|clase|reuni[oó]n|impromptu|fullfil|daily/i
// Las reuniones del dueño del negocio, si no cierra ventas («1-1 | Cliente x <dueño>»), son 1 a 1 con clientes y no
// ventas. Se compara contra el título normalizado (minúsculas, sin tildes).
const REUNION_DEL_DUENO = (() => {
  const primero = norm(CEO).split(" ")[0] || ""
  if (!primero || CLOSERS_ACTIVOS.some((c) => norm(c).split(" ")[0] === primero)) return null
  return new RegExp(String.raw`\bx ${escapeRegExp(primero)}\b`)
})()

// Títulos de Fathom que dicen quién grabó: «Lead x Ana» o que terminan con el nombre («Lead Ana»).
// Se arman con los primeros nombres del equipo comercial (lib/equipo.ts).
const NOMBRES_EN_TITULO = CLOSERS_PRIMER_NOMBRE.map((n) => norm(n)).filter(Boolean).map((n) => ({
  nombre: n,
  re: new RegExp(String.raw`\bx ${escapeRegExp(n)}\b|\b${escapeRegExp(n)}$`),
}))
// «Lead x <nombre del negocio>»: el calendario general. Solo se le asigna a alguien si hay un alias
// (NEXT_PUBLIC_CRM_ALIAS, por ejemplo "minegocio=Ana") que lo lleve a un closer.
const CALENDARIOS_EN_TITULO = CALENDARIO_GENERAL.map((n) => norm(n)).filter(Boolean).map((n) => ({
  nombre: n,
  re: new RegExp(String.raw`\bx ${escapeRegExp(n)}\b`),
}))
// Para corregir una asistencia hace falta un vínculo fuerte. El nombre suelto dentro de la transcripción no alcanza:
// «lucas» también es plata y «lopez» aparece en cualquier charla.
const MOTIVOS_FUERTES = new Set(["agenda_id", "link_fathom", "person_id", "participant_name", "title_name"])
const CLOSERS = new Set(CLOSERS_ACTIVOS)

type Agenda = {
  id: string; person_id: string | null; nombre: string | null; closer: string | null; setter: string | null
  fecha_closer: string | null; fecha_agenda: string | null; show: boolean | null; estado: string | null; link_fathom: string | null
}
type Llamada = {
  id: string; agenda_id: string | null; person_id: string | null; occurred_at: string | null; fathom_url: string | null
  call_type: string | null; transcript: string | null; needs_review: boolean | null; match_confidence: number | null
  title: string | null; participants: unknown
}

export type Resultado = {
  aplicado: boolean
  agendas_revisadas: number
  grabaciones_de_venta: number
  asistencias_corregidas: Array<{ agenda: string; nombre: string | null; antes: boolean | null; grabacion: string | null; motivo: string }>
  closers_corregidos: Array<{ agenda: string; nombre: string | null; antes: string | null; ahora: string }>
  vinculos: number
  sin_agenda: Array<{ titulo: string | null; fecha: string | null; url: string | null; grabo: string | null }>
  ambiguas: Array<{ nombre: string | null; fecha: string | null; candidatas: number }>
  pagos_duplicados: Array<{ cliente: string | null; tipo: string | null; monto: number; fechas: string[]; ids: string[] }>
}

export function esLlamadaDeVenta(call: Pick<Llamada, "call_type" | "transcript" | "title">) {
  return call.call_type === "sales"
    && String(call.transcript || "").length >= MIN_TRANSCRIPCION
    && !NO_VENTA.test(call.title || "")
    && !REUNION_DEL_DUENO?.test(norm(call.title))
}

// Quién grabó: el participante interno, y si no, el título («Lead x Ana», «Lead Ana», «Lead x <calendario general>»
// si tiene alias a un closer).
export function closerDeLaGrabacion(call: Pick<Llamada, "participants" | "title">): string | null {
  const internos = Array.isArray(call.participants)
    ? (call.participants as Array<{ name?: string; email?: string; is_external?: boolean }>).filter((p) => p?.is_external === false)
    : []
  for (const p of internos) {
    const nombre = nombreCanonico(p?.name || "")
    if (CLOSERS.has(nombre)) return nombre
    const correo = String(p?.email || "").toLowerCase()
    for (const c of CLOSERS) if (correo.includes(c.toLowerCase())) return c
  }
  const titulo = norm(call.title)
  for (const { nombre, re } of NOMBRES_EN_TITULO) if (re.test(titulo)) return nombreCanonico(nombre)
  for (const { nombre, re } of CALENDARIOS_EN_TITULO) {
    if (!re.test(titulo)) continue
    const canonico = nombreCanonico(nombre)
    if (CLOSERS.has(canonico)) return canonico
  }
  return null
}

function horaAgenda(a: Agenda) { return a.fecha_closer || a.fecha_agenda }

// Las agendas del cron de iClosed guardan hora argentina como si fuera UTC: se prueba la hora tal cual y con +3 h.
function motivo(a: Agenda, call: Llamada) {
  const base = scheduledUtcMs(horaAgenda(a))
  if (!Number.isFinite(base)) return ""
  const por = matchReason(a, call, base) || matchReason(a, call, base + 3 * HORA)
  return MOTIVOS_FUERTES.has(por) ? por : ""
}

function claveIdentidad(p: { person_id?: string | null; telefono?: string | null; cliente?: string | null }) {
  if (p.person_id) return `p:${p.person_id}`
  const tel = String(p.telefono || "").replace(/\D/g, "")
  if (tel) return `t:${tel}`
  return `n:${norm(p.cliente).replace(/ /g, "")}`
}

export async function reconciliarVentas({ dias = 14, aplicar = true }: { dias?: number; aplicar?: boolean } = {}): Promise<Resultado> {
  const sb = createSupabaseAdmin()
  const ahora = new Date()
  const desde = new Date(ahora.getTime() - dias * 24 * HORA)
  const desdeIso = desde.toISOString().slice(0, 19)
  const hastaIso = ahora.toISOString().slice(0, 19)

  const { data: agendasRaw, error: aErr } = await sb
    .from("agendas")
    .select("id,person_id,nombre,closer,setter,fecha_closer,fecha_agenda,show,estado,link_fathom")
    .or(`and(fecha_closer.gte.${desdeIso},fecha_closer.lte.${hastaIso}),and(fecha_closer.is.null,fecha_agenda.gte.${desdeIso},fecha_agenda.lte.${hastaIso})`)
  if (aErr) throw new Error(`agendas: ${aErr.message}`)
  const agendas = ((agendasRaw || []) as Agenda[]).filter((a) => a.estado !== "Archivada manualmente")

  const { data: llamadasRaw, error: lErr } = await sb
    .from("crm_call_records")
    .select("id,agenda_id,person_id,occurred_at,fathom_url,call_type,transcript,needs_review,match_confidence,title,participants")
    .gte("occurred_at", new Date(desde.getTime() - 24 * HORA).toISOString())
    .lte("occurred_at", ahora.toISOString())
  if (lErr) throw new Error(`grabaciones: ${lErr.message}`)
  const llamadas = ((llamadasRaw || []) as Llamada[]).filter(esLlamadaDeVenta)

  const r: Resultado = {
    aplicado: aplicar, agendas_revisadas: agendas.length, grabaciones_de_venta: llamadas.length,
    asistencias_corregidas: [], closers_corregidos: [], vinculos: 0, sin_agenda: [], ambiguas: [], pagos_duplicados: [],
  }

  const usadas = new Set<string>()
  for (const a of agendas) {
    const candidatas = llamadas.map((call) => ({ call, por: motivo(a, call) })).filter((x) => x.por)
    if (!candidatas.length) continue
    if (candidatas.length > 1) {
      // dos grabaciones de la misma persona (primera y segunda llamada) cuentan como una presentación: se usa la primera
      const mismaPersona = candidatas.every((x) => x.call.agenda_id === a.id || (a.person_id && x.call.person_id === a.person_id))
      if (!mismaPersona) { r.ambiguas.push({ nombre: a.nombre, fecha: horaAgenda(a), candidatas: candidatas.length }); continue }
      candidatas.sort((x, y) => String(x.call.occurred_at).localeCompare(String(y.call.occurred_at)))
    }
    const { call, por } = candidatas[0]
    // 1:1: si la grabación también sirve para otra agenda (nombres repetidos), no se toca
    const otras = agendas.filter((b) => b.id !== a.id && b.person_id !== a.person_id && motivo(b, call))
    if (otras.length) { r.ambiguas.push({ nombre: a.nombre, fecha: horaAgenda(a), candidatas: otras.length + 1 }); continue }
    candidatas.forEach((x) => usadas.add(x.call.id))

    const cambios: Record<string, unknown> = {}
    if (a.show !== true) {
      cambios.show = true
      if (a.estado === "No Show") cambios.estado = "Se presentó"
      r.asistencias_corregidas.push({ agenda: a.id, nombre: a.nombre, antes: a.show, grabacion: call.fathom_url, motivo: por })
    }
    if (!a.link_fathom && call.fathom_url) cambios.link_fathom = call.fathom_url
    const closerActual = nombreCanonico(a.closer || "")
    const grabo = closerDeLaGrabacion(call)
    if (grabo && !CLOSERS.has(closerActual)) {
      cambios.closer = grabo
      r.closers_corregidos.push({ agenda: a.id, nombre: a.nombre, antes: a.closer, ahora: grabo })
    }
    const vincular = !call.agenda_id

    if (aplicar && Object.keys(cambios).length) {
      const { error } = await sb.from("agendas").update({ ...cambios, updated_at: ahora.toISOString() }).eq("id", a.id)
      if (error) throw new Error(`agenda ${a.id}: ${error.message}`)
      await sb.from("crm_events").upsert({
        person_id: a.person_id,
        event_type: a.show === false ? "show_corregido" : "show_reconciled",
        occurred_at: ahora.toISOString(),
        source: "ventas-diario",
        source_record_type: "agendas",
        source_record_id: a.id,
        title: a.show === false ? "Asistencia corregida desde Fathom (estaba como no presentada)" : "Asistencia completada desde Fathom",
        metadata: { cambios, antes: { show: a.show, closer: a.closer, estado: a.estado }, call_record_id: call.id, fathom_url: call.fathom_url, motivo: por },
        dedupe_key: `ventas-diario:${a.id}:${call.id}`,
      }, { onConflict: "dedupe_key" })
    }
    if (vincular) {
      r.vinculos++
      if (aplicar) {
        const { error } = await sb.from("crm_call_records")
          .update({ agenda_id: a.id, ...(call.person_id ? {} : { person_id: a.person_id }) })
          .eq("id", call.id).is("agenda_id", null)
        if (error) throw new Error(`grabación ${call.id}: ${error.message}`)
      }
    }
  }

  // Grabaciones de venta que no corresponden a ninguna agenda: se avisan, no se inventan agendas.
  // Una segunda llamada («… 2da call») de alguien con agenda en la ventana no es un faltante.
  for (const call of llamadas) {
    if (usadas.has(call.id) || call.agenda_id) continue
    if (agendas.some((a) => containsFullName(call.title, a.nombre))) continue
    r.sin_agenda.push({ titulo: call.title, fecha: call.occurred_at, url: call.fathom_url, grabo: closerDeLaGrabacion(call) })
  }

  // Pagos que parecen cargados dos veces: misma persona, mismo tipo y mismo monto con menos de 10 días de diferencia.
  const { data: pagos, error: pErr } = await sb
    .from("pagos")
    .select("id,fecha,cliente,person_id,telefono,tipo,monto")
    .eq("record_status", "active")
    .gte("fecha", new Date(ahora.getTime() - 45 * 24 * HORA).toISOString().slice(0, 10))
  if (pErr) throw new Error(`pagos: ${pErr.message}`)
  const grupos = new Map<string, Array<{ id: string; fecha: string | null; cliente: string | null; tipo: string | null; monto: number }>>()
  for (const p of pagos || []) {
    const k = `${claveIdentidad(p)}|${p.tipo}|${Number(p.monto || 0).toFixed(2)}`
    grupos.set(k, [...(grupos.get(k) || []), { id: p.id, fecha: p.fecha, cliente: p.cliente, tipo: p.tipo, monto: Number(p.monto || 0) }])
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue
    const fechas = g.map((p) => Date.parse(String(p.fecha))).filter(Number.isFinite).sort((x, y) => x - y)
    if (fechas.length < 2 || fechas.at(-1)! - fechas[0] > 10 * 24 * HORA) continue
    r.pagos_duplicados.push({ cliente: g[0].cliente, tipo: g[0].tipo, monto: g[0].monto, fechas: g.map((p) => String(p.fecha)), ids: g.map((p) => p.id) })
  }
  return r
}
