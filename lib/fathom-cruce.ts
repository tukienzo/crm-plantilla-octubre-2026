// Cruce entre una agenda y una grabación de Fathom. Lo usan /api/fathom-show-reconcile (cada 2 h, solo completa
// asistencias vacías) y lib/ventas-reconciliar.ts (cierre de las 22 h). Una sola implementación para que los dos
// cruces no puedan divergir.

export const HORA = 60 * 60 * 1000

export function ms(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : NaN
}

// `fecha_closer` es `timestamp` sin zona y guarda UTC, no hora local de Argentina.
// Contra agendas ya conciliadas, la diferencia con el occurred_at de Fathom da 0.00 h en la
// mayoría. Si se le sumaran 3 h, todas las agendas quedarían fuera de la ventana horaria y no cruzaría ninguna.
// Ojo: las agendas que crea el cron de iClosed guardan hora argentina; quien necesite
// tolerar los dos casos prueba también con +3 h (ver lib/ventas-reconciliar.ts).
export function scheduledUtcMs(value: string | null | undefined) {
  const raw = String(value || "").trim()
  if (!raw) return NaN
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw.replace(" ", "T")}Z`
  return ms(iso)
}

export function norm(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

export function urlKey(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  try {
    const url = new URL(raw)
    url.search = ""
    url.hash = ""
    return `${url.hostname}${url.pathname}`.replace(/\/+$/, "").toLowerCase()
  } catch { return raw.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase() }
}

export function externalNames(participants: unknown) {
  if (!Array.isArray(participants)) return []
  return participants.filter((item: any) => item?.is_external !== false).map((item: any) => norm(item?.name)).filter(Boolean)
}

export function containsFullName(haystack: unknown, name: unknown) {
  const needle = norm(name)
  if (needle.length < 5) return false
  const words = needle.split(" ").filter((word) => word.length >= 2)
  if (words.length < 2) return false
  const text = ` ${norm(haystack)} `
  return text.includes(` ${needle} `) || words.every((word) => text.includes(` ${word} `))
}

export function containsFirstName(haystack: unknown, name: unknown) {
  const first = norm(name).split(" ").find((word) => word.length >= 3)
  return Boolean(first && ` ${norm(haystack)} `.includes(` ${first} `))
}

// Fathom abrevia el apellido en el titulo ("Lucía G X Bruno" por "Lucía Gómez"),
// asi que el nombre de pila es a veces lo unico que hay. Pide 4 letras para no cruzar por "ana" o "luz".
export function containsFirstNameStrict(haystack: unknown, name: unknown) {
  const first = norm(name).split(" ").find((word) => word.length >= 4)
  return Boolean(first && ` ${norm(haystack)} `.includes(` ${first} `))
}

export type AgendaCruce = { id: unknown; nombre: unknown; person_id: unknown; link_fathom: unknown }

// Por que esta grabacion corresponde a esta agenda, o "" si no corresponde. Una sola funcion
// para las dos direcciones del cruce (agenda -> call y call -> agenda), asi no pueden divergir.
// Los identificadores fuertes valen dentro de las 24 h; los cruces por nombre exigen cercania
// horaria, porque un nombre repetido en otra llamada marcaria un "se presento" falso.
export function matchReason(agenda: AgendaCruce, call: any, scheduled: number) {
  if (String(call.transcript || "").length < 200) return ""
  if (call.call_type !== "sales") return ""
  const delta = Math.abs(ms(call.occurred_at) - scheduled)
  if (!Number.isFinite(delta) || delta > 24 * HORA) return ""
  if (call.agenda_id && call.agenda_id === agenda.id) return "agenda_id"
  if (urlKey(agenda.link_fathom) && urlKey(agenda.link_fathom) === urlKey(call.fathom_url)) return "link_fathom"
  if (agenda.person_id && call.person_id === agenda.person_id && call.needs_review === false && Number(call.match_confidence || 0) >= 0.9) return "person_id"
  if (externalNames(call.participants).includes(norm(agenda.nombre))) return "participant_name"
  if (delta <= 3 * HORA && containsFullName(call.title, agenda.nombre)) return "title_name"
  if (delta <= 3 * HORA && containsFullName(call.transcript, agenda.nombre)) return "transcript_name"
  if (delta <= 1.5 * HORA && containsFirstNameStrict(call.title, agenda.nombre)) return "title_first_name"
  return ""
}

export function mentionExcerpt(haystack: unknown, name: unknown) {
  const text = String(haystack || "")
  const first = String(name || "").trim().split(/\s+/).find((word) => word.length >= 3)
  if (!first) return ""
  const position = text.toLocaleLowerCase("es").indexOf(first.toLocaleLowerCase("es"))
  if (position < 0) return ""
  return text.slice(Math.max(0, position - 140), Math.min(text.length, position + 260)).replace(/\s+/g, " ").trim()
}
