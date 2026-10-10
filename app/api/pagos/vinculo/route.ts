import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { normInstagram, normPhone } from "@/lib/integration-auth"

export const dynamic = "force-dynamic"

// Vínculo de un pago con su persona (por ManyChat ID) y con sus planes de pago.
//   GET  ?id=<pago>                                   → persona, ManyChat ID, planes del cliente y qué cuota es este pago
//   POST { id, manychat_id }                          → vincula el pago (y sus planes) a la persona de ese contacto de ManyChat
//   POST { id, accion: "vincular_cuota", itemId }     → este pago es esa cuota del plan
//   POST { id, accion: "desvincular_cuota", itemId }  → suelta la cuota
//   POST { id, accion: "nuevo_plan", plan, items }    → crea un plan para el cliente del pago; la fila marcada `es_este_pago` queda vinculada

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()

async function manychatInfo(id: string) {
  const key = process.env.MANYCHAT_API_KEY
  if (!key) return null
  try {
    const r = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" })
    if (!r.ok) return null
    const j = await r.json()
    return j?.status === "success" ? j.data : null
  } catch { return null }
}

async function estado(sb: ReturnType<typeof createSupabaseAdmin>, pagoId: string) {
  const { data: pago, error } = await sb.from("pagos").select("id,cliente,telefono,person_id,tipo,monto,fecha,operacion,closer,setter,calificacion,fuente,fecha_alta").eq("id", pagoId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!pago) return NextResponse.json({ error: "El pago no existe" }, { status: 404 })
  let persona: Record<string, unknown> | null = null
  let manychat: { id: string; nombre?: string | null; ig?: string | null } | null = null
  if (pago.person_id) {
    const { data: p } = await sb.from("crm_people").select("id,display_name,primary_phone,primary_instagram").eq("id", pago.person_id).maybeSingle()
    persona = p || null
    const { data: ident } = await sb.from("crm_identities").select("value").eq("person_id", pago.person_id).eq("kind", "manychat").order("last_seen_at", { ascending: false }).limit(1).maybeSingle()
    if (ident?.value) {
      manychat = { id: ident.value }
      const { data: snap } = await sb.from("crm_integration_assets").select("name,metadata").eq("source", "manychat").eq("asset_type", "subscriber").eq("source_id", ident.value).maybeSingle()
      const m = (snap?.metadata || {}) as Record<string, unknown>
      manychat.nombre = (m.name as string) || snap?.name || null
      manychat.ig = (m.ig_username as string) || null
    }
  }
  // planes del cliente: por persona, por nombre o por teléfono (los planes viejos no tienen person_id)
  // (la base no normaliza tildes: se traen candidatos por nombre de pila y se compara el nombre completo normalizado acá)
  const filtros: string[] = []
  if (pago.person_id) filtros.push(`person_id.eq.${pago.person_id}`)
  const nombre = norm(pago.cliente)
  const pila = nombre.split(" ")[0] || ""
  if (pila.length >= 3) filtros.push(`cliente.ilike.*${pila.replace(/[,()*]/g, "")}*`)
  const tel = normPhone(pago.telefono)
  if (tel && tel.length >= 8) filtros.push(`telefono.ilike.*${tel.slice(-8)}*`)
  let planes: Array<Record<string, unknown>> = []
  if (filtros.length) {
    const { data } = await sb.from("planes_pago").select("id,cliente,telefono,operacion,closer,categoria_venta,fecha_alta,fecha_baja,person_id,created_at,plan_pago_items(id,orden,concepto,numero_cuota,monto,fecha_planeada,estado,pago_id,da_acceso,medio_de_pago)").or(filtros.join(",")).order("created_at", { ascending: false }).limit(40)
    const mismoTel = (t: unknown) => { const n = normPhone(t); return Boolean(tel && n && n.length >= 8 && n.slice(-8) === tel.slice(-8)) }
    planes = (data || [])
      .filter((p) => (pago.person_id && p.person_id === pago.person_id) || (nombre && norm(p.cliente) === nombre) || mismoTel(p.telefono) || ((p.plan_pago_items as Array<Record<string, unknown>>) || []).some((i) => String(i.pago_id || "") === pagoId))
      .map((p) => ({ ...p, plan_pago_items: [...((p.plan_pago_items as Array<Record<string, unknown>>) || [])].sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0)) }))
  }
  const cuotaDeEstePago = planes.flatMap((p) => ((p.plan_pago_items as Array<Record<string, unknown>>) || []).map((i) => ({ ...i, plan_id: p.id }) as Record<string, unknown>)).find((i) => String(i.pago_id || "") === pagoId) || null
  return NextResponse.json({ pago, persona, manychat, planes, cuotaDeEstePago })
}

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") || ""
    if (!id) return NextResponse.json({ error: "Falta el id del pago" }, { status: 400 })
    return await estado(createSupabaseAdmin(), id)
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

