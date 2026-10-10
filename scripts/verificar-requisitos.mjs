#!/usr/bin/env node
// verificar-requisitos.mjs — PASO 0 de la instalación. Revisa que estén las herramientas, las sesiones,
// los conectores MCP y las claves que necesita el CRM, y muestra una tabla con ✓ / ✗.
// La lista sale de requisitos.json (en la raíz). Nunca imprime el valor de una clave.
//
//   node scripts/verificar-requisitos.mjs                      todo (herramientas + MCP + claves)
//   node scripts/verificar-requisitos.mjs --solo-herramientas  PASO 0: CLIs, sesiones y MCP (antes de tener .env.local)
//   node scripts/verificar-requisitos.mjs --estricto           además exige TODAS las claves de integraciones
//   node scripts/verificar-requisitos.mjs --sin-npx            no descarga CLIs con npx (más rápido, menos preciso)
//   node scripts/verificar-requisitos.mjs --json               salida para máquinas
//   node scripts/verificar-requisitos.mjs --confirmar-mcp fathom,gmail --herramienta "list_meetings, list_labels"
//        anota que la IA probó esos conectores llamando una herramienta de solo lectura (vale 24 horas)
//
// Sale con código 1 si falta algo obligatorio. Los conectores MCP no se pueden probar desde un script
// (viven en el cliente de IA): la IA los prueba llamando una herramienta de solo lectura de cada uno y
// después lo confirma con --confirmar-mcp. Sin esa confirmación, figuran como ✗.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..")
const ARCHIVO_MCP = join(RAIZ, ".requisitos-mcp.json")
const VIGENCIA_MCP_HORAS = 24
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const valor = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined }

const req = JSON.parse(readFileSync(join(RAIZ, "requisitos.json"), "utf8"))

// ── confirmar conectores MCP ─────────────────────────────────────────────────────────────────────
if (flag("--confirmar-mcp")) {
  const ids = String(valor("--confirmar-mcp") || "").split(",").map((s) => s.trim()).filter(Boolean)
  const validos = new Set(req.requisitos.filter((r) => r.tipo === "mcp").map((r) => r.id))
  const malos = ids.filter((id) => !validos.has(id))
  if (!ids.length || malos.length) {
    console.error(`uso: --confirmar-mcp <ids separados por coma>. Válidos: ${[...validos].join(", ")}${malos.length ? `\nNo existen: ${malos.join(", ")}` : ""}`)
    process.exit(1)
  }
  const previo = existsSync(ARCHIVO_MCP) ? JSON.parse(readFileSync(ARCHIVO_MCP, "utf8")) : {}
  const ahora = new Date().toISOString()
  for (const id of ids) previo[id] = { ok: true, fecha: ahora, herramienta: valor("--herramienta") || "" }
  writeFileSync(ARCHIVO_MCP, JSON.stringify(previo, null, 2) + "\n")
  console.log(`Anotado: ${ids.join(", ")} (vale ${VIGENCIA_MCP_HORAS} h). Volvé a correr el verificador sin --confirmar-mcp.`)
  process.exit(0)
}

// ── utilidades ───────────────────────────────────────────────────────────────────────────────────
function correr(comando, segundos = 60) {
  const r = spawnSync(comando, { shell: true, encoding: "utf8", timeout: segundos * 1000, cwd: RAIZ, env: { ...process.env, NO_COLOR: "1", CI: "1" } })
  const salida = `${r.stdout || ""}\n${r.stderr || ""}`.trim()
  return { ok: r.status === 0, salida, codigo: r.status }
}
const primeraLinea = (s) => String(s || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean) || ""
function leerEnv() {
  const env = {}
  for (const nombre of [".env.local", ".env"]) {
    const p = join(RAIZ, nombre)
    if (!existsSync(p)) continue
    for (const linea of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m || linea.trim().startsWith("#")) continue
      const v = m[2].replace(/\s+#.*$/, "").trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1")
      if (!(m[1] in env)) env[m[1]] = v
    }
  }
  return env
}

// ── chequeos ─────────────────────────────────────────────────────────────────────────────────────
const soloHerramientas = flag("--solo-herramientas")
const estricto = flag("--estricto")
const sinNpx = flag("--sin-npx")
const filas = []
const fila = (r, estado, detalle) => filas.push({ id: r.id, tipo: r.tipo, nombre: r.nombre, obligatorio: Boolean(r.obligatorio || (estricto && r.tipo === "clave")), estado, detalle, como: r.conectar || "" })

const confirmados = existsSync(ARCHIVO_MCP) ? JSON.parse(readFileSync(ARCHIVO_MCP, "utf8")) : {}
const envArchivo = leerEnv()
const hayEnvLocal = existsSync(join(RAIZ, ".env.local"))

