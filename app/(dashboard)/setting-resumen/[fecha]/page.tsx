"use client"

import { use } from "react"
import Link from "next/link"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { ArrowLeft, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2 } from "lucide-react"
import { dashboardSettingHtml, nombreArchivoDashboard, type DiaSetting } from "@/lib/setting-dashboard"

// Un reporte de setting ya guardado, visto como dashboard, con un enlace propio que se puede
// guardar y volver cuando sea. Se trae el día en JSON y se dibuja acá con la misma función que usa
// el generador (srcDoc): incrustar la respuesta del servidor en un marco chocaba con las cabeceras
// de seguridad del CRM y el marco quedaba vacío. "Abrir en pestaña" sí usa la versión servida,
// porque abrir a pantalla completa no tiene esa restricción.
// Las flechas recorren los días que hay en la base, no el calendario: saltan los días sin reporte.

type Guardado = { fecha: string; setter: string }
const fetcher = (url: string) => fetch(url).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "No se pudo cargar"); return j })
const dm = (f: string) => f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(0, 4)

export default function ReporteSettingPage({ params }: { params: Promise<{ fecha: string }> }) {
  const { fecha } = use(params)
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha)
  const { data: lista } = useSWR<{ dias: Guardado[] }>("/api/setting-resumen?limite=60", fetcher, { revalidateOnFocus: false })
  const { data, error, isLoading } = useSWR<{ dia: DiaSetting }>(valida ? `/api/setting-resumen?fecha=${fecha}` : null, fetcher, { revalidateOnFocus: false })
  // La lista viene de más nuevo a más viejo.
  const dias = (lista?.dias || []).map((d) => d.fecha)
  const i = dias.indexOf(fecha)
  const masNuevo = i > 0 ? dias[i - 1] : null
  const masViejo = i >= 0 && i < dias.length - 1 ? dias[i + 1] : null
  const dia = data?.dia
  const html = dia ? dashboardSettingHtml(dia) : ""

  function descargar() {
    if (!dia) return
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url; a.download = nombreArchivoDashboard(dia)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  if (!valida) return <div className="p-6 text-sm text-muted-foreground">Fecha inválida.</div>

  return <div className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-[1800px] flex-col gap-3 px-4 py-4 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="ghost"><Link href="/setting-resumen"><ArrowLeft className="mr-1.5 h-4 w-4" />Generador</Link></Button>
        <div>
          <h1 className="text-lg font-black leading-tight">Setting del {dm(fecha)}</h1>
          <p className="text-xs text-muted-foreground">{dia?.setter ? `Reporte de ${dia.setter}` : "Reporte guardado"} · el mismo dashboard que se descarga</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {masViejo
          ? <Button asChild size="sm" variant="outline"><Link href={`/setting-resumen/${masViejo}`}><ChevronLeft className="mr-1 h-4 w-4" />{dm(masViejo).slice(0, 5)}</Link></Button>
          : <Button size="sm" variant="outline" disabled><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>}
        {masNuevo
          ? <Button asChild size="sm" variant="outline"><Link href={`/setting-resumen/${masNuevo}`}>{dm(masNuevo).slice(0, 5)}<ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
          : <Button size="sm" variant="outline" disabled>Siguiente<ChevronRight className="ml-1 h-4 w-4" /></Button>}
        <Button size="sm" variant="outline" onClick={descargar} disabled={!dia}><Download className="mr-1.5 h-4 w-4" />Descargar</Button>
        <Button asChild size="sm"><a href={`/api/setting-resumen?fecha=${fecha}&html=1`} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-4 w-4" />Abrir en pestaña</a></Button>
      </div>
    </div>
    {isLoading && <div className="grid flex-1 place-items-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Cargando el reporte…</span></div>}
    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/[.06] px-4 py-3 text-sm text-red-200">{(error as Error).message}</div>}
    {dia && <iframe title={`Setting del ${fecha}`} srcDoc={html} className="min-h-0 w-full flex-1 rounded-xl border border-white/10 bg-[#14110c]" />}
  </div>
}
