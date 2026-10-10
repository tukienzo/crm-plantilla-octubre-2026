import { NextResponse } from "next/server"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { emailsPorRol, enviarPush } from "@/lib/push"
import { reconciliarVentas } from "@/lib/ventas-reconciliar"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Cierre diario de ventas: todos los días a las 22:00 de Argentina (01:00 UTC en vercel.json).
// 1) trae lo último de iClosed, del sheet de pagos y de Fathom (las mismas rutas de siempre, una vez más antes del cierre);
// 2) concilia asistencias y closers con las grabaciones (lib/ventas-reconciliar.ts);
// 3) guarda el resumen en crm_integration_assets (source = ventas-diario) y, si hay algo para revisar, avisa por push al CEO.
// Prueba sin guardar nada: /api/ventas-diario?aplicar=0 (con el CRON_SECRET).
const SINCRONIZAR = [
  { ruta: "/api/iclosed-sync", requiere: "ICLOSED_API_KEY" },
  { ruta: "/api/sheet-pull", requiere: "GOOGLE_SERVICE_ACCOUNT_JSON" },
  { ruta: "/api/fathom-sync?days=3&limit=10", requiere: "FATHOM_API_KEY" },
]

export async function GET(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { searchParams } = new URL(request.url)
  const aplicar = searchParams.get("aplicar") !== "0"
  const inicio = Date.now()
  const base = (process.env.CRM_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "")
  const secreto = process.env.CRON_SECRET || ""

  const sincronizacion = aplicar
    ? await Promise.all(SINCRONIZAR.map(async ({ ruta, requiere }) => {
        if (requiere && !process.env[requiere]) return { ruta, estado: "salteada", motivo: `falta ${requiere}` }
        const control = new AbortController()
        const timer = setTimeout(() => control.abort(), 200_000)
        try {
          const r = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${secreto}` }, cache: "no-store", signal: control.signal })
          return { ruta, estado: r.ok ? "ok" : "error", http: r.status }
        } catch (e) {
          return { ruta, estado: "error", motivo: (e as Error).message }
        } finally {
          clearTimeout(timer)
        }
      }))
    : []

  try {
    const resultado = await reconciliarVentas({ dias: 14, aplicar })
    const fecha = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)  // día en Argentina
    const revisar = resultado.sin_agenda.length + resultado.ambiguas.length + resultado.pagos_duplicados.length
    const resumen = { fecha, segundos: Math.round((Date.now() - inicio) / 1000), sincronizacion, ...resultado }

    if (aplicar) {
      await createSupabaseAdmin().from("crm_integration_assets").upsert({
        source: "ventas-diario", asset_type: "corrida", source_id: fecha, name: `Cierre de ventas ${fecha}`,
        metadata: resumen, last_seen_at: new Date().toISOString(),
      }, { onConflict: "source,asset_type,source_id" })

      const corregidas = resultado.asistencias_corregidas.length + resultado.closers_corregidos.length
      if (revisar || corregidas) {
        const partes = [
          resultado.asistencias_corregidas.length ? `${resultado.asistencias_corregidas.length} asistencias corregidas` : "",
          resultado.closers_corregidos.length ? `${resultado.closers_corregidos.length} closers asignados` : "",
          resultado.sin_agenda.length ? `${resultado.sin_agenda.length} llamadas sin agenda` : "",
          resultado.pagos_duplicados.length ? `${resultado.pagos_duplicados.length} pagos posiblemente duplicados` : "",
          resultado.ambiguas.length ? `${resultado.ambiguas.length} cruces para revisar` : "",
        ].filter(Boolean)
        await enviarPush(await emailsPorRol(["CEO"]), {
          titulo: revisar ? "Cierre de ventas: hay cosas para revisar" : "Cierre de ventas listo",
          cuerpo: partes.join(" · "),
          url: "/equipo",
          tag: `ventas-diario-${fecha}`,
        }).catch((e) => console.warn("[ventas-diario] push", e))
      }
    }
    return NextResponse.json(resumen)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, sincronizacion }, { status: 500 })
  }
}
