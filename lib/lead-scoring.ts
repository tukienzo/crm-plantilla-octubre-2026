import { PRECIO_BASE } from "./brand"

// Lead scoring automático.
// Fuente exclusiva: las respuestas del formulario de agenda (iClosed) que quedan en `agendas`:
//   inversion        → capital disponible para invertir ("Menos de $500", "$500 a $1.000", "Más de $2.000"…)
//   ingresos         → ingresos actuales por mes ("Menos de $1.000/mes", "Entre $2.000 y $4.000/mes"…)
//   intentos_previos → etapa ("Sería mi primera vez", "Probé pero no llegué a facturar", "Ya facturo pero estoy estancado"…)
//   motivo_urgencia  → objetivo de ingresos ("$3.000 a $5.000 al mes", "Más de $10.000 al mes"…)
//   ocupacion        → situación ("Empleado", "Estudiante", "Tengo mi propio negocio"…)
//   edad             → solo bloquea menores de 18
// Puntaje 0–100. Nada se inventa: si no hay capital y tampoco ingresos ni etapa, no hay scoring (null).
// Las frases y los cortes son un punto de partida genérico: ajustalos a las opciones de tu formulario y
// calibralos con tus cierres reales. Capital e ingresos se miden contra el precio del programa (PRECIO_BASE).

export type ScoreInput = {
  edad?: unknown
  problema_actual?: unknown
  tiempo_problema?: unknown
  intentos_previos?: unknown
  motivo_urgencia?: unknown
  ocupacion?: unknown
  ingresos?: unknown
  inversion?: unknown
}

export type LeadGrade = "LEAD S" | "LEAD A" | "LEAD B" | "LEAD C" | "LEAD D"
export type ScoreResult = {
  calificacion: LeadGrade
  motivo: string
  puntos: number
  desglose: Record<string, number | null>
} | null

export const PESOS = { capital: 35, ingresos: 20, etapa: 20, objetivo: 15, situacion: 10 } as const
export const CORTES = { S: 66, A: 54, B: 42, C: 30 } as const

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[’‘]/g, "'").replace(/\s+/g, " ")
const has = (v: string, terms: string[]) => terms.some((t) => v.includes(norm(t)))
// primer monto en USD que aparece en el texto ("$3.000", "3k", "10.000 USD") → número
function monto(v: string): number | null {
  const k = v.match(/(\d+(?:[.,]\d+)?)\s*k\b/)
  if (k) return Math.round(Number(k[1].replace(",", ".")) * 1000)
  const m = v.match(/\d{1,3}(?:[.,]\d{3})+|\d{3,6}/)
  if (!m) return null
  return Number(m[0].replace(/[.,]/g, ""))
}

// Precio de referencia para medir capital e ingresos. Sin precio cargado se usa USD 1.000.
const PRECIO_REF = PRECIO_BASE > 0 ? PRECIO_BASE : 1000
// "Menos de $500", "hasta 500", "-$500": el monto es un techo, no un piso.
const esTecho = (v: string) => has(v, ["menos de", "hasta"]) || /^-\s*\$?\d/.test(v)
// "Más de $2.000", "+$2.000": el monto es un piso abierto.
const esPiso = (v: string) => has(v, ["mas de"]) || /^\+\s*\$?\d/.test(v)

// capital disponible para invertir (0–35)
export function capitalPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["no tengo", "sin capital", "no puedo", "nada"])) return 2
  const n = monto(v)
  if (n === null) return null
  const r = n / PRECIO_REF
  if (esTecho(v)) return r > 0.5 ? 14 : 6
  if (r >= 2) return 35
  if (r >= 1) return 32
  if (r >= 0.4) return esPiso(v) ? 24 : 30  // alcanza para una cuota; "más de" sin techo es más vago
  return r >= 0.2 ? 14 : 6
}

// ingresos actuales por mes (0–20): capacidad de pago
export function incomePoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["sin ingresos", "no tengo ingresos"])) return 6
  const n = monto(v)
  if (n === null) return null
  const r = n / PRECIO_REF
  if (esTecho(v)) return r > 0.5 ? 10 : 6
  return r >= 3 ? 20 : r >= 2.3 ? 18 : r >= 1.5 ? 16 : r >= 0.4 ? 14 : 6
}

