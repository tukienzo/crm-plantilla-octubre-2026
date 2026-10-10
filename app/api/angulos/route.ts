import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { ANGULOS_SEED, DOLORES_SEED } from "@/lib/angulos-semilla"

export const dynamic = "force-dynamic"

// Banco de ángulos editable (tabla crm_angulos). Es la fuente de verdad de los ángulos de
// contenido; lib/angulos-semilla solo guarda los 25 originales como semilla y respaldo.
//   GET                                  → ángulos + dolores + cuántas piezas usa cada uno
//   POST   { titulo, dolor, notas }      → agrega uno nuevo con el número siguiente
//   PATCH  { id, titulo?, dolor?, ... }  → edita uno
//   DELETE { id }                        → borra solo si no lo usa ninguna pieza; si se usa, se desactiva

const texto = (v: unknown, max: number) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t ? t.slice(0, max) : "" }

// Cuántas piezas de contenido usan cada ángulo. La etiqueta guardada es "N · título", así que
// se cuenta por el número del prefijo: si se renombra un ángulo, el histórico lo sigue.
async function usosPorNumero(sb: ReturnType<typeof createSupabaseAdmin>) {
  const usos = new Map<number, number>()
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await sb.from("crm_content_assets").select("angle").not("angle", "is", null).range(desde, desde + 999)
    if (error) break
    for (const row of data || []) {
      const n = Number(String(row.angle || "").trim().match(/^#?\s*(\d{1,3})\s*(?:[·—\-:)]|$)/)?.[1])
      if (Number.isFinite(n)) usos.set(n, (usos.get(n) || 0) + 1)
    }
    if (!data || data.length < 1000) break
  }
  return usos
}

export async function GET() {
  try {
    const sb = createSupabaseAdmin()
    const { data, error } = await sb.from("crm_angulos").select("id,numero,titulo,dolor,activo,notas,updated_at").order("numero")
    if (error) throw new Error(error.message)
    const usos = await usosPorNumero(sb)
    const angulos = (data || []).map((a) => ({ ...a, etiqueta: `${a.numero} · ${a.titulo}`, usos: usos.get(a.numero) || 0 }))
    const dolores = [...new Set([...DOLORES_SEED, ...angulos.map((a) => a.dolor)])].sort((a, b) => a.localeCompare(b, "es"))
    return NextResponse.json({ angulos, dolores })
  } catch (e) {
    // Sin base, el banco original: la pantalla sigue mostrando algo en vez de romperse.
    return NextResponse.json({ angulos: ANGULOS_SEED.map((a) => ({ ...a, id: String(a.numero), activo: true, notas: null, etiqueta: `${a.numero} · ${a.titulo}`, usos: 0 })), dolores: [...DOLORES_SEED], degradado: String((e as Error).message) })
  }
}

export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const titulo = texto(b.titulo, 300)
    const dolor = texto(b.dolor, 60)
    if (!titulo) return NextResponse.json({ error: "Escribí el título del ángulo" }, { status: 400 })
    if (!dolor) return NextResponse.json({ error: "Elegí el dolor al que pertenece" }, { status: 400 })
    const sb = createSupabaseAdmin()
    const { data: ultimo } = await sb.from("crm_angulos").select("numero").order("numero", { ascending: false }).limit(1).maybeSingle()
    const numero = Number(ultimo?.numero || 0) + 1
    const { data, error } = await sb.from("crm_angulos").insert({ numero, titulo, dolor, notas: texto(b.notas, 500) || null }).select("id,numero,titulo,dolor,activo,notas").single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, angulo: { ...data, etiqueta: `${data.numero} · ${data.titulo}`, usos: 0 } }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const id = String(b.id || "")
    if (!id) return NextResponse.json({ error: "Falta el ángulo" }, { status: 400 })
    const cambios: Record<string, unknown> = {}
    if (b.titulo !== undefined) { const t = texto(b.titulo, 300); if (!t) return NextResponse.json({ error: "El título no puede quedar vacío" }, { status: 400 }); cambios.titulo = t }
    if (b.dolor !== undefined) { const d = texto(b.dolor, 60); if (!d) return NextResponse.json({ error: "El dolor no puede quedar vacío" }, { status: 400 }); cambios.dolor = d }
    if (b.activo !== undefined) cambios.activo = Boolean(b.activo)
    if (b.notas !== undefined) cambios.notas = texto(b.notas, 500) || null
    if (!Object.keys(cambios).length) return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
    const sb = createSupabaseAdmin()
    const { data, error } = await sb.from("crm_angulos").update(cambios).eq("id", id).select("id,numero,titulo,dolor,activo,notas").single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, angulo: { ...data, etiqueta: `${data.numero} · ${data.titulo}` } })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const id = String(b.id || "")
    if (!id) return NextResponse.json({ error: "Falta el ángulo" }, { status: 400 })
    const sb = createSupabaseAdmin()
    const { data: angulo, error: eLee } = await sb.from("crm_angulos").select("numero,titulo").eq("id", id).maybeSingle()
    if (eLee) throw new Error(eLee.message)
    if (!angulo) return NextResponse.json({ error: "Ese ángulo ya no existe" }, { status: 404 })
    const usos = (await usosPorNumero(sb)).get(angulo.numero) || 0
    if (usos > 0) {
      // Borrarlo dejaría huérfanas las piezas que lo usan y rompería las métricas por ángulo.
      const { error } = await sb.from("crm_angulos").update({ activo: false }).eq("id", id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, desactivado: true, usos, mensaje: `Lo usan ${usos} piezas, así que se desactivó en vez de borrarse: el histórico queda intacto y no se ofrece para contenido nuevo.` })
    }
    const { error } = await sb.from("crm_angulos").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, borrado: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
