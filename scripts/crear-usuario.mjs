// Crea (o actualiza) un usuario en Supabase Auth y su fila en team_members.
//   node scripts/crear-usuario.mjs <email> <password> "<nombre>" [rol]
// Roles (escritos tal cual): CEO, Sales Manager, Manager MKT, Contaduria, Setter, Closer, Cobranzas, CSM, Editor (lib/role-access.ts).
// Si el usuario ya existe, le actualiza la contraseña (sirve también para cambiarla).
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).split(" #")[0].trim().replace(/^"|"$/g, "")] }))
const [email, password, nombre, rol = "CEO"] = process.argv.slice(2)
if (!email || !password || !nombre) { console.error("uso: node scripts/crear-usuario.mjs <email> <password> \"<nombre>\" [rol]"); process.exit(1) }
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error("faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local"); process.exit(1) }
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } })
if (error) {
  if (!/already|exists|registered/i.test(error.message)) throw error
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
  const u = list.users.find(x => x.email?.toLowerCase() === email.toLowerCase())
  if (u) await admin.auth.admin.updateUserById(u.id, { password, email_confirm: true })
  console.log("usuario existente: contraseña actualizada")
} else console.log("usuario creado:", data.user.id)
const { error: e2 } = await admin.from("team_members").upsert({ email: email.toLowerCase(), nombre, rol, estado: "aprobado" }, { onConflict: "email" })
if (e2) throw e2
console.log("team_members:", email.toLowerCase(), "·", rol, "· aprobado")
