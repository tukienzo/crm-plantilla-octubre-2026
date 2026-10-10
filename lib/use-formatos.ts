"use client"

import useSWR from "swr"

// Banco de formatos de pieza (tabla crm_formatos, se administra en Contenido → Formatos).
// Mientras carga, o si la API fallara, devuelve el catálogo original para que ningún
// desplegable quede vacío.

export type FormatoBanco = {
  id: string
  nombre: string
  tipo: string
  descripcion: string | null
  referencia_url: string | null
  portada_url: string | null
  notas: string | null
  activo: boolean
  orden: number
  usos: number
}

const RESPALDO: FormatoBanco[] = [
  "TALKING HEAD", "TALKING IMAGEN", "B-ROLL + VOZ EN OFF", "CÁMARA + PC", "REACCIÓN", "ANÁLISIS",
  "VOLUMEN", "PIZARRÓN", "MIRO", "HORIZONTAL", "TOP TIER", "TESTIMONIO", "CASO DE ÉXITO", "ESTRATEGIA", "CARRUSEL",
].map((nombre, i) => ({
  id: nombre, nombre, tipo: nombre === "CARRUSEL" ? "Carrusel" : "Reel",
  descripcion: null, referencia_url: null, portada_url: null, notas: null, activo: true, orden: (i + 1) * 10, usos: 0,
}))

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const b = await r.json()
  if (!r.ok) throw new Error(b.error || "No se pudo cargar el banco de formatos")
  return b as { formatos: FormatoBanco[]; tipos: string[]; admin: boolean }
})

export function useFormatos() {
  const { data, error, isLoading, mutate } = useSWR("/api/banco-formatos", fetcher, { revalidateOnFocus: false })
  const formatos = data?.formatos?.length ? data.formatos : RESPALDO
  return {
    formatos,
    activos: formatos.filter((f) => f.activo),
    // Lo que va en el desplegable de formato de una pieza.
    nombres: formatos.filter((f) => f.activo).map((f) => f.nombre),
    tipoDe: (nombre: string | null | undefined) =>
      formatos.find((f) => f.nombre.toLocaleUpperCase("es") === String(nombre || "").trim().toLocaleUpperCase("es"))?.tipo || null,
    tipos: data?.tipos?.length ? data.tipos : ["Reel", "Carrusel", "Historia", "Otro"],
    admin: Boolean(data?.admin),
    cargando: isLoading,
    error,
    recargar: mutate,
  }
}

// Vista previa de la referencia de un formato. Manda la portada cargada (subida a mano o bajada
// una vez del posteo); si no hay, se intenta derivar del link: las imágenes se muestran y de
// YouTube o Drive se saca la miniatura. Instagram y TikTok no dejan incrustar, así que sin portada
// quedan como botón: una miniatura rota se ve peor que un botón honesto.
// El campo de referencia a veces junta varios ejemplos pegados con espacios. Para abrir y para
// derivar la miniatura vale el primero.
export const primerLink = (url: string | null | undefined) => String(url || "").trim().split(/\s+/)[0] || null

export function previewFormato(f: Pick<FormatoBanco, "portada_url" | "referencia_url">) {
  const portada = previewDe(f.portada_url)
  return portada.tipo === "imagen" ? portada : previewDe(primerLink(f.referencia_url))
}

// Vista previa de la referencia de un formato. Las imágenes se muestran; de YouTube se saca la
// miniatura; el resto (Instagram, TikTok, Drive) queda como link, porque esos no dejan incrustar
// de forma confiable y una miniatura rota se ve peor que un botón honesto.
export function previewDe(url: string | null | undefined): { tipo: "imagen" | "link" | "ninguna"; src?: string; dominio?: string } {
  const u = String(url || "").trim()
  if (!u) return { tipo: "ninguna" }
  if (/\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u)) return { tipo: "imagen", src: u }
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/)
  if (yt) return { tipo: "imagen", src: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` }
  const drive = u.match(/drive\.google\.com\/(?:file\/d\/|.*[?&]id=)([\w-]{10,})/)
  if (drive) return { tipo: "imagen", src: `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w600` }
  try { return { tipo: "link", dominio: new URL(u).hostname.replace(/^www\./, "") } } catch { return { tipo: "link", dominio: u.slice(0, 40) } }
}
