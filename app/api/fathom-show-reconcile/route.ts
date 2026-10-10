import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { containsFirstName, containsFullName, matchReason, mentionExcerpt, ms, scheduledUtcMs } from "@/lib/fathom-cruce"

export const maxDuration = 60

async function isCeo() {
  const auth = await createSupabaseServer()
  const { data: { user } } = await auth.auth.getUser()
  if (!user?.email) return false
  const admin = createSupabaseAdmin()
  const { data } = await admin.from("team_members").select("rol,estado").eq("email", user.email.toLowerCase()).maybeSingle()
  return data?.estado === "aprobado" && data?.rol === "CEO"
}

async function canRun(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true
  return isCeo()
}

async function runReconcile(request: Request) {
  const { searchParams } = new URL(request.url)
  const start = searchParams.get("start")
  const end = searchParams.get("end")
  const apply = searchParams.get("apply") === "1"
  const auditNoShows = searchParams.get("audit_no_shows") === "1"
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ error: "start/end inválidos" }, { status: 400 })
  }

  const sb = createSupabaseAdmin()
  let agendaQuery = sb
    .from("agendas")
    .select("id,person_id,nombre,closer,fecha_closer,show,link_fathom")
    .gte("fecha_closer", `${start}T00:00:00`)
    .lte("fecha_closer", `${end}T23:59:59`)
  agendaQuery = auditNoShows ? agendaQuery.or("show.is.null,show.eq.false") : agendaQuery.is("show", null)
  const { data: agendas, error: agendaError } = await agendaQuery
  if (agendaError) return NextResponse.json({ error: agendaError.message }, { status: 500 })

  const { data: calls, error: callError } = await sb
    .from("crm_call_records")
    .select("id,agenda_id,person_id,occurred_at,fathom_url,call_type,transcript,needs_review,match_confidence,title,participants")
    .gte("occurred_at", `${start}T00:00:00Z`)
    .lte("occurred_at", `${end}T23:59:59Z`)
  if (callError) return NextResponse.json({ error: callError.message }, { status: 500 })

  const proposals: Array<{ agenda: any; call: any; delta_hours: number; reason: string }> = []
  for (const agenda of agendas || []) {
    const scheduled = scheduledUtcMs(agenda.fecha_closer)
    if (!Number.isFinite(scheduled)) continue
    const candidates = (calls || [])
      .map((call) => { const reason = matchReason(agenda, call, scheduled); return reason ? { call, reason } : null })
      .filter(Boolean) as Array<{ call: any; reason: string }>
    // Cruce 1:1 estricto en las dos direcciones: si una agenda tiene dos grabaciones posibles,
    // o una grabacion sirve para dos agendas, no se toca nada y queda para revision humana.
    if (candidates.length !== 1) continue
    const { call, reason } = candidates[0]
    const agendasForCall = (agendas || []).filter((candidate) => matchReason(candidate, call, scheduledUtcMs(candidate.fecha_closer)) !== "")
    if (agendasForCall.length !== 1) continue
    proposals.push({ agenda, call, reason, delta_hours: Math.round(Math.abs(ms(call.occurred_at) - scheduled) / 36_000) / 100 })
  }

  const results: any[] = []
  if (apply) {
    for (const proposal of proposals) {
      // Un No Show ya marcado requiere revisión humana: el modo apply solo
      // completa pendientes para evitar sobreescribir una decisión existente.
      if (proposal.agenda.show === false) continue
      const changes: Record<string, unknown> = { show: true }
      if (!proposal.agenda.link_fathom && proposal.call.fathom_url) changes.link_fathom = proposal.call.fathom_url
      const { error } = await sb.from("agendas").update(changes).eq("id", proposal.agenda.id).is("show", null)
      if (error) {
        results.push({ id: proposal.agenda.id, nombre: proposal.agenda.nombre, error: error.message })
        continue
      }
      await sb.from("crm_events").upsert({
        person_id: proposal.agenda.person_id,
        event_type: "show_reconciled",
        occurred_at: new Date().toISOString(),
        source: "fathom",
        source_record_type: "agendas",
        source_record_id: String(proposal.agenda.id),
        title: "Show reconciliado desde Fathom",
        metadata: {
          previous_show: null,
          new_show: true,
          call_record_id: proposal.call.id,
          fathom_url: proposal.call.fathom_url,
          delta_hours: proposal.delta_hours,
          match_reason: proposal.reason,
          rule: "sales + transcript >=200 + cruce 1:1 en ambas direcciones; identificador fuerte <=24h, nombre completo <=3h, nombre de pila <=1.5h",
        },
        dedupe_key: `fathom:show_reconcile:${proposal.agenda.id}:${proposal.call.id}`,
      }, { onConflict: "dedupe_key" })
      results.push({ id: proposal.agenda.id, nombre: proposal.agenda.nombre, closer: proposal.agenda.closer, updated: true })
    }
  }

  return NextResponse.json({
    apply,
    audit_no_shows: auditNoShows,
    pending: agendas?.length || 0,
    fathom_calls: calls?.length || 0,
    call_diagnostics: {
      sales: (calls || []).filter((call) => call.call_type === "sales").length,
      with_transcript: (calls || []).filter((call) => String(call.transcript || "").length >= 200).length,
      with_person: (calls || []).filter((call) => call.person_id).length,
      needs_review: (calls || []).filter((call) => call.needs_review).length,
    },
    matched: proposals.length,
    updated: results.filter((row) => row.updated).length,
    rows: proposals.map((proposal) => ({
      id: proposal.agenda.id,
      nombre: proposal.agenda.nombre,
      closer: proposal.agenda.closer,
      fecha_closer: proposal.agenda.fecha_closer,
      previous_show: proposal.agenda.show,
      occurred_at: proposal.call.occurred_at,
      delta_hours: proposal.delta_hours,
      reason: proposal.reason,
      fathom_url: proposal.call.fathom_url,
    })),
    no_show_review: auditNoShows ? (agendas || []).filter((agenda) => agenda.show === false).map((agenda) => {
      const scheduled = scheduledUtcMs(agenda.fecha_closer)
      const nearest = (calls || [])
        .filter((call) => call.call_type === "sales" && String(call.transcript || "").length >= 200)
        .map((call) => ({
          occurred_at: call.occurred_at,
          delta_hours: Math.round(Math.abs(ms(call.occurred_at) - scheduled) / 36_000) / 100,
          fathom_url: call.fathom_url,
          title: call.title,
          first_name_in_transcript: containsFirstName(call.transcript, agenda.nombre),
          full_name_in_transcript: containsFullName(call.transcript, agenda.nombre),
          mention_excerpt: mentionExcerpt(call.transcript, agenda.nombre),
        }))
        .filter((call) => call.delta_hours <= 6)
        .sort((left, right) => left.delta_hours - right.delta_hours)
        .slice(0, 3)
      return { id: agenda.id, nombre: agenda.nombre, closer: agenda.closer, fecha_closer: agenda.fecha_closer, nearest }
    }) : [],
    results,
  })
}

export async function POST(request: Request) {
  if (!(await canRun(request))) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  return runReconcile(request)
}

export async function GET(request: Request) {
  if (!(await canRun(request))) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  const today = new Date().toISOString().slice(0, 10)
  const start = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
  const origin = new URL(request.url).origin
  return runReconcile(new Request(`${origin}/api/fathom-show-reconcile?start=${start}&end=${today}&apply=1`))
}
