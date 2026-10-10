import { NextResponse } from "next/server"
import { authorizePreviewSync } from "@/lib/integration-auth"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Vercel (plan hobby) permite pocos crons y solo diarios: este único cron dispara todas las
// sincronizaciones del CRM. Cada ruta corre en su propia función con su propio límite de tiempo;
// acá solo se las llama en paralelo y se anota qué respondió cada una.
const RUTAS: Array<{ ruta: string; requiere?: string }> = [
  { ruta: "/api/manychat-sync", requiere: "MANYCHAT_API_KEY" },
  { ruta: "/api/iclosed-sync", requiere: "ICLOSED_API_KEY" },
  { ruta: "/api/fathom-sync?days=7&limit=10", requiere: "FATHOM_API_KEY" },
  { ruta: "/api/fathom-show-reconcile", requiere: "FATHOM_API_KEY" },
  { ruta: "/api/operations-refresh" },
  { ruta: "/api/sheet-sync", requiere: "GOOGLE_SERVICE_ACCOUNT_JSON" },
  { ruta: "/api/sheet-pull", requiere: "GOOGLE_SERVICE_ACCOUNT_JSON" },
]

export async function GET(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const base = (process.env.CRM_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "")
  const secreto = process.env.CRON_SECRET || ""
  const inicio = Date.now()
  const resultados = await Promise.all(RUTAS.map(async ({ ruta, requiere }) => {
    if (requiere && !process.env[requiere]) return { ruta, estado: "salteada", motivo: `falta ${requiere}` }
    const controlador = new AbortController()
    const timer = setTimeout(() => controlador.abort(), 280_000)
    try {
      const r = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${secreto}` }, cache: "no-store", signal: controlador.signal })
      const cuerpo = await r.text()
      return { ruta, estado: r.ok ? "ok" : "error", http: r.status, respuesta: cuerpo.slice(0, 300) }
    } catch (e) {
      return { ruta, estado: "error", motivo: (e as Error).message }
    } finally {
      clearTimeout(timer)
    }
  }))
  return NextResponse.json({ ok: resultados.every(r => r.estado !== "error"), segundos: Math.round((Date.now() - inicio) / 1000), resultados })
}
