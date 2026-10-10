"use client"

import { useState } from "react"
import useSWR from "swr"
import { Building2, Loader2 } from "lucide-react"
import { CrmPageIntro } from "@/components/crm-ui"
import { VistaCiudad } from "@/components/ciudad/vista"
import type { CiudadVista } from "@/components/ciudad/tipos"
import { BRAND } from "@/lib/brand"

// Vista ciudad: el negocio entero como una ciudad isométrica. Islas = piezas de contenido,
// cinta = ManyChat, edificios = etapas del embudo, figuras = registros reales del CRM. Solo lectura.

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(async (r) => { const b = await r.json(); if (!r.ok || b.error) throw new Error(b.error || "Error"); return b as CiudadVista })
const hoyArt = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)

export default function CiudadPage() {
  const [dia, setDia] = useState(hoyArt)
  const { data, error, isLoading, isValidating, mutate } = useSWR(`/api/ciudad?dia=${dia}`, fetcher, { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false, keepPreviousData: true })
  return (
    <div className="mx-auto max-w-[1700px] space-y-4 p-4 md:p-7">
      <CrmPageIntro eyebrow={BRAND.name} title="Ciudad" tone="violet" icon={<Building2 className="h-5 w-5" />}
        description="Todo el negocio en una vista: las piezas de contenido, ManyChat, setters, agendas, closers, seguimiento, clientes y formación. Cada figura es un registro real del CRM." />
      {error && !data ? <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm">No se pudo leer la ciudad: {(error as Error).message}</p> : null}
      {!data && isLoading ? <div className="grid h-[50vh] place-items-center text-sm text-muted-foreground"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Leyendo el CRM…</span></div> : null}
      {data ? <VistaCiudad datos={data} dia={dia} onDia={setDia} cargando={isValidating} onRecargar={() => mutate()} /> : null}
    </div>
  )
}
