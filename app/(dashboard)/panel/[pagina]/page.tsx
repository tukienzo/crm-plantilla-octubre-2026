import { notFound } from "next/navigation"
import { PanelNegocio } from "@/components/panel-negocio"
import { TareasEquipo } from "@/components/tareas-equipo"
import { BRAND } from "@/lib/brand"
import { esPaginaPanel, TITULOS_PANEL } from "@/lib/panel-paginas"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await params
  const titulo = esPaginaPanel(pagina) ? TITULOS_PANEL[pagina] : null
  return { title: titulo ? `${titulo} · Panel del negocio | ${BRAND.name}` : `Panel del negocio | ${BRAND.name}` }
}

export default async function PaginaPanelNegocio({ params }: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await params
  if (!esPaginaPanel(pagina)) notFound()
  // «El equipo» ya no es la página del panel embebido: son las tareas de cada miembro (las ve todo el equipo).
  if (pagina === "equipo") return <TareasEquipo />
  return <PanelNegocio pagina={pagina} />
}
