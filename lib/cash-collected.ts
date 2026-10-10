// Tipos de `pagos.tipo` que representan dinero efectivamente cobrado (Cash
// Collected). Única fuente de verdad compartida por tablero-semanal,
// home-ceo-reconciliacion y el asistente interno, para que los tres nunca
// diverjan en qué cuenta como "cobrado".
//
// Vocabulario de la planilla de ventas + etiquetas heredadas de versiones
// anteriores de la plantilla (inofensivas si nunca aparecen en tus datos).

// Fees (seña, sin acceso). Un fee es un tipo que EMPIEZA con "Fee" o es
// "Refuerzo de Fee". Ojo: "Adentro en Seguimiento y Post Fee" NO es un fee.
export const FEE_TIPOS = new Set(["Fee", "Refuerzo de Fee", "Fee Venta Interna"])
export const FRONT_END_FEE_TIPOS = new Set(["Fee", "Refuerzo de Fee"])

export function isFeeType(tipo: string | null | undefined): boolean {
  const value = tipo || ""
  return value.startsWith("Fee") || value === "Refuerzo de Fee"
}

export const CC_TIPOS = new Set([
  // Front end — cliente nuevo
  "Fee", "Refuerzo de Fee",
  "Venta Nueva", "Adentro en Seguimiento", "Adentro en Seguimiento y Post Fee", "Completó PIF",
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5",
  "Cuota 6", "Cuota 7", "Cuota 8", "Cuota 9", "Cuota 10",
  // Back end — cliente existente
  "Fee Venta Interna", "Venta Nueva Interna", "Venta Interna", "Cuota Venta Interna",
  "Upsell",
  // Heredados de la plantilla original
  "Venta Nueva (En Call)", "Venta Nueva (Post Fee)", "Completó PIF (Post Fee)",
  "Completó PIF + Acceso Total Consulting",
  "Completa Total (Post Venta)",
  "Completa Total + Acceso Acción",
  "Completa Total y Finaliza Pago",
  "Venta Nueva Interna (Post Fee)",
])

export function isCashCollectedType(tipo: string | null | undefined): boolean {
  return CC_TIPOS.has(tipo || "")
}

export function sumCashCollected(rows: Array<{ tipo?: string | null; monto?: number | null }>): number {
  const total = rows
    .filter(row => isCashCollectedType(row.tipo))
    .reduce((sum, row) => sum + (row.monto || 0), 0)
  return Math.round(total * 100) / 100
}
