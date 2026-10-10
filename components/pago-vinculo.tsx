"use client"

import { useEffect, useState } from "react"
import useSWR, { mutate as mutateGlobal } from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { Link2, Loader2, Plus, Unlink, CheckCircle2 } from "lucide-react"

// Bloque "ManyChat y planes de pago" del diálogo Editar pago: vincula el pago con el contacto de
// ManyChat (y por lo tanto con la persona del CRM), muestra los planes de pago del cliente, deja
// marcar este pago como una cuota de un plan existente o crear un plan nuevo desde acá.

type Item = { id: string; orden: number; concepto: string; numero_cuota: number | null; monto: number; fecha_planeada: string | null; estado: string; pago_id: string | null; da_acceso: boolean; medio_de_pago: string | null }
type Plan = { id: string; cliente: string; operacion: string | null; closer: string | null; categoria_venta: string | null; fecha_alta: string | null; fecha_baja: string | null; person_id: string | null; plan_pago_items: Item[] }
type Estado = {
  pago: { id: string; cliente: string | null; telefono: string | null; person_id: string | null }
  persona: { id: string; display_name: string | null; primary_phone: string | null; primary_instagram: string | null } | null
  manychat: { id: string; nombre?: string | null; ig?: string | null } | null
  planes: Plan[]
  cuotaDeEstePago: (Item & { plan_id: string }) | null
}
type Fila = { concepto: string; monto: string; fecha_planeada: string; da_acceso: boolean; es_este_pago: boolean }

const fetcher = (url: string) => fetch(url).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || "No se pudo cargar"); return b })
const money = (n: number) => `USD ${Math.round(Number(n || 0)).toLocaleString("es-AR")}`
const fecha = (f: string | null) => (f ? f.slice(0, 10).split("-").reverse().join("/") : "—")

