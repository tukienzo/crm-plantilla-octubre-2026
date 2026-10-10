// Instalador guiado. Verifica el archivo de claves, prueba la conexión con Supabase (y que estén todas
// las migraciones), genera los secretos que faltan y, si se pide, crea el primer usuario (CEO).
//
//   node scripts/instalar.mjs                        revisa todo y dice qué falta
//   node scripts/instalar.mjs --generar-secretos     completa en .env.local CRON_SECRET, CRM_INGEST_KEY y las claves VAPID vacías
//   node scripts/instalar.mjs --usuario ceo@empresa.com "Contraseña123" "Nombre Apellido" [rol]
//
// Antes de esto: node scripts/verificar-requisitos.mjs --solo-herramientas (PASO 0) y
// npx supabase db push (migraciones). No imprime el valor de ninguna clave.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

const ok = (m) => console.log("  ✓", m)
const aviso = (m) => console.log("  ·", m)
let fallos = 0
const falta = (m) => { console.log("  ✗", m); fallos++ }

console.log("\nInstalador del CRM\n")

// 1) Node
const mayor = Number(process.versions.node.split(".")[0])
if (mayor >= 20) ok(`Node ${process.versions.node}`); else falta(`Node ${process.versions.node}: hace falta 20 o más`)

// 2) .env.local
if (!existsSync(".env.local")) {
  falta(".env.local no existe. Copiá .env.example a .env.local y completá al menos las claves de Supabase.")
  process.exit(1)
}
const leerEnv = () => Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => /^\s*[A-Z0-9_]+\s*=/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).replace(/\s+#.*$/, "").trim().replace(/^"(.*)"$/, "$1")] }))
let env = leerEnv()

// 2b) secretos generados (solo si se pide y solo los vacíos)
function escribirEnv(clave, valor) {
  const lineas = readFileSync(".env.local", "utf8").split(/\r?\n/)
  const i = lineas.findIndex((l) => new RegExp(`^\\s*${clave}\\s*=`).test(l))
  if (i >= 0) lineas[i] = `${clave}=${valor}`
  else lineas.push(`${clave}=${valor}`)
  writeFileSync(".env.local", lineas.join("\n"))
}
if (process.argv.includes("--generar-secretos")) {
  if (!env.CRON_SECRET) { escribirEnv("CRON_SECRET", randomBytes(32).toString("hex")); ok("CRON_SECRET generado") }
  if (!env.CRM_INGEST_KEY) { escribirEnv("CRM_INGEST_KEY", randomBytes(32).toString("hex")); ok("CRM_INGEST_KEY generado") }
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    const webpush = (await import("web-push")).default
    const claves = webpush.generateVAPIDKeys()
    escribirEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", claves.publicKey)
    escribirEnv("VAPID_PRIVATE_KEY", claves.privateKey)
    ok("claves VAPID generadas (avisos push)")
  }
  env = leerEnv()
}

const obligatorias = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]
for (const k of obligatorias) env[k] ? ok(k) : falta(`${k} vacía en .env.local${k === "CRON_SECRET" ? " (o corré con --generar-secretos)" : ""}`)
if (env.NEXT_PUBLIC_SUPABASE_URL && !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env.NEXT_PUBLIC_SUPABASE_URL) && !/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_SUPABASE_URL)) aviso("NEXT_PUBLIC_SUPABASE_URL no parece una URL de Supabase (https://<ref>.supabase.co)")
if (/^NEXT_PUBLIC_/.test(Object.keys(env).find((k) => k.includes("SERVICE_ROLE") && k.startsWith("NEXT_PUBLIC_")) || "")) falta("Hay una service role en una variable NEXT_PUBLIC_*: sacala, esa clave no puede ir al navegador")
if (!env.NEXT_PUBLIC_BRAND_NAME) aviso("NEXT_PUBLIC_BRAND_NAME vacía: el CRM se va a llamar \"Mi CRM\"")
if (!env.NEXT_PUBLIC_CRM_CLOSERS) aviso("NEXT_PUBLIC_CRM_CLOSERS vacía: los desplegables de closer van a estar vacíos")
if (!env.NEXT_PUBLIC_CRM_CEO) aviso("NEXT_PUBLIC_CRM_CEO vacía: el ranking no va a destacar al dueño")
if (!env.NEXT_PUBLIC_PRECIO_BASE) aviso("NEXT_PUBLIC_PRECIO_BASE vacía: el catálogo de programas no va a tener precio")
if (existsSync("lib/negocio.ts") && /sin cargar/i.test(readFileSync("lib/negocio.ts", "utf8"))) aviso("lib/negocio.ts todavía dice \"sin cargar\": completá la descripción del negocio (la usan los modelos de IA)")
if (fallos) { console.log("\nCorregí lo marcado con ✗ y volvé a correr.\n"); process.exit(1) }

