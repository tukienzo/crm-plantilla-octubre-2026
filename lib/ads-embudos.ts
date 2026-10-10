// Inversión en Meta Ads por embudo, guardada en el CRM (tablas ads_campanas_mes y ads_meses).
//  · Se lee de la Graph API campaña por campaña (META_ADS_ACCESS_TOKEN + META_ADS_ACCOUNT_ID, la misma cuenta de
//    lib/meta-spend.ts) y se guarda por mes.
//  · El embudo sale del nombre de la campaña: las que dicen "webinar" o "masterclass" (o empiezan con alguna de las
//    palabras de ADS_PALABRAS_WEBINAR, por ejemplo "mc-,clase") son del webinar; las que dicen "outbound" o
//    "prospección", del outbound; el resto (tráfico al perfil, boosts) potencia el orgánico. Si alguien lo cambia a
//    mano en Ventas → Embudos, queda fijo para esa campaña en todos los meses.
//  · El mes en curso (y los primeros días del siguiente, mientras Meta termina de cerrar el gasto) se refresca cada 3 h;
//    los meses cerrados quedan guardados y no se vuelven a pedir.

import type { SupabaseClient } from "@supabase/supabase-js"

export const EMBUDOS_ADS = ["Webinar", "Orgánico", "Outbound"] as const
export type EmbudoAds = (typeof EMBUDOS_ADS)[number]

export type CampanaMes = {
  mes: string; campaign_id: string; campaign_name: string | null; objetivo: string | null
  embudo: string; embudo_manual: boolean; spend: number; impresiones: number | null; clics: number | null; alcance: number | null; actualizado: string
}
export type AdsMes = { mes: string; total: number; por_embudo: Record<string, number>; campanas: CampanaMes[]; actualizado: string | null; fuente: string; error?: string }

const REFRESCO_MS = 3 * 3600 * 1000

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
// Palabras extra (separadas por coma) con las que nombrás tus campañas de webinar. Opcional.
const PALABRAS_WEBINAR = String(process.env.ADS_PALABRAS_WEBINAR || "").split(",").map(sinTildes).filter(Boolean)

export function embudoDeCampana(nombre: string | null | undefined): EmbudoAds {
  const n = sinTildes(String(nombre || ""))
  if (/webinar|masterclass/.test(n) || PALABRAS_WEBINAR.some((p) => n.startsWith(p) || n.includes(` ${p}`))) return "Webinar"
  if (/outbound|prospecc/.test(n)) return "Outbound"
  return "Orgánico"
}

function rango(mes: string) {
  const [y, m] = mes.split("-").map(Number)
  const fin = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { since: `${mes}-01`, until: `${mes}-${String(fin).padStart(2, "0")}` }
}

// ¿el gasto de este mes todavía se puede mover? (mes en curso, o terminó hace menos de 3 días)
function mesAbierto(mes: string) {
  const [y, m] = mes.split("-").map(Number)
  return Date.now() < Date.UTC(y, m, 1) + 3 * 86400000
}

type FilaMeta = { campaign_id: string; campaign_name?: string; objective?: string; spend?: string; impressions?: string; clicks?: string; reach?: string }

async function leerMeta(mes: string): Promise<FilaMeta[]> {
  const token = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN
  const cuenta = process.env.META_ADS_ACCOUNT_ID
  if (!token || !cuenta) throw new Error("Falta META_ADS_ACCESS_TOKEN o META_ADS_ACCOUNT_ID")
  const filas: FilaMeta[] = []
  let url: string | null = `https://graph.facebook.com/v21.0/${cuenta}/insights?` + new URLSearchParams({
    level: "campaign", fields: "campaign_id,campaign_name,objective,spend,impressions,clicks,reach",
    time_range: JSON.stringify(rango(mes)), limit: "200", access_token: token,
  })
  for (let i = 0; url && i < 10; i++) {
    const r: Response = await fetch(url, { cache: "no-store" })
    const j = await r.json() as { data?: FilaMeta[]; paging?: { next?: string }; error?: { message?: string } }
    if (!r.ok || j.error) throw new Error(`Meta: ${j.error?.message || r.status}`)
    filas.push(...(j.data || []))
    url = j.paging?.next || null
  }
  return filas
}

