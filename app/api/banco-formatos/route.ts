import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

// Banco de formatos de pieza (tabla crm_formatos). Es la fuente de los formatos elegibles en
// Contenido y del panel de referencias. Ojo: NO confundir con /api/formatos, que mide el
// rendimiento por formato; este administra el catálogo.
//   GET                                       → formatos + cuántas piezas usa cada uno
//   POST   { nombre, tipo, descripcion, ... } → agrega uno (solo admin)
//   PATCH  { id, ...campos }                  → edita uno (solo admin)
//   DELETE { id }                             → borra si no se usa; si se usa, lo desactiva (solo admin)

const TIPOS = new Set(["Reel", "Carrusel", "Historia", "Otro"])
const texto = (v: unknown, max: number) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t ? t.slice(0, max) : "" }
// El nombre es la etiqueta que se guarda en las piezas: siempre en mayúsculas, como el resto del catálogo.
const nombreCanonico = (v: unknown) => texto(v, 60).toLocaleUpperCase("es")

// Solo el dueño del CRM administra el catálogo de formatos. El resto del equipo lo lee.
async function esAdmin() {
  const sesion = await createSupabaseServer()
  const { data: { user } } = await sesion.auth.getUser()
  if (!user?.email) return false
  const { data } = await createSupabaseAdmin().from("team_members").select("rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
  return data?.estado === "aprobado" && data?.rol === "CEO"
}

async function usos(sb: ReturnType<typeof createSupabaseAdmin>) {
  const cuenta = new Map<string, number>()
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await sb.from("crm_content_assets").select("format").not("format", "is", null).range(desde, desde + 999)
    if (error) break
    for (const row of data || []) {
      const k = String(row.format || "").trim().toLocaleUpperCase("es")
      if (k) cuenta.set(k, (cuenta.get(k) || 0) + 1)
    }
    if (!data || data.length < 1000) break
  }
  return cuenta
}

export async function GET() {
  try {
    const sb = createSupabaseAdmin()
    const { data, error } = await sb.from("crm_formatos").select("id,nombre,tipo,descripcion,referencia_url,portada_url,notas,activo,orden,updated_at").order("orden").order("nombre")
    if (error) throw new Error(error.message)
    const cuenta = await usos(sb)
    return NextResponse.json({
      formatos: (data || []).map((f) => ({ ...f, usos: cuenta.get(f.nombre.toLocaleUpperCase("es")) || 0 })),
      tipos: [...TIPOS],
      admin: await esAdmin(),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!(await esAdmin())) return NextResponse.json({ error: "Solo el admin puede agregar formatos" }, { status: 403 })
  try {
    const b = await request.json().catch(() => ({}))
    const nombre = nombreCanonico(b.nombre)
    if (!nombre) return NextResponse.json({ error: "Escribí el nombre del formato" }, { status: 400 })
    const tipo = TIPOS.has(String(b.tipo)) ? String(b.tipo) : "Reel"
    const sb = createSupabaseAdmin()
    const { data: ultimo } = await sb.from("crm_formatos").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle()
    const { data, error } = await sb.from("crm_formatos").insert({
      nombre, tipo,
      descripcion: texto(b.descripcion, 400) || null,
      referencia_url: texto(b.referencia_url, 600) || null,
      portada_url: texto(b.portada_url, 600) || null,
      notas: texto(b.notas, 400) || null,
      orden: Number(ultimo?.orden || 0) + 10,
    }).select("id,nombre,tipo,descripcion,referencia_url,portada_url,notas,activo,orden").single()
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: `Ya existe un formato llamado "${nombre}"` }, { status: 409 })
      throw new Error(error.message)
    }
    return NextResponse.json({ ok: true, formato: { ...data, usos: 0 } }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  if (!(await esAdmin())) return NextResponse.json({ error: "Solo el admin puede editar formatos" }, { status: 403 })
  try {
    const b = await request.json().catch(() => ({}))
    const id = String(b.id || "")
    if (!id) return NextResponse.json({ error: "Falta el formato" }, { status: 400 })
    const sb = createSupabaseAdmin()
    const cambios: Record<string, unknown> = {}
    if (b.nombre !== undefined) {
      const nombre = nombreCanonico(b.nombre)
      if (!nombre) return NextResponse.json({ error: "El nombre no puede quedar vacío" }, { status: 400 })
      const { data: previo } = await sb.from("crm_formatos").select("nombre").eq("id", id).maybeSingle()
      // Renombrar el formato tiene que arrastrar las piezas: la etiqueta guardada es el nombre,
      // no un id, así que sin esto el histórico quedaría apuntando a un formato que ya no existe.
      if (previo?.nombre && previo.nombre !== nombre) {
        const { error: eRename } = await sb.from("crm_content_assets").update({ format: nombre }).eq("format", previo.nombre)
        if (eRename) throw new Error(`No se pudo renombrar en las piezas: ${eRename.message}`)
      }
      cambios.nombre = nombre
    }
    if (b.tipo !== undefined && TIPOS.has(String(b.tipo))) cambios.tipo = String(b.tipo)
    if (b.descripcion !== undefined) cambios.descripcion = texto(b.descripcion, 400) || null
    if (b.referencia_url !== undefined) cambios.referencia_url = texto(b.referencia_url, 600) || null
    if (b.portada_url !== undefined) cambios.portada_url = texto(b.portada_url, 600) || null
    if (b.notas !== undefined) cambios.notas = texto(b.notas, 400) || null
    if (b.activo !== undefined) cambios.activo = Boolean(b.activo)
    if (b.orden !== undefined && Number.isFinite(Number(b.orden))) cambios.orden = Number(b.orden)
    if (!Object.keys(cambios).length) return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
    const { data, error } = await sb.from("crm_formatos").update(cambios).eq("id", id).select("id,nombre,tipo,descripcion,referencia_url,portada_url,notas,activo,orden").single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, formato: data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!(await esAdmin())) return NextResponse.json({ error: "Solo el admin puede borrar formatos" }, { status: 403 })
  try {
    const b = await request.json().catch(() => ({}))
    const id = String(b.id || "")
    if (!id) return NextResponse.json({ error: "Falta el formato" }, { status: 400 })
    const sb = createSupabaseAdmin()
    const { data: formato } = await sb.from("crm_formatos").select("nombre").eq("id", id).maybeSingle()
    if (!formato) return NextResponse.json({ error: "Ese formato ya no existe" }, { status: 404 })
    const cuenta = (await usos(sb)).get(formato.nombre.toLocaleUpperCase("es")) || 0
    if (cuenta > 0) {
      const { error } = await sb.from("crm_formatos").update({ activo: false }).eq("id", id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, desactivado: true, usos: cuenta, mensaje: `Lo usan ${cuenta} piezas, así que se desactivó en vez de borrarse: el histórico queda intacto y deja de ofrecerse para piezas nuevas.` })
    }
    const { error } = await sb.from("crm_formatos").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, borrado: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
