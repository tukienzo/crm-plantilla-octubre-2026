import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { nombreCanonico } from "@/lib/equipo"
import { BRAND } from "@/lib/brand"
import { contextoNegocio } from "@/lib/negocio"
import { cruzarLead, parchesDe, semanaDe, norm, type AgendaCruce, type LeadReporte } from "@/lib/setting-cruce"
import { dashboardSettingHtml, type DiaSetting } from "@/lib/setting-dashboard"

export const dynamic = "force-dynamic"
// Vercel Pro permite hasta 300 s. Con esfuerzo bajo el reporte tarda menos de un minuto, pero un día
// con muchos leads no puede morir por tiempo a la mitad.
export const maxDuration = 300

// Generador de resúmenes de setting. El setter pega las notas crudas del día (lo que escribe en su
// bloc de notas) y Claude las convierte en el mismo reporte estructurado que sus dashboards
// (KPIs del día + lead por lead) más un mensaje listo para WhatsApp. "Guardar" lo deja en el CRM
// exactamente como los reportes cargados por script: crm_integration_assets (source=setting), la
// agenda de cada lead completada, un evento por persona y las métricas semanales del setter.

const CLAUDE_URL = "https://api.anthropic.com/v1/messages"
const MODELOS = ["claude-sonnet-5", "claude-sonnet-4-6"]
const TIPOS: Record<string, string> = { calendarios_enviados: "calendarios_enviados", agendas: "setting_agendas", calificados_dia: "setting_calificados", fups: "setting_fups", nuevos_seguidores: "setting_nuevos_seguidores", outbound_enviados: "setting_outbound_enviados", outbound_respuestas: "setting_outbound_respuestas" }
const NUMEROS = ["calendarios_enviados", "agendas", "agendas_calificadas", "calificados_dia", "fups", "nuevos_seguidores", "ns_contestan", "ns_califican", "ns_bookeados", "historia_comentaron", "historia_calificaron", "historia_bookeados", "outbound_enviados", "outbound_respuestas", "outbound_agendas"] as const

type Dia = Record<(typeof NUMEROS)[number], number | null> & {
  fecha: string; setter: string; historia: string | null; leads: LeadReporte[]
  contenido_consumido?: Array<{ pieza: string; tipo: string | null; leads: string[] }>
  notas_embudo?: { nuevos_seguidores: string | null; historia: string | null; outbound: string | null }
  avisos?: string[]; observaciones?: string[]; alcance?: string | null
  resumen_whatsapp?: string; notas?: string; origen?: string; archivo?: string
}