export async function POST(request: Request) {
  try {
    const sb = createSupabaseAdmin()
    const body = await request.json().catch(() => ({}))
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Falta el id del pago" }, { status: 400 })
    const { data: pago, error: ePago } = await sb.from("pagos").select("id,cliente,telefono,person_id").eq("id", id).maybeSingle()
    if (ePago) throw new Error(ePago.message)
    if (!pago) return NextResponse.json({ error: "El pago no existe" }, { status: 404 })
    const accion = String(body.accion || (body.manychat_id !== undefined ? "manychat" : ""))

    if (accion === "manychat") {
      const mcId = String(body.manychat_id || "").replace(/\D/g, "")
      if (!mcId) return NextResponse.json({ error: "Pegá el ID numérico del contacto de ManyChat" }, { status: 400 })
      const ahora = new Date().toISOString()
      const info = await manychatInfo(mcId)
      // 1) ¿ya hay una persona con ese ManyChat ID?
      const { data: ident } = await sb.from("crm_identities").select("person_id").eq("kind", "manychat").eq("value", mcId).maybeSingle()
      let personId: string | null = ident?.person_id || null
      if (!personId) {
        // 2) la persona del pago, o una que tenga el mismo teléfono, o una nueva
        personId = pago.person_id || null
        const tel = normPhone(pago.telefono)
        if (!personId && tel) {
          const { data: porTel } = await sb.from("crm_identities").select("person_id").eq("kind", "phone").eq("value", tel).maybeSingle()
          personId = porTel?.person_id || null
        }
        if (!personId) {
          const { data: nueva, error: eNueva } = await sb.from("crm_people").insert({ display_name: pago.cliente || info?.name || `ManyChat ${mcId}`, name_normalized: norm(pago.cliente || info?.name), primary_phone: tel || null, primary_instagram: normInstagram(info?.ig_username) || null, status: "active", first_seen_at: ahora, last_seen_at: ahora }).select("id").single()
          if (eNueva) throw new Error(eNueva.message)
          personId = nueva.id
          if (tel) await sb.from("crm_identities").upsert({ person_id: personId, kind: "phone", value: tel, source: "crm", last_seen_at: ahora }, { onConflict: "kind,value" })
        }
        const { error: eIdent } = await sb.from("crm_identities").upsert({ person_id: personId, kind: "manychat", value: mcId, source: "crm", verified: true, last_seen_at: ahora }, { onConflict: "kind,value" })
        if (eIdent) throw new Error(eIdent.message)
      } else if (pago.person_id && pago.person_id !== personId) {
        // el pago apuntaba a otra persona: se queda con la del ManyChat ID (es la que pidió el usuario)
      }
      const ig = normInstagram(info?.ig_username)
      if (ig) await sb.from("crm_identities").upsert({ person_id: personId, kind: "instagram", value: ig, source: "manychat", last_seen_at: ahora }, { onConflict: "kind,value" })
      if (info) await sb.from("crm_integration_assets").upsert({ source: "manychat", asset_type: "subscriber", source_id: mcId, name: ig || info.name || mcId, metadata: { ...info, tags: (info.tags || []).map((t: { name?: string } | string) => (typeof t === "string" ? t : t.name)) }, last_seen_at: ahora }, { onConflict: "source,asset_type,source_id" })
      const { error: eUp } = await sb.from("pagos").update({ person_id: personId }).eq("id", id)
      if (eUp) throw new Error(eUp.message)
      // los planes de este cliente que no tenían persona, ahora sí
      if (pago.cliente) await sb.from("planes_pago").update({ person_id: personId }).is("person_id", null).ilike("cliente", String(pago.cliente).trim())
      // las agendas con el mismo contacto de ManyChat también, si estaban sueltas
      await sb.from("agendas").update({ person_id: personId }).is("person_id", null).eq("manychat", mcId)
      return await estado(sb, id)
    }

    if (accion === "vincular_cuota" || accion === "desvincular_cuota") {
      const itemId = String(body.itemId || "")
      if (!itemId) return NextResponse.json({ error: "Falta la cuota" }, { status: 400 })
      const { data: item } = await sb.from("plan_pago_items").select("id,plan_id,pago_id").eq("id", itemId).maybeSingle()
      if (!item) return NextResponse.json({ error: "La cuota ya no existe" }, { status: 404 })
      if (accion === "vincular_cuota") {
        if (item.pago_id && item.pago_id !== id) return NextResponse.json({ error: "Esa cuota ya está vinculada a otro pago" }, { status: 409 })
        await sb.from("plan_pago_items").update({ pago_id: null, estado: "pendiente" }).eq("pago_id", id).neq("id", itemId)  // un pago es una sola cuota
        const { error } = await sb.from("plan_pago_items").update({ pago_id: id, estado: "pagado" }).eq("id", itemId)
        if (error) throw new Error(error.message)
        if (pago.person_id) await sb.from("planes_pago").update({ person_id: pago.person_id }).eq("id", item.plan_id).is("person_id", null)
      } else {
        const { error } = await sb.from("plan_pago_items").update({ pago_id: null, estado: "pendiente" }).eq("id", itemId).eq("pago_id", id)
        if (error) throw new Error(error.message)
      }
      return await estado(sb, id)
    }

    if (accion === "nuevo_plan") {
      const plan = (body.plan || {}) as Record<string, unknown>
      const items = (Array.isArray(body.items) ? body.items : []) as Array<Record<string, unknown>>
      if (!items.length) return NextResponse.json({ error: "El plan necesita al menos una cuota" }, { status: 400 })
      for (const it of items) if (!it.concepto || it.monto == null || !it.fecha_planeada) return NextResponse.json({ error: "Cada cuota necesita concepto, monto y fecha" }, { status: 400 })
      const categoria = plan.categoria_venta === "Back End" ? "Back End" : "Front End"
      const { data: nuevo, error: ePlan } = await sb.from("planes_pago").insert({
        cliente: pago.cliente, telefono: pago.telefono || null, person_id: pago.person_id || null, operacion: plan.operacion || null, closer: plan.closer || null, setter: plan.setter || null,
        calificacion: plan.calificacion || null, fuente: plan.fuente || null, categoria_venta: categoria, fecha_alta: plan.fecha_alta || null, fecha_baja: plan.fecha_baja || null,
      }).select("id").single()
      if (ePlan) throw new Error(ePlan.message)
      const filas = items.map((it, i) => ({
        plan_id: nuevo.id, orden: i + 1, concepto: String(it.concepto), numero_cuota: it.numero_cuota != null && it.numero_cuota !== "" ? Number(it.numero_cuota) : null,
        monto: Number(it.monto), fecha_planeada: String(it.fecha_planeada).slice(0, 10), medio_de_pago: (it.medio_de_pago as string) || null, da_acceso: Boolean(it.da_acceso),
        estado: it.es_este_pago ? "pagado" : "pendiente", pago_id: it.es_este_pago ? id : null,
      }))
      const { error: eItems } = await sb.from("plan_pago_items").insert(filas)
      if (eItems) { await sb.from("planes_pago").delete().eq("id", nuevo.id); throw new Error(eItems.message) }
      if (filas.some((f) => f.pago_id)) await sb.from("plan_pago_items").update({ pago_id: null, estado: "pendiente" }).eq("pago_id", id).neq("plan_id", nuevo.id)
      return await estado(sb, id)
    }
    return NextResponse.json({ error: "Acción desconocida" }, { status: 400 })
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
