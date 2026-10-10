"use client"

import Link from "next/link"
import { useEffect, useRef, type ReactNode } from "react"
import { ArrowUpRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLOR_ANGULO, COLOR_ESTADO, ZONAS, fechaCorta, horaArt, nombreVisible, numero, usd, type CiudadVista, type Seleccion, type Zona } from "./tipos"

// Panel de la ciudad: lo que se ve en 3D, con los registros exactos. Cada lista trae todos los registros que
// devuelve la API (hasta 200 por grupo) y marca el que se tocó en la escena.

const DIC: Record<Zona, string[]> = {
  contenido: ["isla.leads", "isla.agendas", "isla.flujo", "isla.instagram", "isla.preview"],
  captacion: ["captacion.hoy"],
  espera: ["espera"],
  setters: ["setters.conversando", "setters.conversaciones_mes", "setters.agendas"],
  agendas: ["agendas.estado"],
  closers: ["agendas.estado"],
  seguimiento: ["seguimiento"],
  clientes: ["clientes.nuevos", "clientes.cuotas"],
  formacion: ["formacion.actividad"],
}

function Chip({ children, color, tenue }: { children: ReactNode; color?: string; tenue?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] tabular-nums", tenue ? "border-border/60 text-muted-foreground" : "border-border bg-muted/40")}>
      {color ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} /> : null}
      {children}
    </span>
  )
}

function Fila({ activa, children, onClick }: { activa?: boolean; children: ReactNode; onClick?: () => void }) {
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => { if (activa) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }) }, [activa])
  return (
    <li ref={ref} onClick={onClick} className={cn("rounded-lg border px-3 py-2 text-sm transition-colors", onClick && "cursor-pointer hover:bg-muted/50", activa ? "border-violet-400 bg-violet-500/10" : "border-border/60")}>
      {children}
    </li>
  )
}

