import { RadarEmbed } from "@/components/radar-embed"
import { BRAND } from "@/lib/brand"

export const dynamic = "force-dynamic"
export const metadata = { title: `Radar de contenido | ${BRAND.name}` }

// Marketing → Radar: las cuentas de Instagram que seguimos, lo que publican (reels, carruseles, posts e
// historias) con sus métricas, el análisis de cada pieza y la versión para la marca propia.
export default function RadarPage() {
  return <RadarEmbed />
}
