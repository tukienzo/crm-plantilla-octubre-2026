"use client"

import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Html, MapControls, OrthographicCamera } from "@react-three/drei"
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react"
import * as THREE from "three"
import { COLOR_ANGULO, COLOR_ESTADO, fechaCorta, horaArt, nombreVisible, numero, type CiudadVista, type EstadoSilla, type Seleccion, type Zona } from "./tipos"
import {
  Arbol, Cartel, Cinta, Escritorio, Holograma, Isla, ISLA_ALTO, MesaBaja, MesaRedonda, PantallaAula, Pabellon, Persona, PISO, Planta, Portal,
  Paseante, Sala, SillaAula, SillaOficina, Sillon, Sofa, Tablero, AnimCtx, mat, peloDe, ropaDe, tipStore, type Pose,
} from "./modelos"
import { PALETA } from "./texturas"
import { AGUA, CAMINOS, CINTA_ANCHO, CINTA_DESDE, CINTA_HASTA, CINTA_X, DIR_CAMARA, ELEVACION, ISLA_D, ISLA_W, ISLAS, PRUEBA, TAM, Z, at, encuadre, huellasCiudad, huellasPrueba, type Huella } from "./layout"

// Vista ciudad (segunda versión visual). Diorama isométrico: islas con hologramas sobre el agua, cintas
// que se juntan en la de ManyChat y entran por el portal de Captación, y salas abiertas con muebles que explican qué
// pasa en cada una. Cada persona es un registro real (o un integrante real del equipo); los grupos grandes se
// muestran con una muestra y el cartel da el total exacto. Nada se mueve si no hay un evento real (un contacto nuevo
// que llega con la actualización de datos).

type IslaDato = CiudadVista["islas"][number]
export type Llegada = { id: string; nombre: string; isla: string | null }
type Props = {
  datos: CiudadVista; islas: IslaDato[]; seleccion: Seleccion; onSeleccion: (s: Seleccion) => void
  animar: boolean; nombres: boolean; panel: number; vistaToken: number; modo?: "ciudad" | "prueba"
  llegadas?: Llegada[]; onLlegadaFin?: (id: string) => void
}
type V3 = [number, number, number]

const TEAM = "#2E3A8C"

// Las capas HTML de drei se montan recién cuando el lienzo conectó sus eventos: si se crean antes, drei las vuelve a
// crear al conectarse y React 19 deja la primera vacía (se perdía un horario de la agenda).
function TrasConectar({ children }: { children: ReactNode }) {
  const conectado = useThree((s) => Boolean(s.events.connected))
  return conectado ? <>{children}</> : null
}

function Tooltip() {
  const tip = useSyncExternalStore(tipStore.sub, tipStore.get, () => null)
  return (
    <Html position={tip?.p || [0, -80, 0]} center zIndexRange={[60, 0]} style={{ pointerEvents: "none" }}>
      <div className={`whitespace-nowrap rounded-lg bg-[#20265F] px-2.5 py-1 text-[12px] font-medium text-white shadow-lg ${tip ? "" : "hidden"}`}>{tip?.texto}</div>
    </Html>
  )
}

// zoom actual de la cámara, para esconder los rótulos chicos cuando la vista está muy alejada
const zoomStore = (() => {
  let z = 14
  const subs = new Set<() => void>()
  return { get: () => z, set: (v: number) => { const r = Math.round(v * 2) / 2; if (r !== z) { z = r; subs.forEach((f) => f()) } }, sub: (f: () => void) => { subs.add(f); return () => { subs.delete(f) } } }
})()
const ZOOM_ROTULOS = 9

function Hora(props: { p: V3; hora: string; estado: EstadoSilla; sel: boolean }) {
  return <TrasConectar><HoraHtml {...props} /></TrasConectar>
}
function HoraHtml({ p, hora, estado, sel }: { p: V3; hora: string; estado: EstadoSilla; sel: boolean }) {
  const zoom = useSyncExternalStore(zoomStore.sub, zoomStore.get, () => 14)
  // se esconde con CSS y no se desmonta: montar y desmontar capas HTML seguido hace que React 19 pierda alguna
  const oculta = zoom < ZOOM_ROTULOS && !sel
  return (
    <Html position={p} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div className={`${oculta ? "hidden" : "flex"} items-center gap-1 whitespace-nowrap rounded-full px-2 py-[1px] text-[12.5px] font-semibold tabular-nums shadow-[0_2px_8px_-2px_rgba(32,38,95,0.35)] ${sel ? "bg-[#7550EF] text-white" : "bg-white text-[#20265F]"}`}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLOR_ESTADO[estado] }} />{hora}
      </div>
    </Html>
  )
}

