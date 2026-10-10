// ── /api/panel/datos ─────────────────────────────────────────────────────────
// Sirve el "datos.js" del Panel del negocio (public/panel/index.html).
//  · Si el CRM tiene datos cargados (agendas o pagos), arma DATOS con los
//    números reales y MODO_DEMO = false (ver lib/panel-negocio.ts).
//  · Si el CRM está vacío o Supabase falla, devuelve el datos.js de
//    demostración que viene con el panel, con su sello "datos de demostración"
//    (con el nombre, la cuenta y la palabra clave de la marca propia encima).
// La respuesta es JavaScript, no JSON: el panel lo carga con <script src>.
//
// La meta mensual y el precio base salen de lib/brand.ts (NEXT_PUBLIC_META_CASH_MENSUAL y
// NEXT_PUBLIC_PRECIO_BASE). PANEL_META_MENSUAL y PANEL_PRECIO_BASE, si están, los pisan solo acá.

import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { armarDatosPanel, marcaDelPanel } from "@/lib/panel-negocio"
import { inversionAds } from "@/lib/ads-embudos"
import { META_CASH_MENSUAL, PRECIO_BASE } from "@/lib/brand"

export const dynamic = "force-dynamic"

function js(cuerpo: string, extra: Record<string, string> = {}) {
  return new NextResponse(cuerpo, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      ...extra,
    },
  })
}

// La demo trae su propia marca de ejemplo: se le pisan los datos de la marca configurada (los vacíos no).
async function demo() {
  const base = await readFile(path.join(process.cwd(), "public", "panel", "datos.js"), "utf8")
  const marca = Object.fromEntries(Object.entries(marcaDelPanel()).filter(([, v]) => v))
  return `${base}\n;Object.assign(DATOS.marca, ${JSON.stringify(marca)});\n`
}

// Número de una variable de entorno; 0 si no está o no es un número positivo.
const numeroEnv = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Supabase corta en 1000 filas por pedido: se pagina hasta agotar.
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const filas: T[] = []
  const paso = 1000
  for (let desde = 0; desde < 50000; desde += paso) {
    const { data, error } = await armar(desde, desde + paso - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data || []))
    if (!data || data.length < paso) break
  }
  return filas
}

export async function GET() {
  try {
    const sb = createSupabaseAdmin()
    const hoy = new Date()
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)
    const desdeIso = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-01`

    const [agendas, pagos, cuotas, clientes, metricas, settingDias] = await Promise.all([
      todas<Record<string, unknown>>((a, b) => sb.from("agendas")
        .select("id,nombre,fecha_agenda,fecha_closer,fecha_lead,fecha_tc,closer,setter,fuente,recurso,angulo_entrada,calificacion,calificaba_realmente,show,cerro,estado,tipo_cierre,seguimiento_estado,seguimiento_nota,seguimiento_actualizado_at,motivo_urgencia,operacion,plan_de_pago,cc_dia_1,created_at,lead_score_grade,lead_score")
        .or(`fecha_agenda.gte.${desdeIso},fecha_agenda.is.null`).or("estado.is.null,estado.neq.Archivada manualmente")
        .order("fecha_agenda", { ascending: false })
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("pagos")
        .select("fecha,cliente,tipo,operacion,ppp,closer,setter,fuente,monto")
        .gte("fecha", desdeIso)
        .is("voided_at", null)  // fecha_baja es el fin del programa, no una anulación
        .order("fecha", { ascending: false })
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("cuotas")
        .select("cliente,monto,monto_cobrado,fecha_vencimiento,estado,closer")
        .gte("fecha_vencimiento", desdeIso)
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("clientes")
        .select("fecha_ingreso,fecha_baja,estado,created_at")
        .range(a, b)),
      todas<Record<string, unknown>>((a, b) => sb.from("metricas_manual")
        .select("tipo,valor,semana,persona,mes,created_at")
        .range(a, b)),
      // reportes diarios del setter, uno por día (source=setting, asset_type=dia; los carga tu integración de setting)
      todas<Record<string, unknown>>((a, b) => sb.from("crm_integration_assets")
        .select("source_id,metadata")
        .eq("source", "setting").eq("asset_type", "dia")
        .gte("source_id", desdeIso)
        .order("source_id", { ascending: true })
        .range(a, b)),
    ])

    if (!agendas.length && !pagos.length) return js(await demo(), { "X-Panel-Datos": "demo" })

    // inversión en Meta Ads de los 12 meses (guardada en el CRM; solo se le pregunta a Meta lo que falta o está abierto)
    const mesesAds = Array.from({ length: 12 }, (_, i) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` })
    const ads = await inversionAds(sb, mesesAds).then((x) => Object.fromEntries(Object.values(x).map((m) => [m.mes, m.total]))).catch(() => ({} as Record<string, number>))

    const datos = armarDatosPanel({
      agendas: agendas as never, pagos: pagos as never, cuotas: cuotas as never,
      clientes: clientes as never, metricas: metricas as never, hoy, ads,
      setting: settingDias.map((r) => r.metadata as never),
      metaMensual: numeroEnv(process.env.PANEL_META_MENSUAL) || META_CASH_MENSUAL,
      precioBase: numeroEnv(process.env.PANEL_PRECIO_BASE) || PRECIO_BASE,
    })
    const cuerpo = `/* Generado por el CRM el ${hoy.toISOString()} — solo números crudos; las tasas las calcula el panel. */\n`
      + `const DATOS = ${JSON.stringify(datos, null, 1)};\nconst MODO_DEMO = false;\n`
    return js(cuerpo, { "X-Panel-Datos": "crm" })
  } catch (error) {
    console.error("[panel/datos] se sirve la demo por un error del CRM:", error)
    return js(await demo(), { "X-Panel-Datos": "demo-fallback" })
  }
}
