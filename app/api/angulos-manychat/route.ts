import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { medirAngulos } from "@/lib/angulos-manychat"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const dias = Math.min(365, Math.max(7, Number(searchParams.get("dias") || 35) || 35))
    return NextResponse.json(await medirAngulos(createSupabaseAdmin(), dias))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
