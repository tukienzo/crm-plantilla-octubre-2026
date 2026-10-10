import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { authorizePreviewSync, normEmail, normPhone } from "@/lib/integration-auth"
import { autoScoreLead } from "@/lib/lead-scoring"
import { beginIntegrationJob, finishIntegrationJob } from "@/lib/integration-observability"
import { attachEmailToPerson } from "@/lib/crm-email"
import { updateHammerAudience } from "@/lib/meta-hammer-audience"
import { canonicalCloserName } from "@/lib/closer-routing"
import { BRAND } from "@/lib/brand"

export const maxDuration = 300
const API = "https://public.api.iclosed.io/v1/eventCalls"

async function allRows(queryFactory: (from: number, to: number) => PromiseLike<any>) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await queryFactory(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

function answerFields(call: any) {
  const out: Record<string, string> = {}
  const valuesOf = (raw: any): any[] => {
    if (raw == null) return []
    if (typeof raw !== "object") return [raw]
    if (Array.isArray(raw)) return raw.flatMap(valuesOf)
    for (const key of ["answer", "number", "value", "label", "text"]) {
      if (raw[key] != null) return valuesOf(raw[key])
    }
    return Object.values(raw).flatMap(valuesOf)
  }
  for (const item of call.secondaryAnswers || call.questions || []) {
    const question = String(item.statement || item.question || "").toLowerCase()
    const value = valuesOf(item.answer).find((candidate) => candidate != null && String(candidate).trim())
    if (!value) continue
    if (question.includes("instagram")) {
      const instagram = String(value).trim()
      if (/[a-z0-9]/i.test(instagram) && !/^(no tengo|ninguno|no uso|n\/a)$/i.test(instagram.replace(/[()]/g, "").trim())) out.instagram = instagram
    }
    else if (question.includes("edad")) out.edad = String(value)
    else if (question.includes("problema actual") || question.includes("en qué querés que te ayude") || question.includes("en que queres que te ayude")) out.problema_actual = String(value)
    else if (question.includes("hace cuánto arrastr") || question.includes("hace cuanto arrastr") || question.includes("cuánto tiempo") || question.includes("cuanto tiempo") || question.includes("desde cuándo") || question.includes("desde cuando")) out.tiempo_problema = String(value)
    else if (question.includes("por qué querés resolverlo ahora") || question.includes("por que queres resolverlo ahora") || question.includes("relevante") || question.includes("urgencia") || question.includes("resolver esto ahora")) out.motivo_urgencia = String(value)
    else if (question.includes("qué hiciste") || question.includes("que hiciste") || question.includes("intentaste")) out.intentos_previos = String(value)
    else if (question.includes("dedic") && question.includes("ingres")) {
      // El selector combina profesión e ingresos en una sola respuesta. Ambos
      // campos deben recibirla: el scoring usa `ocupacion` y el CRM conserva
      // `ingresos` para mostrar el texto original.
      out.ocupacion = String(value)
      out.ingresos = String(value)
    }
    else if (question.includes("ingres")) out.ingresos = String(value)
    else if (question.includes("capital") || question.includes("invertir")) out.inversion = String(value)
  }
  return out
}

function argentinaWallTime(value: unknown): string | null {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ""
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}`
}

function callWallTime(call: any): string | null {
  const local = String(call.dateTime || "").trim()
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(local)) return local.replace(" ", "T").slice(0, 19)
  return argentinaWallTime(call.dateTimeUTC)
}

function hostName(call: any): string | null {
  const full = [call.user?.firstName, call.user?.lastName].filter(Boolean).join(" ").trim()
  if (!full) return null
  return canonicalCloserName(full)
}

// Calendarios de venta a importar (ids separados por coma). Vacío = todos los del workspace.
const EVENT_IDS = (process.env.ICLOSED_EVENT_IDS || "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0)

export async function POST(request: Request) {
  const auth = authorizePreviewSync(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const admin = createSupabaseAdmin()
  const startedAt = Date.now()
  const requestUrl = new URL(request.url)
  const externalId = `${new Date().toISOString().slice(0, 13)}:${requestUrl.searchParams.get("start_page") || "0"}:${requestUrl.searchParams.get("pages") || "5"}`
  const jobId = await beginIntegrationJob(admin, "iclosed", "sync_event_calls", externalId)
  try {
    const { searchParams } = new URL(request.url)
    // La API de iClosed pagina desde 0: la página 0 es la más nueva. Arrancar en 1 salteaba las
    // 50 reservas más recientes (y con menos de 50 llamadas futuras, UPCOMING venía vacío).
    const startPage = Math.max(0, Number(searchParams.get("start_page") ?? "0") || 0)
    const pageCount = Math.min(5, Math.max(1, Number(searchParams.get("pages") || "5") || 5))
    const dryRun = searchParams.get("dry_run") === "1"
    // Ventana para dar de alta reservas que el webhook no trajo: 72 h por defecto; ?horas=336 para
    // rellenar un bache (las repetidas se detectan por teléfono o nombre + mismo día).
    const ventanaHoras = Math.min(24 * 60, Math.max(1, Number(searchParams.get("horas") || "72") || 72))
    const key = process.env.ICLOSED_API_KEY
    if (!key) return NextResponse.json({ ok: true, skipped: true, motivo: "Falta ICLOSED_API_KEY: el cron se saltea hasta que se cargue la clave de iClosed" })
    // iClosed no devuelve un orden estable: el subconjunto cambia según
    // `limit`, por lo que consultar solo limit=100 omite reservas recientes.
    // Cruzar varias ventanas y deduplicar por call ID evita perder agendas.
    // La API de iClosed pagina de forma estable y limita la tasa (429 con ráfagas):
    // una sola ventana de 50, páginas en serie y un reintento corto si devuelve 429.
    const limit = 50
    const batches: any[][] = []
    // Ojo: el corte por "página corta" tiene que ser por tipo. Antes un solo `break` cortaba el
    // recorrido entero: si UPCOMING venía vacío (ninguna llamada futura), PAST no se pedía nunca y el
    // cron terminaba "done" con 0 reservas.
    for (const eventType of ["UPCOMING", "PAST"]) {
      for (let index = 0; index < pageCount; index++) {
        const page = startPage + index
        let response = await fetch(`${API}?eventType=${eventType}&limit=${limit}&page=${page}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" })
        if (response.status === 429) {
          await new Promise((r) => setTimeout(r, 2500))
          response = await fetch(`${API}?eventType=${eventType}&limit=${limit}&page=${page}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" })
        }
        if (!response.ok) throw new Error(`iClosed HTTP ${response.status}`)
        const lote = (await response.json())?.data?.eventCalls || []
        batches.push(lote)
        if (lote.length < limit) break  // no hay más páginas de este tipo
        await new Promise((r) => setTimeout(r, 400))
      }
    }
    const calls: any[] = [...new Map(
      batches.flat().map((call: any) => [String(call.id || call.callId), call]),
    ).values()]
    const identities = await allRows((from, to) => admin.from("crm_identities").select("person_id,kind,value").in("kind", ["phone", "email", "iclosed"]).range(from, to))
    const personByIdentity = new Map((identities || []).map((x: any) => [`${x.kind}:${x.value}`, x.person_id]))
    const agendas = await allRows((from, to) => admin.from("agendas").select("id,person_id,nombre,telefono,fecha_closer,closer,fecha_agenda,created_at,instagram,edad,problema_actual,tiempo_problema,intentos_previos,motivo_urgencia,ocupacion,ingresos,inversion,calificacion").range(from, to))
    const agendasByPerson = new Map<string, any[]>()
    for (const agenda of agendas || []) if (agenda.person_id) agendasByPerson.set(agenda.person_id, [...(agendasByPerson.get(agenda.person_id) || []), agenda])

    let matched = 0, eventsInserted = 0, agendasInserted = 0, agendasUpdated = 0, identitiesAttached = 0, emailsAttached = 0, identityConflicts = 0, withoutNearbyAgenda = 0
    const events: any[] = []
    for (const call of calls) {
      const id = String(call.id || call.callId)
      const phone = normPhone(call.phoneNumber || call.contact?.phone)
      const email = normEmail(call.inviteeEmail || call.contact?.email)
      const contactId = String(call.contactId || "") || null
      const personIds = [...new Set([
        contactId && personByIdentity.get(`iclosed:${contactId}`),
        phone && personByIdentity.get(`phone:${phone}`),
        email && personByIdentity.get(`email:${email}`),
      ].filter(Boolean))]
      if (personIds.length > 1) { identityConflicts++; continue }
      let personId = personIds[0]
      // Fallback de seguridad: si el webhook de agenda no llegó, reconstruir
      // reservas recientes directamente desde iClosed. Se limita a los dos
      // calendarios comerciales y a 72 h desde la reserva para no importar
      // histórico ni tocar otras cuentas.
      if (!EVENT_IDS.length || EVENT_IDS.includes(Number(call.eventId))) {
        const bookedAt = new Date(call.createdAt || "")
        const callAt = new Date(call.dateTimeUTC || call.dateTime || "")
        // reservas de las últimas 72 h, o llamadas todavía por venir aunque se hayan reservado antes
        const recent = (Number.isFinite(bookedAt.getTime()) && Date.now() - bookedAt.getTime() <= ventanaHoras * 60 * 60 * 1000)
          || (Number.isFinite(callAt.getTime()) && callAt.getTime() >= Date.now() - 60 * 60 * 1000)
        const closer = hostName(call)
        const fechaCloser = callWallTime(call)
        // misma persona (teléfono o nombre) con llamada el mismo día = la misma agenda (el sheet y iClosed
        // pueden diferir en minutos o zona horaria)
        const extracted = answerFields(call)
        const cleanCallName = String(call.inviteeName || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
        const cleanCallIg = extracted.instagram ? String(extracted.instagram).replace(/[@\s]/g, "").toLowerCase().trim() : ""

        // Identificar si ya existe una agenda para esta persona (evitar duplicados por reagendamientos o cambio de fecha)
        const existingAgenda = (agendas || []).find((row: any) => {
          const samePhone = phone && normPhone(row.telefono) === phone
          const rowIg = row.instagram ? String(row.instagram).replace(/[@\s]/g, "").toLowerCase().trim() : ""
          const sameIg = cleanCallIg && rowIg && cleanCallIg === rowIg
          const samePerson = personId && row.person_id && row.person_id === personId
          const rowName = String(row.nombre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
          const sameName = cleanCallName.length >= 6 && cleanCallName === rowName
          const sameIdentity = samePhone || sameIg || samePerson || sameName
          if (!sameIdentity) return false

          const rowDateStr = row.fecha_closer || row.fecha_agenda || row.created_at
          if (!rowDateStr) return true
          const rowDate = new Date(rowDateStr)
          const callDate = new Date(fechaCloser || call.createdAt || "")
          const diffDays = Math.abs(callDate.getTime() - rowDate.getTime()) / (1000 * 60 * 60 * 24)
          return diffDays <= 45
        })

        if (existingAgenda) {
          // Reagendamiento / actualizacion: actualizar fecha de llamada y datos en la agenda existente sin crear duplicado
          if (!dryRun) {
            const updates: Record<string, any> = {}
            if (fechaCloser && existingAgenda.fecha_closer !== fechaCloser) {
              updates.fecha_closer = fechaCloser
              updates.fecha_agenda = fechaCloser
            }
            if (closer && !existingAgenda.closer) updates.closer = closer
            if (phone && !existingAgenda.telefono) updates.telefono = phone
            if (extracted.instagram && !existingAgenda.instagram) updates.instagram = extracted.instagram
            for (const [k, v] of Object.entries(extracted)) {
              if (!k.startsWith("__") && v && !existingAgenda[k]) {
                updates[k] = v
              }
            }
            if (Object.keys(updates).length > 0) {
              await admin.from("agendas").update(updates).eq("id", existingAgenda.id)
              Object.assign(existingAgenda, updates)
              agendasUpdated++
            }
          }
        } else if (recent && fechaCloser && call.inviteeName) {
          const score = autoScoreLead(extracted)
          if (!dryRun) {
            const { data: inserted, error } = await admin.from("agendas").insert({
              ...(personId ? { person_id: personId } : {}),
              nombre: String(call.inviteeName).trim().replace(/\s+/g, " "),
              telefono: phone || null,
              instagram: extracted.instagram || null,
              fecha_agenda: argentinaWallTime(call.createdAt),
              fecha_lead: argentinaWallTime(call.createdAt),
              fecha_closer: fechaCloser,
              closer,
              cuenta: BRAND.igArroba || BRAND.name,
              setter: null,
              fuente: "Instagram",
              calificacion: score?.calificacion || null,
              ...extracted,
            }).select("id,person_id").single()
            if (error) throw error
            agendasInserted++
            personId = inserted.person_id
            ;(agendas as any[]).push({ id: inserted.id, person_id: inserted.person_id, telefono: phone, nombre: call.inviteeName, fecha_closer: fechaCloser, fecha_agenda: argentinaWallTime(call.createdAt), ...extracted })
            if (email) { try { await attachEmailToPerson(admin, inserted.person_id, email, "iclosed_reconcile") } catch (e) { identityConflicts++; console.warn("[iclosed] email no vinculado:", String((e as any)?.message || e)) } }
            await updateHammerAudience("add", { email, telefono: phone }).catch((error) => console.error("[hammer-audience] iclosed reconcile", error))
          } else agendasInserted++
        }
      }
      if (!personId) continue
      matched++
      if (!dryRun && email && !personByIdentity.has(`email:${email}`)) {
        try { await attachEmailToPerson(admin, personId, email, "iclosed") } catch (e) { identityConflicts++; console.warn("[iclosed] email no vinculado:", String((e as any)?.message || e)) }
        await updateHammerAudience("add", { email, telefono: phone }).catch((error) => console.error("[hammer-audience] iclosed", error))
        personByIdentity.set(`email:${email}`, personId)
        emailsAttached++
      }
      if (!dryRun && contactId && !personByIdentity.has(`iclosed:${contactId}`)) {
        const { error } = await admin.from("crm_identities").upsert({ person_id: personId, kind: "iclosed", value: contactId, source: "iclosed", last_seen_at: new Date().toISOString() }, { onConflict: "kind,value" })
        if (!error) { identitiesAttached++; personByIdentity.set(`iclosed:${contactId}`, personId) }
      }
      const occurred = call.dateTimeUTC || call.dateTime || call.createdAt || new Date().toISOString()
      events.push({ person_id: personId, event_type: "iclosed_call", occurred_at: occurred, source: "iclosed", source_record_type: "eventCall", source_record_id: id, title: call.event?.name || call.eventType || "Llamada iClosed", metadata: { utm: call.utm || [], answers: call.secondaryAnswers || call.questions || [], status: call.googleResponseStatus, event_id: call.eventId, user_id: call.userId }, dedupe_key: `iclosed:eventCall:${id}` })
      const candidates = agendasByPerson.get(personId) || []
      const agenda = candidates
        .map((row) => ({ row, distance: Math.abs(new Date(row.fecha_agenda || row.created_at).getTime() - new Date(occurred).getTime()) }))
        .filter(({ distance }) => distance <= 7 * 24 * 60 * 60 * 1000)
        .sort((a, b) => a.distance - b.distance)[0]?.row
      if (!agenda) withoutNearbyAgenda++
      if (agenda) {
        const extracted = answerFields(call)
        const changes = Object.fromEntries(Object.entries(extracted).filter(([key, value]) => !key.startsWith("__") && value && !agenda[key]))
        if (!agenda.calificacion) {
          const score = autoScoreLead({
            ...agenda,
            ...changes,
            tiempo_problema: extracted.tiempo_problema,
            intentos_previos: extracted.intentos_previos,
          })
          if (score) changes.calificacion = score.calificacion
        }
        if (Object.keys(changes).length) {
          if (dryRun) agendasUpdated++
          else {
            const { error } = await admin.from("agendas").update(changes).eq("id", agenda.id)
            if (!error) agendasUpdated++
          }
        }
      }
    }
    for (let i = 0; !dryRun && i < events.length; i += 300) {
      const chunk = events.slice(i, i + 300)
      const { data, error } = await admin.from("crm_events").upsert(chunk, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id")
      if (error) throw error
      eventsInserted += data?.length || 0
    }
    await finishIntegrationJob(admin, { jobId, provider: "iclosed", route: "/api/iclosed-sync", startedAt, success: true })
    return NextResponse.json({ ok: true, dry_run: dryRun, start_page: startPage, pages: pageCount, fetched: calls.length, matched, unmatched: calls.length - matched, identity_conflicts: identityConflicts, without_nearby_agenda: withoutNearbyAgenda, events_inserted: eventsInserted, agendas_inserted: agendasInserted, agendas_updated: agendasUpdated, identities_attached: identitiesAttached, emails_attached: emailsAttached })
  } catch (error: any) {
    await finishIntegrationJob(admin, { jobId, provider: "iclosed", route: "/api/iclosed-sync", startedAt, success: false, error })
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
  }
}

// Vercel Cron ejecuta GET. Mantener POST permite también backfills controlados
// con el mismo CRON_SECRET sin duplicar la lógica de sincronización.
export async function GET(request: Request) {
  return POST(request)
}
