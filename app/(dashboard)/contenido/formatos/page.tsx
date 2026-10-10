"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { ModuleTabs } from "@/components/module-tabs"
import { BancoFormatos } from "@/components/banco-formatos"
import { useSession } from "@/components/session-provider"
import { BarChart3, LayoutGrid } from "lucide-react"

type Fila = { nombre: string; formato?: string; agendas: number; presentadas: number; calificadas: number; cierres: number; cash: number; ultima?: string | null }
type Datos = { desde: string; dias: number; total: number; formatos: Fila[]; piezas: Fila[]; canales: Fila[] }

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%`.replace(".", ",") : "—")
const money = (n: number) => `USD ${Math.round(n).toLocaleString("es-AR")}`

function Veredicto({ f }: { f: Fila }) {
  if (f.agendas < 5) return <span className="inline-block rounded-md bg-white/[.04] px-3 py-1 text-xs italic text-white/40">Poca data</span>
  const cierre = f.presentadas ? f.cierres / f.presentadas : 0
  const show = f.agendas ? f.presentadas / f.agendas : 0
  if (cierre >= 0.3) return <span className="inline-block rounded-md bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">Escalar · cierra {pct(f.cierres, f.presentadas)}</span>
  if (show < 0.25) return <span className="inline-block rounded-md bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-300">Revisar · show {pct(f.presentadas, f.agendas)}</span>
  return <span className="inline-block rounded-md bg-white/[.07] px-3 py-1 text-xs font-semibold text-white/70">Mantener</span>
}

function Tabla({ filas, titulo, sub, conFormato }: { filas: Fila[]; titulo: string; sub: string; conFormato?: boolean }) {
  return <Card className="border-white/10 bg-white/[.035]">
    <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle><p className="text-xs text-muted-foreground">{sub}</p></CardHeader>
    <CardContent className="pt-2">
      <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="hover:bg-transparent">
          <TableHead>{conFormato ? "Pieza (tag de ManyChat)" : "Formato"}</TableHead>{conFormato && <TableHead>Formato</TableHead>}
          <TableHead className="text-right">Agendas</TableHead><TableHead className="text-right">Presentadas</TableHead><TableHead className="text-right">Show</TableHead>
          <TableHead className="text-right">Calificadas</TableHead><TableHead className="text-right">Cierres</TableHead><TableHead className="text-right">Cierre</TableHead>
          <TableHead className="text-right">Cash día 1</TableHead><TableHead>Última agenda</TableHead><TableHead>Qué hacer</TableHead>
        </TableRow></TableHeader>
        <TableBody>{filas.map((f) => <TableRow key={f.nombre + (f.formato || "")}>
          <TableCell className={cn("font-bold", conFormato && "max-w-[420px] whitespace-normal")}>{f.nombre}</TableCell>
          {conFormato && <TableCell className="text-muted-foreground">{f.formato}</TableCell>}
          <TableCell className="text-right">{f.agendas}</TableCell><TableCell className="text-right">{f.presentadas}</TableCell><TableCell className="text-right">{pct(f.presentadas, f.agendas)}</TableCell>
          <TableCell className="text-right">{f.calificadas}</TableCell><TableCell className="text-right font-semibold">{f.cierres}</TableCell><TableCell className="text-right">{pct(f.cierres, f.presentadas)}</TableCell>
          <TableCell className="text-right">{f.cash ? money(f.cash) : "—"}</TableCell><TableCell className="text-muted-foreground">{f.ultima ? f.ultima.split("-").reverse().join("/") : "—"}</TableCell>
          <TableCell><Veredicto f={f} /></TableCell>
        </TableRow>)}</TableBody>
      </Table></div>
    </CardContent>
  </Card>
}

// La pantalla tiene dos pestañas: el rendimiento medido de cada formato (lo que ya existía) y el
// catálogo editable con las referencias visuales (solo el admin lo modifica).
function RendimientoFormatos() {
  const [dias, setDias] = useState(90)
  const { data, error, isLoading } = useSWR<Datos>(`/api/formatos?dias=${dias}`, fetcher)
  return <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-5 sm:px-6 lg:px-[1.5cm]">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-black">Rendimiento por formato</h2><p className="max-w-3xl text-sm text-muted-foreground">Qué tipo de pieza y qué pieza concreta traen agendas, llamadas presentadas y ventas. Sale del cruce de cada agenda con su contacto de ManyChat (el tag de la pieza que la trajo).</p></div>
      <div className="flex gap-2">{[30, 90, 180, 365].map((d) => <button key={d} type="button" onClick={() => setDias(d)} className={cn("rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide", dias === d ? "border-white bg-white text-black" : "border-white/15 text-white/60 hover:bg-white/5")}>{d} días</button>)}</div>
    </div>
    {error && <p className="text-sm text-red-300">No se pudo cargar: {String(error)}</p>}
    {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
    {data && <>
      <p className="text-xs text-muted-foreground">{data.total} agendas desde el {data.desde.split("-").reverse().join("/")}. "Poca data" = menos de 5 agendas en esa fila.</p>
      <Tabla filas={data.formatos} titulo="Por tipo de pieza" sub="Reel, carrusel, historia, webinar, ads, nuevo seguidor. Las agendas sin pieza identificada no tienen contacto de ManyChat cruzado." />
      <Tabla filas={data.piezas} titulo="Las piezas concretas que más cierran" sub="Cada fila es un contenido real (el tag que ManyChat le puso al lead). Ordenado por cierres y agendas." conFormato />
      <Tabla filas={data.canales} titulo="Por canal de origen" sub="Agrupa la fuente de la agenda: Instagram orgánico, ads, webinar, outbound, referidos." />
    </>}
  </div>
}

// El editor entra para ver las referencias de cada formato. La pestaña de rendimiento no se le
// muestra: tiene cash collected y tasas de cierre, que no son parte de su trabajo.
export default function FormatosPage() {
  const { rol } = useSession()
  const esEditor = rol === "Editor"
  const tabs = [
    { id: "catalogo", label: "Catálogo", hint: "formatos y sus referencias", icon: <LayoutGrid className="h-4 w-4" />, content: <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-[1.5cm]"><BancoFormatos /></div> },
    ...(esEditor ? [] : [{ id: "rendimiento", label: "Rendimiento", hint: "qué formato trae ventas", icon: <BarChart3 className="h-4 w-4" />, content: <RendimientoFormatos /> }]),
  ]
  return <ModuleTabs
    title="Formatos"
    subtitle={esEditor
      ? "El catálogo de formatos con la referencia de cómo se ve cada uno"
      : "Qué rinde cada formato y el catálogo con la referencia de cómo se ve cada uno"}
    tabs={tabs}
  />
}
