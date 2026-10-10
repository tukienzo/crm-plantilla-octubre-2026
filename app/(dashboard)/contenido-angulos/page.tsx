"use client"

import { CalendarClock, Radar, ListPlus } from "lucide-react"
import { ModuleTabs } from "@/components/module-tabs"
import { ContentWorkspace } from "@/components/content-workspace"
import { ContentAnglesMetrics } from "@/components/content-angles-metrics"
import { BancoAngulos } from "@/components/banco-angulos"

// Contenido tiene tres pestañas dentro del mismo módulo (mismo criterio que
// /cobros: ModuleTabs, sin crear un hub global nuevo):
// - Semanal (Esta semana / Biblioteca): donde el equipo escribe,
//   calendariza y revisa guiones día a día. Reemplaza el uso diario de
//   Notion para esto.
// - Métricas/Ángulos: la trazabilidad estímulo→venta que ya existía. Los
//   drill-downs de ángulo/formato/lead viven ahí mismo, no como página nueva.
// - Banco de ángulos: el inventario editable que alimenta el desplegable de
//   ángulo de cada pieza y la rotación de Volumen (tabla crm_angulos).
export default function ContenidoPage() {
  const tabs = [
    { id: "semanal", label: "Semanal", hint: "esta semana y biblioteca", icon: <CalendarClock className="h-4 w-4" />, content: <ContentWorkspace /> },
    { id: "metricas", label: "Métricas y ángulos", hint: "trazabilidad estímulo → venta", icon: <Radar className="h-4 w-4" />, content: <ContentAnglesMetrics /> },
    { id: "banco", label: "Banco de ángulos", hint: "editar y agregar ángulos", icon: <ListPlus className="h-4 w-4" />, content: <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6"><BancoAngulos /></div> },
  ]
  return <ModuleTabs
    title="Contenido"
    subtitle="Calendario semanal de guiones, trazabilidad de ángulos y el banco de ángulos en un solo lugar"
    tabs={tabs}
  />
}