for (const r of req.requisitos) {
  if (r.tipo === "cli") {
    const v = r.verificar || {}
    if (r.id === "node") {
      const mayor = Number(process.versions.node.split(".")[0])
      fila(r, mayor >= Number(v.minimo || 20) ? "ok" : "falta", `Node ${process.versions.node}${mayor >= Number(v.minimo || 20) ? "" : ` (hace falta ${v.minimo} o más)`}`)
      continue
    }
    let prefijo = null
    let version = correr(v.comando, 30)
    if (version.ok) prefijo = ""
    else if (v.npx && !sinNpx) {
      version = correr(`npx --yes ${v.npx} ${v.comando.split(" ").slice(1).join(" ")}`, 240)
      if (version.ok) prefijo = `npx --yes ${v.npx} `
    }
    if (prefijo === null) { fila(r, "falta", "no está instalado"); continue }
    const quien = prefijo ? "(por npx) " : ""
    if (!v.sesion) { fila(r, "ok", `${quien}${primeraLinea(version.salida)}`); continue }
    const sesionCmd = prefijo ? `${prefijo}${v.sesion.split(" ").slice(1).join(" ")}` : v.sesion
    const sesion = correr(sesionCmd, 120)
    if (sesion.ok) fila(r, "ok", `${quien}${primeraLinea(version.salida)} · sesión iniciada`)
    else fila(r, r.alternativa && confirmadoVigente(r.alternativa) ? "ok" : "falta", `${quien}instalado, pero SIN sesión${r.alternativa ? ` (vale también el conector ${r.alternativa} si está confirmado)` : ""}`)
    continue
  }
  if (r.tipo === "mcp") {
    const c = confirmados[r.id]
    if (confirmadoVigente(r.id)) fila(r, "ok", `probado por la IA el ${c.fecha.replace("T", " ").slice(0, 16)} UTC${c.herramienta ? ` (${c.herramienta})` : ""}`)
    else fila(r, "falta", c ? "la confirmación venció: probalo de nuevo" : "sin confirmar: la IA tiene que probarlo y correr --confirmar-mcp")
    continue
  }
  if (r.tipo === "clave") {
    if (soloHerramientas) continue
    const nombres = [r.variable, ...(r.alternativas || [])]
    const presente = nombres.some((n) => String(process.env[n] ?? envArchivo[n] ?? "").trim() !== "")
    const vacia = r.obligatorio ? "vacía (obligatoria)" : r.id.startsWith("cfg-") ? "vacía: se usa un valor genérico" : `vacía: ${r.modulos?.join(", ") || "el módulo"} queda apagado`
    fila(r, presente ? "ok" : r.obligatorio || estricto ? "falta" : "apagada", presente ? "cargada" : vacia)
  }
}

function confirmadoVigente(id) {
  const c = confirmados[id]
  if (!c?.ok || !c.fecha) return false
  return Date.now() - new Date(c.fecha).getTime() < VIGENCIA_MCP_HORAS * 3600 * 1000
}

// ── la alternativa supabase-cli ↔ conector de Supabase ───────────────────────────────────────────
// Si el conector MCP de Supabase está confirmado, la CLI deja de ser obligatoria (y viceversa).
const cli = filas.find((f) => f.id === "supabase-cli")
const mcpSb = filas.find((f) => f.id === "mcp-supabase")
if (cli && mcpSb) {
  if (cli.estado === "ok") { mcpSb.obligatorio = false; if (mcpSb.estado === "falta") mcpSb.estado = "opcional" }
  else if (mcpSb.estado === "ok") { cli.obligatorio = false; cli.estado = "opcional"; cli.detalle += " · se usa el conector MCP de Supabase" }
  else { cli.obligatorio = true; mcpSb.obligatorio = false }
}

// ── salida ───────────────────────────────────────────────────────────────────────────────────────
const faltan = filas.filter((f) => f.obligatorio && f.estado === "falta")
if (flag("--json")) {
  console.log(JSON.stringify({ ok: faltan.length === 0, envLocal: hayEnvLocal, filas: filas.map(({ como, ...f }) => f) }, null, 2))
  process.exit(faltan.length ? 1 : 0)
}

const icono = { ok: "✓", falta: "✗", apagada: "·", opcional: "○" }
const titulos = { cli: "Línea de comandos", mcp: "Conectores MCP (en la IA)", clave: "Claves (.env.local)" }
const ancho = Math.max(...filas.map((f) => f.nombre.length), 10)
console.log(`\nVerificación de requisitos del CRM${soloHerramientas ? " (solo herramientas)" : ""}\n`)
for (const tipo of ["cli", "mcp", "clave"]) {
  const grupo = filas.filter((f) => f.tipo === tipo)
  if (!grupo.length) continue
  console.log(`  ${titulos[tipo]}`)
  for (const f of grupo) console.log(`   ${icono[f.estado] || "?"}  ${f.nombre.padEnd(ancho)}  ${f.obligatorio ? "obligatorio" : "por módulo "}  ${f.detalle}`)
  console.log("")
}
if (!soloHerramientas && !hayEnvLocal) console.log("  (No hay .env.local todavía: copiá .env.example a .env.local y completalo.)\n")
console.log("  ✓ listo · ✗ falta · · integración apagada (opcional) · ○ no hace falta (hay alternativa)\n")

if (faltan.length) {
  console.log(`FALTAN ${faltan.length} requisito(s) obligatorio(s). No sigas con la instalación hasta resolverlos:\n`)
  for (const f of faltan) console.log(`  ✗ ${f.nombre}: ${f.como}`)
  console.log("")
  process.exit(1)
}
console.log("Todo lo obligatorio está listo.\n")
