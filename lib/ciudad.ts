import type { SupabaseClient } from "@supabase/supabase-js"
import { clasificar, medirAngulos, type Fila } from "@/lib/angulos-manychat"
import { urlPublica } from "@/lib/radar/metricas"
import { BRAND } from "@/lib/brand"

// Vista ciudad. Junta en una sola lectura todo lo que la ciudad muestra: las piezas de contenido (islas),
// los contactos que entran por ManyChat (captación), los que esperan, los setters, las agendas del día por closer,
// los seguimientos, los clientes y la formación. Solo lectura: no escribe nada, no manda nada.
// Regla: cada persona dibujada es un registro real; lo que no tiene fuente se devuelve como null (N/D), nunca 0.

const ART = -3 // Argentina no tiene horario de verano
const diaArt = (d = new Date()) => new Date(d.getTime() + ART * 3600000).toISOString().slice(0, 10)
const inicioDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`).toISOString()
const sumarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
const igLimpio = (s: unknown) => sinAcentos(String(s || "")).replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "")

export type EstadoSilla = "programada" | "confirmada" | "en_horario" | "presentada" | "cerro" | "no_show" | "cancelada" | "reprogramada" | "sin_resultado"
export const ESTADOS_SILLA: Record<EstadoSilla, { label: string; regla: string }> = {
  programada: { label: "Programada", regla: "La call todavía no pasó y nadie confirmó asistencia (confirmación vacía, Pendiente o No respondió)." },
  confirmada: { label: "Confirmada", regla: "La call todavía no pasó y la confirmación dice «Sí, confirmada»." },
  en_horario: { label: "En horario", regla: "La hora agendada fue hace menos de 60 minutos y todavía no hay resultado. Sale del horario, no de un estado en vivo: el CRM no sabe si la llamada empezó." },
  presentada: { label: "Presentada", regla: "show = sí en la agenda." },
  cerro: { label: "Cerró (agenda)", regla: "show = sí y la agenda está marcada como cerrada. El cierre oficial (cliente que entró) se mide en Métricas desde los pagos." },
  no_show: { label: "No show", regla: "show = no en la agenda." },
  cancelada: { label: "Cancelada", regla: "La confirmación dice «Se canceló por Triage» o «Cancelada por Triage»." },
  reprogramada: { label: "Reprogramada", regla: "El seguimiento de la agenda dice «Reagendado»." },
  sin_resultado: { label: "Sin resultado", regla: "La call ya pasó hace más de 60 minutos y nadie cargó show / no show." },
}

export type Persona = { id: string; nombre: string; ig: string | null; desde: string | null; origen: string | null; isla: string | null }
export type Silla = { id: string; nombre: string; ig: string | null; hora: string; estado: EstadoSilla; closer: string; setter: string | null; calificacion: string | null; fuente: string | null; fathom: string | null }
export type Isla = {
  id: string; nombre: string; formato: string | null; categoria: string | null; angulo: string | null; fecha: string | null
  etiqueta: string | null
  // embudo de la pieza (etiqueta de ManyChat cruzada con agendas y pagos); null = la pieza no tiene etiqueta y no se puede atribuir
  leads: number | null; nuevos: number | null; agendas: number | null; presentadas: number | null; cierres: number | null; cash: number | null
  hoy: number | null; semana: number | null
  preview: { url: string | null; imagen: string | null; tipo: string | null; views: number | null; likes: number | null; comentarios: number | null; vinculo: string; radar_id?: string } | null
  // métricas reales del post (Graph API de Instagram, radar_piezas_metricas)
  ig?: { alcance: number | null; vistas: number | null; guardados: number | null; compartidos: number | null; seguidores: number | null; tiempo_promedio_ms: number | null } | null
}

export type CiudadDatos = Awaited<ReturnType<typeof leerCiudad>>

async function todas<T>(q: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, tope = 20000): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < tope; i += 1000) {
    const { data, error } = await q(i, i + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

function closerCanonico(raw: string | null, equipo: string[]) {
  const r = sinAcentos(raw || "")
  if (!r) return "Sin closer"
  const hit = equipo.filter((n) => { const s = sinAcentos(n); return s === r || s.split(" ")[0] === r.split(" ")[0] })
  return hit.length === 1 ? hit[0] : (raw as string).trim()
}

export async function leerCiudad(sb: SupabaseClient, opciones: { dia?: string; diasContenido?: number } = {}) {
  const ahora = new Date()
  const hoy = diaArt(ahora)
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(opciones.dia || "") ? (opciones.dia as string) : hoy
  const diasContenido = Math.min(60, Math.max(7, opciones.diasContenido || 21))
  const hace7 = sumarDias(hoy, -6)
  const avisos: string[] = []

  // ── equipo ────────────────────────────────────────────────────────────────────────────────────────────────
  const { data: equipo } = await sb.from("team_members").select("nombre,rol,estado").eq("estado", "aprobado")
  const closersEquipo = (equipo || []).filter((t) => t.rol === "Closer").map((t) => String(t.nombre))
  const settersEquipo = (equipo || []).filter((t) => t.rol === "Setter").map((t) => String(t.nombre))

  // ── islas: piezas con etiqueta de ManyChat + piezas propias del radar ──────────────────────────────────────
  // el cálculo de piezas es la consulta más pesada (rpc crm_angulos_manychat): un reintento y, si igual falla, la ciudad
  // se arma sin el embudo de las piezas (las islas del radar quedan con N/D) en lugar de caerse entera
  let medicion: Awaited<ReturnType<typeof medirAngulos>> | null = null
  for (let intento = 0; intento < 2 && !medicion; intento++) {
    try { medicion = await medirAngulos(sb, diasContenido) } catch (e) { if (intento === 1) avisos.push(`No se pudo leer el embudo de las piezas (${(e as Error).message}). Las islas se muestran sin leads.`) }
  }
  const piezas: Fila[] = (medicion?.piezas || []).filter((p) => p.categoria !== "Historia")
  const desdeContenido = medicion?.desde || sumarDias(hoy, -diasContenido)
  // piezas de la cuenta propia (NEXT_PUBLIC_BRAND_IG_HANDLE); sin cuenta configurada la consulta vuelve vacía
  if (!BRAND.igHandle) avisos.push("Falta configurar la cuenta de Instagram propia (NEXT_PUBLIC_BRAND_IG_HANDLE): las islas se muestran sin vista previa del radar.")
  const { data: radar } = await sb.from("radar_piezas")
    .select("id,url,tipo_media,fecha,thumb_path,thumb_remota,caption,views,likes,comentarios")
    .eq("cuenta", BRAND.igHandle).gte("fecha", inicioDia(desdeContenido)).order("fecha", { ascending: false })
  type RadarFila = NonNullable<typeof radar>[number]
  const previa = (r: RadarFila, vinculo: string) => ({ url: r.url, imagen: urlPublica(r.thumb_path) || r.thumb_remota || null, tipo: r.tipo_media, views: r.views, likes: r.likes, comentarios: r.comentarios, vinculo, radar_id: String(r.id) })
  // vínculo pieza → post: cruce de comentaristas (lib/ciudad-vinculos.ts, se actualiza todos los días)
  // se compara por el nombre normalizado de la pieza: la misma pieza puede tener variantes de etiqueta en ManyChat
  // (un emoji con o sin selector invisible) y la isla toma una sola
  const vinculos = new Map<string, { radar_pieza_id: string; coincidencias: number; comentaristas: number }>()
  const { data: filasVinculo } = await sb.from("crm_piezas_instagram").select("etiqueta,radar_pieza_id,coincidencias,comentaristas")
  for (const v of filasVinculo || []) {
    const nombre = clasificar(v.etiqueta)?.nombre
    if (!nombre) continue
    const ya = vinculos.get(nombre)
    if (!ya || v.coincidencias > ya.coincidencias) vinculos.set(nombre, v)
  }
  const porId = new Map<string, RadarFila>((radar || []).map((r) => [String(r.id), r]))
  const faltan = [...vinculos.values()].map((v) => v.radar_pieza_id).filter((id) => !porId.has(id))
  if (faltan.length) {
    const { data } = await sb.from("radar_piezas").select("id,url,tipo_media,fecha,thumb_path,thumb_remota,caption,views,likes,comentarios").in("id", faltan)
    for (const r of data || []) porId.set(String(r.id), r)
  }
  const vinculadas = new Set([...vinculos.values()].map((v) => v.radar_pieza_id))
  const radarPorDia = new Map<string, RadarFila[]>()
  for (const r of radar || []) { if (vinculadas.has(String(r.id))) continue; const d = diaArt(new Date(r.fecha)); radarPorDia.set(d, [...(radarPorDia.get(d) || []), r]) }
  const usadas = new Set<string>(vinculadas)
  const tipoDe = (p: Fila) => (/carru/i.test(`${p.formato} ${p.categoria}`) ? "carrusel" : "reel")
  const islas: Isla[] = piezas.map((p, i) => {
    const v = vinculos.get(p.nombre)
    const vinculada = v ? porId.get(v.radar_pieza_id) : undefined
    let preview: Isla["preview"] = vinculada && v ? previa(vinculada, `${v.coincidencias} de ${v.comentaristas} comentaristas del post tienen esta etiqueta en ManyChat`) : null
    if (!preview) {
      // sin vínculo por comentarios: el único post del mismo día y tipo, avisando que no está confirmado
      const candidatas = ((p.fecha && radarPorDia.get(p.fecha)) || []).filter((r) => (tipoDe(p) === "carrusel") === (r.tipo_media === "carrusel") && !usadas.has(String(r.id)))
      if (candidatas.length === 1) { usadas.add(String(candidatas[0].id)); preview = previa(candidatas[0], "mismo día y tipo (sin confirmar con comentarios)") }
    }
    return {
      id: `mc-${i}`, nombre: p.nombre, formato: p.formato || null, categoria: p.categoria || null, angulo: p.angulo || null, fecha: p.fecha || null, etiqueta: p.tag || null,
      leads: p.leads, nuevos: p.nuevos, agendas: p.agendas, presentadas: p.presentadas, cierres: p.cierres, cash: Math.round(p.cash),
      hoy: 0, semana: 0, preview,
    }
  })
  for (const r of radar || []) {
    if (usadas.has(String(r.id))) continue
    islas.push({
      id: `rd-${r.id}`, nombre: String(r.caption || "").split("\n")[0].slice(0, 70) || `${r.tipo_media} del ${diaArt(new Date(r.fecha))}`, formato: r.tipo_media, categoria: r.tipo_media === "carrusel" ? "Carrusel" : "Reel",
      angulo: null, fecha: diaArt(new Date(r.fecha)), etiqueta: null,
      leads: null, nuevos: null, agendas: null, presentadas: null, cierres: null, cash: null, hoy: null, semana: null,
      preview: previa(r, "pieza del radar sin etiqueta de ManyChat"),
    })
  }
  // una isla por pieza publicada en la ventana; las etiquetas viejas (piezas de meses anteriores que siguen sumando contactos) no se dibujan
  const fueraDeVentana = islas.filter((i) => !i.fecha || i.fecha < desdeContenido).length
  islas.splice(0, islas.length, ...islas.filter((i) => i.fecha && i.fecha >= desdeContenido))
  islas.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || (b.leads || 0) - (a.leads || 0))
  const conRadar = islas.map((i) => i.preview?.radar_id).filter(Boolean) as string[]
  if (conRadar.length) {
    const { data: mets } = await sb.from("radar_piezas_metricas").select("pieza_id,alcance,vistas,guardados,compartidos,seguidores,tiempo_promedio_ms").in("pieza_id", conRadar)
    const porPost = new Map((mets || []).map((m) => [String(m.pieza_id), m]))
    for (const i of islas) {
      const m = i.preview?.radar_id ? porPost.get(i.preview.radar_id) : undefined
      i.ig = m ? { alcance: m.alcance, vistas: m.vistas, guardados: m.guardados, compartidos: m.compartidos, seguidores: m.seguidores, tiempo_promedio_ms: m.tiempo_promedio_ms } : null
    }
  }
  const islaDeEtiqueta = new Map(islas.filter((i) => i.etiqueta).map((i) => [i.etiqueta as string, i]))

  // ── captación: contactos nuevos de ManyChat de los últimos 7 días ──────────────────────────────────────────
  type Sub = { source_id: string; name: string | null; ig: string | null; subscribed: string | null; tags: string[] | null }
  const subs = await todas<Sub>((a, b) => sb.from("crm_integration_assets")
    .select("source_id,name,ig:metadata->>ig,subscribed:metadata->>subscribed,tags:metadata->tags")
    .eq("source", "manychat").eq("asset_type", "subscriber").gte("metadata->>subscribed", hace7)
    .order("metadata->>subscribed").order("source_id").range(a, b) as unknown as PromiseLike<{ data: Sub[] | null; error: { message: string } | null }>)
  const porDia = new Map<string, number>()
  for (let i = 0; i < 7; i++) porDia.set(sumarDias(hoy, -i), 0)
  const origenDe = (tags: string[]) => {
    for (const t of tags) { const c = clasificar(t); if (c && c.tipo === "pieza" && c.categoria !== "Historia") return { origen: c.nombre, isla: islaDeEtiqueta.get(t)?.id || null } }
    for (const t of tags) { const c = clasificar(t); if (c && (c.tipo === "historia" || c.tipo === "categoria")) return { origen: c.nombre, isla: null } }
    return { origen: null, isla: null }
  }

  // ¿quién ya tiene agenda? cruce por identidad de ManyChat, Instagram y teléfono no hace falta: alcanza con las dos primeras
  const ids = subs.map((s) => s.source_id)
  const igs = [...new Set(subs.map((s) => igLimpio(s.ig)).filter(Boolean))]
  const personaDe = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await sb.from("crm_identities").select("value,person_id").eq("kind", "manychat").in("value", ids.slice(i, i + 300))
    for (const r of data || []) if (r.person_id) personaDe.set(`mc:${r.value}`, r.person_id)
  }
  for (let i = 0; i < igs.length; i += 300) {
    const { data } = await sb.from("crm_identities").select("value,person_id").eq("kind", "instagram").in("value", igs.slice(i, i + 300))
    for (const r of data || []) if (r.person_id) personaDe.set(`ig:${igLimpio(r.value)}`, r.person_id)
  }
  const personas = [...new Set(personaDe.values())]
  const conAgenda = new Set<string>()
  for (let i = 0; i < personas.length; i += 300) {
    const { data } = await sb.from("agendas").select("person_id").in("person_id", personas.slice(i, i + 300))
    for (const r of data || []) if (r.person_id) conAgenda.add(r.person_id)
  }
  const igConAgenda = new Set<string>()
  const { data: agendasRecientes } = await sb.from("agendas").select("instagram").gte("fecha_agenda", inicioDia(hace7))
  for (const r of agendasRecientes || []) if (r.instagram) igConAgenda.add(igLimpio(r.instagram))

  const captados: Persona[] = []
  const espera: Persona[] = []
  const conversando: Persona[] = []
  for (const s of subs) {
    const d = String(s.subscribed || "").slice(0, 10)
    if (porDia.has(d)) porDia.set(d, (porDia.get(d) || 0) + 1)
    const tags = Array.isArray(s.tags) ? s.tags.map(String) : []
    const { origen, isla } = origenDe(tags)
    const ig = s.ig ? igLimpio(s.ig) : null
    const p: Persona = { id: s.source_id, nombre: s.name || (ig ? `@${ig}` : "Sin nombre"), ig, desde: s.subscribed, origen, isla }
    if (isla) {
      const il = islas.find((x) => x.id === isla)
      if (il && il.semana !== null) { il.semana = (il.semana || 0) + 1; if (d === hoy) il.hoy = (il.hoy || 0) + 1 }
    }
    if (d === hoy) captados.push(p)
    const per = personaDe.get(`mc:${s.source_id}`) || (ig ? personaDe.get(`ig:${ig}`) : undefined)
    const agendo = (per && conAgenda.has(per)) || (ig && igConAgenda.has(ig))
    if (agendo) continue
    if (tags.includes("ASIGNADO")) conversando.push(p)
    else espera.push(p)
  }
  const reciente = (a: Persona, b: Persona) => String(b.desde || "").localeCompare(String(a.desde || ""))
  captados.sort(reciente); espera.sort(reciente); conversando.sort(reciente)

  // ── setters ───────────────────────────────────────────────────────────────────────────────────────────────
  const mes = hoy.slice(0, 7)
  const { data: agSet } = await sb.from("agendas").select("setter,fecha_agenda").gte("fecha_agenda", inicioDia(hace7))
  const { data: conv } = await sb.from("metricas_manual").select("persona,valor").eq("tipo", "conversaciones_asignadas").eq("mes", mes)
  const nombresSetter = [...new Set([...settersEquipo, ...(agSet || []).map((a) => String(a.setter || "").trim()).filter(Boolean)])]
  const setterCanon = (raw: string | null) => closerCanonico(raw, settersEquipo)
  const setters = [...new Set(nombresSetter.map((n) => setterCanon(n)))].map((nombre) => {
    const mias = (agSet || []).filter((a) => setterCanon(a.setter) === nombre)
    const conversaciones = (conv || []).filter((c) => setterCanon(c.persona) === nombre).reduce((t, c) => t + Number(c.valor || 0), 0)
    return {
      nombre, en_equipo: settersEquipo.includes(nombre),
      agendas_hoy: mias.filter((a) => diaArt(new Date(a.fecha_agenda)) === hoy).length,
      agendas_7d: mias.length,
      conversaciones_mes: (conv || []).some((c) => setterCanon(c.persona) === nombre) ? conversaciones : null,
    }
  }).sort((a, b) => Number(b.en_equipo) - Number(a.en_equipo) || b.agendas_7d - a.agendas_7d)

  // ── agendas del día, una fila de sillas por closer ────────────────────────────────────────────────────────
  const { data: ags, error: eAg } = await sb.from("agendas")
    .select("id,nombre,instagram,fecha_closer,closer,setter,calificacion,fuente,show,cerro,call_confirmer,seguimiento_estado,link_fathom")
    .gte("fecha_closer", inicioDia(dia)).lt("fecha_closer", inicioDia(sumarDias(dia, 1))).order("fecha_closer")
  if (eAg) throw new Error(eAg.message)
  const estadoDe = (a: NonNullable<typeof ags>[number]): EstadoSilla => {
    const conf = sinAcentos(a.call_confirmer || "")
    if (/cancel/.test(conf)) return "cancelada"
    if (a.seguimiento_estado === "Reagendado") return "reprogramada"
    if (a.show === true) return a.cerro ? "cerro" : "presentada"
    if (a.show === false) return "no_show"
    const min = (ahora.getTime() - new Date(a.fecha_closer).getTime()) / 60000
    if (min > 60) return "sin_resultado"
    if (min >= 0) return "en_horario"
    return /confirmada/.test(conf) ? "confirmada" : "programada"
  }
  const sillas: Silla[] = (ags || []).map((a) => ({
    id: a.id, nombre: a.nombre || "Sin nombre", ig: a.instagram ? igLimpio(a.instagram) : null,
    hora: new Date(a.fecha_closer).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }),
    estado: estadoDe(a), closer: closerCanonico(a.closer, closersEquipo), setter: a.setter || null, calificacion: a.calificacion || null, fuente: a.fuente || null, fathom: a.link_fathom || null,
  }))
  const nombresCarril = [...new Set([...closersEquipo, ...sillas.map((s) => s.closer)])]
  const carriles = nombresCarril.map((closer) => ({ closer, en_equipo: closersEquipo.includes(closer), sillas: sillas.filter((s) => s.closer === closer) }))
  const porEstado = Object.fromEntries(Object.keys(ESTADOS_SILLA).map((k) => [k, sillas.filter((s) => s.estado === k).length])) as Record<EstadoSilla, number>
  const closers = carriles.map((c) => ({
    nombre: c.closer, en_equipo: c.en_equipo,
    llamadas: c.sillas.length,
    presentadas: c.sillas.filter((s) => s.estado === "presentada" || s.estado === "cerro").length,
    cerradas: c.sillas.filter((s) => s.estado === "cerro").length,
    no_show: c.sillas.filter((s) => s.estado === "no_show").length,
    en_horario: c.sillas.find((s) => s.estado === "en_horario") || null,
    proxima: dia === hoy ? c.sillas.find((s) => s.estado === "programada" || s.estado === "confirmada") || null : null,
  }))

  // ── seguimiento ───────────────────────────────────────────────────────────────────────────────────────────
  const { data: segs } = await sb.from("seguimientos").select("id,nombre,closer,situacion,etapa,fups,proximo_fup,fecha_call,estado")
    .in("estado", ["Activo", "Reagendó"]).order("fecha_call", { ascending: false })
  // fups = { "1": { por, fecha, hecho }, ... } (el mismo formato que usa /seguimientos)
  const seguimiento = (segs || []).map((s) => {
    const lista = s.fups && typeof s.fups === "object" ? Object.values(s.fups as Record<string, { fecha?: string; hecho?: boolean } | null>) : []
    const preparados = lista.filter((h) => h && !h.hecho && h.fecha).map((h) => String(h?.fecha).slice(0, 10)).sort()
    const proximo = s.proximo_fup ? String(s.proximo_fup).slice(0, 10) : preparados[0] || null
    return {
      id: s.id, nombre: s.nombre || "Sin nombre", closer: s.closer ? closerCanonico(s.closer, closersEquipo) : null, situacion: s.situacion || null, etapa: s.etapa || null, estado: s.estado,
      fups: lista.filter((h) => h?.hecho).length, proximo_fup: proximo, fecha_call: s.fecha_call || null,
      vencido: Boolean(proximo && proximo < hoy),
    }
  })
  const segPorEstado: Record<string, number> = {}
  for (const s of seguimiento) segPorEstado[s.estado] = (segPorEstado[s.estado] || 0) + 1

  // ── clientes ──────────────────────────────────────────────────────────────────────────────────────────────
  const { data: clis } = await sb.from("clientes")
    .select("id,nombre,estado,etapa,fecha_ingreso,onboarding_completed_at,discord_access_at,skool_access_at,engagement_signal,last_observed_activity_at")
    .eq("record_status", "active").is("merged_into_client_id", null)
  const hace30 = sumarDias(hoy, -30)
  const clientes = (clis || []).map((c) => ({
    id: c.id, nombre: c.nombre || "Sin nombre", estado: c.estado || null, etapa: c.etapa || null, fecha_ingreso: c.fecha_ingreso || null,
    nuevo: Boolean(c.fecha_ingreso && String(c.fecha_ingreso).slice(0, 10) >= hace30),
    accesos: { discord: Boolean(c.discord_access_at), skool: Boolean(c.skool_access_at), onboarding: Boolean(c.onboarding_completed_at) },
  }))
  const conActividad = (clis || []).filter((c) => c.last_observed_activity_at || (c.engagement_signal && c.engagement_signal !== "sin_evidencia")).length
  const { data: cuotas } = await sb.from("plan_pago_items").select("id,plan_id,monto,fecha_planeada,concepto,numero_cuota")
    .eq("estado", "pendiente").is("pago_id", null).lt("fecha_planeada", hoy).order("fecha_planeada")
  const planes = [...new Set((cuotas || []).map((c) => c.plan_id))]
  const { data: planesInfo } = planes.length ? await sb.from("planes_pago").select("id,cliente").in("id", planes) : { data: [] as Array<{ id: string; cliente: string | null }> }
  const clienteDePlan = new Map((planesInfo || []).map((p) => [p.id, p.cliente]))
  const vencidas = (cuotas || []).map((c) => ({ id: c.id, cliente: clienteDePlan.get(c.plan_id) || "Sin nombre", monto: Number(c.monto || 0), fecha: c.fecha_planeada, cuota: c.numero_cuota ?? null }))

  // ── formación: sin fuente de actividad, nadie se dibuja dormido ───────────────────────────────────────────
  const formacion = conActividad > 0
    ? { disponible: true, alumnos: clientes.length, con_actividad: conActividad, motivo: null as string | null }
    : { disponible: false, alumnos: clientes.length, con_actividad: 0, motivo: "El CRM no tiene una fuente de actividad de los alumnos (Discord, Skool o asistencia a clases): ningún cliente tiene actividad observada. Por eso nadie se dibuja dormido." }

  if (islas.every((i) => !i.preview)) avisos.push("Ninguna isla tiene vista previa: el radar no capturó piezas propias en la ventana.")
  if (porEstado.sin_resultado) avisos.push(`${porEstado.sin_resultado} call(s) del día ya pasaron sin show / no show cargado.`)

  return {
    modo: "real" as const,
    corte: ahora.toISOString(),
    hoy, dia,
    contenido: { desde: desdeContenido, dias: diasContenido, cobertura: medicion?.cobertura || null, piezas_fuera_de_ventana: fueraDeVentana },
    islas,
    captacion: { hoy: porDia.get(hoy) || 0, ayer: porDia.get(sumarDias(hoy, -1)) || 0, semana: subs.length, por_dia: [...porDia.entries()].map(([d, n]) => ({ dia: d, n })).reverse(), lista: captados.slice(0, 200) },
    espera: { total: espera.length, lista: espera.slice(0, 200) },
    setters: { equipo: setters, conversando: { total: conversando.length, lista: conversando.slice(0, 200) } },
    agendas: { total: sillas.length, por_estado: porEstado, carriles },
    closers,
    seguimiento: { total: seguimiento.length, vencidos: seguimiento.filter((s) => s.vencido).length, sin_fecha: seguimiento.filter((s) => !s.proximo_fup).length, por_estado: segPorEstado, lista: seguimiento },
    clientes: { total: clientes.length, nuevos_30d: clientes.filter((c) => c.nuevo).length, lista: clientes.sort((a, b) => String(b.fecha_ingreso || "").localeCompare(String(a.fecha_ingreso || ""))), cuotas_vencidas: { total: vencidas.length, monto: Math.round(vencidas.reduce((t, c) => t + c.monto, 0)), lista: vencidas } },
    formacion,
    avisos,
  }
}

// Diccionario de métricas de la ciudad: qué cuenta cada número, de dónde sale y cuán completo está.
export const DICCIONARIO = [
  { id: "isla.leads", nombre: "Leads de una pieza", formula: "Contactos de ManyChat con la etiqueta de la pieza (p. ej. «Pieza de ejemplo - 🟣VOLUMEN/TOFU - 15/3/2026»)", fuente: "ManyChat → crm_integration_assets", estado: "real", nota: "Atribución por etiqueta del flujo (último toque que etiquetó ManyChat). Las piezas sin etiqueta muestran N/D." },
  { id: "isla.agendas", nombre: "Agendas / presentadas / cierres / cash de una pieza", formula: "Agendas de las personas que tienen la etiqueta, en la ventana; el cash se cuenta una sola vez por persona", fuente: "rpc crm_angulos_manychat (el mismo cálculo que Marketing → Ángulos)", estado: "real", nota: "Una persona con varias etiquetas suma en cada pieza: es atribución multi-toque, no se suman entre islas." },
  { id: "isla.flujo", nombre: "Contactos que bajan por la cinta", formula: "Contactos nuevos (hoy / 7 días) cuya primera etiqueta de pieza es esa isla", fuente: "ManyChat", estado: "real", nota: "ManyChat no guarda el orden de las etiquetas: si un contacto tiene dos piezas, se toma la primera de la lista." },
  { id: "isla.instagram", nombre: "Alcance, vistas, guardados y compartidos de una pieza", formula: "Métricas de por vida del post según Instagram; leads c/1.000 alcanzados = leads de la pieza ÷ alcance × 1.000", fuente: "Graph API de Instagram (radar_piezas_metricas), se relee cada 6 horas", estado: "real", nota: "Solo para piezas con su post identificado. Instagram informa seguidores ganados en carruseles y posts, no en reels." },
  { id: "isla.preview", nombre: "Vista previa", formula: "La miniatura del post de Instagram de esa pieza. El post se identifica cruzando quién lo comentó (muestra de hasta 30 comentarios por post, Apify) con los contactos que tienen la etiqueta de la pieza en ManyChat: gana la etiqueta con más comentaristas en común (al menos 2, y 5 o más o un cuarto de la muestra) y a no más de 7 días. Si todavía no hay comentarios bajados, se usa el único post del mismo día y tipo, avisando que no está confirmado", fuente: "radar_piezas (cuenta propia) + radar_comentarios_crudos + crm_piezas_instagram", estado: "real", nota: "El vínculo se actualiza todos los días (cron del radar, paso «vincular»). Una pieza sin post identificado muestra la placa «sin vista previa»." },
  { id: "captacion.hoy", nombre: "Captación hoy", formula: "Contactos de ManyChat cuya fecha de suscripción (hora Argentina) es hoy", fuente: "ManyChat (tarea cada 3 h)", estado: "real", nota: "Corte = última corrida de la tarea de ManyChat; puede atrasar hasta 3 horas." },
  { id: "espera", nombre: "Sala de espera", formula: "Contactos de los últimos 7 días sin la etiqueta ASIGNADO y sin agenda", fuente: "ManyChat + crm_identities + agendas", estado: "real", nota: "No distingue a quien solo pidió un recurso de quien quiere hablar: ManyChat no lo marca." },
  { id: "setters.conversando", nombre: "En conversación con setter", formula: "Contactos de los últimos 7 días con la etiqueta ASIGNADO y sin agenda", fuente: "ManyChat", estado: "real", nota: "ManyChat no dice qué setter tiene cada conversación en la etiqueta: se muestran juntos." },
  { id: "setters.conversaciones_mes", nombre: "Conversaciones asignadas del mes", formula: "Estadística del Inbox de ManyChat por agente", fuente: "metricas_manual (tipo conversaciones_asignadas)", estado: "real", nota: "" },
  { id: "setters.agendas", nombre: "Agendas del setter", formula: "Agendas con ese setter reservadas hoy / en los últimos 7 días (fecha_agenda)", fuente: "agendas", estado: "real", nota: "" },
  { id: "agendas.estado", nombre: "Estado de cada silla", formula: "Ver la tabla de estados", fuente: "agendas (show, cerro, call_confirmer, seguimiento_estado)", estado: "real", nota: "El estado en vivo de una llamada no existe en el CRM: «en horario» sale de la hora agendada." },
  { id: "seguimiento", nombre: "Seguimiento", formula: "Seguimientos en estado Activo o Reagendó; próximo FUP = la columna «próximo FUP» o, si está vacía, el primer FUP preparado sin hacer; vencido = próximo FUP anterior a hoy", fuente: "seguimientos", estado: "parcial", nota: "La mayoría no tiene próximo FUP cargado: se muestran como «sin fecha», no como al día." },
  { id: "clientes.nuevos", nombre: "Clientes nuevos (onboarding)", formula: "Clientes activos con fecha de ingreso en los últimos 30 días", fuente: "clientes", estado: "real", nota: "La etapa «onboarding_pendiente» no está mantenida (casi todos la tienen): por eso se usa la fecha de ingreso." },
  { id: "clientes.cuotas", nombre: "Cuotas vencidas", formula: "Ítems de planes de pago pendientes, sin pago enlazado y con fecha planeada anterior a hoy", fuente: "plan_pago_items + planes_pago", estado: "real", nota: "" },
  { id: "formacion.actividad", nombre: "Actividad en la formación", formula: "Clientes con actividad observada (Discord, Skool, clases)", fuente: "clientes.last_observed_activity_at / engagement_signal", estado: "no disponible", nota: "Hoy no hay ninguna fuente conectada: no se marca a nadie como dormido." },
] as const
