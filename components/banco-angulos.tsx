"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Loader2, Plus, Save, Trash2, EyeOff, Eye, X } from "lucide-react"
import { useAngulos } from "@/lib/use-angulos"
import { colorAngulo, CATEGORIAS_CON_COLOR } from "@/lib/colores-angulo"
import type { AnguloBanco } from "@/lib/angulos-semilla"

// Banco de ángulos: la lista que alimenta el desplegable de ángulo de cada pieza de contenido
// y la rotación de Volumen. Editable acá mismo; antes había que tocar el código.

type Borrador = { titulo: string; dolor: string; notas: string }

export function BancoAngulos() {
  const { angulos, dolores, cargando, error, recargar } = useAngulos()
  const [editando, setEditando] = useState<string | null>(null)
  const [borrador, setBorrador] = useState<Borrador>({ titulo: "", dolor: "", notas: "" })
  const [creando, setCreando] = useState(false)
  const [nuevo, setNuevo] = useState<Borrador>({ titulo: "", dolor: "", notas: "" })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [verInactivos, setVerInactivos] = useState(false)

  const visibles = verInactivos ? angulos : angulos.filter((a) => a.activo)
  const inactivos = angulos.filter((a) => !a.activo).length

  async function llamar(metodo: "POST" | "PATCH" | "DELETE", cuerpo: Record<string, unknown>, etiqueta: string) {
    setOcupado(etiqueta); setAviso(null)
    try {
      const r = await fetch("/api/angulos", { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo guardar")
      await recargar()
      return j as { mensaje?: string; desactivado?: boolean }
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message })
      return null
    } finally { setOcupado(null) }
  }

  function abrirEdicion(a: AnguloBanco) {
    setEditando(a.id)
    setBorrador({ titulo: a.titulo, dolor: a.dolor, notas: a.notas || "" })
    setAviso(null)
  }

  async function guardar(a: AnguloBanco) {
    const r = await llamar("PATCH", { id: a.id, titulo: borrador.titulo, dolor: borrador.dolor, notas: borrador.notas }, a.id)
    if (r) { setEditando(null); setAviso({ ok: true, texto: `Ángulo ${a.numero} actualizado.` }) }
  }

  async function crear() {
    const r = await llamar("POST", nuevo, "nuevo")
    if (r) { setNuevo({ titulo: "", dolor: "", notas: "" }); setCreando(false); setAviso({ ok: true, texto: "Ángulo agregado al banco." }) }
  }

  async function borrar(a: AnguloBanco) {
    if (a.usos > 0 && !window.confirm(`El ángulo ${a.numero} lo usan ${a.usos} piezas de contenido.\n\nNo se puede borrar sin romper el histórico, así que se va a desactivar: deja de ofrecerse para contenido nuevo y las métricas viejas quedan intactas.\n\n¿Lo desactivo?`)) return
    if (a.usos === 0 && !window.confirm(`¿Borrar el ángulo ${a.numero}? No lo usa ninguna pieza.`)) return
    const r = await llamar("DELETE", { id: a.id }, a.id)
    if (r) setAviso({ ok: true, texto: r.mensaje || `Ángulo ${a.numero} borrado.` })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Banco de ángulos</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Los ángulos que aparecen para elegir en cada pieza de contenido y los que rota el Volumen semanal.
            Editá el título, cambiá la categoría o agregá uno nuevo. El número es la clave: si renombrás un ángulo,
            las piezas viejas lo siguen y las métricas no se parten.
          </p>
        </div>
        <div className="flex gap-2">
          {inactivos > 0 && (
            <Button variant="outline" size="sm" onClick={() => setVerInactivos((v) => !v)}>
              {verInactivos ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {verInactivos ? "Ocultar inactivos" : `Ver inactivos (${inactivos})`}
            </Button>
          )}
          <Button size="sm" onClick={() => { setCreando((v) => !v); setAviso(null) }}>
            {creando ? <X className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
            {creando ? "Cancelar" : "Nuevo ángulo"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Cada categoría tiene su color en todo el CRM:</span>
        {CATEGORIAS_CON_COLOR.map((c) => (
          <span key={c} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-semibold", colorAngulo(c).chip)}>
            <span className={cn("h-2 w-2 rounded-full", colorAngulo(c).punto)} />{c}
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">No se pudo cargar el banco: {String(error.message || error)}. Se muestra la lista de respaldo.</p>}
      {aviso && <p className={cn("text-sm", aviso.ok ? "text-emerald-400" : "text-red-300")}>{aviso.texto}</p>}

      {creando && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-base">Ángulo nuevo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Título</Label>
              <Input value={nuevo.titulo} onChange={(e) => setNuevo((v) => ({ ...v, titulo: e.target.value }))}
                placeholder="Cómo lo nombra el lead, no cómo lo nombrarías vos" className="mt-1" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-muted-foreground">Categoría</Label>
                <Select value={nuevo.dolor} onValueChange={(v) => setNuevo((x) => ({ ...x, dolor: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Elegí la categoría" /></SelectTrigger>
                  <SelectContent>{dolores.map((d) => (
                    <SelectItem key={d} value={d}>
                      <span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", colorAngulo(d).punto)} />{d}</span>
                    </SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Notas (opcional)</Label>
                <Input value={nuevo.notas} onChange={(e) => setNuevo((v) => ({ ...v, notas: e.target.value }))}
                  placeholder="De dónde salió, en qué DM apareció…" className="mt-1" />
              </div>
            </div>
            <Button onClick={crear} disabled={ocupado !== null || !nuevo.titulo.trim() || !nuevo.dolor}>
              {ocupado === "nuevo" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Agregar al banco
            </Button>
          </CardContent>
        </Card>
      )}

      {cargando && <p className="text-sm text-muted-foreground">Cargando el banco…</p>}

      <div className="space-y-2">
        {visibles.map((a) => (
          <Card key={a.id} className={cn("border-border bg-muted/40", !a.activo && "opacity-55")}>
            <CardContent className="py-3">
              {editando === a.id ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-2 w-8 shrink-0 text-center font-mono text-sm font-bold text-muted-foreground">{a.numero}</span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <Textarea value={borrador.titulo} onChange={(e) => setBorrador((v) => ({ ...v, titulo: e.target.value }))} rows={2} className="text-sm" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Select value={borrador.dolor} onValueChange={(v) => setBorrador((x) => ({ ...x, dolor: v }))}>
                          <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
                          <SelectContent>{dolores.map((d) => (
                    <SelectItem key={d} value={d}>
                      <span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", colorAngulo(d).punto)} />{d}</span>
                    </SelectItem>
                  ))}</SelectContent>
                        </Select>
                        <Input value={borrador.notas} onChange={(e) => setBorrador((v) => ({ ...v, notas: e.target.value }))} placeholder="Notas (opcional)" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pl-11">
                    <Button size="sm" onClick={() => guardar(a)} disabled={ocupado !== null}>
                      {ocupado === a.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}Guardar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-0.5 flex w-8 shrink-0 items-center justify-center gap-1.5 font-mono text-sm font-bold text-muted-foreground">
                    <span className={cn("h-2.5 w-2.5 rounded-full", colorAngulo(a.dolor).punto)} />{a.numero}
                  </span>
                  <button type="button" onClick={() => abrirEdicion(a)} className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold leading-snug">{a.titulo}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className={cn("rounded-md border px-2 py-0.5 font-semibold", colorAngulo(a.dolor).chip)}>{a.dolor}</span>
                      <span>{a.usos === 0 ? "sin piezas todavía" : a.usos === 1 ? "1 pieza" : `${a.usos} piezas`}</span>
                      {!a.activo && <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-amber-300">inactivo</span>}
                      {a.notas && <span className="italic">{a.notas}</span>}
                    </p>
                  </button>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => abrirEdicion(a)}>Editar</Button>
                    <Button size="sm" variant="ghost" onClick={() => llamar("PATCH", { id: a.id, activo: !a.activo }, a.id)} disabled={ocupado !== null} title={a.activo ? "Dejar de ofrecerlo para contenido nuevo" : "Volver a ofrecerlo"}>
                      {a.activo ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => borrar(a)} disabled={ocupado !== null}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Un ángulo que ya se usó no se borra: se desactiva. Así las piezas viejas y las métricas por ángulo siguen enteras,
        y deja de aparecer para contenido nuevo.
      </p>
    </div>
  )
}
