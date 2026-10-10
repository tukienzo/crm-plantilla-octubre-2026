/* ══════════════════════════════════════════════════════════════════════════
   Panel del negocio — LOS DATOS DE DEMOSTRACIÓN
   ──────────────────────────────────────────────────────────────────────────
   El panel (index.html) carga /api/panel/datos. Si el CRM ya tiene agendas
   o pagos, esa ruta arma los números reales; si está vacío, sirve ESTE
   archivo para que el panel se vea completo desde el primer día.

   Regla de oro: acá solo se escriben NÚMEROS CRUDOS (lo que pasó).
   Los porcentajes, promedios, tasas, deltas y proyecciones NO se escriben:
   los calcula el dashboard solo.

   Todo lo de acá es inventado: nombres, montos y fechas son de ejemplo.
   El nombre, la cuenta y la palabra clave de la marca los pisa el servidor
   con los de tu configuración (NEXT_PUBLIC_BRAND_*).
   ══════════════════════════════════════════════════════════════════════════ */

const DATOS = {

  /* ── 1 · La marca ─────────────────────────────────────────────────────── */
  marca: {
    nombre: "Mi negocio",
    bajada: "Panel del negocio",
    moneda: "$",
    handle: "@minegocio",     // la cuenta de Instagram que firma los carruseles
    keyword: "INFO",          // la palabra clave del CTA
    // Objetivo de cash collected por mes. Es la vara de todos los semáforos (0 = sin meta).
    metaMensual: 40000,
  },

  /* ── 2 · Los meses ────────────────────────────────────────────────────────
     Una fila por mes. El ÚLTIMO de la lista es el mes en curso: se marca
     como parcial con `dias` (cuántos días van) y `diasTotal`.

     facturado  = lo que se vendió (contratos firmados)
     cobrado    = la plata que efectivamente entró (cash collected)
     leads      = conversaciones nuevas
     agendas    = llamadas agendadas
     presentadas= llamadas a las que el lead se presentó
     calificadas= de las presentadas, las que calificaban de verdad
     cierres    = ventas (en llamada o en seguimiento)
     ads        = inversión en publicidad
     alumnos    = alumnos activos a fin de ese mes                           */
  meses: [
    { mes: "2025-10", facturado: 30000, cobrado: 25000, leads: 400, agendas: 60,  presentadas: 40, calificadas: 30, cierres: 8,  ads: 4000, alumnos: 40 },
    { mes: "2025-11", facturado: 35000, cobrado: 30000, leads: 450, agendas: 65,  presentadas: 45, calificadas: 35, cierres: 9,  ads: 4500, alumnos: 45 },
    { mes: "2025-12", facturado: 32000, cobrado: 30000, leads: 400, agendas: 60,  presentadas: 40, calificadas: 30, cierres: 8,  ads: 4000, alumnos: 50 },
    { mes: "2026-01", facturado: 25000, cobrado: 28000, leads: 350, agendas: 50,  presentadas: 30, calificadas: 25, cierres: 6,  ads: 3500, alumnos: 50 },
    { mes: "2026-02", facturado: 40000, cobrado: 32000, leads: 500, agendas: 70,  presentadas: 50, calificadas: 40, cierres: 10, ads: 5000, alumnos: 55 },
    { mes: "2026-03", facturado: 45000, cobrado: 38000, leads: 550, agendas: 80,  presentadas: 55, calificadas: 45, cierres: 11, ads: 5500, alumnos: 60 },
    { mes: "2026-04", facturado: 48000, cobrado: 40000, leads: 600, agendas: 85,  presentadas: 60, calificadas: 48, cierres: 12, ads: 6000, alumnos: 65 },
    { mes: "2026-05", facturado: 60000, cobrado: 50000, leads: 800, agendas: 110, presentadas: 80, calificadas: 64, cierres: 15, ads: 8000, alumnos: 75 },
    { mes: "2026-06", facturado: 52000, cobrado: 48000, leads: 650, agendas: 90,  presentadas: 65, calificadas: 52, cierres: 13, ads: 6500, alumnos: 80 },
    { mes: "2026-07", facturado: 56000, cobrado: 50000, leads: 700, agendas: 100, presentadas: 70, calificadas: 56, cierres: 14, ads: 7000, alumnos: 85 },
    { mes: "2026-08", facturado: 48000, cobrado: 46000, leads: 650, agendas: 90,  presentadas: 60, calificadas: 48, cierres: 12, ads: 7000, alumnos: 85 },
    { mes: "2026-09", facturado: 20000, cobrado: 18000, leads: 250, agendas: 35,  presentadas: 25, calificadas: 20, cierres: 5,  ads: 2500, alumnos: 85,
      dias: 10, diasTotal: 30 },
  ],

  /* ── 3 · El equipo (últimos 90 días) ──────────────────────────────────────
     Los totales de esta lista dan lo mismo que la suma de los últimos 3
     meses de arriba. */
  closers: [
    { nombre: "Ana Pérez",   presentadas: 50, calificadas: 40, cierres: 11, cobrado: 40000 },
    { nombre: "Bruno Gómez", presentadas: 45, calificadas: 36, cierres: 9,  cobrado: 34000 },
    { nombre: "Carla Ruiz",  presentadas: 35, calificadas: 28, cierres: 7,  cobrado: 24000 },
    { nombre: "Diego Sosa",  presentadas: 25, calificadas: 20, cierres: 4,  cobrado: 16000 },
  ],

  /* inbound = conversaciones nuevas · fups = seguimientos
     La tasa del setter es agendas / (inbound + fups) — el seguimiento cuenta. */
  setters: [
    { nombre: "Elena Díaz",   inbound: 500, fups: 400, agendas: 70 },
    { nombre: "Franco Luna",  inbound: 450, fups: 350, agendas: 65 },
    { nombre: "Gabriela Rey", inbound: 400, fups: 300, agendas: 55 },
    { nombre: "Hernán Vega",  inbound: 250, fups: 200, agendas: 35 },
  ],

  /* ── 4 · De dónde salen los leads (últimos 90 días) ───────────────────── */
  fuentes: [
    { nombre: "Instagram orgánico", leads: 600, agendas: 90, cierres: 13 },
    { nombre: "Ads Meta",           leads: 500, agendas: 70, cierres: 9  },
    { nombre: "YouTube",            leads: 250, agendas: 35, cierres: 5  },
    { nombre: "Referidos",          leads: 150, agendas: 20, cierres: 3  },
    { nombre: "WhatsApp / otro",    leads: 100, agendas: 10, cierres: 1  },
  ],

  /* ── 5 · El contenido (últimos 90 días) ───────────────────────────────── */
  contenido: [
    { formato: "Reels",     piezas: 12,  views: 600000, ctas: 9,  leads: 400, agendas: 60 },
    { formato: "Historias", piezas: 180, views: 90000,  ctas: 45, leads: 200, agendas: 30 },
    { formato: "YouTube",   piezas: 6,   views: 40000,  ctas: 6,  leads: 250, agendas: 35 },
  ],

  /* ── 9 · Los reels y lo que trajo cada uno ────────────────────────────────
     views, likes, comentarios y fecha son las métricas de Instagram; leads,
     agendas, ventas y cobrado son la atribución: de dónde salió cada venta.

     De dónde sale la atribución en la vida real: el reel pide una keyword,
     la herramienta de DM la recibe y etiqueta al lead, y esa etiqueta viaja
     hasta el CRM. Sin esa cadena esta tabla no se puede llenar y es mejor
     no inventarla.

     sc = nombre del archivo de la miniatura en miniaturas/ (sin el .jpg).
     Las de acá son placas de ejemplo. NO se referencian las URLs de
     Instagram: caducan a los pocos días y el panel quedaría en blanco. */
  reels: [
    { sc:"reel-01", fecha:"2026-08-05", cta:"GUIA", seg:45, titulo:"Los 3 errores que frenan a tu cliente ideal",
      views:120000, likes:3000, comentarios:400, leads:60, agendas:9, ventas:2, cobrado:8000  },
    { sc:"reel-02", fecha:"2026-08-15", cta:"INFO", seg:60, titulo:"Cómo trabajamos, paso a paso",
      views:40000,  likes:1000, comentarios:200, leads:40, agendas:6, ventas:3, cobrado:12000 },
    { sc:"reel-03", fecha:"2026-08-25", cta:"CASO", seg:30, titulo:"Antes y después de un cliente",
      views:20000,  likes:500,  comentarios:100, leads:20, agendas:3, ventas:1, cobrado:4000  },
    { sc:"reel-04", fecha:"2026-09-05", cta:"",     seg:20, titulo:"Una semana detrás de escena",
      views:80000,  likes:2000, comentarios:50,  leads:5,  agendas:0, ventas:0, cobrado:0     },
  ],

  /* ── 6 · El pipeline — las oportunidades ABIERTAS de hoy ──────────────────
     Es una foto del estado actual, no de un período: por eso no suma con los
     meses ni con las llamadas. Lo que está acá todavía no es plata.

     etapa: "Agendada" · "Presentada" · "Calificada" · "Propuesta" · "Seguimiento"
       El orden de arriba es el del embudo y es el que dibuja las columnas.
     dias: cuántos días lleva parada en esa etapa. Arriba de 7 se marca fría.
     prob: probabilidad de cierre de ESA etapa, 0 a 100. Es lo que pondera el
       valor del pipeline — sin esto, "tengo $100k en pipeline" no dice nada. */
  pipelineEtapas: [
    { nombre: "Agendada",    prob: 10 },
    { nombre: "Presentada",  prob: 25 },
    { nombre: "Calificada",  prob: 40 },
    { nombre: "Propuesta",   prob: 60 },
    { nombre: "Seguimiento", prob: 75 },
  ],

  pipeline: [
    { lead:"Laura M.",  closer:"Ana Pérez",   etapa:"Seguimiento", monto:4000, dias:2,  fuente:"Instagram orgánico", prox:"Manda el primer pago el viernes" },
    { lead:"Pablo R.",  closer:"Bruno Gómez", etapa:"Seguimiento", monto:5000, dias:3,  fuente:"Ads Meta",           prox:"Lo habla con el socio" },
    { lead:"Sofía G.",  closer:"Ana Pérez",   etapa:"Propuesta",   monto:6000, dias:1,  fuente:"Referidos",          prox:"Le mandé el plan de pago en 3" },
    { lead:"Martín L.", closer:"Carla Ruiz",  etapa:"Propuesta",   monto:3000, dias:4,  fuente:"YouTube",            prox:"Espera el cobro de un cliente" },
    { lead:"Julia F.",  closer:"Bruno Gómez", etapa:"Propuesta",   monto:4000, dias:6,  fuente:"YouTube",            prox:"Pidió ver un caso parecido" },
    { lead:"Inés C.",   closer:"Ana Pérez",   etapa:"Propuesta",   monto:7000, dias:11, fuente:"Instagram orgánico", prox:"No contesta hace una semana" },
    { lead:"Óscar P.",  closer:"Diego Sosa",  etapa:"Calificada",  monto:4000, dias:1,  fuente:"Referidos",          prox:"Reagendó para el jueves" },
    { lead:"Clara B.",  closer:"Bruno Gómez", etapa:"Calificada",  monto:5000, dias:2,  fuente:"YouTube",            prox:"Segunda llamada agendada" },
    { lead:"Teresa N.", closer:"Carla Ruiz",  etapa:"Calificada",  monto:3000, dias:5,  fuente:"Ads Meta",           prox:"Quiere arrancar el mes que viene" },
    { lead:"Hugo S.",   closer:"Diego Sosa",  etapa:"Presentada",  monto:3000, dias:1,  fuente:"Instagram orgánico", prox:"Falta ver si califica" },
    { lead:"Lorena V.", closer:"Ana Pérez",   etapa:"Presentada",  monto:4000, dias:8,  fuente:"WhatsApp / otro",    prox:"Sin respuesta al seguimiento" },
    { lead:"Mateo K.",  closer:"Bruno Gómez", etapa:"Agendada",    monto:4000, dias:0,  fuente:"Instagram orgánico", prox:"Llamada mañana 15:00" },
    { lead:"Nora J.",   closer:"Carla Ruiz",  etapa:"Agendada",    monto:4000, dias:0,  fuente:"Ads Meta",           prox:"Llamada mañana 17:30" },
    { lead:"Raúl T.",   closer:"Diego Sosa",  etapa:"Agendada",    monto:3000, dias:6,  fuente:"Ads Meta",           prox:"Todavía no confirmó" },
  ],

  /* ── 7 · Las cuotas por cobrar (estado de HOY, no de un período) ──────────
     estado: "cobrado" · "por-cobrar" · "vencida" · "protocolo"              */
  cuotas: [
    { alumno: "L. García",    monto: 1000, vence: "2026-09-02", closer: "Ana Pérez",   estado: "vencida"    },
    { alumno: "M. Fernández", monto: 2000, vence: "2026-09-04", closer: "Bruno Gómez", estado: "vencida"    },
    { alumno: "R. López",     monto: 3000, vence: "2026-09-07", closer: "Ana Pérez",   estado: "protocolo"  },
    { alumno: "S. Benítez",   monto: 1000, vence: "2026-09-08", closer: "Diego Sosa",  estado: "cobrado"    },
    { alumno: "J. Acosta",    monto: 2500, vence: "2026-09-09", closer: "Bruno Gómez", estado: "cobrado"    },
    { alumno: "C. Torres",    monto: 1000, vence: "2026-09-12", closer: "Ana Pérez",   estado: "por-cobrar" },
    { alumno: "E. Navarro",   monto: 2000, vence: "2026-09-15", closer: "Carla Ruiz",  estado: "por-cobrar" },
    { alumno: "F. Castro",    monto: 3000, vence: "2026-09-18", closer: "Bruno Gómez", estado: "por-cobrar" },
    { alumno: "G. Ortiz",     monto: 1000, vence: "2026-09-22", closer: "Diego Sosa",  estado: "por-cobrar" },
    { alumno: "V. Medina",    monto: 2500, vence: "2026-09-26", closer: "Carla Ruiz",  estado: "por-cobrar" },
  ],

  /* ── 8 · Las últimas llamadas ─────────────────────────────────────────────
     situacion: "Adentro en llamada" · "Adentro en seguimiento" · "No cerró"
                · "Reagendado" · "No se presentó" · "Pendiente"
     Un cierre es una situación "Adentro …", no un monto.                    */
  llamadas: [
    { fecha: "2026-09-10", lead: "Laura M.",   closer: "Ana Pérez",   fuente: "Instagram orgánico", estrategia: "Hand Raiser Reel",     calificado: true,  situacion: "Adentro en llamada",     monto: 4000 },
    { fecha: "2026-09-09", lead: "Marta Q.", closer: "Bruno Gómez", fuente: "Ads Meta",           estrategia: "CTA info/entregables", calificado: true,  situacion: "No cerró",               monto: 0    },
    { fecha: "2026-09-09", lead: "Martín L.",  closer: "Carla Ruiz",  fuente: "YouTube",            estrategia: "CTA WN",               calificado: true,  situacion: "Adentro en seguimiento", monto: 3000 },
    { fecha: "2026-09-08", lead: "Irene W.",   closer: "Ana Pérez",   fuente: "Instagram orgánico", estrategia: "Hand Raiser Historia", calificado: false, situacion: "No cerró",               monto: 0    },
    { fecha: "2026-09-08", lead: "Óscar P.",   closer: "Diego Sosa",  fuente: "Referidos",          estrategia: "DM Directo",           calificado: true,  situacion: "Reagendado",             monto: 0    },
    { fecha: "2026-09-07", lead: "Pablo R.",   closer: "Bruno Gómez", fuente: "Ads Meta",           estrategia: "Encuesta",             calificado: true,  situacion: "Adentro en llamada",     monto: 5000 },
    { fecha: "2026-09-05", lead: "Ulises Z.",  closer: "Ana Pérez",   fuente: "Instagram orgánico", estrategia: "Hand Raiser Reel",     calificado: true,  situacion: "No cerró",               monto: 0    },
    { fecha: "2026-09-05", lead: "Bea O.",     closer: "Carla Ruiz",  fuente: "Ads Meta",           estrategia: "CTA info/entregables", calificado: false, situacion: "No se presentó",         monto: 0    },
    { fecha: "2026-09-04", lead: "Julia F.",   closer: "Bruno Gómez", fuente: "YouTube",            estrategia: "CTA WN",               calificado: true,  situacion: "Adentro en seguimiento", monto: 4000 },
    { fecha: "2026-09-03", lead: "Sofía G.",   closer: "Ana Pérez",   fuente: "Referidos",          estrategia: "DM Directo",           calificado: true,  situacion: "Adentro en llamada",     monto: 6000 },
    { fecha: "2026-09-02", lead: "Clara B.",   closer: "Bruno Gómez", fuente: "YouTube",            estrategia: "CTA WN",               calificado: true,  situacion: "Pendiente",              monto: 0    },
    { fecha: "2026-09-01", lead: "Hugo S.",    closer: "Diego Sosa",  fuente: "Instagram orgánico", estrategia: "Hand Raiser Historia", calificado: true,  situacion: "Reagendado",             monto: 0    },
  ],
};

/* ── ¿Los datos de arriba son de demostración? ────────────────────────────
   true  → muestra un sello discreto "datos de demostración"
   false → el CRM lo pone en false cuando arma los números reales           */
const MODO_DEMO = true;