const SYSTEM = `Sos el analista de setting de ${BRAND.name} (el setter trabaja la cuenta de Instagram, los DMs de ManyChat y agenda llamadas de venta en iClosed).
Recibís las NOTAS CRUDAS que el setter escribió al final del día y devolvés el reporte del día en JSON, con la misma estructura que sus dashboards diarios.

CONTEXTO DEL NEGOCIO
${contextoNegocio()}

REGLAS
- No inventes nada. Si un número o un dato no está en las notas, ese campo va vacío (""). Nunca estimes ni completes con lo que suele pasar. Los números van como texto: "15", o "" si no está.
- No calcules porcentajes ni tasas: el dashboard los saca solo de los números crudos. Devolvé únicamente los conteos.
- "Calificado" acá significa negocio + dolor identificados. NO significa capacidad de pago.
- Los números del día suelen venir en una frase tipo: "15 leads nuevos mandaron de 113 que nos siguieron, hice 89 fups y 68 outbound, de la historia comentaron 47, 5 leads agendaron de 9 que se les mandó calendario y 11 calificados". Eso es: nuevos_seguidores 113, ns_contestan 15, fups 89, outbound_enviados 68, historia_comentaron 47, agendas 5, calendarios_enviados 9, calificados_dia 11.
- "agendas_calificadas": de las agendas del día, cuántas quedaron calificadas. Si no se dice, contá los leads del reporte con calificado true.
- "calificados_dia" es el total de calificados del día (agenden o no), que suele ser mayor que las agendas.

CADA LEAD AGENDADO
Viene como bloque "Nombre de perfil: usuario (Nombre)" seguido de situación actual, freno/dolor, objetivo, caso de éxito enviado, contenido consumido, origen, material enviado, contenido gatillo, ciclo de agenda, seguimientos, historial de chat y síntesis para el closer. Volcá TODO lo que traiga el bloque, no resumas de más:
- "lead": tal cual lo escribió el setter (ej. "usuario_ejemplo (Ana)"). "usuario": el usuario de Instagram si se distingue, si no el nombre. "nombre": el nombre de pila si aparece entre paréntesis, si no el mismo lead.
- "situacion": qué hace hoy y cómo factura, en una o dos líneas, en las palabras del lead cuando se pueda. Es lo primero que lee el closer.
- "origen": de dónde vino (ej. "Ads (nuevo seguidor)", "Inbound (Historia) — de los que comentaron la palabra clave", "Nuevo seguidor + Reel orgánico", "Outbound — el setter lo reactivó").
- "gatillo": qué disparó la agenda ("Historia con palabra clave", "Reel Solución", "Setter/DM", "Anuncio").
- "feed": ARRAY con cada pieza de contenido orgánico que consumió, una por elemento (ej. ["Historia con palabra clave (9/9)", "Historias de la semana (genérica)", "Reel de solución (2/9)"]). Array vacío si no hay.
- Los campos de texto que no aparezcan en el bloque van "".
- "ciclo": tiempo entre primer contacto y agenda ("≤1 día", "2–7 días", "Reactivación (1er contacto 2/5, ~3 meses)").
- "fups": cantidad de seguimientos hasta agendar, o "".
- "dolor" y "objetivo": una línea cada uno, en las palabras del lead cuando se pueda.
- "caso_exito": qué caso de éxito se le mandó. "material_enviado": looms, guías, automatizaciones que le pasó el setter.
- "historial": cómo venía la conversación (cuándo fue el primer contacto, qué pasó en el medio, si se cayó una llamada anterior).
- "sintesis_closer": 2 a 4 líneas para que el closer entre sabiendo quién es, qué le duele, qué quiere y con qué predisposición llega.

SECCIONES DEL DÍA
- "contenido_consumido": ARRAY con las piezas de feed que aparecen en los bloques de los leads, agrupadas. Cada una {"pieza": nombre de la pieza, "tipo": "Historia"|"Reel"|"Carrusel"|"Ads"|null, "leads": [nombres de los leads que la consumieron]}. Si ningún lead menciona feed, array vacío.
- "notas_embudo": aclaraciones sueltas de cada embudo, o "" en cada una. Ej. nuevos_seguidores: "El único bookeado fue usuario_ejemplo"; historia: "Ana y Bruno vinieron de acá"; outbound: "Los 68 outbound salieron sobre la base de los 47 que comentaron la palabra clave en la historia".
- "avisos": cosas que faltan o que no cierran y el equipo tiene que saber (ej. "No hay CRM cargado del día", "Los calendarios enviados no coinciden con las agendas reportadas"). Array vacío si no hay.
- "observaciones": 1 a 4 frases sobre lo que dicen los números (qué gatillo dominó, qué embudo rindió, qué falta). Sin consejos genéricos.
- "alcance": una línea de cierre con el alcance del reporte, o "".

MENSAJE DE WHATSAPP
- "resumen_whatsapp": el mensaje que el setter le manda al equipo. Formato WhatsApp (negritas con *asteriscos*, sin markdown de otro tipo, emojis con moderación). Estructura: título "*Setting DD/MM*"; una línea con calendarios → agendas y calificados; una línea por embudo (nuevos seguidores → contestan → califican → bookean; historia del día → comentaron → calificaron → bookeados; outbound → respuestas → agendas), solo si hay datos; luego "*Agendas del día*" con una línea por lead: nombre — origen — dolor corto — objetivo corto; y al final "*Para el closer*" con lo más importante de cada lead en una línea. Máximo 2500 caracteres. Solo datos de las notas.

SALIDA
Solo el JSON, sin texto antes ni después, sin bloques de código.

ESQUEMA (todos los valores son texto, excepto calificado, que es true/false, y las listas; "" = no está)
{"fecha":"YYYY-MM-DD","calendarios_enviados":"n","agendas":"n","agendas_calificadas":"n","calificados_dia":"n","fups":"n","nuevos_seguidores":"n","ns_contestan":"n","ns_califican":"n","ns_bookeados":"n","historia":"texto","historia_comentaron":"n","historia_calificaron":"n","historia_bookeados":"n","outbound_enviados":"n","outbound_respuestas":"n","outbound_agendas":"n","leads":[{"lead":"","usuario":"","nombre":"","origen":"","calificado":true,"ciclo":"","gatillo":"","feed":[""],"fups":"n","situacion":"","dolor":"","objetivo":"","sintesis_closer":"","caso_exito":"","material_enviado":"","historial":""}],"contenido_consumido":[{"pieza":"","tipo":"","leads":[""]}],"notas_embudo":{"nuevos_seguidores":"","historia":"","outbound":""},"avisos":[""],"observaciones":[""],"alcance":"","resumen_whatsapp":""}`