function Lista({ titulo, total, mostrados, children }: { titulo: string; total: number; mostrados: number; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{titulo}</span>
        <span className="tabular-nums normal-case tracking-normal">{mostrados < total ? `${numero(mostrados)} de ${numero(total)}` : numero(total)}</span>
      </h4>
      {total === 0 ? <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">Sin registros.</p> : <ul className="space-y-1.5">{children}</ul>}
    </section>
  )
}

export function Definiciones({ datos, zona }: { datos: CiudadVista; zona: Zona }) {
  const items = datos.diccionario.filter((d) => DIC[zona].includes(d.id))
  return (
    <details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none font-medium">Qué cuenta y de dónde sale</summary>
      <dl className="mt-2 space-y-2">
        {items.map((d) => (
          <div key={d.id}>
            <dt className="font-medium">{d.nombre} <span className={cn("ml-1 rounded px-1 text-[10px]", d.estado === "real" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : d.estado === "parcial" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-rose-500/15 text-rose-700 dark:text-rose-300")}>{d.estado}</span></dt>
            <dd className="text-muted-foreground">{d.formula}. Fuente: {d.fuente}.{d.nota ? ` ${d.nota}` : ""}</dd>
          </div>
        ))}
        {zona === "agendas" || zona === "closers" ? (
          <div className="space-y-1 pt-1">
            {Object.entries(datos.estados).map(([k, e]) => (
              <div key={k} className="flex gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_ESTADO[k as keyof typeof COLOR_ESTADO] }} /><span><b>{e.label}:</b> <span className="text-muted-foreground">{e.regla}</span></span></div>
            ))}
          </div>
        ) : null}
      </dl>
    </details>
  )
}

export function DetalleZona({ datos, zona, idSel, nombres, onSeleccion }: { datos: CiudadVista; zona: Zona; idSel?: string; nombres: boolean; onSeleccion: (s: Seleccion) => void }) {
  const n = (s: string) => nombreVisible(s, nombres)
  const sel = (id: string) => () => onSeleccion({ zona, id })

  if (zona === "contenido") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip>{datos.islas.length} piezas en {datos.contenido.dias} días</Chip>
          <Chip tenue>desde {fechaCorta(datos.contenido.desde)}</Chip>
          {Object.entries(COLOR_ANGULO).map(([a, c]) => <Chip key={a} color={c} tenue>{a}</Chip>)}
        </div>
        <Lista titulo="Piezas (más nuevas primero)" total={datos.islas.length} mostrados={datos.islas.length}>
          {datos.islas.map((i) => (
            <Fila key={i.id} activa={idSel === i.id} onClick={sel(i.id)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium"><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: COLOR_ANGULO[i.angulo || ""] || "#B8B0D8" }} />{i.nombre}</div>
                  <div className="text-xs text-muted-foreground">{i.categoria || "Pieza"} · {fechaCorta(i.fecha)}{i.angulo ? ` · ${i.angulo}` : ""}</div>
                </div>
                {i.preview?.url ? <a href={i.preview.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-xs text-violet-600 hover:underline dark:text-violet-300">Ver <ArrowUpRight className="inline h-3 w-3" /></a> : null}
              </div>
              <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-[11px] tabular-nums">
                {[["leads", i.leads], ["hoy", i.hoy], ["7 días", i.semana], ["agendas", i.agendas], ["cierres", i.cierres]].map(([k, v]) => (
                  <div key={k as string} className="rounded bg-muted/40 py-0.5"><div className="font-semibold">{numero(v as number | null)}</div><div className="text-[10px] text-muted-foreground">{k}</div></div>
                ))}
              </div>
              {i.etiqueta ? <div className="mt-1 truncate text-[10px] text-muted-foreground">Etiqueta: {i.etiqueta}</div> : <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">Sin etiqueta de ManyChat: leads y agendas N/D.</div>}
              {i.ig?.alcance ? (
                <div className="mt-1.5 rounded bg-violet-500/10 px-2 py-1 text-[11px]">
                  <span className="font-semibold">Instagram:</span> {numero(i.ig.alcance)} alcanzados · {numero(i.ig.vistas)} vistas · {numero(i.ig.guardados)} guardados · {numero(i.ig.compartidos)} compartidos{i.ig.seguidores !== null ? ` · ${numero(i.ig.seguidores)} seguidores` : ""}
                  {i.leads !== null ? <span className="block font-semibold text-violet-700 dark:text-violet-300">{((i.leads / i.ig.alcance) * 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} leads cada 1.000 alcanzados</span> : null}
                </div>
              ) : null}
              {i.preview ? <div className="text-[10px] text-muted-foreground">Post: {i.preview.vinculo}</div> : null}
            </Fila>
          ))}
        </Lista>
        {datos.contenido.piezas_fuera_de_ventana ? <p className="text-xs text-muted-foreground">{datos.contenido.piezas_fuera_de_ventana} etiquetas de piezas más viejas (o sin fecha) siguen sumando contactos: están en Ángulos, no se dibujan como islas.</p> : null}
      </div>
    )
  }

  if (zona === "captacion" || zona === "espera") {
    const lista = zona === "captacion" ? datos.captacion.lista : datos.espera.lista
    const total = zona === "captacion" ? datos.captacion.hoy : datos.espera.total
    return (
      <div className="space-y-3">
        {zona === "captacion" ? (
          <div className="flex items-end gap-1" aria-label="Contactos nuevos por día">
            {datos.captacion.por_dia.map((d) => {
              const max = Math.max(...datos.captacion.por_dia.map((x) => x.n), 1)
              return (
                <div key={d.dia} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted-foreground">{d.n}</span>
                  <div className="w-full rounded-t bg-[#E1306C]/80" style={{ height: `${Math.max(4, (d.n / max) * 56)}px` }} />
                  <span className="text-[10px] text-muted-foreground">{fechaCorta(d.dia)}</span>
                </div>
              )
            })}
          </div>
        ) : null}
        <Lista titulo={zona === "captacion" ? "Entraron hoy" : "Esperando (sin ASIGNADO ni agenda)"} total={total} mostrados={lista.length}>
          {lista.map((p) => (
            <Fila key={p.id} activa={idSel === p.id} onClick={sel(p.id)}>
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{n(p.nombre)}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{zona === "captacion" ? horaArt(p.desde) : `${fechaCorta(p.desde?.slice(0, 10))} ${horaArt(p.desde)}`}</span></div>
              <div className="truncate text-xs text-muted-foreground">{nombres && p.ig ? `@${p.ig} · ` : ""}{p.origen ? `entró por ${p.origen}` : "sin pieza identificada"}</div>
            </Fila>
          ))}
        </Lista>
      </div>
    )
  }

  if (zona === "setters") {
    return (
      <div className="space-y-3">
        <Lista titulo="Equipo de setting" total={datos.setters.equipo.length} mostrados={datos.setters.equipo.length}>
          {datos.setters.equipo.map((s) => (
            <Fila key={s.nombre} activa={idSel === s.nombre}>
              <div className="flex justify-between gap-2"><span className={cn("font-medium", !s.en_equipo && "italic text-muted-foreground")}>{s.nombre}{s.en_equipo ? "" : " (no figura en el equipo)"}</span></div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Chip>{s.agendas_hoy} agendas hoy</Chip><Chip>{s.agendas_7d} en 7 días</Chip><Chip tenue>{numero(s.conversaciones_mes)} conversaciones en el mes</Chip>
              </div>
            </Fila>
          ))}
        </Lista>
        <Lista titulo="En conversación (ASIGNADO, sin agenda)" total={datos.setters.conversando.total} mostrados={datos.setters.conversando.lista.length}>
          {datos.setters.conversando.lista.map((p) => (
            <Fila key={p.id} activa={idSel === p.id} onClick={sel(p.id)}>
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{n(p.nombre)}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fechaCorta(p.desde?.slice(0, 10))}</span></div>
              <div className="truncate text-xs text-muted-foreground">{p.origen ? `entró por ${p.origen}` : "sin pieza identificada"}</div>
            </Fila>
          ))}
        </Lista>
      </div>
    )
  }

  if (zona === "agendas" || zona === "closers") {
    const carriles = zona === "closers" && idSel ? datos.agendas.carriles.filter((c) => c.closer === idSel) : datos.agendas.carriles
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(datos.agendas.por_estado).filter(([, v]) => v > 0).map(([k, v]) => <Chip key={k} color={COLOR_ESTADO[k as keyof typeof COLOR_ESTADO]}>{datos.estados[k as keyof typeof datos.estados].label} · {v}</Chip>)}
          {datos.agendas.total === 0 ? <Chip tenue>Sin calls este día</Chip> : null}
        </div>
        {zona === "closers" ? (
          <div className="grid gap-1.5">
            {datos.closers.filter((c) => !idSel || c.nombre === idSel).map((c) => (
              <div key={c.nombre} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                <div className={cn("font-medium", !c.en_equipo && "italic text-muted-foreground")}>{c.nombre}{c.en_equipo ? "" : " (no figura en el equipo)"}</div>
                <div className="mt-1 flex flex-wrap gap-1.5"><Chip>{c.llamadas} calls</Chip><Chip>{c.presentadas} presentadas</Chip><Chip>{c.no_show} no show</Chip><Chip>{c.cerradas} cerradas (agenda)</Chip></div>
                <div className="mt-1 text-xs text-muted-foreground">{c.en_horario ? `En horario: ${c.en_horario.hora} con ${n(c.en_horario.nombre)}` : c.proxima ? `Próxima: ${c.proxima.hora} con ${n(c.proxima.nombre)}` : "Sin llamadas en horario. El CRM no tiene estado en vivo de la llamada."}</div>
              </div>
            ))}
          </div>
        ) : null}
        {carriles.map((c) => (
          <Lista key={c.closer} titulo={c.closer} total={c.sillas.length} mostrados={c.sillas.length}>
            {c.sillas.map((s) => (
              <Fila key={s.id} activa={idSel === s.id} onClick={() => onSeleccion({ zona: "agendas", id: s.id })}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium"><span className="mr-2 tabular-nums text-muted-foreground">{s.hora}</span>{n(s.nombre)}</span>
                  <Chip color={COLOR_ESTADO[s.estado]}>{datos.estados[s.estado].label}</Chip>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[s.setter && `setter ${s.setter}`, s.calificacion, s.fuente].filter(Boolean).join(" · ") || "sin datos de setting"}
                  {s.fathom ? <> · <a href={s.fathom} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-violet-600 hover:underline dark:text-violet-300">Fathom</a></> : null}
                </div>
              </Fila>
            ))}
          </Lista>
        ))}
      </div>
    )
  }

  if (zona === "seguimiento") {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(datos.seguimiento.por_estado).map(([k, v]) => <Chip key={k}>{k} · {v}</Chip>)}
          <Chip color="#F77737">{datos.seguimiento.vencidos} FUP vencido</Chip>
          <Chip color="#B8B0D8">{datos.seguimiento.sin_fecha} sin próximo FUP</Chip>
        </div>
        <Lista titulo="Leads en seguimiento" total={datos.seguimiento.total} mostrados={datos.seguimiento.lista.length}>
          {datos.seguimiento.lista.map((s) => (
            <Fila key={s.id} activa={idSel === String(s.id)} onClick={sel(String(s.id))}>
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{n(s.nombre)}</span><span className={cn("shrink-0 text-xs tabular-nums", s.vencido ? "font-semibold text-orange-600 dark:text-orange-300" : "text-muted-foreground")}>{s.proximo_fup ? `FUP ${fechaCorta(String(s.proximo_fup).slice(0, 10))}` : "sin FUP"}</span></div>
              <div className="truncate text-xs text-muted-foreground">{[s.closer, s.estado, s.situacion, s.etapa, s.fups ? `${s.fups} FUP${s.fups === 1 ? "" : "s"} hechos` : null, s.fecha_call ? `call ${fechaCorta(String(s.fecha_call).slice(0, 10))}` : null].filter(Boolean).join(" · ")}</div>
            </Fila>
          ))}
        </Lista>
      </div>
    )
  }

  if (zona === "clientes") {
    const nuevos = datos.clientes.lista.filter((c) => c.nuevo)
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5"><Chip>{datos.clientes.total} clientes activos</Chip><Chip color="#22A37A">{datos.clientes.nuevos_30d} entraron en 30 días</Chip><Chip color="#E1306C">{datos.clientes.cuotas_vencidas.total} cuotas vencidas · {usd(datos.clientes.cuotas_vencidas.monto)}</Chip></div>
        <Lista titulo="Onboarding (entraron en 30 días)" total={nuevos.length} mostrados={nuevos.length}>
          {nuevos.map((c) => (
            <Fila key={c.id} activa={idSel === String(c.id)} onClick={sel(String(c.id))}>
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{n(c.nombre)}</span><span className="shrink-0 text-xs tabular-nums text-muted-foreground">entró {fechaCorta(String(c.fecha_ingreso || "").slice(0, 10))}</span></div>
              <div className="mt-1 flex flex-wrap gap-1">
                <Chip tenue>{c.accesos.onboarding ? "✓" : "—"} onboarding</Chip><Chip tenue>{c.accesos.discord ? "✓" : "—"} Discord</Chip><Chip tenue>{c.accesos.skool ? "✓" : "—"} Skool</Chip>
              </div>
            </Fila>
          ))}
        </Lista>
        <Lista titulo="Cuotas vencidas sin pago" total={datos.clientes.cuotas_vencidas.total} mostrados={datos.clientes.cuotas_vencidas.lista.length}>
          {datos.clientes.cuotas_vencidas.lista.map((c) => (
            <Fila key={c.id}>
              <div className="flex justify-between gap-2"><span className="truncate font-medium">{n(c.cliente || "Sin nombre")}</span><span className="shrink-0 text-xs tabular-nums">{usd(c.monto)}</span></div>
              <div className="text-xs text-muted-foreground">venció {fechaCorta(String(c.fecha || "").slice(0, 10))}{c.cuota !== null ? ` · cuota ${c.cuota}` : ""}</div>
            </Fila>
          ))}
        </Lista>
        <Link href="/recordatorios" className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-300">Cobros y cuotas <ArrowUpRight className="h-3 w-3" /></Link>
      </div>
    )
  }

  // formación
  return (
    <div className="space-y-3">
      {datos.formacion.disponible ? null : <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">{datos.formacion.motivo}</p>}
      <Lista titulo="Alumnos (clientes activos)" total={datos.clientes.total} mostrados={datos.clientes.lista.length}>
        {datos.clientes.lista.map((c) => (
          <Fila key={c.id} activa={idSel === String(c.id)} onClick={sel(String(c.id))}>
            <div className="flex justify-between gap-2"><span className="truncate font-medium">{n(c.nombre)}</span><span className="shrink-0 text-xs text-muted-foreground">actividad N/D</span></div>
            <div className="truncate text-xs text-muted-foreground">{[c.estado, c.fecha_ingreso ? `entró ${fechaCorta(String(c.fecha_ingreso).slice(0, 10))}` : null].filter(Boolean).join(" · ")}</div>
          </Fila>
        ))}
      </Lista>
    </div>
  )
}

export function Resumen({ datos, onSeleccion }: { datos: CiudadVista; onSeleccion: (s: Seleccion) => void }) {
  const filas: Array<[Zona, string, string]> = [
    ["contenido", `${datos.islas.length} piezas`, `${datos.contenido.dias} días · ${datos.islas.filter((i) => i.preview).length} con vista previa`],
    ["captacion", `${numero(datos.captacion.hoy)} hoy`, `ayer ${numero(datos.captacion.ayer)} · 7 días ${numero(datos.captacion.semana)}`],
    ["espera", numero(datos.espera.total), "sin asignar ni agendar, 7 días"],
    ["setters", `${numero(datos.setters.conversando.total)} conversando`, `${datos.setters.equipo.reduce((t, s) => t + s.agendas_7d, 0)} agendas en 7 días`],
    ["agendas", `${datos.agendas.total} calls`, `día ${fechaCorta(datos.dia)}`],
    ["closers", `${datos.closers.filter((c) => c.en_equipo).length} en el equipo`, `${datos.closers.reduce((t, c) => t + c.presentadas, 0)} presentadas en el día`],
    ["seguimiento", numero(datos.seguimiento.total), `${datos.seguimiento.vencidos} vencidos · ${datos.seguimiento.sin_fecha} sin fecha`],
    ["clientes", `${datos.clientes.nuevos_30d} nuevos`, `${datos.clientes.cuotas_vencidas.total} cuotas vencidas`],
    ["formacion", `${numero(datos.formacion.alumnos)} alumnos`, datos.formacion.disponible ? "con actividad" : "actividad no disponible"],
  ]
  return (
    <div className="space-y-3">
      {datos.avisos.length ? <ul className="space-y-1">{datos.avisos.map((a) => <li key={a} className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs">{a}</li>)}</ul> : null}
      <ul className="space-y-1.5">
        {filas.map(([z, v, d]) => (
          <li key={z}>
            <button type="button" onClick={() => onSeleccion({ zona: z })} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ZONAS[z].color }} /><span className="font-medium">{ZONAS[z].titulo}</span></span>
              <span className="text-right"><span className="block font-semibold tabular-nums">{v}</span><span className="block text-[11px] text-muted-foreground">{d}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PanelZona({ datos, seleccion, nombres, onSeleccion }: { datos: CiudadVista; seleccion: Seleccion; nombres: boolean; onSeleccion: (s: Seleccion) => void }) {
  if (!seleccion) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Resumen de la ciudad</h3>
          <p className="text-xs text-muted-foreground">Tocá un edificio, una isla o una persona para ver los registros.</p>
        </div>
        <Resumen datos={datos} onSeleccion={onSeleccion} />
      </div>
    )
  }
  const z = ZONAS[seleccion.zona]
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: z.color }} />{z.titulo}</h3>
        <button type="button" onClick={() => onSeleccion(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Volver al resumen"><X className="h-4 w-4" /></button>
      </div>
      <Definiciones datos={datos} zona={seleccion.zona} />
      <DetalleZona datos={datos} zona={seleccion.zona} idSel={seleccion.id} nombres={nombres} onSeleccion={onSeleccion} />
      {z.ruta ? <Link href={z.ruta.href} className="inline-flex items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-300">{z.ruta.label} <ArrowUpRight className="h-3 w-3" /></Link> : null}
    </div>
  )
}

export function Diccionario({ datos }: { datos: CiudadVista }) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="px-3 py-2">Métrica</th><th className="px-3 py-2">Cómo se calcula</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2">Estado</th></tr>
          </thead>
          <tbody>
            {datos.diccionario.map((d) => (
              <tr key={d.id} className="border-t align-top">
                <td className="px-3 py-2 font-medium">{d.nombre}</td>
                <td className="px-3 py-2 text-muted-foreground">{d.formula}{d.nota ? <span className="mt-1 block text-xs">{d.nota}</span> : null}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{d.fuente}</td>
                <td className="px-3 py-2"><Chip>{d.estado}</Chip></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-2">Estado de una silla</th><th className="px-3 py-2">Regla</th></tr></thead>
          <tbody>
            {Object.entries(datos.estados).map(([k, e]) => (
              <tr key={k} className="border-t"><td className="px-3 py-2"><Chip color={COLOR_ESTADO[k as keyof typeof COLOR_ESTADO]}>{e.label}</Chip></td><td className="px-3 py-2 text-muted-foreground">{e.regla}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
