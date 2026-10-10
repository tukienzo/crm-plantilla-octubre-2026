"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import useSWR, { mutate } from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Trophy, Medal, Award, AlertTriangle, TrendingUp, Users, Loader2, BadgeDollarSign, Target, Coins, Star, Sparkles, Search, ExternalLink, CheckCircle2, XCircle, PhoneCall, DollarSign } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Strike } from "@/lib/supabase"
import { CrmPageIntro, CrmStat } from "@/components/crm-ui"
import { useSession } from "@/components/session-provider"
import { META_CASH_MENSUAL } from "@/lib/brand"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const CALIFS_AB_SET = new Set(["S", "A", "B", "C", "LEAD A", "LEAD B", "LEAD C"])

export type DetallePago = {
  id?: string | number
  cliente: string
  monto: number
  tipo: string
  operacion?: string | null
  fecha: string | null
  closer?: string | null
  setter?: string | null
  cohort?: string | null
  comisionable?: number
  en_ventana?: boolean
  es_unidad?: boolean
}

export type DetalleLlamada = {
  id?: string | number
  nombre: string
  fecha_agenda: string | null
  show: boolean
  cerro: boolean
  calificacion?: string | null
  estado?: string | null
  closer?: string | null
  setter?: string | null
}

export type DetalleModalData = {
  titulo: string
  subtitulo: string
  fuente?: string
  tipo: "pagos" | "llamadas"
  persona: string
  rol: "Closer" | "Setter" | "Equipo" | "Negocio"
  metrica: string
  subfiltroInicial?: string
  todosLosPagos?: DetallePago[]
  todasLasLlamadas?: DetalleLlamada[]
}

type CloserData = {
  nombre: string; initials: string
  cc_nuevo: number; cc_total: number; cc_ponderado: number; unidades: number; fees: number
  llamadas: number; cerradas: number; tasa_cierre: number; tc_ab: number; aov: number; show_up: number
  feccu: number; feccpp: number; commissionable_cc: number
  nivel: 1 | 2 | 3; rate: number; unlocked_rate: number; strikes: number; comisiones: number
  is_top: boolean; next_target: number; next_rate: number; personal_goal: number | null
  detalles_pagos?: DetallePago[]
  detalles_llamadas?: DetalleLlamada[]
}
type SetterData = {
  nombre: string; initials: string
  cc_nuevo: number; cc_total: number; cc_ponderado: number; unidades: number; fees: number
  agendas: number; agendas_ab: number; t_agenda: number | null; show_up: number
  feccu: number; feccpp: number; feccpp_excluido: number; commissionable_cc: number
  nivel: 1 | 2 | 3; rate: number; unlocked_rate: number; strikes: number; comisiones: number
  is_top: boolean; next_target: number; next_rate: number; personal_goal: number | null
  detalles_pagos?: DetallePago[]
  detalles_agendas?: DetalleLlamada[]
}
type LeaderboardData = {
  closers: CloserData[]; setters: SetterData[]; csm_nombres?: string[]; csm_cc: number; csm_comision: number
  team_cc_total: number; team_cc_pond?: number
  team_feccu: number; team_feccpp: number; team_beccu: number
  team_detalles_pagos?: DetallePago[]
  team_detalles_agendas?: DetalleLlamada[]
}

// Períodos que se ofrecen: los últimos 24 meses hasta el mes en curso.
function getMonthList(): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = []
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth() - 23, 1)
  const end = new Date(today.getFullYear(), today.getMonth(), 1)
  let d = new Date(start)
  while (d <= end) {
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const raw = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
    list.push({ value, label: raw.charAt(0).toUpperCase() + raw.slice(1) })
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  }
  return list
}

function fUSD(n: number): string {
  if (n === 0) return "—"
  return "$" + Math.round(n).toLocaleString("en-US")
}

function fPct(n: number | null): string {
  if (n === null || n === 0) return "0%"
  return n.toFixed(2) + "%"
}

function NivelBadge({ nivel }: { nivel: number }) {
  if (nivel === 3) return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20">N3</Badge>
  if (nivel === 2) return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-500/20 text-blue-700 border-blue-500/30 hover:bg-blue-500/20">N2</Badge>
  if (nivel === 1) return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-muted text-muted-foreground border-border hover:bg-muted">N1</Badge>
  return <Badge className="text-[10px] px-1.5 py-0 h-4 bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/10">Sin</Badge>
}

function RankIcon({ index }: { index: number }) {
  if (index === 0) return <Trophy className="h-5 w-5 text-amber-500" />
  if (index === 1) return <Medal className="h-5 w-5 text-slate-400" />
  if (index === 2) return <Award className="h-5 w-5 text-amber-700" />
  return <span className="text-sm font-medium text-muted-foreground">{index + 1}</span>
}

// Fotos de perfil del equipo: clave = primer nombre en minúsculas sin tildes,
// valor = ruta del archivo en public/avatars (por ejemplo { ana: "/avatars/ana.jpg" }).
// Arranca vacío: sin foto se muestran las iniciales.
const TEAM_AVATARS: Record<string, string> = {}
function avatarSrc(nombre: string): string | undefined {
  const first = nombre.trim().split(/\s+/)[0]
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  return TEAM_AVATARS[first]
}

function playUnlockSound() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  const context = new AudioContextClass()
  const now = context.currentTime
  ;[523.25, 659.25, 783.99].forEach((frequency, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, now + index * 0.1)
    gain.gain.exponentialRampToValueAtTime(0.42, now + index * 0.1 + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.22)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now + index * 0.1)
    oscillator.stop(now + index * 0.1 + 0.24)
  })
  window.setTimeout(() => void context.close(), 900)
}

function CommissionTrack({ rate }: { rate: number }) {
  const levels = [8, 9, 10, 11, 12]
  const progress = Math.max(0, Math.min(100, ((rate - 8) / 4) * 100))
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.16em] text-white/45">Comisión actual</p>
          <p className="text-4xl font-black tracking-tight text-white">{rate}%</p>
        </div>
        <div className="flex gap-1" aria-label={`${Math.max(1, levels.filter(level => rate >= level).length)} estrellas`}>
          {levels.map((level) => <Star key={level} className={cn("h-5 w-5 transition-all duration-700", rate >= level ? "fill-amber-300 text-amber-300 drop-shadow-[0_0_8px_rgba(252,211,77,.7)]" : "text-white/15")} />)}
        </div>
      </div>
      <div className="relative pt-5">
        <div className="h-4 overflow-hidden rounded-full border border-white/10 bg-black/35 shadow-inner">
          <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-amber-300 to-yellow-100 shadow-[0_0_20px_rgba(251,191,36,.55)] transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(rate >= 8 ? 4 : 0, progress)}%` }} />
        </div>
        <div className="absolute inset-x-0 top-0 flex justify-between">
          {levels.map(level => <span key={level} className={cn("text-[10px] font-black", rate >= level ? "text-amber-200" : "text-white/30")}>{level}%</span>)}
        </div>
      </div>
    </div>
  )
}

function SetterCommissionTrack({ rate }: { rate: number }) {
  const levels = [4, 4.5, 5, 5.5, 6]
  const progress = Math.max(0, Math.min(100, ((rate - 4) / 2) * 100))
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[.16em] text-white/45">Comisión actual</p>
          <p className="text-4xl font-black tracking-tight text-white">{rate}%</p>
        </div>
        <div className="flex gap-1" aria-label={`${levels.filter(level => rate >= level).length} estrellas`}>
          {levels.map((level) => <Star key={level} className={cn("h-5 w-5 transition-all duration-700", rate >= level ? "fill-cyan-300 text-cyan-300 drop-shadow-[0_0_8px_rgba(103,232,249,.7)]" : "text-white/15")} />)}
        </div>
      </div>
      <div className="relative pt-5">
        <div className="h-4 overflow-hidden rounded-full border border-white/10 bg-black/35 shadow-inner">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-300 to-emerald-200 shadow-[0_0_20px_rgba(34,211,238,.5)] transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(rate >= 4 ? 4 : 0, progress)}%` }} />
        </div>
        <div className="absolute inset-x-0 top-0 flex justify-between">
          {levels.map(level => <span key={level} className={cn("text-[10px] font-black", rate >= level ? "text-cyan-200" : "text-white/30")}>{level}%</span>)}
        </div>
      </div>
    </div>
  )
}


