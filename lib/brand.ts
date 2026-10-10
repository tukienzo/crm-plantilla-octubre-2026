/* Marca y datos fijos del negocio. Todo sale de variables NEXT_PUBLIC_* (se
   inyectan al compilar), así ninguna pantalla trae un nombre propio. Se
   completan en .env.local (y en Vercel); sin valores, el CRM se llama "Mi CRM".
   Después de cambiarlas hay que reiniciar `dev` o volver a hacer `build`. */

const txt = (v: string | undefined, porDefecto = "") => String(v ?? "").trim() || porDefecto
const num = (v: string | undefined, porDefecto = 0) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : porDefecto
}

const nombre = txt(process.env.NEXT_PUBLIC_BRAND_NAME, "Mi CRM")
const handle = txt(process.env.NEXT_PUBLIC_BRAND_IG_HANDLE).replace(/^@/, "").toLowerCase()

export const BRAND = {
  /** Nombre del negocio: menú, pestaña del navegador, login, avisos. */
  name: nombre,
  /** Nombre corto (íconos de la app instalada). */
  shortName: txt(process.env.NEXT_PUBLIC_BRAND_SHORT_NAME, nombre),
  /** Frase debajo del nombre en el menú. */
  tagline: txt(process.env.NEXT_PUBLIC_BRAND_TAGLINE, "Centro de mando"),
  /** Descripción (pestaña, imagen al compartir). */
  description: txt(process.env.NEXT_PUBLIC_BRAND_DESCRIPTION, "CRM y centro de mando de la operación."),
  /** Razón social para las páginas legales (privacidad, términos, eliminación de datos). */
  legalName: txt(process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME, nombre),
  /** Mail de contacto que aparece en las páginas legales. */
  contactEmail: txt(process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL),
  /** Sitio web público del negocio (sin https://). */
  site: txt(process.env.NEXT_PUBLIC_BRAND_SITE).replace(/^https?:\/\//, "").replace(/\/$/, ""),
  /** Usuario de Instagram de la cuenta propia, sin @ ("micuenta"). */
  igHandle: handle,
  /** El mismo usuario con @ ("@micuenta"), o "" si no está configurado. */
  igArroba: handle ? `@${handle}` : "",
  /** Palabra clave del CTA principal (la que la gente comenta o manda por DM). */
  ctaKeyword: txt(process.env.NEXT_PUBLIC_BRAND_CTA_KEYWORD, "INFO").toUpperCase(),
}

/** Iniciales de la marca para el logo genérico ("Mi CRM" → "MC", "Estudio de Diseño" → "ED"). */
export const BRAND_INICIALES = (() => {
  const conectores = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "the", "of", "and", "&"])
  const todas = BRAND.name.split(/\s+/).filter(Boolean)
  const sinConectores = todas.filter((p) => !conectores.has(p.toLowerCase()))
  const partes = sinConectores.length >= 2 ? sinConectores : todas
  const ini = partes.length >= 2 ? partes[0][0] + partes[1][0] : BRAND.name.slice(0, 2)
  return ini.toUpperCase()
})()

/** Meta mensual de cash collected (USD). 0 = sin meta cargada. */
export const META_CASH_MENSUAL = num(process.env.NEXT_PUBLIC_META_CASH_MENSUAL)

/** Precio de lista del programa principal (USD, pago único). Valúa el pipeline y el ticket base. */
export const PRECIO_BASE = num(process.env.NEXT_PUBLIC_PRECIO_BASE)
