"use client"

import { useEffect, useState, useMemo } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Loader2,
  User,
  CalendarDays,
  Phone,
  Mail,
  Instagram,
  Link2,
  Star,
  BriefcaseBusiness,
  Clock3,
  Sparkles,
  Target,
  WalletCards,
  MessageSquareText,
  UserRoundCheck,
  Radio,
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Pencil,
  Save,
} from "lucide-react"
import type { Agenda } from "@/lib/supabase"
import { CLOSERS_ACTIVOS, SETTERS_TODOS } from "@/lib/equipo"

export type Stage =
  | "confirmado"
  | "grupo_precall"
  | "no_show"
  | "reprogramado"
  | "presentado"
  | "no_cerrado"
  | "fee"
  | "cerrado"
  | "archivado"

export type Pays = Map<
  string,
  {
    hasFee: boolean
    hasNonFee: boolean
    hasPIF: boolean
    hasPP: boolean
    contenidoContestado: string | null
  }
>

function norm(s: string) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

const CANCELADO_VALUES = new Set([
  "cancelada por triage",
  "cancelada en triage",
  "cancelado por triage",
  "cancelado en triage",
  "cancelada triage",
  "cancelado triage",
])

export const COLUMNS: { id: Stage; label: string }[] = [
  { id: "confirmado",    label: "Agenda Confirmada" },
  { id: "grupo_precall", label: "Grupo Precall Creado" },
  { id: "no_show",       label: "No se Presentó" },
  { id: "reprogramado",  label: "Reprogramó" },
  { id: "presentado",    label: "Falta Resultado" },
  { id: "no_cerrado",    label: "No Cerrados" },
  { id: "fee",           label: "Fees" },
  { id: "cerrado",       label: "Cerrados" },
  { id: "archivado",     label: "Archivados" },
]

export const STAGE_BADGE: Record<Stage, string> = {
  confirmado:    "bg-blue-500/10 text-blue-600 border-blue-500/20",
  grupo_precall: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  no_show:       "bg-slate-500/10 text-slate-600 border-slate-500/20",
  reprogramado:  "bg-purple-500/10 text-purple-600 border-purple-500/20",
  presentado:    "bg-red-500/10 text-red-600 border-red-500/20",
  no_cerrado:    "bg-orange-500/10 text-orange-600 border-orange-500/20",
  fee:           "bg-amber-500/10 text-amber-600 border-amber-500/20",
  cerrado:       "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  archivado:     "bg-slate-200/60 text-slate-500 border-slate-300/40",
}

export function pipelineMissing(a: Agenda, stage: Stage): string[] {
  if (stage === "reprogramado") {
    return [!a.fecha_closer && "nueva fecha de llamada"].filter(Boolean) as string[]
  }
  if (stage === "presentado") {
    return [!a.link_fathom && "Fathom", "resultado de la call"].filter(Boolean) as string[]
  }
  if (stage === "no_cerrado") {
    return [!a.motivo_no_cierre && "motivo", !a.link_fathom && "Fathom"].filter(Boolean) as string[]
  }
  if (stage === "fee" || stage === "cerrado") {
    const missing = [
      !a.estado && "estado",
      !a.link_fathom && "Fathom",
      !a.operacion && "operación",
      !a.plan_de_pago && "plan de pago",
      !a.medio_de_pago && "medio de pago",
      !a.comprobante && "comprobante",
      !a.cc_dia_1 && "CC día 1",
    ].filter(Boolean) as string[]
    if (stage === "cerrado" && !a.fecha_tc) missing.push("fecha TC")
    return missing
  }
  return []
}

export const calColors: Record<string, string> = {
  S: "bg-fuchsia-600 text-white border-fuchsia-700",
  A: "bg-green-600 text-white border-green-700",
  B: "bg-yellow-400 text-black border-yellow-500",
  C: "bg-blue-600 text-white border-blue-700",
  D: "bg-red-600 text-white border-red-700",
}

