import type { CiudadDatos, DICCIONARIO, ESTADOS_SILLA, EstadoSilla } from "@/lib/ciudad"

export type { EstadoSilla }
export type CiudadVista = CiudadDatos & { diccionario: typeof DICCIONARIO; estados: typeof ESTADOS_SILLA }
export type Zona = "contenido" | "captacion" | "espera" | "setters" | "agendas" | "closers" | "seguimiento" | "clientes" | "formacion"
export type Seleccion = { zona: Zona; id?: string } | null

export const ZONAS: Record<Zona, { titulo: string; color: string; ruta?: { href: string; label: string } }> = {
  contenido: { titulo: "Islas de contenido", color: "#8A3AB9", ruta: { href: "/contenido/angulos", label: "Ver en Ángulos" } },
  captacion: { titulo: "Captación", color: "#E1306C" },
  espera: { titulo: "Sala de espera", color: "#F77737" },
  setters: { titulo: "Setters", color: "#C13584", ruta: { href: "/setting-resumen", label: "Resumen de setting" } },
  agendas: { titulo: "Agendas", color: "#5B51D8", ruta: { href: "/centro-agendas", label: "Abrir agendas" } },
  closers: { titulo: "Closers", color: "#405DE6", ruta: { href: "/reporte-llamadas", label: "Reporte de llamadas" } },
  seguimiento: { titulo: "Seguimiento", color: "#B23A9E", ruta: { href: "/seguimientos", label: "Abrir seguimientos" } },
  clientes: { titulo: "Clientes · onboarding", color: "#22A37A", ruta: { href: "/clientes-hub", label: "Abrir clientes" } },
  formacion: { titulo: "Formación", color: "#6D5DD3" },
}

// colores de ManyChat: 🔴 Problema · 🟢 Solución · 🔵 Producto · 🟣 Volumen/TOFU
export const COLOR_ANGULO: Record<string, string> = { Problema: "#E1306C", "Solución": "#22A37A", Producto: "#405DE6", "Volumen/TOFU": "#8A3AB9" }
export const COLOR_ESTADO: Record<EstadoSilla, string> = {
  programada: "#B8B0D8", confirmada: "#405DE6", en_horario: "#F77737", presentada: "#8A3AB9", cerro: "#22A37A",
  no_show: "#E1306C", cancelada: "#5E5873", reprogramada: "#FCAF45", sin_resultado: "#A3A0B3",
}

export const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "·"
export const nombreVisible = (n: string, mostrar: boolean) => (mostrar ? n : iniciales(n))
export const numero = (n: number | null | undefined) => (n === null || n === undefined ? "N/D" : n.toLocaleString("es-AR"))
export const usd = (n: number | null | undefined) => (n === null || n === undefined ? "N/D" : `USD ${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`)
export const fechaCorta = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—")
export const horaArt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }) : "—")
