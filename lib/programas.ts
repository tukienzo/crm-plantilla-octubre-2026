// Catálogo de programas (lo que vende el negocio). Alimenta el selector de "Cargar pago",
// la duración para calcular fecha_baja y el total del contrato.
//
// Se configura sin tocar código, de dos maneras (ver .env.example):
//  1. Un solo programa (lo más común): NEXT_PUBLIC_PROGRAMA_NOMBRE, NEXT_PUBLIC_PRECIO_BASE (pago
//     único), NEXT_PUBLIC_PROGRAMA_CUOTAS ("2x1000,3x700") y NEXT_PUBLIC_PROGRAMA_MESES (duración).
//  2. Varios programas: NEXT_PUBLIC_CRM_PROGRAMAS con un JSON (si está, manda sobre lo anterior):
//     [{"id":"principal","nombre":"Programa Principal","corto":"Principal","meses":4,
//       "operaciones":[{"label":"Principal | $2000 PIF","total":2000}],"claves":["principal"]}]
//     "claves" son palabras que, si aparecen en una operación escrita a mano, la asocian al programa.
import { PRECIO_BASE } from "@/lib/brand"

export type ProgramaId = string

export type OperacionCatalogo = { label: string; total: number; meses?: number }

export type ProgramaDef = {
  id: ProgramaId
  nombreCompleto: string
  nombreCorto: string
  duracionMeses: number | null
  operaciones: OperacionCatalogo[]
  claves?: string[]
}

type ProgramaJson = {
  id?: string
  nombre?: string
  corto?: string
  meses?: number | null
  operaciones?: OperacionCatalogo[]
  claves?: string[]
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

function desdeJson(raw: string): ProgramaDef[] {
  try {
    const lista = JSON.parse(raw) as ProgramaJson[]
    if (!Array.isArray(lista)) return []
    return lista
      .filter((p) => p && (p.id || p.nombre))
      .map((p) => {
        const nombre = String(p.nombre || p.id)
        return {
          id: String(p.id || normalizar(nombre).replace(/[^a-z0-9]+/g, "_")),
          nombreCompleto: nombre,
          nombreCorto: String(p.corto || nombre),
          duracionMeses: p.meses == null ? null : Number(p.meses),
          operaciones: (p.operaciones || []).filter((o) => o && o.label).map((o) => ({ label: String(o.label), total: Number(o.total) || 0, ...(o.meses != null ? { meses: Number(o.meses) } : {}) })),
          claves: (p.claves || []).map((c) => normalizar(String(c))).filter(Boolean),
        }
      })
  } catch {
    console.error("[programas] NEXT_PUBLIC_CRM_PROGRAMAS no es un JSON válido; se usa el programa único")
    return []
  }
}

function programaUnico(): ProgramaDef[] {
  const nombre = String(process.env.NEXT_PUBLIC_PROGRAMA_NOMBRE || "").trim() || "Programa"
  const meses = Number(process.env.NEXT_PUBLIC_PROGRAMA_MESES || 0) || null
  const operaciones: OperacionCatalogo[] = []
  if (PRECIO_BASE > 0) operaciones.push({ label: `${nombre} | $${PRECIO_BASE} PIF`, total: PRECIO_BASE })
  // "2x1000,3x700" → "Programa | 2 x $1000" (total 2000), "Programa | 3 x $700" (total 2100)
  for (const parte of String(process.env.NEXT_PUBLIC_PROGRAMA_CUOTAS || "").split(",")) {
    const m = parte.trim().match(/^(\d+)\s*x\s*\$?\s*(\d+(?:\.\d+)?)$/i)
    if (!m) continue
    const n = Number(m[1]), monto = Number(m[2])
    operaciones.push({ label: `${nombre} | ${n} x $${monto}`, total: n * monto })
  }
  if (!operaciones.length) operaciones.push({ label: `${nombre} | PIF`, total: 0 })
  return [{ id: "principal", nombreCompleto: nombre, nombreCorto: nombre, duracionMeses: meses, operaciones, claves: [normalizar(nombre)] }]
}

export const PROGRAMAS: ProgramaDef[] = (() => {
  const json = String(process.env.NEXT_PUBLIC_CRM_PROGRAMAS || "").trim()
  const desdeConfig = json ? desdeJson(json) : []
  return desdeConfig.length ? desdeConfig : programaUnico()
})()

export function buscarPrograma(id: ProgramaId | null | undefined): ProgramaDef | undefined {
  return PROGRAMAS.find((p) => p.id === id)
}

// Programa al que pertenece una operación escrita a mano. Se prueba primero con los nombres más
// largos, así "Programa Pro" no cae en "Programa".
export function programaPorTexto(operacionLabel: string | null | undefined): ProgramaDef | undefined {
  const s = normalizar(operacionLabel || "")
  if (!s) return undefined
  const candidatos = PROGRAMAS.flatMap((p) =>
    [p.nombreCompleto, p.nombreCorto, p.id, ...(p.claves || [])].map((t) => ({ p, t: normalizar(String(t)) })),
  ).filter((c) => c.t.length >= 3).sort((a, b) => b.t.length - a.t.length)
  return candidatos.find((c) => s.includes(c.t))?.p
}

export function buscarProgramaPorOperacion(
  operacionLabel: string | null | undefined,
): { programa: ProgramaDef; operacionDef: OperacionCatalogo } | null {
  if (!operacionLabel) return null
  for (const programa of PROGRAMAS) {
    const operacionDef = programa.operaciones.find((o) => o.label === operacionLabel)
    if (operacionDef) return { programa, operacionDef }
  }
  return null
}

// Meses de una operación: override de la etiqueta ("8 meses", "1 año") o la duración del programa.
export function mesesDeOperacion(operacionLabel: string | null | undefined): number | null {
  const match = buscarProgramaPorOperacion(operacionLabel)
  if (match?.operacionDef.meses != null) return match.operacionDef.meses
  const s = normalizar(operacionLabel || "")
  const meses = s.match(/(\d+)\s*meses/)
  if (meses) return Number(meses[1])
  if (/\b1 ano\b/.test(s)) return 12
  const programa = match?.programa || programaPorTexto(operacionLabel)
  return programa?.duracionMeses ?? null
}

export function resolverInfoPrograma(
  operacionLabel: string | null | undefined,
  filasFallback: { monto: number }[],
): { nombrePrograma: string; duracionLabel: string | null; total: number } {
  const match = buscarProgramaPorOperacion(operacionLabel)
  if (match) {
    const meses = mesesDeOperacion(operacionLabel)
    return {
      nombrePrograma: match.programa.nombreCompleto,
      duracionLabel: meses != null ? `${meses} Meses` : null,
      total: match.operacionDef.total,
    }
  }
  const porTexto = programaPorTexto(operacionLabel)
  const meses = mesesDeOperacion(operacionLabel)
  return {
    nombrePrograma: porTexto ? porTexto.nombreCompleto : operacionLabel || "",
    duracionLabel: meses != null ? `${meses} Meses` : null,
    total: filasFallback.reduce((s, f) => s + (f.monto || 0), 0),
  }
}

// Suma `meses` a una fecha ISO (YYYY-MM-DD). null si meses es null (sin baja).
export function calcularFechaBajaPrograma(fechaAltaISO: string | null, meses: number | null): string | null {
  if (!fechaAltaISO || meses == null) return null
  const [y, m, d] = fechaAltaISO.split("-").map(Number)
  const dt = new Date(y, m - 1 + meses, d)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
