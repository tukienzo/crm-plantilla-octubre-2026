// ciudad-miniaturas.ts — miniaturas de las piezas de la Ciudad. Corre el mismo paso que el cron del radar
// («vincular»: reels propios recientes + comentarios que falten + cruce pieza ↔ post) y, con «esperar», recoge las
// corridas de Apify y vuelve a cruzar. Uso: npx tsx scripts/ciudad-miniaturas.ts [esperar]
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1") }
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })
  const { correrPaso } = await import("../lib/radar/ciclo")
  const { recoger } = await import("../lib/radar/ingesta")
  const { descargarMedios } = await import("../lib/radar/medios")
  const { vincularPiezas } = await import("../lib/ciudad-vinculos")
  const r = await correrPaso(db, "vincular", { pedidaPor: "ciudad-miniaturas (local)" }) as Record<string, unknown>
  console.log(JSON.stringify({ ...r, detalle: undefined }))
  if (process.argv[2] !== "esperar") return
  for (let i = 0; i < 40; i++) {
    const out = await recoger(db)
    const { data } = await db.from("radar_corridas").select("id").in("tipo", ["piezas", "comentarios"]).eq("estado", "lanzada")
    console.log(new Date().toISOString().slice(11, 19), "en curso:", data?.length || 0, JSON.stringify(out).slice(0, 160))
    if (!data?.length) break
    await espera(20000)
  }
  console.log("medios:", JSON.stringify(await descargarMedios(db, Date.now() + 240000)))
  const v = await vincularPiezas(db, { lanzar: false })
  console.log(JSON.stringify({ ...v, detalle: undefined }))
  for (const d of v.detalle) console.log(" ", d)
}
main().catch((e) => { console.error(e); process.exit(1) })
