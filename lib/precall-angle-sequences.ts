export type PrecallSequence = { angle: string; objective: string; message: string; asset: string; setterPrompt: string }

// Secuencias de precall por ángulo de entrada (códigos "P1", "P2"…, al principio de `angulo_entrada`).
// Son ejemplos genéricos: reemplazalos por tus ángulos y por casos reales cargados en Testimonios.
export const PRECALL_ANGLE_SEQUENCES: PrecallSequence[] = [
  { angle: "P1", objective: "Mostrar que se puede arrancar de cero", message: "Antes de la llamada mirá este caso: arrancó sin experiencia y llegó a su primer resultado siguiendo el proceso.", asset: "Caso P1 · arranque desde cero", setterPrompt: "¿Qué es lo que más te frena hoy para arrancar?" },
  { angle: "P2", objective: "Bajar parálisis y aumentar compromiso", message: "Te dejo un caso de alguien que sabía qué hacer, pero no lo terminaba de ejecutar.", asset: "Caso P2 · de la parálisis a la acción", setterPrompt: "¿Qué pasa exactamente cuando te sentás a avanzar?" },
  { angle: "P4", objective: "Diferenciar interés de resultado", message: "Este caso es de alguien que generaba interés pero no lograba convertirlo en resultados. Es muy parecido a lo que vamos a ver en la llamada.", asset: "Caso P4 · interés sin resultado", setterPrompt: "¿En qué punto se te frena normalmente el proceso?" },
  { angle: "P8", objective: "Aprovechar un momento de cambio sin presionar", message: "Mirá este caso antes de la llamada: usó un momento de cambio para ordenar su plan, sin decisiones apuradas.", asset: "Caso P8 · momento de cambio", setterPrompt: "¿Qué querés que sea distinto dentro de seis meses?" },
]

export function getPrecallSequence(angle: string | null | undefined) {
  const code = String(angle || "").match(/^P\d/)?.[0]
  return PRECALL_ANGLE_SEQUENCES.find((item) => item.angle === code) || null
}
