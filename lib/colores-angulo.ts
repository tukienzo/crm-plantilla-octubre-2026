// Color de cada categoría de ángulo, igual en todo el CRM. Son los mismos colores que usan las
// etiquetas de ManyChat (🔴 problema, 🟢 solución, 🔵 producto, 🟣 volumen), más amarillo para
// mentalidad. Las clases van literales porque Tailwind no genera las que arma en tiempo de ejecución.

type Paleta = {
  chip: string    // píldora con la categoría o el ángulo
  punto: string   // puntito de color en las listas desplegables
  panel: string   // caja grande (borde + fondo)
  titulo: string  // texto del encabezado de esa caja
  borde: string   // borde suelto, para el campo mientras se elige
}

const PALETAS: Record<string, Paleta> = {
  PROBLEMA: {
    chip: "border-red-500/35 bg-red-500/15 dark:bg-red-500/15 text-red-700 dark:text-red-300",
    punto: "bg-red-500", panel: "border-red-500/25 bg-red-500/[.08]",
    titulo: "text-red-700 dark:text-red-300", borde: "border-red-500/40",
  },
  SOLUCION: {
    chip: "border-emerald-500/35 bg-emerald-500/15 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    punto: "bg-emerald-500", panel: "border-emerald-500/25 bg-emerald-500/[.08]",
    titulo: "text-emerald-700 dark:text-emerald-300", borde: "border-emerald-500/40",
  },
  PRODUCTO: {
    chip: "border-sky-500/35 bg-sky-500/15 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
    punto: "bg-sky-500", panel: "border-sky-500/25 bg-sky-500/[.08]",
    titulo: "text-sky-700 dark:text-sky-300", borde: "border-sky-500/40",
  },
  MENTALIDAD: {
    chip: "border-amber-400/35 bg-amber-400/15 dark:bg-amber-400/15 text-amber-700 dark:text-amber-300",
    punto: "bg-amber-400", panel: "border-amber-400/25 bg-amber-400/[.08]",
    titulo: "text-amber-700 dark:text-amber-300", borde: "border-amber-400/40",
  },
  VOLUMEN: {
    chip: "border-violet-500/35 bg-violet-500/15 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
    punto: "bg-violet-500", panel: "border-violet-500/25 bg-violet-500/[.08]",
    titulo: "text-violet-700 dark:text-violet-300", borde: "border-violet-500/40",
  },
}

// Sin categoría conocida: gris, para no teñir de un color que significa otra cosa.
const NEUTRA: Paleta = {
  chip: "border-border bg-muted text-muted-foreground",
  punto: "bg-muted-foreground/40", panel: "border-border bg-muted/60",
  titulo: "text-muted-foreground", borde: "border-border",
}

// "VOLUMEN/TOFU", "Volumen/Tofu" y "volumen" caen todos en la misma paleta; los acentos no importan.
export function colorAngulo(categoria: string | null | undefined): Paleta {
  const clave = String(categoria || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim()
  if (!clave) return NEUTRA
  if (clave.startsWith("VOLUMEN") || clave.startsWith("TOFU")) return PALETAS.VOLUMEN
  return PALETAS[clave] || NEUTRA
}

export const CATEGORIAS_CON_COLOR = ["PROBLEMA", "SOLUCIÓN", "PRODUCTO", "MENTALIDAD", "VOLUMEN/TOFU"] as const
