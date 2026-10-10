"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, Box, ChevronLeft, ChevronRight, EyeOff, Eye, Loader2, Maximize, Pause, Play, RefreshCw, Table2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLOR_ANGULO, COLOR_ESTADO, ZONAS, horaArt, numero, type CiudadVista, type Seleccion, type Zona } from "./tipos"
import { DetalleZona, Diccionario, PanelZona, Definiciones } from "./panel"
import type { Llegada } from "./escena"

const Escena = dynamic(() => import("./escena"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-[#6E6590]"><Loader2 className="h-5 w-5 animate-spin" /></div>,
})

type Modo = "ciudad" | "tabla" | "diccionario"
type Orden = "contactos" | "recientes"
const PANEL = 380
const sumarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)

function leer(clave: string, def: boolean) { try { const v = localStorage.getItem(clave); return v === null ? def : v === "1" } catch { return def } }
function guardar(clave: string, v: boolean) { try { localStorage.setItem(clave, v ? "1" : "0") } catch { /* sin almacenamiento */ } }
function hayWebGL() { try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")) } catch { return false } }

// franja de zonas: el resumen de toda la ciudad en una línea, accesible sin el lienzo
function Franja({ datos, seleccion, onSeleccion }: { datos: CiudadVista; seleccion: Seleccion; onSeleccion: (s: Seleccion) => void }) {
  const items: Array<[Zona, string]> = [
    ["contenido", `${datos.islas.length} piezas`], ["captacion", `${numero(datos.captacion.hoy)} hoy`], ["espera", numero(datos.espera.total)],
    ["setters", `${numero(datos.setters.conversando.total)} conv.`], ["agendas", `${datos.agendas.total} call${datos.agendas.total === 1 ? "" : "s"}`],
    ["closers", `${datos.closers.filter((c) => c.en_equipo).length} closers`], ["seguimiento", numero(datos.seguimiento.total)],
    ["clientes", `${datos.clientes.nuevos_30d} nuevos`], ["formacion", `${numero(datos.formacion.alumnos)} alumnos`],
  ]
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {items.map(([z, v]) => (
        <button key={z} type="button" onClick={() => onSeleccion(seleccion?.zona === z && !seleccion.id ? null : { zona: z })}
          className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500",
            seleccion?.zona === z ? "border-violet-500 bg-violet-600 text-white" : "border-border bg-card hover:bg-muted")}>
          <span className="h-2 w-2 rounded-full" style={{ background: ZONAS[z].color }} />
          <span className="font-medium">{ZONAS[z].titulo.split(" · ")[0]}</span>
          <span className={cn("tabular-nums", seleccion?.zona === z ? "text-white/85" : "text-muted-foreground")}>{v}</span>
        </button>
      ))}
    </div>
  )
}

