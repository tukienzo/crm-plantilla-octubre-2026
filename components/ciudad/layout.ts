import * as THREE from "three"

// Distribución de la ciudad. Las zonas se ubican en coordenadas de pantalla (u = horizontal, v = profundidad) y se
// pasan al mundo: con la cámara a 45° de azimut, u = (x − z)/√2 y v = (x + z)/√2. Así la composición sigue el
// documento (islas a la izquierda, Setters/Closers/Formación arriba, Agendas al frente, Clientes a la derecha)
// mientras cada sala queda alineada a los ejes del mundo y abierta hacia la cámara.

export const ELEVACION = (35 * Math.PI) / 180
export const AZIMUT = Math.PI / 4
export const DIR_CAMARA = new THREE.Vector3(Math.cos(ELEVACION) * Math.sin(AZIMUT), Math.sin(ELEVACION), Math.cos(ELEVACION) * Math.cos(AZIMUT))

const R2 = Math.SQRT2
export const at = (u: number, v: number): [number, number] => [(u + v) / R2, (v - u) / R2]
export const pantallaU = (x: number, z: number) => (x - z) / R2
export const pantallaY = (x: number, y: number, z: number) => ((x + z) / R2) * Math.sin(ELEVACION) - y * Math.cos(ELEVACION)

export const Z = {
  setters: at(31, 7),
  closers: at(42.5, 9),
  formacion: at(54.5, 5),
  captacion: at(22, 23),
  espera: at(30, 26),
  seguimiento: at(44, 27),
  clientes: at(56, 24),
  agendas: at(37, 43),
}

export const TAM = {
  setters: { w: 7, d: 5.2 },
  closers: { w: 9.6, d: 5.6 },
  formacion: { w: 7.6, d: 6.2 },
  espera: { w: 6.6, d: 5.2 },
  seguimiento: { w: 7, d: 5.6 },
  clientes: { w: 6.6, d: 6 },
  agendas: { w: 13.6, d: 13.6 },
}

// cinta principal: corre sobre el eje z hasta atravesar el portal de Captación
export const CINTA_X = Z.captacion[0]
export const CINTA_DESDE = 24.6
export const CINTA_HASTA = Z.captacion[1] - 1.6
export const CINTA_ANCHO = 1.9

// cuatro islas: dos de cada lado de la cinta principal, a dos alturas
export const ISLAS = [
  { x: CINTA_X - 6.8, z: 6.8, lado: -1 },
  { x: CINTA_X + 6.8, z: 11.4, lado: 1 },
  { x: CINTA_X - 6.8, z: 16.2, lado: -1 },
  { x: CINTA_X + 6.8, z: 20.8, lado: 1 },
] as const
export const ISLA_W = 4.8
export const ISLA_D = 4.2
export const AGUA = { x0: CINTA_X - 10.4, x1: CINTA_X + 10.4, z0: 3.4, z1: 24.4 }

// caminos entre áreas (tramos rectos sobre los ejes del mundo): [x0, z0, x1, z1]
export const CAMINOS: Array<[number, number, number, number]> = [
  [24, -7, 60, -7],          // avenida entre la fila de arriba y la del medio
  [45.5, -31, 45.5, -7],     // avenida que baja de Formación
  [45.5, -16.6, 61, -16.6],  // frente de Clientes
  [27, -14.4, 27, -7],       // Setters
  [36.4, -20.9, 36.4, -7],   // Closers
  [42, -31.4, 45.5, -31.4],  // Formación
  [52, -7, 52, -1.4],        // Agendas
  [34.6, -2.6, 36.3, -2.6],  // Captación → Espera
]

export type Huella = { x: number; z: number; w: number; d: number; h: number }

// huellas para el encuadre (centro, tamaño y altura de lo más alto: carteles y hologramas)
export function huellasCiudad(): Huella[] {
  const sala = (k: keyof typeof TAM, h = 5) => ({ x: Z[k][0], z: Z[k][1], w: TAM[k].w + 0.6, d: TAM[k].d + 0.6, h })
  return [
    sala("setters"), sala("closers"), sala("formacion"), sala("espera", 3.4), sala("seguimiento"), sala("clientes", 6.4), sala("agendas", 3.6),
    { x: Z.captacion[0], z: Z.captacion[1] - 0.6, w: 7.4, d: 6.2, h: 6.6 },
    { x: (AGUA.x0 + AGUA.x1) / 2, z: (AGUA.z0 + AGUA.z1) / 2, w: AGUA.x1 - AGUA.x0, d: AGUA.z1 - AGUA.z0, h: 0.2 },
    ...ISLAS.map((i) => ({ x: i.x, z: i.z, w: ISLA_W, d: ISLA_D, h: 4.4 })),
  ]
}

// escena de prueba: una sala de Seguimiento y una isla con su cinta
export const PRUEBA = {
  sala: { x: 8, z: -2 },
  isla: { x: -4, z: 2 },
  cinta: { x: 1.2, desde: 7, hasta: -3 },
}
export function huellasPrueba(): Huella[] {
  return [
    { x: PRUEBA.sala.x, z: PRUEBA.sala.z, w: TAM.seguimiento.w + 0.6, d: TAM.seguimiento.d + 0.6, h: 5 },
    { x: PRUEBA.isla.x, z: PRUEBA.isla.z, w: ISLA_W, d: ISLA_D, h: 4.4 },
    { x: PRUEBA.cinta.x, z: 2, w: 2, d: 10, h: 0.6 },
  ]
}

// vista general: zoom y punto de mira para que las huellas llenen el área útil (ancho menos el panel abierto)
export function encuadre(huellas: Huella[], ancho: number, alto: number, panel = 0) {
  let u0 = Infinity, u1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const h of huellas) {
    for (const dx of [-h.w / 2, h.w / 2]) for (const dz of [-h.d / 2, h.d / 2]) for (const y of [0, h.h]) {
      const x = h.x + dx, z = h.z + dz
      const u = pantallaU(x, z), py = pantallaY(x, y, z)
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); y0 = Math.min(y0, py); y1 = Math.max(y1, py)
    }
  }
  const util = Math.max(200, ancho - panel)
  const zoom = Math.min((util * 0.92) / (u1 - u0), (alto * 0.86) / (y1 - y0))
  // el centro del contenido cae en el centro del área útil: con panel a la derecha, el punto de mira se corre
  const uc = (u0 + u1) / 2 + panel / 2 / zoom
  const yc = (y0 + y1) / 2
  const v = yc / Math.sin(ELEVACION)
  return { zoom, objetivo: new THREE.Vector3((uc + v) / R2, 0, (v - uc) / R2) }
}
