import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { EMBUDOS_ADS, inversionAds } from "@/lib/ads-embudos"

export const dynamic = "force-dynamic"

// POST { mes }                          → vuelve a traer de Meta la inversión de ese mes (botón "Traer de Meta")
// PATCH { campaign_id, embudo }         → cambia a mano el embudo de una campaña, en todos los meses (y en los que vengan)

export async function POST(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const mes = String(b.mes || "")
    if (!/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Mes inválido" }, { status: 400 })
    const ads = (await inversionAds(createSupabaseAdmin(), [mes], { forzar: true }))[mes]
    if (ads.error) return NextResponse.json({ error: ads.error, ads }, { status: 502 })
    return NextResponse.json({ ok: true, ads })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const b = await request.json().catch(() => ({}))
    const id = String(b.campaign_id || "")
    const embudo = String(b.embudo || "")
    if (!id) return NextResponse.json({ error: "Falta la campaña" }, { status: 400 })
    if (!(EMBUDOS_ADS as readonly string[]).includes(embudo)) return NextResponse.json({ error: `El embudo tiene que ser ${EMBUDOS_ADS.join(", ")}` }, { status: 400 })
    const { error } = await createSupabaseAdmin().from("ads_campanas_mes").update({ embudo, embudo_manual: true }).eq("campaign_id", id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