// Modelos que aceptan salida estructurada con esquema (output_config.format). Si el reporte cae al
// modelo de respaldo, que no la soporta, se pide el JSON en texto y se parsea con tolerancia.
const MODELOS_CON_ESQUEMA = new Set(["claude-sonnet-5", "claude-opus-5", "claude-opus-4-8", "claude-haiku-4-5"])

// Esquema del reporte del día. Con esto Claude no puede devolver texto suelto, JSON a medias ni
// claves inventadas: la API valida la salida contra el esquema antes de entregarla.
// Sin tipos "X o null": la API acepta como mucho 16 campos con uniones y este reporte tiene más de 30.
// Todo va como texto y el vacío ("") significa "no está en las notas"; entero() y texto() ya lo
// traducen a null al normalizar.
const S = { type: "string" }, SN = { type: "string" }, N = { type: "string" }, SA = { type: "array", items: { type: "string" } }
const objeto = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false })
const ESQUEMA_DIA = objeto({
  fecha: S,
  calendarios_enviados: N, agendas: N, agendas_calificadas: N, calificados_dia: N, fups: N,
  nuevos_seguidores: N, ns_contestan: N, ns_califican: N, ns_bookeados: N,
  historia: SN, historia_comentaron: N, historia_calificaron: N, historia_bookeados: N,
  outbound_enviados: N, outbound_respuestas: N, outbound_agendas: N,
  leads: { type: "array", items: objeto({
    lead: S, usuario: S, nombre: S, origen: SN, calificado: { type: "boolean" }, ciclo: SN, gatillo: SN, feed: SA, fups: N,
    situacion: SN, dolor: SN, objetivo: SN, sintesis_closer: SN, caso_exito: SN, material_enviado: SN, historial: SN,
  }) },
  contenido_consumido: { type: "array", items: objeto({ pieza: S, tipo: SN, leads: SA }) },
  notas_embudo: objeto({ nuevos_seguidores: SN, historia: SN, outbound: SN }),
  avisos: SA, observaciones: SA, alcance: SN, resumen_whatsapp: S,
})

type RespuestaClaude = { texto: string; stop: string; modelo: string }

