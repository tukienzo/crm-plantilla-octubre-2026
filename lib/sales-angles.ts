import { ANGULOS_SEMILLA } from "@/lib/angulos-semilla"

// Etiquetas canónicas de ángulo que se guardan en `crm_content_assets.angle` y
// en los eventos de trazabilidad: "N · <título>" sobre la semilla del banco de
// ángulos (lib/angulos-semilla). No se inventan ángulos: si un texto no mapea,
// vuelve tal cual y el consumidor decide (ver knownSalesAngle en lib/trace-intelligence).
export const SALES_ANGLES: readonly string[] = ANGULOS_SEMILLA.map((a) => `${a.id} · ${a.titulo}`)

export function salesAngleLabel(id: number): string | null {
  const angulo = ANGULOS_SEMILLA.find((a) => a.id === id)
  return angulo ? `${angulo.id} · ${angulo.titulo}` : null
}

// Número de ángulo cuando el texto arranca con él: "12", "12 ·", "#12",
// "12 - ...". Exige separador o fin de texto para no confundir "20 caminos"
// ni "10K" con un número de ángulo.
const NUMBER_PREFIX = /^#?\s*(\d{1,3})\s*(?:[·—\-:)]|$)/
// El tope no es la semilla: desde Contenido → Banco de ángulos se agregan ángulos con números
// nuevos. Se acepta cualquier número razonable; si no existe en la semilla, salesAngleLabel
// devuelve null y el consumidor se queda con el texto tal cual.
export function salesAngleId(value: unknown): number | null {
  const match = String(value ?? "").trim().match(NUMBER_PREFIX)
  if (!match) return null
  const id = Number(match[1])
  return id >= 1 && id <= 999 ? id : null
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

// No se adivina el ángulo a partir de texto libre: se elige de un desplegable que sale del
// banco (Contenido → Banco de ángulos), así que siempre llega como etiqueta canónica. Texto
// desconocido vuelve tal cual.

// Devuelve la etiqueta canónica si el valor es una etiqueta, un número de
// ángulo o el título exacto. Vacío → "Sin ángulo".
// Texto desconocido → vuelve tal cual (mismo contrato que siempre).
export function canonicalSalesAngle(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!raw) return "Sin ángulo"
  if (SALES_ANGLES.includes(raw)) return raw
  const byId = salesAngleId(raw)
  if (byId) return salesAngleLabel(byId) || raw
  const text = normalize(raw)
  const exact = ANGULOS_SEMILLA.find((a) => normalize(a.titulo) === text)
  if (exact) return salesAngleLabel(exact.id) || raw
  return raw
}
