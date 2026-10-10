// Tareas pendientes del equipo: tipos y reglas puras (sin base), compartidas por la API y la pantalla.
// Una tarea de una vez está hecha cuando se tildó. Una diaria, si se tildó hoy; una semanal, si se tildó
// en la semana en curso (de lunes a domingo). «Hoy» es siempre la fecha de Argentina.

export const FRECUENCIAS = ["una_vez", "diaria", "semanal"] as const
export type Frecuencia = (typeof FRECUENCIAS)[number]

export const ETIQUETA_FRECUENCIA: Record<Frecuencia, string> = {
  una_vez: "Una vez",
  diaria: "Todos los días",
  semanal: "Todas las semanas",
}

export const ESTADOS = ["pendiente", "en_progreso", "hecha"] as const
export type Estado = (typeof ESTADOS)[number]
export const esEstado = (v: unknown): v is Estado => (ESTADOS as readonly string[]).includes(String(v))

export type TareaFila = {
  id: string
  miembro_id: number
  titulo: string
  detalle: string | null
  frecuencia: Frecuencia
  vence: string | null
  origen: string | null
  origen_url: string | null
  hecha_at: string | null
  hecha_por: string | null
  en_progreso_desde: string | null
  orden: number
  creada_por: string | null
  created_at: string
}

// hecha: null = la tarea todavía no existía ese día o esa semana (no cuenta).
export type MarcaHistorial = { clave: string; etiqueta: string; hecha: boolean | null }

export type Tarea = Omit<TareaFila, "creada_por" | "hecha_por" | "en_progreso_desde"> & {
  hecha_por?: string | null   // solo le llega a un CEO
  estado: Estado
  hecha: boolean
  vencida: boolean
  historial: MarcaHistorial[]   // últimos 7 días (diaria) o últimas 4 semanas (semanal); vacío en las de una vez
}

export type MiembroTareas = { id: number; nombre: string; rol: string }

export type Prioridad = { texto: string; por: string | null; at: string }

export type RespuestaTareas = {
  yo: MiembroTareas & { admin: boolean }
  hoy: string
  miembros: MiembroTareas[]
  tareas: Tarea[]
  prioridad: Prioridad | null
}

export const esAdminTareas = (rol: string | null | undefined) => rol === "CEO"

export const esFrecuencia = (v: unknown): v is Frecuencia => (FRECUENCIAS as readonly string[]).includes(String(v))

const ZONA = "America/Argentina/Buenos_Aires"

// Fecha AAAA-MM-DD en Argentina.
export function hoyArgentina(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d)
}

// Suma días a una fecha AAAA-MM-DD sin pasar por husos horarios.
export function sumarDias(fecha: string, dias: number) {
  const [a, m, d] = fecha.split("-").map(Number)
  const t = new Date(Date.UTC(a, m - 1, d + dias))
  return t.toISOString().slice(0, 10)
}

// Lunes de la semana de una fecha AAAA-MM-DD.
export function lunesDe(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay() // 0 domingo … 6 sábado
  return sumarDias(fecha, -((dow + 6) % 7))
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]

function etiquetaDia(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d}/${m}`
}

// Estado de una tarea a partir de sus tildes (fechas AAAA-MM-DD) y de hoy.
export function estadoTarea(fila: TareaFila, marcas: string[], hoy: string, conAutor = false): Tarea {
  const set = new Set(marcas)
  const alta = hoyArgentina(new Date(fila.created_at))
  let hecha = false
  let historial: MarcaHistorial[] = []
  if (fila.frecuencia === "una_vez") {
    hecha = Boolean(fila.hecha_at)
  } else if (fila.frecuencia === "diaria") {
    hecha = set.has(hoy)
    historial = Array.from({ length: 7 }, (_, i) => {
      const f = sumarDias(hoy, i - 6)
      return { clave: f, etiqueta: etiquetaDia(f), hecha: f < alta ? null : set.has(f) }
    })
  } else {
    const lunes = lunesDe(hoy)
    const semanaHecha = (desde: string) => marcas.some((f) => f >= desde && f <= sumarDias(desde, 6))
    hecha = semanaHecha(lunes)
    historial = Array.from({ length: 4 }, (_, i) => {
      const desde = sumarDias(lunes, (i - 3) * 7)
      return { clave: desde, etiqueta: `semana del ${etiquetaDia(desde).split(" ")[1]}`, hecha: sumarDias(desde, 6) < alta ? null : semanaHecha(desde) }
    })
  }
  const { creada_por: _c, hecha_por, en_progreso_desde, ...resto } = fila
  void _c
  // «En progreso» vale para el período en curso (hoy, esta semana o hasta terminarla).
  const enProgreso = !hecha && Boolean(en_progreso_desde) && (
    fila.frecuencia === "una_vez"
    || (fila.frecuencia === "diaria" && en_progreso_desde === hoy)
    || (fila.frecuencia === "semanal" && String(en_progreso_desde) >= lunesDe(hoy)))
  return {
    ...resto,
    ...(conAutor ? { hecha_por } : {}),
    estado: hecha ? "hecha" : enProgreso ? "en_progreso" : "pendiente",
    hecha,
    vencida: fila.frecuencia === "una_vez" && !hecha && Boolean(fila.vence) && String(fila.vence) < hoy,
    historial,
  }
}

// Orden en pantalla: primero lo pendiente (vencidas, con fecha, sin fecha), después lo hecho. Las diarias y
// semanales no se mueven al tildarlas, para que el toque siguiente no caiga en otra tarea.
export function ordenarTareas(tareas: Tarea[]) {
  const pesoHecha = (t: Tarea) => (t.frecuencia === "una_vez" ? Number(t.hecha) : 0)
  return [...tareas].sort((a, b) =>
    pesoHecha(a) - pesoHecha(b)
    || Number(b.vencida) - Number(a.vencida)
    || (a.vence || "9999").localeCompare(b.vence || "9999")
    || a.orden - b.orden
    || a.created_at.localeCompare(b.created_at))
}
