import type { SupabaseClient } from "@supabase/supabase-js"
import { clasificar } from "@/lib/angulos-manychat"
import { lanzarComentarios } from "@/lib/radar/ingesta"
import { BRAND } from "@/lib/brand"

// Qué publicación de Instagram es cada pieza de ManyChat. ManyChat no guarda el post de cada automatización, así que
// se cruza la evidencia: los que comentaron un post propio (radar_comentarios_crudos, bajados con Apify) contra los
// contactos que tienen cada etiqueta de pieza ("Pieza de ejemplo - 🟢SOLUCIÓN - 15/3/2026"). Gana la etiqueta con más
// comentaristas en común (al menos 2, y 5 o más o un cuarto de la muestra), a no más de 7 días de la publicación y
// una sola etiqueta por post. Los vínculos que dejan de cumplir se borran.

// Cuenta propia (NEXT_PUBLIC_BRAND_IG_HANDLE). Sin cuenta configurada no hay posts propios y no se vincula nada.
const PROPIA = BRAND.igHandle
const norm = (s: unknown) => String(s || "").trim().toLowerCase().replace(/^@/, "")
const diaArt = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10)
const dias = (a: string, b: string) => Math.abs(new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 864e5

export async function vincularPiezas(db: SupabaseClient, o: { dias?: number; lanzar?: boolean; porPieza?: number; pedidaPor?: string } = {}) {
  const ventana = o.dias || 45
  const desde = new Date(Date.now() - ventana * 864e5).toISOString()
  const { data: piezas, error } = await db.from("radar_piezas").select("id,url,fecha,tipo_media,comentarios").eq("cuenta", PROPIA).gte("fecha", desde)
  if (error) throw new Error(error.message)
  const lista = piezas || []

  // comentaristas de cada post (sin la cuenta propia)
  const coment = new Map<string, Set<string>>()
  const ids = lista.map((p) => String(p.id))
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from("radar_comentarios_crudos").select("pieza_id,usuario").in("pieza_id", ids.slice(i, i + 100)).limit(10000)
    for (const c of data || []) {
      const u = norm(c.usuario)
      if (!u || u === PROPIA) continue
      const k = String(c.pieza_id)
      if (!coment.has(k)) coment.set(k, new Set())
      coment.get(k)!.add(u)
    }
  }

  // los posts con comentarios que todavía no se bajaron se piden a Apify (los recoge el ciclo del radar)
  // también se repiden los posts de los últimos 4 días con pocos comentarios guardados: al bajarlos recién publicados
  // la muestra suele ser chica y el vínculo, flojo
  const reciente = (f: string | null) => Boolean(f && Date.now() - new Date(f).getTime() < 4 * 864e5)
  const pendientes = lista.filter((p) => Number(p.comentarios || 0) > 2 && (!coment.has(String(p.id)) || (reciente(p.fecha) && (coment.get(String(p.id))?.size || 0) < 8 && Number(p.comentarios) > (coment.get(String(p.id))?.size || 0)))).map((p) => String(p.id))
  const lanzada = o.lanzar && pendientes.length ? await lanzarComentarios(db, { cuenta: PROPIA, ids: pendientes, porPieza: o.porPieza || 30, dias: ventana, pedidaPor: o.pedidaPor || "ciudad: vincular piezas" }) : null

  // etiquetas de pieza de esos comentaristas en ManyChat
  const usuarios = [...new Set([...coment.values()].flatMap((s) => [...s]))]
  const tagsDe = new Map<string, string[]>()
  for (let i = 0; i < usuarios.length; i += 150) {
    const { data, error: e } = await db.from("crm_integration_assets").select("ig:metadata->>ig,tags:metadata->tags")
      .eq("source", "manychat").eq("asset_type", "subscriber").in("metadata->>ig", usuarios.slice(i, i + 150))
    if (e) throw new Error(e.message)
    for (const r of (data || []) as Array<{ ig: string | null; tags: string[] | null }>) {
      const piezasTag = (Array.isArray(r.tags) ? r.tags : []).filter((t) => { const c = clasificar(String(t)); return c?.tipo === "pieza" && c.categoria !== "Historia" })
      if (r.ig) tagsDe.set(norm(r.ig), [...(tagsDe.get(norm(r.ig)) || []), ...piezasTag.map(String)])
    }
  }

  const pares: Array<{ id: string; url: string | null; etiqueta: string; n: number; total: number }> = []
  for (const p of lista) {
    const cs = coment.get(String(p.id))
    if (!cs) continue
    const cuenta = new Map<string, number>()
    for (const u of cs) for (const t of new Set(tagsDe.get(u) || [])) cuenta.set(t, (cuenta.get(t) || 0) + 1)
    for (const [t, n] of cuenta) {
      const f = clasificar(t)?.fecha
      if (f && p.fecha && dias(f, diaArt(p.fecha)) > 7) continue
      pares.push({ id: String(p.id), url: p.url || null, etiqueta: t, n, total: cs.size })
    }
  }
  pares.sort((a, b) => b.n - a.n || b.n / b.total - a.n / a.total)
  const usadosP = new Set<string>(), usadasT = new Set<string>()
  const filas: Array<{ etiqueta: string; radar_pieza_id: string; url: string | null; coincidencias: number; comentaristas: number; metodo: string; actualizado: string }> = []
  for (const x of pares) {
    // al menos 2 en común y que sean una parte real de los comentaristas (5 o más, o un cuarto de la muestra)
    if (x.n < 2 || (x.n < 5 && x.n / x.total < 0.25) || usadosP.has(x.id) || usadasT.has(x.etiqueta)) continue
    usadosP.add(x.id); usadasT.add(x.etiqueta)
    filas.push({ etiqueta: x.etiqueta, radar_pieza_id: x.id, url: x.url, coincidencias: x.n, comentaristas: x.total, metodo: "comentaristas", actualizado: new Date().toISOString() })
  }
  if (filas.length) {
    const { error: e } = await db.from("crm_piezas_instagram").upsert(filas, { onConflict: "etiqueta" })
    if (e) throw new Error(e.message)
  }
  // un post con comentarios que ya no sostiene su vínculo (o lo ganó otra etiqueta) se desvincula
  const conMuestra = [...coment.keys()]
  if (conMuestra.length) {
    const { data: viejos } = await db.from("crm_piezas_instagram").select("etiqueta,radar_pieza_id").in("radar_pieza_id", conMuestra)
    const vigentes = new Set(filas.map((f) => `${f.etiqueta}|${f.radar_pieza_id}`))
    const sobran = (viejos || []).filter((v) => !vigentes.has(`${v.etiqueta}|${v.radar_pieza_id}`)).map((v) => v.etiqueta)
    if (sobran.length) await db.from("crm_piezas_instagram").delete().in("etiqueta", sobran)
  }
  return {
    ok: true, posts: lista.length, con_comentarios: coment.size, comentaristas: usuarios.length, contactos: tagsDe.size,
    pendientes: pendientes.length, lanzada, vinculadas: filas.length,
    detalle: filas.map((f) => `${f.etiqueta} → ${f.url} (${f.coincidencias} de ${f.comentaristas})`),
  }
}