// etapa (0–20): el que ya factura pero está trabado es el que más compra
export function stagePoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["facturo pero", "estancado", "no paso de", "no logro crecer"])) return 20
  if (has(v, ["negocio andando", "tengo clientes", "con clientes", "ya facturo", "ya vendo"])) return 18
  if (has(v, ["primera vez", "nunca", "desde cero", "no probe", "no, seria"])) return 8
  if (has(v, ["probe", "no llegue a facturar", "intente"])) return 12
  return null
}

// objetivo de ingresos por mes en USD (0–15): la ambición realista es la que compra
export function goalPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  const n = monto(v)
  if (n !== null) return n >= 20000 ? 8 : n >= 10000 ? 10 : n >= 5000 ? 15 : n >= 3000 ? 12 : n >= 1000 ? 14 : 8
  return 8  // objetivo escrito en palabras ("libertad financiera", "vivir de esto"): hay ambición, sin cifra
}

// situación laboral / del negocio (0–10)
export function situationPoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["negocio propio", "mi propio negocio", "dueno de negocio", "mi empresa", "emprendedor"])) return 10
  if (has(v, ["freelance", "independiente", "consultor", "profesional"])) return 8
  if (has(v, ["desempleado", "sin trabajo", "sin empleo", "no trabajo"])) return 1
  if (has(v, ["estudiante", "estudio", "universidad", "facultad", "colegio", "secundario"])) return 3
  if (has(v, ["empleado", "relacion de dependencia", "trabajo en"])) return 6
  return 5
}

function agePoints(value: unknown): number | null {
  const v = norm(value)
  if (!v) return null
  if (has(v, ["-18", "menor de 18"])) return -100
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) return null
  return n < 18 ? -100 : 0
}

export function autoScoreLead(row: ScoreInput): ScoreResult {
  const capital = capitalPoints(row.inversion)
  const ingresos = incomePoints(row.ingresos)
  const etapa = stagePoints(row.intentos_previos)
  const objetivo = goalPoints(row.motivo_urgencia)
  const situacion = situationPoints(row.ocupacion)
  const edad = agePoints(row.edad)
  const desglose = { capital, ingresos, etapa, objetivo, situacion }
  const reconocidos = Object.values(desglose).filter((v) => v !== null).length
  if (!reconocidos) return null
  if (edad === -100) return { calificacion: "LEAD D", motivo: "menor de 18: bloqueado", puntos: 0, desglose }
  // Sin capital declarado y sin ingresos ni etapa no hay evidencia suficiente para calificar.
  if (capital === null && ingresos === null && etapa === null) return null
  if (capital === null && reconocidos < 2) return null
  const puntos = (capital ?? 0) + (ingresos ?? 0) + (etapa ?? 0) + (objetivo ?? 0) + (situacion ?? 0)
  let grade: LeadGrade = puntos >= CORTES.S ? "LEAD S" : puntos >= CORTES.A ? "LEAD A" : puntos >= CORTES.B ? "LEAD B" : puntos >= CORTES.C ? "LEAD C" : "LEAD D"
  const ORDEN: LeadGrade[] = ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D"]
  const tope = (g: LeadGrade, max: LeadGrade) => (ORDEN.indexOf(g) < ORDEN.indexOf(max) ? max : g)
  if (grade === "LEAD S" && (capital ?? 0) < 30) grade = "LEAD A"  // S exige capital para entrar al programa
  if ((capital ?? 0) <= 6 && (ingresos ?? 0) <= 6) grade = tope(grade, "LEAD C")  // sin capital y con ingresos muy bajos: no pasa de C
  const faltan = Object.entries(desglose).filter(([, v]) => v === null).map(([k]) => k)
  return { calificacion: grade, motivo: `${puntos}/100 · capital ${capital ?? "?"} · ingresos ${ingresos ?? "?"} · etapa ${etapa ?? "?"} · objetivo ${objetivo ?? "?"} · situación ${situacion ?? "?"}${faltan.length ? ` · sin dato: ${faltan.join(", ")}` : ""}`, puntos, desglose }
}
