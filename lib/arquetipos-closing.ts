// Lógica de Arquetipos, Scoring y Calificación del CRM.
// FUENTE DE VERDAD ÚNICA: la base de datos del CRM (registros guardados).
// REGLA ESTRICTA: Cero inferencias heurísticas, cero palabras clave adivinadas,
// cero completado automático de huecos. Si un dato no está en el CRM, es "SIN CLASIFICAR" o "SIN SCORING".

export type MacroArquetipo = "DUEÑO DE NEGOCIO" | "EMPLEADO" | "ESTUDIANTE" | "SIN CLASIFICAR"

export type ArquetipoCrm = {
  macro: MacroArquetipo
  subarquetipo: string | null
}

/**
 * Lee el macro-arquetipo y subarquetipo EXACTAMENTE desde los campos que ya están
 * guardados en el CRM.
 *
 * Valores canónicos guardados en el CRM (ej. selector de Ocupación en Centro Agendas):
 * - "Negocio" / "DUEÑO DE NEGOCIO" => DUEÑO DE NEGOCIO
 * - "Empleado" / "EMPLEADO" => EMPLEADO
 * - "Estudiante" / "ESTUDIANTE" => ESTUDIANTE
 *
 * Si un lead no tiene arquetipo asignado en el CRM:
 * retorna estrictamente macro: "SIN CLASIFICAR".
 *
 * Para el subarquetipo: solo se expone el valor textual REAL guardado en el CRM
 * (por ejemplo, si el CRM registró "Contador" o "Docente"). No se deriva automáticamente.
 */
export function leerArquetipoCrm(
  ocupacionCrm?: string | null,
  arquetipoDirecto?: string | null,
  subarquetipoDirecto?: string | null
): ArquetipoCrm {
  const arqRaw = String(arquetipoDirecto || "").trim().toUpperCase()
  const ocuRaw = String(ocupacionCrm || "").trim()
  const ocuUpper = ocuRaw.toUpperCase()

  let macro: MacroArquetipo = "SIN CLASIFICAR"
  let subarquetipo: string | null = subarquetipoDirecto ? String(subarquetipoDirecto).trim() : null

  // Si ocuRaw tiene separador " - " o ": " (ej: "Empleado - Contador" o "Negocio: Gastronomía")
  if (ocuRaw.includes(" - ") || ocuRaw.includes(": ")) {
    const separator = ocuRaw.includes(" - ") ? " - " : ": "
    const parts = ocuRaw.split(separator)
    const firstUpper = parts[0].trim().toUpperCase()
    if (firstUpper.includes("NEGOCIO") || firstUpper.includes("DUEÑO") || firstUpper.includes("DUENO")) {
      macro = "DUEÑO DE NEGOCIO"
    } else if (firstUpper.includes("EMPLEADO")) {
      macro = "EMPLEADO"
    } else if (firstUpper.includes("ESTUDIANTE")) {
      macro = "ESTUDIANTE"
    }
    if (!subarquetipo && parts[1]?.trim()) {
      subarquetipo = parts[1].trim()
    }
  } else {
    // 1. Verificar si tiene cargado un macro arquetipo canónico en el CRM
    if (
      arqRaw === "DUEÑO DE NEGOCIO" ||
      arqRaw === "DUENO DE NEGOCIO" ||
      arqRaw === "NEGOCIO" ||
      ocuUpper === "NEGOCIO" ||
      ocuUpper === "DUEÑO DE NEGOCIO" ||
      ocuUpper === "DUENO DE NEGOCIO"
    ) {
      macro = "DUEÑO DE NEGOCIO"
    } else if (arqRaw === "EMPLEADO" || ocuUpper === "EMPLEADO") {
      macro = "EMPLEADO"
    } else if (arqRaw === "ESTUDIANTE" || ocuUpper === "ESTUDIANTE") {
      macro = "ESTUDIANTE"
    }

    // 2. Subarquetipo real:
    // Si no se pasó un subarquetipo directo pero el CRM tiene guardado un valor de ocupación
    // que no es el selector genérico ("Negocio", "Empleado", "Estudiante", "No se le envió"),
    // se conserva fielmente ese texto como subarquetipo guardado.
    if (!subarquetipo && ocuRaw && !["Negocio", "Empleado", "Estudiante", "No se le envió"].includes(ocuRaw)) {
      subarquetipo = ocuRaw
    }
  }

  return {
    macro,
    subarquetipo: subarquetipo || null,
  }
}

/**
 * REGLA CANÓNICA DEL CRM (la misma de app/api/metricas/route.ts):
 * "Una agenda calificada es LEAD A, B o C (y LEAD S); LEAD D no."
 * Reutiliza exactamente la misma definición del CRM sin crear lógicas paralelas.
 */
export const CALIFS_CALIFICADAS_CRM = new Set([
  "S", "A", "B", "C",
  "LEAD S", "LEAD A", "LEAD B", "LEAD C"
])

export function esAgendaCalificada(calificacion?: string | null, scoreGrade?: string | null): boolean {
  const c = String(calificacion || scoreGrade || "").trim().toUpperCase()
  return CALIFS_CALIFICADAS_CRM.has(c)
}

/**
 * Lee el Lead Scoring guardado en el CRM.
 * Si no tiene Lead Scoring cargado en el CRM, retorna "SIN SCORING".
 * NUNCA inventa un score heurístico.
 */
export function leerLeadScoringCrm(
  leadScoreGrade?: string | null,
  calificacion?: string | null,
  leadScorePuntos?: number | null
): string {
  const grado = String(leadScoreGrade || calificacion || "").trim().toUpperCase()
  if (!grado || grado === "NO SE LE ENVIÓ" || grado === "SIN CALIFICAR" || grado === "NULL" || grado === "UNDEFINED") {
    return "SIN SCORING"
  }

  if (typeof leadScorePuntos === "number" && !isNaN(leadScorePuntos) && leadScorePuntos > 0) {
    return `${grado} (${leadScorePuntos} pts)`
  }

  return grado
}
