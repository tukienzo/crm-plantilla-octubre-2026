import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { effectiveCRMRole } from "@/lib/role-access"
import { enviarPush } from "@/lib/push"
import {
  esAdminTareas, esEstado, esFrecuencia, estadoTarea, hoyArgentina, lunesDe, ordenarTareas, sumarDias,
  type Estado, type MiembroTareas, type Prioridad, type RespuestaTareas, type TareaFila,
} from "@/lib/tareas"

export const dynamic = "force-dynamic"

// Tareas pendientes del equipo (Panel del negocio → El equipo).
//   GET                                          → las tareas que puede ver quien pide: las suyas, o las de todos si es CEO
//   POST   { miembro_id, titulo, ... }           → crea una tarea (solo CEO)
//   POST   { prioridad }                         → fija la prioridad del día (solo CEO)
//   PATCH  { id, estado | hecha }                → pendiente / en progreso / hecha (la persona a la que está asignada, o un CEO)
//   PATCH  { id, titulo?, detalle?, frecuencia?, vence?, miembro_id?, orden? } → edita (solo CEO)
//   DELETE { id }                                → archiva (solo CEO; el middleware ya limita DELETE a CEO)
// El filtro por persona se hace acá, en el servidor: la pantalla nunca recibe tareas ajenas si no es CEO.

const COLUMNAS = "id,miembro_id,titulo,detalle,frecuencia,vence,origen,origen_url,hecha_at,hecha_por,en_progreso_desde,orden,creada_por,created_at"

const texto = (v: unknown, max: number) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t ? t.slice(0, max) : "" }
const textoLargo = (v: unknown, max: number) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : "" }
// AAAA-MM-DD que además sea un día real (nada de 2026-02-31).
const fechaValida = (v: unknown) => {
  const t = String(v ?? "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const [a, m, d] = t.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d)).toISOString().slice(0, 10) === t && a >= 2000 && a <= 2100 ? t : null
}
const esUuid = (v: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v ?? ""))
const urlValida = (v: unknown) => { const t = String(v ?? "").trim(); return /^https:\/\/\S+$/.test(t) ? t.slice(0, 500) : null }
const error = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status })

type Yo = MiembroTareas & { email: string; admin: boolean }

// Quién pide, como miembro del equipo aprobado. null si no hay sesión o no es del equipo.
async function miembroActual(sb: ReturnType<typeof createSupabaseAdmin>): Promise<Yo | null> {
  const sesion = await createSupabaseServer()
  const { data: { user } } = await sesion.auth.getUser()
  const email = String(user?.email || "").toLowerCase()
  if (!email) return null
  const { data, error: e } = await sb.from("team_members").select("id,nombre,rol,estado").eq("email", email).maybeSingle()
  if (e) throw new Error(e.message)
  if (!data || data.estado !== "aprobado") return null
  const rol = String(effectiveCRMRole(data.rol, data.nombre) || "")
  return { id: Number(data.id), nombre: String(data.nombre || email), rol, email, admin: esAdminTareas(rol) }
}

async function tareaPorId(sb: ReturnType<typeof createSupabaseAdmin>, id: string) {
  if (!esUuid(id)) return null
  const { data, error: e } = await sb.from("crm_tareas").select(COLUMNAS).eq("id", id).eq("archivada", false).maybeSingle()
  if (e) throw new Error(e.message)
  return (data as TareaFila | null) || null
}

// Tildes desde una fecha. Hay como mucho una por tarea y por día, y la ventana es de 28 días como máximo:
// en lotes de 35 tareas nunca se llega al tope de 1000 filas que PostgREST corta sin avisar.
async function marcasDe(sb: ReturnType<typeof createSupabaseAdmin>, ids: string[], desde: string) {
  const porTarea = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += 35) {
    const { data, error: e } = await sb.from("crm_tareas_marcas").select("tarea_id,fecha").in("tarea_id", ids.slice(i, i + 35)).gte("fecha", desde)
    if (e) throw new Error(e.message)
    for (const m of data || []) {
      const lista = porTarea.get(m.tarea_id) || []
      lista.push(String(m.fecha))
      porTarea.set(m.tarea_id, lista)
    }
  }
  return porTarea
}

