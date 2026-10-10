"use client"

/* ── El equipo (Panel del negocio): las tareas de cada uno ──────────────────
   Misma interfaz que «Tareas» del Sistema IA (Hoy · En progreso ·
   Completadas, reparto del trabajo y prioridad del día), pero con las tareas
   reales del equipo. Cada miembro ve solo las suyas; un CEO ve las de todos y
   asigna, edita, mueve y borra. Lo que ve cada uno lo decide /api/tareas en el
   servidor: esta pantalla solo dibuja lo que le llega.
   Tocar el círculo de una tarea la pasa a «En progreso»; tocarlo otra vez, a
   «Completada». Las diarias y semanales vuelven solas a «Hoy» al día o a la
   semana siguiente (hora argentina). */

import { useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Check, Circle, CircleDot, ExternalLink, Loader2, Pencil, Plus, RotateCw, Trash2, X } from "lucide-react"
import { Bar, Card, CardHead, PageHead, SectionTitle, Stat } from "@/components/os/ui"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ETIQUETA_FRECUENCIA, FRECUENCIAS, hoyArgentina, sumarDias, type Estado, type Frecuencia, type MiembroTareas, type RespuestaTareas, type Tarea } from "@/lib/tareas"

// ── datos ──
const mensajeDe = (e: unknown, porDefecto: string) =>
  e instanceof TypeError ? "No hay conexión. Probá de nuevo en un rato." : (e as Error)?.message || porDefecto

const fetcher = async (url: string) => {
  try {
    const r = await fetch(url)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || "No se pudieron leer las tareas")
    return j as RespuestaTareas
  } catch (e) {
    throw new Error(mensajeDe(e, "No se pudieron leer las tareas"))
  }
}

// ── aspecto ──
// Mismos íconos y colores de estado que «Tareas».
const COLUMNAS: { estado: Estado; titulo: string; icono: typeof Circle; color: string }[] = [
  { estado: "pendiente", titulo: "Hoy", icono: Circle, color: "var(--color-faint)" },
  { estado: "en_progreso", titulo: "En progreso", icono: CircleDot, color: "var(--color-gold-dk)" },
  { estado: "hecha", titulo: "Completadas", icono: Check, color: "var(--color-faint2)" },
]
const SIGUIENTE: Record<Estado, Estado> = { pendiente: "en_progreso", en_progreso: "hecha", hecha: "pendiente" }
const ACCION: Record<Estado, string> = { pendiente: "Pasar a en progreso", en_progreso: "Marcar como completada", hecha: "Volver a hoy" }
// Un color por persona, de la misma paleta que los agentes de «Tareas».
const PALETA = ["#7C5CFA", "#3BA8F0", "#F2794C", "#D9A63C", "#2FB79A", "#E2589B", "#8FD96F", "#56C2E6", "#C9A0FF", "#FF9F5A"]
const LINEA = "1px solid var(--color-line)"