// ── encuadre: vista general reproducible y la selección nunca queda debajo del panel ─────────────────────────
function Encuadre({ huellas, panel, token, foco, esPrueba }: { huellas: Huella[]; panel: number; token: number; foco: V3 | null; esPrueba?: boolean }) {
  const size = useThree((s) => s.size)
  const get = useThree((s) => s.get)
  const hayControles = useThree((s) => Boolean(s.controls))
  const libre = useRef(false)

  useEffect(() => {
    const c = get().controls as unknown as THREE.EventDispatcher<{ start: object }> | null
    if (!c) return
    const f = () => { libre.current = true }
    const g = () => zoomStore.set((get().camera as THREE.OrthographicCamera).zoom)
    c.addEventListener("start", f)
    ;(c as unknown as THREE.EventDispatcher<{ change: object }>).addEventListener("change", g)
    return () => { c.removeEventListener("start", f); (c as unknown as THREE.EventDispatcher<{ change: object }>).removeEventListener("change", g) }
  }, [hayControles, get])

  const aplicar = (objetivo: THREE.Vector3, zoom?: number) => {
    const { camera, controls, invalidate } = get()
    const cam = camera as THREE.OrthographicCamera
    const ctl = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (!ctl || !cam.isOrthographicCamera) return
    cam.position.copy(objetivo).addScaledVector(DIR_CAMARA, 200)
    if (zoom) cam.zoom = zoom
    cam.updateProjectionMatrix()
    ctl.target.copy(objetivo)
    ctl.update()
    zoomStore.set(cam.zoom)
    invalidate()
  }
  // en el celular no se muestra la ciudad entera (quedaría diminuta): arranca cerca, sobre Captación → Espera → Agendas
  const general = () => {
    if (size.width < 640 && !esPrueba) {
      const [x, z] = at(32, 31)
      return { objetivo: new THREE.Vector3(x, 0, z), zoom: size.width / 20 }
    }
    return encuadre(huellas, size.width, size.height, panel)
  }

  // vista general al abrir, al pedirla con el botón y al cambiar el tamaño (si el usuario no movió la cámara)
  useEffect(() => {
    if (!hayControles || !size.width) return
    libre.current = false
    const e = general()
    aplicar(e.objetivo, e.zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hayControles, huellas])
  useEffect(() => {
    if (!hayControles || !size.width || libre.current) return
    const e = general()
    aplicar(e.objetivo, e.zoom)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, panel])

  // si lo elegido quedó debajo del panel o fuera de cuadro, se corre la cámara lo justo (sin cambiar el zoom)
  useEffect(() => {
    if (!foco || !hayControles) return
    const { camera, controls } = get()
    const ctl = controls as unknown as { target: THREE.Vector3 } | null
    if (!ctl) return
    const v = new THREE.Vector3(...foco).project(camera)
    const px = ((v.x + 1) / 2) * size.width, py = ((1 - v.y) / 2) * size.height
    const util = size.width - panel
    if (px > 40 && px < util - 40 && py > 40 && py < size.height - 40) return
    const cam = camera as THREE.OrthographicCamera
    const dx = (px - util / 2) / cam.zoom, dy = (py - size.height / 2) / cam.zoom
    const derecha = new THREE.Vector3(1, 0, -1).normalize()
    const abajo = new THREE.Vector3(1, 0, 1).normalize().multiplyScalar(1 / Math.sin(ELEVACION))
    const objetivo = ctl.target.clone().addScaledVector(derecha, dx).addScaledVector(abajo, dy)
    libre.current = true
    aplicar(objetivo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.[0], foco?.[1], foco?.[2], panel])
  return null
}

// Luz principal con sombras suaves, apuntada al centro de la escena (el target tiene que estar en la escena).
function LuzPrincipal({ centro }: { centro: V3 }) {
  const ref = useRef<THREE.DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const l = ref.current
    if (!l) return
    l.target.position.set(...centro)
    scene.add(l.target)
    return () => { scene.remove(l.target) }
  }, [scene, centro])
  return (
    <directionalLight
      ref={ref} position={[centro[0] - 20, 44, centro[2] + 6]} intensity={2.3} color="#FFFDFB" castShadow
      shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-radius={3} shadow-blurSamples={10}
      shadow-camera-left={-48} shadow-camera-right={48} shadow-camera-top={48} shadow-camera-bottom={-48} shadow-camera-near={1} shadow-camera-far={160} shadow-bias={-0.0004}
    />
  )
}

// ── suelo y agua ──────────────────────────────────────────────────────────────────────────────────────────
function Suelo() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[30, -0.06, -6]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color="#FBF9FF" roughness={0.95} />
    </mesh>
  )
}

function Agua({ x0, x1, z0, z1 }: { x0: number; x1: number; z0: number; z1: number }) {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
  const borde = mat("#ECE6FB", 0.8)
  const tramos: Array<[number, number, number, number]> = [[cx, z0 - 0.25, w + 1, 0.5], [cx, z1 + 0.25, w + 1, 0.5], [x0 - 0.25, cz, 0.5, d], [x1 + 0.25, cz, 0.5, d]]
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.0, cz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#BDEBFA" roughness={0.3} metalness={0} />
      </mesh>
      {tramos.map(([x, z, ww, dd], i) => (
        <mesh key={i} position={[x, 0.09, z]} material={borde} castShadow receiveShadow><boxGeometry args={[ww, 0.3, dd]} /></mesh>
      ))}
    </group>
  )
}

// ── islas ─────────────────────────────────────────────────────────────────────────────────────────────────
function IslaContenido({ isla, x, z, lado, sel, onSeleccion, gente, nombres, idSel, hastaX = CINTA_X + lado * (CINTA_ANCHO / 2 - 0.05), rutaFin }: {
  isla: IslaDato; x: number; z: number; lado: number; sel: boolean; onSeleccion: Props["onSeleccion"]
  gente: CiudadVista["captacion"]["lista"]; nombres: boolean; idSel?: string; hastaX?: number; rutaFin?: V3[]
}) {
  const color = COLOR_ANGULO[isla.angulo || ""] || "#9B87F5"
  const titulo = String(isla.formato || isla.categoria || isla.nombre || "Pieza").slice(0, 22)
  const formato = isla.categoria === "Carrusel" ? "Carrusel" : isla.categoria === "Historia" ? "Historia" : "Reel"
  const abrir = () => onSeleccion({ zona: "contenido", id: isla.id })
  const tip = `${isla.nombre} · ${isla.ig?.alcance ? `${numero(isla.ig.alcance)} alcanzados · ` : ""}${isla.leads === null ? "leads N/D" : `${numero(isla.leads)} leads`}${isla.semana ? ` · ${numero(isla.semana)} en 7 días` : ""}`
  // la cinta de la isla sale hacia la cinta principal
  const x0 = x - lado * (ISLA_W / 2 - 0.2), x1 = hastaX
  return (
    <group>
      <Cinta desde={[x0, z]} hasta={[x1, z]} ancho={1.15} />
      <Isla p={[x, 0, z]} w={ISLA_W} d={ISLA_D} sel={sel} onClick={abrir}>
        <Holograma p={[-0.5, 1.75, -0.6]} titulo={titulo} formato={formato} fecha={fechaCorta(isla.fecha)} color={color} imagen={isla.preview?.imagen} onClick={abrir} tip={tip} />
        <mesh position={[-0.5, 0.1, -0.6]} castShadow receiveShadow material={mat("#EAE3FF", 0.6)}><cylinderGeometry args={[0.75, 0.85, 0.2, 28]} /></mesh>
        <mesh position={[-0.5, 0.21, -0.6]} material={mat(color, 0.5, { emissive: color, ei: 0.5 })}><cylinderGeometry args={[0.55, 0.55, 0.03, 28]} /></mesh>
        <Arbol p={[lado < 0 ? -1.75 : 1.75, 0, 1.25]} escala={0.7} />
        <Planta p={[lado < 0 ? 1.7 : -1.7, 0, -1.4]} escala={0.8} />
      </Isla>
      {/* los últimos contactos que entraron por esta pieza: bajan de la isla por su cinta hasta el portal */}
      {gente.slice(0, 2).map((g, i) => (
        <Paseante key={g.id} ruta={[[x - lado * 0.5, ISLA_ALTO, z + 1.0], [x0, ISLA_ALTO, z], [x1 - lado * 0.4, ISLA_ALTO, z], ...(rutaFin || [])]} vel={1.25} fase={i * 0.5} pausa={1.2}
          ropa={ropaDe(g.id)} pelo={peloDe(g.id)} semilla={g.id} tip={`${nombreVisible(g.nombre, nombres)} · entró ${fechaCorta(g.desde?.slice(0, 10))} ${horaArt(g.desde)}`}
          onClick={() => onSeleccion({ zona: "captacion", id: g.id })} seleccionada={idSel === g.id} />
      ))}
    </group>
  )
}

