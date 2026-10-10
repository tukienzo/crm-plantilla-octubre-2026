import { NextResponse } from "next/server"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { sincronizarSheet } from "@/lib/sheet-mirror"

export const maxDuration = 60
export const dynamic = "force-dynamic"

// Espejo CRM → Google Sheet. Lo dispara el cron diario de Vercel (GET), el webhook de la base
// al insertar/actualizar pagos o agendas (POST), o una llamada manual con el mismo secreto.
async function correr(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = request.method === "POST" ? await request.json().catch(() => null) : null
  const registro = body && typeof body.table === "string" && typeof body.id === "string" ? { table: body.table, id: body.id } : null
  const resultado = await sincronizarSheet({ registro })
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 202 })
}

export async function GET(request: Request) { return correr(request) }
export async function POST(request: Request) { return correr(request) }