async function respuesta(sb: ReturnType<typeof createSupabaseAdmin>, yo: Yo): Promise<RespuestaTareas> {
  const hoy = hoyArgentina()
  let consulta = sb.from("crm_tareas").select(COLUMNAS).eq("archivada", false)
  if (!yo.admin) consulta = consulta.eq("miembro_id", yo.id)
  const { data: filas, error: e } = await consulta.order("orden").order("created_at").limit(1000)
  if (e) throw new Error(e.message)
  const lista = (filas || []) as TareaFila[]
  // Historial: 7 días para las diarias y 4 semanas para las semanales. Las de una vez no lo usan.
  const recurrentes = lista.filter((f) => f.frecuencia !== "una_vez").map((f) => f.id)
  const marcas = await marcasDe(sb, recurrentes, sumarDias(lunesDe(hoy), -21))
  let miembros: MiembroTareas[] = [{ id: yo.id, nombre: yo.nombre, rol: yo.rol }]
  if (yo.admin) {
    const { data: equipo, error: e2 } = await sb.from("team_members").select("id,nombre,rol").eq("estado", "aprobado").order("nombre")
    if (e2) throw new Error(e2.message)
    miembros = (equipo || []).map((m) => ({ id: Number(m.id), nombre: String(m.nombre || ""), rol: String(m.rol || "") }))
    // Si alguien con tareas dejó de estar aprobado, igual aparece (para reasignarlas o borrarlas).
    const sinAcceso = [...new Set(lista.map((f) => f.miembro_id))].filter((id) => !miembros.some((m) => m.id === id))
    if (sinAcceso.length) {
      const { data: otros } = await sb.from("team_members").select("id,nombre,rol").in("id", sinAcceso)
      miembros.push(...(otros || []).map((m) => ({ id: Number(m.id), nombre: String(m.nombre || ""), rol: `Sin acceso · ${m.rol || ""}` })))
    }
  }
  const tareas = ordenarTareas(lista.map((f) => estadoTarea(f, marcas.get(f.id) || [], hoy, yo.admin)))
  // La prioridad del día: la última que escribió un CEO. La ve todo el equipo.
  let prioridad: Prioridad | null = null
  const { data: p } = await sb.from("crm_equipo_prioridad").select("texto,definida_por,created_at").order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (p) {
    const { data: quien } = p.definida_por ? await sb.from("team_members").select("nombre").eq("email", p.definida_por).maybeSingle() : { data: null }
    prioridad = { texto: String(p.texto), por: quien?.nombre ? String(quien.nombre) : null, at: String(p.created_at) }
  }
  return { yo: { id: yo.id, nombre: yo.nombre, rol: yo.rol, admin: yo.admin }, hoy, miembros, tareas, prioridad }
}

export async function GET() {
  try {
    const sb = createSupabaseAdmin()
    const yo = await miembroActual(sb)
    if (!yo) return error("Tu cuenta no figura en el equipo", 403)
    return NextResponse.json(await respuesta(sb, yo))
  } catch (e) {
    return error(`No se pudieron leer las tareas: ${(e as Error).message}`, 500)
  }
}

