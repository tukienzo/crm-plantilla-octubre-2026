// Cruce lead del reporte del setter → agenda del CRM. Misma lógica que el importador
// de reportes de setting, portada a TS para el generador de resúmenes: usuario de
// Instagram exacto, nombre exacto, tokens del nombre,
// prefijo/raíz del usuario, y como último recurso nombre de pila cerca en fecha.
// Nunca adivina: si hay dos candidatas pegadas, no cruza.

export type AgendaCruce = {
  id: string; nombre: string | null; instagram: string | null; fecha: string | null; person_id: string | null
  fuente: string | null; recurso: string | null; angulo_entrada: string | null; problema_actual: string | null; motivo_urgencia: string | null; setter: string | null
}
export type LeadReporte = {
  lead: string; usuario?: string | null; nombre?: string | null; origen?: string | null; calificado?: boolean | null; ciclo?: string | null
  // `feed` es la lista de piezas de contenido que consumió. Los reportes viejos lo guardaron como
  // un texto suelto, así que se aceptan las dos formas.
  gatillo?: string | null; feed?: string[] | string | null; fups?: number | null
  situacion?: string | null; dolor?: string | null; objetivo?: string | null
  sintesis_closer?: string | null; caso_exito?: string | null; material_enviado?: string | null; historial?: string | null
  agenda_id?: string | null; agenda_nombre?: string | null; cruce?: string | null
}

export const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
const alnum = (s: unknown) => norm(s).replace(/[^a-z0-9]/g, "")
const tokens = (s: unknown) => norm(s).split(/[^a-z0-9]+/).filter(Boolean)
function core(h: unknown) {
  let x = norm(h).replace(/@/g, "").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
  x = x.split(/[_.\s]/)[0] || ""
  const sinDigitos = x.replace(/\d+$/, "")
  return sinDigitos.length >= 4 ? sinDigitos : x
}
function parecidos(a: string, b: string) {
  if (!a || !b) return false
  if (a === b) return true
  if (Math.min(a.length, b.length) >= 4) {
    let pref = 0
    while (pref < a.length && pref < b.length && a[pref] === b[pref]) pref++
    if (pref >= Math.max(4, 0.7 * Math.min(a.length, b.length))) return true
  }
  if (a.length < 5 || b.length < 5) return false
  // parecido tipo difflib: bigramas en común
  const bg = (s: string) => { const out = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); out.set(k, (out.get(k) || 0) + 1) } return out }
  const A = bg(a), B = bg(b)
  let comun = 0
  for (const [k, v] of A) comun += Math.min(v, B.get(k) || 0)
  return (2 * comun) / ((a.length - 1) + (b.length - 1)) >= 0.8
}
export function familia(x: unknown) {
  const f = norm(x)
  for (const [clave, fam] of [["webinar", "webinar"], ["ads", "ads"], ["historia", "story"], ["story", "story"], ["reel", "reel"], ["carrusel", "carrusel"], ["seguidor", "outbound"], ["outbound", "outbound"]] as const) if (f.includes(clave)) return fam
  return null
}
export function fuenteDe(origen: unknown, gatillo: unknown): [string | null, string | null] {
  const o = norm(origen), g = norm(gatillo)
  if (o.includes("ads")) return ["DM-ADS", null]
  if (o.includes("historia") || g.includes("historia")) return ["Instagram Story", "Historia"]
  if (o.includes("nuevo seguidor") && !o.includes("reel")) return ["Outbound Seguidor", "Nuevo seguidor"]
  if (o.includes("outbound")) return ["Outbound Story", null]
  if (o.includes("reel") || g.includes("reel")) return ["Instagram Reel", "Reel"]
  if (o.includes("carrusel") || g.includes("carrusel")) return ["Instagram Carrusel", "Carrusel"]
  return [null, null]
}

