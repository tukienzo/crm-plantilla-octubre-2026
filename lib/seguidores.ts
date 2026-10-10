// Costo por seguidor.
//
// Meta no informa seguidores en las campañas de tráfico al perfil (son campañas de tráfico a una URL), así que el
// costo se arma con:
//   · seguidores nuevos del día   → ManyChat etiqueta "Nuevo Seguidor | <mes>" (tabla crm_seguidores_dia, la carga el
//                                   importador local cada 3 horas)
//   · total de seguidores         → foto diaria de la cuenta propia con Apify (paso "seguidores" del Radar, 00:05 ART);
//                                   la resta entre dos días es el crecimiento neto (descuenta a los que dejan de seguir)
//   · gasto                       → Meta, día por día, solo campañas del embudo Orgánico (las que no son del webinar;
//                                   respeta los embudos cambiados a mano en Ventas → Embudos)
// Es un costo MEZCLADO: divide lo pautado por todos los seguidores nuevos, también los que llegaron por orgánico.
// El seguidor pagado sale más caro, pero Meta no permite separarlo con esta campaña.

import type { SupabaseClient } from "@supabase/supabase-js"
import { ACTORES, correrActorSync } from "./radar/apify"
import { embudoDeCampana } from "./ads-embudos"

const r2 = (n: number) => Math.round(n * 100) / 100
const hoyART = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)

// Foto del total de seguidores de la cuenta propia (las semillas del Radar con tag "propia").
export async function fotoSeguidores(db: SupabaseClient) {
  const { data: propias } = await db.from("radar_semillas").select("handle").contains("tags", ["propia"])
  const handles = (propias || []).map((s) => String(s.handle))
  if (!handles.length) return { ok: false, motivo: "no hay cuenta propia en el Radar (semilla con tag 'propia')" }
  const items = await correrActorSync<{ username?: string; followersCount?: number }>(ACTORES.perfiles(), { usernames: handles }, 120)
  const yo = items.find((x) => handles.includes(String(x.username || "").toLowerCase())) || items[0]
  const total = Number(yo?.followersCount)
  if (!Number.isFinite(total) || total <= 0) return { ok: false, motivo: "Apify no devolvió el total de seguidores" }
  const ahora = new Date().toISOString()
  const { error } = await db.from("crm_seguidores_dia").upsert({ dia: hoyART(), seguidores_total: total, seguidores_at: ahora, actualizado: ahora }, { onConflict: "dia" })
  if (error) throw new Error(error.message)
  await db.from("radar_semillas").update({ seguidores: total, perfil_at: ahora }).eq("handle", yo?.username || handles[0])
  return { ok: true, cuenta: yo?.username || handles[0], seguidores: total, dia: hoyART() }
}

// Gasto diario de Meta de las campañas de un embudo (por defecto, el orgánico).
async function gastoDiario(db: SupabaseClient, desde: string, hasta: string, embudo = "Orgánico") {
  const token = process.env.META_ADS_ACCESS_TOKEN || process.env.META_CAPI_ACCESS_TOKEN
  const cuenta = process.env.META_ADS_ACCOUNT_ID
  if (!token || !cuenta) throw new Error("Falta META_ADS_ACCESS_TOKEN o META_ADS_ACCOUNT_ID")
  type Fila = { date_start: string; campaign_id: string; campaign_name?: string; spend?: string }
  const filas: Fila[] = []
  let url: string | null = `https://graph.facebook.com/v21.0/${cuenta}/insights?` + new URLSearchParams({
    level: "campaign", fields: "campaign_id,campaign_name,spend", time_increment: "1",
    time_range: JSON.stringify({ since: desde, until: hasta }), limit: "500", access_token: token,
  })
  for (let i = 0; url && i < 10; i++) {
    const r: Response = await fetch(url, { next: { revalidate: 900 } })
    const j = await r.json() as { data?: Fila[]; paging?: { next?: string }; error?: { message?: string } }
    if (!r.ok || j.error) throw new Error(`Meta: ${j.error?.message || r.status}`)
    filas.push(...(j.data || []))
    url = j.paging?.next || null
  }
  const manuales = new Map<string, string>()
  const ids = [...new Set(filas.map((f) => f.campaign_id))]
  if (ids.length) {
    const { data } = await db.from("ads_campanas_mes").select("campaign_id,embudo").in("campaign_id", ids).eq("embudo_manual", true)
    for (const x of data || []) manuales.set(x.campaign_id, x.embudo)
  }
  const out: Record<string, number> = {}
  for (const f of filas) {
    if ((manuales.get(f.campaign_id) || embudoDeCampana(f.campaign_name)) !== embudo) continue
    out[f.date_start] = r2((out[f.date_start] || 0) + Number(f.spend || 0))
  }
  return out
}