// Contacto nuevo que llegó con la última actualización: camina una vez por su cinta hasta el portal.
function Caminante({ ruta, l, onFin }: { ruta: Array<[number, number]>; l: Llegada; onFin: () => void }) {
  const ref = useRef<THREE.Group>(null)
  const t0 = useRef<number | null>(null)
  const listo = useRef(false)
  const largos = useMemo(() => ruta.slice(1).map((p, i) => Math.hypot(p[0] - ruta[i][0], p[1] - ruta[i][1])), [ruta])
  const total = largos.reduce((a, b) => a + b, 0)
  useFrame(({ clock, invalidate }) => {
    if (!ref.current || listo.current) return
    if (t0.current === null) t0.current = clock.getElapsedTime()
    let d = (clock.getElapsedTime() - t0.current) * 2.4
    if (d >= total) { listo.current = true; onFin(); return }
    let i = 0
    while (i < largos.length - 1 && d > largos[i]) { d -= largos[i]; i++ }
    const a = ruta[i], b = ruta[i + 1], f = largos[i] ? d / largos[i] : 1
    ref.current.position.set(a[0] + (b[0] - a[0]) * f, ISLA_ALTO, a[1] + (b[1] - a[1]) * f)
    ref.current.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1])
    invalidate()
  })
  return (
    <group ref={ref} position={[ruta[0][0], ISLA_ALTO, ruta[0][1]]}>
      <Persona p={[0, 0, 0]} pose="caminando" ropa={ropaDe(l.id)} pelo={peloDe(l.id)} tip={`Recién llegado: ${l.nombre}`} />
    </group>
  )
}

// ── salas ─────────────────────────────────────────────────────────────────────────────────────────────────
type ZonaProps = { datos: CiudadVista; seleccion: Seleccion; onSeleccion: Props["onSeleccion"]; nombres: boolean }
const elegida = (s: Seleccion, z: Zona) => s?.zona === z

function SalaSeguimiento({ p, datos, seleccion, onSeleccion, nombres }: ZonaProps & { p: V3 }) {
  const { w, d } = TAM.seguimiento
  const lista = datos.seguimiento.lista.slice(0, 5)
  const asientos: Array<{ p: V3; rot: number; pose: Pose }> = [
    { p: [-2.15, 0, -1.55], rot: 0, pose: "conversando" },
    { p: [-1.43, 0, -1.55], rot: 0, pose: "sentado" },
    { p: [0.15, 0, -0.75], rot: -Math.PI / 2, pose: "conversando" },
    { p: [1.05, 0, 1.45], rot: Math.PI / 2, pose: "conversando" },
    { p: [2.75, 0, 1.45], rot: -Math.PI / 2, pose: "sentado" },
  ]
  const abrir = () => onSeleccion({ zona: "seguimiento" })
  return (
    <Sala p={p} w={w} d={d} paredDer={2.2} sel={elegida(seleccion, "seguimiento")} onClick={abrir}>
      <Sofa p={[-1.79, 0, -1.65]} plazas={2} color="#FFFFFF" acento="#F6B3E2" />
      <Sillon p={[0.25, 0, -0.75]} rot={-Math.PI / 2} color="#FFFFFF" acento="#B9A8FF" />
      <MesaBaja p={[-1.2, 0, -0.45]} flor />
      <Sillon p={[1.0, 0, 1.45]} rot={Math.PI / 2} color="#FFFFFF" acento="#F6B3E2" />
      <Sillon p={[2.8, 0, 1.45]} rot={-Math.PI / 2} color="#FFFFFF" acento="#B9A8FF" />
      <MesaBaja p={[1.9, 0, 1.45]} r={0.32} />
      <Planta p={[2.9, 0, -2.2]} />
      <Planta p={[-3.0, 0, 2.2]} escala={0.8} />
      {lista.map((s, i) => {
        const a = asientos[i]
        return <Persona key={s.id} p={a.p} rot={a.rot} pose={a.pose} ropa={s.vencido ? PALETA.coral : ropaDe(String(s.id))} pelo={peloDe(String(s.id))}
          tip={`${nombreVisible(s.nombre, nombres)} · ${s.vencido ? `FUP vencido ${fechaCorta(String(s.proximo_fup).slice(0, 10))}` : s.proximo_fup ? `FUP ${fechaCorta(String(s.proximo_fup).slice(0, 10))}` : "sin próximo FUP"}`}
          onClick={() => onSeleccion({ zona: "seguimiento", id: String(s.id) })} seleccionada={seleccion?.id === String(s.id)} />
      })}
      <Cartel p={[0, 3 + 0.35, -d / 2 + 0.3]} giro={0} titulo="SEGUIMIENTO" contador={numero(datos.seguimiento.total)} onClick={abrir} />
    </Sala>
  )
}

