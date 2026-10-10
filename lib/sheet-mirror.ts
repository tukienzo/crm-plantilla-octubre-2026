// Espejo unidireccional CRM → planilla de ventas de Google Sheets (la de GOOGLE_SHEET_ID).
// Cada pago y cada agenda del CRM se escribe en la pestaña del mes que le corresponde
// (💰 PAGOS <MES> / 📆 AGENDAS <MES>), en la misma fila donde ya estaba si fue importada
// del sheet, o en la primera fila libre si nació en el CRM. El mapa fila ↔ registro vive en
// crm_integration_assets (source = "gsheet"). Nunca lee del sheet hacia el CRM.
import { createHash } from "node:crypto"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { a1, clearValues, columnLetter, duplicateTab, getValues, listTabs, sheetsConfigured, writeValues, type SheetTab } from "@/lib/google-sheets"

const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
const MES_CAP = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

type Kind = "pagos" | "agendas"
const PREFIJO: Record<Kind, string> = { pagos: "PAGOS", agendas: "AGENDAS" }
const TITULO: Record<Kind, string> = { pagos: "💰 PAGOS", agendas: "📆 AGENDAS" }
const ASSET: Record<Kind, string> = { pagos: "pago", agendas: "agenda" }
// Columna (0-based) que define si una fila está ocupada: Nombre Cliente (I) en pagos, Nombres (A) en agendas.
const COL_OCUPADA: Record<Kind, number> = { pagos: 8, agendas: 0 }
const PRIMERA_FILA_DATOS = 3

export type ResultadoEspejo = {
  ok: boolean
  motivo?: string
  agregados: number
  actualizados: number
  sinCambios: number
  historicosSinMapa: number
  reubicadas: number      // la fila mapeada tenía otra persona y se encontró la correcta más arriba o más abajo
  quitadas: number        // la persona ya no está en la pestaña: se marca y no se vuelve a escribir
  pestanasCreadas: string[]
  errores: string[]
  hasta?: string
}

type Registro = Record<string, unknown> & { id: string; created_at: string; updated_at: string }
// quitada: la fila se borró a mano del sheet; el espejo no la vuelve a escribir ni la agrega al final.
type Mapa = { tab: string; row: number; hash?: string; ym?: string; quitada?: boolean }

// Antes de escribir en una fila mapeada se verifica que siga siendo la misma persona (el equipo borra y
// corre filas a mano en el sheet). Agendas: teléfono (col B) o nombre (col A); pagos: cliente (col I) y teléfono (col J).
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-9)
const normTexto = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
function mismaFila(kind: Kind, r: Registro, fila: unknown[]): boolean {
  if (kind === "agendas") {
    const tel = digitos(r.telefono), telSheet = digitos(fila[1])
    if (tel && telSheet) return tel === telSheet
    const nombre = normTexto(r.nombre)
    return nombre !== "" && nombre === normTexto(fila[0])
  }
  const cliente = normTexto(r.cliente)
  if (!cliente || cliente !== normTexto(fila[8])) return false
  const tel = digitos(r.telefono), telSheet = digitos(fila[9])
  return !tel || !telSheet || tel === telSheet
}

function normTitulo(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase()
}

