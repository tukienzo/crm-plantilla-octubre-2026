"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { ChevronLeft, ChevronRight, ExternalLink, GripVertical, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAngulos } from "@/lib/use-angulos"
import { colorAngulo } from "@/lib/colores-angulo"
import { BRAND } from "@/lib/brand"

type StoryRow = {
  id: string; title: string; format: string | null; angle: string | null; planned_at: string | null
  day_of_week: string | null; status: string; source_url: string | null; metadata: Record<string, unknown> | null
}
type Response = { rows: StoryRow[] }

const fetcher = (url: string) => fetch(url).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b })
const FORMATS = ["Hand Raiser", "Caso de éxito", "¿Qué hago?", "CTA", "WHY NOW", "AUDITORÍA"]
const STORY_STATUSES = [
  { value: "idea", label: "Idea" },
  { value: "grabado", label: "Grabado" },
  { value: "edicion", label: "Edición" },
  { value: "completo", label: "Completo" },
]
const statusLabel = (value: string) => STORY_STATUSES.find(option => option.value === value)?.label || "Idea"
// Sub-perfiles del cliente ideal para las secuencias de Hand Raiser y Caso de éxito (el texto
// se guarda en metadata.avatar). Lista de ejemplo: ajustala a los perfiles de tu negocio.
const AVATARS = [
  "1 · Perfil principal",
  "2 · Perfil secundario",
  "3 · Perfil ocasional",
]
// Ángulos sugeridos por sub-perfil: números del banco, primero los que más le pegan
// (ej. { [AVATARS[0]]: [1, 3, 5] }). Después va el resto del banco, así ningún ángulo queda
// fuera del selector. Vacío = el banco en su orden.
const PRIORITY_ANGLES: Record<string, number[]> = {}
// Ángulos ofrecidos para un avatar: primero los prioritarios de PRIORITY_ANGLES (por número),
// después el resto del banco. El banco es editable (Contenido → Banco de ángulos), así que se
// resuelve en cada render y no como constante de módulo.
function anglesFor(avatar: string, etiquetas: string[]) {
  const priority = (PRIORITY_ANGLES[avatar] || [])
    .map((id) => etiquetas.find((etiqueta) => etiqueta.startsWith(`${id} ·`)))
    .filter((etiqueta): etiqueta is string => Boolean(etiqueta))
  return [...priority, ...etiquetas.filter((etiqueta) => !priority.includes(etiqueta))]
}

function week(base: Date) {
  const d = new Date(base); const offset = (d.getDay() + 6) % 7
  const monday = new Date(d); monday.setDate(d.getDate() - offset)
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
  return { start: iso(monday), end: iso(sunday) }
}

function shortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" })
}