// Trae el mes de Meta y lo guarda. Respeta los embudos que se cambiaron a mano (en ese mes o en cualquier otro).
export async function sincronizarAdsMes(sb: SupabaseClient, mes: string) {
  const meta = await leerMeta(mes)
  const ids = meta.map((f) => f.campaign_id)
  const manuales = new Map<string, string>()
  if (ids.length) {
    const { data } = await sb.from("ads_campanas_mes").select("campaign_id,embudo,actualizado").in("campaign_id", ids).eq("embudo_manual", true).order("actualizado", { ascending: true })
    for (const r of data || []) manuales.set(r.campaign_id, r.embudo)
  }
  const ahora = new Date().toISOString()
  const filas = meta.map((f) => ({
    mes, campaign_id: f.campaign_id, campaign_name: f.campaign_name || null, objetivo: f.objective || null,
    embudo: manuales.get(f.campaign_id) || embudoDeCampana(f.campaign_name), embudo_manual: manuales.has(f.campaign_id),
    spend: Math.round(Number(f.spend || 0) * 100) / 100,
    impresiones: f.impressions ? Number(f.impressions) : null, clics: f.clicks ? Number(f.clicks) : null, alcance: f.reach ? Number(f.reach) : null,
    actualizado: ahora,
  }))
  const borrar = sb.from("ads_campanas_mes").delete().eq("mes", mes)
  const { error: eb } = ids.length ? await borrar.not("campaign_id", "in", `(${ids.map((x) => `"${x}"`).join(",")})`) : await borrar
  if (eb) throw new Error(eb.message)
  if (filas.length) {
    const { error } = await sb.from("ads_campanas_mes").upsert(filas, { onConflict: "mes,campaign_id" })
    if (error) throw new Error(error.message)
  }
  const total = Math.round(filas.reduce((s, f) => s + f.spend, 0) * 100) / 100
  const { error: em } = await sb.from("ads_meses").upsert({ mes, total, fuente: "meta", actualizado: ahora }, { onConflict: "mes" })
  if (em) throw new Error(em.message)
  return { mes, total, campanas: filas.length }
}

// Inversión de varios meses, ya separada por embudo. Si un mes nunca se trajo o está abierto y viejo, lo trae antes.
// Si Meta falla, devuelve lo guardado con el error anotado (la página sigue andando).
export async function inversionAds(sb: SupabaseClient, meses: string[], opciones: { forzar?: boolean } = {}): Promise<Record<string, AdsMes>> {
  const { data: guardados } = await sb.from("ads_meses").select("mes,total,fuente,actualizado").in("mes", meses)
  const porMes = new Map((guardados || []).map((g) => [g.mes as string, g]))
  const errores = new Map<string, string>()
  const hoy = new Date().toISOString().slice(0, 7)
  for (const mes of meses) {
    if (mes > hoy) continue
    const g = porMes.get(mes)
    const viejo = !g || (mesAbierto(mes) && Date.now() - new Date(g.actualizado).getTime() > REFRESCO_MS)
    if (!opciones.forzar && !viejo) continue
    try { await sincronizarAdsMes(sb, mes) } catch (e) { errores.set(mes, (e as Error).message) }
  }
  const [{ data: cab }, { data: camp }] = await Promise.all([
    sb.from("ads_meses").select("mes,total,fuente,actualizado").in("mes", meses),
    sb.from("ads_campanas_mes").select("*").in("mes", meses).order("spend", { ascending: false }),
  ])
  const out: Record<string, AdsMes> = {}
  for (const mes of meses) {
    const c = (cab || []).find((x) => x.mes === mes)
    const campanas = ((camp || []) as CampanaMes[]).filter((x) => x.mes === mes).map((x) => ({ ...x, spend: Number(x.spend) }))
    const por_embudo: Record<string, number> = Object.fromEntries(EMBUDOS_ADS.map((e) => [e, 0]))
    for (const x of campanas) por_embudo[x.embudo] = Math.round(((por_embudo[x.embudo] || 0) + x.spend) * 100) / 100
    out[mes] = { mes, total: c ? Number(c.total) : 0, por_embudo, campanas, actualizado: c?.actualizado || null, fuente: c?.fuente || "meta", ...(errores.has(mes) ? { error: errores.get(mes) } : {}) }
  }
  return out
}

// Gasto en Meta de un rango cualquiera (una semana, un rango libre) separado por embudo, leyendo campaña por campaña.
// Usa los embudos cambiados a mano en Ventas → Embudos. Lo usa Operaciones → Métricas cuando se filtra por embudo.
export async function gastoAdsPorEmbudo(sb: SupabaseClient, desde: string, hasta: string): Promise<Record<string, number>> {
  const token = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN
  const cuenta = process.env.META_ADS_ACCOUNT_ID
  if (!token || !cuenta) throw new Error("Falta META_ADS_ACCESS_TOKEN o META_ADS_ACCOUNT_ID")
  const r = await fetch(`https://graph.facebook.com/v21.0/${cuenta}/insights?` + new URLSearchParams({
    level: "campaign", fields: "campaign_id,campaign_name,spend", time_range: JSON.stringify({ since: desde.slice(0, 10), until: hasta.slice(0, 10) }), limit: "200", access_token: token,
  }), { next: { revalidate: 300 } })
  const j = await r.json() as { data?: FilaMeta[]; error?: { message?: string } }
  if (!r.ok || j.error) throw new Error(`Meta: ${j.error?.message || r.status}`)
  const filas = j.data || []
  const manuales = new Map<string, string>()
  if (filas.length) {
    const { data } = await sb.from("ads_campanas_mes").select("campaign_id,embudo").in("campaign_id", filas.map((f) => f.campaign_id)).eq("embudo_manual", true)
    for (const x of data || []) manuales.set(x.campaign_id, x.embudo)
  }
  const out: Record<string, number> = Object.fromEntries(EMBUDOS_ADS.map((e) => [e, 0]))
  for (const f of filas) {
    const e = manuales.get(f.campaign_id) || embudoDeCampana(f.campaign_name)
    out[e] = Math.round(((out[e] || 0) + Number(f.spend || 0)) * 100) / 100
  }
  return out
}
