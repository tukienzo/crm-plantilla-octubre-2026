import { META_CASH_MENSUAL } from "@/lib/brand"

// Cohortes de comisión sobre `pagos.tipo` (vocabulario de la planilla de ventas +
// etiquetas heredadas de versiones anteriores de la plantilla).
//   FECCU  = front end, cash upfront (fee + venta que da acceso)
//   FECCPP = front end, cuotas del plan de pago
//   BECCU  = back end (cliente existente), upfront
//   BECCPP = back end, cuotas
export const FECCU_TYPES = new Set([
  "Fee", "Refuerzo de Fee",
  "Venta Nueva", "Venta Nueva (En Call)", "Venta Nueva (Post Fee)",
  "Completó PIF", "Completó PIF (Post Fee)",
  "Adentro en Seguimiento", "Adentro en Seguimiento y Post Fee",
])

export const FECCPP_TYPES = new Set([
  "Cuota", "Cuota 1", "Cuota 2", "Cuota 3", "Cuota 4", "Cuota 5",
  "Cuota 6", "Cuota 7", "Cuota 8", "Cuota 9", "Cuota 10",
  // Heredados de versiones anteriores de la plantilla
  "Completó PIF + Acceso Total Consulting",
  "Completa Total (Post Venta)",
  "Completa Total + Acceso Acción",
  "Completa Total y Finaliza Pago",
])

export const BECCU_TYPES = new Set([
  "Fee Venta Interna", "Venta Nueva Interna", "Venta Interna",
  "Upsell",
  // Heredado de versiones anteriores de la plantilla
  "Venta Nueva Interna (Post Fee)",
])

export const BECCPP_TYPES = new Set(["Cuota Venta Interna"])

export type FrontendCohort = "FECCU" | "FECCPP" | null
export type BackendCohort = "BECCU" | "BECCPP" | null

export function frontendCohort(tipo: string | null | undefined): FrontendCohort {
  if (FECCU_TYPES.has(tipo || "")) return "FECCU"
  if (FECCPP_TYPES.has(tipo || "")) return "FECCPP"
  return null
}

export function backendCohort(tipo: string | null | undefined): BackendCohort {
  if (BECCU_TYPES.has(tipo || "")) return "BECCU"
  if (BECCPP_TYPES.has(tipo || "")) return "BECCPP"
  return null
}

// Esquema de comisiones por escalones. Los escalones salen de la meta mensual de cash
// collected (NEXT_PUBLIC_META_CASH_MENSUAL): sin meta cargada (0) nadie sube de escalón y
// todos cobran el porcentaje base. Los porcentajes son un ejemplo: ajustalos a tu esquema.
// `month` va en formato AAAA-MM; si viene mal formado no hay meta.
export function closerTopTarget(month: string): number {
  return /^\d{4}-\d{2}$/.test(String(month || "")) ? META_CASH_MENSUAL : 0
}

/** Escalón intermedio del closer: 80 % de la meta (0 si no hay meta). */
export function closerMidTarget(month: string): number {
  return Math.round(closerTopTarget(month) * 0.8)
}

export function closerUnlockedRate(ccFrontend: number, isTop: boolean, month: string): number {
  const top = closerTopTarget(month)
  const mid = closerMidTarget(month)
  if (isTop && top > 0 && ccFrontend >= top) return 0.12
  if (mid > 0 && ccFrontend >= mid) return 0.11
  return 0.10
}

export function setterUnlockedRate(ccFirst30Days: number, isTop: boolean): number {
  const top = Math.round(META_CASH_MENSUAL * 0.6)
  const mid = Math.round(META_CASH_MENSUAL * 0.5)
  if (isTop && top > 0 && ccFirst30Days >= top) return 0.06
  if (mid > 0 && ccFirst30Days >= mid) return 0.055
  return 0.05
}

export function applyStrikes(unlockedRate: number, strikes: number, floor: number): number {
  return Math.max(floor, unlockedRate - Math.max(0, strikes) * 0.005)
}

export function withinSetterWindow(paymentDate: string | null | undefined, firstPaymentDate: string | null | undefined): boolean {
  if (!paymentDate || !firstPaymentDate) return false
  const payment = Date.parse(`${paymentDate.slice(0, 10)}T00:00:00Z`)
  const first = Date.parse(`${firstPaymentDate.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(payment) || !Number.isFinite(first)) return false
  const days = Math.floor((payment - first) / 86_400_000)
  return days >= 0 && days <= 30
}
