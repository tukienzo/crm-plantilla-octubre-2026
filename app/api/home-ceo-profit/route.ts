import { NextResponse } from "next/server"
import { effectiveCRMRole } from "@/lib/role-access"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { createSupabaseServer } from "@/lib/supabase-server"
import { BECCPP_TYPES, FECCPP_TYPES } from "@/lib/commission-scheme"

export async function GET(request: Request) {
  const session = await createSupabaseServer()
  const { data: { user } } = await session.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "No autenticado" }, { status: 401 })
  const admin = createSupabaseAdmin()
  const { data: member } = await admin.from("team_members").select("rol,estado,nombre").eq("email", user.email.toLowerCase()).maybeSingle()
  if (member?.estado !== "aprobado" || effectiveCRMRole(member?.rol, member?.nombre) !== "CEO") return NextResponse.json({ error: "No autorizado" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get("month") || new Date().toISOString().slice(0, 7)
  const monthOrder = Number(month.replace("-", ""))
  const start = `${month}-01`
  const [year, mon] = month.split("-").map(Number)
  const end = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10)
  const [{ data: expenses, error: expenseError }, { data: payroll, error: payrollError }, { data: plansRaw, error: plansError }] = await Promise.all([
    admin.from("gastos").select("monto_usd,tipo_gasto,mes,mes_orden").gte("fecha", start).lte("fecha", end),
    admin.from("payroll").select("total_usd").eq("mes_orden", monthOrder),
    admin.from("planes_pago").select("id,person_id,telefono,fecha_alta,created_at,plan_pago_items(monto,concepto,estado,pago_id)").not("fecha_alta", "is", null),
  ])
  if (expenseError) return NextResponse.json({ error: expenseError.message }, { status: 500 })
  if (payrollError) return NextResponse.json({ error: payrollError.message }, { status: 500 })
  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 500 })
  // El CRM opera una sola cuenta de negocio: el profit se calcula sobre todo
  // el negocio, sin atribuir planes por cuenta.
  const plans = plansRaw || []
  const expensesTotal = (expenses || []).reduce((sum, row) => sum + Number(row.monto_usd || 0), 0)
  const commissionsTotal = (payroll || []).reduce((sum, row) => sum + Number(row.total_usd || 0), 0)
  let softwareRows = (expenses || []).filter(row => String(row.tipo_gasto || "").toLowerCase().includes("software"))
  let softwareSourceMonth = month
  let softwareEstimated = false
  if (softwareRows.length === 0) {
    const { data: previousSoftware, error: previousSoftwareError } = await admin.from("gastos")
      .select("monto_usd,tipo_gasto,mes,mes_orden")
      .ilike("tipo_gasto", "%software%")
      .lt("mes_orden", monthOrder)
      .order("mes_orden", { ascending: false })
    if (previousSoftwareError) return NextResponse.json({ error: previousSoftwareError.message }, { status: 500 })
    const latestOrder = previousSoftware?.[0]?.mes_orden
    if (latestOrder) {
      softwareRows = (previousSoftware || []).filter(row => row.mes_orden === latestOrder)
      softwareSourceMonth = String(softwareRows[0]?.mes || `${String(latestOrder).slice(0, 4)}-${String(latestOrder).slice(4)}`)
      softwareEstimated = true
    }
  }
  const softwareCost = softwareRows.reduce((sum, row) => sum + Number(row.monto_usd || 0), 0)
  // Cuotas pendientes de un plan (FE o BE). Un "Completó PIF" no es cuota.
  const installmentConcept = (concept: string) => concept.startsWith("Cuota") || FECCPP_TYPES.has(concept) || BECCPP_TYPES.has(concept)
  const pendingItems = (plans || []).flatMap((plan: any) => plan.plan_pago_items || [])
    .filter((item: any) => item.estado === "pendiente" && !item.pago_id && installmentConcept(String(item.concepto || "")))
  const pendingInstallments = pendingItems.reduce((sum: number, item: any) => sum + Number(item.monto || 0), 0)
  return NextResponse.json({
    month,
    expenses: Math.round(expensesTotal * 100) / 100,
    commissions: Math.round(commissionsTotal * 100) / 100,
    complete: (expenses || []).length > 0 && (payroll || []).length > 0,
    expenseRows: (expenses || []).length,
    commissionRows: (payroll || []).length,
    softwareCost: Math.round(softwareCost * 100) / 100,
    softwareSourceMonth,
    softwareEstimated,
    pendingInstallments: Math.round(pendingInstallments * 100) / 100,
    pendingInstallmentCount: pendingItems.length,
  })
}
