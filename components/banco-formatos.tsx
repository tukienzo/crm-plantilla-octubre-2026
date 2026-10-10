"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Loader2, Plus, Save, Trash2, EyeOff, Eye, X, ExternalLink, ImageOff, Lock } from "lucide-react"
import { useFormatos, previewFormato, primerLink, type FormatoBanco } from "@/lib/use-formatos"
import { SubirImagen } from "@/components/subir-imagen"

// Panel de formatos: el catálogo de formatos elegibles para una pieza, con la referencia visual de
// cada uno agrupada por tipo (reels, carruseles, historias). Solo el admin puede agregar, editar,
// desactivar o borrar; el resto del equipo lo usa como panel de referencia.

type Borrador = { nombre: string; tipo: string; descripcion: string; referencia_url: string; portada_url: string; notas: string }
const VACIO: Borrador = { nombre: "", tipo: "Reel", descripcion: "", referencia_url: "", portada_url: "", notas: "" }

// La portada es lo que se ve; el click siempre lleva al ejemplo real (el reel, el carrusel, el
// archivo de Drive). Si no hay portada ni imagen derivable, queda el botón para abrirlo.
function Referencia({ formato }: { formato: Pick<FormatoBanco, "nombre" | "portada_url" | "referencia_url"> }) {
  const p = previewFormato(formato)
  const destino = primerLink(formato.referencia_url) || formato.portada_url
  const [rota, setRota] = useState(false)
  if (p.tipo === "imagen" && !rota) {
    // Marco 9:16, que es como se ve un reel. La portada va entera, sin recortar: las verticales
    // llenan el marco y las apaisadas (el formato HORIZONTAL, por ejemplo) quedan centradas sobre
    // una copia difuminada de sí mismas, en vez de perder los costados.
    const imagen = (
      <span className="relative block aspect-[9/16] w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl saturate-150" loading="lazy" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.src} alt={`Portada de ${formato.nombre}`} className="relative h-full w-full object-contain transition group-hover:scale-[1.03]" onError={() => setRota(true)} loading="lazy" />
      </span>
    )
    return destino
      ? <a href={destino} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-lg border border-border bg-muted">{imagen}</a>
      : <div className="group overflow-hidden rounded-lg border border-border bg-muted">{imagen}</div>
  }
  if ((p.tipo === "link" || rota) && destino) {
    return (
      <a href={destino} target="_blank" rel="noreferrer" className="flex aspect-[9/16] items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-2 text-center text-xs font-semibold text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
        <span className="flex flex-col items-center gap-1.5"><ExternalLink className="h-4 w-4" />Ver el ejemplo{p.tipo === "link" && p.dominio ? <span className="block font-normal opacity-70">{p.dominio}</span> : null}</span>
      </a>
    )
  }
  return (
    <div className="flex aspect-[9/16] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/30 px-2 text-center text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4" />Sin portada
    </div>
  )
}

