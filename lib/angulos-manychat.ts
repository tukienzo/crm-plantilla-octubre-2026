import type { SupabaseClient } from "@supabase/supabase-js"

// Medidor de ángulos de comunicación. Cada contacto de ManyChat trae sus etiquetas y el flujo
// nuevo etiqueta el ÁNGULO por el que entró (🟢 Solución · 🟣 Volumen/TOFU · 🔵 Producto · 🔴 Problema),
// la PIEZA concreta ("Tutorial - 🟢SOLUCIÓN - 15/3/2026", "Historia | Recurso - 20/3/26"),
// el FORMATO ("Formato Yapping") y la CATEGORÍA (REEL, CARRU, Historias | Mes, Nuevo Seguidor | Mes, ads).
// Acá se cruza cada etiqueta con las agendas del período (vía la identidad ManyChat de la persona) y
// con el cash cobrado a esa persona. Nada se inventa: lo que no tiene contacto de ManyChat cruzado
// aparece como cobertura, no como cero.

type Tag = { tag: string; leads: number; nuevos: number }
type Agenda = { id: string; person_id: string; nombre: string; fecha: string; show: boolean | null; cerro: boolean | null; calificacion: string | null; fuente: string | null; recurso: string | null; tags: string[]; cash: number }
type Clase = { tipo: "angulo" | "subangulo" | "pieza" | "formato" | "categoria" | "historia" | "otro"; nombre: string; angulo?: string; formato?: string; fecha?: string; categoria?: string }
// Métricas reales de Instagram del post de una pieza (radar_piezas_metricas, Graph API). El post se identifica por el
// cruce de comentaristas (lib/ciudad-vinculos.ts).
export type IgPieza = { url: string | null; producto: string | null; alcance: number | null; vistas: number | null; guardados: number | null; compartidos: number | null; interacciones: number | null; seguidores: number | null; visitas_perfil: number | null; tiempo_promedio_ms: number | null; leido_at: string; vinculo: string }
// Suma por ángulo, solo de las piezas que tienen métricas: numerador y denominador salen de las mismas piezas.
export type IgAngulo = { piezas: number; piezas_total: number; alcance: number; vistas: number; guardados: number; compartidos: number; seguidores: number; leads: number; agendas: number; cierres: number; cash: number }
export type Fila = { nombre: string; tag?: string; angulo?: string; formato?: string; categoria?: string; fecha?: string | null; leads: number; nuevos: number; agendas: number; presentadas: number; calificadas: number; cierres: number; cash: number; ultima: string | null; ig?: IgPieza | null; igAngulo?: IgAngulo | null }

const CALIF = new Set(["lead a", "lead b", "lead c", "a", "b", "c", "s"])
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre"]
const limpiar = (s: string) => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/\s+/g, " ").trim()
const norm = (s: string) => limpiar(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function anguloDe(t: string): string | null {
  const n = norm(t)
  if (/soluci/.test(n)) return "Solución"
  if (/volumen|tofu/.test(n)) return "Volumen/TOFU"
  if (/producto/.test(n)) return "Producto"
  if (/problema/.test(n)) return "Problema"
  return null
}
function fechaDe(t: string): string | null {
  const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/)
  if (!m) return null
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}
const CATEGORIAS: Array<[RegExp, string]> = [
  [/^reel/i, "Reel"], [/^carru/i, "Carrusel"], [/^historia/i, "Historia"], [/^ads/i, "Ads"], [/^nuevo seguidor/i, "Nuevo seguidor"], [/^webinar|masterclass/i, "Webinar"],
]
function categoriaDe(t: string): string | null {
  const n = norm(t)
  for (const [re, c] of CATEGORIAS) if (re.test(n)) return c
  return null
}

