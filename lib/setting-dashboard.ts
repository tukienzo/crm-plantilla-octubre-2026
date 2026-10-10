// Dashboard HTML del reporte diario de setting.
//
// El generador de resúmenes extrae los datos del día en JSON y esto los dibuja como el mismo
// dashboard que el setter entregaba a mano (un HTML por día):
// hero, KPIs, lead por lead, los tres embudos y el contenido consumido. Se arma acá y no se le pide
// a Claude para que el documento salga siempre igual y no invente maquetado ni números.

export type LeadDia = {
  lead: string
  usuario?: string
  nombre?: string
  origen: string | null
  calificado: boolean
  ciclo: string | null
  gatillo: string | null
  feed: string[] | string | null
  fups: number | null
  situacion?: string | null
  dolor: string | null
  objetivo: string | null
  sintesis_closer: string | null
  caso_exito?: string | null
  material_enviado?: string | null
  historial?: string | null
  agenda_nombre?: string | null
}

export type ContenidoConsumido = { pieza: string; tipo?: string | null; leads?: string[] }

export type DiaSetting = {
  fecha: string
  setter: string
  calendarios_enviados: number | null
  agendas: number | null
  agendas_calificadas: number | null
  calificados_dia: number | null
  fups: number | null
  nuevos_seguidores: number | null
  ns_contestan: number | null
  ns_califican: number | null
  ns_bookeados: number | null
  historia: string | null
  historia_comentaron: number | null
  historia_calificaron: number | null
  historia_bookeados: number | null
  outbound_enviados: number | null
  outbound_respuestas: number | null
  outbound_agendas: number | null
  leads: LeadDia[]
  contenido_consumido?: ContenidoConsumido[]
  notas_embudo?: { nuevos_seguidores?: string | null; historia?: string | null; outbound?: string | null }
  avisos?: string[]
  observaciones?: string[]
  alcance?: string | null
  resumen_whatsapp?: string
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const hay = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v)
const num = (v: number | null | undefined) => (hay(v) ? v.toLocaleString("es-AR") : "—")

// Porcentaje con coma decimal, como en los dashboards del setter.
export function porcentaje(parte: number | null | undefined, total: number | null | undefined) {
  if (!hay(parte) || !hay(total) || total === 0) return null
  return `${(Math.round((parte / total) * 1000) / 10).toString().replace(".", ",")}%`
}

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

const lista = (v: string[] | string | null | undefined): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean)
  const t = String(v ?? "").trim()
  if (!t || t === "null" || t === "—") return []
  return t.split(/\s*[;·|]\s*|\s*\n\s*/).map((x) => x.trim()).filter(Boolean)
}

function tile(label: string, valor: string, sub: string | null, tono = "") {
  return `<div class="kpi-tile${tono ? ` ${tono}` : ""}">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${esc(valor)}</div>
      ${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ""}
    </div>`
}

function paso(valor: number | null, etiqueta: string, pie: string | null) {
  return `<div class="funnel-step">
        <div class="fv">${esc(num(valor))}</div>
        <div class="fl">${esc(etiqueta)}</div>
        ${pie ? `<div class="fp">${esc(pie)}</div>` : ""}
      </div>`
}

// Un embudo solo se dibuja si tiene algún número: un reporte sin outbound no muestra la sección vacía.
function embudo(titulo: string, pasos: Array<[number | null, string, string | null]>, nota: string | null | undefined) {
  if (!pasos.some(([v]) => hay(v))) return ""
  return `<h3 class="section-title">${esc(titulo)}</h3>
    <div class="funnel">${pasos.map(([v, l, p]) => paso(v, l, p)).join("")}</div>
    ${nota ? `<p class="note">${esc(nota)}</p>` : ""}`
}

function filaLead(l: LeadDia) {
  const feed = lista(l.feed)
  return `<tr>
      <td class="lead-name">${esc(l.lead)}${l.agenda_nombre ? `<span style="display:block;font-weight:normal;font-size:.68rem;color:var(--sage)">↳ ${esc(l.agenda_nombre)}</span>` : ""}</td>
      <td>${esc(l.origen || "—")}</td>
      <td>${l.calificado ? '<span class="pill si">Sí</span>' : '<span class="pill">No</span>'}</td>
      <td>${esc(l.ciclo || "—")}</td>
      <td>${esc(l.gatillo || "—")}</td>
      <td>${feed.length ? feed.map((f) => esc(f)).join("<br>") : "—"}</td>
      <td style="text-align:right">${esc(num(l.fups))}</td>
      <td>${esc(l.dolor || "—")}</td>
      <td>${esc(l.objetivo || "—")}</td>
    </tr>`
}

