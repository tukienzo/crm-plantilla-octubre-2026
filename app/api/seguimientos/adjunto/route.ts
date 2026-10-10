import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { usuarioActual } from "@/lib/push"
import { nombreCanonico } from "@/lib/equipo"

export const runtime = "nodejs"

// Adjuntos de un FUP de seguimiento: la captura de pantalla del mensaje enviado, un PDF, etc.
// Van a un bucket privado de Supabase y se sirven por esta misma ruta detrás del login del CRM
// (el pathname no termina en extensión de imagen a propósito: así el middleware exige sesión).
//
//   POST (multipart)  file, id (seguimiento), fup (1 a 10)  → { url, nombre, tipo }
//   GET  ?path=...                                           → el archivo

const BUCKET = "seguimientos-adjuntos"
const MAX_BYTES = 8 * 1024 * 1024
const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "application/pdf": "pdf",
}
const limpio = (v: string) => (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s.-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60)

async function bucketPrivado() {
  const sb = createSupabaseAdmin()
  const { data } = await sb.storage.getBucket(BUCKET)
  if (data) return sb
  const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(EXT_POR_MIME) })
  if (error && !/already exists/i.test(error.message)) throw error
  return sb
}

export async function POST(request: Request) {
  try {
    const u = await usuarioActual()
    if (!u) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const form = await request.formData()
    const archivo = form.get("file")
    const id = String(form.get("id") || "")
    const fup = Number(form.get("fup") || 0)
    if (!id || !Number.isInteger(fup) || fup < 1 || fup > 10) return NextResponse.json({ error: "Falta el seguimiento o el FUP" }, { status: 400 })
    if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
    if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "El archivo pesa más de 8 MB" }, { status: 400 })
    const ext = EXT_POR_MIME[archivo.type]
    if (!ext) return NextResponse.json({ error: "Formato no permitido. Usá JPG, PNG, WEBP, GIF o PDF." }, { status: 400 })

    const sb = await bucketPrivado()
    const { data: fila } = await sb.from("seguimientos").select("id,closer").eq("id", id).maybeSingle()
    if (!fila) return NextResponse.json({ error: "No existe el seguimiento" }, { status: 404 })
    if (u.rol === "Closer" && fila.closer && nombreCanonico(fila.closer).toLowerCase() !== nombreCanonico(u.nombre).toLowerCase()) {
      return NextResponse.json({ error: "Este lead es de otro closer" }, { status: 403 })
    }
    const nombre = limpio(archivo.name.replace(/\.[a-z0-9]+$/i, "")) || "captura"
    const path = `${id}/fup${fup}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${nombre}.${ext}`
    const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await archivo.arrayBuffer()), { contentType: archivo.type, cacheControl: "3600", upsert: false })
    if (error) throw error
    return NextResponse.json({ ok: true, url: `/api/seguimientos/adjunto?path=${encodeURIComponent(path)}`, nombre: archivo.name.slice(0, 120), tipo: archivo.type })
  } catch (e) {
    console.error("seguimientos adjunto POST", e)
    return NextResponse.json({ error: "No se pudo subir el archivo. Probá de nuevo." }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const u = await usuarioActual()
    if (!u) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    const path = new URL(request.url).searchParams.get("path")
    if (!path || path.includes("..")) return NextResponse.json({ error: "Archivo inválido" }, { status: 400 })
    const { data, error } = await createSupabaseAdmin().storage.from(BUCKET).download(path)
    if (error || !data) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 })
    return new NextResponse(data, {
      headers: { "Content-Type": data.type || "application/octet-stream", "Content-Disposition": "inline", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    })
  } catch (e) {
    console.error("seguimientos adjunto GET", e)
    return NextResponse.json({ error: "No se pudo abrir el archivo" }, { status: 500 })
  }
}
