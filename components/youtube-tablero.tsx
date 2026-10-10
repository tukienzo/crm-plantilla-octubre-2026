"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useSession } from "@/components/session-provider"
import { SubirImagen } from "@/components/subir-imagen"
import { SIN_ASIGNAR, unificarResponsables } from "@/lib/responsables"
import { RESPONSABLES_CONTENIDO } from "@/lib/equipo"
import {
  Loader2, Plus, RefreshCw, ExternalLink, Trash2, Save, Scissors, Film, ImageOff,
  Eye, ThumbsUp, MessageSquare, Clock, PlayCircle, X, Link2, CheckCircle2, AlertTriangle,
} from "lucide-react"
import {
  useYoutube, previewVideo, linkDeVideo, duracionTexto, numero,
  ESTADOS_YT, PENDIENTES_YT, TONO_ESTADO, etiquetaEstado,
  type VideoYoutube, type ClipYoutube, type Preview,
} from "@/lib/use-youtube"

// YouTube: el tablero de los videos largos. Los que están en producción se cargan acá; los
// publicados los trae la API del canal. Los clips de cada video son piezas de contenido reales
// (crm_content_assets con metadata.youtube_video_id), así entran en el mismo pipeline que el
// resto y se asignan a un editor igual que cualquier otra pieza.

