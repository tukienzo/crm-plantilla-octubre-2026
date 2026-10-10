import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { authorizePreviewSync } from "@/lib/integration-auth"
import { sincronizarCanal } from "@/lib/youtube-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Cron diario: refresca del canal los videos publicados y sus métricas, para que el tablero de
// Marketing → YouTube no dependa de que alguien toque "Sincronizar canal".
// Los crons de Vercel entran por GET con Bearer CRON_SECRET; POST queda para dispararlo a mano.
async function correr(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const r = await sincronizarCanal(createSupabaseAdmin())
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export const GET = correr
export const POST = correr
