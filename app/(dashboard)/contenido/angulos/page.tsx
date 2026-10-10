"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type Ig = { url: string | null; producto: string | null; alcance: number | null; vistas: number | null; guardados: number | null; compartidos: number | null; interacciones: number | null; seguidores: number | null; visitas_perfil: number | null; tiempo_promedio_ms: number | null; leido_at: string; vinculo: string }
type IgAngulo = { piezas: number; piezas_total: number; alcance: number; vistas: number; guardados: number; compartidos: number; seguidores: number; leads: number; agendas: number; cierres: number; cash: number }
type Fila = { nombre: string; tag?: string; angulo?: string; formato?: string; categoria?: string; fecha?: string | null; leads: number; nuevos: number; agendas: number; presentadas: number; calificadas: number; cierres: number; cash: number; ultima: string | null; ig?: Ig | null; igAngulo?: IgAngulo | null }
type Datos = {
  desde: string; dias: number
  cobertura: { contactos: number; contactosNuevos: number; agendas: number; conPersona: number; conTags: number; cash: number }
  angulos: Fila[]; subangulos: Fila[]; piezas: Fila[]; formatos: Fila[]; categorias: Fila[]; historias: Fila[]
}

const fetcher = (url: string) => fetch(url).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || "No se pudo cargar"); return b })
const pct = (n: number, d: number) => (d ? `${(Math.round((n / d) * 1000) / 10).toString().replace(".", ",")}%` : "—")
const money = (n: number) => `USD ${Math.round(n).toLocaleString("es-AR")}`
const miles = (n: number) => Math.round(n).toLocaleString("es-AR")
const fecha = (f?: string | null) => (f ? f.split("-").reverse().slice(0, 2).join("/") : "—")
// tasas sobre alcance: leads cada 1.000 personas alcanzadas, agendas cada 10.000
const cada = (n: number, alcance: number | null | undefined, base: number) => (alcance ? (n / alcance) * base : null)
const tasa = (v: number | null) => (v === null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: v < 10 ? 1 : 0 }))
const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : miles(v))
const COLOR: Record<string, string> = { "Solución": "bg-emerald-500/15 text-emerald-300", "Volumen/TOFU": "bg-violet-500/15 text-violet-300", "Producto": "bg-sky-500/15 text-sky-300", "Problema": "bg-red-500/15 text-red-300" }
const EMOJI: Record<string, string> = { "Solución": "🟢", "Volumen/TOFU": "🟣", "Producto": "🔵", "Problema": "🔴" }

function Angulo({ a }: { a?: string }) {
  if (!a) return <span className="text-white/30">—</span>
  return <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold", COLOR[a] || "bg-white/10 text-white/70")}>{EMOJI[a] || ""} {a}</span>
}

