import type { MacroArquetipo } from "./arquetipos-closing"
import { META_CASH_MENSUAL } from "./brand"

export type FathomResumenLead = {
  situacion_actual?: string
  calificacion?: string
  situacion_deseada?: string
  dolor_problema?: string
  objecion?: string
  porque_no_cerro?: string
  motivo_cierre?: string
  resumen_llamada?: string
  link_fathom?: string | null
}

export type FathomDiagnostico = {
  mencion_marca?: string
  contenido_recuerda?: string
  dolor_principal?: string
  deseo_principal?: string
  urgencia?: string
  porque_agendo?: string
  oferta_interes?: string
  objecion_real?: string
  motivo_cierre_no_cierre?: string
  mensaje_resono?: string
  insight_mensaje?: string
  siguiente_paso?: string
}

export type CallDetalle = {
  agenda_id?: number | string
  nombre: string
  fecha?: string
  hora?: string
  closer: string
  arquetipo_macro: MacroArquetipo
  subarquetipo: string | null
  lead_score: string // "LEAD S", "LEAD A", ..., "SIN SCORING"
  es_calificado: boolean
  calificaba_realmente?: string | null // "Si", "No", null
  ingresos_declarados?: string
  origen: string
  pieza_entrada?: string
  keyword?: string
  angulo_adquisicion?: string
  porque_agendo?: string
  resultado: "CIERRE" | "FEE" | "NO CIERRE" | "NO SHOW" | "CANCELADA" | "SEGUIMIENTO"
  cash_d1: number
  ticket_total: number
  forma_pago?: string
  objecion_principal?: string
  motivo_real?: string
  siguiente_paso?: string
  fathom?: FathomDiagnostico
  fathom_lead?: FathomResumenLead
  link_fathom?: string | null
  ia_analisis?: string | null
  resumen_chat?: string | null
  calificacion?: string | null
  fathom_summary?: string | null
  transcript?: string | null
  trace_analysis?: any | null
}

export type MetricasClosing = {
  programadas: number
  presentadas: number
  no_shows: number
  canceladas: number
  calificadas_programadas: number
  calificadas_presentadas: number
  no_shows_calificados: number
  calificados_no_cerrados: number
  cierres: number
  cierres_calificados: number
  no_cierres: number
  fees: number
  cash_d1: number
  cash_fees: number
  ticket_total: number
  show_rate_pct: number
  show_rate_calificados_pct: number
  tc_presentadas_pct: number
  tc_calificadas_pct: number
}

export type ArquetiposMetricas = {
  dueno_negocio: { total: number; calificadas: number; cierres: number; cash_d1: number }
  empleado: { total: number; calificadas: number; cierres: number; cash_d1: number }
  estudiante: { total: number; calificadas: number; cierres: number; cash_d1: number }
  sin_clasificar: { total: number; calificadas: number; cierres: number; cash_d1: number }
}

export type ResumenPayload = {
  periodo: "dia" | "semana" | "mes"
  fecha_desde: string
  fecha_hasta: string
  closer: string
  modo: "detallado" | "corto"
  metricas: MetricasClosing
  arquetipos: ArquetiposMetricas
  calls: CallDetalle[]
  patrones?: {
    motivos_no_cierre?: Record<string, number>
    angulos_calificados?: Record<string, number>
  }
}

function fmtFecha(iso?: string) {
  if (!iso) return ""
  const partes = iso.slice(0, 10).split("-")
  if (partes.length !== 3) return iso
  return `${partes[2]}/${partes[1]}/${partes[0]}`
}

