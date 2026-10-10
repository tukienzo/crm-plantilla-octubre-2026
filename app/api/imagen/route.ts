import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"

export const runtime = "nodejs"

// Imágenes que el equipo sube desde su compu: las miniaturas de los videos largos de YouTube y las
// portadas de referencia del catálogo de formatos. Van a un bucket privado de Supabase y se sirven
// por esta misma ruta, así quedan detrás del login del CRM igual que el resto.
//
// Ojo con la URL: usa ?path= y el pathname NO termina en .jpg a propósito. El matcher del
// middleware deja pasar sin sesión cualquier pathname que termine en extensión de imagen, así que
// servir la imagen como /api/imagen/algo.jpg la dejaría pública.
//
//   POST (multipart)  file, destino: "youtube" | "formato", id?, titulo?  → { url }
//   GET  ?path=...                                                        → la imagen

const BUCKET = "imagenes-crm"
const MAX_BYTES = 8 * 1024 * 1024
const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif",
}
// Una portada subida a mano deja portada_origen en null: así el script que baja portadas de
// Instagram sabe que esa no la tiene que pisar.
const DESTINOS = {
  youtube: { tabla: "crm_youtube_videos", cambios: (url: string) => ({ miniatura_url: url }) },
  formato: { tabla: "crm_formatos", cambios: (url: string) => ({ portada_url: url, portada_origen: null }) },
} as const
type Destino = keyof typeof DESTINOS

const limpio = (v: string) => (v || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60)

async function rolActual() {
  const sesion = await createSupabaseServer()
  const { data: { user } } = await sesion.auth.getUser()
  if (!user?.email) return null
  const { data } = await createSupabaseAdmin().from("team_members").select("rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
  return data?.estado === "aprobado" ? String(data.rol || "") : null
}

async function bucketPrivado() {
  const sb = createSupabaseAdmin()
  const { data } = await sb.storage.getBucket(BUCKET)
  if (data) return sb
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: false, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(EXT_POR_MIME),
  })
  if (error && !/already exists/i.test(error.message)) throw error
  return sb
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const archivo = form.get("file")
    const destino = String(form.get("destino") || "") as Destino
    const id = String(form.get("id") || "")
    const titulo = String(form.get("titulo") || "")

    if (!DESTINOS[destino]) return NextResponse.json({ error: "Destino inválido" }, { status: 400 })
    if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta la imagen" }, { status: 400 })
    if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "La imagen pesa más de 8 MB" }, { status: 400 })
    const ext = EXT_POR_MIME[archivo.type]
    if (!ext) return NextResponse.json({ error: "Formato no permitido. Usá JPG, PNG, WEBP, AVIF o GIF." }, { status: 400 })

    // El catálogo de formatos lo administra solo el dueño del CRM, igual que en /api/banco-formatos.
    if (destino === "formato" && (await rolActual()) !== "CEO") {
      return NextResponse.json({ error: "Solo el admin puede cambiar las portadas de los formatos" }, { status: 403 })
    }

    const sb = await bucketPrivado()
    const nombre = limpio(titulo) || destino
    const path = `${destino}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${nombre}.${ext}`
    const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(await archivo.arrayBuffer()), {
      contentType: archivo.type, cacheControl: "3600", upsert: false,
    })
    if (error) throw error

    const url = `/api/imagen?path=${encodeURIComponent(path)}`
    // Si vino con la fila, se deja cargada de una: es lo que espera quien sube la imagen.
    if (id) {
      const { tabla, cambios } = DESTINOS[destino]
      const { error: e } = await sb.from(tabla).update(cambios(url)).eq("id", id)
      if (e) throw new Error(e.message)
    }
    return NextResponse.json({ ok: true, url })
  } catch (e) {
    console.error("imagen POST", e)
    return NextResponse.json({ error: "No se pudo subir la imagen. Probá de nuevo." }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get("path")
    if (!path || path.includes("..")) return NextResponse.json({ error: "Imagen inválida" }, { status: 400 })
    const { data, error } = await createSupabaseAdmin().storage.from(BUCKET).download(path)
    if (error || !data) return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 })
    return new NextResponse(data, {
      headers: {
        "Content-Type": data.type || "image/jpeg",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    console.error("imagen GET", e)
    return NextResponse.json({ error: "No se pudo abrir la imagen" }, { status: 500 })
  }
}