function SalaSetters({ p, datos, seleccion, onSeleccion }: ZonaProps & { p: V3 }) {
  const { w, d } = TAM.setters
  const equipo = datos.setters.equipo.filter((s) => s.en_equipo).slice(0, 3)
  const abrir = () => onSeleccion({ zona: "setters" })
  const xs = [-2.15, 0, 2.15]
  return (
    <Sala p={p} w={w} d={d} paredDer={1.6} sel={elegida(seleccion, "setters")} onClick={abrir}>
      {xs.map((x, i) => {
        const s = equipo[i]
        return (
          <group key={x}>
            <Escritorio p={[x, 0, -1.0]} encendido={Boolean(s)} />
            <SillaOficina p={[x, 0, -0.1]} rot={Math.PI} color={s ? "#7550EF" : "#CFC6F2"} />
            {s ? <Persona p={[x, 0, -0.1]} rot={Math.PI} pose="trabajando" ropa={TEAM} pelo={peloDe(s.nombre)}
              tip={`${s.nombre} · ${s.agendas_7d} agendas en 7 días`} onClick={() => onSeleccion({ zona: "setters", id: s.nombre })} seleccionada={seleccion?.id === s.nombre} /> : null}
          </group>
        )
      })}
      <Tablero p={[-1.6, 1.85, -d / 2 + 0.3]} />
      <Planta p={[3.0, 0, 1.9]} />
      <Cartel p={[0, 3 + 0.35, -d / 2 + 0.3]} giro={0} titulo="SETTERS" contador={numero(datos.setters.conversando.total)} onClick={abrir} />
    </Sala>
  )
}

function SalaCloser({ datos, seleccion, onSeleccion, nombres, p }: ZonaProps & { p: V3 }) {
  const { w, d } = TAM.closers
  const closers = datos.closers.filter((c) => c.en_equipo).slice(0, 2)
  const abrir = () => onSeleccion({ zona: "closers" })
  return (
    <Sala p={p} w={w} d={d} sel={elegida(seleccion, "closers")} onClick={abrir}>
      {/* dos ambientes de reunión separados por un vidrio */}
      <mesh position={[0, 1.35, -0.75]} material={mat("#DCD3FF", 0.2, { opacity: 0.35 })}><boxGeometry args={[0.06, 2.7, d - 1.6]} /></mesh>
      <mesh position={[0, 2.72, -0.75]} material={mat("#FFFFFF", 0.6)} castShadow><boxGeometry args={[0.12, 0.08, d - 1.6]} /></mesh>
      {[-2.4, 2.4].map((cx, i) => {
        const c = closers[i]
        const lead = c?.en_horario || null
        return (
          <group key={cx}>
            <MesaRedonda p={[cx, 0, 0.1]} />
            <Sillon p={[cx - 1.05, 0, 0.1]} rot={Math.PI / 2} color="#FFFFFF" acento={i ? "#F6B3E2" : "#B9A8FF"} />
            <Sillon p={[cx + 1.05, 0, 0.1]} rot={-Math.PI / 2} color="#FFFFFF" acento={i ? "#B9A8FF" : "#F6B3E2"} />
            {c ? <Persona p={[cx - 1.05, 0, 0.1]} rot={Math.PI / 2} pose="conversando" ropa={TEAM} pelo={peloDe(c.nombre)}
              tip={`${c.nombre} · ${c.llamadas} calls hoy`} onClick={() => onSeleccion({ zona: "closers", id: c.nombre })} seleccionada={seleccion?.id === c.nombre} /> : null}
            {lead ? <Persona p={[cx + 1.05, 0, 0.1]} rot={-Math.PI / 2} pose="conversando" ropa={ropaDe(lead.id)} pelo={peloDe(lead.id)}
              tip={`${lead.hora} · ${nombreVisible(lead.nombre, nombres)} (en horario)`} onClick={() => onSeleccion({ zona: "agendas", id: lead.id })} seleccionada={seleccion?.id === lead.id} /> : null}
            <Planta p={[cx + (i ? 1.9 : -1.9), 0, -1.9]} escala={0.8} />
          </group>
        )
      })}
      <Cartel p={[0, 3 + 0.35, -d / 2 + 0.3]} giro={0} titulo="CLOSERS" contador={((n) => `${n} call${n === 1 ? "" : "s"}`)(datos.closers.reduce((t, c) => t + c.llamadas, 0))} onClick={abrir} />
    </Sala>
  )
}

function SalaFormacion({ datos, seleccion, onSeleccion, nombres, p }: ZonaProps & { p: V3 }) {
  const { w, d } = TAM.formacion
  const alumnos = datos.clientes.lista.slice(0, 8)
  const abrir = () => onSeleccion({ zona: "formacion" })
  const xs = [-2.25, -0.75, 0.75, 2.25], zs = [0.35, 1.8]
  return (
    <Sala p={p} w={w} d={d} paredDer={2.4} sel={elegida(seleccion, "formacion")} onClick={abrir}>
      <PantallaAula p={[0.7, 1.95, -d / 2 + 0.32]} w={3.2} />
      {zs.flatMap((z, f) => xs.map((x, k) => {
        const a = alumnos[f * 4 + k]
        return (
          <group key={`${f}${k}`}>
            <SillaAula p={[x, 0, z]} rot={Math.PI} />
            {a ? <Persona p={[x, 0, z]} rot={Math.PI} pose="alumno" ropa={ropaDe(String(a.id))} pelo={peloDe(String(a.id))}
              tip={`${nombreVisible(a.nombre, nombres)} · actividad N/D`} onClick={() => onSeleccion({ zona: "formacion", id: String(a.id) })} seleccionada={seleccion?.id === String(a.id)} /> : null}
          </group>
        )
      }))}
      <Planta p={[3.2, 0, -2.4]} />
      <Cartel p={[0, 3 + 0.35, -d / 2 + 0.3]} giro={0} titulo="FORMACIÓN" contador={numero(datos.formacion.alumnos)} onClick={abrir} />
    </Sala>
  )
}

