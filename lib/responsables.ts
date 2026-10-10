// Quién está a cargo de una pieza o de un video largo. El nombre se guarda como texto (viene de
// cargas a mano viejas), así que "Ana Pérez", "ANA PEREZ" y "Ana Perez" serían tres responsables
// distintos en los filtros y en los desplegables. Acá se colapsan en uno solo.

export const SIN_ASIGNAR = "SIN ASIGNAR"
// Etiquetas genéricas que significan "todavía no tiene dueño".
const GENERICOS = new Set([SIN_ASIGNAR, "EDITOR", "SIN RESPONSABLE", "SIN ASIGNADO", "-"])

// Clave de comparación: sin acentos, sin mayúsculas, sin espacios de más.
export const claveNombre = (v: string | null | undefined) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase()

// Nombre que se muestra. Vacío o genérico → SIN ASIGNAR.
export function responsableDe(v: string | null | undefined) {
  const limpio = String(v ?? "").replace(/\s+/g, " ").trim()
  return !limpio || GENERICOS.has(claveNombre(limpio)) ? SIN_ASIGNAR : limpio
}

// Junta varias listas de nombres en una sola, sin repetidos. Cuando dos entradas son la misma
// persona escrita distinto gana la primera que aparece, por eso los nombres de las cuentas del
// equipo van antes que lo que quedó escrito a mano en una pieza.
export function unificarResponsables(...listas: Array<Array<string | null | undefined> | undefined>) {
  const vistos = new Map<string, string>()
  for (const lista of listas) {
    for (const bruto of lista || []) {
      const nombre = responsableDe(bruto)
      const clave = claveNombre(nombre)
      if (!vistos.has(clave)) vistos.set(clave, nombre)
    }
  }
  return [...vistos.values()]
}

// Dos nombres son la misma persona si su clave coincide.
export const mismaPersona = (a: string | null | undefined, b: string | null | undefined) =>
  claveNombre(responsableDe(a)) === claveNombre(responsableDe(b))
