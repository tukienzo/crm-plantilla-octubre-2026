// portadas-formatos.mjs — baja la portada (og:image) del posteo de referencia de cada formato y la
// guarda en el bucket privado imagenes-crm. Instagram no deja incrustar y la URL de su CDN vence,
// así que la imagen se copia; el link original se conserva en referencia_url.
//
//   node scripts/portadas-formatos.mjs            solo los que faltan o cambiaron de referencia
//   node scripts/portadas-formatos.mjs --forzar   vuelve a bajar todas (pisa también las de antes)
//
// Nunca toca una portada subida a mano desde el CRM: esas quedan con portada_origen en null.
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"

const forzar = process.argv.includes("--forzar")
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n")
  .filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")] }))
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BUCKET = "imagenes-crm"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"

const limpio = (v) => (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60)
// El campo de referencia a veces junta varios ejemplos pegados; vale el primero.
const primerLink = (v) => String(v || "").trim().split(/\s+/)[0] || null

function medir(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  let i = 2
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue }
    const m = b[i + 1]
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

async function portadaDe(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "es-AR,es;q=0.9" } })
  if (!r.ok) throw new Error(`el posteo dio HTTP ${r.status}`)
  const html = await r.text()
  const m = html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/)
    || html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/)
  if (!m) throw new Error("el posteo no expone og:image (¿privado o borrado?)")
  return m[1].replace(/&amp;/g, "&")
}

const { data: formatos, error } = await sb.from("crm_formatos")
  .select("id,nombre,referencia_url,portada_url,portada_origen").eq("activo", true).order("orden")
if (error) throw error

let bajadas = 0, saltadas = 0, fallidas = 0
for (const f of formatos) {
  const link = primerLink(f.referencia_url)
  if (!link) { console.log(`-  ${f.nombre}: sin link de referencia, la portada se sube a mano`); saltadas++; continue }
  if (!forzar && f.portada_url && f.portada_origen === link) { console.log(`=  ${f.nombre}: la portada ya es de ese posteo`); saltadas++; continue }
  if (!forzar && f.portada_url && f.portada_origen === null) { console.log(`=  ${f.nombre}: portada subida a mano, no se toca`); saltadas++; continue }
  try {
    const imagen = await portadaDe(link)
    const resp = await fetch(imagen, { headers: { "user-agent": UA } })
    if (!resp.ok) throw new Error(`la imagen dio HTTP ${resp.status}`)
    const tipo = resp.headers.get("content-type")?.split(";")[0] || "image/jpeg"
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[tipo] || "jpg"
    const bytes = Buffer.from(await resp.arrayBuffer())
    const path = `formato/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${limpio(f.nombre)}.${ext}`
    const { error: e } = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: tipo, cacheControl: "3600", upsert: false })
    if (e) throw e
    const url = `/api/imagen?path=${encodeURIComponent(path)}`
    const { error: e2 } = await sb.from("crm_formatos").update({ portada_url: url, portada_origen: link }).eq("id", f.id)
    if (e2) throw e2
    const d = medir(bytes)
    const forma = d ? `${d.w}x${d.h}${Math.abs(d.w / d.h - 9 / 16) < 0.02 ? " (9:16)" : " ojo: no es 9:16, se recorta a los costados"}` : "medida desconocida"
    console.log(`+  ${f.nombre}: ${Math.round(bytes.length / 1024)} KB · ${forma}`)
    bajadas++
  } catch (e) {
    console.log(`!  ${f.nombre}: ${e.message}`)
    fallidas++
  }
}
console.log(`\n${bajadas} portadas bajadas · ${saltadas} sin cambios · ${fallidas} con problema`)