// Clasifica una etiqueta de ManyChat. Devuelve null para las que no hablan de comunicación (ASIGNADO, PC1, semanas, botones…).
export function clasificar(tag: string): Clase | null {
  const t = limpiar(tag)
  const n = norm(tag)
  let m: RegExpMatchArray | null
  if ((m = n.match(/^angulo\s+(solucion|volumen(?:\/tofu)?|producto|problema)\s*$/))) return { tipo: "angulo", nombre: anguloDe(t)!, angulo: anguloDe(t)! }
  if ((m = n.match(/^angulo\s+(solucion|volumen(?:\/tofu)?|producto|problema)\s*-\s*(.+)$/))) return { tipo: "subangulo", nombre: limpiar(t.split(/\s-\s/).slice(1).join(" - ")), angulo: anguloDe(t)! }
  // "Tutorial - 🟢SOLUCIÓN - 15/3/2026" · "Carru - 🟣VOLUMEN/TOFU - 18/3/2026" · "Talking head - 🔴PROBLEMA - 22/3/2026"
  if ((m = t.match(/^(.+?)\s*-\s*(?:solucion|solución|volumen(?:\/tofu)?|producto|problema)\s*-?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/i))) {
    const formato = limpiar(m[1])
    return { tipo: "pieza", nombre: `${formato} · ${anguloDe(t)} · ${m[2]}`, angulo: anguloDe(t)!, formato, fecha: fechaDe(t) || undefined, categoria: categoriaDe(formato) || (/carru/i.test(formato) ? "Carrusel" : "Reel") }
  }
  if ((m = n.match(/^formato\s+(.+)$/))) return { tipo: "formato", nombre: limpiar(t.replace(/^formato\s+/i, "")) }
  if (/^(reel|carru|historia|historias|ads|nuevo seguidor|leads?)\s*\|/.test(n)) {
    const resto = n.split("|").slice(1).join("|").trim()
    const esMes = MESES.some((mes) => resto.startsWith(mes)) || /^\d{4}$/.test(resto)
    const cat = categoriaDe(t)
    if (esMes || !resto) return cat ? { tipo: "categoria", nombre: cat } : null
    if (cat === "Historia") return { tipo: "historia", nombre: limpiar(t.split("|").slice(1).join("|")), categoria: "Historia", fecha: fechaDe(t) || undefined }
    return cat ? { tipo: "pieza", nombre: limpiar(t.split("|").slice(1).join("|")), formato: cat, categoria: cat, fecha: fechaDe(t) || undefined } : null
  }
  if (/^(reel|carru|historia)$/.test(n)) return { tipo: "categoria", nombre: categoriaDe(t)! }
  return null
}

const filaVacia = (nombre: string, extra: Partial<Fila> = {}): Fila => ({ nombre, leads: 0, nuevos: 0, agendas: 0, presentadas: 0, calificadas: 0, cierres: 0, cash: 0, ultima: null, ...extra })

