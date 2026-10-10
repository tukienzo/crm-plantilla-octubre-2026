export type Severity = "alta" | "media" | "baja"

export function slaHours(severity: Severity) {
  return severity === "alta" ? 2 : severity === "media" ? 24 : 72
}

export function engagementSignal(lastActivity: Date | null, now = new Date()) {
  if (!lastActivity) return "sin_evidencia" as const
  const days = Math.max(0, Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000))
  if (days >= 14) return "inactividad_14d" as const
  if (days >= 7) return "inactividad_7d" as const
  return "actividad_reciente" as const
}