export function StoriesCalendar({ canEdit }: { canEdit: boolean }) {
  const [offset, setOffset] = useState(0)
  const [editing, setEditing] = useState<StoryRow | null>(null)
  const [creating, setCreating] = useState(false)
  const range = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + offset * 7); return week(d) }, [offset])
  const key = `/api/content-workspace?managed_only=1&content_kind=stories&start=${range.start}&end=${range.end}&limit=50`
  const { data, mutate, isLoading } = useSWR<Response>(key, fetcher)

  async function save(row: StoryRow | null, payload: Record<string, unknown>) {
    const response = await fetch("/api/content-workspace", {
      method: row ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row ? { id: row.id, ...payload } : { ...payload, content_type: "stories" }),
    })
    const body = await response.json()
    if (!response.ok) return toast.error(body.error || "No se pudo guardar")
    toast.success("Secuencia guardada")
    setEditing(null); setCreating(false); mutate()
  }

  return <div className="space-y-4">
    <div className="flex items-center justify-between rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[.05] px-4 py-3">
      <div><p className="text-xs font-black uppercase tracking-[.16em] text-fuchsia-300">CALENDARIO STORIES</p><p className="text-xs text-muted-foreground">Una fila = una secuencia completa. Separado del feed.</p></div>
      {canEdit && <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" />Nueva secuencia</Button>}
    </div>
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/40 px-4 py-2.5">
      <Button size="icon" variant="ghost" onClick={() => setOffset(v => v - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="text-sm font-bold">{shortDate(range.start)} → {shortDate(range.end)}</span>
      <Button size="icon" variant="ghost" onClick={() => setOffset(v => v + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
    {isLoading ? <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p> : (data?.rows || []).length === 0 ? <p className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">No hay secuencias esta semana.</p> :
      <div className="grid gap-2 lg:grid-cols-2">{(data?.rows || []).map(row => <button key={row.id} onClick={() => setEditing(row)} className="rounded-2xl border border-border bg-muted/50 p-4 text-left hover:border-fuchsia-400/30">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{row.day_of_week || shortDate(String(row.planned_at))}</Badge><Badge className="bg-fuchsia-500/15 text-fuchsia-200">{row.format}</Badge><Badge variant="outline" className="ml-auto">{statusLabel(row.status)}</Badge></div>
        <p className="mt-3 whitespace-pre-wrap text-sm font-bold">{String((Array.isArray(row.metadata?.script_blocks) ? row.metadata.script_blocks[0] : null) || row.metadata?.idea || row.title)}</p>
        {row.metadata?.avatar ? <p className="mt-2 text-xs text-muted-foreground">{String(row.metadata.avatar)}</p> : null}
        {row.angle ? <p className="mt-1 text-xs text-fuchsia-300">{row.angle}</p> : null}
      </button>)}</div>}
    {(editing || creating) && <StoryDialog row={editing} onClose={() => { setEditing(null); setCreating(false) }} onSave={(payload) => save(editing, payload)} />}
  </div>
}

function StoryDialog({ row, onClose, onSave }: { row: StoryRow | null; onClose: () => void; onSave: (p: Record<string, unknown>) => void }) {
  const [format, setFormat] = useState(row?.format || "Hand Raiser")
  const [avatar, setAvatar] = useState(String(row?.metadata?.avatar || ""))
  const [angle, setAngle] = useState(row?.angle || "")
  const initialBlocks = Array.isArray(row?.metadata?.script_blocks)
    ? row.metadata.script_blocks.map(String)
    : [String(row?.metadata?.idea || row?.title || "")]
  const [blocks, setBlocks] = useState(initialBlocks.length ? initialBlocks : [""])
  const [status, setStatus] = useState(STORY_STATUSES.some(option => option.value === row?.status) ? String(row?.status) : "idea")
  const [driveUrl, setDriveUrl] = useState(row?.source_url || "")
  const [dragging, setDragging] = useState<number | null>(null)
  const [date, setDate] = useState(String(row?.planned_at || "").slice(0, 10))
  const needsAvatar = ["Hand Raiser", "Caso de éxito"].includes(format)
  const { etiquetas, categoriaDe } = useAngulos()
  const angleOptions = anglesFor(avatar, etiquetas)
  const changeAvatar = (value: string) => { setAvatar(value); setAngle(anglesFor(value, etiquetas)[0] || "") }
  const day = date ? new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long" }) : ""
  const dayLabel = day ? day[0].toUpperCase() + day.slice(1) : ""
  const updateBlock = (index: number, value: string) => setBlocks(current => current.map((block, i) => i === index ? value : block))
  const addBlock = () => setBlocks(current => [...current, ""])
  const removeBlock = (index: number) => setBlocks(current => current.length === 1 ? [""] : current.filter((_, i) => i !== index))
  const moveBlock = (from: number, to: number) => setBlocks(current => {
    if (from === to) return current
    const next = [...current]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    return next
  })
  const hook = blocks[0]?.trim() || ""
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-xl">
    <DialogHeader><DialogTitle><Pencil className="mr-2 inline h-4 w-4" />{row ? "Editar secuencia" : `Nueva secuencia · ${BRAND.name}`}</DialogTitle></DialogHeader>
    <div className="grid gap-4">
      <div><Label>Formato</Label><Select value={format} onValueChange={(v) => { setFormat(v); if (!["Hand Raiser", "Caso de éxito"].includes(v)) { setAvatar(""); setAngle("") } }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FORMATS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
      {needsAvatar && <><div><Label>Avatar *</Label><Select value={avatar} onValueChange={changeAvatar}><SelectTrigger><SelectValue placeholder="Elegí avatar" /></SelectTrigger><SelectContent>{AVATARS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
      <div><Label>Ángulo *</Label><Select value={angle} onValueChange={setAngle} disabled={!avatar}><SelectTrigger><SelectValue placeholder="Elegí ángulo" /></SelectTrigger><SelectContent>{angleOptions.map(v => <SelectItem key={v} value={v}><span className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorAngulo(categoriaDe(v)).punto}`} /><span className="truncate">{v}</span></span></SelectItem>)}</SelectContent></Select></div></>}
      <div className="space-y-2">
        <Label>Idea de guion</Label>
        {blocks.map((block, index) => <div
          key={index}
          draggable
          onDragStart={() => setDragging(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => { if (dragging !== null) moveBlock(dragging, index); setDragging(null) }}
          onDragEnd={() => setDragging(null)}
          className="flex items-start gap-2 rounded-xl border bg-muted/20 p-2"
        >
          <div className="flex h-9 shrink-0 items-center gap-1 text-xs font-black text-muted-foreground"><GripVertical className="h-4 w-4 cursor-grab" />{index + 1}</div>
          <Textarea
            value={block}
            rows={2}
            onChange={event => updateBlock(index, event.target.value)}
            onInput={event => { const target = event.currentTarget; target.style.height = "auto"; target.style.height = `${target.scrollHeight}px` }}
            placeholder={index === 0 ? "Hook · placa 1" : `Placa ${index + 1}`}
            className="min-h-20 resize-none overflow-hidden whitespace-pre-wrap"
          />
          <Button type="button" size="icon" variant="ghost" onClick={() => removeBlock(index)} aria-label={`Eliminar bloque ${index + 1}`}><Trash2 className="h-4 w-4" /></Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" onClick={addBlock}><Plus className="mr-1 h-4 w-4" />Agregar bloque</Button>
      </div>
      <div><Label>Fecha</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3"><div><Label>Día</Label><Input disabled value={dayLabel} /></div><div><Label>Estado</Label><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STORY_STATUSES.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div></div>
      <div><Label>Link de Drive</Label><Input type="url" value={driveUrl} onChange={event => setDriveUrl(event.target.value)} placeholder="https://drive.google.com/…" />{driveUrl && <a href={driveUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-start gap-1.5 break-all text-xs text-fuchsia-300 hover:underline"><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />{driveUrl}</a>}</div>
      <p className="text-xs text-muted-foreground">Cada bloque es una placa. Podés agregar, borrar y arrastrar bloques sin límite.</p>
    </div>
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={!hook || !date || (needsAvatar && (!avatar || !angle))} onClick={() => {
      const scriptChanged = !row || JSON.stringify(blocks) !== JSON.stringify(initialBlocks)
      onSave({
        ...(!row || scriptChanged ? { title: hook, idea: hook, script_blocks: blocks, script_text: blocks.join("\n\n") } : {}),
        format, avatar: needsAvatar ? avatar : "", angle: needsAvatar ? angle : "", planned_at: date,
        day_of_week: dayLabel, status, source_url: driveUrl,
      })
    }}>Guardar</Button></div>
  </DialogContent></Dialog>
}