// Una sola llamada, sin streaming: con 16.000 tokens de salida y esfuerzo bajo, un reporte largo
// (unos 23.000 caracteres de notas, 6 leads) entra con margen. El razonamiento del modelo también
// consume tokens de salida: por eso antes, con 8.000, el JSON llegaba cortado a la mitad.
async function claude(system: string, user: string): Promise<RespuestaClaude> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("Falta configurar ANTHROPIC_API_KEY")
  let ultimo = ""
  for (const model of MODELOS) {
    const body: Record<string, unknown> = {
      model, max_tokens: 16000, system,
      messages: [{ role: "user", content: user }],
      thinking: { type: "adaptive" },
      output_config: MODELOS_CON_ESQUEMA.has(model)
        ? { effort: "low", format: { type: "json_schema", schema: ESQUEMA_DIA } }
        : { effort: "low" },
    }
    const r = await fetch(CLAUDE_URL, {
      method: "POST", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    if (r.status === 404) { ultimo = await r.text(); continue }  // ese modelo no está disponible para la clave: probar el siguiente
    if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`)
    const j = await r.json()
    const texto = (j.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("\n")
    return { texto, stop: String(j.stop_reason || ""), modelo: model }
  }
  throw new Error(`Ningún modelo disponible: ${ultimo.slice(0, 200)}`)
}

// Tolera cercos de código y texto alrededor. Si aun así no parsea, deja en el log qué llegó, que
// es lo único que sirve para diagnosticar desde Vercel.
function jsonDe(texto: string) {
  const limpio = texto.replace(/```(?:json)?/gi, "").trim()
  const i = limpio.indexOf("{"), f = limpio.lastIndexOf("}")
  if (i < 0 || f < i) {
    console.error("setting-resumen: respuesta sin JSON:", limpio.slice(0, 300))
    throw new Error("Claude no devolvió el reporte en el formato esperado. Volvé a generar; si sigue pasando, avisá.")
  }
  try {
    return JSON.parse(limpio.slice(i, f + 1))
  } catch (e) {
    console.error("setting-resumen: JSON inválido:", (e as Error).message, "| final:", limpio.slice(-200))
    throw new Error("El reporte llegó incompleto o mal formado. Volvé a generar; si sigue pasando, avisá.")
  }
}
const entero = (v: unknown) => { if (v === null || v === undefined || v === "") return null; const n = Number(String(v).replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? Math.round(n) : null }
const texto = (v: unknown, max = 600) => { const t = String(v ?? "").trim(); return t && t !== "null" ? t.slice(0, max) : null }
// Acepta array o texto suelto y devuelve siempre una lista limpia.
const listaTexto = (v: unknown, tope: number, max: number): string[] => {
  const crudos = Array.isArray(v) ? v : String(v ?? "").split(/\s*[;·|]\s*|\n/)
  return crudos.map((x) => texto(x, max)).filter((x): x is string => Boolean(x) && x !== "—").slice(0, tope)
}

function limpiarDia(bruto: Record<string, unknown>, fecha: string, setter: string): Dia {
  const leads = (Array.isArray(bruto.leads) ? bruto.leads : []).map((l: Record<string, unknown>) => ({
    lead: texto(l.lead, 120) || texto(l.nombre, 120) || texto(l.usuario, 120) || "sin nombre",
    usuario: texto(l.usuario, 120) || texto(l.lead, 120) || "", nombre: texto(l.nombre, 120) || texto(l.lead, 120) || "",
    origen: texto(l.origen, 200), calificado: l.calificado === true || /^s/i.test(String(l.calificado || "")), ciclo: texto(l.ciclo, 120), gatillo: texto(l.gatillo, 200),
    // El feed consumido pasó a ser una lista (cada pieza por separado). Se acepta el texto suelto de
    // los reportes viejos para no romper lo ya guardado.
    feed: listaTexto(l.feed, 8, 300),
    fups: entero(l.fups), situacion: texto(l.situacion, 600), dolor: texto(l.dolor, 500), objetivo: texto(l.objetivo, 300),
    sintesis_closer: texto(l.sintesis_closer, 1200), caso_exito: texto(l.caso_exito, 300), material_enviado: texto(l.material_enviado, 400), historial: texto(l.historial, 800),
  }))
  const ne = (bruto.notas_embudo || {}) as Record<string, unknown>
  const d = {
    fecha, setter, historia: texto(bruto.historia, 120), leads,
    contenido_consumido: (Array.isArray(bruto.contenido_consumido) ? bruto.contenido_consumido : [])
      .map((c: Record<string, unknown>) => ({ pieza: texto(c.pieza, 200) || "", tipo: texto(c.tipo, 60), leads: listaTexto(c.leads, 20, 120) }))
      .filter((c: { pieza: string }) => c.pieza).slice(0, 30),
    notas_embudo: { nuevos_seguidores: texto(ne.nuevos_seguidores, 400), historia: texto(ne.historia, 400), outbound: texto(ne.outbound, 400) },
    avisos: listaTexto(bruto.avisos, 6, 400),
    observaciones: listaTexto(bruto.observaciones, 6, 500),
    alcance: texto(bruto.alcance, 400),
    resumen_whatsapp: texto(bruto.resumen_whatsapp, 4000) || "",
  } as unknown as Dia
  for (const k of NUMEROS) d[k] = entero(bruto[k])
  if (d.agendas === null && leads.length) d.agendas = leads.length
  if (d.agendas_calificadas === null && leads.length) d.agendas_calificadas = leads.filter((l) => l.calificado).length
  return d
}

export async function GET(request: Request) {
  const sb = createSupabaseAdmin()
  const { searchParams } = new URL(request.url)
  // Con ?fecha= devuelve el día entero, para volver a dibujar su dashboard desde el historial.
  // Con &html=1 devuelve directamente el dashboard como página, para abrirlo o guardarlo como enlace.
  const unaFecha = String(searchParams.get("fecha") || "")
  if (/^\d{4}-\d{2}-\d{2}$/.test(unaFecha)) {
    const { data, error } = await sb.from("crm_integration_assets").select("metadata").eq("source", "setting").eq("asset_type", "dia").eq("source_id", unaFecha).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: "No hay reporte guardado de ese día" }, { status: 404 })
    if (searchParams.get("html") === "1") {
      return new NextResponse(dashboardSettingHtml(data.metadata as DiaSetting), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
      })
    }
    return NextResponse.json({ dia: data.metadata })
  }
  const limite = Math.min(60, Number(searchParams.get("limite") || 20) || 20)
  const { data, error } = await sb.from("crm_integration_assets").select("source_id,name,metadata,last_seen_at").eq("source", "setting").eq("asset_type", "dia").order("source_id", { ascending: false }).limit(limite)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ dias: (data || []).map((r) => { const m = r.metadata as Dia; return { fecha: r.source_id, setter: m.setter, calendarios_enviados: m.calendarios_enviados, agendas: m.agendas, calificados_dia: m.calificados_dia, fups: m.fups, leads: (m.leads || []).length, cruzados: (m.leads || []).filter((l) => l.agenda_id).length, origen: m.origen || "dashboard", resumen_whatsapp: m.resumen_whatsapp || null, guardado: r.last_seen_at } }) })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const accion = String(body.accion || "generar")
    const hoy = new Date().toISOString().slice(0, 10)
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || "")) ? String(body.fecha) : hoy
    const setter = nombreCanonico(String(body.setter || "")) || String(body.setter || "").split(" ")[0] || "Sin setter"

    if (accion === "generar") {
      const notas = String(body.notas || "").trim()
      if (notas.length < 40) return NextResponse.json({ error: "Pegá las notas del día (al menos unas líneas)." }, { status: 400 })
      const salida = await claude(SYSTEM, `Fecha del reporte: ${fecha}. Setter: ${setter}.\n\nNOTAS CRUDAS DEL SETTER:\n"""\n${notas.slice(0, 60000)}\n"""`)
      if (salida.stop === "max_tokens") {
        return NextResponse.json({ error: "Las notas son demasiado largas para un solo reporte: Claude se quedó sin espacio para responder. Recortá el historial de chat de cada lead o partí el día en dos." }, { status: 422 })
      }
      if (salida.stop === "refusal") {
        return NextResponse.json({ error: "Claude no quiso analizar estas notas. Revisá que no tengan datos sensibles de más y probá de nuevo." }, { status: 422 })
      }
      const dia = limpiarDia(jsonDe(salida.texto), fecha, setter)
      return NextResponse.json({ ok: true, dia, modelo: salida.modelo })
    }

    if (accion === "guardar") {
      const dia = limpiarDia((body.dia || {}) as Record<string, unknown>, fecha, setter)
      if (body.resumen_whatsapp) dia.resumen_whatsapp = String(body.resumen_whatsapp).slice(0, 4000)
      dia.notas = String(body.notas || "").slice(0, 60000) || undefined
      dia.origen = "generador"
      const sb = createSupabaseAdmin()
      const desde = new Date(new Date(fecha).getTime() - 11 * 86400000).toISOString().slice(0, 10)
      const hasta = new Date(new Date(fecha).getTime() + 11 * 86400000).toISOString().slice(0, 10)
      const { data: filas, error: eAg } = await sb.from("agendas").select("id,nombre,instagram,fecha_agenda,fecha_closer,person_id,fuente,recurso,angulo_entrada,problema_actual,motivo_urgencia,setter")
        .or(`fecha_agenda.gte.${desde},fecha_closer.gte.${desde}`).or(`fecha_agenda.lte.${hasta}T23:59:59,fecha_closer.lte.${hasta}T23:59:59`).or("estado.is.null,estado.neq.Archivada manualmente").limit(2000)
      if (eAg) throw new Error(eAg.message)
      const agendas: AgendaCruce[] = (filas || []).map((a) => ({ ...a, fecha: (a.fecha_agenda || a.fecha_closer || null) as string | null }))
      const sinAgenda: string[] = [], ambiguos: string[] = []
      let enlazados = 0, completadas = 0, eventos = 0
      for (const l of dia.leads) {
        const r = cruzarLead(l, fecha, agendas)
        if (!r.agenda) { l.agenda_id = null; l.cruce = null; (r.motivo === "ambiguo" ? ambiguos : sinAgenda).push(r.ambiguo ? `${l.lead} → ${r.ambiguo}` : l.lead); continue }
        l.agenda_id = r.agenda.id; l.agenda_nombre = r.agenda.nombre; l.cruce = `${r.motivo} (${r.puntos})`
        enlazados++
        const parches = parchesDe(l, r.agenda, setter)
        if (Object.keys(parches).length) {
          const { error } = await sb.from("agendas").update(parches).eq("id", r.agenda.id)
          if (error) throw new Error(error.message)
          completadas++
          Object.assign(r.agenda, parches)
        }
        if (r.agenda.person_id) {
          const { error } = await sb.from("crm_events").upsert({
            person_id: r.agenda.person_id, event_type: "setting_report", occurred_at: `${fecha}T12:00:00Z`, source: "setting", source_record_type: "generador", source_record_id: fecha,
            title: `Reporte del setter · ${l.origen || "sin origen"}`, metadata: { origen: l.origen, calificado: l.calificado, ciclo: l.ciclo, gatillo: l.gatillo, feed: l.feed, fups: l.fups, dolor: l.dolor, objetivo: l.objetivo, sintesis_closer: l.sintesis_closer, agenda_id: r.agenda.id },
            dedupe_key: `setting:${fecha}:${norm(l.lead)}`,
          }, { onConflict: "dedupe_key" })
          if (error) throw new Error(error.message)
          eventos++
        }
      }
      const { error: eDia } = await sb.from("crm_integration_assets").upsert({ source: "setting", asset_type: "dia", source_id: fecha, name: `Setting ${fecha} · ${setter}`, metadata: dia, last_seen_at: new Date().toISOString() }, { onConflict: "source,asset_type,source_id" })
      if (eDia) throw new Error(eDia.message)

      // métricas semanales del mes, recalculadas con todos los días guardados de ese setter
      const mes = fecha.slice(0, 7)
      const { data: diasMes } = await sb.from("crm_integration_assets").select("source_id,metadata").eq("source", "setting").eq("asset_type", "dia").gte("source_id", `${mes}-01`).lte("source_id", `${mes}-31`)
      const sumas = new Map<string, number>()
      for (const r of diasMes || []) {
        const m = r.metadata as Dia
        if ((m.setter || "Sin setter") !== setter) continue
        for (const [campo, tipo] of Object.entries(TIPOS)) {
          const v = m[campo as keyof Dia]
          if (typeof v !== "number") continue
          const k = `${tipo}|${semanaDe(r.source_id)}`
          sumas.set(k, (sumas.get(k) || 0) + v)
        }
      }
      await sb.from("metricas_manual").delete().eq("mes", mes).eq("persona", setter).in("tipo", Object.values(TIPOS))
      if (sumas.size) {
        const { error } = await sb.from("metricas_manual").insert([...sumas.entries()].map(([k, valor]) => { const [tipo, semana] = k.split("|"); return { tipo, valor, mes, semana, persona: setter } }))
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ ok: true, fecha, setter, leads: dia.leads.length, enlazados, completadas, eventos, sinAgenda, ambiguos, metricas: sumas.size })
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
