// aplicar-sql.mjs — corre un archivo SQL en la base de Supabase por la Management API.
//   node scripts/aplicar-sql.mjs supabase/migrations/<archivo>.sql
//
// Sirve para aplicar una migración suelta sin la CLI (o para volver a correr una). Lo normal es
// `npx supabase db push`, que aplica todas en orden.
// Necesita en .env.local (o en el entorno): SUPABASE_PROJECT_REF y SUPABASE_ACCESS_TOKEN (token
// personal, se genera en https://supabase.com/dashboard/account/tokens). Reemplaza {{CRON_SECRET}}
// y {{APP_URL}} con los valores de .env.local antes de ejecutar, y anota la versión en
// supabase_migrations.schema_migrations para que `db push` no la vuelva a aplicar.
import { readFileSync, existsSync } from "node:fs"
import { basename, resolve } from "node:path"

const archivo = process.argv[2]
if (!archivo) { console.error("uso: node scripts/aplicar-sql.mjs <archivo.sql>"); process.exit(1) }

const env = existsSync(resolve(".env.local")) ? Object.fromEntries(
  readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/).filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }),
) : {}
const ref = process.env.SUPABASE_PROJECT_REF || env.SUPABASE_PROJECT_REF
const token = String(process.env.SUPABASE_ACCESS_TOKEN || env.SUPABASE_ACCESS_TOKEN || "").trim()
if (!ref || !token) { console.error("faltan SUPABASE_PROJECT_REF y/o SUPABASE_ACCESS_TOKEN (en .env.local o en el entorno)"); process.exit(1) }

let sql = readFileSync(archivo, "utf8")
  .replaceAll("{{CRON_SECRET}}", env.CRON_SECRET || "")
  .replaceAll("{{APP_URL}}", (env.CRM_PUBLIC_URL || env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, ""))
const version = basename(archivo).match(/^(\d{14})/)?.[1]
if (version) {
  sql += `\ninsert into supabase_migrations.schema_migrations(version, name) values ('${version}', '${basename(archivo).replace(/^\d+_/, "").replace(/\.sql$/, "")}') on conflict (version) do nothing;`
}

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: sql }),
})
const cuerpo = await r.text()
console.log(r.ok ? "OK" : `HTTP ${r.status}`, cuerpo.slice(0, 2000))
process.exit(r.ok ? 0 : 2)
