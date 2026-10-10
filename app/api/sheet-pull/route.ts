import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { a1, getValues, listTabs, sheetsConfigured } from "@/lib/google-sheets"
import { pestanaDelMes } from "@/lib/sheet-mirror"
import { nombreCanonico } from "@/lib/equipo"

export const maxDuration = 120
export const dynamic = "force-dynamic"

// Sheet → CRM para los pagos que el equipo escribe a mano en la pestaña del mes (💰 PAGOS …).
// Lee las filas con concepto y nombre, y las que no existen en `pagos` las crea, registrando antes el
// mapa (pestaña, fila) para que el espejo CRM → sheet las actualice en su lugar y no las duplique.
// Es el complemento del espejo: el espejo escribe lo que nace en el CRM; esto trae lo que nace en el sheet.
const TC_ARS = 1540
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
const texto = (v: unknown, max?: number) => { const t = String(v ?? "").trim(); if (!t || t === "-" || t.startsWith("#")) return null; return max ? t.slice(0, max) : t }
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const t = String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
// Sheets devuelve las fechas como número de serie (días desde 30/12/1899)
const fechaSerie = (v: unknown): string | null => {
  if (typeof v === "number" && v > 30000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().slice(0, 10) }
  const t = texto(v)
  if (!t) return null
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/)
  return iso ? iso[1] : null
}
const telefono = (v: unknown) => { const t = texto(v); if (!t || /\d[.,]?\d*e[+-]?\d/i.test(t)) return null; const d = t.replace(/\D/g, ""); return d.length >= 8 ? d : null }
const closer = (v: unknown) => { const t = texto(v); if (!t) return null; return nombreCanonico(t) || null }
const clave = (c: unknown, f: unknown, t: unknown, m: unknown) => `${norm(c)}|${String(f ?? "").slice(0, 10)}|${norm(t)}|${Math.round(Number(m || 0))}`

export async function GET(request: Request) { return correr(request) }
export async function POST(request: Request) { return correr(request) }

async function correr(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!sheetsConfigured()) return NextResponse.json({ ok: false, motivo: "Sin credenciales de Google" }, { status: 202 })
  const hoy = new Date().toISOString().slice(0, 10)
  const ym = new URL(request.url).searchParams.get("mes") || hoy.slice(0, 7)
  const dry = new URL(request.url).searchParams.get("dry") === "1"
  try {
    const tabs = await listTabs()
    const tab = pestanaDelMes(tabs, "pagos", ym, hoy)
    if (!tab) return NextResponse.json({ ok: true, mes: ym, motivo: "No hay pestaña de pagos para ese mes", nuevas: 0 })
    // E..W desde la fila 3: mes, fecha carga, alta, baja, nombre, teléfono, concepto, operación, closer, setter, calif, usd, ars, comprobante, ppp, fuente, contenido, medio, tc
    const valores = await getValues(a1(tab.title, "E3:W"))
    const filas = valores.map((v, i) => ({ fila: i + 3, v })).filter(({ v }) => texto(v[6]) && (texto(v[4]) || (texto(v[2]) && !fechaSerie(v[2]))))
    const admin = createSupabaseAdmin()
    const desde = `${ym}-01`
    const { data: crm, error } = await admin.from("pagos").select("id,cliente,fecha,tipo,monto").gte("fecha", desde)
    if (error) throw error
    const { data: mapas } = await admin.from("crm_integration_assets").select("metadata").eq("source", "gsheet").eq("asset_type", "pago").eq("metadata->>tab", tab.title)
    const filasMapeadas = new Set((mapas || []).map((m) => Number((m.metadata as { row?: number })?.row)))
    const usados = new Set<string>()
    const nuevas: Array<Record<string, unknown> & { fila: number }> = []
    const sinMonto: Array<{ fila: number; cliente: string }> = []
    for (const { fila, v } of filas) {
      if (filasMapeadas.has(fila)) continue
      let cliente = texto(v[4])
      let altaRaw: unknown = v[2]
      if (!cliente && texto(v[2]) && !fechaSerie(v[2])) { cliente = texto(v[2]); altaRaw = null }  // columnas corridas: el nombre quedó en "Fecha Alta"
      if (!cliente) continue
      const usd = num(v[11]), ars = num(v[12]), tc = num(v[18])
      const monto = usd ? usd : ars ? ars / (tc || TC_ARS) : null
      if (monto === null) { sinMonto.push({ fila, cliente }); continue }
      let fecha = fechaSerie(v[1])
      if (!fecha) { const mi = MESES.findIndex((m) => norm(m) === norm(v[0])); fecha = `${ym.slice(0, 4)}-${String((mi >= 0 ? mi : Number(ym.slice(5, 7)) - 1) + 1).padStart(2, "0")}-01` }
      const tipo = texto(v[6])!
      const k = clave(cliente, fecha, tipo, monto)
      const existente = (crm || []).find((c) => !usados.has(c.id) && clave(c.cliente, c.fecha, c.tipo, c.monto) === k)
      if (existente) { usados.add(existente.id); continue }
      nuevas.push({
        fila, cliente, fecha, fecha_alta: fechaSerie(altaRaw), fecha_baja: fechaSerie(v[3]), telefono: telefono(v[5]), tipo, operacion: texto(v[7]),
        closer: closer(v[8]), setter: texto(v[9]) ? nombreCanonico(texto(v[9])) : null, calificacion: texto(v[10]), monto: Math.round(monto * 100) / 100,
        cc_ars: ars, tipo_cambio_usd: tc || (ars && !usd ? TC_ARS : null), comprobante: texto(v[13], 500), ppp: texto(v[14], 4000), fuente: texto(v[15]),
        contenido_contestado: texto(v[16], 500), medio_de_pago: texto(v[17]), record_status: "active",
      })
    }
    if (dry || !nuevas.length) return NextResponse.json({ ok: true, mes: ym, pestana: tab.title, filas: filas.length, nuevas: nuevas.length, sinMonto, detalle: nuevas.map((n) => ({ fila: n.fila, cliente: n.cliente, tipo: n.tipo, monto: n.monto })) })
    const cargadas: Array<{ fila: number; cliente: unknown; monto: unknown }> = []
    for (const n of nuevas) {
      const { fila, ...pago } = n
      const id = randomUUID()
      // primero el mapa: si el webhook del espejo llega antes de que termine el insert, ya encuentra la fila y no la duplica
      const { error: eMapa } = await admin.from("crm_integration_assets").upsert(
        { source: "gsheet", asset_type: "pago", source_id: id, name: String(pago.cliente), metadata: { tab: tab.title, row: fila, ym } },
        { onConflict: "source,asset_type,source_id" },
      )
      if (eMapa) throw eMapa
      const { error: ePago } = await admin.from("pagos").insert({ id, ...pago })
      if (ePago) { await admin.from("crm_integration_assets").delete().eq("source", "gsheet").eq("asset_type", "pago").eq("source_id", id); throw ePago }
      cargadas.push({ fila, cliente: pago.cliente, monto: pago.monto })
    }
    return NextResponse.json({ ok: true, mes: ym, pestana: tab.title, filas: filas.length, nuevas: cargadas.length, cargadas, sinMonto })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