function texto(v: unknown): string {
  if (v === null || v === undefined) return ""
  const s = String(v)
  return /^[=+\-@']/.test(s) ? `'${s}` : s
}

function numero(v: unknown): number | "" {
  if (v === null || v === undefined || v === "") return ""
  const n = Number(v)
  return Number.isFinite(n) ? n : ""
}

function fecha(v: unknown): string {
  if (!v) return ""
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return s
  const base = `${m[3]}/${m[2]}/${m[1]}`
  return m[4] && !(m[4] === "00" && m[5] === "00") ? `${base} ${m[4]}:${m[5]}` : base
}

function mesDe(v: unknown, fallback: string): string {
  const s = v ? String(v) : ""
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : fallback.slice(0, 7)
}

function bandera(v: unknown): number {
  return v === true || v === 1 || v === "1" || v === "true" ? 1 : 0
}

// Pestaña del mes: "💰 PAGOS AGOSTO", "💰 PAGOS FEB", "💰 PAGOS ABRIL 2026", "📆 AGENDAS Junio"…
// La pestaña sin mes ("💰 PAGOS") es la del mes en curso.
export function pestanaDelMes(tabs: SheetTab[], kind: Kind, ym: string, hoy: string): SheetTab | null {
  const [y, m] = ym.split("-").map(Number)
  const mes = MESES[m - 1]
  const pref = PREFIJO[kind]
  const candidatas = tabs.filter(t => normTitulo(t.title).startsWith(pref))
  const conMes = candidatas.find(t => {
    const resto = normTitulo(t.title).slice(pref.length).trim().split(" ").filter(Boolean)
    const tok = resto[0] || ""
    const anio = resto.find(x => /^\d{4}$/.test(x))
    return tok.length >= 3 && mes.startsWith(tok) && (!anio || Number(anio) === y)
  })
  if (conMes) return conMes
  if (ym === hoy.slice(0, 7)) return candidatas.find(t => normTitulo(t.title) === pref) || null
  return null
}

async function crearPestana(tabs: SheetTab[], kind: Kind, ym: string, hoy: string): Promise<SheetTab> {
  const [, m] = ym.split("-").map(Number)
  const candidatas = tabs.filter(t => normTitulo(t.title).startsWith(PREFIJO[kind]))
  const fuente = pestanaDelMes(tabs, kind, hoy, hoy) || candidatas.sort((a, b) => a.index - b.index)[0]
  if (!fuente) throw new Error(`No hay ninguna pestaña ${TITULO[kind]} para duplicar`)
  const titulo = `${TITULO[kind]} ${MESES[m - 1]}`
  const nueva = await duplicateTab(fuente.sheetId, titulo, fuente.index)
  // se limpian solo las columnas que escribe el espejo, desde la primera fila de datos
  const [desde, hasta] = kind === "pagos" ? ["E", "W"] : ["A", "AJ"]
  await clearValues(a1(nueva.title, `${desde}${PRIMERA_FILA_DATOS}:${hasta}`))
  tabs.push(nueva)
  return nueva
}

function filaPago(p: Registro): Array<{ desde: number; valores: unknown[] }> {
  const ym = mesDe(p.fecha, p.created_at)
  const anulado = Boolean(p.voided_at) || (p.record_status && p.record_status !== "active")
  const tipo = anulado ? `ANULADO · ${p.tipo || ""}` : (p.tipo as string) || ""
  return [{
    desde: 4, valores: [
      MES_CAP[Number(ym.slice(5, 7)) - 1] || "", fecha(p.fecha), fecha(p.fecha_alta), fecha(p.fecha_baja), texto(p.cliente), texto(p.telefono),
      texto(tipo), texto(p.operacion), texto(p.closer), texto(p.setter), texto(p.calificacion), anulado ? 0 : numero(p.monto), anulado ? 0 : numero(p.cc_ars),
      texto(p.comprobante), texto(p.ppp), texto(p.fuente), texto(p.contenido_contestado), texto(p.medio_de_pago), numero(p.tipo_cambio_usd),
    ],
  }]
}

function filaAgenda(a: Registro): Array<{ desde: number; valores: unknown[] }> {
  const ig = a.instagram ? (String(a.instagram).startsWith("@") ? String(a.instagram) : `@${a.instagram}`) : ""
  return [
    { desde: 0, valores: [texto(a.nombre), texto(a.telefono), texto(ig), fecha(a.fecha_agenda), fecha(a.fecha_closer), fecha(a.fecha_lead), texto(a.edad), texto(a.closer)] },
    { desde: 9, valores: [
      texto(a.setter), texto(a.calificacion), texto(a.fuente), texto(a.resumen_chat), texto(a.call_confirmer), texto(a.info_call_triage),
      bandera(a.show), bandera(a.cerro), texto(a.estado), texto(a.motivo_no_cierre), texto(a.link_fathom), texto(a.operacion), texto(a.puntos_contacto),
      texto(a.plan_de_pago), texto(a.medio_de_pago), texto(a.comprobante), numero(a.cc_dia_1), texto(a.ia_analisis), fecha(a.fecha_tc), fecha(a.fecha_baja),
    ] },
    { desde: 30, valores: [texto(a.ocupacion), texto(a.ingresos), texto(a.inversion)] },
    { desde: 34, valores: [texto(a.intentos_previos), texto(a.motivo_urgencia)] },
  ]
}

function hashDe(bloques: Array<{ desde: number; valores: unknown[] }>): string {
  return createHash("sha1").update(JSON.stringify(bloques)).digest("hex")
}

// ultimo + ultimoId: cursor por (updated_at, id). Con solo la fecha, una importación masiva (todas las filas con la
// misma marca de tiempo) dejaba sin espejar lo que no entraba en el primer lote.
type Cursor = { desde: string | null; ultimo: string | null; ultimoId?: string | null; lock?: string | null }

const CURSOR = { source: "gsheet", asset_type: "config", source_id: "cursor" }

// Candado atómico: el lock solo se toma si nadie lo cambió entre la lectura y la escritura
// (compare-and-swap sobre metadata->>lock). Dos avisos simultáneos de la base ya no corren juntos.
async function tomarCursor(admin: ReturnType<typeof createSupabaseAdmin>): Promise<{ cursor: Cursor; existe: boolean } | null> {
  const { data } = await admin.from("crm_integration_assets").select("metadata").match(CURSOR).maybeSingle()
  if (!data) {
    await admin.from("crm_integration_assets").upsert(
      { ...CURSOR, name: "Espejo Google Sheet", metadata: { desde: null, ultimo: null, lock: null } },
      { onConflict: "source,asset_type,source_id", ignoreDuplicates: true },
    )
  }
  const cursor = ((data?.metadata as Cursor) || { desde: null, ultimo: null })
  const ahora = Date.now()
  if (cursor.lock && ahora - Date.parse(cursor.lock) < 90_000) return null
  const conLock = { ...cursor, lock: new Date(ahora).toISOString() }
  let consulta = admin.from("crm_integration_assets").update({ metadata: conLock, last_seen_at: conLock.lock }).match(CURSOR)
  consulta = cursor.lock ? consulta.eq("metadata->>lock", cursor.lock) : consulta.is("metadata->>lock", null)
  const { data: tomadas, error } = await consulta.select("source_id")
  if (error) throw error
  if (!tomadas || tomadas.length === 0) return null  // otro proceso lo tomó primero
  return { cursor: conLock, existe: Boolean(data) }
}

async function guardarCursor(admin: ReturnType<typeof createSupabaseAdmin>, cursor: Cursor) {
  await admin.from("crm_integration_assets").upsert(
    { source: "gsheet", asset_type: "config", source_id: "cursor", name: "Espejo Google Sheet", metadata: { ...cursor, lock: null }, last_seen_at: new Date().toISOString() },
    { onConflict: "source,asset_type,source_id" },
  )
}

export async function sincronizarSheet(opts: { limite?: number; registro?: { table: string; id: string } | null } = {}): Promise<ResultadoEspejo> {
  const vacio: ResultadoEspejo = { ok: true, agregados: 0, actualizados: 0, sinCambios: 0, historicosSinMapa: 0, reubicadas: 0, quitadas: 0, pestanasCreadas: [], errores: [] }
  if (!sheetsConfigured()) return { ...vacio, ok: false, motivo: "Faltan GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_SHEET_ID" }
  const admin = createSupabaseAdmin()
  const tomado = await tomarCursor(admin)
  if (!tomado) return { ...vacio, ok: false, motivo: "Otra sincronización está en curso" }
  const cursor = tomado.cursor
  const ahoraIso = new Date().toISOString()
  // primera corrida: lo anterior a este momento solo se actualiza si el importador dejó su mapa de filas
  if (!cursor.desde) cursor.desde = ahoraIso
  const limite = opts.limite ?? 150
  const hoy = ahoraIso.slice(0, 10)
  const resultado = { ...vacio }
  try {
    const tabs = await listTabs()
    // cursor estricto: el webhook de la base manda tabla + id, y ese registro se incluye siempre
    const desdeConsulta = cursor.ultimo || cursor.desde
    const desdeId = cursor.ultimo ? cursor.ultimoId || null : null
    let hastaId: string | null = desdeId
    const escrituras: Array<{ range: string; values: unknown[][] }> = []
    const mapasNuevos: Array<Record<string, unknown>> = []
    const siguienteFila = new Map<string, number>()
    // columnas A..J de cada pestaña desde la primera fila de datos, para verificar filas y buscar personas
    const identidades = new Map<string, unknown[][]>()
    const identidadesDe = async (kind: Kind, titulo: string) => {
      if (!identidades.has(titulo)) {
        const filas = await getValues(a1(titulo, `A${PRIMERA_FILA_DATOS}:J`))
        identidades.set(titulo, filas)
        let ultima = 0
        filas.forEach((fila, i) => { const v = fila[COL_OCUPADA[kind]]; if (v !== undefined && v !== null && String(v).trim() !== "") ultima = i + 1 })
        siguienteFila.set(titulo, PRIMERA_FILA_DATOS + ultima)
      }
      return identidades.get(titulo)!
    }
    let hasta = cursor.ultimo || cursor.desde

    for (const kind of ["pagos", "agendas"] as Kind[]) {
      let consulta = admin.from(kind).select("*")
      consulta = desdeId
        ? consulta.or(`updated_at.gt.${desdeConsulta.replace(/\+00:00$/, "Z")},and(updated_at.eq.${desdeConsulta.replace(/\+00:00$/, "Z")},id.gt.${desdeId})`)
        : consulta.gt("updated_at", desdeConsulta)
      const { data: filas, error } = await consulta.order("updated_at", { ascending: true }).order("id", { ascending: true }).limit(limite)
      if (error) throw error
      const registros = (filas || []) as Registro[]
      if (opts.registro && opts.registro.table === kind && opts.registro.id && !registros.some(r => r.id === opts.registro!.id)) {
        const { data: uno } = await admin.from(kind).select("*").eq("id", opts.registro.id).maybeSingle()
        if (uno) registros.push(uno as Registro)
      }
      if (!registros.length) continue
      const { data: mapas } = await admin.from("crm_integration_assets").select("source_id,metadata")
        .eq("source", "gsheet").eq("asset_type", ASSET[kind]).in("source_id", registros.map(r => r.id))
      const mapaPor = new Map<string, Mapa>((mapas || []).map(m => [m.source_id as string, m.metadata as Mapa]))

      for (const r of registros) {
        // el cursor avanza con cada registro leído (también los sin cambios), así no se relee lo mismo en cada corrida
        if (r.updated_at > (hasta || "") || (r.updated_at === hasta && (!hastaId || r.id > hastaId))) { hasta = r.updated_at; hastaId = r.id }
        try {
          const bloques = kind === "pagos" ? filaPago(r) : filaAgenda(r)
          const hash = hashDe(bloques)
          const mapa = mapaPor.get(r.id)
          let tab: SheetTab | undefined
          let row: number
          if (mapa?.quitada) { resultado.sinCambios++; continue }
          if (mapa && tabs.some(t => t.title === mapa.tab)) {
            if (mapa.hash === hash) { resultado.sinCambios++; continue }
            tab = tabs.find(t => t.title === mapa.tab)!
            row = mapa.row
            const filas = await identidadesDe(kind, tab.title)
            if (!mismaFila(kind, r, filas[row - PRIMERA_FILA_DATOS] || [])) {
              const idx = filas.findIndex(f => mismaFila(kind, r, f))
              if (idx < 0) {
                // la fila se borró a mano: se respeta y no se vuelve a escribir
                mapasNuevos.push({ source: "gsheet", asset_type: ASSET[kind], source_id: r.id, name: String(r.cliente || r.nombre || r.id), metadata: { ...mapa, quitada: true } satisfies Mapa, last_seen_at: ahoraIso })
                resultado.quitadas++
                continue
              }
              row = idx + PRIMERA_FILA_DATOS
              resultado.reubicadas++
            }
            resultado.actualizados++
          } else {
            if (Date.parse(r.created_at) < Date.parse(cursor.desde) && !mapa) { resultado.historicosSinMapa++; continue }
            const ym = kind === "pagos" ? mesDe(r.fecha, r.created_at) : mesDe(r.fecha_agenda || r.fecha_closer, r.created_at)
            tab = pestanaDelMes(tabs, kind, ym, hoy) || undefined
            if (!tab) { tab = await crearPestana(tabs, kind, ym, hoy); resultado.pestanasCreadas.push(tab.title) }
            const filas = await identidadesDe(kind, tab.title)
            // si el equipo ya cargó a esa persona a mano en la pestaña, se escribe sobre su fila y no se duplica
            const idx = filas.findIndex(f => mismaFila(kind, r, f))
            if (idx >= 0) {
              row = idx + PRIMERA_FILA_DATOS
              resultado.reubicadas++
            } else {
              row = siguienteFila.get(tab.title)!
              siguienteFila.set(tab.title, row + 1)
              identidades.get(tab.title)!.push(kind === "agendas" ? [r.nombre, r.telefono] : [, , , , , , , , r.cliente, r.telefono])
              resultado.agregados++
            }
          }
          for (const b of bloques) {
            escrituras.push({ range: a1(tab.title, `${columnLetter(b.desde)}${row}:${columnLetter(b.desde + b.valores.length - 1)}${row}`), values: [b.valores] })
          }
          mapasNuevos.push({
            source: "gsheet", asset_type: ASSET[kind], source_id: r.id, name: String(r.cliente || r.nombre || r.id),
            metadata: { tab: tab.title, row, hash, ym: kind === "pagos" ? mesDe(r.fecha, r.created_at) : mesDe(r.fecha_agenda || r.fecha_closer, r.created_at) } satisfies Mapa,
            last_seen_at: ahoraIso,
          })
        } catch (e) {
          resultado.errores.push(`${kind} ${r.id}: ${(e as Error).message}`)
        }
      }
    }

    if (escrituras.length) await writeValues(escrituras)
    if (mapasNuevos.length) {
      const { error } = await admin.from("crm_integration_assets").upsert(mapasNuevos, { onConflict: "source,asset_type,source_id" })
      if (error) throw error
    }
    cursor.ultimo = hasta || ahoraIso
    cursor.ultimoId = hasta ? hastaId : null
    resultado.hasta = cursor.ultimo
    return resultado
  } catch (e) {
    return { ...resultado, ok: false, motivo: (e as Error).message }
  } finally {
    await guardarCursor(admin, cursor)
  }
}