export function BancoFormatos() {
  const { formatos, tipos, admin, cargando, error, recargar } = useFormatos()
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<Borrador>(VACIO)
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState<Borrador>(VACIO)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [verInactivos, setVerInactivos] = useState(false)

  const visibles = verInactivos ? formatos : formatos.filter((f) => f.activo)
  const inactivos = formatos.filter((f) => !f.activo).length
  const porTipo = useMemo(() => {
    const m = new Map<string, FormatoBanco[]>()
    for (const f of visibles) {
      if (!m.has(f.tipo)) m.set(f.tipo, [])
      m.get(f.tipo)!.push(f)
    }
    return [...m.entries()].sort(([a], [b]) => tipos.indexOf(a) - tipos.indexOf(b))
  }, [visibles, tipos])

  async function llamar(metodo: "POST" | "PATCH" | "DELETE", cuerpo: Record<string, unknown>, etiqueta: string) {
    setOcupado(etiqueta); setAviso(null)
    try {
      const r = await fetch("/api/banco-formatos", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo guardar")
      await recargar()
      return j as { mensaje?: string }
    } catch (e) { setAviso({ ok: false, texto: (e as Error).message }); return null } finally { setOcupado(null) }
  }

  function abrirEdicion(f: FormatoBanco) {
    setEditando(f.id)
    setBorrador({ nombre: f.nombre, tipo: f.tipo, descripcion: f.descripcion || "", referencia_url: f.referencia_url || "", portada_url: f.portada_url || "", notas: f.notas || "" })
    setAviso(null)
  }
  async function guardar(f: FormatoBanco) {
    const r = await llamar("PATCH", { id: f.id, ...borrador }, f.id)
    if (r) { setEditando(null); setAviso({ ok: true, texto: `Formato ${borrador.nombre} actualizado.` }) }
  }
  async function crear() {
    const r = await llamar("POST", nuevo, "nuevo")
    if (r) { setNuevo(VACIO); setCreando(false); setAviso({ ok: true, texto: "Formato agregado al catálogo." }) }
  }
  async function borrar(f: FormatoBanco) {
    const msg = f.usos > 0
      ? `El formato ${f.nombre} lo usan ${f.usos} piezas.\n\nNo se puede borrar sin romper el histórico, así que se va a desactivar: deja de ofrecerse para piezas nuevas y las que ya existen quedan intactas.\n\n¿Lo desactivo?`
      : `¿Borrar el formato ${f.nombre}? No lo usa ninguna pieza.`
    if (!window.confirm(msg)) return
    const r = await llamar("DELETE", { id: f.id }, f.id)
    if (r) setAviso({ ok: true, texto: r.mensaje || `Formato ${f.nombre} borrado.` })
  }

  const campos = (valor: Borrador, set: (b: Borrador) => void, id?: string) => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <div>
          <Label className="text-xs text-muted-foreground">Nombre</Label>
          <Input value={valor.nombre} onChange={(e) => set({ ...valor, nombre: e.target.value })} placeholder="Ej. TALKING HEAD" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={valor.tipo} onValueChange={(v) => set({ ...valor, tipo: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Cuándo se usa</Label>
        <Textarea value={valor.descripcion} onChange={(e) => set({ ...valor, descripcion: e.target.value })} rows={2} className="mt-1" placeholder="Para qué sirve este formato y cuándo conviene usarlo" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Portada de referencia</Label>
        <Input value={valor.referencia_url} onChange={(e) => set({ ...valor, referencia_url: e.target.value })} className="mt-1" placeholder="Link al reel, carrusel, imagen o Drive que sirve de ejemplo" />
        <SubirImagen destino="formato" id={id} titulo={valor.nombre} className="mt-1.5"
          etiqueta={valor.portada_url ? "Cambiar la portada" : "Subir la portada desde la compu"}
          onSubido={async (url) => { set({ ...valor, portada_url: url }); await recargar() }} />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {valor.portada_url ? "Ya tiene portada cargada: es la imagen que se ve en el panel. El link de arriba es el ejemplo que se abre al tocarla." : "El link de Instagram o TikTok no se puede incrustar: subí una captura y esa es la portada que se ve. Un link de imagen, de YouTube o de Drive muestra miniatura solo."}
        </p>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Formatos de pieza</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            El catálogo de formatos que se puede elegir en cada pieza, con la referencia de cómo se ve cada uno.
            {admin ? " Como admin, podés agregar, editar, desactivar y borrar." : " Solo el admin puede modificarlos."}
          </p>
        </div>
        <div className="flex gap-2">
          {inactivos > 0 && (
            <Button variant="outline" size="sm" onClick={() => setVerInactivos((v) => !v)}>
              {verInactivos ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {verInactivos ? "Ocultar inactivos" : `Ver inactivos (${inactivos})`}
            </Button>
          )}
          {admin && (
            <Button size="sm" onClick={() => { setCreando((v) => !v); setAviso(null) }}>
              {creando ? <X className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}{creando ? "Cancelar" : "Nuevo formato"}
            </Button>
          )}
        </div>
      </div>

      {!admin && (
        <p className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />Estás viendo el panel de referencia. Para cambiar el catálogo, pedíselo a quien administra el CRM (rol CEO).
        </p>
      )}
      {error && <p className="text-sm text-red-500 dark:text-red-300">No se pudo cargar: {String(error.message || error)}. Se muestra el catálogo de respaldo.</p>}
      {aviso && <p className={cn("text-sm", aviso.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-300")}>{aviso.texto}</p>}

      {creando && admin && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-3 pt-5">
            {campos(nuevo, setNuevo)}
            <Button onClick={crear} disabled={ocupado !== null || !nuevo.nombre.trim()}>
              {ocupado === "nuevo" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Agregar al catálogo
            </Button>
          </CardContent>
        </Card>
      )}

      {cargando && <p className="text-sm text-muted-foreground">Cargando el catálogo…</p>}

      {porTipo.map(([tipo, lista]) => (
        <section key={tipo} className="space-y-2">
          <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">{tipo} · {lista.length}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {lista.map((f) => (
              <Card key={f.id} className={cn("overflow-hidden", !f.activo && "opacity-60")}>
                <CardContent className="space-y-2 p-2.5">
                  {editando === f.id ? (
                    <>
                      {campos(borrador, setBorrador, f.id)}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => guardar(f)} disabled={ocupado !== null}>
                          {ocupado === f.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Guardar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Referencia formato={f} />
                      {admin ? <SubirImagen destino="formato" id={f.id} titulo={f.nombre}
                        variant={f.portada_url ? "ghost" : "outline"}
                        etiqueta={f.portada_url ? "Cambiar portada" : "Subir portada"}
                        onSubido={() => { recargar() }} /> : null}
                      <div>
                        <p className="text-sm font-black leading-tight">{f.nombre}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {f.usos === 0 ? "sin piezas todavía" : f.usos === 1 ? "1 pieza" : `${f.usos} piezas`}
                          {!f.activo && " · inactivo"}
                        </p>
                      </div>
                      {f.descripcion && <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{f.descripcion}</p>}
                      {admin && (
                        <div className="flex gap-1 border-t border-border pt-2">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => abrirEdicion(f)}>Editar</Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => llamar("PATCH", { id: f.id, activo: !f.activo }, f.id)} disabled={ocupado !== null} title={f.activo ? "Dejar de ofrecerlo" : "Volver a ofrecerlo"}>
                            {f.activo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-red-500 hover:text-red-400" onClick={() => borrar(f)} disabled={ocupado !== null}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Un formato que ya se usó no se borra: se desactiva, así las piezas viejas y las métricas por formato quedan enteras.
        Si le cambiás el nombre a un formato, las piezas que lo usaban se renombran con él.
      </p>
    </div>
  )
}