// 3) conexión con Supabase y migraciones
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const { error: eTabla } = await admin.from("team_members").select("id", { count: "exact", head: true })
if (eTabla) {
  falta(`No se pudo leer team_members: ${eTabla.message}`)
  console.log("    Si la tabla no existe, faltan las migraciones: npx supabase link --project-ref <ref> && npx supabase db push")
  process.exit(1)
}
ok("Supabase responde")
// Tablas de las últimas migraciones: si alguna falta, el db push quedó a medias.
const recientes = ["crm_angulos", "crm_formatos", "seguimientos", "radar_semillas", "ads_meses", "crm_seguidores_dia", "crm_tareas"]
const faltantes = []
for (const t of recientes) {
  const { error } = await admin.from(t).select("*", { count: "exact", head: true })
  if (error) faltantes.push(t)
}
if (faltantes.length) { falta(`Faltan tablas de las migraciones más nuevas: ${faltantes.join(", ")}. Corré npx supabase db push.`); process.exit(1) }
ok("Migraciones aplicadas (incluidas las más nuevas)")

// 4) integraciones: cuáles quedan prendidas
if (existsSync("requisitos.json")) {
  const req = JSON.parse(readFileSync("requisitos.json", "utf8"))
  const claves = req.requisitos.filter((r) => r.tipo === "clave" && !r.obligatorio)
  const porModulo = new Map()
  for (const r of claves) {
    const cargada = [r.variable, ...(r.alternativas || [])].some((n) => String(env[n] || "").trim())
    for (const m of r.modulos || ["otros"]) {
      const x = porModulo.get(m) || { cargadas: 0, total: 0 }
      x.total++; if (cargada) x.cargadas++
      porModulo.set(m, x)
    }
  }
  console.log("\n  Integraciones (vacías = apagadas):")
  for (const [m, x] of porModulo) console.log(`   ${x.cargadas === x.total ? "✓" : x.cargadas ? "◐" : "·"}  ${m}: ${x.cargadas}/${x.total} claves`)
}

// 5) primer usuario (opcional)
const i = process.argv.indexOf("--usuario")
if (i >= 0) {
  const [email, password, nombre, rol = "CEO"] = process.argv.slice(i + 1)
  if (!email || !password || !nombre) { console.log("\nuso: node scripts/instalar.mjs --usuario <email> <password> \"<nombre>\" [rol]\n"); process.exit(1) }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } })
  if (error) {
    if (!/already|exists|registered/i.test(error.message)) throw error
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
    const u = list.users.find((x) => x.email?.toLowerCase() === email.toLowerCase())
    if (u) await admin.auth.admin.updateUserById(u.id, { password, email_confirm: true })
    ok("el usuario ya existía: contraseña actualizada")
  } else ok(`usuario creado en Supabase Auth (${data.user.id})`)
  const { error: e2 } = await admin.from("team_members").upsert({ email: email.toLowerCase(), nombre, rol, estado: "aprobado" }, { onConflict: "email" })
  if (e2) throw e2
  ok(`team_members: ${email.toLowerCase()} · ${rol} · aprobado`)
} else {
  const { count } = await admin.from("team_members").select("id", { count: "exact", head: true })
  if (!count) console.log("\n  · Todavía no hay usuarios. Creá el primero:\n    node scripts/instalar.mjs --usuario ceo@empresa.com \"Contraseña\" \"Nombre Apellido\"")
  else ok(`${count} integrante(s) en team_members`)
}

console.log("\nListo. Para correrlo: npx pnpm dev  →  http://localhost:3000\n")