export function generarTextoWhatsApp(data: ResumenPayload): string {
  const { periodo, fecha_desde, fecha_hasta, closer, metricas: m, arquetipos: arq, calls } = data
  const lines: string[] = []
  const closerStr = closer === "todos" ? "Equipo Completo" : closer.toUpperCase()

  // ==========================================
  // MODO DÍA
  // ==========================================
  if (periodo === "dia") {
    lines.push("📞 RESUMEN DIARIO DE CLOSING")
    lines.push(`Fecha: ${fmtFecha(fecha_desde)}`)
    lines.push(`Closer: ${closerStr}`)
    lines.push("")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push("📊 MÉTRICAS DEL DÍA")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push(`• Calls programadas: ${m.programadas}`)
    lines.push(`• Presentadas: ${m.presentadas} (Show rate: ${m.show_rate_pct.toFixed(1).replace(".", ",")} %)`)
    lines.push(`• Calificadas programadas: ${m.calificadas_programadas}`)
    lines.push(`• Calificadas presentadas: ${m.calificadas_presentadas} (Show rate calif: ${m.show_rate_calificados_pct.toFixed(1).replace(".", ",")} %)`)
    lines.push(`• No Shows: ${m.no_shows} (Calificados NS: ${m.no_shows_calificados})`)
    lines.push(`• Canceladas: ${m.canceladas}`)
    lines.push(`• Cierres: ${m.cierres} (Cierres calificados: ${m.cierres_calificados})`)
    lines.push(`• No cierres: ${m.no_cierres} (Calificados no cerrados: ${m.calificados_no_cerrados})`)
    lines.push(`• Fees: ${m.fees}`)
    lines.push(`• Cash D1: $${m.cash_d1.toLocaleString("es-AR")} USD`)
    lines.push(`• Cash Fees: $${m.cash_fees.toLocaleString("es-AR")} USD`)
    lines.push(`• Ticket total contratado: $${m.ticket_total.toLocaleString("es-AR")} USD`)
    lines.push(`• Tasa Cierre s/Presentadas: ${m.tc_presentadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push(`• Tasa Cierre s/Calificadas: ${m.tc_calificadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push("")

    const presentadasCalls = calls.filter((c) => c.resultado !== "NO SHOW" && c.resultado !== "CANCELADA")
    const noShows = calls.filter((c) => c.resultado === "NO SHOW" || c.resultado === "CANCELADA")

    // En el reporte diario: sólo leads calificados presentados del día.
    // Si no hay ninguno calificado, se colocan hasta 3 aleatorios del día (que se presentaron).
    const calificadasPresentadas = presentadasCalls.filter((c) => c.es_calificado)
    let llamadasParaDetalle: CallDetalle[] = []

    if (calificadasPresentadas.length > 0) {
      llamadasParaDetalle = calificadasPresentadas
    } else if (presentadasCalls.length <= 3) {
      llamadasParaDetalle = presentadasCalls
    } else {
      llamadasParaDetalle = [...presentadasCalls].sort(() => 0.5 - Math.random()).slice(0, 3)
    }

    if (llamadasParaDetalle.length > 0) {
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      lines.push("📋 DETALLE DE LLAMADAS TOMADAS")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      llamadasParaDetalle.forEach((c, idx) => {
        lines.push(`\nCALL ${idx + 1} — ${c.nombre.toUpperCase()} ${c.hora ? "(" + c.hora + ")" : ""}`)
        lines.push(`Closer: ${c.closer}`)
        
        // Macro y subarquetipo
        if (c.arquetipo_macro === "SIN CLASIFICAR") {
          lines.push(`Macro: SIN CLASIFICAR`)
        } else {
          lines.push(`Macro: ${c.arquetipo_macro}`)
        }
        if (c.subarquetipo) {
          lines.push(`Subarquetipo: ${c.subarquetipo}`)
        }

        // Lead Scoring y Calificación
        const califLabel = c.es_calificado ? "CALIFICADO" : "NO CALIFICADO"
        lines.push(`Lead Scoring: ${c.lead_score} · ${califLabel}`)
        if (c.calificaba_realmente) {
          lines.push(`Calificaba realmente (post-call): ${c.calificaba_realmente}`)
        }

        if (c.ingresos_declarados) {
          lines.push(`Ingresos declarados: ${c.ingresos_declarados}`)
        }

        // Atribución de agenda por separado (sin concatenar todo el historial)
        lines.push(`Origen: ${c.origen || "Instagram"}`)
        if (c.pieza_entrada) {
          lines.push(`Pieza de entrada: ${c.pieza_entrada}`)
        }
        if (c.keyword) {
          lines.push(`Keyword: ${c.keyword}`)
        }
        if (c.angulo_adquisicion) {
          lines.push(`Ángulo de adquisición: ${c.angulo_adquisicion}`)
        }

        if (c.porque_agendo) {
          lines.push(`Agendó porque: ${c.porque_agendo}`)
        }
        lines.push(`Resultado: ${c.resultado}`)
        if (c.resultado === "CIERRE" || c.resultado === "FEE") {
          lines.push(`Cash D1: $${c.cash_d1.toLocaleString("es-AR")} | Ticket: $${c.ticket_total.toLocaleString("es-AR")}`)
          if (c.motivo_real) {
            lines.push(`Qué lo hizo avanzar: ${c.motivo_real}`)
          }
        } else {
          if (c.objecion_principal) {
            lines.push(`Objeción: ${c.objecion_principal}`)
          }
          if (c.motivo_real) {
            lines.push(`Motivo real no cierre: ${c.motivo_real}`)
          }
        }
        if (c.siguiente_paso) {
          lines.push(`Siguiente paso: ${c.siguiente_paso}`)
        }
        if (c.fathom?.mencion_marca || c.fathom?.contenido_recuerda) {
          const det = [c.fathom.mencion_marca, c.fathom.contenido_recuerda].filter(Boolean).join(" — ")
          lines.push(`Mención a la marca: ${det}`)
        }
        if (c.fathom?.insight_mensaje) {
          lines.push("💬 Insight de mensaje:")
          lines.push(`"${c.fathom.insight_mensaje}"`)
        }
      })
      lines.push("")
    }

    if (noShows.length > 0) {
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      lines.push("❌ NO SHOWS / CANCELADAS")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      noShows.forEach((ns) => {
        lines.push(`• ${ns.nombre} ${ns.hora ? "(" + ns.hora + ")" : ""} — ${ns.resultado} | ${ns.lead_score} (${ns.ingresos_declarados || "Sin datos"})`)
      })
      lines.push("")
    }

    // Patrones
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push("🧠 PATRONES DEL DÍA")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push(`• Dueños de negocio: ${arq.dueno_negocio.total} calls | ${arq.dueno_negocio.calificadas} calif | ${arq.dueno_negocio.cierres} cierres`)
    lines.push(`• Empleados: ${arq.empleado.total} calls | ${arq.empleado.calificadas} calif | ${arq.empleado.cierres} cierres`)
    lines.push(`• Estudiantes: ${arq.estudiante.total} calls | ${arq.estudiante.calificadas} calif | ${arq.estudiante.cierres} cierres`)
    if (arq.sin_clasificar.total > 0) {
      lines.push(`• Sin clasificar: ${arq.sin_clasificar.total} calls | ${arq.sin_clasificar.calificadas} calif | ${arq.sin_clasificar.cierres} cierres`)
    }

    if (data.patrones?.motivos_no_cierre && Object.keys(data.patrones.motivos_no_cierre).length > 0) {
      lines.push("")
      lines.push("Motivos de no cierre:")
      Object.entries(data.patrones.motivos_no_cierre).forEach(([motivo, count]) => {
        lines.push(`• ${motivo}: ${count}`)
      })
    }
    if (data.patrones?.angulos_calificados && Object.keys(data.patrones.angulos_calificados).length > 0) {
      lines.push("")
      lines.push("Ángulos entre calificados:")
      Object.entries(data.patrones.angulos_calificados).forEach(([angulo, count]) => {
        lines.push(`• ${angulo}: ${count}`)
      })
    }
  }

  // ==========================================
  // MODO SEMANA
  // ==========================================
  else if (periodo === "semana") {
    lines.push("📊 RESUMEN SEMANAL DE CLOSING")
    lines.push(`Período: ${fmtFecha(fecha_desde)} al ${fmtFecha(fecha_hasta)}`)
    lines.push(`Closer: ${closerStr}`)
    lines.push("")
    lines.push(`📅 Calls programadas: ${m.programadas}`)
    lines.push(`👥 Presentadas: ${m.presentadas} (Show rate: ${m.show_rate_pct.toFixed(1).replace(".", ",")} %) | Calificadas: ${m.calificadas_presentadas}`)
    lines.push(`❌ No Shows: ${m.no_shows} | NS Calificados: ${m.no_shows_calificados}`)
    lines.push(`💰 Cierres: ${m.cierres} | Cierres calificados: ${m.cierres_calificados}`)
    lines.push(`🔻 No cierres: ${m.no_cierres} | Calificados no cerrados: ${m.calificados_no_cerrados}`)
    lines.push("")
    lines.push(`💵 Cash D1: $${m.cash_d1.toLocaleString("es-AR")} USD`)
    lines.push(`🎟️ Fees: $${m.cash_fees.toLocaleString("es-AR")} USD`)
    lines.push(`📈 Ticket total contratado: $${m.ticket_total.toLocaleString("es-AR")} USD`)
    lines.push("")
    lines.push(`🎯 TC s/Presentadas: ${m.tc_presentadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push(`🔥 TC s/Calificadas: ${m.tc_calificadas_pct.toFixed(1).replace(".", ",")} %`)
    lines.push("")
    lines.push("👤 Conversión por Arquetipo (Datos CRM):")
    lines.push(`• Dueño de negocio: ${arq.dueno_negocio.total} calls | ${arq.dueno_negocio.calificadas} calif | ${arq.dueno_negocio.cierres} cierres | $${arq.dueno_negocio.cash_d1} USD D1`)
    lines.push(`• Empleado: ${arq.empleado.total} calls | ${arq.empleado.calificadas} calif | ${arq.empleado.cierres} cierres | $${arq.empleado.cash_d1} USD D1`)
    lines.push(`• Estudiante: ${arq.estudiante.total} calls | ${arq.estudiante.calificadas} calif | ${arq.estudiante.cierres} cierres | $${arq.estudiante.cash_d1} USD D1`)
    if (arq.sin_clasificar.total > 0) {
      lines.push(`• Sin clasificar: ${arq.sin_clasificar.total} calls | ${arq.sin_clasificar.calificadas} calif | ${arq.sin_clasificar.cierres} cierres | $${arq.sin_clasificar.cash_d1} USD D1`)
    }
    lines.push("")

    const cierresYFup = calls.filter((c) => c.resultado === "CIERRE" || c.resultado === "FEE" || (c.es_calificado && c.resultado === "SEGUIMIENTO"))
    if (cierresYFup.length > 0) {
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      lines.push("🌟 CIERRES Y FUPS CALIFICADOS DE LA SEMANA")
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
      cierresYFup.forEach((c) => {
        lines.push(`• ${c.nombre} (${c.resultado}) — ${c.arquetipo_macro} | Cash D1: $${c.cash_d1} | Ticket: $${c.ticket_total}`)
        if (c.motivo_real) lines.push(`  Clave: ${c.motivo_real}`)
        if (c.siguiente_paso) lines.push(`  Siguiente paso: ${c.siguiente_paso}`)
      })
      lines.push("")
    }

    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    lines.push("🧠 PATRONES DE LA SEMANA")
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━")
    if (data.patrones?.motivos_no_cierre) {
      lines.push("Motivos de no cierre más frecuentes:")
      Object.entries(data.patrones.motivos_no_cierre).forEach(([motivo, count]) => {
        lines.push(`• ${motivo}: ${count}`)
      })
    }
  }

  // ==========================================
  // MODO MES
  // ==========================================
  else if (periodo === "mes") {
    lines.push(`📊 BALANCE MENSUAL DE CLOSING — ${fecha_desde.slice(0, 7)}`)
    lines.push(`Closer: ${closerStr}`)
    lines.push("")
    lines.push(`🎯 Meta del mes: ${META_CASH_MENSUAL > 0 ? `$${META_CASH_MENSUAL.toLocaleString("es-AR")} USD` : "sin cargar"}`)
    lines.push(`💵 Cash D1 Nuevas Ventas: $${m.cash_d1.toLocaleString("es-AR")} USD`)
    lines.push(`🎟️ Fees recaudados: $${m.cash_fees.toLocaleString("es-AR")} USD`)
    lines.push(`💰 Total Recaudado MTD: $${(m.cash_d1 + m.cash_fees).toLocaleString("es-AR")} USD`)
    lines.push(`📈 Contratos firmados: $${m.ticket_total.toLocaleString("es-AR")} USD`)
    lines.push("")
    lines.push("📅 Funnel acumulado:")
    lines.push(`• Calls programadas: ${m.programadas}`)
    lines.push(`• Presentadas: ${m.presentadas} (Show rate: ${m.show_rate_pct.toFixed(1).replace(".", ",")} %) | Calificadas: ${m.calificadas_presentadas}`)
    lines.push(`• No shows: ${m.no_shows} (Calificados NS: ${m.no_shows_calificados})`)
    lines.push(`• Cierres totales: ${m.cierres} (TC s/Shows: ${m.tc_presentadas_pct.toFixed(1).replace(".", ",")} %, TC s/Calif: ${m.tc_calificadas_pct.toFixed(1).replace(".", ",")} %)`)
    lines.push("")
    lines.push("👥 Radiografía por Arquetipo (CRM):")
    lines.push(`• Dueño de negocio: ${arq.dueno_negocio.total} calls | ${arq.dueno_negocio.cierres} cierres | $${arq.dueno_negocio.cash_d1} USD D1`)
    lines.push(`• Empleado: ${arq.empleado.total} calls | ${arq.empleado.cierres} cierres | $${arq.empleado.cash_d1} USD D1`)
    lines.push(`• Estudiante: ${arq.estudiante.total} calls | ${arq.estudiante.cierres} cierres | $${arq.estudiante.cash_d1} USD D1`)
    if (arq.sin_clasificar.total > 0) {
      lines.push(`• Sin clasificar: ${arq.sin_clasificar.total} calls | ${arq.sin_clasificar.cierres} cierres | $${arq.sin_clasificar.cash_d1} USD D1`)
    }
  }

  return lines.join("\n")
}