const ADMIN = ["CEO", "Sales Manager", "Manager MKT"]
const ESTADO_CLIP: Record<string, { label: string; tono: string }> = {
  idea: { label: "Idea", tono: "border-zinc-400/40 bg-zinc-400/10 text-zinc-600 dark:text-zinc-300" },
  guion_listo: { label: "Guion listo", tono: "border-blue-400/40 bg-blue-400/10 text-blue-700 dark:text-blue-300" },
  para_grabar: { label: "Para grabar", tono: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300" },
  grabado: { label: "Grabado", tono: "border-violet-400/40 bg-violet-400/10 text-violet-700 dark:text-violet-300" },
  en_produccion: { label: "En producción", tono: "border-sky-400/40 bg-sky-400/10 text-sky-700 dark:text-sky-300" },
  en_revision: { label: "En revisión", tono: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-700 dark:text-fuchsia-300" },
  completo: { label: "Completo", tono: "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300" },
  publicado: { label: "Publicado", tono: "border-emerald-400/40 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300" },
  historical: { label: "Archivado", tono: "border-zinc-400/40 bg-zinc-400/10 text-zinc-500" },
}
const clipMeta = (s: string) => ESTADO_CLIP[s] || { label: s || "Sin estado", tono: "border-zinc-400/40 bg-zinc-400/10 text-zinc-500" }
const ESTADOS_CLIP_OPCIONES = ["idea", "en_produccion", "en_revision", "completo", "publicado"]
// Quién puede quedar a cargo: los editores aprobados del equipo salen de team_members, así que
// alcanza con dar de alta al editor para que aparezca acá. Lo ya cargado a mano se conserva, excepto
// que sea el mismo nombre escrito distinto: en ese caso gana el de la cuenta y no se duplica.
const responsablesCon = (editores: string[] | undefined, actual?: string | null) =>
  unificarResponsables([SIN_ASIGNAR, ...RESPONSABLES_CONTENIDO], editores, actual ? [actual] : [])

const fecha = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", className)}>{children}</span>
}

// ── la vista previa que va adentro de la tarjeta ──────────────────────────────
// `interactivo` en false cuando la vista va adentro de un botón: un <a> anidado en un <button> es
// HTML inválido y el click deja de comportarse igual en todos los navegadores.
function Vista({ video, alto = "h-40", interactivo = true }: { video: VideoYoutube; alto?: string; interactivo?: boolean }) {
  const [rota, setRota] = useState(false)
  const p: Preview = previewVideo(video)
  const base = cn("relative w-full overflow-hidden rounded-xl border border-border bg-muted", alto)
  if (p.tipo === "imagen" && !rota) {
    return <div className={base}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.src} alt={video.titulo} loading="lazy" onError={() => setRota(true)} className="h-full w-full object-cover" />
      {video.duracion_seg ? <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-white">{duracionTexto(video.duracion_seg)}</span> : null}
    </div>
  }
  if (p.tipo === "video" && !rota) {
    return <div className={base}>
      <video src={`${p.src}#t=1`} muted playsInline preload="metadata" onError={() => setRota(true)} className="h-full w-full object-cover" />
      <span className="absolute inset-0 grid place-items-center bg-black/25"><PlayCircle className="h-9 w-9 text-white/90" /></span>
    </div>
  }
  if (p.tipo === "link" && !rota) {
    const contenido = <><ExternalLink className="h-4 w-4" />Ver el video en {p.dominio}</>
    const clases = cn(base, "flex items-center justify-center gap-2 border-dashed text-xs font-semibold text-muted-foreground hover:text-foreground")
    return interactivo
      ? <a href={p.href} target="_blank" rel="noreferrer" className={clases}>{contenido}</a>
      : <span className={clases}>{contenido}</span>
  }
  return <div className={cn(base, "flex flex-col items-center justify-center gap-1 border-dashed text-xs text-muted-foreground")}>
    <ImageOff className="h-5 w-5" />Sin video ni miniatura cargada
  </div>
}

// ── tarjeta de un video ───────────────────────────────────────────────────────
function TarjetaVideo({ video, onOpen }: { video: VideoYoutube; onOpen: () => void }) {
  const link = linkDeVideo(video)
  const clipsListos = video.clips.filter((c) => ["completo", "publicado"].includes(c.status)).length
  return (
    <Card className="group overflow-hidden border-border transition hover:border-foreground/25 hover:shadow-lg">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="p-3 pb-0"><Vista video={video} interactivo={false} /></div>
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip className={TONO_ESTADO[video.estado] || TONO_ESTADO.idea}>{etiquetaEstado(video.estado)}</Chip>
            {video.origen === "youtube" ? <Chip className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">Del canal</Chip> : null}
            {video.responsable ? <Chip className="border-border bg-muted text-muted-foreground">{video.responsable}</Chip> : null}
          </div>
          <h3 className="line-clamp-2 text-sm font-black leading-snug">{video.titulo}</h3>
          {video.estado === "publicado" ? (
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{numero(video.vistas)}</span>
              <span className="inline-flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{numero(video.likes)}</span>
              <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{numero(video.comentarios)}</span>
              {video.publicado_at ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fecha(video.publicado_at)}</span> : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              {video.fecha_objetivo ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Sale el {fecha(video.fecha_objetivo)}</span> : <span className="text-muted-foreground/70">Sin fecha objetivo</span>}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Scissors className="h-3 w-3" />
              {video.clips.length ? `${video.clips.length} clip${video.clips.length === 1 ? "" : "s"}${clipsListos ? ` · ${clipsListos} listo${clipsListos === 1 ? "" : "s"}` : ""}` : "Sin clips todavía"}
            </span>
            <span className="text-muted-foreground opacity-0 transition group-hover:opacity-100">Abrir →</span>
          </div>
        </CardContent>
      </button>
      {link ? <a href={link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 border-t border-border py-2 text-[11px] font-bold text-muted-foreground transition hover:bg-muted hover:text-foreground"><ExternalLink className="h-3 w-3" />Ver el video</a> : null}
    </Card>
  )
}

// ── el tablero ────────────────────────────────────────────────────────────────
export function YoutubeTablero({ vista }: { vista: "produccion" | "ideas" | "miniaturas" | "publicados" }) {
  const { videos, pendientes, publicados, ideas, canal, conectado, cargando, error, recargar } = useYoutube()
  const session = useSession()
  const esAdmin = ADMIN.includes(session.rol)
  const puedeEditar = session.email !== "preview@demo.local"
  const [abierto, setAbierto] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [titulo, setTitulo] = useState("")
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const { data: opciones } = useSWR<{ formats: string[]; editores?: string[] }>(
    "/api/content-workspace?options=formats",
    (u: string) => fetch(u).then((r) => r.json()),
  )
  const editores = opciones?.editores || []

  const video = useMemo(() => videos.find((v) => v.id === abierto) || null, [videos, abierto])
  // Si el video deja de existir (se borró desde otra pestaña), se cierra el diálogo solo.
  useEffect(() => { if (abierto && !cargando && !video) setAbierto(null) }, [abierto, cargando, video])

  async function llamar(metodo: "POST" | "PATCH" | "DELETE", cuerpo: Record<string, unknown>, etiqueta: string) {
    setOcupado(etiqueta); setAviso(null)
    try {
      const r = await fetch("/api/youtube", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo guardar")
      await recargar()
      return j
    } catch (e) { setAviso({ ok: false, texto: (e as Error).message }); return null } finally { setOcupado(null) }
  }

  async function sincronizar() {
    const j = await llamar("POST", { accion: "sync" }, "sync")
    if (j) setAviso({ ok: true, texto: `Canal sincronizado: ${j.nuevos} video${j.nuevos === 1 ? "" : "s"} nuevo${j.nuevos === 1 ? "" : "s"} y ${j.actualizados} con métricas al día.` })
  }

  async function crear() {
    if (!titulo.trim()) return
    const j = await llamar("POST", { titulo, estado: "idea" }, "crear")
    if (j) { setTitulo(""); setCreando(false); setAbierto(j.video?.id || null) }
  }

  const listaVista = vista === "publicados" ? publicados : vista === "ideas" ? ideas : vista === "miniaturas" ? videos : pendientes
  const totalVistas = publicados.reduce((a, v) => a + (v.vistas || 0), 0)

  return (
    <div className="space-y-5">
      {/* resumen + acciones */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <Dato titulo="Pendientes" valor={pendientes.length} detalle="videos largos por producir" />
          <Dato titulo="Ideas" valor={ideas.length} detalle="sin guion todavía" />
          <Dato titulo="Publicados" valor={publicados.length} detalle="en el canal" />
          <Dato titulo="Vistas" valor={numero(totalVistas)} detalle="suma de los publicados" />
          <Dato titulo="Clips" valor={videos.reduce((a, v) => a + v.clips.length, 0)} detalle="piezas atadas a un video" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canal ? <a href={`https://www.youtube.com/channel/${canal}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" />Ver el canal</a> : null}
          {esAdmin ? <Button size="sm" variant="outline" onClick={sincronizar} disabled={!conectado || ocupado === "sync"}>
            {ocupado === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sincronizar canal
          </Button> : null}
          {esAdmin ? <Button size="sm" onClick={() => setCreando((v) => !v)}><Plus className="mr-2 h-4 w-4" />Nuevo video</Button> : null}
        </div>
      </div>

      {!conectado ? <Aviso tono="alerta" texto="El canal todavía no está conectado: falta cargar YOUTUBE_API_KEY y YOUTUBE_CHANNEL_ID. Los videos que cargues a mano funcionan igual." /> : null}
      {aviso ? <Aviso tono={aviso.ok ? "ok" : "error"} texto={aviso.texto} onCerrar={() => setAviso(null)} /> : null}

      {creando ? (
        <Card className="border-border">
          <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Título o idea del video largo</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder='Ej: "Los cinco errores que cometí el primer año"' onKeyDown={(e) => { if (e.key === "Enter") crear() }} />
            </div>
            <div className="flex gap-2">
              <Button onClick={crear} disabled={!titulo.trim() || ocupado === "crear"}>{ocupado === "crear" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Crear</Button>
              <Button variant="ghost" onClick={() => { setCreando(false); setTitulo("") }}><X className="h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {cargando ? <div className="grid place-items-center py-16 text-sm text-muted-foreground"><Loader2 className="mb-2 h-5 w-5 animate-spin" />Cargando los videos…</div>
        : error ? <Aviso tono="error" texto={(error as Error).message} />
        : vista === "produccion" ? <Produccion videos={pendientes} onOpen={setAbierto} />
        : vista === "miniaturas" ? <Miniaturas videos={videos} onOpen={setAbierto} puedeEditar={puedeEditar} onCambio={recargar} />
        : <Grilla videos={listaVista} onOpen={setAbierto} vacio={vista === "ideas" ? "Todavía no hay ideas cargadas. Tocá “Nuevo video” y anotá la primera." : "No hay videos publicados sincronizados. Tocá “Sincronizar canal”."} />}

      {video ? <VideoDialog
        video={video}
        esAdmin={esAdmin}
        puedeEditar={puedeEditar}
        editores={editores}
        onClose={() => setAbierto(null)}
        onCambio={recargar}
      /> : null}
    </div>
  )
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: number | string; detalle: string }) {
  return <div className="rounded-xl border border-border bg-card px-3 py-2">
    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
    <p className="text-xl font-black leading-tight">{valor}</p>
    <p className="text-[11px] text-muted-foreground">{detalle}</p>
  </div>
}

function Aviso({ tono, texto, onCerrar }: { tono: "ok" | "error" | "alerta"; texto: string; onCerrar?: () => void }) {
  const estilos = {
    ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    error: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
    alerta: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  }[tono]
  const Icono = tono === "ok" ? CheckCircle2 : AlertTriangle
  return <div className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-sm", estilos)}>
    <Icono className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{texto}</span>
    {onCerrar ? <button onClick={onCerrar} className="opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button> : null}
  </div>
}

function Grilla({ videos, onOpen, vacio }: { videos: VideoYoutube[]; onOpen: (id: string) => void; vacio: string }) {
  if (!videos.length) return <div className="grid place-items-center rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">{vacio}</div>
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {videos.map((v) => <TarjetaVideo key={v.id} video={v} onOpen={() => onOpen(v.id)} />)}
  </div>
}

// Tablero por estado: idea → guion → grabado → edición → miniatura → listo.
function Produccion({ videos, onOpen }: { videos: VideoYoutube[]; onOpen: (id: string) => void }) {
  const columnas = PENDIENTES_YT.map((estado) => ({ estado, items: videos.filter((v) => v.estado === estado) }))
  if (!videos.length) return <div className="grid place-items-center rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">No hay videos largos en producción. Tocá “Nuevo video” para arrancar uno.</div>
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
    {columnas.map(({ estado, items }) => (
      <div key={estado} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-muted/30 p-2">
        <div className="flex items-center justify-between px-1">
          <Chip className={TONO_ESTADO[estado]}>{etiquetaEstado(estado)}</Chip>
          <span className="text-xs font-black text-muted-foreground">{items.length}</span>
        </div>
        {items.length ? items.map((v) => <TarjetaVideo key={v.id} video={v} onOpen={() => onOpen(v.id)} />)
          : <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">Vacío</p>}
      </div>
    ))}
  </div>
}

// Panel de miniaturas: el packaging de todos los videos junto, para ver si la portada se sostiene
// al lado de las otras. Marca en rojo las que faltan.
function Miniaturas({ videos, onOpen, puedeEditar, onCambio }: { videos: VideoYoutube[]; onOpen: (id: string) => void; puedeEditar: boolean; onCambio: () => void }) {
  const sin = videos.filter((v) => !v.miniatura_url).length
  if (!videos.length) return <div className="grid place-items-center rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">Todavía no hay videos cargados.</div>
  return <div className="space-y-3">
    {sin ? <Aviso tono="alerta" texto={`${sin} video${sin === 1 ? " no tiene" : "s no tienen"} miniatura cargada. Abrí el video y pegá el link de la imagen.`} /> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((v) => (
        <div key={v.id} className="group space-y-2">
          <button type="button" onClick={() => onOpen(v.id)} className="block w-full space-y-2 text-left">
            <div className={cn("rounded-xl p-1 transition", v.miniatura_url ? "border border-border" : "border border-dashed border-amber-500/50")}>
              <Vista video={v} alto="h-44" interactivo={false} />
            </div>
            <p className="line-clamp-2 px-1 text-xs font-bold leading-snug group-hover:underline">{v.titulo}</p>
            <div className="flex flex-wrap gap-1.5 px-1">
              <Chip className={TONO_ESTADO[v.estado]}>{etiquetaEstado(v.estado)}</Chip>
              {!v.miniatura_url ? <Chip className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">Sin miniatura</Chip> : null}
            </div>
          </button>
          {puedeEditar ? <SubirImagen destino="youtube" id={v.id} titulo={v.titulo} variant="ghost"
            etiqueta={v.miniatura_url ? "Cambiar miniatura" : "Subir miniatura"} onSubido={() => { onCambio() }} /> : null}
        </div>
      ))}
    </div>
  </div>
}

// ── el detalle de un video, con sus clips ─────────────────────────────────────
function VideoDialog({ video, esAdmin, puedeEditar, editores, onClose, onCambio }: {
  video: VideoYoutube; esAdmin: boolean; puedeEditar: boolean; editores: string[]
  onClose: () => void; onCambio: () => void
}) {
  const [borrador, setBorrador] = useState({
    titulo: video.titulo, estado: video.estado, responsable: video.responsable || "",
    fecha_objetivo: video.fecha_objetivo || "", descripcion: video.descripcion || "", notas: video.notas || "",
    guion_url: video.guion_url || "", miniatura_url: video.miniatura_url || "", video_url: video.video_url || "",
  })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const link = linkDeVideo(video)
  const delCanal = video.origen === "youtube"

  async function guardar() {
    setOcupado("guardar"); setAviso(null)
    try {
      const r = await fetch("/api/youtube", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: video.id, ...borrador }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo guardar")
      await onCambio()
      setAviso({ ok: true, texto: "Guardado." })
    } catch (e) { setAviso({ ok: false, texto: (e as Error).message }) } finally { setOcupado(null) }
  }

  async function borrar() {
    if (!window.confirm(`¿Borrar "${video.titulo}"? Los clips que ya creaste quedan en Contenido, sueltos.`)) return
    setOcupado("borrar"); setAviso(null)
    try {
      const r = await fetch("/api/youtube", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: video.id }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo borrar")
      await onCambio(); onClose()
    } catch (e) { setAviso({ ok: false, texto: (e as Error).message }) } finally { setOcupado(null) }
  }

  async function nuevoClip() {
    setOcupado("clip"); setAviso(null)
    try {
      const r = await fetch("/api/youtube", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accion: "clip", video_id: video.id }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo crear el clip")
      await onCambio()
    } catch (e) { setAviso({ ok: false, texto: (e as Error).message }) } finally { setOcupado(null) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-1rem)] overflow-y-auto border-border bg-card sm:max-w-4xl">
        <DialogHeader className="text-left">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Chip className={TONO_ESTADO[video.estado]}>{etiquetaEstado(video.estado)}</Chip>
            {delCanal ? <Chip className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">Del canal</Chip> : null}
            {video.duracion_seg ? <Chip className="border-border bg-muted text-muted-foreground">{duracionTexto(video.duracion_seg)}</Chip> : null}
          </div>
          <DialogTitle className="text-xl font-black leading-tight">{video.titulo}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Vista video={video} alto="h-44" />
            {link ? <Button asChild variant="outline" size="sm" className="w-full"><a href={link} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Ver el video</a></Button> : null}
            {video.estado === "publicado" ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[["Vistas", video.vistas], ["Likes", video.likes], ["Comentarios", video.comentarios]].map(([t, v]) => (
                  <div key={String(t)} className="rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">{String(t)}</p>
                    <p className="text-sm font-black">{numero(v as number | null)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {video.guion_url ? <Button asChild variant="outline" size="sm" className="w-full"><a href={video.guion_url} target="_blank" rel="noreferrer"><Link2 className="mr-2 h-4 w-4" />Abrir el guion</a></Button> : null}
          </div>

          <div className="space-y-4">
            {aviso ? <Aviso tono={aviso.ok ? "ok" : "error"} texto={aviso.texto} onCerrar={() => setAviso(null)} /> : null}

            {/* ── Clips ── */}
            <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="inline-flex items-center gap-2 text-sm font-black"><Scissors className="h-4 w-4" />Clips de este video</h4>
                {puedeEditar ? <Button size="sm" onClick={nuevoClip} disabled={ocupado === "clip"}>
                  {ocupado === "clip" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Agregar clip {video.clips.length + 1}
                </Button> : null}
              </div>
              {video.clips.length ? (
                <ul className="space-y-2">
                  {video.clips.map((c) => <ClipFila key={c.id} clip={c} editores={editores} puedeEditar={puedeEditar} onCambio={onCambio} />)}
                </ul>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">Sin clips todavía. Cada clip es una pieza de contenido: se asigna a un editor y entra en el pipeline como cualquier otra.</p>
              )}
            </section>

            {/* ── datos del video ── */}
            <section className="space-y-3">
              <h4 className="inline-flex items-center gap-2 text-sm font-black"><Film className="h-4 w-4" />Datos del video</h4>
              {!esAdmin ? <p className="text-xs text-muted-foreground">Solo el equipo de marketing edita estos campos. Vos podés crear y trabajar los clips de arriba.</p> : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Título"><Input value={borrador.titulo} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} /></Campo>
                    <Campo label="Estado">
                      <Select value={borrador.estado} onValueChange={(v) => setBorrador({ ...borrador, estado: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{ESTADOS_YT.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                    <Campo label="Responsable" hint="quién lo produce o lo edita">
                      <Select value={borrador.responsable || SIN_ASIGNAR} onValueChange={(v) => setBorrador({ ...borrador, responsable: v === SIN_ASIGNAR ? "" : v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{responsablesCon(editores, video.responsable).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </Campo>
                    <Campo label="Fecha objetivo"><Input type="date" value={borrador.fecha_objetivo?.slice(0, 10) || ""} onChange={(e) => setBorrador({ ...borrador, fecha_objetivo: e.target.value })} /></Campo>
                    <Campo label="Link del guion"><Input value={borrador.guion_url} onChange={(e) => setBorrador({ ...borrador, guion_url: e.target.value })} placeholder="Doc de Google" /></Campo>
                    <Campo label="Miniatura" hint="subila de la compu o pegá el link">
                      <div className="space-y-1.5">
                        <Input value={borrador.miniatura_url} onChange={(e) => setBorrador({ ...borrador, miniatura_url: e.target.value })} placeholder="Imagen .jpg / .png" />
                        <SubirImagen destino="youtube" id={video.id} titulo={video.titulo} onSubido={async (url) => { setBorrador((b) => ({ ...b, miniatura_url: url })); await onCambio() }} />
                      </div>
                    </Campo>
                    <Campo label="Link del video" hint={delCanal ? "Viene del canal" : "Drive o YouTube"}>
                      <Input value={borrador.video_url} onChange={(e) => setBorrador({ ...borrador, video_url: e.target.value })} disabled={delCanal} />
                    </Campo>
                  </div>
                  <Campo label="Notas de producción"><Textarea rows={3} value={borrador.notas} onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })} placeholder="Qué falta, qué se decidió, referencias" /></Campo>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={guardar} disabled={ocupado === "guardar"}>{ocupado === "guardar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Guardar</Button>
                    {!delCanal ? <Button variant="ghost" onClick={borrar} disabled={ocupado === "borrar"} className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"><Trash2 className="mr-2 h-4 w-4" />Borrar</Button> : null}
                    {video.stats_at ? <span className="ml-auto text-[11px] text-muted-foreground">Métricas al {fecha(video.stats_at)}</span> : null}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// La ayuda va en su propio renglón: pegada a la etiqueta hacía que el título se partiera en dos
// líneas y descuadraba la grilla de campos.
function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div className="space-y-1">
    <div>
      <Label className="text-xs">{label}</Label>
      {hint ? <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
    {children}
  </div>
}

// Una fila de clip: se asigna el editor, se cambia el estado y se pega el link del video final,
// todo sin salir del video. "Abrir" lleva a la pieza completa en Contenido.
function ClipFila({ clip, editores, puedeEditar, onCambio }: { clip: ClipYoutube; editores: string[]; puedeEditar: boolean; onCambio: () => void }) {
  const [titulo, setTitulo] = useState(clip.title)
  const [linkFinal, setLinkFinal] = useState(clip.source_url || "")
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState("")
  const numeroClip = Number((clip.metadata as Record<string, unknown>)?.clip_numero || 0)
  const meta = clipMeta(clip.status)
  const responsables = responsablesCon(editores, clip.assigned_to)
  const sucio = titulo !== clip.title || linkFinal !== (clip.source_url || "")

  async function patch(cambios: Record<string, unknown>) {
    setOcupado(true); setError("")
    try {
      const r = await fetch("/api/content-workspace", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: clip.id, ...cambios }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo guardar el clip")
      await onCambio()
    } catch (e) { setError((e as Error).message) } finally { setOcupado(false) }
  }

  return (
    <li className="space-y-2 rounded-lg border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-red-500 to-orange-400 text-xs font-black text-white">{numeroClip || "·"}</span>
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!puedeEditar} className="h-8 min-w-[10rem] flex-1 text-sm" />
        <Chip className={meta.tono}>{meta.label}</Chip>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={clip.assigned_to || "SIN ASIGNAR"} onValueChange={(v) => patch({ assigned_to: v })} disabled={!puedeEditar || ocupado}>
          <SelectTrigger className="h-8 w-[10.5rem] text-xs"><SelectValue placeholder="Editor" /></SelectTrigger>
          <SelectContent>{responsables.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={clip.status} onValueChange={(v) => patch({ status: v })} disabled={!puedeEditar || ocupado}>
          <SelectTrigger className="h-8 w-[9.5rem] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{ESTADOS_CLIP_OPCIONES.map((s) => <SelectItem key={s} value={s}>{clipMeta(s).label}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={linkFinal} onChange={(e) => setLinkFinal(e.target.value)} disabled={!puedeEditar} placeholder="Link del video final" className="h-8 min-w-[12rem] flex-1 text-xs" />
        {sucio && puedeEditar ? <Button size="sm" className="h-8" onClick={() => patch({ title: titulo, source_url: linkFinal || null })} disabled={ocupado}>
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button> : null}
        <Button asChild size="sm" variant="outline" className="h-8">
          <a href={`/contenido-angulos?source=youtube&content_asset_id=${encodeURIComponent(clip.id)}`}>Abrir<ExternalLink className="ml-1.5 h-3 w-3" /></a>
        </Button>
      </div>
      {error ? <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
    </li>
  )
}