function SalaEspera({ datos, seleccion, onSeleccion, nombres, p }: ZonaProps & { p: V3 }) {
  const { w, d } = TAM.espera
  const lista = datos.espera.lista.slice(0, 6)
  const abrir = () => onSeleccion({ zona: "espera" })
  const asientos: Array<{ p: V3; rot: number; pose: Pose }> = [
    { p: [-1.44, 0, -1.4], rot: 0, pose: "sentado" }, { p: [-0.72, 0, -1.4], rot: 0, pose: "conversando" }, { p: [0.0, 0, -1.4], rot: 0, pose: "conversando" },
    { p: [-2.15, 0, 0.95], rot: Math.PI / 2, pose: "sentado" }, { p: [2.2, 0, -0.2], rot: -Math.PI / 2, pose: "conversando" }, { p: [2.2, 0, 1.2], rot: -Math.PI / 2, pose: "sentado" },
  ]
  return (
    <Sala p={p} w={w} d={d} alto={2.1} sel={elegida(seleccion, "espera")} onClick={abrir}>
      <Sofa p={[-0.72, 0, -1.5]} plazas={3} color="#FFFFFF" acento="#F6B3E2" />
      <Sillon p={[-2.15, 0, 0.95]} rot={Math.PI / 2} color="#FFFFFF" acento="#B9A8FF" />
      <Sillon p={[2.25, 0, -0.2]} rot={-Math.PI / 2} color="#FFFFFF" acento="#F6B3E2" />
      <Sillon p={[2.25, 0, 1.2]} rot={-Math.PI / 2} color="#FFFFFF" acento="#B9A8FF" />
      <MesaBaja p={[-0.4, 0, 0.3]} flor />
      <Planta p={[2.6, 0, -1.9]} escala={0.9} />
      {lista.map((g, i) => {
        const a = asientos[i]
        return <Persona key={g.id} p={a.p} rot={a.rot} pose={a.pose} ropa={ropaDe(g.id)} pelo={peloDe(g.id)}
          tip={`${nombreVisible(g.nombre, nombres)} · espera desde ${fechaCorta(g.desde?.slice(0, 10))}`} onClick={() => onSeleccion({ zona: "espera", id: g.id })} seleccionada={seleccion?.id === g.id} />
      })}
      <Cartel p={[0, 2.1 + 0.35, -d / 2 + 0.3]} giro={0} titulo="ESPERA" contador={numero(datos.espera.total)} onClick={abrir} />
    </Sala>
  )
}

function ZonaCaptacion({ datos, seleccion, onSeleccion, nombres, p }: ZonaProps & { p: V3 }) {
  const abrir = () => onSeleccion({ zona: "captacion" })
  void nombres
  return (
    <Portal p={p} sel={elegida(seleccion, "captacion")} onClick={abrir}>
      <Planta p={[-3.0, 0, -2.6]} />
      <Planta p={[3.0, 0, 1.6]} escala={0.8} />
      <Cartel p={[0, 2.9 + 2.3 + 0.75, 0.75]} giro={0} titulo="CAPTACIÓN" contador={`${numero(datos.captacion.hoy)} hoy`} onClick={abrir} />
    </Portal>
  )
}

function ZonaClientes({ datos, seleccion, onSeleccion, nombres, p }: ZonaProps & { p: V3 }) {
  const { w, d } = TAM.clientes
  const nuevos = datos.clientes.lista.filter((c) => c.nuevo).slice(2, 4)
  const abrir = () => onSeleccion({ zona: "clientes" })
  const lugares: Array<{ p: V3; rot: number; pose: Pose }> = [
    { p: [2.4, 0, d / 2 + 1.2], rot: -Math.PI / 2, pose: "charlando" }, { p: [1.55, 0, d / 2 + 1.2], rot: Math.PI / 2, pose: "parado" },
  ]
  return (
    <Pabellon p={p} w={w} d={d} sel={elegida(seleccion, "clientes")} onClick={abrir}>
      <mesh position={[-0.9, 0.48, -1.3]} material={mat("#FFFFFF", 0.6)} castShadow receiveShadow><boxGeometry args={[2.3, 0.96, 0.72]} /></mesh>
      <mesh position={[-0.9, 0.98, -1.3]} material={mat(PALETA.violeta, 0.5)} castShadow><boxGeometry args={[2.4, 0.06, 0.8]} /></mesh>
      <Planta p={[1.9, 0, -1.9]} />
      <Planta p={[-2.6, 0, 1.6]} escala={0.8} />
      {nuevos.map((c, i) => {
        const l = lugares[i]
        return <Persona key={c.id} p={[l.p[0], -PISO, l.p[2]]} rot={l.rot} pose={l.pose} ropa={ropaDe(String(c.id))} pelo={peloDe(String(c.id))}
          tip={`${nombreVisible(c.nombre, nombres)} · entró ${fechaCorta(String(c.fecha_ingreso || "").slice(0, 10))}`} onClick={() => onSeleccion({ zona: "clientes", id: String(c.id) })} seleccionada={seleccion?.id === String(c.id)} />
      })}
      <Cartel p={[0, 3.8 + 0.95, d / 2 + 0.45]} giro={0} titulo="CLIENTES" contador={`${numero(datos.clientes.nuevos_30d)} nuevos`} onClick={abrir} alto={1.35} />
    </Pabellon>
  )
}