function puntajeBase(l: LeadReporte, a: AgendaCruce): [number, string] {
  const igA = norm(a.instagram).replace(/@/g, ""), nombreA = norm(a.nombre)
  const usuario = norm(l.usuario || l.lead).replace(/@/g, ""), nombre = norm(l.nombre || l.lead)
  if (usuario && igA && alnum(usuario) === alnum(igA)) return [100, "usuario"]
  if (nombre && nombre === nombreA) return [95, "nombre"]
  const ua = alnum(usuario), ia = alnum(igA)
  if (ua.length >= 6 && ia.length >= 6 && (ua.startsWith(ia) || ia.startsWith(ua))) return [90, "usuario (prefijo)"]
  const tl = new Set(tokens(`${usuario} ${nombre}`).filter((t) => t.length >= 2))
  const ta = new Set(tokens(nombreA).filter((t) => t.length >= 2))
  const inter = [...tl].filter((t) => ta.has(t))
  const sub = (x: Set<string>, y: Set<string>) => [...x].every((t) => y.has(t))
  if (tl.size >= 2 && ta.size >= 2 && (sub(tl, ta) || sub(ta, tl) || inter.length >= 2)) return [85, "nombre (tokens)"]
  if (tl.size >= 2 && ta.size >= 2) {
    const pares = [...tl].filter((x) => [...ta].some((y) => parecidos(x, y))).length
    if (pares >= 2) return [80, "nombre (parecido)"]
  }
  const textoLead = alnum(`${usuario} ${nombre}`)
  if (ta.size >= 2 && [...ta].every((t) => t.length >= 3 && textoLead.includes(t))) return [80, "nombre dentro del lead"]
  if (igA && core(usuario).length >= 5 && core(usuario) === core(igA)) return [80, "usuario (raíz)"]
  if (igA && ua.length >= 5 && ia.includes(ua)) return [75, "usuario dentro del ig"]
  if (igA && core(usuario) && core(igA) && parecidos(core(usuario), core(igA))) return [70, "usuario (parecido)"]
  const pilaA = tokens(nombreA)[0] || ""
  for (const x of tokens(`${usuario} ${nombre}`).filter((t) => t.length >= 3)) {
    if (x === pilaA) return [55, "nombre de pila"]
    if (x.length >= 4 && parecidos(x, pilaA)) return [50, "nombre de pila (parecido)"]
    if (igA && x.length >= 4 && parecidos(x, core(igA))) return [50, "usuario ~ nombre de pila"]
  }
  return [0, ""]
}
function puntaje(l: LeadReporte, a: AgendaCruce): [number, string] {
  const [p, motivo] = puntajeBase(l, a)
  if (!p || p === 100) return [p, motivo]
  const fl = familia(l.origen), fa = familia(a.fuente)
  return [fl && fa ? p + (fl === fa ? 5 : -5) : p, motivo]
}

const dias = (a: string | null, b: Date) => (a ? Math.abs((new Date(a).getTime() - b.getTime()) / 86400000) : 99)

export type ResultadoCruce = { agenda: AgendaCruce | null; motivo: string; puntos: number; ambiguo?: string }
export function cruzarLead(l: LeadReporte, fechaDia: string, agendas: AgendaCruce[]): ResultadoCruce {
  const fdia = new Date(fechaDia)
  const mono = new Set(tokens(`${l.usuario || l.lead} ${l.nombre || l.lead}`)).size === 1
  const cands: Array<{ p: number; dist: number; a: AgendaCruce; motivo: string }> = []
  for (const a of agendas) {
    const dist = dias(a.fecha, fdia)
    if (dist > 10) continue
    const [p, motivo] = puntaje(l, a)
    if (!p) continue
    if (p < 70 && (dist > 3 || norm(a.fuente) === "webinar")) continue
    if (mono && p < 100 && dist > 3) continue
    cands.push({ p, dist, a, motivo })
  }
  if (!cands.length) return { agenda: null, motivo: "sin agenda", puntos: 0 }
  cands.sort((x, y) => y.p - x.p || x.dist - y.dist)
  if (cands.length > 1 && cands[0].p < 70 && cands[0].p - cands[1].p < 10 && cands[1].dist - cands[0].dist < 2) {
    return { agenda: null, motivo: "ambiguo", puntos: cands[0].p, ambiguo: `${cands[0].a.nombre} / ${cands[1].a.nombre}` }
  }
  return { agenda: cands[0].a, motivo: cands[0].motivo, puntos: cands[0].p }
}

// Qué campos vacíos de la agenda completa este lead del reporte
export function parchesDe(l: LeadReporte, a: AgendaCruce, setter: string) {
  const [fuente, recurso] = fuenteDe(l.origen, l.gatillo)
  const feed = Array.isArray(l.feed) ? l.feed.filter(Boolean).join(" · ") : l.feed
  const gatillo = [l.gatillo, feed].filter(Boolean).join(" · ")
  const p: Record<string, string> = {}
  if (l.dolor && !a.problema_actual) p.problema_actual = String(l.dolor).slice(0, 500)
  if (l.objetivo && !a.motivo_urgencia) p.motivo_urgencia = String(l.objetivo).slice(0, 300)
  if (gatillo && !a.angulo_entrada) p.angulo_entrada = gatillo.slice(0, 300)
  if (recurso && !a.recurso) p.recurso = recurso
  if (fuente && !a.fuente) p.fuente = fuente
  if (!a.setter && setter) p.setter = setter
  return p
}
export const semanaDe = (fecha: string) => String(Math.min(5, Math.floor((Number(fecha.slice(8, 10)) - 1) / 7) + 1))
