"use client"

/* ── Radar de contenido, adentro del CRM ───────────────────────────────────
   La página del radar (public/radar/index.html) es autosuficiente: trae su
   diseño, sus pestañas y su panel lateral, y pide los datos a /api/radar/*.
   Acá se la monta en un iframe a pantalla completa, igual que el Panel del
   negocio. El menú sigue siendo el del CRM. */

import { useState } from "react"

export function RadarEmbed() {
  const [listo, setListo] = useState(false)
  return (
    <div className="panel-negocio" style={{ position: "relative", height: "calc(100dvh - var(--crm-header-h, 0px))", background: "#0B0B0D" }}>
      {!listo && (
        <div className="panel-negocio-cargando" aria-live="polite">
          <span className="panel-negocio-punto" /> Cargando el radar…
        </div>
      )}
      <iframe
        src="/radar/index.html"
        title="Radar de contenido"
        onLoad={() => setListo(true)}
        style={{ width: "100%", height: "100%", border: 0, display: "block", background: "#0B0B0D", opacity: listo ? 1 : 0, transition: "opacity .35s ease" }}
      />
    </div>
  )
}