function parseLocalDate(str: string | null): Date | null {
  if (!str) return null
  const s = str.split("T")[0]
  const parts = s.split("-").map(Number)
  if (parts.length !== 3) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

export function formatDateTime(str: string | null): string {
  if (!str) return "-"
  const [datePart, timePart] = str.split("T")
  const d = parseLocalDate(datePart)
  if (!d) return "-"
  const fecha = d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
  if (!timePart) return fecha
  const hhmm = timePart.slice(0, 5)
  return hhmm === "00:00" ? fecha : `${fecha} · ${hhmm}`
}

export function calKey(cal: string | null): string {
  return (cal || "C").replace(/^lead\s*/i, "").trim() || "C"
}

export function DetailField({
  label,
  value,
  icon: Icon,
  wide = false,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  wide?: boolean
}) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div
      className={cn(
        "group rounded-2xl border border-white/70 bg-white/65 p-3.5 shadow-[0_8px_30px_rgba(15,23,42,.04)] backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_12px_35px_rgba(124,58,237,.09)] dark:border-white/10 dark:bg-white/[.045]",
        wide && "sm:col-span-2"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {Icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-400/10 text-violet-600 dark:text-violet-300">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">{label}</p>
      </div>
      <div className="break-words text-[13px] font-semibold leading-relaxed text-foreground">{value}</div>
    </div>
  )
}

export function EditableDetailField({
  label,
  value,
  editValue,
  onChange,
  icon: Icon,
  wide = false,
  multiline = false,
  placeholder,
  editMode,
}: {
  label: string
  value: React.ReactNode
  editValue: string | null | undefined
  onChange: (val: string | null) => void
  icon?: React.ComponentType<{ className?: string }>
  wide?: boolean
  multiline?: boolean
  placeholder?: string
  editMode: boolean
}) {
  if (!editMode && (value === null || value === undefined || value === "")) return null
  return (
    <div
      className={cn(
        "group rounded-2xl border border-white/70 bg-white/65 p-3.5 shadow-[0_8px_30px_rgba(15,23,42,.04)] backdrop-blur transition duration-300 hover:border-violet-200 dark:border-white/10 dark:bg-white/[.045]",
        wide && "sm:col-span-2",
        editMode && "border-violet-300/80 bg-violet-500/[.03] ring-1 ring-violet-400/20 dark:border-violet-500/30"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {Icon && (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-400/10 text-violet-600 dark:text-violet-300">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">{label}</p>
      </div>
      {editMode ? (
        multiline ? (
          <textarea
            rows={2}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-semibold leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            value={editValue || ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={placeholder}
          />
        ) : (
          <input
            type="text"
            className="h-9 w-full rounded-xl border border-border bg-background px-3 text-[13px] font-semibold text-foreground placeholder:text-muted-foreground/60 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            value={editValue || ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder={placeholder}
          />
        )
      ) : (
        <div className="break-words text-[13px] font-semibold leading-relaxed text-foreground">{value}</div>
      )}
    </div>
  )
}

export function DetailSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-violet-200/70 bg-violet-500/10 text-violet-600 shadow-sm dark:border-violet-400/15 dark:text-violet-300">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-[11px] font-black uppercase tracking-[.18em] text-foreground/75">{title}</h3>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      {children}
    </section>
  )
}

export function LeadDetailDialog({
  agenda,
  stage,
  pays,
  onClose,
  onSaved,
}: {
  agenda: Agenda | null
  stage?: Stage | null
  pays?: Pays
  onClose: () => void
  onSaved: (agenda: Agenda) => void
}) {
  const missing = agenda && stage ? pipelineMissing(agenda, stage) : []
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Agenda>>({})
  const [saving, setSaving] = useState(false)
  const editIsTriageCancelled = CANCELADO_VALUES.has(norm(editForm.call_confirmer || ""))

  useEffect(() => {
    setEditForm(agenda ? { ...agenda } : {})
    setEditMode(false)
  }, [agenda])

  const closerOptions = useMemo(() => {
    const list = [...CLOSERS_ACTIVOS, "Libre / Recontacto"]
    const cur = (agenda?.closer || "").trim()
    if (cur && !list.includes(cur) && cur !== "Sin Closer") {
      return [...list, cur]
    }
    return list
  }, [agenda?.closer])

  const setterOptions = useMemo(() => {
    const list = [...SETTERS_TODOS, "Sin Setter"]
    const cur = (agenda?.setter || "").trim()
    if (cur && !list.includes(cur) && cur !== "Sin Setter") {
      return [...list, cur]
    }
    return list
  }, [agenda?.setter])

  const ef = (key: keyof Agenda, value: unknown) => setEditForm((prev) => ({ ...prev, [key]: value }))

  const saveDirect = async () => {
    if (!agenda?.id) return
    setSaving(true)
    const updates = { ...editForm }
    if (updates.show === false && updates.estado !== "Reprogramó" && updates.estado !== "Grupo Precall Creado") {
      Object.assign(updates, { estado: "No Show", cerro: false, motivo_no_cierre: null })
    }
    if (updates.show === true && updates.estado === "No Show") updates.estado = null
    if (updates.fecha_closer && updates.fecha_closer !== agenda.fecha_closer) {
      updates.fecha_agenda = updates.fecha_closer
    }
    const { id: _id, ...body } = updates
    try {
      const response = await fetch("/api/agendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agenda.id, ...body }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(data?.error || "Error al actualizar la ficha del lead")
        setSaving(false)
        return
      }
      toast.success("Ficha del lead actualizada")
      const updated = { ...agenda, ...body } as Agenda
      onSaved(updated)
      setEditMode(false)
    } catch (err: any) {
      toast.error(err?.message || "Error de conexión al guardar cambios")
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold"

  return (
    <Dialog open={!!agenda} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="grid max-h-[90vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-white/60 bg-gradient-to-br from-white via-white to-violet-50/80 p-0 shadow-[0_30px_100px_rgba(15,23,42,.28)] dark:border-white/10 dark:from-zinc-950 dark:via-zinc-950 dark:to-violet-950/30 [&>button]:right-5 [&>button]:top-5 [&>button]:z-20 [&>button]:grid [&>button]:h-10 [&>button]:w-10 [&>button]:place-items-center [&>button]:rounded-xl [&>button]:border [&>button]:bg-background/80 [&>button]:shadow-lg [&>button]:backdrop-blur">
        {agenda && (
          <>
            <DialogHeader className="relative overflow-hidden border-b border-violet-100/70 px-6 pb-6 pt-7 text-left dark:border-white/10 sm:px-8">
              <div className="absolute -right-12 -top-20 h-52 w-52 rounded-full bg-violet-400/20 blur-3xl" />
              <div className="absolute left-1/3 top-0 h-24 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
              <div className="relative flex items-center gap-4 pr-12">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-cyan-400 text-xl font-black text-white shadow-[0_12px_30px_rgba(124,58,237,.28)] ring-4 ring-white/70 dark:ring-white/10">
                  {(agenda.nombre || "?").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[10px] font-black uppercase tracking-[.2em] text-violet-600/80 dark:text-violet-300">Ficha del lead</p>
                  <DialogTitle className="truncate text-2xl font-black tracking-tight sm:text-3xl">{agenda.nombre}</DialogTitle>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {editMode ? (
                      <select
                        className="h-7 rounded-full border border-violet-400 bg-background px-2.5 text-xs font-black shadow-sm focus:outline-none"
                        value={editForm.calificacion || "LEAD C"}
                        onChange={e => ef("calificacion", e.target.value)}
                      >
                        {["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-xs font-black shadow-sm", calColors[calKey(agenda.calificacion)] || calColors.C)}>
                        {calKey(agenda.calificacion)}
                      </Badge>
                    )}
                    {stage && <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-xs font-bold shadow-sm", STAGE_BADGE[stage])}>{COLUMNS.find(c => c.id === stage)?.label}</Badge>}
                    {agenda.rescatado && (
                      <Badge variant="outline" className="rounded-full border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-xs font-bold text-fuchsia-600 shadow-sm">
                        <Star className="h-3 w-3 mr-1 fill-fuchsia-600" />Rescatado
                      </Badge>
                    )}
                    <button type="button" onClick={() => setEditMode(v => !v)} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-violet-700">
                      <Pencil className="h-3.5 w-3.5" />{editMode ? "Ver ficha" : "Editar ahora"}
                    </button>
                  </div>
                </div>
              </div>
            </DialogHeader>
            <div className="min-h-0 space-y-7 overflow-y-auto overscroll-contain px-6 py-6 [-webkit-overflow-scrolling:touch] sm:px-8">
              {editMode && (
                <div className="rounded-3xl border border-violet-500/20 bg-violet-500/[.055] p-5">
                  <div className="mb-4">
                    <p className="text-sm font-black">Completar ficha del lead</p>
                    <p className="mt-1 text-xs text-muted-foreground">Datos comerciales, resultado de la llamada y asignación de closer.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                      <button type="button" onClick={() => { ef("show", null); ef("call_confirmer", null); if (editForm.estado === "No Show" || editForm.estado === "Reprogramó" || editForm.estado === "Grupo Precall Creado") ef("estado", null) }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.show == null && !editIsTriageCancelled && editForm.estado !== "Reprogramó" && editForm.estado !== "Grupo Precall Creado" ? "border-amber-500 bg-amber-500/10 text-amber-700" : "border-border")}>Pendiente</button>
                      <button type="button" onClick={() => { ef("show", false); ef("cerro", false); ef("call_confirmer", null); ef("estado", "Grupo Precall Creado") }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.estado === "Grupo Precall Creado" ? "border-cyan-500 bg-cyan-500/10 text-cyan-700" : "border-border")}>Grupo Precall</button>
                      <button type="button" onClick={() => { ef("show", true); ef("call_confirmer", null); if (editForm.estado === "No Show" || editForm.estado === "Reprogramó" || editForm.estado === "Grupo Precall Creado") ef("estado", null) }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.show === true && !editIsTriageCancelled ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-border")}>Se presentó</button>
                      <button type="button" onClick={() => { ef("show", false); ef("cerro", false); ef("call_confirmer", null); ef("estado", "No Show") }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.show === false && editForm.estado === "No Show" && !editIsTriageCancelled ? "border-red-500 bg-red-500/10 text-red-600" : "border-border")}>No se presentó</button>
                      <button type="button" onClick={() => { ef("show", false); ef("cerro", false); ef("call_confirmer", null); ef("estado", "Reprogramó") }} className={cn("rounded-xl border py-2 text-xs font-bold", editForm.estado === "Reprogramó" ? "border-purple-500 bg-purple-500/10 text-purple-700" : "border-border")}>Reprogramó</button>
                    </div>
                    <div className="sm:col-span-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
                      <label className="mb-1 block text-xs font-bold text-violet-700 dark:text-violet-300">
                        Closer que tomó la llamada
                      </label>
                      <select
                        className={inputClass}
                        value={editForm.closer || ""}
                        onChange={e => ef("closer", e.target.value || null)}
                      >
                        <option value="">Sin Closer</option>
                        {closerOptions.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    {editForm.estado === "Reprogramó" && (
                      <div className="sm:col-span-2 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-3">
                        <label className="mb-1 block text-xs font-bold text-purple-700 dark:text-purple-300">
                          Nueva fecha y hora de llamada
                        </label>
                        <input
                          type="datetime-local"
                          className={inputClass}
                          value={editForm.fecha_closer ? editForm.fecha_closer.slice(0, 16) : (agenda.fecha_closer ? agenda.fecha_closer.slice(0, 16) : "")}
                          onChange={e => ef("fecha_closer", e.target.value ? `${e.target.value}:00` : null)}
                        />
                      </div>
                    )}
                    {editForm.show === true && <>
                      <select className={inputClass} value={editForm.cerro ? "si" : "no"} onChange={e => ef("cerro", e.target.value === "si")}><option value="no">No cerró</option><option value="si">Cerró</option></select>
                      <input className={inputClass} value={editForm.link_fathom || ""} onChange={e => ef("link_fathom", e.target.value)} placeholder="Link Fathom" />
                      {!editForm.cerro && <input className={inputClass} value={editForm.motivo_no_cierre || ""} onChange={e => ef("motivo_no_cierre", e.target.value)} placeholder="Motivo de no cierre" />}
                      {editForm.cerro && <>
                        <input className={inputClass} value={editForm.estado || ""} onChange={e => ef("estado", e.target.value)} placeholder="Estado (Fee / Adentro)" />
                        <input className={inputClass} value={editForm.operacion || ""} onChange={e => ef("operacion", e.target.value)} placeholder="Operación" />
                        <input className={inputClass} value={editForm.plan_de_pago || ""} onChange={e => ef("plan_de_pago", e.target.value)} placeholder="Plan de pago" />
                        <input className={inputClass} value={editForm.medio_de_pago || ""} onChange={e => ef("medio_de_pago", e.target.value)} placeholder="Medio de pago" />
                        <input className={inputClass} value={editForm.comprobante || ""} onChange={e => ef("comprobante", e.target.value)} placeholder="Link comprobante" />
                        <input type="number" className={inputClass} value={editForm.cc_dia_1 || ""} onChange={e => ef("cc_dia_1", Number(e.target.value) || null)} placeholder="CC día 1" />
                        <input type="date" className={inputClass} value={String(editForm.fecha_tc || "").slice(0, 10)} onChange={e => ef("fecha_tc", e.target.value)} />
                      </>}
                    </>}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setEditMode(false)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold">Cancelar</button>
                    <button type="button" onClick={saveDirect} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar cambios
                    </button>
                  </div>
                </div>
              )}
              {stage && (stage === "presentado" || stage === "no_cerrado" || stage === "fee" || stage === "cerrado") && (
                <div className={cn(
                  "rounded-2xl border p-4",
                  missing.length ? "border-red-500/25 bg-red-500/[.07]" : "border-emerald-500/25 bg-emerald-500/[.07]",
                )}>
                  <div className="flex items-start gap-3">
                    {missing.length ? <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" /> : <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />}
                    <div>
                      <p className="text-sm font-black">{missing.length ? "Qué falta completar" : "Registro completo"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {missing.length ? missing.join(" · ") : "No quedan campos operativos pendientes para el closer."}
                      </p>
                      {missing.length > 0 && (
                        <a
                          href="#"
                          onClick={(event) => { event.preventDefault(); setEditMode(true) }}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-red-600"
                        >
                          Completar acá <Pencil className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <DetailSection icon={User} title="Contacto y responsables">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditableDetailField
                    icon={Phone}
                    label="WhatsApp / Teléfono"
                    value={agenda.telefono}
                    editValue={editForm.telefono}
                    onChange={v => ef("telefono", v)}
                    placeholder="+00 000 000 0000"
                    editMode={editMode}
                  />
                  <EditableDetailField
                    icon={Mail}
                    label="Email"
                    value={agenda.email}
                    editValue={editForm.email}
                    onChange={v => ef("email", v)}
                    placeholder="lead@ejemplo.com"
                    editMode={editMode}
                  />
                  <EditableDetailField
                    icon={Instagram}
                    label="Instagram"
                    value={agenda.instagram}
                    editValue={editForm.instagram}
                    onChange={v => ef("instagram", v)}
                    placeholder="@usuario"
                    editMode={editMode}
                  />
                  {editMode ? (
                    <div className="group rounded-2xl border border-violet-300/80 bg-violet-500/[.03] p-3.5 shadow-[0_8px_30px_rgba(15,23,42,.04)] ring-1 ring-violet-400/20 backdrop-blur dark:border-violet-500/30">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-400/10 text-violet-600 dark:text-violet-300">
                          <UserRoundCheck className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">Closer asignado</p>
                      </div>
                      <select
                        className={inputClass}
                        value={editForm.closer || ""}
                        onChange={e => ef("closer", e.target.value || null)}
                      >
                        <option value="">Sin Closer</option>
                        {closerOptions.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <DetailField icon={UserRoundCheck} label="Closer" value={agenda.closer} />
                  )}
                  {editMode ? (
                    <div className="group rounded-2xl border border-violet-300/80 bg-violet-500/[.03] p-3.5 shadow-[0_8px_30px_rgba(15,23,42,.04)] ring-1 ring-violet-400/20 backdrop-blur dark:border-violet-500/30">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-400/10 text-violet-600 dark:text-violet-300">
                          <Sparkles className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">Setter asignado</p>
                      </div>
                      <select
                        className={inputClass}
                        value={editForm.setter || ""}
                        onChange={e => ef("setter", e.target.value || null)}
                      >
                        <option value="">Sin Setter</option>
                        {setterOptions.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <DetailField icon={Sparkles} label="Setter" value={agenda.setter} />
                  )}
                </div>
              </DetailSection>
              {agenda.calificacion_crm_original && agenda.calificacion_crm_original !== agenda.calificacion && (
                <DetailField label="Calificación Original (CRM)" value={agenda.calificacion_crm_original} />
              )}
              <DetailSection icon={CalendarDays} title="Agenda y llamada">
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField icon={CalendarDays} label="Agendó" value={formatDateTime(agenda.fecha_agenda)} />
                  {editMode ? (
                    <div className="group rounded-2xl border border-violet-300/80 bg-violet-500/[.03] p-3.5 shadow-[0_8px_30px_rgba(15,23,42,.04)] ring-1 ring-violet-400/20 backdrop-blur dark:border-violet-500/30">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-violet-500/15 to-fuchsia-400/10 text-violet-600 dark:text-violet-300">
                          <Clock3 className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-[9px] font-black uppercase tracking-[.16em] text-muted-foreground">Fecha y hora de llamada {stage === "reprogramado" || editForm.estado === "Reprogramó" ? "(Reprogramar)" : ""}</p>
                      </div>
                      <input
                        type="datetime-local"
                        className="h-9 w-full rounded-xl border border-border bg-background px-3 text-[13px] font-semibold text-foreground focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                        value={editForm.fecha_closer ? editForm.fecha_closer.slice(0, 16) : (agenda.fecha_closer ? agenda.fecha_closer.slice(0, 16) : "")}
                        onChange={(e) => ef("fecha_closer", e.target.value ? `${e.target.value}:00` : null)}
                      />
                    </div>
                  ) : (
                    <DetailField icon={Clock3} label="Fecha de llamada" value={formatDateTime(agenda.fecha_closer || agenda.fecha_agenda)} />
                  )}
                  <DetailField icon={Radio} label="Fuente" value={agenda.fuente} />
                  <DetailField
                    icon={Link2}
                    label="Contenido de origen"
                    value={agenda.recurso || (pays && pays.get(norm(agenda.nombre || ""))?.contenidoContestado) || "Contenido no identificado"}
                    wide
                  />
                  <DetailField icon={UserRoundCheck} label="Confirmación" value={agenda.call_confirmer} />
                </div>
                {agenda.link_fathom && (
                  <a href={agenda.link_fathom} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center justify-between rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-bold text-white shadow-[0_10px_25px_rgba(124,58,237,.22)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(124,58,237,.3)]">
                    <span className="inline-flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15"><Link2 className="h-4 w-4" /></span>Ver grabación de la llamada</span><ArrowUpRight className="h-4 w-4" />
                  </a>
                )}
              </DetailSection>
              <DetailSection icon={Target} title="Contexto del lead">
                <div className="grid gap-3 sm:grid-cols-2">
                  <EditableDetailField
                    icon={MessageSquareText}
                    label="Problema actual"
                    value={agenda.problema_actual}
                    editValue={editForm.problema_actual}
                    onChange={v => ef("problema_actual", v)}
                    placeholder="Ej: No consigue clientes nuevos"
                    editMode={editMode}
                    wide
                  />
                  <EditableDetailField
                    icon={Clock3}
                    label="Hace cuánto arrastra el problema"
                    value={agenda.tiempo_problema}
                    editValue={editForm.tiempo_problema}
                    onChange={v => ef("tiempo_problema", v)}
                    placeholder="Ej: Hace meses"
                    editMode={editMode}
                    wide
                  />
                  <EditableDetailField
                    icon={MessageSquareText}
                    label={editMode ? "Intentos previos / ¿Qué probó antes?" : "Intentos previos"}
                    value={agenda.intentos_previos}
                    editValue={editForm.intentos_previos}
                    onChange={v => ef("intentos_previos", v)}
                    multiline
                    placeholder="Ej: Probó por su cuenta pero no le dio resultado"
                    editMode={editMode}
                    wide
                  />
                  <EditableDetailField
                    icon={Target}
                    label={editMode ? "Motivo de urgencia / Urgencia" : "Motivo de urgencia"}
                    value={agenda.motivo_urgencia}
                    editValue={editForm.motivo_urgencia}
                    onChange={v => ef("motivo_urgencia", v)}
                    multiline
                    placeholder="Ej: Quiere resolverlo este mes"
                    editMode={editMode}
                    wide
                  />
                  <EditableDetailField
                    icon={BriefcaseBusiness}
                    label="Ocupación"
                    value={agenda.ocupacion}
                    editValue={editForm.ocupacion}
                    onChange={v => ef("ocupacion", v)}
                    placeholder="Ej: Dueño de negocio / Empleado"
                    editMode={editMode}
                  />
                  <EditableDetailField
                    icon={WalletCards}
                    label="Ingreso mensual"
                    value={agenda.ingresos}
                    editValue={editForm.ingresos}
                    onChange={v => ef("ingresos", v)}
                    placeholder="Ej: Factura aproximadamente USD 4.500/mes"
                    editMode={editMode}
                  />
                  <EditableDetailField
                    icon={WalletCards}
                    label={editMode ? "Capacidad de inversión / Inversión disponible" : "Capacidad de inversión"}
                    value={agenda.inversion}
                    editValue={editForm.inversion}
                    onChange={v => ef("inversion", v)}
                    placeholder="Ej: Puede invertir USD 2.000 ahora"
                    editMode={editMode}
                    wide
                  />
                </div>
                {editMode && (
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setEditMode(false)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold">
                      Cancelar
                    </button>
                    <button type="button" onClick={saveDirect} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar cambios
                    </button>
                  </div>
                )}
              </DetailSection>
              {(agenda.motivo_no_cierre || agenda.motivo_inclusion || agenda.resumen_chat) && (
                <DetailSection icon={MessageSquareText} title="Resultado y notas">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {agenda.motivo_no_cierre && <DetailField label="Motivo de no cierre" value={agenda.motivo_no_cierre} />}
                    <DetailField label="Motivo de inclusión" value={agenda.motivo_inclusion} />
                    {agenda.resumen_chat && (
                      <div className="rounded-2xl border border-violet-200/60 bg-violet-500/[.045] p-4 sm:col-span-2 dark:border-violet-400/15">
                        <p className="mb-2 text-[9px] font-black uppercase tracking-[.16em] text-violet-600 dark:text-violet-300">Resumen de la conversación</p>
                        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {agenda.resumen_chat}
                        </div>
                      </div>
                    )}
                  </div>
                </DetailSection>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
