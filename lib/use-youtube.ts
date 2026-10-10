"use client"

import useSWR from "swr"

// Videos largos del canal: los proyectos en producción (los creamos acá) y los publicados
// (los trae la YouTube Data API). Los clips de cada video son piezas de contenido normales.

export type ClipYoutube = {
  id: string
  title: string
  format: string | null
  status: string
  assigned_to: string | null
  source_url: string | null
  planned_at: string | null
  script_text?: string | null
  metadata: Record<string, unknown> | null
}

export type VideoYoutube = {
  id: string
  titulo: string
  estado: string
  descripcion: string | null
  notas: string | null
  guion_url: string | null
  miniatura_url: string | null
  video_url: string | null
  youtube_id: string | null
  publicado_at: string | null
  duracion_seg: number | null
  vistas: number | null
  likes: number | null
  comentarios: number | null
  responsable: string | null
  fecha_objetivo: string | null
  origen: string
  stats_at: string | null
  created_at: string
  clips: ClipYoutube[]
}

export const ESTADOS_YT = [
  { id: "idea", label: "Idea" },
  { id: "guion", label: "Guion" },
  { id: "grabado", label: "Grabado" },
  { id: "edicion", label: "Edición" },
  { id: "miniatura", label: "Miniatura" },
  { id: "listo", label: "Listo para subir" },
  { id: "publicado", label: "Publicado" },
] as const

// Los estados que cuentan como "pendiente de producir": todo lo que todavía no se publicó.
export const PENDIENTES_YT = ["idea", "guion", "grabado", "edicion", "miniatura", "listo"]

export const TONO_ESTADO: Record<string, string> = {
  idea: "border-zinc-400/40 bg-zinc-400/10 text-zinc-600 dark:text-zinc-300",
  guion: "border-blue-400/40 bg-blue-400/10 text-blue-700 dark:text-blue-300",
  grabado: "border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-300",
  edicion: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  miniatura: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-700 dark:text-fuchsia-300",
  listo: "border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-300",
  publicado: "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300",
}

export const etiquetaEstado = (id: string) => ESTADOS_YT.find((e) => e.id === id)?.label || id

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const b = await r.json()
  if (!r.ok) throw new Error(b.error || "No se pudieron cargar los videos")
  return b as { videos: VideoYoutube[]; canal: string | null; conectado: boolean }
})

export function useYoutube() {
  const { data, error, isLoading, mutate } = useSWR("/api/youtube", fetcher, { revalidateOnFocus: false })
  const videos = data?.videos || []
  return {
    videos,
    pendientes: videos.filter((v) => v.estado !== "publicado"),
    publicados: videos.filter((v) => v.estado === "publicado"),
    ideas: videos.filter((v) => v.estado === "idea"),
    canal: data?.canal || null,
    conectado: Boolean(data?.conectado),
    cargando: isLoading,
    error,
    recargar: mutate,
  }
}

// Vista previa que se dibuja adentro de la tarjeta del video. Prioridad: la miniatura cargada,
// después el video en sí (YouTube, Drive o un archivo suelto) y por último nada.
// Un archivo .mp4/.mov/.webm se muestra como video mudo: es la única forma de ver un borrador
// que todavía no está en ningún lado que genere miniatura.
export type Preview =
  | { tipo: "imagen"; src: string }
  | { tipo: "video"; src: string }
  | { tipo: "link"; href: string; dominio: string }
  | { tipo: "ninguna" }

function deUrl(url: string | null | undefined): Preview {
  const u = String(url || "").trim()
  if (!u) return { tipo: "ninguna" }
  if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u)) return { tipo: "imagen", src: u }
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(u)) return { tipo: "video", src: u }
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/)
  if (yt) return { tipo: "imagen", src: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` }
  const drive = u.match(/drive\.google\.com\/(?:file\/d\/|.*[?&]id=)([\w-]{10,})/)
  if (drive) return { tipo: "imagen", src: `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w800` }
  try { return { tipo: "link", href: u, dominio: new URL(u).hostname.replace(/^www\./, "") } } catch { return { tipo: "ninguna" } }
}

export function previewVideo(v: Pick<VideoYoutube, "miniatura_url" | "video_url" | "youtube_id">): Preview {
  const mini = deUrl(v.miniatura_url)
  if (mini.tipo === "imagen") return mini
  if (v.youtube_id) return { tipo: "imagen", src: `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg` }
  const video = deUrl(v.video_url)
  if (video.tipo !== "ninguna") return video
  return mini
}

export const linkDeVideo = (v: Pick<VideoYoutube, "youtube_id" | "video_url">) =>
  v.youtube_id ? `https://www.youtube.com/watch?v=${v.youtube_id}` : v.video_url || null

export function duracionTexto(seg: number | null | undefined) {
  if (!seg && seg !== 0) return null
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`
}

export const numero = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("es-AR")
