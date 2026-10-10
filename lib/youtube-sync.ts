import type { SupabaseClient } from "@supabase/supabase-js"

// Trae del canal los videos ya publicados y los deja en crm_youtube_videos.
// Lo usan el botón "Sincronizar canal" (/api/youtube) y el cron diario (/api/youtube-sync).

// Los Shorts no son proyectos de este tablero: el corte es 3 minutos.
const MINIMO_LARGO_SEG = 180

const entero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null }

// "PT12M34S" → segundos
export function duracionEnSegundos(iso: unknown) {
  const m = String(iso || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
}

async function yt(path: string, params: Record<string, string>) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) throw new Error("Falta YOUTUBE_API_KEY")
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
  for (const [k, v] of Object.entries({ ...params, key })) url.searchParams.set(k, v)
  const r = await fetch(url, { cache: "no-store" })
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j?.error?.message || `YouTube HTTP ${r.status}`)
  return j
}

export async function sincronizarCanal(sb: SupabaseClient) {
  const canal = process.env.YOUTUBE_CHANNEL_ID
  if (!canal) throw new Error("Falta YOUTUBE_CHANNEL_ID")
  // La playlist de subidas es el id del canal con UU en lugar de UC.
  const uploads = `UU${canal.slice(2)}`

  const items: Array<Record<string, any>> = []
  let token = ""
  for (let pagina = 0; pagina < 6; pagina++) {
    const j = await yt("playlistItems", { part: "snippet,contentDetails", playlistId: uploads, maxResults: "50", ...(token ? { pageToken: token } : {}) })
    items.push(...(j.items || []))
    token = j.nextPageToken || ""
    if (!token) break
  }

  // Métricas y duración, en lotes de 50 (el máximo que acepta el endpoint).
  const ids = items.map((it) => String(it.contentDetails?.videoId || "")).filter(Boolean)
  const detalle = new Map<string, { vistas: number | null; likes: number | null; comentarios: number | null; duracion: number | null }>()
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt("videos", { part: "statistics,contentDetails", id: ids.slice(i, i + 50).join(",") })
    for (const v of j.items || []) {
      detalle.set(String(v.id), {
        vistas: entero(v.statistics?.viewCount), likes: entero(v.statistics?.likeCount),
        comentarios: entero(v.statistics?.commentCount), duracion: duracionEnSegundos(v.contentDetails?.duration),
      })
    }
  }

  let nuevos = 0, actualizados = 0, shorts = 0
  for (const it of items) {
    const s = it.snippet || {}
    const videoId = String(it.contentDetails?.videoId || "")
    if (!videoId) continue
    const d = detalle.get(videoId)
    if (typeof d?.duracion === "number" && d.duracion < MINIMO_LARGO_SEG) { shorts++; continue }
    const miniatura = s.thumbnails?.maxres?.url || s.thumbnails?.standard?.url || s.thumbnails?.high?.url || s.thumbnails?.medium?.url || null
    const metricas = {
      titulo: String(s.title || "").slice(0, 300),
      miniatura_url: miniatura,
      publicado_at: s.publishedAt || null,
      duracion_seg: d?.duracion ?? null,
      vistas: d?.vistas ?? null, likes: d?.likes ?? null, comentarios: d?.comentarios ?? null,
      stats_at: new Date().toISOString(),
    }
    const { data: existe } = await sb.from("crm_youtube_videos").select("id").eq("youtube_id", videoId).maybeSingle()
    if (existe) {
      // Solo se refrescan título, miniatura y números: el guion, las notas y el responsable
      // se cargan a mano en el CRM y no los pisa la sincronización.
      await sb.from("crm_youtube_videos").update(metricas).eq("id", existe.id)
      actualizados++
    } else {
      await sb.from("crm_youtube_videos").insert({
        ...metricas,
        estado: "publicado",
        descripcion: String(s.description || "").slice(0, 2000) || null,
        video_url: `https://www.youtube.com/watch?v=${videoId}`,
        youtube_id: videoId,
        origen: "youtube",
      })
      nuevos++
    }
  }
  return { revisados: items.length, nuevos, actualizados, shorts }
}
