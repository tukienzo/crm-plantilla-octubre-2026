import { ANGULOS_SEMILLA } from "@/lib/angulos-semilla"
import { salesAngleId } from "@/lib/sales-angles"

// Las categorías del banco de ángulos (ver lib/angulos-semilla), en el orden en que rota el
// Volumen semanal. El grupo de un ángulo es su etapa de consciencia.
export const VOLUME_DOLORES = ["PROBLEMA", "MENTALIDAD", "SOLUCIÓN", "PRODUCTO", "VOLUMEN/TOFU"] as const

type AngleGroup = typeof VOLUME_DOLORES[number]

// Mix de contenido por defecto (el mismo de MEZCLA en lib/negocio.ts): 40% problema, 30% mentalidad,
// 20% solución, 10% producto. Ajustalo a tu estrategia.
// VOLUMEN/TOFU va en 0 a propósito: se elige a mano y no entra en la rotación automática del Volumen.
export const VOLUME_ANGLE_MIX: Record<AngleGroup, number> = {
  PROBLEMA: 40,
  MENTALIDAD: 30,
  "SOLUCIÓN": 20,
  PRODUCTO: 10,
  "VOLUMEN/TOFU": 0,
}

// Nivel de consciencia que se guarda en awareness_level. Con el banco nuevo la categoría ya ES el
// nivel; VOLUMEN/TOFU no es una opción de awareness, así que se guarda como PROBLEMA (tope de embudo).
const GROUP_AWARENESS: Record<AngleGroup, string> = {
  PROBLEMA: "PROBLEMA",
  MENTALIDAD: "MENTALIDAD",
  "SOLUCIÓN": "SOLUCIÓN",
  PRODUCTO: "PRODUCTO",
  "VOLUMEN/TOFU": "PROBLEMA",
}

function isGroup(value: string): value is AngleGroup {
  return (VOLUME_DOLORES as readonly string[]).includes(value)
}

// Un ángulo del banco vivo (tabla crm_angulos). Cuando no se pasa banco, se usa la semilla
// de lib/angulos-semilla.
export type AnguloRotacion = { numero: number; titulo: string; dolor: string }
const SEMILLA: AnguloRotacion[] = ANGULOS_SEMILLA.map((a) => ({ numero: a.id, titulo: a.titulo, dolor: a.dolor }))

function anglesPorDolor(banco: AnguloRotacion[]) {
  const porDolor = {} as Record<AngleGroup, string[]>
  for (const dolor of VOLUME_DOLORES) porDolor[dolor] = []
  for (const a of banco) {
    if (!isGroup(a.dolor)) continue
    porDolor[a.dolor].push(`${a.numero} · ${a.titulo}`)
  }
  return porDolor
}

// Categoría de un ángulo canónico ("12 · ..."). Un número que no está en el banco vuelve null,
// igual que cualquier texto desconocido.
export function angleGroup(angle: string | null | undefined, banco: AnguloRotacion[] = SEMILLA): AngleGroup | null {
  const id = salesAngleId(angle)
  if (!id) return null
  const dolor = banco.find((a) => a.numero === id)?.dolor || ""
  return isGroup(dolor) ? dolor : null
}

export function nextVolumeAngle(existingAngles: Array<string | null | undefined>, banco: AnguloRotacion[] = SEMILLA) {
  const GROUP_ANGLES = anglesPorDolor(banco)
  const totalAfterInsert = existingAngles.length + 1
  const groupCounts = Object.fromEntries(
    VOLUME_DOLORES.map((group) => [group, 0]),
  ) as Record<AngleGroup, number>

  for (const angle of existingAngles) {
    const group = angleGroup(angle, banco)
    if (group) groupCounts[group]++
  }

  // Mayor déficit contra el mix; empate → orden del banco (rotación fija).
  const group = [...VOLUME_DOLORES].sort((a, b) => {
    const deficitA = totalAfterInsert * VOLUME_ANGLE_MIX[a] / 100 - groupCounts[a]
    const deficitB = totalAfterInsert * VOLUME_ANGLE_MIX[b] / 100 - groupCounts[b]
    return deficitB - deficitA || VOLUME_DOLORES.indexOf(a) - VOLUME_DOLORES.indexOf(b)
  })[0]

  // Dentro del dolor, el ángulo menos usado; empate → orden del banco.
  const candidates = GROUP_ANGLES[group]
  const candidateCounts = new Map(candidates.map((angle) => [angle, 0]))
  for (const angle of existingAngles) {
    const key = String(angle)
    if (candidateCounts.has(key)) candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1)
  }
  const angle = [...candidates].sort((a, b) =>
    (candidateCounts.get(a) || 0) - (candidateCounts.get(b) || 0) || candidates.indexOf(a) - candidates.indexOf(b),
  )[0]

  return { angle, awarenessLevel: GROUP_AWARENESS[group], dolor: group, mix: VOLUME_ANGLE_MIX }
}