export async function POST(request: Request) {
  try {
    const sb = createSupabaseAdmin()
    const yo = await miembroActual(sb)
    if (!yo) return error("Tu cuenta no figura en el equipo", 403)
    if (!yo.admin) return error("Solo un CEO puede asignar tareas", 403)
    const b = await request.json().catch(() => ({}))
    if ("prioridad" in b) {
      const texto2 = texto(b.prioridad, 500)
      if (!texto2) return error("Escribí la prioridad del día", 400)
      const { error: ep } = await sb.from("crm_equipo_prioridad").insert({ texto: texto2, definida_por: yo.email })
      if (ep) throw new Error(ep.message)
      return NextResponse.json({ ok: true, ...(await respuesta(sb, yo)) }, { status: 201 })
    }
    const titulo = texto(b.titulo, 300)
    if (!titulo) return error("Escribí la tarea", 400)
    const miembroId = Number(b.miembro_id)
    const { data: miembro } = await sb.from("team_members").select("id,email,estado").eq("id", miembroId).maybeSingle()
    if (!miembro || miembro.estado !== "aprobado") return error("Elegí a alguien del equipo", 400)
    const frecuencia = esFrecuencia(b.frecuencia) ? b.frecuencia : "una_vez"
    const { data: ultima } = await sb.from("crm_tareas").select("orden").eq("miembro_id", miembroId).eq("archivada", false).order("orden", { ascending: false }).limit(1).maybeSingle()
    const fila = {
      miembro_id: miembroId,
      titulo,
      detalle: textoLargo(b.detalle, 2000) || null,
      frecuencia,
      vence: frecuencia === "una_vez" ? fechaValida(b.vence) : null,
      origen: texto(b.origen, 120) || null,
      origen_url: urlValida(b.origen_url),
      orden: Number(ultima?.orden ?? -1) + 1,
      creada_por: yo.email,
    }
    const { data, error: e } = await sb.from("crm_tareas").insert(fila).select("id").single()
    if (e) throw new Error(e.message)
    // Aviso al celular de la persona, si activó los avisos. Si falla, la tarea queda igual.
    if (String(miembro.email || "").toLowerCase() !== yo.email) {
      await enviarPush([String(miembro.email || "")], { titulo: "Tenés una tarea nueva", cuerpo: titulo, url: "/panel/equipo", tag: `tarea-${data.id}` }).catch(() => null)
    }
    return NextResponse.json({ ok: true, id: data.id, ...(await respuesta(sb, yo)) }, { status: 201 })
  } catch (e) {
    return error(`No se pudo crear la tarea: ${(e as Error).message}`, 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const sb = createSupabaseAdmin()
    const yo = await miembroActual(sb)
    if (!yo) return error("Tu cuenta no figura en el equipo", 403)
    const b = await request.json().catch(() => ({}))
    const tarea = await tareaPorId(sb, String(b.id || ""))
    if (!tarea) return error("La tarea no existe o ya se archivó", 404)
    const esMia = tarea.miembro_id === yo.id
    if (!esMia && !yo.admin) return error("Esa tarea no es tuya", 403)

    // Cambiar de estado: pendiente, en progreso o hecha (o tildar/destildar con { hecha }).
    let objetivo: Estado | null = null
    if (typeof b.hecha === "boolean") objetivo = b.hecha ? "hecha" : "pendiente"
    if (esEstado(b.estado)) objetivo = b.estado
    if (objetivo) {
      const hoy = hoyArgentina()
      // Quien no es CEO solo escribe si la tarea sigue siendo suya en el momento de escribir.
      const dueno = yo.admin ? null : yo.id
      if (objetivo === "hecha") {
        let tildar = sb.from("crm_tareas").update({ hecha_at: new Date().toISOString(), hecha_por: yo.email, en_progreso_desde: null, en_progreso_por: null, updated_at: new Date().toISOString() }).eq("id", tarea.id)
        if (dueno !== null) tildar = tildar.eq("miembro_id", dueno)
        const { data: tocada, error: e2 } = await tildar.select("id")
        if (e2) throw new Error(e2.message)
        if (!tocada?.length) return error("Esa tarea no es tuya", 403)
        const { error: e1 } = await sb.from("crm_tareas_marcas").upsert({ tarea_id: tarea.id, fecha: hoy, marcada_por: yo.email }, { onConflict: "tarea_id,fecha" })
        if (e1) throw new Error(e1.message)
      } else {
        // Se borra la tilde del período en curso: hoy (diaria), esta semana (semanal) o todas (una vez).
        let borrar = sb.from("crm_tareas_marcas").delete().eq("tarea_id", tarea.id)
        if (tarea.frecuencia === "diaria") borrar = borrar.eq("fecha", hoy)
        if (tarea.frecuencia === "semanal") borrar = borrar.gte("fecha", lunesDe(hoy)).lte("fecha", hoy)
        const { error: e1 } = await borrar
        if (e1) throw new Error(e1.message)
        const { data: ultima } = await sb.from("crm_tareas_marcas").select("created_at,marcada_por").eq("tarea_id", tarea.id).order("created_at", { ascending: false }).limit(1).maybeSingle()
        let destildar = sb.from("crm_tareas").update({
          hecha_at: tarea.frecuencia === "una_vez" ? null : (ultima?.created_at ?? null),
          hecha_por: tarea.frecuencia === "una_vez" ? null : (ultima?.marcada_por ?? null),
          en_progreso_desde: objetivo === "en_progreso" ? hoy : null,
          en_progreso_por: objetivo === "en_progreso" ? yo.email : null,
          updated_at: new Date().toISOString(),
        }).eq("id", tarea.id)
        if (dueno !== null) destildar = destildar.eq("miembro_id", dueno)
        const { data: tocada, error: e2 } = await destildar.select("id")
        if (e2) throw new Error(e2.message)
        if (!tocada?.length) return error("Esa tarea no es tuya", 403)
      }
      return NextResponse.json({ ok: true, ...(await respuesta(sb, yo)) })
    }

    // Editar: solo CEO.
    if (!yo.admin) return error("Solo un CEO puede editar tareas", 403)
    const cambios: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ("titulo" in b) { const t = texto(b.titulo, 300); if (!t) return error("La tarea no puede quedar vacía", 400); cambios.titulo = t }
    if ("detalle" in b) cambios.detalle = textoLargo(b.detalle, 2000) || null
    if ("frecuencia" in b) { if (!esFrecuencia(b.frecuencia)) return error("Frecuencia inválida", 400); cambios.frecuencia = b.frecuencia }
    const cambiaFrecuencia = "frecuencia" in cambios && cambios.frecuencia !== tarea.frecuencia
    if ("vence" in b) cambios.vence = fechaValida(b.vence)
    if ("orden" in b && Number.isFinite(Number(b.orden))) cambios.orden = Math.max(-1e9, Math.min(1e9, Math.trunc(Number(b.orden))))
    if ("miembro_id" in b) {
      const { data: m } = await sb.from("team_members").select("id,estado").eq("id", Number(b.miembro_id)).maybeSingle()
      if (!m || m.estado !== "aprobado") return error("Elegí a alguien del equipo", 400)
      cambios.miembro_id = Number(m.id)
    }
    if ((cambios.frecuencia ?? tarea.frecuencia) !== "una_vez") cambios.vence = null
    // Con otra frecuencia la tarea arranca de cero: las tildes viejas no valen (una diaria tildada no
    // puede quedar como «una vez» hecha).
    if (cambiaFrecuencia) {
      cambios.hecha_at = null
      cambios.hecha_por = null
      cambios.en_progreso_desde = null
      cambios.en_progreso_por = null
      const { error: e0 } = await sb.from("crm_tareas_marcas").delete().eq("tarea_id", tarea.id)
      if (e0) throw new Error(e0.message)
    }
    const { error: e } = await sb.from("crm_tareas").update(cambios).eq("id", tarea.id)
    if (e) throw new Error(e.message)
    return NextResponse.json({ ok: true, ...(await respuesta(sb, yo)) })
  } catch (e) {
    return error(`No se pudo guardar: ${(e as Error).message}`, 500)
  }
}

export async function DELETE(request: Request) {
  try {
    const sb = createSupabaseAdmin()
    const yo = await miembroActual(sb)
    if (!yo) return error("Tu cuenta no figura en el equipo", 403)
    if (!yo.admin) return error("Solo un CEO puede borrar tareas", 403)
    const b = await request.json().catch(() => ({}))
    const tarea = await tareaPorId(sb, String(b.id || ""))
    if (!tarea) return error("La tarea no existe o ya se archivó", 404)
    const { error: e } = await sb.from("crm_tareas").update({ archivada: true, updated_at: new Date().toISOString() }).eq("id", tarea.id)
    if (e) throw new Error(e.message)
    return NextResponse.json({ ok: true, ...(await respuesta(sb, yo)) })
  } catch (e) {
    return error(`No se pudo borrar: ${(e as Error).message}`, 500)
  }
}
