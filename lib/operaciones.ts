// Catálogo único de operaciones (deriva de lib/programas.ts). "familia" = programa, y determina
// la duración para calcular fecha_baja automáticamente.
import { PROGRAMAS, mesesDeOperacion, programaPorTexto, type ProgramaId } from "@/lib/programas"

export type Familia = ProgramaId

export type OperacionDef = { label: string; familia: Familia; mesesOverride?: number }

export const OPERACIONES: OperacionDef[] = PROGRAMAS.flatMap((p) =>
  p.operaciones.map((o) => ({ label: o.label, familia: p.id, ...(o.meses != null ? { mesesOverride: o.meses } : {}) })),
)

export const OPERACION_LABELS = OPERACIONES.map(o => o.label)

export function familiaDeOperacion(operacionLabel: string | null | undefined): Familia | null {
  if (!operacionLabel) return null
  const found = OPERACIONES.find(o => o.label === operacionLabel)
  if (found) return found.familia
  return programaPorTexto(operacionLabel)?.id ?? null
}

// Duración en meses: override de la etiqueta ("8 meses", "1 año") o la del programa.
export function mesesDuracion(familia: Familia | null, operacionLabel?: string | null): number | null {
  if (operacionLabel) {
    const meses = mesesDeOperacion(operacionLabel)
    if (meses != null) return meses
  }
  return PROGRAMAS.find((p) => p.id === familia)?.duracionMeses ?? null
}

export function calcularFechaBaja(fechaAltaISO: string | null, familia: Familia | null, operacionLabel?: string | null): string | null {
  if (!fechaAltaISO) return null
  const meses = mesesDuracion(familia, operacionLabel)
  if (meses == null) return null
  const [y, m, d] = fechaAltaISO.split("-").map(Number)
  const dt = new Date(y, m - 1 + meses, d)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
