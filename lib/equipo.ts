/* Equipo comercial de la operación. Todo sale de variables NEXT_PUBLIC_* (se
   inyectan al compilar), así ninguna pantalla ni ruta trae nombres propios.
   Las listas van separadas por coma. Quién puede entrar al CRM y con qué rol
   sigue saliendo de la tabla team_members: estas variables solo alimentan
   desplegables, alias de nombres cargados a mano y rankings. */
import { BRAND } from "@/lib/brand"

const lista = (v: string | undefined) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean)
function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "")
}
const norm = (s: string) => stripAccents(s).toLowerCase().trim()

/** Dueño o dueña del negocio (primer nombre). También cierra ventas si figura en los closers. */
export const CEO = String(process.env.NEXT_PUBLIC_CRM_CEO || "").trim()
/** Responsable comercial (primer nombre). Vacío si no hay. */
export const SALES_MANAGER = String(process.env.NEXT_PUBLIC_CRM_SALES_MANAGER || "").trim()

/** Closers que se ofrecen en los desplegables (Agendas, Pagos, Pipeline). */
export const CLOSERS_ACTIVOS = lista(process.env.NEXT_PUBLIC_CRM_CLOSERS)

/** Setters activos (se ofrecen en los desplegables de registros nuevos). */
export const SETTERS_ACTIVOS = lista(process.env.NEXT_PUBLIC_CRM_SETTERS)
/** Setters que ya no están: solo se ofrecen en registros viejos (hasta SETTERS_HISTORICOS_HASTA). */
export const SETTERS_HISTORICOS = lista(process.env.NEXT_PUBLIC_CRM_SETTERS_HISTORICOS)
export const SETTERS_TODOS = [...SETTERS_ACTIVOS, ...SETTERS_HISTORICOS.filter((s) => !SETTERS_ACTIVOS.includes(s))]
/** Registros con fecha hasta este mes inclusive (AAAA-MM) muestran también a los históricos. */
export const SETTERS_HISTORICOS_HASTA = String(process.env.NEXT_PUBLIC_CRM_SETTERS_HISTORICOS_HASTA || "").trim()

export function settersPara(fecha?: string | null): string[] {
  if (!SETTERS_HISTORICOS_HASTA) return SETTERS_TODOS
  return fecha && String(fecha).slice(0, 7) <= SETTERS_HISTORICOS_HASTA ? SETTERS_TODOS : SETTERS_ACTIVOS
}

/** Responsables que se ofrecen en Contenido (en mayúsculas, como se guardan). */
export const RESPONSABLES_CONTENIDO = lista(process.env.NEXT_PUBLIC_CRM_RESPONSABLES_CONTENIDO).map((s) => s.toUpperCase())
/** Quién graba las piezas (vista "Grabar YA"). Vacío = el primero de los responsables de contenido. */
export const QUIEN_GRABA = (() => {
  const l = lista(process.env.NEXT_PUBLIC_CRM_QUIEN_GRABA).map((s) => s.toUpperCase())
  return l.length ? l : RESPONSABLES_CONTENIDO.slice(0, 1)
})()

/* Alias: "apodo=Nombre;otro=Nombre". Un apodo o una variante cargada a mano
   ("maxi", "cris") se guarda y se cuenta con el nombre canónico. */
const ALIAS: Record<string, string> = Object.fromEntries(
  String(process.env.NEXT_PUBLIC_CRM_ALIAS || "")
    .split(";")
    .map((p) => p.split("="))
    .filter((p) => p.length === 2 && p[0].trim() && p[1].trim())
    .map(([alias, nombre]) => [norm(alias), nombre.trim()]),
)
// Cada integrante es alias de sí mismo (así "ANA" o "ana" vuelven "Ana").
for (const n of [CEO, SALES_MANAGER, ...CLOSERS_ACTIVOS, ...SETTERS_TODOS]) {
  const primero = n.split(/\s+/)[0]
  if (primero && !ALIAS[norm(primero)]) ALIAS[norm(primero)] = primero
}

/* Calendario general: el nombre con el que llegan las agendas que no tienen
   una persona asignada (por ejemplo, el nombre del negocio). No es un closer:
   no aparece en rankings. Si querés que esas agendas se cuenten a alguien,
   agregá un alias ("minegocio=Ana"). */
export const CALENDARIO_GENERAL = (() => {
  const l = lista(process.env.NEXT_PUBLIC_CRM_CALENDARIO_GENERAL).map(norm)
  return l.length ? l : [norm(BRAND.name)]
})()
export function esCalendarioGeneral(nombre: unknown): boolean {
  const v = norm(String(nombre || ""))
  return Boolean(v) && CALENDARIO_GENERAL.includes(v) && !ALIAS[v]
}

/** Primer nombre normalizado por alias. Nombres desconocidos vuelven tal cual (primera palabra), sin inventar. */
export function nombreCanonico(value: unknown): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const completo = ALIAS[norm(raw)]
  if (completo) return completo
  const first = raw.split(/\s+/)[0] || ""
  return ALIAS[norm(first)] || first
}

/** Nombres completos del equipo en minúsculas y sin tildes, para reconocer
    llamadas de venta en Fathom por el título o los participantes. */
export const CLOSERS_NOMBRE_COMPLETO = lista(process.env.NEXT_PUBLIC_CRM_FATHOM_NOMBRES).map(norm)

/** Primeros nombres de quienes cierran, en minúsculas y sin tildes (para leer títulos de reuniones). */
export const CLOSERS_PRIMER_NOMBRE = [...new Set([...CLOSERS_ACTIVOS, CEO, SALES_MANAGER].filter(Boolean).map((n) => norm(n.split(/\s+/)[0])))]
