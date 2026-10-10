export type RecordingWindow = {
  start: string
  end: string
}

// Ventana de la vista "Grabar YA": qué piezas entran en el bloque de grabación.
// Se fija a mano con NEXT_PUBLIC_GRABAR_DESDE y NEXT_PUBLIC_GRABAR_HASTA (AAAA-MM-DD) y solo
// cambia cuando el equipo habilita otro bloque. Sin configurar, va de hoy a pasado mañana
// (hora de Argentina).
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const diaART = (desfaseDias: number) =>
  new Date(Date.now() - 3 * 3600000 + desfaseDias * 86400000).toISOString().slice(0, 10)
const desde = String(process.env.NEXT_PUBLIC_GRABAR_DESDE || "").trim()
const hasta = String(process.env.NEXT_PUBLIC_GRABAR_HASTA || "").trim()

export const RECORDING_WINDOW: RecordingWindow = FECHA.test(desde) && FECHA.test(hasta)
  ? { start: desde, end: hasta }
  : { start: diaART(0), end: diaART(2) }
