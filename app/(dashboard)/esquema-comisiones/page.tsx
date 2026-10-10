"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, BadgeDollarSign, Info, Target, TrendingUp, Users } from "lucide-react"
import { CrmPageIntro } from "@/components/crm-ui"
import { META_CASH_MENSUAL } from "@/lib/brand"
import { closerMidTarget, closerTopTarget } from "@/lib/commission-scheme"

// Esquema de ejemplo: los porcentajes y escalones son los que calcula lib/commission-scheme.ts
// (escalones como porcentaje de NEXT_PUBLIC_META_CASH_MENSUAL). Adaptalos a tu operación.
const MES = new Date().toISOString().slice(0, 7)
const usd = (n: number) => `USD ${Math.round(n).toLocaleString("es-AR")}`
const CLOSER_MEDIO = closerMidTarget(MES)
const CLOSER_TOP = closerTopTarget(MES)
// Mismos escalones de setter que lib/commission-scheme.ts (50 % y 60 % de la meta).
const SETTER_MEDIO = Math.round(META_CASH_MENSUAL * 0.5)
const SETTER_TOP = Math.round(META_CASH_MENSUAL * 0.6)
const desde = (monto: number, sinMeta: string) => (monto > 0 ? `Desde ${usd(monto)}` : sinMeta)

function RateCard({ label, rate, detail, tone = "amber" }: { label: string; rate: string; detail: string; tone?: "amber" | "emerald" | "blue" }) {
  const styles = {
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-700",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-700",
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-700",
  }
  return (
    <div className={`rounded-xl border p-4 ${styles[tone]}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-black">{rate}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function StrikeTable({ role }: { role: "closer" | "setter" }) {
  const adjustments = ["Sin descuento", "−0,5%", "−1%", "−1,5% o más"]
  const floor = role === "closer" ? "8%" : "4%"
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr><th className="px-4 py-3 text-left">Strikes del mes</th><th className="px-4 py-3 text-right">Ajuste sobre % ganado</th></tr>
        </thead>
        <tbody>
          {[0, 1, 2, "3+"].map((strikes, index) => (
            <tr key={strikes} className="border-t border-border">
              <td className="px-4 py-3">{strikes}</td>
              <td className="px-4 py-3 text-right font-bold">{adjustments[index]} <span className="font-normal text-muted-foreground">(piso {floor})</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function EsquemaComisionesPage() {
  return (
    <div className="crm-module-page">
      <CrmPageIntro
        eyebrow="Reglas de incentivo · ejemplo para adaptar"
        title="Esquema de comisiones"
        description="Competencia individual por Cash Collected frontend, con cohortes FECCU y FECCPP."
        icon={<BadgeDollarSign className="h-6 w-6" />}
        tone="amber"
        actions={<Button asChild variant="outline" className="border-white/10 bg-white/10 text-white hover:bg-white/15 hover:text-white"><Link href="/equipo"><ArrowLeft className="mr-2 h-4 w-4" />Volver a Equipo</Link></Button>}
      />

      <Card className="border border-border">
        <CardHeader><div className="flex items-center gap-2"><Target className="h-5 w-5 text-amber-500" /><CardTitle>Objetivo del negocio</CardTitle></div></CardHeader>
        <CardContent>
          <RateCard label="Meta mensual" rate={META_CASH_MENSUAL ? usd(META_CASH_MENSUAL) : "Sin cargar"} detail={META_CASH_MENSUAL ? "Cash Collected total del equipo" : "Cargala en NEXT_PUBLIC_META_CASH_MENSUAL; sin meta todos cobran el porcentaje base"} />
        </CardContent>
      </Card>

      <Card className="border border-border">
        <CardHeader><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-600" /><CardTitle>Closers</CardTitle></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <RateCard label="Base" rate="10%" detail="Sobre FECCU + FECCPP recolectado individualmente" />
            <RateCard label="Rendimiento" rate="11%" detail={`${desde(CLOSER_MEDIO, "Desde el 80 % de la meta")} de CC frontend individual`} tone="blue" />
            <RateCard label="Top Closer" rate="12%" detail={`Solo #1: ${CLOSER_TOP > 0 ? `desde ${usd(CLOSER_TOP)}` : "desde el 100 % de la meta"}`} tone="emerald" />
          </div>
          <p className="text-sm text-muted-foreground">Si ambos superan el corte máximo, solo el #1 cobra 12%; el otro queda en 11%. Desempate: mayor FECCU y luego mejor tasa de cierre sobre presentadas.</p>
          <StrikeTable role="closer" />
        </CardContent>
      </Card>

      <Card className="border border-border">
        <CardHeader><div className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-600" /><CardTitle>Setters</CardTitle></div></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <RateCard label="Base" rate="5%" detail="FECCU + FECCPP dentro de los primeros 30 días" tone="blue" />
            <RateCard label="Rendimiento" rate="5,5%" detail={`${desde(SETTER_MEDIO, "Desde el 50 % de la meta")} comisionables`} />
            <RateCard label="Top Setter" rate="6%" detail={`Solo #1 ${SETTER_TOP > 0 ? `desde ${usd(SETTER_TOP)}` : "desde el 60 % de la meta"} comisionables`} tone="emerald" />
          </div>
          <StrikeTable role="setter" />
          <p className="text-sm text-muted-foreground">La ventana empieza con el primer pago: hasta el día 30 inclusive cuenta; desde el día 31 la cuota queda exclusivamente para el closer. Los strikes se reinician el día 1.</p>
        </CardContent>
      </Card>

      <Card className="border border-border">
        <CardHeader><div className="flex items-center gap-2"><Info className="h-5 w-5 text-primary" /><CardTitle>Base de cálculo</CardTitle></div></CardHeader>
        <CardContent>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <p className="font-semibold text-emerald-700">Cohortes automáticas por fecha real de pago</p>
            <p className="mt-1 text-sm text-muted-foreground">Closer: FECCU + FECCPP frontend efectivamente recolectado. Setter: solo FECCU + FECCPP de los días 0–30 desde el primer pago. Pagos archivados, anulados, backend y cuotas posteriores no entran en su base.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
