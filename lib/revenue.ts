export type SalePayment = {
  fecha?: string | null
  cliente?: string | null
  tipo?: string | null
  operacion?: string | null
  ppp?: string | null
  monto?: number | null
}

export type ContractPlan = {
  id?: string | number | null
  fecha_alta?: string | null
  created_at?: string | null
  cliente?: string | null
  operacion?: string | null
}

// Ventas front end (cliente nuevo que ENTRA al programa). Un Fee no es venta:
// la venta se cuenta cuando llega el pago que da acceso.
// Vocabulario de la planilla de ventas + etiquetas heredadas de versiones anteriores de la plantilla.
export const FRONT_END_SALE_TYPES = new Set([
  "Venta Nueva",                        // cerró en la llamada
  "Adentro en Seguimiento",             // cerró en seguimiento
  "Adentro en Seguimiento y Post Fee",  // cerró en seguimiento después de un Fee
  "Completó PIF",                       // pagó el total después de un Fee
  // Heredados
  "Venta Nueva (En Call)",
  "Venta Nueva (Post Fee)",
  "Completó PIF (Post Fee)",
])

// Ventas back end (cliente existente). Cobran, pero no son front end.
export const BACK_END_SALE_TYPES = new Set([
  "Venta Nueva Interna",
  "Venta Interna",
  "Upsell",
  // Heredado
  "Venta Nueva Interna (Post Fee)",
])

export const ALL_SALE_TYPES = new Set([
  ...FRONT_END_SALE_TYPES,
  ...BACK_END_SALE_TYPES,
])

// Cierre que ocurre en la llamada misma vs. cierre posterior (seguimiento).
export const CLOSED_IN_CALL_TYPES = new Set(["Venta Nueva", "Venta Nueva (En Call)"])
export const CLOSED_IN_FOLLOWUP_TYPES = new Set([
  "Adentro en Seguimiento", "Adentro en Seguimiento y Post Fee", "Completó PIF",
  // Heredados
  "Venta Nueva (Post Fee)", "Completó PIF (Post Fee)", "Venta Nueva Interna (Post Fee)",
])

function normalized(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function moneyNumber(raw: string): number | null {
  let value = raw.replace(/\s/g, "")
  if (value.includes(",") && value.includes(".")) value = value.replace(/,/g, "")
  else if (value.includes(",")) {
    const decimals = value.split(",").at(-1)?.length || 0
    value = decimals === 3 ? value.replace(/,/g, "") : value.replace(",", ".")
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function contractValueFromOperation(operation: string | null | undefined, fallback = 0): number {
  const value = operation || ""
  const installments = value.match(/(\d+)\s*x\s*\$?\s*([\d.,]+)/i)
  if (installments) {
    const amount = moneyNumber(installments[2])
    if (amount) return Number(installments[1]) * amount
  }

  const explicitPrice = value.match(/\$\s*([\d.,]+)/)
  if (explicitPrice) {
    const amount = moneyNumber(explicitPrice[1])
    if (amount) return amount
  }

  // Formas sin "$": "3 Pagos (400 + 400 + 300)", "Programa 2K", "Programa - 1000 PP",
  // "Mentoría (700) PP", "Comunidad | 1 año | 900", "Programa 1200 pif".
  const sumOfParts = value.match(/\d+\s*pagos?\s*\(([\d\s+.,]+)\)/i)
  if (sumOfParts) {
    const total = sumOfParts[1].split("+").map(x => moneyNumber(x.trim()) || 0).reduce((a, b) => a + b, 0)
    if (total) return total
  }
  const thousands = value.match(/(\d+(?:[.,]\d+)?)\s*k\b/i)
  if (thousands) {
    const amount = moneyNumber(thousands[1])
    if (amount) return amount * 1000
  }
  const bare = Array.from(value.matchAll(/(?<![\d.,])(\d{3,5})(?![\d.,]*\s*(?:%|meses|mes|cuotas|pagos|x\b|año))/gi))
    .map(m => Number(m[1])).filter(n => n >= 300 && n <= 20000)
  if (bare.length) return Math.max(...bare)

  return fallback
}

// El contrato histórico vive en `operacion` (ej. "4 x $547" o "$2,300 PP").
// `monto` es solo lo cobrado ese día y no sirve para Revenue comprometido.
export function contractValue(payment: SalePayment): number {
  const fromOperation = contractValueFromOperation(payment.operacion)
  if (fromOperation) return fromOperation

  // Último respaldo para operaciones viejas mal rotuladas: usa el primer
  // precio declarado en el encabezado del plan antes que el cash del día.
  const planHeader = (payment.ppp || "").split("\n").slice(0, 4).join(" ")
  const planPrice = planHeader.match(/\$\s*([\d.,]+)/)
  if (planPrice) {
    const amount = moneyNumber(planPrice[1])
    if (amount) return amount
  }

  return Number(payment.monto || 0)
}

function uniqueSales(payments: SalePayment[], allowedTypes: Set<string>) {
  const seen = new Set<string>()
  return payments.filter((payment) => {
    if (!allowedTypes.has(payment.tipo || "")) return false
    const key = [
      (payment.fecha || "").slice(0, 7),
      normalized(payment.cliente || ""),
      normalized(payment.operacion || ""),
    ].join("|")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function revenueFromSales(payments: SalePayment[]) {
  return uniqueSales(payments, ALL_SALE_TYPES).reduce((sum, payment) => sum + contractValue(payment), 0)
}

export function newSalesRevenue(payments: SalePayment[]) {
  return uniqueSales(payments, FRONT_END_SALE_TYPES).reduce((sum, payment) => sum + contractValue(payment), 0)
}

// `planes_pago` representa el contrato acordado, incluidos planes que arrancan
// con Fee. Es la fuente correcta para Revenue; `pagos` queda para Cash Collected.
export function revenueFromPlans(plans: ContractPlan[]) {
  const seen = new Set<string>()
  return plans.reduce((sum, plan) => {
    const key = plan.id == null
      ? [
          (plan.fecha_alta || plan.created_at || "").slice(0, 10),
          normalized(plan.cliente || ""),
          normalized(plan.operacion || ""),
        ].join("|")
      : String(plan.id)
    if (seen.has(key)) return sum
    seen.add(key)
    return sum + contractValueFromOperation(plan.operacion)
  }, 0)
}
