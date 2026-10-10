// Logo genérico de la marca: las iniciales del nombre (NEXT_PUBLIC_BRAND_NAME) sobre una baldosa
// clara redondeada. Para usar tu logo, reemplazá LogoMarcaMark por tu SVG (y public/icon.svg,
// public/logo.svg y los PNG de public/icons/).
import { BRAND, BRAND_INICIALES } from "@/lib/brand"

export function LogoMarcaMark({ size = 34, color = "currentColor", className, title = BRAND.name }: { size?: number; color?: string; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <text
        x="50"
        y="53"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="Inter, system-ui, sans-serif"
        fontWeight={800}
        fontSize={BRAND_INICIALES.length > 1 ? 46 : 58}
        letterSpacing="-2"
        fill={color}
      >
        {BRAND_INICIALES}
      </text>
    </svg>
  )
}

export function LogoMarca({ size = 34, radius = 11, className }: { size?: number; radius?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{ width: size, height: size, borderRadius: radius, display: "inline-grid", placeItems: "center", background: "#f2f1ee", boxShadow: "0 0 0 1px rgba(255,255,255,.08), 0 6px 18px rgba(0,0,0,.35)", flex: "0 0 auto" }}
    >
      <LogoMarcaMark size={Math.round(size * 0.8)} color="#111114" />
    </span>
  )
}
