import { nombreCanonico } from "@/lib/equipo"

// Normaliza el nombre del closer que llega de iClosed/ingest (apodos cargados en
// NEXT_PUBLIC_CRM_ALIAS, como "anita" → "Ana"). Nombres desconocidos vuelven tal cual.
export function canonicalCloserName(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return raw
  // nombreCanonico devuelve el primer nombre normalizado ("Ana Pérez" → "Ana", "anita" → "Ana");
  // el CRM identifica a los closers por ese primer nombre
  return nombreCanonico(raw) || raw
}

// No hay una regla de asignación por calificación (por ejemplo, S/A/B a un
// closer y C/D a otro): se respeta el closer que traiga la agenda y no se
// asigna ninguno automáticamente. Si querés rutear por puntaje, hacelo acá.
export function closerForScore(_score: string | null | undefined): string | null {
  return null
}
