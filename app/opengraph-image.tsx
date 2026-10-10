import { ImageResponse } from 'next/og'
import { BRAND, BRAND_INICIALES } from '@/lib/brand'

export const alt = `${BRAND.name} | ${BRAND.tagline}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '72px 82px',
        color: '#fffaf6',
        background: 'linear-gradient(135deg, #160b08 0%, #32130b 52%, #7f210e 100%)',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 58 }}>
        <div
          style={{
            width: 260,
            height: 260,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 64,
            background: 'linear-gradient(145deg, #ff9d5c, #f2542d 48%, #9f250d)',
            border: '10px solid #24100b',
            boxShadow: '0 28px 70px rgba(0,0,0,.38)',
          }}
        >
          <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1, color: '#fff', display: 'flex' }}>{BRAND_INICIALES}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720 }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 6, color: '#ff8a55', textTransform: 'uppercase' }}>
            {BRAND.name}
          </div>
          <div style={{ marginTop: 18, fontSize: 70, lineHeight: 1.03, fontWeight: 800, letterSpacing: -3 }}>
            {BRAND.tagline}
          </div>
          <div style={{ marginTop: 30, fontSize: 34, color: '#efc8b7' }}>{BRAND.description}</div>
        </div>
      </div>
    </div>,
    size,
  )
}
