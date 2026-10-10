// Trae de Meta la inversión en Ads por campaña y la guarda en el CRM (ads_campanas_mes / ads_meses), separada por embudo.
//   npx --yes tsx scripts/ads-sincronizar.ts                 los últimos 12 meses
//   npx --yes tsx scripts/ads-sincronizar.ts 2026-09 2026-10  solo esos meses
// La página Ventas → Embudos y el Panel del negocio lo hacen solos; esto sirve para cargar el histórico o forzar una relectura.
import fs from "node:fs"
for (const l of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "") }

async function main() {
  const { createClient } = await import("@supabase/supabase-js")
  const { inversionAds } = await import("../lib/ads-embudos")
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const hoy = new Date()
  const meses = process.argv.slice(2).filter((x) => /^\d{4}-\d{2}$/.test(x))
  if (!meses.length) for (let i = 11; i >= 0; i--) { const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`) }
  const res = await inversionAds(sb, meses, { forzar: true })
  for (const m of meses) {
    const x = res[m]
    console.log(`${m}  USD ${x.total.toFixed(2).padStart(9)}  ` + Object.entries(x.por_embudo).map(([e, v]) => `${e} ${v.toFixed(2)}`).join(" · ") + (x.error ? `  ERROR ${x.error}` : ""))
    for (const c of x.campanas) console.log(`           ${c.embudo.padEnd(9)} ${c.spend.toFixed(2).padStart(9)}  ${c.campaign_name}`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