function PlazaAgendas({ datos, seleccion, onSeleccion, nombres, p }: ZonaProps & { p: V3 }) {
  const { w, d } = TAM.agendas
  const abrir = () => onSeleccion({ zona: "agendas" })
  // una fila por closer (cortes de a 4); se ven hasta 12 sillas, el resto está en el panel
  const filas: Array<CiudadVista["agendas"]["carriles"][number]["sillas"]> = []
  for (const c of datos.agendas.carriles) for (let i = 0; i < c.sillas.length; i += 4) filas.push(c.sillas.slice(i, i + 4))
  const visibles = filas.slice(0, 3)
  // retícula en diagonal: cada fila queda horizontal en pantalla y las butacas miran a la cámara
  const lugar = (k: number, f: number): [number, number] => {
    const i = k - 1.5, j = f - (visibles.length - 1) / 2
    return [i * 2.6 + j * 2.5, -i * 2.6 + j * 2.5]
  }
  const borde = elegida(seleccion, "agendas") ? mat(PALETA.violeta, 0.5, { emissive: PALETA.violeta, ei: 0.35 }) : mat("#E4DEF7", 0.85)
  return (
    <group position={p}>
      <mesh position={[0, 0.1, 0]} material={borde} receiveShadow castShadow onClick={(e) => { e.stopPropagation(); abrir() }}><boxGeometry args={[w + 0.5, 0.2, d + 0.5]} /></mesh>
      <mesh position={[0, PISO - 0.08, 0]} material={mat("#FFFBF8", 0.8)} receiveShadow onClick={(e) => { e.stopPropagation(); abrir() }}><boxGeometry args={[w, 0.16, d]} /></mesh>
      <mesh position={[0, PISO + 0.002, 0.5]} rotation={[-Math.PI / 2, 0, 0]} material={mat("#F1ECFE", 0.8)} receiveShadow><planeGeometry args={[w - 1.6, d - 2.6]} /></mesh>
      <group position={[0, PISO, 0]}>
        {visibles.flatMap((fila, f) => fila.map((s, k) => {
          const [x, z] = lugar(k, f)
          const sel = seleccion?.id === s.id
          const vacia = s.estado === "no_show" || s.estado === "cancelada"
          const tenue = s.estado === "sin_resultado" || s.estado === "reprogramada"
          const tip = `${s.hora} · ${nombreVisible(s.nombre, nombres)} · ${datos.estados[s.estado].label}`
          return (
            <group key={s.id}>
              <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]} material={mat(sel ? PALETA.violeta : COLOR_ESTADO[s.estado], 0.6, { basica: true, opacity: sel ? 0.75 : 0.32 })}><circleGeometry args={[0.78, 36]} /></mesh>
              <Sillon p={[x, 0, z]} rot={Math.PI / 4} color="#FFFFFF" acento={vacia ? "#E9E5F5" : "#ECE6FF"} onClick={() => onSeleccion({ zona: "agendas", id: s.id })} tip={tip} />
              {vacia ? null : <Persona p={[x, 0, z]} rot={Math.PI / 4} pose="sentado" ropa={ropaDe(s.id)} pelo={peloDe(s.id)} atenuada={tenue} tip={tip} onClick={() => onSeleccion({ zona: "agendas", id: s.id })} seleccionada={sel} />}
              <Hora p={[x, 2.05, z]} hora={s.hora} estado={s.estado} sel={sel} />
            </group>
          )
        }))}
        <Arbol p={[-w / 2 + 0.75, 0, d / 2 - 0.75]} escala={0.85} />
        <Arbol p={[w / 2 - 0.75, 0, -d / 2 + 0.75]} escala={0.85} />
        <Planta p={[w / 2 - 0.6, 0, d / 2 - 0.6]} />
        <Planta p={[-w / 2 + 0.6, 0, -d / 2 + 2.2]} escala={0.8} />
        {[-3.2, 3.2].map((x) => <mesh key={x} position={[x, 1.1, -d / 2 + 0.45]} material={mat("#FFFFFF", 0.6)} castShadow><boxGeometry args={[0.16, 2.2, 0.16]} /></mesh>)}
        <TrasConectar><Html position={[0, 0.6, 0.5]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
          <div className={`${datos.agendas.total === 0 ? "" : "hidden"} whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-[12.5px] font-medium text-[#6E6590] shadow-sm`}>Sin calls este día</div>
        </Html></TrasConectar>
        <Cartel p={[0, 2.7, -d / 2 + 0.45]} giro={0} titulo="AGENDAS" contador={String(datos.agendas.total)} onClick={abrir} />
      </group>
    </group>
  )
}

// ── composición ───────────────────────────────────────────────────────────────────────────────────────────
const ARBOLES: Array<[number, number, number]> = ([
  [25.5, 14, 0.95], [37, 16.5, 1], [50, 17, 0.95], [62, 14, 0.9], [48.5, 38, 0.9], [27, 35.5, 0.85], [62.5, 33, 0.9], [37, 30.5, 0.8], [49.5, 1, 0.8],
] as Array<[number, number, number]>).map(([u, v, e]) => { const [x, z] = at(u, v); return [x, z, e] })

// Recorridos entre áreas, en coordenadas del mundo (y = altura del piso que pisa: suelo 0,05, salas PISO).
const S = (x: number, z: number): V3 => [x, 0.05, z]
const P = (x: number, z: number): V3 => [x, PISO, z]
const RUTAS = {
  captacionEspera: [P(33.2, -1.6), P(35.3, -1.6), S(35.9, -1.6), S(35.9, 0.8), S(38.8, 0.8), P(38.8, -0.4), P(38.8, -0.9)],
  esperaSetters: [P(42.3, -0.6), S(43.7, -0.6), S(43.7, -7), S(27, -7), S(27, -13.8), P(27, -14.9)],
  closersSeguimiento: [P(37.6, -21.5), S(37.6, -20.4), S(37.6, -7), S(48.3, -7), S(48.3, -8.7), P(48.3, -9.9)],
  seguimientoClientes: [P(53.4, -9.6), S(54.3, -9.6), S(54.3, -16.6), S(56.6, -16.6), S(56.6, -18.0), P(56.6, -18.6), P(56.6, -19.9)],
  entradaClientes: [S(54.6, -15.8), S(56.2, -17.4), P(56.2, -18.7), P(56.2, -19.9)],
  clientesFormacion: [S(55.0, -17.6), S(55.0, -16.6), S(45.5, -16.6), S(45.5, -30.6), S(43.0, -30.6), P(43.0, -32.4)],
  formador: [P(Z.formacion[0] - 2.7, Z.formacion[1] - 1.9), P(Z.formacion[0] - 0.4, Z.formacion[1] - 1.9)],
}

