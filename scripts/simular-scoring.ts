// simular-scoring.ts — corre el lead scoring (lib/lead-scoring.ts) sobre un export de agendas y muestra
// cuántas caen en cada tipo y cuánto cierra cada uno, para recalibrar pesos y cortes con datos reales.
//   1) exportar: select id, inversion, ingresos, intentos_previos, motivo_urgencia, ocupacion, edad, show, cerro
//      from agendas where coalesce(fecha_agenda, fecha_closer) >= '<desde>'  → agendas.json
//   2) npx tsx scripts/simular-scoring.ts agendas.json
import fs from "node:fs"
import { autoScoreLead } from "../lib/lead-scoring"

const rows: Array<Record<string, unknown>> = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
const res = rows.map((r) => ({ r, s: autoScoreLead(r) }))
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + "%" : "—")
console.log("== por tipo (agendas | presentadas | cierres | cierre s/ presentadas)")
for (const g of ["LEAD S", "LEAD A", "LEAD B", "LEAD C", "LEAD D", null]) {
  const x = res.filter((z) => (z.s ? z.s.calificacion : null) === g)
  const p = x.filter((z) => z.r.show === true).length, c = x.filter((z) => z.r.cerro).length
  console.log(`  ${g ?? "(sin scoring)"} | ${x.length} (${pct(x.length, res.length)}) | ${p} | ${c} | ${pct(c, p)}`)
}
console.log("== por banda de puntos")
for (let lo = 0; lo < 100; lo += 10) {
  const x = res.filter((z) => z.s && z.s.puntos >= lo && z.s.puntos < lo + 10)
  if (!x.length) continue
  const p = x.filter((z) => z.r.show === true).length, c = x.filter((z) => z.r.cerro).length
  console.log(`  ${lo}-${lo + 9} | ${x.length} | ${p} | ${c} | ${pct(c, p)}`)
}
