import * as THREE from "three"

// Texturas dibujadas en canvas: carteles de cada área, hologramas de las islas, flechas de las cintas y las pantallas.
// Todo texto que vive en la escena se pinta acá (no hay capas HTML, excepto los horarios y el tooltip).

export const PALETA = {
  fondo: "#F1EDFF", arquitectura: "#FAF9FF", sombra: "#DAD5EF", texto: "#20265F",
  violeta: "#7550EF", rosa: "#E94ACB", azul: "#527BEA", coral: "#FF8A70", agua: "#A6DDF2",
}

const FUENTE = `"Inter", "Segoe UI", system-ui, -apple-system, sans-serif`
const cache = new Map<string, { tex: THREE.CanvasTexture; aspecto: number }>()

function lienzo(w: number, h: number) {
  const c = document.createElement("canvas")
  c.width = w; c.height = h
  return { c, g: c.getContext("2d") as CanvasRenderingContext2D }
}

function redondeado(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function textura(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// Cartel de área: pastilla violeta con el nombre en blanco y, si hay, un contador chico en una pastilla blanca.
export function cartel(titulo: string, contador?: string | null) {
  const k = `cartel|${titulo}|${contador || ""}`
  const hit = cache.get(k)
  if (hit) return hit
  const H = 200, pad = 56, gap = 26, ESC = 0.9  // el título va un poco condensado para que el cartel no exceda la pared
  const medir = lienzo(10, 10).g
  medir.font = `800 112px ${FUENTE}`
  const wt = (medir.measureText(titulo).width + titulo.length * 4) * ESC
  medir.font = `700 70px ${FUENTE}`
  const wc = contador ? medir.measureText(contador).width + 56 : 0
  const W = Math.ceil(pad * 2 + wt + (contador ? gap + wc : 0))
  const { c, g } = lienzo(W, H)
  const grad = g.createLinearGradient(0, 0, W, H)
  grad.addColorStop(0, "#7B57F2"); grad.addColorStop(1, "#5A3FD8")
  redondeado(g, 0, 0, W, H, 46); g.fillStyle = grad; g.fill()
  redondeado(g, 6, 6, W - 12, H * 0.48, 40); g.fillStyle = "rgba(255,255,255,0.10)"; g.fill()
  g.fillStyle = "#FFFFFF"; g.textBaseline = "middle"
  g.font = `800 112px ${FUENTE}`
  // espaciado de letras a mano (canvas no tiene letterSpacing en todos los navegadores)
  g.save(); g.scale(ESC, 1)
  let x = pad / ESC
  for (const ch of titulo) { g.fillText(ch, x, H / 2 + 6); x += g.measureText(ch).width + 4 }
  g.restore()
  if (contador) {
    const px = pad + wt + gap
    redondeado(g, px, 46, wc, H - 92, (H - 92) / 2); g.fillStyle = "#FFFFFF"; g.fill()
    g.fillStyle = "#4B32C8"; g.font = `700 70px ${FUENTE}`; g.textAlign = "center"
    g.fillText(contador, px + wc / 2, H / 2 + 4)
  }
  const out = { tex: textura(c), aspecto: W / H }
  cache.set(k, out)
  return out
}

const GLIFO: Record<string, string> = { Reel: "▶", Carrusel: "▤", Historia: "◷", Ads: "◆" }

// Holograma de una isla: miniatura real si existe; si no, una placa que dice explícitamente que no hay vista previa.
export function holograma(o: { titulo: string; formato: string; fecha: string; color: string; imagen?: HTMLImageElement | null }) {
  const W = 480, H = 600
  const { c, g } = lienzo(W, H)
  if (o.imagen) {
    const r = Math.max(W / o.imagen.width, H / o.imagen.height)
    const iw = o.imagen.width * r, ih = o.imagen.height * r
    g.drawImage(o.imagen, (W - iw) / 2, (H - ih) / 2, iw, ih)
    const sombra = g.createLinearGradient(0, H * 0.55, 0, H)
    sombra.addColorStop(0, "rgba(32,38,95,0)"); sombra.addColorStop(1, "rgba(32,38,95,0.55)")
    g.fillStyle = sombra; g.fillRect(0, 0, W, H)
  } else {
    const fondo = g.createLinearGradient(0, 0, W, H)
    fondo.addColorStop(0, "#F7F3FF"); fondo.addColorStop(1, "#E7DEFF")
    g.fillStyle = fondo; g.fillRect(0, 0, W, H)
    g.fillStyle = o.color; g.globalAlpha = 0.16
    g.beginPath(); g.arc(W / 2, H * 0.47, 120, 0, Math.PI * 2); g.fill()
    g.globalAlpha = 1
    g.fillStyle = o.color; g.font = `700 120px ${FUENTE}`; g.textAlign = "center"; g.textBaseline = "middle"
    g.fillText(GLIFO[o.formato] || "◆", W / 2 + (o.formato === "Reel" ? 10 : 0), H * 0.47)
    g.fillStyle = "#7A6FA6"; g.font = `italic 500 34px ${FUENTE}`
    g.fillText("sin vista previa", W / 2, H * 0.72)
  }
  // franja de título arriba
  g.textAlign = "left"; g.textBaseline = "middle"
  redondeado(g, 20, 20, W - 40, 96, 26); g.fillStyle = "rgba(255,255,255,0.94)"; g.fill()
  const ig = g.createLinearGradient(36, 36, 100, 100)
  ig.addColorStop(0, "#FEDA75"); ig.addColorStop(0.35, "#FA7E1E"); ig.addColorStop(0.6, "#D62976"); ig.addColorStop(0.85, "#962FBF"); ig.addColorStop(1, "#4F5BD5")
  redondeado(g, 36, 36, 64, 64, 18); g.fillStyle = ig; g.fill()
  g.strokeStyle = "#FFFFFF"; g.lineWidth = 6
  redondeado(g, 49, 49, 38, 38, 11); g.stroke()
  g.beginPath(); g.arc(68, 68, 9, 0, Math.PI * 2); g.stroke()
  g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(80, 56, 3.5, 0, Math.PI * 2); g.fill()
  g.fillStyle = PALETA.texto; g.font = `800 44px ${FUENTE}`
  let t = o.titulo
  while (g.measureText(t).width > W - 160 && t.length > 4) t = t.slice(0, -2)
  g.fillText(t === o.titulo ? t : `${t.trim()}…`, 118, 70)
  // fecha abajo
  g.font = `700 32px ${FUENTE}`
  const wf = g.measureText(o.fecha).width + 40
  redondeado(g, W - wf - 24, H - 72, wf, 50, 25); g.fillStyle = "rgba(255,255,255,0.94)"; g.fill()
  g.fillStyle = PALETA.violeta; g.textAlign = "center"; g.fillText(o.fecha, W - wf / 2 - 24, H - 46)
  return textura(c)
}

// Marco degradé de Instagram para el holograma (se usa como textura del borde).
export function marcoDegrade() {
  const k = "marco"
  const hit = cache.get(k)
  if (hit) return hit.tex
  const { c, g } = lienzo(256, 256)
  const gr = g.createLinearGradient(0, 0, 256, 256)
  gr.addColorStop(0, "#F58EDB"); gr.addColorStop(0.5, "#9B6BFF"); gr.addColorStop(1, "#6C8BFF")
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
  const t = textura(c)
  cache.set(k, { tex: t, aspecto: 1 })
  return t
}

// Flechas para la superficie de las cintas (se repite a lo largo).
export function flechas() {
  const k = "flechas"
  const hit = cache.get(k)
  if (hit) return hit.tex
  const { c, g } = lienzo(128, 128)
  g.fillStyle = "#6F55E6"; g.fillRect(0, 0, 128, 128)
  g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 10; g.lineCap = "round"; g.lineJoin = "round"
  g.beginPath(); g.moveTo(44, 36); g.lineTo(76, 64); g.lineTo(44, 92); g.stroke()
  const t = textura(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  cache.set(k, { tex: t, aspecto: 1 })
  return t
}

// Pantalla del aula: una diapositiva abstracta (sin números: no es un dato).
export function diapositiva() {
  const k = "diapo"
  const hit = cache.get(k)
  if (hit) return hit.tex
  const { c, g } = lienzo(512, 300)
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, 512, 300)
  g.fillStyle = PALETA.violeta; g.fillRect(0, 0, 512, 16)
  g.fillStyle = PALETA.texto; g.fillRect(40, 48, 220, 22)
  g.fillStyle = "#C9C0F2"
  for (let i = 0; i < 4; i++) g.fillRect(40, 100 + i * 34, 180 - i * 20, 12)
  const barras = [70, 110, 90, 150, 190]
  barras.forEach((h, i) => { g.fillStyle = i === 4 ? PALETA.rosa : "#9B87F5"; g.fillRect(300 + i * 38, 250 - h, 26, h) })
  const t = textura(c)
  cache.set(k, { tex: t, aspecto: 512 / 300 })
  return t
}

// Tablero de la oficina de setters: notas de colores (decoración, sin datos).
export function tablero() {
  const k = "tablero"
  const hit = cache.get(k)
  if (hit) return hit.tex
  const { c, g } = lienzo(400, 240)
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, 400, 240)
  const colores = ["#F9C6E8", "#CFC3FF", "#BFD3FF", "#FFD8CC", "#E3DBFF"]
  for (let f = 0; f < 3; f++) for (let k2 = 0; k2 < 5; k2++) {
    g.fillStyle = colores[(f + k2) % colores.length]
    g.fillRect(24 + k2 * 74, 24 + f * 70, 56, 52)
  }
  const t = textura(c)
  cache.set(k, { tex: t, aspecto: 400 / 240 })
  return t
}
