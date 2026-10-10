// Semilla del banco de ángulos de contenido.
//
// El banco VIVO está en la tabla `crm_angulos` y se edita desde Contenido → Banco de ángulos
// (/api/angulos). Esta lista es el respaldo si la base no respondiera, para que ningún
// desplegable quede vacío. Viene con ejemplos neutros: cargá los tuyos desde la pantalla
// (o reemplazá esta lista antes de instalar).
//
// La taxonomía es por etapa de consciencia: PROBLEMA (nombra el dolor), SOLUCIÓN (muestra el
// camino), PRODUCTO (casos y oferta), MENTALIDAD (historia, creencias) y VOLUMEN/TOFU (alcance).
export type AnguloSemilla = { id: number; titulo: string; dolor: string }

export const ANGULOS_SEMILLA: AnguloSemilla[] = [
  { id: 1, titulo: "EL PROBLEMA PRINCIPAL DE TU CLIENTE", dolor: "PROBLEMA" },
  { id: 2, titulo: "LO QUE YA PROBÓ Y NO LE FUNCIONÓ", dolor: "PROBLEMA" },
  { id: 3, titulo: "EL CAMINO PASO A PASO", dolor: "SOLUCIÓN" },
  { id: 4, titulo: "CASO DE ÉXITO", dolor: "PRODUCTO" },
  { id: 5, titulo: "CÓMO ES TRABAJAR CON NOSOTROS", dolor: "PRODUCTO" },
  { id: 6, titulo: "MI HISTORIA", dolor: "MENTALIDAD" },
  { id: 7, titulo: "HERRAMIENTAS Y RECURSOS", dolor: "VOLUMEN/TOFU" },
]

export const ANGULOS_SEMILLA_TITULOS = ANGULOS_SEMILLA.map((a) => a.titulo)

// Misma lista con el nombre de campo que usa la tabla (`numero`), para sembrarla y para el respaldo.
export const ANGULOS_SEED = ANGULOS_SEMILLA.map((a) => ({ numero: a.id, titulo: a.titulo, dolor: a.dolor }))

// Las categorías vigentes. La pantalla ofrece estas más cualquiera que se agregue desde el CRM.
export const DOLORES_SEED = ["PROBLEMA", "SOLUCIÓN", "PRODUCTO", "MENTALIDAD", "VOLUMEN/TOFU"] as const

// Un ángulo tal como lo devuelve /api/angulos.
export type AnguloBanco = {
  id: string
  numero: number
  titulo: string
  dolor: string
  activo: boolean
  notas: string | null
  etiqueta: string
  usos: number
}
