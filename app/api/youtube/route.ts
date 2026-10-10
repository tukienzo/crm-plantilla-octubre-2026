import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { sincronizarCanal } from "@/lib/youtube-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Videos largos de YouTube: los que están en producción y los publicados del canal.
//   GET                                     → videos + los clips de cada uno
//   POST   { titulo, ... }                  → crea un video en producción
//   POST   { accion: "sync" }               → trae del canal los publicados y refresca sus métricas
//   POST   { accion: "clip", video_id }     → crea el clip siguiente de ese video (pieza de contenido)
//   PATCH  { id, ...campos }                → edita un video
//   DELETE { id }                           → borra un video (los clips quedan, sin el vínculo)

const ESTADOS = new Set(["idea", "guion", "grabado", "edicion", "miniatura", "listo", "publicado"])
const texto = (v: unknown, max: number) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t ? t.slice(0, max) : "" }

export async function GET() {
  try {
    const sb = createSupabaseAdmin()
    const { data: videos, error } = await sb.from("crm_youtube_videos").select("*").order("publicado_at", { ascending: false, nullsFirst: true }).order("created_at", { ascending: false })
    if (error) throw new Error(error.message)
    // Los clips son piezas de contenido atadas al video por metadata.
    const { data: clips } = await sb.from("crm_content_assets")
      .select("id,title,format,status,assigned_to,source_url,planned_at,script_text,metadata")
      .not("metadata->>youtube_video_id", "is", null)
      .limit(1000)
    const porVideo = new Map<string, Array<Record<string, unknown>>>()
    for (const c of clips || []) {
      const k = String((c.metadata as Record<string, unknown>)?.youtube_video_id || "")
      if (!porVideo.has(k)) porVideo.set(k, [])
      porVideo.get(k)!.push(c)
    }
    for (const lista of porVideo.values()) {
      lista.sort((a, b) => Number((a.metadata as Record<string, unknown>)?.clip_numero || 0) - Number((b.metadata as Record<string, unknown>)?.clip_numero || 0))
    }
    return NextResponse.json({
      videos: (videos || []).map((v) => ({ ...v, clips: porVideo.get(v.id) || [] })),
      canal: process.env.YOUTUBE_CHANNEL_ID || null,
      conectado: Boolean(process.env.YOUTUBE_API_KEY && process.env.YOUTUBE_CHANNEL_ID),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sb = createSupabaseAdmin()
    const b = await request.json().catch(() => ({}))
    const accion = String(b.accion || "")

    // ── traer del canal los videos publicados y refrescar métricas ──
    if (accion === "sync") {
      const r = await sincronizarCanal(sb)
      return NextResponse.json({ ok: true, ...r })
    }

    // ── crear el clip siguiente de un video ──
    if (accion === "clip") {
      const videoId = String(b.video_id || "")
      if (!videoId) return NextResponse.json({ error: "Falta el video" }, { status: 400 })
      const { data: video } = await sb.from("crm_youtube_videos").select("id,titulo,responsable").eq("id", videoId).maybeSingle()
      if (!video) return NextResponse.json({ error: "Ese video no existe" }, { status: 404 })
      const { data: previos } = await sb.from("crm_content_assets").select("metadata").eq("metadata->>youtube_video_id", videoId)
      const numero = Math.max(0, ...(previos || []).map((c) => Number((c.metadata as Record<string, unknown>)?.clip_numero || 0))) + 1
      const { data, error } = await sb.from("crm_content_assets").insert({
        source_key: `manual:crm:${randomUUID()}`,
        title: texto(b.titulo, 200) || `Clip ${numero} · ${video.titulo}`,
        format: "CLIP",
        status: "idea",
        assigned_to: texto(b.responsable, 60) || video.responsable || "SIN ASIGNAR",
        platform: "IG + TikTok",
        insight_notes: `Clip del video largo "${video.titulo}".`,
        metadata: { import_source: "youtube_clips", created_via: "/api/youtube", youtube_video_id: videoId, clip_numero: numero },
      }).select("id,title,format,status,assigned_to,source_url,planned_at,metadata").single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, clip: data }, { status: 201 })
    }

    // ── crear un video en producción ──
    const titulo = texto(b.titulo, 300)
    if (!titulo) return NextResponse.json({ error: "Escribí el título o la idea del video" }, { status: 400 })
    const { data, error } = await sb.from("crm_youtube_videos").insert({
      titulo,
      estado: ESTADOS.has(String(b.estado)) ? String(b.estado) : "idea",
      descripcion: texto(b.descripcion, 2000) || null,
      notas: texto(b.notas, 2000) || null,
      guion_url: texto(b.guion_url, 600) || null,
      miniatura_url: texto(b.miniatura_url, 600) || null,
      video_url: texto(b.video_url, 600) || null,
      responsable: texto(b.responsable, 60) || null,
      fecha_objetivo: b.fecha_objetivo || null,
      origen: "crm",
    }).select("*").single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, video: { ...data, clips: [] } }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const id = String(b.id || "")
    if (!id) return NextResponse.json({ error: "Falta el video" }, { status: 400 })
    const cambios: Record<string, unknown> = {}
    if (b.titulo !== undefined) { const t = texto(b.titulo, 300); if (!t) return NextResponse.json({ error: "El título no puede quedar vacío" }, { status: 400 }); cambios.titulo = t }
    if (b.estado !== undefined && ESTADOS.has(String(b.estado))) cambios.estado = String(b.estado)
    for (const campo of ["descripcion", "notas", "guion_url", "miniatura_url", "video_url", "responsable"] as const) {
      if (b[campo] !== undefined) cambios[campo] = texto(b[campo], campo === "descripcion" || campo === "notas" ? 2000 : 600) || null
    }
    if (b.fecha_objetivo !== undefined) cambios.fecha_objetivo = b.fecha_objetivo || null
    if (!Object.keys(cambios).length) return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
    const { data, error } = await createSupabaseAdmin().from("crm_youtube_videos").update(cambios).eq("id", id).select("*").single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, video: data })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const id = String(b.id || "")
    if (!id) return NextResponse.json({ error: "Falta el video" }, { status: 400 })
    const sb = createSupabaseAdmin()
    const { data: video } = await sb.from("crm_youtube_videos").select("origen,titulo").eq("id", id).maybeSingle()
    if (!video) return NextResponse.json({ error: "Ese video ya no existe" }, { status: 404 })
    if (video.origen === "youtube") return NextResponse.json({ error: "Ese video viene del canal: si lo borrás acá, la próxima sincronización lo trae de nuevo. Borralo en YouTube." }, { status: 409 })
    const { count } = await sb.from("crm_content_assets").select("id", { count: "exact", head: true }).eq("metadata->>youtube_video_id", id)
    const { error } = await sb.from("crm_youtube_videos").delete().eq("id", id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, clips_sueltos: count || 0 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
