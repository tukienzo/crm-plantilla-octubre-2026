"use client"

import useSWR from "swr"
import { ANGULOS_SEED, DOLORES_SEED, type AnguloBanco } from "@/lib/angulos-semilla"

// Banco de ángulos para las pantallas. Sale de /api/angulos (tabla crm_angulos, editable desde
// Contenido → Banco de ángulos). Mientras carga, o si la API fallara, devuelve la semilla de
// lib/angulos-semilla: los desplegables nunca quedan vacíos.

const RESPALDO: AnguloBanco[] = ANGULOS_SEED.map((a) => ({
  id: String(a.numero), numero: a.numero, titulo: a.titulo, dolor: a.dolor,
  activo: true, notas: null, etiqueta: `${a.numero} · ${a.titulo}`, usos: 0,
}))

const fetcher = (url: string) => fetch(url).then(async (r) => {
  const b = await r.json()
  if (!r.ok) throw new Error(b.error || "No se pudo cargar el banco de ángulos")
  return b as { angulos: AnguloBanco[]; dolores: string[] }
})

// Número de la etiqueta "12 · título", para poder resolver la categoría aunque el título
// haya cambiado después de que la pieza se guardó.
const numeroDe = (etiqueta: string) => {
  const m = etiqueta.trim().match(/^#?\s*(\d{1,3})\s*(?:[·—\-:)]|$)/)
  return m ? Number(m[1]) : null
}

export function useAngulos() {
  const { data, error, isLoading, mutate } = useSWR("/api/angulos", fetcher, { revalidateOnFocus: false })
  const angulos = data?.angulos?.length ? data.angulos : RESPALDO
  // Categoría de un ángulo guardado (PROBLEMA, SOLUCIÓN, PRODUCTO, MENTALIDAD, VOLUMEN/TOFU).
  // Es lo que define el color en las pantallas (ver lib/colores-angulo).
  const categoriaDe = (etiqueta: string | null | undefined): string | null => {
    const texto = String(etiqueta || "").trim()
    if (!texto) return null
    const exacta = angulos.find((a) => a.etiqueta === texto)
    if (exacta) return exacta.dolor
    const numero = numeroDe(texto)
    return (numero !== null && angulos.find((a) => a.numero === numero)?.dolor) || null
  }
  return {
    categoriaDe,
    angulos,
    activos: angulos.filter((a) => a.activo),
    // Lo que va en los desplegables donde se elige el ángulo de una pieza.
    etiquetas: angulos.filter((a) => a.activo).map((a) => a.etiqueta),
    dolores: data?.dolores?.length ? data.dolores : [...DOLORES_SEED],
    cargando: isLoading,
    error,
    recargar: mutate,
  }
}