export function PagoVinculo({ pagoId, defaults }: { pagoId: string; defaults: { tipo?: string | null; monto?: number | string | null; fecha?: string | null; fecha_alta?: string | null; operacion?: string | null; closer?: string | null; setter?: string | null; calificacion?: string | null; fuente?: string | null } }) {
  const key = `/api/pagos/vinculo?id=${pagoId}`
  const { data, error, mutate } = useSWR<Estado>(key, fetcher, { revalidateOnFocus: false })
  const [mcId, setMcId] = useState("")
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [categoria, setCategoria] = useState<"Front End" | "Back End">("Front End")
  const [filas, setFilas] = useState<Fila[]>([])

  useEffect(() => { setMcId(data?.manychat?.id || "") }, [data?.manychat?.id])
  useEffect(() => {
    if (!nuevo) return
    const hoy = new Date().toISOString().slice(0, 10)
    const f = (defaults.fecha || hoy).slice(0, 10)
    const proximo = new Date(f); proximo.setDate(proximo.getDate() + 30)
    setFilas([
      { concepto: defaults.tipo || "Venta Nueva", monto: String(defaults.monto ?? ""), fecha_planeada: f, da_acceso: true, es_este_pago: true },
      { concepto: "Cuota 2", monto: "", fecha_planeada: proximo.toISOString().slice(0, 10), da_acceso: false, es_este_pago: false },
    ])
  }, [nuevo, defaults.fecha, defaults.monto, defaults.tipo])

  async function llamar(body: Record<string, unknown>, etiqueta: string) {
    setOcupado(etiqueta); setMsg(null)
    try {
      const r = await fetch("/api/pagos/vinculo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: pagoId, ...body }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "No se pudo guardar")
      await mutate(j, { revalidate: false })
      void mutateGlobal("/api/planes-pago")
      return true
    } catch (e) { setMsg({ ok: false, texto: (e as Error).message }); return false } finally { setOcupado(null) }
  }

  const vincularMc = async () => { if (await llamar({ manychat_id: mcId }, "mc")) setMsg({ ok: true, texto: "Pago vinculado al contacto de ManyChat." }) }
  const crearPlan = async () => {
    const items = filas.filter((f) => f.concepto.trim() && f.monto !== "" && f.fecha_planeada)
    if (!items.length) { setMsg({ ok: false, texto: "Completá concepto, monto y fecha en al menos una cuota." }); return }
    const ok = await llamar({ accion: "nuevo_plan", plan: { operacion: defaults.operacion, closer: defaults.closer, setter: defaults.setter, calificacion: defaults.calificacion, fuente: defaults.fuente, fecha_alta: defaults.fecha_alta || defaults.fecha, categoria_venta: categoria }, items: items.map((f, i) => ({ ...f, monto: Number(f.monto), numero_cuota: i + 1 })) }, "plan")
    if (ok) { setNuevo(false); setMsg({ ok: true, texto: "Plan creado y vinculado a este pago." }) }
  }

  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[.04] p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ManyChat ID del lead</Label>
          <Input value={mcId} onChange={(e) => setMcId(e.target.value)} placeholder="ej. 1234567890 (Contactos → el contacto → ID)" inputMode="numeric" />
        </div>
        <Button type="button" onClick={vincularMc} disabled={!mcId.trim() || ocupado !== null} className="sm:mb-0">{ocupado === "mc" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Vincular</Button>
      </div>
      {error && <p className="text-xs text-red-300">{String(error.message || error)}</p>}
      {data && (
        <p className="text-xs text-muted-foreground">
          {data.manychat
            ? <>Vinculado a <b className="text-foreground">{data.manychat.nombre || data.persona?.display_name || "contacto"}</b>{data.manychat.ig ? ` (@${data.manychat.ig})` : ""} · ManyChat {data.manychat.id}{data.persona ? ` · persona del CRM: ${data.persona.display_name}` : ""}</>
            : data.persona
              ? <>Persona del CRM: <b className="text-foreground">{data.persona.display_name}</b>{data.persona.primary_instagram ? ` (@${data.persona.primary_instagram})` : ""} · sin ManyChat ID todavía</>
              : <>Este pago no está vinculado a ninguna persona. Pegá el ManyChat ID del lead y se crea o se enlaza la persona con sus agendas y planes.</>}
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Planes de pago del cliente</p>
        <Button type="button" size="sm" variant={nuevo ? "outline" : "default"} onClick={() => setNuevo((v) => !v)} disabled={ocupado !== null}><Plus className="mr-1.5 h-3.5 w-3.5" />{nuevo ? "Cancelar plan nuevo" : "Nuevo plan"}</Button>
      </div>
      {!data && !error && <p className="text-xs text-muted-foreground">Cargando…</p>}
      {data && !data.planes.length && !nuevo && <p className="text-xs text-muted-foreground">Este cliente no tiene planes de pago cargados. Podés crear uno acá y este pago queda como su primera cuota.</p>}
      {data?.planes.map((plan) => (
        <div key={plan.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
          <p className="text-xs font-semibold">{plan.operacion || "Plan"} <span className="font-normal text-muted-foreground">· {plan.categoria_venta || "—"} · alta {fecha(plan.fecha_alta)}{plan.closer ? ` · ${plan.closer}` : ""}{!plan.person_id ? " · sin persona (se vincula con el ManyChat ID)" : ""}</span></p>
          <div className="mt-1.5 space-y-1">
            {plan.plan_pago_items.map((it) => {
              const esEste = it.pago_id === pagoId
              return (
                <div key={it.id} className={cn("flex flex-wrap items-center gap-2 rounded-md px-2 py-1 text-xs", esEste ? "bg-emerald-500/15" : "bg-white/[.03]")}>
                  <span className="w-5 text-muted-foreground">{it.numero_cuota ?? it.orden}</span>
                  <span className="min-w-[110px] font-medium">{it.concepto}</span>
                  <span className="min-w-[80px]">{money(it.monto)}</span>
                  <span className="min-w-[70px] text-muted-foreground">{fecha(it.fecha_planeada)}</span>
                  <span className={cn("rounded px-1.5 py-0.5", it.estado === "pagado" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/60")}>{it.estado}{it.da_acceso ? " · da acceso" : ""}</span>
                  <span className="ml-auto">
                    {esEste
                      ? <button type="button" onClick={() => llamar({ accion: "desvincular_cuota", itemId: it.id }, it.id)} disabled={ocupado !== null} className="inline-flex items-center gap-1 text-emerald-300 hover:underline"><CheckCircle2 className="h-3.5 w-3.5" />Este pago es esta cuota <Unlink className="ml-1 h-3 w-3 opacity-60" /></button>
                      : it.pago_id
                        ? <span className="text-muted-foreground">vinculada a otro pago</span>
                        : <button type="button" onClick={() => llamar({ accion: "vincular_cuota", itemId: it.id }, it.id)} disabled={ocupado !== null} className="inline-flex items-center gap-1 text-primary hover:underline">{ocupado === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}Este pago es esta cuota</button>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {nuevo && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">Plan nuevo para {data?.pago.cliente || "este cliente"}</span>
            <span className="text-muted-foreground">· {defaults.operacion || "sin operación"} · categoría</span>
            {(["Front End", "Back End"] as const).map((c) => <button key={c} type="button" onClick={() => setCategoria(c)} className={cn("rounded-full border px-2 py-0.5", categoria === c ? "border-primary bg-primary text-primary-foreground" : "border-white/15 text-muted-foreground")}>{c}</button>)}
          </div>
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_130px_auto_auto] items-center gap-2">
              <Input value={f.concepto} onChange={(e) => setFilas((v) => v.map((x, j) => (j === i ? { ...x, concepto: e.target.value } : x)))} placeholder="Concepto (Venta Nueva, Cuota 2…)" className="h-8 text-xs" />
              <Input value={f.monto} onChange={(e) => setFilas((v) => v.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))} placeholder="USD" type="number" className="h-8 text-xs" />
              <Input value={f.fecha_planeada} onChange={(e) => setFilas((v) => v.map((x, j) => (j === i ? { ...x, fecha_planeada: e.target.value } : x)))} type="date" className="h-8 text-xs" />
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" checked={f.da_acceso} onChange={(e) => setFilas((v) => v.map((x, j) => (j === i ? { ...x, da_acceso: e.target.checked } : x)))} />acceso</label>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="radio" name={`este-${pagoId}`} checked={f.es_este_pago} onChange={() => setFilas((v) => v.map((x, j) => ({ ...x, es_este_pago: j === i })))} />este pago</label>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setFilas((v) => { const u = v[v.length - 1]; const d = u?.fecha_planeada ? new Date(u.fecha_planeada) : new Date(); d.setDate(d.getDate() + 30); return [...v, { concepto: `Cuota ${v.length + 1}`, monto: u?.monto && !u.es_este_pago ? u.monto : "", fecha_planeada: d.toISOString().slice(0, 10), da_acceso: false, es_este_pago: false }] })}><Plus className="mr-1 h-3.5 w-3.5" />Agregar cuota</Button>
            <Button type="button" size="sm" onClick={crearPlan} disabled={ocupado !== null}>{ocupado === "plan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Crear plan</Button>
            <span className="text-[11px] text-muted-foreground">La fila marcada "este pago" queda pagada y vinculada a este registro; el resto queda pendiente en Cobros y cuotas.</span>
          </div>
        </div>
      )}
      {msg && <p className={cn("text-xs", msg.ok ? "text-emerald-300" : "text-red-300")}>{msg.texto}</p>}
    </div>
  )
}
