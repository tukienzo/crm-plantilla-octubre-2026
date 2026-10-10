// cambiar-mail.mjs — cambia el mail de un usuario del CRM (auth de Supabase + team_members), o lo borra.
//   node scripts/cambiar-mail.mjs <mail-viejo> <mail-nuevo> ["<nombre nuevo>"]
//   node scripts/cambiar-mail.mjs --borrar <mail>
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i)] ||= l.slice(i + 1).replace(/^"|"$/g, "") }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function buscar(email) {
  let page = 1
  while (page < 20) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find((x) => (x.email || "").toLowerCase() === email.toLowerCase())
    if (u) return u
    if (data.users.length < 200) return null
    page++
  }
  return null
}

const [a, b, c] = process.argv.slice(2)
if (a === "--borrar") {
  const u = await buscar(b)
  if (u) { const { error } = await sb.auth.admin.deleteUser(u.id); if (error) throw error; console.log("auth: borrado", b) } else console.log("auth: no existía", b)
  const { error } = await sb.from("team_members").delete().eq("email", b.toLowerCase()); if (error) throw error
  console.log("team_members: borrado", b)
} else {
  if (!a || !b) { console.error("uso: node scripts/cambiar-mail.mjs <viejo> <nuevo> [\"nombre\"] | --borrar <mail>"); process.exit(1) }
  const u = await buscar(a)
  if (!u) { console.error("no existe el usuario", a); process.exit(1) }
  const { error: e1 } = await sb.auth.admin.updateUserById(u.id, { email: b.toLowerCase(), email_confirm: true })
  if (e1) throw e1
  const cambios = { email: b.toLowerCase(), ...(c ? { nombre: c } : {}) }
  const { data, error: e2 } = await sb.from("team_members").update(cambios).eq("email", a.toLowerCase()).select("email,nombre,rol")
  if (e2) throw e2
  console.log("listo:", a, "→", b, data?.[0] ? `(${data[0].nombre} · ${data[0].rol})` : "(sin fila en team_members)")
}