function ModalDetalleMetrica({
  data,
  onClose,
}: {
  data: DetalleModalData | null
  onClose: () => void
}) {
  const [busqueda, setBusqueda] = useState("")
  const [subfiltro, setSubfiltro] = useState<string>("todos")

  // Sincronizar subfiltro cuando se abre el modal
  useEffect(() => {
    if (data?.subfiltroInicial) {
      setSubfiltro(data.subfiltroInicial)
    } else {
      setSubfiltro("todos")
    }
    setBusqueda("")
  }, [data])

  if (!data) return null

  // Filtros de pagos
  const todosPagos = data.todosLosPagos || []
  const pagosFiltrados = todosPagos.filter((p) => {
    if (subfiltro === "unidades" && !p.es_unidad) return false
    if (subfiltro === "feccu" && p.cohort !== "FECCU") return false
    if (subfiltro === "feccpp" && p.cohort !== "FECCPP") return false
    if (subfiltro === "comisionable" && (p.comisionable ?? 0) <= 0 && p.monto <= 0) return false

    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    return (
      (p.cliente || "").toLowerCase().includes(q) ||
      (p.tipo || "").toLowerCase().includes(q) ||
      (p.setter || "").toLowerCase().includes(q) ||
      (p.closer || "").toLowerCase().includes(q)
    )
  })

  const totalMontoPagos = pagosFiltrados.reduce((s, p) => s + (p.monto || 0), 0)

  // Filtros de llamadas
  const todasLlamadas = data.todasLasLlamadas || []
  const llamadasFiltradas = todasLlamadas.filter((l) => {
    if (subfiltro === "presentadas" && !l.show) return false
    if (subfiltro === "cerradas" && (!l.show || !l.cerro)) return false
    if (subfiltro === "noshow" && l.show) return false
    if (subfiltro === "calificadas" && (!l.show || !CALIFS_AB_SET.has(l.calificacion || ""))) return false

    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    return (
      (l.nombre || "").toLowerCase().includes(q) ||
      (l.calificacion || "").toLowerCase().includes(q) ||
      (l.setter || "").toLowerCase().includes(q) ||
      (l.closer || "").toLowerCase().includes(q) ||
      (l.estado || "").toLowerCase().includes(q)
    )
  })

  const countPresentadas = todasLlamadas.filter((l) => l.show).length
  const countCerradas = todasLlamadas.filter((l) => l.show && l.cerro).length
  const countNoShow = todasLlamadas.filter((l) => !l.show).length

  return (
    <Dialog open={Boolean(data)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-zinc-950 border-white/10 text-white shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-white/10 bg-zinc-900/60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Badge className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20 text-xs font-semibold">
                  {data.rol} · {data.persona}
                </Badge>
                <Badge className="bg-white/10 text-white/80 border-white/15 text-xs font-semibold">
                  {data.metrica}
                </Badge>
                {data.fuente && (
                  <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    <span>Fuente: {data.fuente}</span>
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl font-black text-white sm:text-2xl">
                {data.titulo}
              </DialogTitle>
              <DialogDescription className="text-sm text-zinc-400 mt-1">
                {data.subtitulo}
              </DialogDescription>
            </div>
          </div>

          {/* Selector de subfiltros */}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.tipo === "pagos" ? (
              <>
                <button
                  type="button"
                  onClick={() => setSubfiltro("todos")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "todos"
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  Todas las ventas ({todosPagos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSubfiltro("unidades")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "unidades"
                      ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  Unidades cerradas ({todosPagos.filter((p) => p.es_unidad).length})
                </button>
                <button
                  type="button"
                  onClick={() => setSubfiltro("feccu")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "feccu"
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  FECCU Upfront ({todosPagos.filter((p) => p.cohort === "FECCU").length})
                </button>
                <button
                  type="button"
                  onClick={() => setSubfiltro("feccpp")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "feccpp"
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  FECCPP Cuotas ({todosPagos.filter((p) => p.cohort === "FECCPP").length})
                </button>
                <button
                  type="button"
                  onClick={() => setSubfiltro("comisionable")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "comisionable"
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  Comisionables ({todosPagos.filter((p) => (p.comisionable ?? 0) > 0 || p.monto > 0).length})
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSubfiltro("todos")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "todos"
                      ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  Todas las agendas ({todasLlamadas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSubfiltro("presentadas")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "presentadas"
                      ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  Calls presentadas ({countPresentadas})
                </button>
                <button
                  type="button"
                  onClick={() => setSubfiltro("cerradas")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "cerradas"
                      ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  Cerradas ({countCerradas})
                </button>
                {data.rol === "Setter" && (
                  <button
                    type="button"
                    onClick={() => setSubfiltro("calificadas")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                      subfiltro === "calificadas"
                        ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
                        : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                    )}
                  >
                    Calificadas A/B/C ({todasLlamadas.filter((l) => l.show && CALIFS_AB_SET.has(l.calificacion || "")).length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSubfiltro("noshow")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition border",
                    subfiltro === "noshow"
                      ? "bg-red-500/20 border-red-500/40 text-red-300"
                      : "bg-white/[.04] border-white/10 text-zinc-400 hover:bg-white/[.08]"
                  )}
                >
                  No show ({countNoShow})
                </button>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
              <Input
                placeholder="Buscar por cliente, tipo, responsable..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="pl-9 bg-zinc-900 border-white/10 text-white placeholder:text-zinc-500 h-9 text-xs focus-visible:ring-cyan-500"
              />
            </div>

            <div className="flex items-center gap-2 text-xs font-bold text-zinc-300 w-full sm:w-auto justify-end">
              {data.tipo === "pagos" ? (
                <>
                  <span className="rounded-lg bg-zinc-900 px-3 py-1.5 border border-white/10">
                    {pagosFiltrados.length} {pagosFiltrados.length === 1 ? "venta" : "ventas"}
                  </span>
                  <span className="rounded-lg bg-emerald-500/10 px-3 py-1.5 border border-emerald-500/20 text-emerald-400 font-black">
                    Total: {fUSD(totalMontoPagos)}
                  </span>
                </>
              ) : (
                <>
                  <span className="rounded-lg bg-zinc-900 px-3 py-1.5 border border-white/10">
                    {llamadasFiltradas.length} {llamadasFiltradas.length === 1 ? "llamada" : "llamadas"}
                  </span>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {data.tipo === "pagos" ? (
            pagosFiltrados.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-zinc-400">No hay registros de pagos para mostrar</p>
                <p className="text-xs text-zinc-600 mt-1">Probá cambiando el filtro o la búsqueda</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-zinc-900/40">
                <Table>
                  <TableHeader className="bg-zinc-900/80">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-xs font-bold uppercase text-zinc-400">Fecha</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400">Cliente / Usuario</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400">Tipo de venta</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400">Responsable</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400 text-right">Monto USD</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400 text-center">Auditoría</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosFiltrados.map((p, idx) => (
                      <TableRow key={p.id || idx} className="border-white/5 hover:bg-white/[.04]">
                        <TableCell className="text-xs text-zinc-400 font-mono whitespace-nowrap">
                          {p.fecha ? p.fecha.slice(0, 10) : "—"}
                        </TableCell>
                        <TableCell className="font-bold text-white text-sm">
                          {p.cliente || "Sin nombre"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[11px] font-medium border-white/10 bg-white/[.03] text-zinc-300">
                              {p.tipo}
                            </Badge>
                            {p.es_unidad && (
                              <Badge className="text-[10px] font-bold bg-purple-500/20 text-purple-300 border-purple-500/30">
                                Unidad
                              </Badge>
                            )}
                            {p.cohort && (
                              <Badge className="text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border-cyan-500/30">
                                {p.cohort}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400">
                          {p.closer && <div className="text-amber-400 font-medium">Closer: {p.closer}</div>}
                          {p.setter && <div className="text-cyan-400 font-medium">Setter: {p.setter}</div>}
                          {!p.closer && !p.setter && <span className="text-zinc-500">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-black text-emerald-400 text-sm whitespace-nowrap font-mono">
                          {fUSD(p.monto)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Link
                            href="/todos-pagos"
                            className="inline-flex items-center gap-1 rounded-md bg-white/[.04] px-2 py-1 text-[11px] font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white border border-white/10"
                            title="Auditar en módulo Carga de Pagos"
                          >
                            Pagos <ExternalLink className="h-3 w-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            llamadasFiltradas.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <PhoneCall className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-zinc-400">No hay llamadas para mostrar</p>
                <p className="text-xs text-zinc-600 mt-1">Probá cambiando el filtro o la búsqueda</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-zinc-900/40">
                <Table>
                  <TableHeader className="bg-zinc-900/80">
                    <TableRow className="border-white/10 hover:bg-transparent">
                      <TableHead className="text-xs font-bold uppercase text-zinc-400">Fecha Agenda</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400">Lead / Prospecto</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400 text-center">Score</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400 text-center">Asistencia</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400 text-center">Cierre</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400">Responsable</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-zinc-400 text-center">Auditoría</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {llamadasFiltradas.map((l, idx) => (
                      <TableRow key={l.id || idx} className="border-white/5 hover:bg-white/[.04]">
                        <TableCell className="text-xs text-zinc-400 font-mono whitespace-nowrap">
                          {l.fecha_agenda ? l.fecha_agenda.replace("T", " ").slice(0, 16) : "—"}
                        </TableCell>
                        <TableCell className="font-bold text-white text-sm">
                          {l.nombre || "Sin nombre"}
                        </TableCell>
                        <TableCell className="text-center">
                          {l.calificacion ? (
                            <Badge className="text-[10px] font-black uppercase px-2 py-0.5 bg-violet-500/15 text-violet-300 border-violet-500/30">
                              {l.calificacion}
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-600">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {l.show ? (
                            <Badge className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                              Se presentó
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-medium border-red-500/20 text-red-400 bg-red-500/10">
                              No show
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {l.cerro ? (
                            <Badge className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                              ✓ Cerró
                            </Badge>
                          ) : (
                            <span className="text-xs text-zinc-500">No cerró</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400">
                          {l.closer && <div className="text-amber-400 font-medium">Closer: {l.closer}</div>}
                          {l.setter && <div className="text-cyan-400 font-medium">Setter: {l.setter}</div>}
                          {!l.closer && !l.setter && <span className="text-zinc-500">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Link
                            href="/pipeline"
                            className="inline-flex items-center gap-1 rounded-md bg-white/[.04] px-2 py-1 text-[11px] font-bold text-cyan-300 transition hover:bg-cyan-500/20 hover:text-cyan-200 border border-cyan-500/20"
                            title="Auditar lead en Pipeline"
                          >
                            Pipeline <ExternalLink className="h-3 w-3" />
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CloserGameCard({ closer, index, businessGoal, onOpenDetalle }: { closer: CloserData; index: number; businessGoal: number; onOpenDetalle: (data: DetalleModalData) => void }) {
  const commissionCc = closer.cc_total
  const nextCash = closer.personal_goal || closer.next_target || businessGoal
  const cashProgress = nextCash > 0 ? Math.min(100, (commissionCc / nextCash) * 100) : 0
  const nextLabel = closer.personal_goal ? "Objetivo personal del mes" : closer.next_target ? `Desbloquea ${closer.next_rate}%${closer.next_rate === 12 ? " · solo Top 1" : ""}` : "Meta del negocio"
  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-violet-950/50 p-5 shadow-[0_22px_70px_rgba(0,0,0,.32)] transition duration-300 hover:-translate-y-1 hover:border-amber-300/30 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-violet-500/15 blur-3xl transition group-hover:bg-amber-300/15" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.07]"><RankIcon index={index} /></div>
          <Avatar className="h-12 w-12 border border-white/10">
            <AvatarImage src={avatarSrc(closer.nombre)} alt={closer.nombre} />
            <AvatarFallback className="bg-white/10 text-white font-black">{closer.initials}</AvatarFallback>
          </Avatar>
          <div><h3 className="text-xl font-black text-white sm:text-2xl">{closer.nombre}</h3><p className="text-xs font-bold uppercase tracking-[.16em] text-white/40">Closer · Nivel {closer.nivel}</p></div>
        </div>
        <div onClick={() => onOpenDetalle({
          titulo: `Comisión · ${closer.nombre}`,
          subtitulo: `Tasa aplicada: ${closer.rate}% · Base neta comisionable: ${fUSD(closer.commissionable_cc)} · Total: ${fUSD(closer.comisiones)}`,
          fuente: "Ventas → Carga de Pagos (Stripe / Cobros conciliados)",
          tipo: "pagos",
          persona: closer.nombre,
          rol: "Closer",
          metrica: "Comisión",
          subfiltroInicial: "comisionable",
          todosLosPagos: closer.detalles_pagos || [],
        })} className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-right cursor-pointer transition hover:scale-105 hover:border-emerald-300/50 hover:bg-emerald-400/20 active:scale-95 group/comm" title="Click para ver desglose de comisiones"><div className="flex items-center justify-end gap-1"><p className="text-[10px] font-black uppercase text-emerald-200/60">Comisión</p><span className="text-[9px] text-emerald-300/60 opacity-0 group-hover/comm:opacity-100 transition">↗</span></div><p className="text-lg font-black text-emerald-300">{fUSD(closer.comisiones)}</p><p className="text-[9px] font-bold text-emerald-100/45">Base neta {fUSD(closer.commissionable_cc)}</p></div>
      </div>
      <div className="relative mt-5 grid grid-cols-1 gap-2 text-center">
        <div onClick={() => onOpenDetalle({
          titulo: `Cash Collected Total · ${closer.nombre}`,
          subtitulo: `Total comisionable recaudado: ${fUSD(closer.cc_total)} en ${closer.detalles_pagos?.length || 0} operaciones`,
          fuente: "Ventas → Carga de Pagos (Stripe / Cobros conciliados)",
          tipo: "pagos",
          persona: closer.nombre,
          rol: "Closer",
          metrica: "CC Total",
          subfiltroInicial: "todos",
          todosLosPagos: closer.detalles_pagos || [],
        })} className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[.07] p-3 cursor-pointer transition hover:scale-[1.02] hover:border-emerald-300/40 hover:bg-emerald-400/15 active:scale-95 group/cct" title="Click para ver todas las ventas"><div className="flex items-center justify-center gap-1"><p className="text-[10px] font-black uppercase text-white/35">CC Total</p><span className="text-[9px] text-emerald-300/60 opacity-0 group-hover/cct:opacity-100 transition">ver ventas ↗</span></div><p className="text-lg font-black text-emerald-300">{fUSD(closer.cc_total)}</p></div>
      </div>
      <div className="relative mt-6"><CommissionTrack rate={closer.rate ?? (closer.nivel === 3 ? 10 : closer.nivel === 2 ? 9 : 8)} /></div>
      <div className="relative mt-6 rounded-2xl border border-white/[.07] bg-white/[.035] p-4">
        <div className="mb-2 flex justify-between text-xs"><span className="font-bold text-white/55">{nextLabel}</span><span className="font-black text-white">{fUSD(commissionCc)} / {fUSD(nextCash)}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-300 transition-[width] duration-1000" style={{ width: `${cashProgress}%` }} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <div
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetalle({
                titulo: `FECCU (Upfront Nuevo) · ${closer.nombre}`,
                subtitulo: `Cash upfront de clientes nuevos cerrado: ${fUSD(closer.feccu)}`,
                fuente: "Ventas → Carga de Pagos (Stripe / Cobros conciliados)",
                tipo: "pagos",
                persona: closer.nombre,
                rol: "Closer",
                metrica: "FECCU",
                subfiltroInicial: "feccu",
                todosLosPagos: closer.detalles_pagos || [],
              })
            }}
            className="rounded-xl p-1.5 cursor-pointer transition hover:bg-emerald-500/15 hover:scale-105 active:scale-95 group/stat border border-transparent hover:border-emerald-500/30"
            title="Click para auditar ventas FECCU"
          >
            <p className="text-[10px] font-black uppercase text-white/35 flex items-center justify-center gap-0.5">
              FECCU <span className="text-[8px] text-emerald-400 opacity-0 group-hover/stat:opacity-100 transition">↗</span>
            </p>
            <p className="text-lg font-black text-emerald-300">{fUSD(closer.feccu)}</p>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetalle({
                titulo: `FECCPP (Cuotas Front-End) · ${closer.nombre}`,
                subtitulo: `Cash recaudado en cuotas: ${fUSD(closer.feccpp)}`,
                fuente: "Ventas → Carga de Pagos / Planes de Pago",
                tipo: "pagos",
                persona: closer.nombre,
                rol: "Closer",
                metrica: "FECCPP",
                subfiltroInicial: "feccpp",
                todosLosPagos: closer.detalles_pagos || [],
              })
            }}
            className="rounded-xl p-1.5 cursor-pointer transition hover:bg-cyan-500/15 hover:scale-105 active:scale-95 group/stat border border-transparent hover:border-cyan-500/30"
            title="Click para auditar cuotas FECCPP"
          >
            <p className="text-[10px] font-black uppercase text-white/35 flex items-center justify-center gap-0.5">
              FECCPP <span className="text-[8px] text-cyan-400 opacity-0 group-hover/stat:opacity-100 transition">↗</span>
            </p>
            <p className="text-lg font-black text-cyan-300">{fUSD(closer.feccpp)}</p>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetalle({
                titulo: `Unidades Cerradas · ${closer.nombre}`,
                subtitulo: `Total de adquisiciones de clientes nuevos cerrados: ${closer.unidades || 0}`,
                fuente: "Ventas → Carga de Pagos (Venta Nueva)",
                tipo: "pagos",
                persona: closer.nombre,
                rol: "Closer",
                metrica: "Unidades",
                subfiltroInicial: "unidades",
                todosLosPagos: closer.detalles_pagos || [],
              })
            }}
            className="rounded-xl p-1.5 cursor-pointer transition hover:bg-purple-500/15 hover:scale-105 active:scale-95 group/stat border border-transparent hover:border-purple-500/30"
            title="Click para ver clientes nuevos cerrados"
          >
            <p className="text-[10px] font-black uppercase text-white/35 flex items-center justify-center gap-0.5">
              Unidades <span className="text-[8px] text-purple-400 opacity-0 group-hover/stat:opacity-100 transition">↗</span>
            </p>
            <p className="text-lg font-black text-white">{closer.unidades || "—"}</p>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetalle({
                titulo: `Tasa de Cierre sobre Presentadas · ${closer.nombre}`,
                subtitulo: `Cierres: ${closer.cerradas} / Presentadas: ${closer.llamadas} (${fPct(closer.tasa_cierre)})`,
                fuente: "Ventas → Agendas / Pipeline (iClosed / Fathom)",
                tipo: "llamadas",
                persona: closer.nombre,
                rol: "Closer",
                metrica: "Tasa de Cierre",
                subfiltroInicial: "cerradas",
                todasLasLlamadas: closer.detalles_llamadas || [],
              })
            }}
            className="rounded-xl p-1.5 cursor-pointer transition hover:bg-amber-500/15 hover:scale-105 active:scale-95 group/stat border border-transparent hover:border-amber-500/30"
            title="Click para ver llamadas y cierres"
          >
            <p className="text-[10px] font-black uppercase text-white/35 flex items-center justify-center gap-0.5">
              Cierre s/ pres. <span className="text-[8px] text-amber-400 opacity-0 group-hover/stat:opacity-100 transition">↗</span>
            </p>
            <p className="text-lg font-black text-white">{fPct(closer.tasa_cierre)}</p>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetalle({
                titulo: `Llamadas Presentadas · ${closer.nombre}`,
                subtitulo: `Total de llamadas asistidas: ${closer.llamadas || 0} de ${closer.detalles_llamadas?.length || 0} agendas`,
                fuente: "Ventas → Agendas / Pipeline (iClosed / Fathom)",
                tipo: "llamadas",
                persona: closer.nombre,
                rol: "Closer",
                metrica: "Calls",
                subfiltroInicial: "presentadas",
                todasLasLlamadas: closer.detalles_llamadas || [],
              })
            }}
            className="rounded-xl p-1.5 cursor-pointer transition hover:bg-blue-500/15 hover:scale-105 active:scale-95 group/stat border border-transparent hover:border-blue-500/30"
            title="Click para ver llamadas"
          >
            <p className="text-[10px] font-black uppercase text-white/35 flex items-center justify-center gap-0.5">
              Calls <span className="text-[8px] text-blue-400 opacity-0 group-hover/stat:opacity-100 transition">↗</span>
            </p>
            <p className="text-lg font-black text-white">{closer.llamadas || "—"}</p>
          </div>
        </div>
      </div>
    </article>
  )
}

function SetterGameCard({ setter, index, businessGoal, onOpenDetalle }: { setter: SetterData; index: number; businessGoal: number; onOpenDetalle: (data: DetalleModalData) => void }) {
  const target = setter.personal_goal || setter.next_target || businessGoal
  const cashProgress = target > 0 ? Math.min(100, (setter.cc_total / target) * 100) : 0
  const rate = setter.rate ?? (setter.nivel === 3 ? 5 : setter.nivel === 2 ? 4.5 : 4)
  return (
    <article className="group relative overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-br from-zinc-900/95 via-zinc-950 to-blue-950/50 p-5 shadow-[0_22px_70px_rgba(0,0,0,.32)] transition duration-300 hover:-translate-y-1 hover:border-cyan-300/30 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-blue-500/15 blur-3xl transition group-hover:bg-cyan-300/15" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[.07]"><RankIcon index={index} /></div>
          <Avatar className="h-12 w-12 border border-white/10">
            <AvatarImage src={avatarSrc(setter.nombre)} alt={setter.nombre} />
            <AvatarFallback className="bg-white/10 font-black text-white">{setter.initials}</AvatarFallback>
          </Avatar>
          <div><h3 className="text-xl font-black text-white sm:text-2xl">{setter.nombre}</h3><p className="text-xs font-bold uppercase tracking-[.16em] text-white/40">Setter · Nivel {setter.nivel}</p></div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto">
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-right">
            <p className="text-[10px] font-black uppercase text-emerald-200/60">Comisión</p>
            <p className="text-lg font-black text-emerald-300">{fUSD(setter.comisiones)}</p>
          </div>
        </div>
      </div>
      <div className="relative mt-5 grid grid-cols-1 gap-2 text-center">
        <div onClick={() => onOpenDetalle({
          titulo: `Cash Collected Total (≤30d) · ${setter.nombre}`,
          subtitulo: `Total comisionable recaudado en ventana de 30 días: ${fUSD(setter.cc_total)}`,
          tipo: "pagos",
          persona: setter.nombre,
          rol: "Setter",
          metrica: "CC Total",
          subfiltroInicial: "todos",
          todosLosPagos: setter.detalles_pagos || [],
        })} className="rounded-2xl border border-emerald-300/15 bg-emerald-400/[.07] p-3 cursor-pointer transition hover:scale-[1.02] hover:border-emerald-300/40 hover:bg-emerald-400/15 active:scale-95 group/scc" title="Click para ver ventas asociadas">
          <div className="flex items-center justify-center gap-1">
            <p className="text-[10px] font-black uppercase text-white/35">CC Total</p>
            <span className="text-[9px] text-emerald-300/60 opacity-0 group-hover/scc:opacity-100 transition">ver ventas ↗</span>
          </div>
          <p className="text-lg font-black text-emerald-300">{fUSD(setter.cc_total)}</p>
        </div>
      </div>
      <div className="relative mt-6"><SetterCommissionTrack rate={rate} /></div>
      <div className="relative mt-6 rounded-2xl border border-white/[.07] bg-white/[.035] p-4">
        <div className="mb-2 flex justify-between text-xs"><span className="font-bold text-white/55">{setter.personal_goal ? "Objetivo personal del mes" : `Desbloquea ${setter.next_rate}%${setter.next_rate === 6 ? " · solo Top 1" : ""}`}</span><span className="font-black text-white">{fUSD(setter.cc_total)} / {fUSD(target)}</span></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-300 transition-[width] duration-1000" style={{ width: `${cashProgress}%` }} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          <div><p className="text-[10px] font-black uppercase text-white/35">FECCU ≤30d</p><p className="text-lg font-black text-emerald-300">{fUSD(setter.feccu)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">FECCPP ≤30d</p><p className="text-lg font-black text-cyan-300">{fUSD(setter.feccpp)}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">Agendas</p><p className="text-lg font-black text-white">{setter.agendas || "—"}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">Calificadas</p><p className="text-lg font-black text-white">{setter.agendas_ab || "—"}</p></div>
          <div><p className="text-[10px] font-black uppercase text-white/35">T. agenda</p><p className="text-lg font-black text-white">{setter.t_agenda !== null ? fPct(setter.t_agenda) : "—"}</p></div>
        </div>
      </div>
    </article>
  )
}

function StrikeCounter({ strike }: { strike: Strike }) {
  const [loading, setLoading] = useState(false)
  const setCount = async (n: number) => {
    if (loading || n === strike.count) return
    setLoading(true)
    await fetch("/api/strikes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: strike.id, count: n }) })
    await mutate("/api/strikes")
    setLoading(false)
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <Avatar className="h-8 w-8"><AvatarFallback className="bg-muted text-muted-foreground text-xs font-semibold">{strike.nombre.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        <div><p className="text-sm font-medium leading-tight">{strike.nombre}</p><p className="text-xs text-muted-foreground">{strike.rol}</p></div>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
          [0, 1, 2].map((n) => (
            <button key={n} onClick={() => setCount(n)} className={cn(
              "w-8 h-8 rounded-md text-sm font-semibold border transition-colors",
              strike.count === n
                ? n === 0 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                  : n === 1 ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                  : "bg-red-500/10 text-red-600 border-red-500/30"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted"
            )}>{n}</button>
          ))
        )}
      </div>
    </div>
  )
}

export default function EquipoPage() {
  const session = useSession()
  const isManager = session.rol === "CEO" || session.rol === "Contaduria"
  const monthList = useMemo(() => getMonthList(), [])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  // El sonido de logro queda activo siempre, sin control visible en Equipo.
  const soundEnabled = true
  const [unlock, setUnlock] = useState<{ nombre: string; rate: number } | null>(null)
  const [detalleModal, setDetalleModal] = useState<DetalleModalData | null>(null)

  const monthLabel = useMemo(() => monthList.find(m => m.value === selectedMonth)?.label ?? selectedMonth, [monthList, selectedMonth])
  // Meta mensual de cash collected (NEXT_PUBLIC_META_CASH_MENSUAL); 0 = sin meta cargada.
  const businessGoal = META_CASH_MENSUAL

  const { data: raw, isLoading: lbLoading } = useSWR<LeaderboardData>(
    `/api/leaderboard?month=${selectedMonth}`, fetcher, { revalidateOnFocus: false }
  )
  // Strikes son informacion de auditoria interna para el CEO; el equipo
  // (closers/setters) nunca debe verlas, ni el conteo ni el endpoint.
  const { data: strikes, isLoading: strikesLoading } = useSWR<Strike[]>(isManager ? "/api/strikes" : null, fetcher)

  const closers = raw?.closers || []
  const setters = raw?.setters || []
  const csmCc = raw?.csm_cc ?? 0
  const csmComision = raw?.csm_comision ?? 0
  // El CSM sale de team_members (rol "CSM") vía /api/leaderboard.
  const csmNombre = raw?.csm_nombres?.[0] || "Sin CSM asignado"
  const csmInitials = raw?.csm_nombres?.[0] ? raw.csm_nombres[0].slice(0, 2).toUpperCase() : "CS"
  const teamCCTotal = raw?.team_cc_total ?? raw?.team_cc_pond ?? 0
  // Reparto de ejemplo de la meta entre cohortes (share suma 1): ajustalo a tu negocio.
  const goalBuckets = [
    { label: "FECCU", value: raw?.team_feccu ?? 0, share: 0.6, color: "from-violet-600 to-fuchsia-400" },
    { label: "FECCPP", value: raw?.team_feccpp ?? 0, share: 0.2, color: "from-cyan-500 to-blue-400" },
    { label: "BECCU", value: raw?.team_beccu ?? 0, share: 0.2, color: "from-orange-500 to-amber-300" },
  ].map((bucket) => ({ ...bucket, goal: Math.round(businessGoal * bucket.share) }))
  const goalCollected = goalBuckets.reduce((sum, bucket) => sum + bucket.value, 0)
  const goalPct = businessGoal > 0 ? `${Math.min(100, Math.round((goalCollected / businessGoal) * 100))}%` : "—"

  useEffect(() => {
    if (!raw?.closers?.length) return
    const storageKey = `yy-leaderboard-levels-${selectedMonth}`
    const current = Object.fromEntries(raw.closers.map(c => [c.nombre, c.rate]))
    const savedRaw = window.localStorage.getItem(storageKey)
    if (!savedRaw) {
      window.localStorage.setItem(storageKey, JSON.stringify(current))
      return
    }
    try {
      const saved = JSON.parse(savedRaw) as Record<string, number>
      const promoted = raw.closers.find(c => typeof saved[c.nombre] === "number" && c.rate > saved[c.nombre])
      if (promoted) {
        setUnlock({ nombre: promoted.nombre, rate: promoted.rate })
        if (soundEnabled) playUnlockSound()
        window.setTimeout(() => setUnlock(null), 6500)
      }
    } catch {
      // A stale local preference must never block the leaderboard.
    }
    window.localStorage.setItem(storageKey, JSON.stringify(current))
  }, [raw, selectedMonth, soundEnabled])

  const closerTotals = useMemo(() => ({
    cc_total: closers.reduce((s, c) => s + c.cc_total, 0),
    cc_ponderado: closers.reduce((s, c) => s + c.cc_ponderado, 0),
    unidades: closers.reduce((s, c) => s + c.unidades, 0),
    fees: closers.reduce((s, c) => s + c.fees, 0),
    llamadas: closers.reduce((s, c) => s + c.llamadas, 0),
    comisiones: closers.reduce((s, c) => s + c.comisiones, 0),
  }), [closers])

  const setterTotals = useMemo(() => ({
    cc_total: setters.reduce((s, c) => s + c.cc_total, 0),
    unidades: setters.reduce((s, c) => s + c.unidades, 0),
    fees: setters.reduce((s, c) => s + c.fees, 0),
    agendas: setters.reduce((s, c) => s + c.agendas, 0),
    agendas_ab: setters.reduce((s, c) => s + c.agendas_ab, 0),
    comisiones: setters.reduce((s, c) => s + c.comisiones, 0),
  }), [setters])

  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Leaderboard comercial"
        title="Equipo comercial"
        description="Niveles y comisiones calculados con el rendimiento real del período."
        icon={<Trophy className="h-6 w-6" />}
        tone="amber"
        actions={<>
          <Button asChild variant="outline" className="border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white"><Link href="/esquema-comisiones"><BadgeDollarSign className="mr-2 h-4 w-4" />Comisiones</Link></Button>
          {!lbLoading && teamCCTotal > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs text-white/55">
              CC Total: <span className="font-bold text-white">{fUSD(teamCCTotal)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5">
            <span className="mr-1 text-[10px] font-black uppercase tracking-wider text-white/40">Mes</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="cursor-pointer bg-transparent text-sm font-bold text-white focus:outline-none [&_option]:text-zinc-950"
            >
              {monthList.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </>}
      />

      <ModalDetalleMetrica data={detalleModal} onClose={() => setDetalleModal(null)} />
      {unlock && (
        <div className="fixed inset-x-4 top-24 z-[100] mx-auto max-w-xl animate-in slide-in-from-top-6 fade-in duration-500">
          <div className="rounded-[28px] border border-amber-200/40 bg-gradient-to-br from-amber-300 via-yellow-500 to-violet-700 p-[1px] shadow-[0_24px_90px_rgba(251,191,36,.4)]">
            <div className="rounded-[27px] bg-zinc-950/95 px-6 py-5 text-center backdrop-blur-xl">
              <Sparkles className="mx-auto mb-2 h-7 w-7 text-amber-300" />
              <p className="text-xs font-black uppercase tracking-[.24em] text-amber-200">Logro desbloqueado</p>
              <p className="mt-1 text-2xl font-black text-white">{unlock.nombre} pasó al {unlock.rate}%</p>
              <p className="mt-1 text-sm font-medium text-white/55">Bien ahí. Ahora sostené el nivel.</p>
            </div>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950 p-5 text-white shadow-[0_22px_70px_rgba(0,0,0,.28)] sm:p-7">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div
            onClick={() => setDetalleModal({
              titulo: "Objetivo Mensual del Negocio",
              subtitulo: businessGoal > 0 ? `Total recaudado: ${fUSD(goalCollected)} de ${fUSD(businessGoal)} (${goalPct})` : `Total recaudado: ${fUSD(goalCollected)} (sin meta cargada)`,
              fuente: "Ventas → Carga de Pagos (Stripe / Cobros conciliados)",
              tipo: "pagos",
              persona: "Todo el equipo",
              rol: "Negocio",
              metrica: "Objetivo Mensual",
              subfiltroInicial: "todos",
              todosLosPagos: raw?.team_detalles_pagos || [],
            })}
            className="cursor-pointer group/goal transition hover:opacity-90"
            title="Click para ver todas las ventas del objetivo mensual"
          >
            <p className="text-xs font-black uppercase tracking-[.18em] text-violet-300 flex items-center gap-1.5">
              Objetivo mensual del negocio <span className="opacity-0 group-hover/goal:opacity-100 text-[10px] text-violet-300 transition">ver ventas ↗</span>
            </p>
            <p className="mt-1 text-3xl font-black sm:text-4xl">{fUSD(goalCollected)} <span className="text-lg text-white/35">/ {businessGoal > 0 ? fUSD(businessGoal) : "sin meta"}</span></p>
          </div>
          <p className="text-2xl font-black text-amber-300">{goalPct}</p>
        </div>
        <div className="mt-5 flex gap-1">
          {goalBuckets.map((bucket) => (
            <div
              key={bucket.label}
              style={{ width: `${bucket.share * 100}%` }}
              onClick={() => setDetalleModal({
                titulo: `Cohort ${bucket.label} · Objetivo Negocio`,
                subtitulo: bucket.goal > 0 ? `Recaudado en ${bucket.label}: ${fUSD(bucket.value)} de meta ${fUSD(bucket.goal)}` : `Recaudado en ${bucket.label}: ${fUSD(bucket.value)}`,
                fuente: "Ventas → Carga de Pagos (Stripe / Cobros conciliados)",
                tipo: "pagos",
                persona: "Todo el equipo",
                rol: "Negocio",
                metrica: bucket.label,
                subfiltroInicial: bucket.label.toLowerCase() === "feccu" ? "feccu" : bucket.label.toLowerCase() === "feccpp" ? "feccpp" : "todos",
                todosLosPagos: raw?.team_detalles_pagos || [],
              })}
              className="cursor-pointer group/bucket transition hover:opacity-90"
              title={`Click para ver ventas de ${bucket.label}`}
            >
              <div className="mb-2 flex items-end justify-between gap-2 text-[10px] font-black uppercase tracking-wider">
                <span className="text-white/70 group-hover/bucket:text-white transition flex items-center gap-1">
                  {bucket.label} <span className="opacity-0 group-hover/bucket:opacity-100 text-[8px] text-white/50">↗</span>
                </span>
                <span className="text-white/40">{fUSD(bucket.value)}{bucket.goal > 0 ? ` / ${fUSD(bucket.goal)}` : ""}</span>
              </div>
              <div className="h-5 overflow-hidden rounded-md border border-white/10 bg-white/[.06] group-hover/bucket:border-white/30 transition">
                <div className={`h-full bg-gradient-to-r ${bucket.color} transition-[width] duration-1000`} style={{ width: `${bucket.goal > 0 ? Math.min(100, (bucket.value / bucket.goal) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-black uppercase tracking-wider text-white/30"><span>$0</span><span>$60K</span><span>$80K</span><span>$100K</span></div>
      </section>

      <div className="crm-kpis">
        <div
          onClick={() => setDetalleModal({
            titulo: `CC Total Equipo · ${monthLabel}`,
            subtitulo: `Recaudación total de todo el equipo comercial: ${fUSD(teamCCTotal)}`,
            fuente: "Ventas → Carga de Pagos (Stripe / Cobros conciliados)",
            tipo: "pagos",
            persona: "Todo el equipo",
            rol: "Equipo",
            metrica: "CC Total Equipo",
            subfiltroInicial: "todos",
            todosLosPagos: raw?.team_detalles_pagos || [],
          })}
          className="cursor-pointer transition hover:scale-[1.02] active:scale-95 group/kpi"
          title="Click para ver todas las ventas del equipo"
        >
          <CrmStat label="CC total equipo" value={fUSD(teamCCTotal)} detail={`${monthLabel} · click para ver ↗`} icon={<Target className="h-5 w-5" />} tone="amber" />
        </div>

        <div
          onClick={() => setDetalleModal({
            titulo: `Unidades Cerradas del Equipo · ${monthLabel}`,
            subtitulo: `Total de clientes nuevos cerrados: ${closerTotals.unidades} (${closerTotals.fees} fees adicionales)`,
            fuente: "Ventas → Carga de Pagos (Venta Nueva / Upfront)",
            tipo: "pagos",
            persona: "Todo el equipo",
            rol: "Equipo",
            metrica: "Unidades Cerradas",
            subfiltroInicial: "unidades",
            todosLosPagos: raw?.team_detalles_pagos || [],
          })}
          className="cursor-pointer transition hover:scale-[1.02] active:scale-95 group/kpi"
          title="Click para ver clientes nuevos cerrados"
        >
          <CrmStat label="Unidades cerradas" value={closerTotals.unidades} detail={`${closerTotals.fees} fees adicionales · click para ver ↗`} icon={<Trophy className="h-5 w-5" />} tone="red" />
        </div>

        <div
          onClick={() => setDetalleModal({
            titulo: `Agendas Setters del Equipo · ${monthLabel}`,
            subtitulo: `Total de agendas del equipo: ${setterTotals.agendas} (${setterTotals.agendas_ab} calificadas presentadas)`,
            fuente: "Ventas → Agendas / Pipeline (iClosed / Fathom)",
            tipo: "llamadas",
            persona: "Setters del equipo",
            rol: "Equipo",
            metrica: "Agendas Setters",
            subfiltroInicial: "todos",
            todasLasLlamadas: raw?.team_detalles_agendas || [],
          })}
          className="cursor-pointer transition hover:scale-[1.02] active:scale-95 group/kpi"
          title="Click para ver agendas del equipo"
        >
          <CrmStat label="Agendas setters" value={setterTotals.agendas} detail={`${setterTotals.agendas_ab} calificadas · click para ver ↗`} icon={<Users className="h-5 w-5" />} tone="blue" />
        </div>

        <div
          onClick={() => setDetalleModal({
            titulo: `Comisiones Totales del Equipo · ${monthLabel}`,
            subtitulo: `Total comisiones liquidadas: ${fUSD(closerTotals.comisiones + setterTotals.comisiones + csmComision)} (closers + setters + CSM)`,
            fuente: "Ventas → Esquema de comisiones y Carga de Pagos",
            tipo: "pagos",
            persona: "Todo el equipo",
            rol: "Equipo",
            metrica: "Comisiones",
            subfiltroInicial: "comisionable",
            todosLosPagos: raw?.team_detalles_pagos || [],
          })}
          className="cursor-pointer transition hover:scale-[1.02] active:scale-95 group/kpi"
          title="Click para ver comisiones"
        >
          <CrmStat label="Comisiones" value={fUSD(closerTotals.comisiones + setterTotals.comisiones + csmComision)} detail="closers + setters + CSM · click para ver ↗" icon={<Coins className="h-5 w-5" />} tone="emerald" />
        </div>
      </div>

      {lbLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* CLOSERS */}
          <section>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/20 bg-amber-300/10"><TrendingUp className="h-6 w-6 text-amber-400" /></div>
              <div><h2 className="text-3xl font-black tracking-tight">Closers</h2><p className="text-sm text-muted-foreground">Progreso individual, nivel y comisión en tiempo real</p></div>
            </div>
            {closers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sin datos para {monthLabel}</p>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  {closers.map((closer, index) => <CloserGameCard key={closer.nombre} closer={closer} index={index} businessGoal={businessGoal} onOpenDetalle={setDetalleModal} />)}
                </div>
                <div className="hidden">
                <div className="crm-mobile-stack">
                  {closers.map((m, i) => (
                    <article key={m.nombre} className="premium-panel p-4">
                      <div className="flex items-center justify-between"><div className="flex items-center gap-3"><RankIcon index={i} /><Avatar className="h-9 w-9"><AvatarFallback className="bg-primary/10 text-xs font-black text-primary">{m.initials}</AvatarFallback></Avatar><div><p className="text-sm font-black">{m.nombre}</p><NivelBadge nivel={m.nivel} /></div></div><p className="text-lg font-black text-primary">{fUSD(m.cc_total)}</p></div>
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-2xl bg-black/[.025] p-3 text-center dark:bg-white/[.03]"><div><p className="crm-stat-label">Unidades</p><p className="font-black">{m.unidades || "—"}</p></div><div><p className="crm-stat-label">TC</p><p className="font-black">{fPct(m.tc_ab)}</p></div><div><p className="crm-stat-label">Comisión</p><p className="font-black text-emerald-600">{fUSD(m.comisiones)}</p></div></div>
                    </article>
                  ))}
                </div>
                <Card className="crm-desktop-table border border-border">
                  <CardContent className="pt-4">
                    <div className="crm-scroll-shell">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-8 text-xs font-semibold uppercase text-muted-foreground">#</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Closer</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Nivel</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">CC Total</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Unidades Cerradas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Fees</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Calls Atendidas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Tasa de Cierre (Presentadas)</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">AOV TC</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Comisiones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {closers.map((m, i) => (
                            <TableRow key={m.nombre} className="hover:bg-muted/50">
                              <TableCell><RankIcon index={i} /></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={avatarSrc(m.nombre)} alt={m.nombre} />
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{m.initials}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium whitespace-nowrap">{m.nombre}</span>
                                </div>
                              </TableCell>
                              <TableCell><NivelBadge nivel={m.nivel} /></TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{fUSD(m.cc_total)}</TableCell>
                              <TableCell className="text-center text-sm">{m.unidades || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.fees || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.llamadas || "—"}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{fPct(m.tc_ab)}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{m.aov > 0 ? fUSD(m.aov) : "—"}</TableCell>
                              <TableCell className="text-sm font-medium text-emerald-600 whitespace-nowrap">{fUSD(m.comisiones)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell /><TableCell className="text-xs uppercase text-muted-foreground">Totales</TableCell>
                            <TableCell />
                            <TableCell className="whitespace-nowrap">{fUSD(closerTotals.cc_total)}</TableCell>
                            <TableCell className="text-center">{closerTotals.unidades || "—"}</TableCell>
                            <TableCell className="text-center">{closerTotals.fees || "—"}</TableCell>
                            <TableCell className="text-center">{closerTotals.llamadas || "—"}</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell className="text-emerald-600 whitespace-nowrap">{fUSD(closerTotals.comisiones)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
                </div>
              </>
            )}
          </section>

          {/* SETTERS */}
          <section>
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10"><Users className="h-6 w-6 text-cyan-400" /></div>
              <div><h2 className="text-3xl font-black tracking-tight">Setters</h2><p className="text-sm text-muted-foreground">Progreso individual, nivel y comisión en tiempo real</p></div>
            </div>
            {setters.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Sin datos para {monthLabel}</p>
            ) : (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  {setters.map((setter, index) => <SetterGameCard key={setter.nombre} setter={setter} index={index} businessGoal={businessGoal} onOpenDetalle={setDetalleModal} />)}
                </div>
                <Card className="hidden">
                  <CardContent className="pt-4">
                    <div className="crm-scroll-shell">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-8 text-xs font-semibold uppercase text-muted-foreground">#</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Setter</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Nivel</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">CC Total</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Unidades Cerradas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Fees</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Agendas Totales</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Agendas Calificadas Presentadas</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Tasa de Agenda</TableHead>
                            <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Comisiones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {setters.map((m, i) => (
                            <TableRow key={m.nombre} className="hover:bg-muted/50">
                              <TableCell><RankIcon index={i} /></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={avatarSrc(m.nombre)} alt={m.nombre} />
                                    <AvatarFallback className="bg-blue-500/10 text-blue-600 text-xs font-semibold">{m.initials}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium whitespace-nowrap">{m.nombre}</span>
                                </div>
                              </TableCell>
                              <TableCell><NivelBadge nivel={m.nivel} /></TableCell>
                              <TableCell className="font-semibold text-blue-600 whitespace-nowrap">{fUSD(m.cc_total)}</TableCell>
                              <TableCell className="text-center text-sm">{m.unidades || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.fees || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.agendas || "—"}</TableCell>
                              <TableCell className="text-center text-sm">{m.agendas_ab || "—"}</TableCell>
                              <TableCell className="text-sm whitespace-nowrap">{m.t_agenda !== null ? fPct(m.t_agenda) : <span className="text-muted-foreground/50 text-xs">sin conv.</span>}</TableCell>
                              <TableCell className="text-sm font-medium text-emerald-600 whitespace-nowrap">{fUSD(m.comisiones)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 font-semibold">
                            <TableCell /><TableCell className="text-xs uppercase text-muted-foreground">Totales</TableCell>
                            <TableCell />
                            <TableCell className="text-blue-600 whitespace-nowrap">{fUSD(setterTotals.cc_total)}</TableCell>
                            <TableCell className="text-center">{setterTotals.unidades || "—"}</TableCell>
                            <TableCell className="text-center">{setterTotals.fees || "—"}</TableCell>
                            <TableCell className="text-center">{setterTotals.agendas || "—"}</TableCell>
                            <TableCell className="text-center">{setterTotals.agendas_ab || "—"}</TableCell>
                            <TableCell />
                            <TableCell className="text-emerald-600 whitespace-nowrap">{fUSD(setterTotals.comisiones)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </section>
        </>
      )}

      {/* CSM + STRIKES */}
      <div className={cn("grid grid-cols-1 gap-6", isManager && "sm:grid-cols-2")}>
        <Card
          onClick={() => setDetalleModal({
            titulo: `CSM · ${csmNombre}`,
            subtitulo: `CC Backend recaudado: ${fUSD(csmCc)} · Comisión (5% flat): ${fUSD(csmComision)}`,
            fuente: "Ventas → Carga de Pagos (Back-End)",
            tipo: "pagos",
            persona: csmNombre,
            rol: "Equipo",
            metrica: "CC Backend CSM",
            subfiltroInicial: "todos",
            todosLosPagos: raw?.team_detalles_pagos?.filter(p => !p.cohort || p.cohort === "BECCU") || [],
          })}
          className="border border-border cursor-pointer transition hover:border-white/30 hover:bg-white/[.02] group/csm"
          title="Click para ver ventas de Backend del CSM"
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">CSM</CardTitle>
              <span className="text-[10px] text-zinc-500 opacity-0 group-hover/csm:opacity-100 transition">ver ventas ↗</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-border">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">{csmInitials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{csmNombre}</p>
                <p className="text-xs text-muted-foreground">Customer Success Manager</p>
                <p className="text-sm text-muted-foreground mt-1">
                  CC Backend: <span className="font-medium text-foreground">{lbLoading ? "..." : csmCc > 0 ? fUSD(csmCc) : "—"}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Comisiones (5%): <span className="font-medium text-emerald-600">{lbLoading ? "..." : csmComision > 0 ? fUSD(csmComision) : "—"}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        {isManager && (
          <Card className="border border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-base font-semibold">Strikes</CardTitle>
                <span className="text-xs text-muted-foreground ml-1">clic en 0 / 1 / 2 para actualizar</span>
              </div>
            </CardHeader>
            <CardContent>
              {strikesLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="space-y-2">
                  {strikes?.map((s) => <StrikeCounter key={s.id} strike={s} />)}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

    </div>
  )
}