function Ciudad({ datos, islas, seleccion, onSeleccion, nombres, llegadas = [], onLlegadaFin }: Props) {
  const zp = { datos, seleccion, onSeleccion, nombres }
  const visibles = islas.slice(0, 4)
  const idsVisibles = new Set(visibles.map((i) => i.id))
  // por isla: los que entraron hoy; si hoy no entró nadie por esa pieza, los de los últimos 7 días que siguen sin agenda
  const porIsla = (id: string) => {
    const hoy = datos.captacion.lista.filter((g) => g.isla === id)
    return hoy.length ? hoy : [...datos.espera.lista, ...datos.setters.conversando.lista].filter((g) => g.isla === id)
  }
  const quien = (n: string) => nombreVisible(n, nombres)
  const sel = (id: string) => seleccion?.id === id
  const otros = datos.captacion.lista.filter((g) => !g.isla || !idsVisibles.has(g.isla)).slice(0, 3)
  const rutaDe = (l: Llegada): Array<[number, number]> => {
    const k = visibles.findIndex((i) => i.id === l.isla)
    if (k < 0) return [[CINTA_X, CINTA_DESDE - 0.5], [CINTA_X, CINTA_HASTA + 0.5]]
    const s = ISLAS[k]
    return [[s.x - s.lado * (ISLA_W / 2 - 0.3), s.z], [CINTA_X, s.z], [CINTA_X, CINTA_HASTA + 0.5]]
  }
  return (
    <group>
      <Suelo />
      <Agua {...AGUA} />
      {CAMINOS.map(([x0, z0, x1, z1], i) => (
        <mesh key={i} position={[(x0 + x1) / 2, 0.0, (z0 + z1) / 2]} material={mat("#EAE4FA", 0.9)} receiveShadow>
          <boxGeometry args={[Math.abs(x1 - x0) + 1.5, 0.08, Math.abs(z1 - z0) + 1.5]} />
        </mesh>
      ))}
      <Cinta desde={[CINTA_X, CINTA_DESDE]} hasta={[CINTA_X, CINTA_HASTA]} ancho={CINTA_ANCHO} onClick={() => onSeleccion({ zona: "captacion" })} />
      <Cartel p={[CINTA_X - 1.9, 2.2, 13.6]} giro={Math.PI / 2} titulo="ManyChat" alto={1.3} onClick={() => onSeleccion({ zona: "captacion" })} />
      <mesh position={[CINTA_X - 1.9, 0.75, 13.6]} material={mat("#FFFFFF", 0.6)} castShadow><boxGeometry args={[0.14, 1.5, 0.14]} /></mesh>
      {visibles.map((isla, k) => (
        <IslaContenido key={isla.id} isla={isla} x={ISLAS[k].x} z={ISLAS[k].z} lado={ISLAS[k].lado} sel={seleccion?.zona === "contenido" && seleccion.id === isla.id}
          onSeleccion={onSeleccion} gente={porIsla(isla.id)} nombres={nombres} idSel={seleccion?.id}
          rutaFin={[[CINTA_X + ISLAS[k].lado * 0.35, ISLA_ALTO, ISLAS[k].z], [CINTA_X + ISLAS[k].lado * 0.35, ISLA_ALTO, CINTA_HASTA + 0.6]]} />
      ))}
      {otros.map((g, i) => (
        <Paseante key={g.id} ruta={[[CINTA_X + (i % 2 ? 0.35 : -0.35), ISLA_ALTO, CINTA_DESDE - 0.3], [CINTA_X + (i % 2 ? 0.35 : -0.35), ISLA_ALTO, CINTA_HASTA + 0.6]]} vel={1.3} fase={i / 3} pausa={1}
          ropa={ropaDe(g.id)} pelo={peloDe(g.id)} semilla={g.id} tip={`${quien(g.nombre)} · entró ${horaArt(g.desde)}${g.origen ? ` por ${g.origen}` : ""}`}
          onClick={() => onSeleccion({ zona: "captacion", id: g.id })} seleccionada={sel(g.id)} />
      ))}
      {/* Captación → Espera: los últimos que entraron hoy */}
      {datos.captacion.lista.slice(0, 3).map((g, i) => (
        <Paseante key={`ce${g.id}`} ruta={RUTAS.captacionEspera} vel={1.1} fase={i / 3} pausa={2} ropa={ropaDe(g.id)} pelo={peloDe(g.id)} semilla={g.id}
          tip={`${quien(g.nombre)} · entró ${horaArt(g.desde)}`} onClick={() => onSeleccion({ zona: "captacion", id: g.id })} seleccionada={sel(g.id)} />
      ))}
      {/* Espera → Setters: contactos asignados a un setter, en conversación */}
      {datos.setters.conversando.lista.slice(0, 2).map((g, i) => (
        <Paseante key={`es${g.id}`} ruta={RUTAS.esperaSetters} vel={1.25} fase={i / 2} pausa={2} ropa={ropaDe(g.id)} pelo={peloDe(g.id)} semilla={g.id}
          tip={`${quien(g.nombre)} · en conversación con setter`} onClick={() => onSeleccion({ zona: "setters", id: g.id })} seleccionada={sel(g.id)} />
      ))}
      {/* Closers → Seguimiento: leads en seguimiento que no entran sentados en la sala */}
      {datos.seguimiento.lista.slice(5, 7).map((s, i) => (
        <Paseante key={`cs${s.id}`} ruta={RUTAS.closersSeguimiento} vel={1.2} fase={i / 2} pausa={2} ropa={ropaDe(String(s.id))} pelo={peloDe(String(s.id))} semilla={String(s.id)}
          tip={`${quien(s.nombre)} · seguimiento${s.closer ? ` con ${s.closer}` : ""}`} onClick={() => onSeleccion({ zona: "seguimiento", id: String(s.id) })} seleccionada={sel(String(s.id))} />
      ))}
      {/* entrada a Clientes y Seguimiento → Clientes: clientes que entraron en los últimos 30 días */}
      {datos.clientes.lista.filter((c) => c.nuevo).slice(0, 2).map((c, i) => (
        <Paseante key={`ec${c.id}`} ruta={RUTAS.entradaClientes} vel={1.0} fase={i / 2} pausa={2.5} ropa={ropaDe(String(c.id))} pelo={peloDe(String(c.id))} semilla={String(c.id)}
          tip={`${quien(c.nombre)} · entró ${fechaCorta(String(c.fecha_ingreso || "").slice(0, 10))}`} onClick={() => onSeleccion({ zona: "clientes", id: String(c.id) })} seleccionada={sel(String(c.id))} />
      ))}
      {datos.clientes.lista.filter((c) => c.nuevo).slice(4, 6).map((c, i) => (
        <Paseante key={`sc${c.id}`} ruta={RUTAS.seguimientoClientes} vel={1.2} fase={i / 2} pausa={2} ropa={ropaDe(String(c.id))} pelo={peloDe(String(c.id))} semilla={String(c.id)}
          tip={`${quien(c.nombre)} · cliente desde ${fechaCorta(String(c.fecha_ingreso || "").slice(0, 10))}`} onClick={() => onSeleccion({ zona: "clientes", id: String(c.id) })} seleccionada={sel(String(c.id))} />
      ))}
      {/* Clientes → Formación: alumnos que van a clase */}
      {datos.clientes.lista.slice(8, 10).map((c, i) => (
        <Paseante key={`cf${c.id}`} ruta={RUTAS.clientesFormacion} vel={1.25} fase={i / 2} pausa={2} ropa={ropaDe(String(c.id))} pelo={peloDe(String(c.id))} semilla={String(c.id)}
          tip={`${quien(c.nombre)} · alumno`} onClick={() => onSeleccion({ zona: "formacion", id: String(c.id) })} seleccionada={sel(String(c.id))} />
      ))}
      {/* el formador camina frente a la pantalla y se detiene a explicar */}
      <Paseante ruta={RUTAS.formador} vel={0.55} idaYVuelta pausa={3.5} poseQuieto="presentando" ropa={TEAM} pelo="#2B2133" semilla="formador" tip="Equipo de formación" />
      {llegadas.map((l) => <Caminante key={l.id} l={l} ruta={rutaDe(l)} onFin={() => onLlegadaFin?.(l.id)} />)}

      <ZonaCaptacion {...zp} p={[Z.captacion[0], 0, Z.captacion[1]]} />
      <SalaEspera {...zp} p={[Z.espera[0], 0, Z.espera[1]]} />
      <SalaSetters {...zp} p={[Z.setters[0], 0, Z.setters[1]]} />
      <SalaCloser {...zp} p={[Z.closers[0], 0, Z.closers[1]]} />
      <SalaFormacion {...zp} p={[Z.formacion[0], 0, Z.formacion[1]]} />
      <SalaSeguimiento {...zp} p={[Z.seguimiento[0], 0, Z.seguimiento[1]]} />
      <ZonaClientes {...zp} p={[Z.clientes[0], 0, Z.clientes[1]]} />
      <PlazaAgendas {...zp} p={[Z.agendas[0], 0, Z.agendas[1]]} />
      {ARBOLES.map(([x, z, e], i) => <Arbol key={i} p={[x, 0, z]} escala={e} />)}
    </group>
  )
}

