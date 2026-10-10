"use client"

import { Clapperboard, Lightbulb, Image as ImageIcon, Youtube } from "lucide-react"
import { ModuleTabs } from "@/components/module-tabs"
import { YoutubeTablero } from "@/components/youtube-tablero"

// YouTube: los videos largos del canal. Cuatro vistas del mismo tablero —
// lo que está por producir, las ideas sueltas, el panel de miniaturas para mirar
// el packaging junto, y lo ya publicado con sus métricas traídas del canal.
// Los clips de cada video se crean adentro del video y viven como piezas de
// contenido normales, así entran en el pipeline y se asignan a un editor.
export default function YoutubePage() {
  const tabs = [
    { id: "produccion", label: "Producción", hint: "videos largos pendientes", icon: <Clapperboard className="h-4 w-4" />, content: <YoutubeTablero vista="produccion" /> },
    { id: "ideas", label: "Ideas", hint: "todavía sin guion", icon: <Lightbulb className="h-4 w-4" />, content: <YoutubeTablero vista="ideas" /> },
    { id: "miniaturas", label: "Miniaturas", hint: "el packaging de cada video", icon: <ImageIcon className="h-4 w-4" />, content: <YoutubeTablero vista="miniaturas" /> },
    { id: "publicados", label: "Publicados", hint: "lo que ya está en el canal", icon: <Youtube className="h-4 w-4" />, content: <YoutubeTablero vista="publicados" /> },
  ]
  return <ModuleTabs
    title="YouTube"
    subtitle="Videos largos: producción, ideas, miniaturas y lo publicado, con los clips de cada uno"
    tabs={tabs}
  />
}