// Ficha ampliada de cada lead: lo que el closer necesita leer antes de entrar a la llamada y que no
// entra en la tabla.
function fichaLead(l: LeadDia) {
  const campos: Array<[string, string | null | undefined]> = [
    ["Situación actual", l.situacion],
    ["Freno o dolor", l.dolor],
    ["Objetivo", l.objetivo],
    ["Caso de éxito enviado", l.caso_exito],
    ["Material enviado", l.material_enviado],
    ["Historial", l.historial],
  ]
  const filas = campos.filter(([, v]) => v && String(v).trim() && String(v) !== "null")
  if (!filas.length && !l.sintesis_closer) return ""
  return `<div class="ficha">
      <div class="ficha-head">${esc(l.lead)}${l.origen ? ` <span class="ficha-origen">${esc(l.origen)}</span>` : ""}</div>
      ${filas.map(([k, v]) => `<div class="ficha-row"><span>${esc(k)}</span>${esc(v)}</div>`).join("")}
      ${l.sintesis_closer ? `<div class="ficha-closer"><b>Para el closer:</b> ${esc(l.sintesis_closer)}</div>` : ""}
    </div>`
}

export function dashboardSettingHtml(dia: DiaSetting): string {
  const fecha = fechaLarga(dia.fecha)
  const leads = dia.leads || []
  const califAgendas = hay(dia.agendas_calificadas) ? dia.agendas_calificadas : leads.filter((l) => l.calificado).length || null
  const tasaAgenda = porcentaje(dia.agendas, dia.calendarios_enviados)
  const tasaCalif = porcentaje(califAgendas, dia.agendas)

  const kpis = [
    tile("Calendarios enviados", num(dia.calendarios_enviados), null),
    tile("Agendas", num(dia.agendas), leads.length ? `${leads.length} reportadas lead por lead` : null, "sage"),
    tile("Calendario → Agenda", tasaAgenda || "—", hay(dia.agendas) && hay(dia.calendarios_enviados) ? `${dia.agendas} de ${dia.calendarios_enviados} calendarios enviados` : null, "teal"),
    tile("Calificación", tasaCalif || "—", hay(califAgendas) && hay(dia.agendas) ? `${califAgendas} de ${dia.agendas} agendas — negocio+dolor identificados` : "según el reporte del setter", "rust"),
    tile("Calificados (total del día)", num(dia.calificados_dia), "incluye los que no agendaron", "muted"),
    tile("Seguimientos (fups)", num(dia.fups), null, "muted"),
  ].join("")

  const avisos = (dia.avisos || []).filter(Boolean)
  const observaciones = (dia.observaciones || []).filter(Boolean)
  const contenido = (dia.contenido_consumido || []).filter((c) => c && c.pieza)
  const fichas = leads.map(fichaLead).filter(Boolean).join("")

  const tabla = leads.length
    ? `<h3 class="section-title">Lead por lead (${leads.length})</h3>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>Lead</th><th>Origen</th><th>Calif</th><th>Ciclo</th><th>Gatillo</th><th>Feed consumido</th><th style="text-align:right">Fups</th><th>Pain</th><th>Objetivo</th></tr></thead>
      <tbody>${leads.map(filaLead).join("")}</tbody>
    </table></div>`
    : `<p class="note">El reporte no trae leads cargados uno por uno.</p>`

  const titularHistoria = dia.historia ? `Historia del día (${dia.historia})` : "Historia del día"

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Setting del ${esc(fecha)} · ${esc(dia.setter)}</title>
<style>
  :root{
    --ink:#14110c; --ink2:#1d1812; --line:#3a3024;
    --paper:#f3ece0; --paper2:#cdbfa9; --muted:#9a8b73;
    --gold:#d8a64a; --gold2:#f0c97a; --rust:#c5663d;
    --sage:#7e9670; --crim:#cc5b50; --teal:#5b9aa0;
  }
  *{box-sizing:border-box;}
  body{background:var(--ink); color:var(--paper); margin:0; padding:0 0 80px; font-family:'Courier New',ui-monospace,monospace;}
  header.hero{padding:56px 40px 36px; border-bottom:1px solid var(--line); background:linear-gradient(180deg,var(--ink2),var(--ink));}
  header.hero h1{font-family:Georgia,serif; font-size:2.4rem; margin:0 0 12px; color:var(--gold2); letter-spacing:.5px;}
  header.hero p{max-width:760px; color:var(--paper2); font-family:Verdana,sans-serif; font-size:.92rem; line-height:1.6; margin:0;}
  main{max-width:1180px; margin:0 auto; padding:0 40px;}
  .day-section{margin-top:48px; border:1px solid var(--line); border-radius:6px; overflow:hidden;}
  .day-header{padding:20px 28px; background:var(--ink2); border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;}
  .day-header h2{font-family:Georgia,serif; color:var(--gold2); margin:0; font-size:1.35rem;}
  .accent-tag{font-size:.7rem; letter-spacing:1px; color:var(--ink); background:var(--gold); padding:4px 10px; border-radius:20px; text-transform:uppercase; font-weight:bold;}
  .day-body{padding:28px;}
  .kpi-row{display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:16px; margin-bottom:16px;}
  .kpi-tile{background:var(--ink2); border:1px solid var(--line); border-radius:6px; padding:16px 18px; border-top:3px solid var(--gold);}
  .kpi-tile.rust{border-top-color:var(--rust);} .kpi-tile.sage{border-top-color:var(--sage);}
  .kpi-tile.teal{border-top-color:var(--teal);} .kpi-tile.muted{border-top-color:var(--muted);}
  .kpi-label{font-size:.68rem; text-transform:uppercase; letter-spacing:1px; color:var(--muted); margin-bottom:6px;}
  .kpi-value{font-size:1.8rem; color:var(--paper); font-weight:bold;}
  .kpi-sub{font-size:.72rem; color:var(--paper2); margin-top:4px; font-family:Verdana,sans-serif; line-height:1.4;}
  h3.section-title{font-family:Georgia,serif; color:var(--gold2); border-bottom:1px solid var(--line); padding-bottom:8px; margin:36px 0 16px; text-transform:uppercase; letter-spacing:1px; font-size:.85rem;}
  table{width:100%; border-collapse:collapse; font-size:.78rem;}
  th{text-align:left; text-transform:uppercase; font-size:.65rem; letter-spacing:.5px; color:var(--muted); padding:8px; border-bottom:1px solid var(--line); white-space:nowrap;}
  td{padding:10px 8px; border-bottom:1px solid var(--line); vertical-align:top; color:var(--paper2); font-family:Verdana,sans-serif; font-size:.76rem; line-height:1.4;}
  td.lead-name{color:var(--paper); font-weight:bold; font-family:monospace; white-space:nowrap;}
  .pill{display:inline-block; padding:2px 9px; border-radius:20px; font-size:.68rem; font-weight:bold; text-transform:uppercase; letter-spacing:.3px; background:rgba(154,139,115,.18); color:var(--muted); border:1px solid var(--muted);}
  .pill.si{background:rgba(126,150,112,.2); color:var(--sage); border:1px solid var(--sage);}
  .warning{border:1px solid var(--crim); background:rgba(204,91,80,.08); border-radius:6px; padding:14px 18px; margin:14px 0; color:#e8a49c; font-family:Verdana,sans-serif; font-size:.8rem;}
  .warning b{color:var(--crim);}
  .note{font-family:Verdana,sans-serif; font-size:.78rem; color:var(--paper2); font-style:italic; margin-top:10px;}
  .funnel{display:flex; gap:8px; flex-wrap:wrap; align-items:stretch; margin-top:12px;}
  .funnel-step{flex:1; min-width:130px; background:var(--ink2); border:1px solid var(--line); border-radius:6px; padding:14px 16px; text-align:center;}
  .funnel-step .fv{font-size:1.5rem; color:var(--gold2); font-weight:bold;}
  .funnel-step .fl{font-size:.65rem; text-transform:uppercase; letter-spacing:.5px; color:var(--muted); margin-top:4px;}
  .funnel-step .fp{font-size:.7rem; color:var(--paper2); margin-top:2px; font-family:Verdana,sans-serif;}
  .chart-box{background:var(--ink2); border:1px solid var(--line); border-radius:6px; padding:20px; margin-top:12px;}
  .chart-box ul{margin:0; padding-left:18px; font-family:Verdana,sans-serif; font-size:.78rem; color:var(--paper2); line-height:1.7;}
  .accum-note{font-family:Verdana,sans-serif; font-size:.8rem; color:var(--paper2); line-height:1.6; margin:18px 0 0; border-left:2px solid var(--gold); padding-left:14px;}
  .ficha{background:var(--ink2); border:1px solid var(--line); border-radius:6px; padding:16px 18px; margin-bottom:12px;}
  .ficha-head{font-family:monospace; color:var(--paper); font-weight:bold; font-size:.9rem; margin-bottom:10px;}
  .ficha-origen{font-family:Verdana,sans-serif; font-weight:normal; font-size:.7rem; color:var(--muted);}
  .ficha-row{display:grid; grid-template-columns:160px 1fr; gap:10px; font-family:Verdana,sans-serif; font-size:.76rem; color:var(--paper2); line-height:1.5; margin-bottom:6px;}
  .ficha-row span{color:var(--muted); text-transform:uppercase; font-size:.62rem; letter-spacing:.5px; padding-top:2px;}
  @media(max-width:620px){ .ficha-row{grid-template-columns:1fr; gap:2px;} }
  .ficha-closer{font-family:Verdana,sans-serif; font-size:.78rem; color:var(--paper); line-height:1.55; margin-top:10px; border-left:2px solid var(--teal); padding-left:12px;}
  .ficha-closer b{color:var(--teal);}
  footer{max-width:1180px; margin:56px auto 0; padding:20px 40px; border-top:1px solid var(--line); color:var(--muted); font-size:.72rem; font-family:Verdana,sans-serif; line-height:1.6;}
  @media(max-width:720px){ header.hero{padding:36px 20px 24px;} main{padding:0 16px;} .day-body{padding:18px;} footer{padding:20px 16px;} }
</style>
</head>
<body>
<header class="hero">
  <h1>Setting del ${esc(fecha)}</h1>
  <p>Data solo de setting, de este día. Incluye calendarios, agendas, calificación, lead por lead, los embudos de nuevos seguidores, historia y outbound, y el contenido consumido. No incluye show-up, tasa de cierre ni métricas de la llamada de venta. Setter: <b>${esc(dia.setter)}</b>.</p>
</header>
<main>
  <section class="day-section">
    <div class="day-header"><h2>${esc(fecha)}</h2><span class="accent-tag">Reporte del día</span></div>
    <div class="day-body">
      <div class="kpi-row">${kpis}</div>
      ${avisos.map((a) => `<div class="warning"><b>Ojo —</b> ${esc(a)}</div>`).join("")}
      ${tabla}
      ${fichas ? `<h3 class="section-title">Ficha de cada lead</h3>${fichas}` : ""}
      ${embudo("Nuevos seguidores del día", [
        [dia.nuevos_seguidores, "Nuevos seguidores", null],
        [dia.ns_contestan, "Contestan apertura", porcentaje(dia.ns_contestan, dia.nuevos_seguidores)],
        [dia.ns_califican, "Califican", porcentaje(dia.ns_califican, dia.ns_contestan) ? `${porcentaje(dia.ns_califican, dia.ns_contestan)} de los que contestan` : null],
        [dia.ns_bookeados, "Bookeados", null],
      ], dia.notas_embudo?.nuevos_seguidores)}
      ${embudo(titularHistoria, [
        [dia.historia_comentaron, "Comentaron", null],
        [dia.historia_calificaron, "Calificaron", porcentaje(dia.historia_calificaron, dia.historia_comentaron) ? `${porcentaje(dia.historia_calificaron, dia.historia_comentaron)} de los que comentaron` : null],
        [dia.historia_bookeados, "Bookeados", porcentaje(dia.historia_bookeados, dia.historia_calificaron) ? `${porcentaje(dia.historia_bookeados, dia.historia_calificaron)} calificado → agenda` : null],
      ], dia.notas_embudo?.historia)}
      ${embudo("Outbound del día", [
        [dia.outbound_enviados, "Enviados", null],
        [dia.outbound_respuestas, "Respuestas", porcentaje(dia.outbound_respuestas, dia.outbound_enviados)],
        [dia.outbound_agendas, "Agendas", null],
      ], dia.notas_embudo?.outbound)}
      ${contenido.length ? `<h3 class="section-title">Contenido consumido del día</h3>
      <div class="chart-box"><ul>${contenido.map((c) => `<li><b>${esc(c.pieza)}</b>${c.tipo ? ` · ${esc(c.tipo)}` : ""}${c.leads && c.leads.length ? ` — ${esc(c.leads.join(", "))}` : ""}</li>`).join("")}</ul></div>
      <p class="note">Solo feed. El material enviado por DM (looms, guías, casos de éxito) es seguimiento del setter y no entra en los ángulos de feed.</p>` : ""}
      ${observaciones.length ? `<div class="accum-note">${observaciones.map((o) => esc(o)).join("<br>")}</div>` : ""}
    </div>
  </section>
</main>
<footer>${esc(dia.alcance || `Alcance: ${fecha}, cuenta de Instagram. Reporte de solo setting — no incluye cierre, show-up ni métricas de la llamada de venta. Dashboard de día único.`)}</footer>
</body>
</html>`
}

// Nombre de archivo para descargar el reporte.
export const nombreArchivoDashboard = (dia: Pick<DiaSetting, "fecha" | "setter">) =>
  `setting-${dia.fecha}-${String(dia.setter || "setter").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.html`