function Prueba({ datos, islas, seleccion, onSeleccion, nombres }: Props) {
  const isla = islas[0]
  return (
    <group>
      <Suelo />
      <Agua x0={PRUEBA.isla.x - 3.6} x1={PRUEBA.cinta.x + 1.6} z0={PRUEBA.isla.z - 3.2} z1={PRUEBA.isla.z + 3.4} />
      <Cinta desde={[PRUEBA.cinta.x, PRUEBA.cinta.desde]} hasta={[PRUEBA.cinta.x, PRUEBA.cinta.hasta]} ancho={CINTA_ANCHO} />
      {isla ? <IslaContenido isla={isla} x={PRUEBA.isla.x} z={PRUEBA.isla.z} lado={-1} sel={false} onSeleccion={onSeleccion} gente={datos.captacion.lista.slice(0, 2)} nombres={nombres} hastaX={PRUEBA.cinta.x - CINTA_ANCHO / 2 + 0.05}
        rutaFin={[[PRUEBA.cinta.x - 0.35, ISLA_ALTO, PRUEBA.isla.z], [PRUEBA.cinta.x - 0.35, ISLA_ALTO, PRUEBA.cinta.hasta + 0.5]]} /> : null}
      <SalaSeguimiento datos={datos} seleccion={seleccion} onSeleccion={onSeleccion} nombres={nombres} p={[PRUEBA.sala.x, 0, PRUEBA.sala.z]} />
    </group>
  )
}

// foco de cámara de lo elegido (centro aproximado de su zona)
function focoDe(s: Seleccion, islas: IslaDato[]): V3 | null {
  if (!s) return null
  const k = islas.findIndex((i) => i.id === s.id)
  if (s.zona === "contenido" && k >= 0 && k < 4) return [ISLAS[k].x, 1.5, ISLAS[k].z]
  const mapa: Partial<Record<Zona, [number, number]>> = {
    captacion: Z.captacion, espera: Z.espera, setters: Z.setters, closers: Z.closers, formacion: Z.formacion,
    seguimiento: Z.seguimiento, clientes: Z.clientes, agendas: Z.agendas, contenido: [CINTA_X, 14],
  }
  const c = mapa[s.zona]
  return c ? [c[0], 1.5, c[1]] : null
}

export default function Escena(props: Props) {
  const huellas = useMemo(() => (props.modo === "prueba" ? huellasPrueba() : huellasCiudad()), [props.modo])
  const foco = focoDe(props.seleccion, props.islas)
  const contenido: ReactNode = props.modo === "prueba" ? <Prueba {...props} /> : <Ciudad {...props} />
  return (
    <Canvas
      shadows="variance" dpr={[1, 2]} frameloop={props.animar || (props.llegadas?.length ?? 0) > 0 ? "always" : "demand"}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      onCreated={({ scene }) => { scene.background = new THREE.Color(PALETA.fondo) }}
      onPointerMissed={() => props.onSeleccion(null)}
    >
      <OrthographicCamera makeDefault position={[200, 200, 200]} zoom={14} near={-1000} far={2000} />
      <MapControls makeDefault enableRotate={false} zoomToCursor enableDamping dampingFactor={0.12} minZoom={4} maxZoom={90} />
      <Encuadre huellas={huellas} panel={props.panel} token={props.vistaToken} foco={foco} esPrueba={props.modo === "prueba"} />
      <hemisphereLight args={["#FFFFFF", "#DDD3F8", 1.55]} />
      <ambientLight intensity={0.35} color="#F3EEFF" />
      <LuzPrincipal centro={props.modo === "prueba" ? [2, 0, 0] : [42, 0, -6]} />
      <directionalLight position={[-30, 40, 40]} intensity={0.35} color="#E7DEFF" />
      <AnimCtx.Provider value={props.animar}>{contenido}</AnimCtx.Provider>
      <TrasConectar><Tooltip /></TrasConectar>
    </Canvas>
  )
}