export type DiaSeguidores = { dia: string; nuevos: number | null; seguidores_total: number | null; neto: number | null; gasto: number; costo: number | null }
export type Seguidores = {
  desde: string; hasta: string
  nuevos: number; neto: number | null; gasto: number
  costo_por_seguidor: number | null; costo_por_seguidor_neto: number | null
  seguidores_hoy: number | null; dias_con_foto: number
  diario: DiaSeguidores[]; error?: string
}

// Seguidores nuevos, crecimiento neto, gasto orgánico y costo por seguidor de un rango (AAAA-MM-DD, ambos inclusive).
export async function seguidoresPeriodo(db: SupabaseClient, desde: string, hasta: string): Promise<Seguidores> {
  const d0 = desde.slice(0, 10), d1 = hasta.slice(0, 10)
  const antes = new Date(new Date(`${d0}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10)
  const [{ data: filas }, gastoR] = await Promise.all([
    db.from("crm_seguidores_dia").select("dia,nuevos_manychat,seguidores_total").gte("dia", antes).lte("dia", d1).order("dia"),
    gastoDiario(db, d0, d1).then((g) => ({ g, error: null as string | null })).catch((e) => ({ g: {} as Record<string, number>, error: (e as Error).message })),
  ])
  const porDia = new Map((filas || []).map((f) => [String(f.dia), f]))
  const diario: DiaSeguidores[] = []
  // la foto se toma a las 00:05: el neto de un día es la foto del día siguiente menos la del día
  for (let t = new Date(`${d0}T12:00:00Z`).getTime(); t <= new Date(`${d1}T12:00:00Z`).getTime(); t += 86400000) {
    const dia = new Date(t).toISOString().slice(0, 10)
    const sig = new Date(t + 86400000).toISOString().slice(0, 10)
    const f = porDia.get(dia), fs = porDia.get(sig)
    const nuevos = f?.nuevos_manychat ?? null
    const neto = f?.seguidores_total != null && fs?.seguidores_total != null ? fs.seguidores_total - f.seguidores_total : null
    const gasto = gastoR.g[dia] || 0
    diario.push({ dia, nuevos, seguidores_total: f?.seguidores_total ?? null, neto, gasto, costo: nuevos ? r2(gasto / nuevos) : null })
  }
  const nuevos = diario.reduce((s, d) => s + (d.nuevos || 0), 0)
  const gasto = r2(diario.reduce((s, d) => s + d.gasto, 0))
  const conNeto = diario.filter((d) => d.neto != null)
  const neto = conNeto.length ? conNeto.reduce((s, d) => s + (d.neto || 0), 0) : null
  const gastoNeto = r2(conNeto.reduce((s, d) => s + d.gasto, 0))
  const ultimo = [...(filas || [])].reverse().find((f) => f.seguidores_total != null)
  return {
    desde: d0, hasta: d1, nuevos, neto, gasto,
    costo_por_seguidor: nuevos ? r2(gasto / nuevos) : null,
    costo_por_seguidor_neto: neto && neto > 0 ? r2(gastoNeto / neto) : null,
    seguidores_hoy: ultimo?.seguidores_total ?? null, dias_con_foto: (filas || []).filter((f) => f.seguidores_total != null).length,
    diario, ...(gastoR.error ? { error: gastoR.error } : {}),
  }
}
