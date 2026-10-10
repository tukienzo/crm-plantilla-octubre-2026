"use client"

/* Contenedor de las pantallas del "Sistema IA" (la capa de agentes).
   Repite el padding y el fondo cálido del sistema de diseño. Los datos de estas pantallas son
   ficticios (components/os/data.ts) hasta que se conecten, y el
   aviso de arriba lo dice sin vueltas para que nadie lea esos números
   como reales. */
export function OsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="os-page mx-auto w-full max-w-[1500px]" style={{ padding: "28px 38px 34px" }}>
      <div
        role="note"
        className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
      >
        <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[11px] font-black uppercase tracking-[.14em] text-amber-200">Maqueta</span>
        <span>
          Esta capa de agentes todavía <b>no está conectada</b>: los agentes, tareas, agenda, herramientas, analítica y memoria que ves acá son
          datos de demostración, no del negocio. Los números reales están en el Panel del negocio, Ventas y Métricas.
        </span>
      </div>
      {children}
    </div>
  )
}