type Orden = "leads" | "agendas" | "alcance" | "fecha"
function TablaInstagram({ filas }: { filas: Fila[] }) {
  const [orden, setOrden] = useState<Orden>("leads")
  const con = filas.filter((f) => f.ig?.alcance)
  const valor = (f: Fila) => orden === "leads" ? cada(f.leads, f.ig?.alcance, 1000) ?? -1 : orden === "agendas" ? cada(f.agendas, f.ig?.alcance, 10000) ?? -1 : orden === "alcance" ? f.ig?.alcance ?? -1 : 0
  const lista = [...con].sort((a, b) => orden === "fecha" ? String(b.fecha || "").localeCompare(String(a.fecha || "")) : valor(b) - valor(a))
  const seg = (ms: number | null) => (ms ? `${(ms / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} s` : "—")
  return <Card className="border-white/10 bg-white/[.035]">
    <CardHeader className="pb-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <CardTitle className="text-base">Piezas en Instagram</CardTitle>
          <p className="text-xs text-muted-foreground">Métricas reales de cada post (API de Instagram) puestas al lado de lo que trajo: cuántos leads y agendas dejó cada 1.000 o 10.000 personas alcanzadas. {con.length} de {filas.length} piezas tienen su post identificado.</p>
        </div>
        <div className="flex gap-1">{([["leads", "Leads c/1.000"], ["agendas", "Agendas c/10.000"], ["alcance", "Alcance"], ["fecha", "Recientes"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setOrden(k)} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold", orden === k ? "border-white bg-white text-black" : "border-white/15 text-white/60 hover:bg-white/5")}>{l}</button>)}</div>
      </div>
    </CardHeader>
    <CardContent className="pt-2">
      {!lista.length && <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay piezas con su post identificado en el período.</p>}
      {lista.length > 0 && <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="hover:bg-transparent">
          <TableHead>Pieza</TableHead><TableHead>Ángulo</TableHead><TableHead>Publicada</TableHead>
          <TableHead className="text-right">Alcance</TableHead><TableHead className="text-right">Vistas</TableHead>
          <TableHead className="text-right">Guardados</TableHead><TableHead className="text-right">Compartidos</TableHead>
          <TableHead className="text-right">Seguidores</TableHead><TableHead className="text-right">Tiempo visto</TableHead>
          <TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Leads c/1.000</TableHead>
          <TableHead className="text-right">Agendas</TableHead><TableHead className="text-right">Agendas c/10.000</TableHead>
          <TableHead className="text-right">Cierres</TableHead><TableHead className="text-right">Cash</TableHead>
        </TableRow></TableHeader>
        <TableBody>{lista.map((f) => <TableRow key={f.nombre}>
          <TableCell className="max-w-[300px] whitespace-normal font-bold" title={`${f.tag || ""} · post identificado: ${f.ig?.vinculo}`}>
            {f.ig?.url ? <a href={f.ig.url} target="_blank" rel="noreferrer" className="hover:underline">{f.nombre} ↗</a> : f.nombre}
          </TableCell>
          <TableCell><Angulo a={f.angulo} /></TableCell>
          <TableCell className="text-muted-foreground">{fecha(f.fecha)}</TableCell>
          <TableCell className="text-right font-semibold">{num(f.ig?.alcance)}</TableCell><TableCell className="text-right">{num(f.ig?.vistas)}</TableCell>
          <TableCell className="text-right">{num(f.ig?.guardados)}</TableCell><TableCell className="text-right">{num(f.ig?.compartidos)}</TableCell>
          <TableCell className="text-right text-muted-foreground" title="Instagram no informa seguidores ganados en reels">{num(f.ig?.seguidores)}</TableCell>
          <TableCell className="text-right text-muted-foreground" title="Tiempo promedio de visualización (solo reels)">{seg(f.ig?.tiempo_promedio_ms ?? null)}</TableCell>
          <TableCell className="text-right">{miles(f.leads)}</TableCell><TableCell className="text-right font-bold">{tasa(cada(f.leads, f.ig?.alcance, 1000))}</TableCell>
          <TableCell className="text-right">{f.agendas}</TableCell><TableCell className="text-right font-bold">{tasa(cada(f.agendas, f.ig?.alcance, 10000))}</TableCell>
          <TableCell className="text-right">{f.cierres}</TableCell><TableCell className="text-right">{f.cash ? money(f.cash) : "—"}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
      <p className="mt-2 text-[11px] text-muted-foreground">Alcance, vistas, guardados y compartidos: totales de por vida del post según Instagram (se releen cada 6 horas). Leads y agendas: contactos y agendas con la etiqueta de la pieza en el período elegido. Instagram informa seguidores ganados solo en carruseles y posts, y tiempo visto solo en reels. Una persona con dos piezas suma en las dos.</p>
    </CardContent>
  </Card>
}

function Tabla({ filas, titulo, sub, columnas }: { filas: Fila[]; titulo: string; sub: string; columnas: Array<"angulo" | "formato" | "categoria" | "fecha"> }) {
  return <Card className="border-white/10 bg-white/[.035]">
    <CardHeader className="pb-2"><CardTitle className="text-base">{titulo}</CardTitle><p className="text-xs text-muted-foreground">{sub}</p></CardHeader>
    <CardContent className="pt-2">
      {!filas.length && <p className="py-6 text-center text-sm text-muted-foreground">Sin etiquetas de este tipo en el período.</p>}
      {filas.length > 0 && <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="hover:bg-transparent">
          <TableHead>Nombre</TableHead>
          {columnas.includes("angulo") && <TableHead>Ángulo</TableHead>}
          {columnas.includes("formato") && <TableHead>Formato</TableHead>}
          {columnas.includes("categoria") && <TableHead>Categoría</TableHead>}
          {columnas.includes("fecha") && <TableHead>Publicada</TableHead>}
          <TableHead className="text-right">Leads</TableHead><TableHead className="text-right">Nuevos</TableHead>
          <TableHead className="text-right">Agendas</TableHead><TableHead className="text-right">Lead → agenda</TableHead>
          <TableHead className="text-right">Presentadas</TableHead><TableHead className="text-right">Calificadas</TableHead>
          <TableHead className="text-right">Cierres</TableHead><TableHead className="text-right">Cierre</TableHead>
          <TableHead className="text-right">Cash collected</TableHead><TableHead className="text-right">Cash / lead</TableHead><TableHead>Última agenda</TableHead>
        </TableRow></TableHeader>
        <TableBody>{filas.map((f) => <TableRow key={f.nombre}>
          <TableCell className="max-w-[380px] whitespace-normal font-bold" title={f.tag}>{f.nombre}</TableCell>
          {columnas.includes("angulo") && <TableCell><Angulo a={f.angulo} /></TableCell>}
          {columnas.includes("formato") && <TableCell className="text-muted-foreground">{f.formato || "—"}</TableCell>}
          {columnas.includes("categoria") && <TableCell className="text-muted-foreground">{f.categoria || "—"}</TableCell>}
          {columnas.includes("fecha") && <TableCell className="text-muted-foreground">{fecha(f.fecha)}</TableCell>}
          <TableCell className="text-right">{miles(f.leads)}</TableCell><TableCell className="text-right text-muted-foreground">{miles(f.nuevos)}</TableCell>
          <TableCell className="text-right font-semibold">{f.agendas}</TableCell><TableCell className="text-right">{pct(f.agendas, f.leads)}</TableCell>
          <TableCell className="text-right">{f.presentadas}</TableCell><TableCell className="text-right">{f.calificadas}</TableCell>
          <TableCell className="text-right font-semibold">{f.cierres}</TableCell><TableCell className="text-right">{pct(f.cierres, f.presentadas)}</TableCell>
          <TableCell className="text-right font-semibold">{f.cash ? money(f.cash) : "—"}</TableCell>
          <TableCell className="text-right text-muted-foreground">{f.cash && f.leads ? `USD ${(f.cash / f.leads).toFixed(2).replace(".", ",")}` : "—"}</TableCell>
          <TableCell className="text-muted-foreground">{fecha(f.ultima)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div>}
    </CardContent>
  </Card>
}

export default function AngulosPage() {
  const [dias, setDias] = useState(35)
  const { data, error, isLoading } = useSWR<Datos>(`/api/angulos-manychat?dias=${dias}`, fetcher, { revalidateOnFocus: false })
  const cob = data?.cobertura
  return <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-5 sm:px-6 lg:px-[1.5cm]">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black">Ángulos de comunicación</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Qué ángulo trae leads, cuáles llegan a agenda, cuáles cierran y cuánto cash dejó cada uno. Sale de las etiquetas que ManyChat le pone a cada contacto (🟢 Solución · 🟣 Volumen/TOFU · 🔵 Producto · 🔴 Problema), cruzadas con las agendas y los pagos de esa persona.</p>
      </div>
      <div className="flex gap-2">{[14, 35, 60, 90, 180].map((d) => <button key={d} type="button" onClick={() => setDias(d)} className={cn("rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide", dias === d ? "border-white bg-white text-black" : "border-white/15 text-white/60 hover:bg-white/5")}>{d} días</button>)}</div>
    </div>
    {error && <p className="text-sm text-red-300">No se pudo cargar: {String(error.message || error)}</p>}
    {isLoading && <p className="text-sm text-muted-foreground">Cruzando etiquetas con agendas y pagos…</p>}
    {data && cob && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.angulos.map((a) => <Card key={a.nombre} className="border-white/10 bg-white/[.035]">
          <CardContent className="pt-5">
            <Angulo a={a.nombre} />
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Leads</span><span className="text-right font-bold">{miles(a.leads)}</span>
              <span className="text-muted-foreground">Agendas</span><span className="text-right font-bold">{a.agendas} <span className="text-xs font-normal text-muted-foreground">({pct(a.agendas, a.leads)})</span></span>
              <span className="text-muted-foreground">Presentadas</span><span className="text-right">{a.presentadas}</span>
              <span className="text-muted-foreground">Cierres</span><span className="text-right font-bold">{a.cierres} <span className="text-xs font-normal text-muted-foreground">({pct(a.cierres, a.presentadas)})</span></span>
              <span className="text-muted-foreground">Cash collected</span><span className="text-right font-black">{a.cash ? money(a.cash) : "—"}</span>
            </div>
            {a.igAngulo && a.igAngulo.piezas > 0 ? <div className="mt-3 border-t border-white/10 pt-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">En Instagram · {a.igAngulo.piezas} de {a.igAngulo.piezas_total} piezas con datos</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <span className="text-muted-foreground">Alcance</span><span className="text-right font-bold">{miles(a.igAngulo.alcance)}</span>
                <span className="text-muted-foreground">Leads c/1.000 alcanzados</span><span className="text-right font-bold">{tasa(cada(a.igAngulo.leads, a.igAngulo.alcance, 1000))}</span>
                <span className="text-muted-foreground">Agendas c/10.000 alcanzados</span><span className="text-right font-black">{tasa(cada(a.igAngulo.agendas, a.igAngulo.alcance, 10000))}</span>
                <span className="text-muted-foreground">Guardados c/1.000</span><span className="text-right">{tasa(cada(a.igAngulo.guardados, a.igAngulo.alcance, 1000))}</span>
              </div>
            </div> : null}
          </CardContent>
        </Card>)}
        {!data.angulos.length && <p className="text-sm text-muted-foreground">Todavía no hay contactos etiquetados con ángulo en este período.</p>}
      </div>
      <p className="text-xs text-muted-foreground">
        Desde el {data.desde.split("-").reverse().join("/")}: {miles(cob.contactos)} contactos en ManyChat ({miles(cob.contactosNuevos)} nuevos en el período) · {cob.agendas} agendas, {cob.conTags} con etiquetas de ManyChat cruzadas ({pct(cob.conTags, cob.agendas)}) · {money(cob.cash)} cobrados a personas con agenda en el período.
        "Leads" cuenta todos los contactos que tienen la etiqueta; "Nuevos" solo los que siguieron la cuenta en el período. Las agendas sin contacto de ManyChat cruzado no entran en ninguna fila: por eso la cobertura importa.
      </p>
      <TablaInstagram filas={data.piezas} />
      <Tabla filas={data.subangulos} titulo="Sub-ángulos" sub="El ángulo con su tema concreto, tal como lo etiqueta el flujo (ej. Solución · Cómo conseguir más clientes)." columnas={["angulo"]} />
      <Tabla filas={data.piezas} titulo="Piezas" sub="Cada contenido publicado, con su formato, ángulo y fecha. Ordenado por cash, cierres y agendas." columnas={["angulo", "formato", "categoria", "fecha"]} />
      <Tabla filas={data.historias} titulo="Historias" sub="Las historias con keyword, una por una." columnas={["fecha"]} />
      <Tabla filas={data.formatos} titulo="Formatos" sub="Talking head, carrusel, B-roll, tutorial, reacción…" columnas={[]} />
      <Tabla filas={data.categorias} titulo="Categorías" sub="Reel, carrusel, historia, ads, nuevo seguidor: el canal por el que entró el lead." columnas={[]} />
    </>}
  </div>
}
