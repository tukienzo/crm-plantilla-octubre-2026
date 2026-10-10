// Contexto del negocio que reciben los modelos de IA del CRM (guionista de Contenido, Radar,
// resumen de setting, análisis de WhatsApp y de llamadas). Es el único lugar donde se describe
// la oferta, el cliente ideal y las reglas de comunicación.
//
// Al instalar: completá estas constantes con los datos reales del negocio (o pedíselo a la IA
// que te instala el CRM: EMPEZA-ACA.md, paso 5). Mientras digan "sin cargar", los modelos
// trabajan con un contexto genérico y lo avisan en sus respuestas.
//
// El texto es estable a propósito (sin fechas ni datos que cambien por pedido): es el prefijo que
// se cachea entre llamadas a la API.
import { BRAND, PRECIO_BASE } from "@/lib/brand"
import { PROGRAMAS } from "@/lib/programas"

/** Qué vende el negocio y qué promete, en dos o tres oraciones. */
export const OFERTA = `Programa de formación y acompañamiento high ticket (sin cargar: describí acá qué vendés, qué resultado promete y cómo se entrega).`

/** A quién le habla el contenido: edad, situación, dolores reales (idealmente con frases textuales de leads). */
export const CLIENTE_IDEAL = `Sin cargar. Describí al cliente ideal: quién es, qué le pasa hoy, qué quiere lograr y qué lo frena.`

/** Mercado y canales de adquisición. */
export const MERCADO = `Mercado hispanohablante. Adquisición: contenido orgánico de Instagram, embudo de mensajes directos con palabra clave y llamada de venta.`

/** Reglas de comunicación que no se negocian (una por línea, empezando con "- "). */
export const REGLAS = `- Prohibido prometer resultados garantizados, ofrecer entregables que el programa no incluye, exagerar casos de éxito o inventar cifras.
- Los casos de éxito se citan solo si están cargados en el CRM (Testimonios), con su cifra y su período reales.
- Idioma: español rioplatense con voseo, directo, cotidiano, sin relleno corporativo ni lenguaje de gurú.`

/** Mezcla del mes por etapa de consciencia (la usa el guionista y el calendario de contenido). */
export const MEZCLA = `40 % problema, 30 % mentalidad, 20 % solución, 10 % producto.`

/** Texto completo que se le pasa a los modelos. */
export function contextoNegocio(): string {
  const precio = PRECIO_BASE > 0 ? ` (precio de lista USD ${PRECIO_BASE})` : ""
  const programas = PROGRAMAS.map((p) => p.nombreCompleto).join(", ")
  const cuenta = BRAND.igArroba ? ` La cuenta de Instagram es ${BRAND.igArroba}.` : ""
  return `${BRAND.name}: ${OFERTA}${precio}. Programas: ${programas}.${cuenta} ${MERCADO} CTA habitual: comentar o mandar por DM la palabra "${BRAND.ctaKeyword}" a cambio de un recurso.

A QUIÉN LE HABLA EL CONTENIDO
${CLIENTE_IDEAL}

REGLAS QUE NO SE NEGOCIAN
${REGLAS}

ETAPAS DE CONSCIENCIA (la taxonomía del banco de ángulos)
- tofu / volumen: pieza de alcance (herramientas, listas, comparativas), sin bajada a producto.
- problema: nombra el dolor del cliente ideal.
- solucion: muestra el camino.
- producto: caso de éxito o el programa.
- mentalidad: historia personal, procrastinación, creencias.
Mezcla del mes: ${MEZCLA}`
}
