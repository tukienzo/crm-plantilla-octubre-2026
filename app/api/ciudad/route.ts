import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { DICCIONARIO, ESTADOS_SILLA, leerCiudad } from "@/lib/ciudad"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Vista ciudad del CRM. Solo lectura. ?dia=AAAA-MM-DD cambia el día de las agendas; ?dias= la ventana de contenido.
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams
    const datos = await leerCiudad(createSupabaseAdmin(), { dia: p.get("dia") || undefined, diasContenido: Number(p.get("dias") || 0) || undefined })
    return NextResponse.json({ ...datos, diccionario: DICCIONARIO, estados: ESTADOS_SILLA })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