// Medición de ángulos, piezas, formatos e historias en una ventana de días. La usan /api/angulos-manychat y la ciudad.
export async function medirAngulos(sb: SupabaseClient, dias: number) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10)
  // la consulta es pesada y en frío a veces corta por tiempo: un reintento antes de fallar
  let { data, error } = await sb.rpc("crm_angulos_manychat", { p_desde: desde })
  if (error && /timeout/i.test(error.message)) ({ data, error } = await sb.rpc("crm_angulos_manychat", { p_desde: desde }))
  if (error) throw new Error(error.message)
  const tags: Tag[] = data?.tags || []
  const agendas: Agenda[] = data?.agendas || []
  const angulosBase: Array<{ tipo: string; leads: number; nuevos: number }> = data?.angulos || []

  // cash: una persona puede tener varias agendas en el período; la plata se cuenta una sola vez (en la última agenda)
  const ultimaPorPersona = new Map<string, Agenda>()
  for (const a of agendas) { const u = ultimaPorPersona.get(a.person_id); if (!u || a.fecha > u.fecha) ultimaPorPersona.set(a.person_id, a) }
  const cashDe = (a: Agenda) => (ultimaPorPersona.get(a.person_id)?.id === a.id ? Number(a.cash || 0) : 0)

  const grupos: Record<Clase["tipo"], Map<string, Fila>> = { angulo: new Map(), subangulo: new Map(), pieza: new Map(), formato: new Map(), categoria: new Map(), historia: new Map(), otro: new Map() }
  const claseDeTag = new Map<string, Clase>()
  for (const t of tags) {
    const c = clasificar(t.tag)
    if (!c) continue
    claseDeTag.set(t.tag, c)
    if (c.tipo === "angulo") continue  // los tipos de ángulo se arman por contacto (abajo), no por etiqueta
    const g = grupos[c.tipo]
    const f = g.get(c.nombre) || filaVacia(c.nombre, { tag: t.tag, angulo: c.angulo, formato: c.formato, categoria: c.categoria, fecha: c.fecha || null })
    f.leads += t.leads; f.nuevos += t.nuevos
    g.set(c.nombre, f)
  }
  for (const b of angulosBase) grupos.angulo.set(b.tipo, filaVacia(b.tipo, { angulo: b.tipo, leads: b.leads, nuevos: b.nuevos }))

  let conTags = 0
  const sumar = (f: Fila | undefined, a: Agenda) => {
    if (!f) return
    f.agendas++
    if (a.show === true) f.presentadas++
    if (CALIF.has(String(a.calificacion || "").toLowerCase().trim())) f.calificadas++
    if (a.cerro) f.cierres++
    f.cash += cashDe(a)
    if (!f.ultima || a.fecha > f.ultima) f.ultima = a.fecha
  }
  for (const a of agendas) {
    const ts = Array.isArray(a.tags) ? a.tags : []
    if (ts.length) conTags++
    const vistos = new Set<string>()
    const angulosPersona = new Set<string>()
    for (const tag of ts) {
      const c = claseDeTag.get(tag) || clasificar(tag)
      if (!c) continue
      if (c.angulo) angulosPersona.add(c.angulo)
      if (c.tipo === "angulo") continue
      const k = `${c.tipo}:${c.nombre}`
      if (vistos.has(k)) continue
      vistos.add(k)
      const g = grupos[c.tipo]
      if (!g.has(c.nombre)) g.set(c.nombre, filaVacia(c.nombre, { tag, angulo: c.angulo, formato: c.formato, categoria: c.categoria, fecha: c.fecha || null }))
      sumar(g.get(c.nombre), a)
    }
    for (const ang of angulosPersona) {
      if (!grupos.angulo.has(ang)) grupos.angulo.set(ang, filaVacia(ang, { angulo: ang }))
      sumar(grupos.angulo.get(ang), a)
    }
  }
  // métricas reales de Instagram de cada pieza y su suma por ángulo
  const { data: vinc } = await sb.from("crm_piezas_instagram").select("etiqueta,radar_pieza_id,coincidencias,comentaristas")
  const vinculo = new Map<string, { radar_pieza_id: string; coincidencias: number; comentaristas: number }>()
  for (const v of vinc || []) {
    const nombre = clasificar(v.etiqueta)?.nombre
    const ya = nombre ? vinculo.get(nombre) : undefined
    if (nombre && (!ya || v.coincidencias > ya.coincidencias)) vinculo.set(nombre, v)
  }
  const ids = [...new Set([...vinculo.values()].map((v) => v.radar_pieza_id))]
  const metricas = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < ids.length; i += 200) {
    const [{ data: ms }, { data: ps }] = await Promise.all([
      sb.from("radar_piezas_metricas").select("pieza_id,producto,alcance,vistas,guardados,compartidos,interacciones,seguidores,visitas_perfil,tiempo_promedio_ms,leido_at").in("pieza_id", ids.slice(i, i + 200)),
      sb.from("radar_piezas").select("id,url").in("id", ids.slice(i, i + 200)),
    ])
    const url = new Map((ps || []).map((p) => [String(p.id), p.url as string]))
    for (const m of ms || []) metricas.set(String(m.pieza_id), { ...m, url: url.get(String(m.pieza_id)) || null })
  }
  for (const f of grupos.pieza.values()) {
    const v = vinculo.get(f.nombre)
    const m = v ? metricas.get(v.radar_pieza_id) : undefined
    f.ig = m && v ? { ...(m as unknown as Omit<IgPieza, "vinculo">), vinculo: `${v.coincidencias} de ${v.comentaristas} comentaristas` } : null
  }
  for (const a of grupos.angulo.values()) {
    const suyas = [...grupos.pieza.values()].filter((f) => f.angulo === a.nombre)
    const con = suyas.filter((f) => f.ig?.alcance)
    const suma = (k: (f: Fila) => number) => con.reduce((t, f) => t + k(f), 0)
    a.igAngulo = {
      piezas: con.length, piezas_total: suyas.length,
      alcance: suma((f) => f.ig?.alcance || 0), vistas: suma((f) => f.ig?.vistas || 0), guardados: suma((f) => f.ig?.guardados || 0),
      compartidos: suma((f) => f.ig?.compartidos || 0), seguidores: suma((f) => f.ig?.seguidores || 0),
      leads: suma((f) => f.leads), agendas: suma((f) => f.agendas), cierres: suma((f) => f.cierres), cash: suma((f) => f.cash),
    }
  }

  const orden = (a: Fila, b: Fila) => b.cash - a.cash || b.cierres - a.cierres || b.agendas - a.agendas || b.leads - a.leads
  const lista = (g: Map<string, Fila>, min = 0) => [...g.values()].filter((f) => f.leads + f.agendas >= min).sort(orden)
  return {
    desde, dias,
    cobertura: { contactos: data?.contactos || 0, contactosNuevos: data?.contactos_nuevos || 0, agendas: agendas.length + Number(data?.agendas_sin_persona || 0), conPersona: agendas.length, conTags, cash: [...ultimaPorPersona.values()].reduce((t, a) => t + Number(a.cash || 0), 0) },
    angulos: lista(grupos.angulo), subangulos: lista(grupos.subangulo, 3), piezas: lista(grupos.pieza, 3), formatos: lista(grupos.formato, 3), categorias: lista(grupos.categoria), historias: lista(grupos.historia, 2),
  }
}
