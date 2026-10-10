import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const limit = Math.max(1, Math.min(Number(params.get("limit") || 100), 250))
  const admin = createSupabaseAdmin()
  const [{ data: clients, error: clientsError }, { data: rules, error: rulesError }, { data: distributions, error: distributionsError }] = await Promise.all([
    admin.from("crm_client_growth_queue").select("*").order("sort_score", { ascending: false }).limit(limit),
    admin.from("finance_rule_versions").select("rule_key,version,percentage,effective_from,approval_status,notes").order("rule_key"),
    admin.from("finance_sale_distributions").select("*").order("occurred_on", { ascending: false }).limit(100),
  ])
  const error = clientsError || rulesError || distributionsError
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    clients: clients || [],
    rules: rules || [],
    distributions: distributions || [],
    methodology: {
      health: "La salud manual no se sobrescribe. La señal automática solo describe actividad verificable a 7/14 días.",
      priority: "Backend y renovación se ordenan únicamente con prioridad, potencial y estado explícitos; sin evidencia quedan como requiere_evidencia.",
      finance: "Reglas de reparto entre socios: se configuran en Finanzas (versiones de reglas aprobadas, con su fecha de vigencia).",
    },
  })
}