export function VistaCiudad({ datos, dia, onDia, cargando, onRecargar }: { datos: CiudadVista; dia: string; onDia: (d: string) => void; cargando?: boolean; onRecargar?: () => void }) {
  const [seleccion, setSeleccion] = useState<Seleccion>(null)
  const [modo, setModo] = useState<Modo>("ciudad")
  const [animar, setAnimar] = useState(true)
  const [nombres, setNombres] = useState(true)
  const [webgl, setWebgl] = useState(true)
  const [ancho, setAncho] = useState(false)
  const [vistaToken, setVistaToken] = useState(0)
  const [orden, setOrden] = useState<Orden>("contactos")
  const [pagina, setPagina] = useState(0)
  const [llegadas, setLlegadas] = useState<Llegada[]>([])
  const vistos = useRef<Set<string> | null>(null)

  useEffect(() => {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const mq = window.matchMedia("(min-width: 1024px)")
    const ok = hayWebGL()
    const t = setTimeout(() => {
      setAnimar(leer("ciudad.animar", !reducido) && !reducido)
      setNombres(leer("ciudad.nombres", true))
      setWebgl(ok)
      if (!ok) setModo("tabla")
      setAncho(mq.matches)
    }, 0)
    const f = () => setAncho(mq.matches)
    mq.addEventListener("change", f)
    return () => { clearTimeout(t); mq.removeEventListener("change", f) }
  }, [])

  // contactos nuevos que trajo la última actualización: caminan una vez hasta el portal (solo con animación encendida)
  useEffect(() => {
    const ids = new Set(datos.captacion.lista.map((p) => p.id))
    const antes = vistos.current
    vistos.current = ids
    if (!antes || !animar) return
    const nuevos = datos.captacion.lista.filter((p) => !antes.has(p.id)).slice(0, 8).map((p) => ({ id: p.id, nombre: p.nombre, isla: p.isla }))
    if (nuevos.length) { const t = setTimeout(() => setLlegadas((l) => [...l, ...nuevos]), 0); return () => clearTimeout(t) }
  }, [datos.captacion.lista, animar])

  const islasOrdenadas = useMemo(() => {
    const l = [...datos.islas]
    if (orden === "contactos") l.sort((a, b) => (b.semana ?? -1) - (a.semana ?? -1) || String(b.fecha || "").localeCompare(String(a.fecha || "")))
    return l
  }, [datos.islas, orden])
  const paginas = Math.max(1, Math.ceil(islasOrdenadas.length / 4))
  const pag = Math.min(pagina, paginas - 1)
  const islasVisibles = islasOrdenadas.slice(pag * 4, pag * 4 + 4)

  const cambiarAnimar = () => { setAnimar((v) => { guardar("ciudad.animar", !v); return !v }) }
  const cambiarNombres = () => { setNombres((v) => { guardar("ciudad.nombres", !v); return !v }) }
  const esHoy = dia === datos.hoy
  const panelAbierto = Boolean(seleccion) && ancho

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Datos reales · corte {horaArt(datos.corte)}
        </span>
        <span className="text-xs text-muted-foreground">Sin demo ni repeticiones: cada persona es un registro del CRM.</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border">
            <button type="button" className="p-1.5 hover:bg-muted" onClick={() => onDia(sumarDias(dia, -1))} aria-label="Día anterior"><ChevronLeft className="h-4 w-4" /></button>
            <label className="sr-only" htmlFor="ciudad-dia">Día de las agendas</label>
            <input id="ciudad-dia" type="date" value={dia} onChange={(e) => e.target.value && onDia(e.target.value)} className="bg-transparent px-1 text-xs tabular-nums outline-none" />
            <button type="button" className="p-1.5 hover:bg-muted" onClick={() => onDia(sumarDias(dia, 1))} aria-label="Día siguiente"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {!esHoy ? <button type="button" onClick={() => onDia(datos.hoy)} className="rounded-lg border px-2 py-1 text-xs hover:bg-muted">Hoy</button> : null}
          <button type="button" onClick={cambiarNombres} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted" aria-pressed={!nombres}>
            {nombres ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{nombres ? "Ocultar nombres" : "Mostrar nombres"}
          </button>
          <button type="button" onClick={cambiarAnimar} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted" aria-pressed={animar}>
            {animar ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{animar ? "Pausar" : "Animar"}
          </button>
          {onRecargar ? <button type="button" onClick={onRecargar} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs hover:bg-muted" disabled={cargando}><RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} />Actualizar</button> : null}
          <div className="inline-flex rounded-lg border p-0.5">
            {([["ciudad", Box, "Ciudad"], ["tabla", Table2, "Tabla"], ["diccionario", BookOpen, "Diccionario"]] as const).map(([m, Icono, label]) => (
              <button key={m} type="button" onClick={() => setModo(m)} disabled={m === "ciudad" && !webgl} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", modo === m ? "bg-violet-600 text-white" : "hover:bg-muted", m === "ciudad" && !webgl && "opacity-40")}>
                <Icono className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {!webgl ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">Este navegador no tiene WebGL: la ciudad se muestra como tabla, con los mismos datos.</p> : null}

      {modo === "ciudad" ? (
        <>
          <Franja datos={datos} seleccion={seleccion} onSeleccion={setSeleccion} />
          {datos.avisos.length ? <div className="flex flex-wrap gap-1.5">{datos.avisos.map((a) => <span key={a} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs">{a}</span>)}</div> : null}
          <div className="relative h-[68vh] min-h-[480px] overflow-hidden rounded-2xl border border-violet-200/70 bg-[#F1EDFF] lg:h-[calc(100dvh-250px)] dark:border-violet-400/20">
            <Escena datos={datos} islas={islasVisibles} seleccion={seleccion} onSeleccion={setSeleccion} animar={animar} nombres={nombres}
              panel={panelAbierto ? PANEL + 12 : 0} vistaToken={vistaToken} llegadas={llegadas} onLlegadaFin={(id) => setLlegadas((l) => l.filter((x) => x.id !== id))} />
            <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setVistaToken((t) => t + 1)} className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white/95 px-2 py-1 text-xs font-medium text-[#20265F] shadow-sm hover:border-violet-400">
                <Maximize className="h-3.5 w-3.5" />Vista general
              </button>
              <div className="pointer-events-auto inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white/95 px-1 py-0.5 text-xs text-[#20265F] shadow-sm">
                <span className="px-1 font-medium">Islas</span>
                <button type="button" className="rounded p-0.5 hover:bg-violet-100 disabled:opacity-30" disabled={pag === 0} onClick={() => setPagina(pag - 1)} aria-label="Islas anteriores"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <span className="tabular-nums">{datos.islas.length ? `${pag * 4 + 1}–${Math.min(datos.islas.length, pag * 4 + 4)} de ${datos.islas.length}` : "sin piezas"}</span>
                <button type="button" className="rounded p-0.5 hover:bg-violet-100 disabled:opacity-30" disabled={pag >= paginas - 1} onClick={() => setPagina(pag + 1)} aria-label="Islas siguientes"><ChevronRight className="h-3.5 w-3.5" /></button>
                <label className="sr-only" htmlFor="ciudad-orden">Orden de las islas</label>
                <select id="ciudad-orden" value={orden} onChange={(e) => { setOrden(e.target.value as Orden); setPagina(0) }} className="rounded bg-transparent px-1 py-0.5 text-xs outline-none">
                  <option value="contactos">más contactos (7 días)</option>
                  <option value="recientes">más recientes</option>
                </select>
              </div>
            </div>
            {cargando ? <div className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 shadow"><Loader2 className="h-4 w-4 animate-spin text-violet-600" /></div> : null}
            <details className="absolute bottom-3 left-3 max-w-[calc(100%-24px)] rounded-xl border border-violet-200/80 bg-white/92 px-3 py-2 text-[11px] text-[#20265F] shadow-sm backdrop-blur">
              <summary className="cursor-pointer select-none font-semibold">Leyenda</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="mb-1 font-medium text-[#6E6590]">Islas · ángulo de la pieza</div>
                  {Object.entries(COLOR_ANGULO).map(([a, c]) => <div key={a} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{a}</div>)}
                  <div className="mt-1 max-w-[220px] text-[#6E6590]">Por las cintas bajan los últimos contactos que entraron por cada pieza.</div>
                </div>
                <div>
                  <div className="mb-1 font-medium text-[#6E6590]">Sillas · estado de la call</div>
                  {Object.entries(datos.estados).map(([k, e]) => <div key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COLOR_ESTADO[k as keyof typeof COLOR_ESTADO] }} />{e.label}</div>)}
                </div>
              </div>
              <div className="mt-2 max-w-[440px] text-[#6E6590]">Cada persona es un registro real de esa etapa; los que caminan muestran el recorrido (Captación → Espera → Setters, Closers → Seguimiento → Clientes → Formación) y se repiten en bucle. Los totales exactos están en los carteles. Azul oscuro = equipo. «Pausar» congela todo. Arrastrá para moverte; rueda o pellizco para acercar.</div>
            </details>
            {panelAbierto ? (
              <aside className="absolute bottom-3 right-3 top-3 w-[380px] overflow-y-auto rounded-2xl border bg-card p-4 shadow-xl">
                <PanelZona datos={datos} seleccion={seleccion} nombres={nombres} onSeleccion={setSeleccion} />
              </aside>
            ) : null}
          </div>
          {!ancho && seleccion ? (
            <aside className="rounded-2xl border bg-card p-4"><PanelZona datos={datos} seleccion={seleccion} nombres={nombres} onSeleccion={setSeleccion} /></aside>
          ) : null}
        </>
      ) : null}

      {modo === "tabla" ? (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(ZONAS) as Zona[]).map((z) => (
            <section key={z} className="max-h-[560px] space-y-3 overflow-y-auto rounded-2xl border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ZONAS[z].color }} />{ZONAS[z].titulo}</h3>
              <Definiciones datos={datos} zona={z} />
              <DetalleZona datos={datos} zona={z} nombres={nombres} onSeleccion={() => {}} />
            </section>
          ))}
        </div>
      ) : null}

      {modo === "diccionario" ? <Diccionario datos={datos} /> : null}
    </div>
  )
}