const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?"
const fechaCorta = (f: string) => { const [, m, d] = f.split("-"); return `${Number(d)}/${Number(m)}` }
const horaDe = (iso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month} a las ${p.hour}:${p.minute}`
}

type Llamar = (metodo: "POST" | "PATCH" | "DELETE", cuerpo: Record<string, unknown>) => Promise<boolean>
type Borrador = { titulo: string; detalle: string; frecuencia: Frecuencia; vence: string; miembro_id: number }

export function TareasEquipo() {
  const { data, error, isLoading, mutate } = useSWR<RespuestaTareas>("/api/tareas", fetcher, { revalidateOnFocus: true })
  const [persona, setPersona] = useState<number | null>(null)   // filtro del CEO
  const [creando, setCreando] = useState(false)
  const [verAnteriores, setVerAnteriores] = useState(false)
  const enVuelo = useRef(0)
  const ultimo = useRef(0)

  // Cada acción se ve al instante. Con varias en vuelo, solo la última respuesta pisa la pantalla y,
  // si hubo otras mientras tanto, al terminar todas se relee lo que quedó en el servidor.
  async function llamar(metodo: "POST" | "PATCH" | "DELETE", cuerpo: Record<string, unknown>, optimista?: (d: RespuestaTareas) => RespuestaTareas) {
    const n = ++ultimo.current
    enVuelo.current++
    if (optimista && data) mutate(optimista(data), { revalidate: false })
    try {
      const r = await fetch("/api/tareas", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || "No se pudo guardar")
      if (n === ultimo.current && enVuelo.current === 1) await mutate(j as RespuestaTareas, { revalidate: false })
      return true
    } catch (e) {
      toast.error(mensajeDe(e, "No se pudo guardar"))
      mutate()
      return false
    } finally {
      enVuelo.current--
      if (enVuelo.current === 0 && n !== ultimo.current) mutate()
    }
  }

  const cambiarEstado = (t: Tarea, estado: Estado) => llamar("PATCH", { id: t.id, estado }, (d) => ({
    ...d,
    tareas: d.tareas.map((x) => x.id === t.id ? {
      ...x, estado, hecha: estado === "hecha",
      hecha_at: estado === "hecha" ? new Date().toISOString() : x.hecha_at,
      historial: x.historial.map((h, i) => i === x.historial.length - 1 ? { ...h, hecha: estado === "hecha" } : h),
    } : x),
  }))

  const colorDe = useMemo(() => {
    const m = new Map<number, string>()
    ;(data?.miembros || []).forEach((p, i) => m.set(p.id, PALETA[i % PALETA.length]))
    return m
  }, [data])

  if (isLoading && !data) return <div className="os-page flex items-center gap-2 p-10" style={{ color: "var(--color-faint)" }}><Loader2 className="h-4 w-4 animate-spin" /> Cargando las tareas…</div>
  if (!data) {
    return (
      <div className="os-page space-y-3 p-10">
        <p className="text-red-400">{(error as Error)?.message || "No se pudieron leer las tareas."}</p>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => mutate()}><RotateCw className="h-3.5 w-3.5" /> Reintentar</Button>
      </div>
    )
  }

  const { yo } = data
  const admin = yo.admin
  const nombreDe = new Map(data.miembros.map((m) => [m.id, m.nombre]))
  // Para el CEO, las tareas de cada columna quedan agrupadas por persona (en el orden del equipo).
  const posicion = new Map(data.miembros.map((m, i) => [m.id, i]))
  const delFiltro = data.tareas
    .filter((t) => persona === null || t.miembro_id === persona)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (admin ? (posicion.get(a.t.miembro_id) ?? 0) - (posicion.get(b.t.miembro_id) ?? 0) : 0) || a.i - b.i)
    .map((x) => x.t)
  const columna = (e: Estado) => delFiltro.filter((t) => t.estado === e)
  // En «Completadas» van las del período en curso y las de una vez terminadas en los últimos 7 días.
  const haceSiete = sumarDias(data.hoy, -7)
  const completadas = columna("hecha")
  const recientes = completadas.filter((t) => t.frecuencia !== "una_vez" || !t.hecha_at || hoyArgentina(new Date(t.hecha_at)) >= haceSiete)
  const anteriores = completadas.filter((t) => !recientes.includes(t))
  const asignables = data.miembros.filter((m) => !m.rol.startsWith("Sin acceso"))

  // Reparto: tareas abiertas (hoy + en progreso) por persona.
  const reparto = data.miembros
    .map((m) => {
      const suyas = data.tareas.filter((t) => t.miembro_id === m.id)
      return { ...m, abiertas: suyas.filter((t) => t.estado !== "hecha").length, total: suyas.length }
    })
    .filter((m) => m.total > 0)
    .sort((a, b) => b.abiertas - a.abiertas || a.nombre.localeCompare(b.nombre, "es"))
  const maxAbiertas = Math.max(1, ...reparto.map((m) => m.abiertas))

  const item = (t: Tarea) => (
    <FilaTarea key={t.id} tarea={t} admin={admin} hoy={data.hoy} miembros={asignables}
      persona={admin ? { nombre: nombreDe.get(t.miembro_id) || "", color: colorDe.get(t.miembro_id) || PALETA[0] } : null}
      onEstado={cambiarEstado} llamar={llamar} />
  )

  return (
    <div className="os-page mx-auto w-full max-w-[1500px] px-4 py-6 md:px-[38px] md:py-7">
      <PageHead
        title={admin ? "El equipo" : "Tus tareas"}
        sub={admin ? "Lo que tiene que hacer cada uno hoy y quién lo está haciendo." : "Lo que te toca hoy. Tocá el círculo para pasarla a en progreso y otra vez para completarla."}
        right={admin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="gap-1" onClick={() => setCreando((v) => !v)}>{creando ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{creando ? "Cerrar" : "Nueva tarea"}</Button>
          </div>
        ) : undefined}
      />

      {error && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] text-amber-200">
          No se pudo actualizar: {(error as Error).message}.
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => mutate()}><RotateCw className="h-3.5 w-3.5" /> Reintentar</Button>
        </div>
      )}

      {admin && creando && <NuevaTarea miembros={asignables} inicial={persona ?? asignables[0]?.id} llamar={llamar} />}

      {admin && reparto.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Chip activa={persona === null} onClick={() => setPersona(null)}>Todos</Chip>
          {reparto.map((m) => (
            <Chip key={m.id} activa={persona === m.id} onClick={() => setPersona(persona === m.id ? null : m.id)}>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: colorDe.get(m.id) }} />{m.nombre.split(" ")[0]}
            </Chip>
          ))}
        </div>
      )}

      <Card className="mb-6">
        <div className="grid grid-cols-3">
          {[
            { value: String(columna("pendiente").length), label: "Tareas de hoy", gold: true },
            { value: String(columna("en_progreso").length), label: "En progreso" },
            { value: String(completadas.length), label: "Completadas" },
          ].map((s, i) => (
            <div key={s.label} className="px-4 py-5 md:px-7 md:py-6" style={{ borderLeft: i ? LINEA : "none" }}>
              <Stat value={s.value} label={s.label} size={30} gold={s.gold} />
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {COLUMNAS.map((c) => {
          const lista = c.estado === "hecha" ? (verAnteriores ? completadas : recientes) : columna(c.estado)
          return (
            <div key={c.estado}>
              <SectionTitle className="mb-3.5" right={<span className="text-[12px]" style={{ color: "var(--color-faint)" }}>{c.estado === "hecha" ? completadas.length : lista.length}</span>}>
                {c.titulo}
              </SectionTitle>
              <Card className="overflow-hidden">
                {lista.length === 0 && (
                  <div className="px-5 py-6 text-[13px]" style={{ color: "var(--color-faint)" }}>
                    {c.estado === "pendiente" ? (admin ? "No queda nada pendiente." : "No te queda nada pendiente para hoy.") : c.estado === "en_progreso" ? "Nada en progreso." : "Todavía nada completado."}
                  </div>
                )}
                {lista.map((t, i) => <div key={t.id} style={{ borderTop: i ? LINEA : "none" }}>{item(t)}</div>)}
                {c.estado === "hecha" && anteriores.length > 0 && (
                  <button type="button" onClick={() => setVerAnteriores((v) => !v)} className="w-full px-5 py-3 text-left text-[12px] hover:underline" style={{ borderTop: LINEA, color: "var(--color-faint)" }}>
                    {verAnteriores ? "Ocultar las anteriores" : `Ver ${anteriores.length} completadas antes de esta semana`}
                  </button>
                )}
              </Card>
            </div>
          )
        })}
      </div>

      <div className={admin ? "grid gap-4 xl:grid-cols-[1fr_460px]" : "grid gap-4"}>
        {admin && (
          <Card className="px-5 py-6 md:px-7 md:py-7">
            <CardHead title="Reparto del trabajo" sub="Tareas abiertas por persona (hoy y en progreso)" />
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {reparto.map((m) => (
                <button key={m.id} type="button" onClick={() => setPersona(persona === m.id ? null : m.id)}
                  className="pop -mx-1 rounded-[10px] px-3 py-3 text-left"
                  style={{ ["--pop" as string]: `${colorDe.get(m.id)}26`, outline: persona === m.id ? `1px solid ${colorDe.get(m.id)}88` : "none" }}>
                  <div className="flex items-center gap-2.5">
                    <Insignia nombre={m.nombre} color={colorDe.get(m.id) || PALETA[0]} />
                    <span className="truncate text-[12.5px]" style={{ color: "var(--color-ink2)" }}>{m.nombre}</span>
                  </div>
                  <div className="val mt-3.5 text-[22px]" style={{ color: colorDe.get(m.id) }}>{m.abiertas}</div>
                  <div className="mt-3"><Bar pct={(m.abiertas / maxAbiertas) * 100} color={colorDe.get(m.id)} h={4} /></div>
                </button>
              ))}
            </div>
          </Card>
        )}
        <PrioridadDelDia prioridad={data.prioridad} admin={admin} llamar={llamar} />
      </div>
    </div>
  )
}

function Chip({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors"
      style={{ border: LINEA, background: activa ? "var(--color-line)" : "transparent", color: activa ? "var(--color-ink)" : "var(--color-faint)" }}>
      {children}
    </button>
  )
}

function Insignia({ nombre, color, size = 24 }: { nombre: string; color: string; size?: number }) {
  return (
    <span aria-hidden className="relative inline-flex flex-none items-center justify-center text-[10px] font-semibold"
      style={{ width: size, height: size, borderRadius: size * 0.3, background: "linear-gradient(160deg,#232323,#141414)", boxShadow: `0 0 0 1px rgba(0,0,0,0.10), 0 4px 12px ${color}22`, color }}>
      <span className="absolute inset-0" style={{ borderRadius: "inherit", background: `radial-gradient(120% 100% at 50% 8%, ${color}3d, transparent 62%)` }} />
      <span className="relative">{iniciales(nombre)}</span>
    </span>
  )
}

function FilaTarea({ tarea, admin, hoy, miembros, persona, onEstado, llamar }: {
  tarea: Tarea; admin: boolean; hoy: string; miembros: MiembroTareas[]
  persona: { nombre: string; color: string } | null
  onEstado: (t: Tarea, e: Estado) => void; llamar: Llamar
}) {
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const c = COLUMNAS.find((x) => x.estado === tarea.estado) || COLUMNAS[0]
  const Icono = c.icono

  if (editando) return <EditarTarea tarea={tarea} miembros={miembros} llamar={llamar} cerrar={() => setEditando(false)} />

  async function borrar() {
    setBorrando(true)
    const ok = await llamar("DELETE", { id: tarea.id })
    setBorrando(false)
    if (!ok) setConfirmando(false)
  }

  return (
    <div className="row-hover group/fila flex items-start gap-3.5 px-5" style={{ minHeight: 78, paddingTop: 18, paddingBottom: 18 }}>
      <button type="button" onClick={() => onEstado(tarea, SIGUIENTE[tarea.estado])} aria-label={`${ACCION[tarea.estado]}: ${tarea.titulo}`} title={ACCION[tarea.estado]}
        className="-m-1.5 flex-none rounded-full p-1.5 hover:bg-white/5 focus-visible:outline focus-visible:outline-1" style={{ marginTop: -5 }}>
        <Icono size={14} strokeWidth={2} style={{ color: c.color }} className={tarea.estado === "en_progreso" ? "pulse" : ""} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] leading-[1.4]" style={{ color: tarea.estado === "hecha" ? "var(--color-mute)" : "var(--color-ink)" }}>{tarea.titulo}</div>
        {tarea.detalle && <div className="mt-1.5 line-clamp-3 text-[12px] leading-[1.45]" style={{ color: "var(--color-faint)" }} title={tarea.detalle}>{tarea.detalle}</div>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] leading-none" style={{ color: "var(--color-faint)" }}>
          {persona && (
            <span className="inline-flex items-center gap-2">
              <span style={{ width: 5, height: 5, borderRadius: 99, background: persona.color, flex: "none" }} />
              {persona.nombre}
            </span>
          )}
          {tarea.frecuencia !== "una_vez" && <Racha tarea={tarea} />}
          {tarea.vence && (
            <span style={{ color: tarea.vencida ? "#F2794C" : undefined }}>{tarea.vencida ? "venció" : tarea.vence === hoy ? "vence hoy" : "vence"} {fechaCorta(tarea.vence)}</span>
          )}
          {tarea.origen && (tarea.origen_url
            ? <a href={tarea.origen_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{tarea.origen}<ExternalLink className="h-3 w-3" /><span className="sr-only">(abre la grabación)</span></a>
            : <span>{tarea.origen}</span>)}
        </div>
        {confirmando && (
          <div className="mt-3 flex items-center gap-2 text-[12px]">
            <span>¿Borrar esta tarea?</span>
            <Button size="sm" variant="destructive" className="h-7" disabled={borrando} onClick={borrar}>{borrando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Borrar"}</Button>
            <Button size="sm" variant="ghost" className="h-7" autoFocus disabled={borrando} onClick={() => setConfirmando(false)}>Cancelar</Button>
          </div>
        )}
      </div>
      {admin && !confirmando && (
        <div className="flex flex-none gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/fila:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditando(true)} aria-label={`Editar «${tarea.titulo}»`}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmando(true)} aria-label={`Borrar «${tarea.titulo}»`}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  )
}

// Los últimos 7 días (diaria) o 4 semanas (semanal): lleno si se hizo, vacío si no, punteado si la tarea no existía.
function Racha({ tarea }: { tarea: Tarea }) {
  const cuentan = tarea.historial.filter((h) => h.hecha !== null)
  const hechas = cuentan.filter((h) => h.hecha).length
  const unidad = tarea.frecuencia === "diaria" ? (cuentan.length === 1 ? "día" : "días") : (cuentan.length === 1 ? "semana" : "semanas")
  const texto = `${hechas} de ${cuentan.length} ${unidad}`
  return (
    <span className="inline-flex items-center gap-1.5" title={texto}>
      <span className="inline-flex gap-0.5" aria-hidden>
        {tarea.historial.map((h) => (
          <span key={h.clave} title={`${h.etiqueta}: ${h.hecha === null ? "todavía no existía" : h.hecha ? "hecha" : "sin hacer"}`}
            style={{ width: 6, height: 6, borderRadius: 99, background: h.hecha ? "var(--color-gold-dk)" : h.hecha === null ? "transparent" : "var(--color-line)", border: h.hecha === null ? "1px dashed var(--color-line)" : "none" }} />
        ))}
      </span>
      <span className="sr-only">{texto}.</span>
      {ETIQUETA_FRECUENCIA[tarea.frecuencia].toLowerCase()}
    </span>
  )
}

function PrioridadDelDia({ prioridad, admin, llamar }: { prioridad: RespuestaTareas["prioridad"]; admin: boolean; llamar: Llamar }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(prioridad?.texto || "")
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    if (!texto.trim()) return
    setGuardando(true)
    const ok = await llamar("POST", { prioridad: texto })
    setGuardando(false)
    if (ok) setEditando(false)
  }
  return (
    <Card gold lit className="px-5 py-6 md:px-7 md:py-7">
      <CardHead title="Prioridad del día"
        sub={prioridad ? `Definida por ${prioridad.por || "el CEO"} el ${horaDe(prioridad.at)}` : "Todavía no hay una prioridad cargada"}
        right={admin && !editando ? <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => { setTexto(prioridad?.texto || ""); setEditando(true) }}><Pencil className="h-3.5 w-3.5" />{prioridad ? "Cambiar" : "Escribirla"}</Button> : undefined} />
      {!editando && (
        <p className="mt-5 text-[15px] leading-[1.5]" style={{ color: prioridad ? "var(--color-ink)" : "var(--color-faint)" }}>
          {prioridad?.texto || (admin ? "Escribí qué es lo más importante hoy para todo el equipo." : "Cuando haya una prioridad del día, va a aparecer acá.")}
        </p>
      )}
      {editando && (
        <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); guardar() }}>
          <Textarea autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={500} className="min-h-[80px] text-sm" aria-label="Prioridad del día" />
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-8" disabled={guardando || !texto.trim()}>{guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}</Button>
            <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </form>
      )}
    </Card>
  )
}

function CamposTarea({ b, set, miembros }: { b: Borrador; set: (c: Partial<Borrador>) => void; miembros: MiembroTareas[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={String(b.miembro_id)} onValueChange={(v) => set({ miembro_id: Number(v) })}>
        <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Para quién"><SelectValue placeholder="Para quién" /></SelectTrigger>
        <SelectContent>{miembros.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.nombre}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={b.frecuencia} onValueChange={(v) => set({ frecuencia: v as Frecuencia })}>
        <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Cada cuánto"><SelectValue /></SelectTrigger>
        <SelectContent>{FRECUENCIAS.map((f) => <SelectItem key={f} value={f}>{ETIQUETA_FRECUENCIA[f]}</SelectItem>)}</SelectContent>
      </Select>
      {b.frecuencia === "una_vez" && (
        <Input type="date" value={b.vence} onChange={(e) => set({ vence: e.target.value })} className="h-8 w-[150px] text-xs" aria-label="Vence" />
      )}
    </div>
  )
}

function NuevaTarea({ miembros, inicial, llamar }: { miembros: MiembroTareas[]; inicial?: number; llamar: Llamar }) {
  const vacio: Borrador = { titulo: "", detalle: "", frecuencia: "una_vez", vence: "", miembro_id: inicial ?? 0 }
  const [b, setB] = useState<Borrador>(vacio)
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    if (!b.titulo.trim() || !b.miembro_id) return
    setGuardando(true)
    const ok = await llamar("POST", { ...b, vence: b.vence || null })
    setGuardando(false)
    if (ok) { setB({ ...vacio, miembro_id: b.miembro_id }); toast.success("Tarea asignada") }
  }
  return (
    <Card className="mb-6 px-5 py-5 md:px-7">
      <CardHead title="Nueva tarea" sub="Le aparece solo a la persona que elijas" />
      <form className="mt-4 space-y-2" onSubmit={(e) => { e.preventDefault(); guardar() }}>
        <Input autoFocus value={b.titulo} onChange={(e) => setB({ ...b, titulo: e.target.value })} placeholder="Qué tiene que hacer" className="h-9 text-sm" aria-label="Tarea nueva" maxLength={300} />
        <Textarea value={b.detalle} onChange={(e) => setB({ ...b, detalle: e.target.value })} placeholder="Detalle (opcional)" className="min-h-[56px] text-xs" aria-label="Detalle" maxLength={2000} />
        <div className="flex flex-wrap items-center gap-2">
          <CamposTarea b={b} set={(c) => setB({ ...b, ...c })} miembros={miembros} />
          <Button type="submit" size="sm" className="h-8" disabled={guardando || !b.titulo.trim() || !b.miembro_id}>{guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Asignar"}</Button>
        </div>
      </form>
    </Card>
  )
}

function EditarTarea({ tarea, miembros, llamar, cerrar }: { tarea: Tarea; miembros: MiembroTareas[]; llamar: Llamar; cerrar: () => void }) {
  const [b, setB] = useState<Borrador>({ titulo: tarea.titulo, detalle: tarea.detalle || "", frecuencia: tarea.frecuencia, vence: tarea.vence || "", miembro_id: tarea.miembro_id })
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    if (!b.titulo.trim()) return
    setGuardando(true)
    const ok = await llamar("PATCH", { id: tarea.id, titulo: b.titulo, detalle: b.detalle, frecuencia: b.frecuencia, vence: b.vence || null, miembro_id: b.miembro_id })
    setGuardando(false)
    if (ok) cerrar()
  }
  return (
    <form className="space-y-2 px-5 py-4" onSubmit={(e) => { e.preventDefault(); guardar() }}>
      <Input autoFocus value={b.titulo} onChange={(e) => setB({ ...b, titulo: e.target.value })} className="h-8 text-sm" aria-label="Tarea" maxLength={300} />
      <Textarea value={b.detalle} onChange={(e) => setB({ ...b, detalle: e.target.value })} placeholder="Detalle (opcional)" className="min-h-[52px] text-xs" aria-label="Detalle" maxLength={2000} />
      {b.frecuencia !== tarea.frecuencia && <p className="text-[12px] text-amber-300">Al cambiar cada cuánto se hace, la tarea arranca de cero.</p>}
      <CamposTarea b={b} set={(c) => setB({ ...b, ...c })} miembros={miembros} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={guardando || !b.titulo.trim()}>{guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}</Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={cerrar}><X className="h-3.5 w-3.5" /> Cancelar</Button>
      </div>
    </form>
  )
}
