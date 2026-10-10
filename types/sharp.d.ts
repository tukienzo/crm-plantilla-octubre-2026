// sharp 0.35 trae sus tipos en lib/index.d.ts pero no los expone en "exports", así que TypeScript no los
// encuentra. Acá va lo que usa el CRM (lib/radar/medios.ts). Si se usa algo más de sharp, se agrega acá.
declare module "sharp" {
  interface Sharp {
    rotate(angulo?: number): Sharp
    resize(opciones: { width?: number; height?: number; fit?: "cover" | "contain" | "inside" | "outside" | "fill"; withoutEnlargement?: boolean }): Sharp
    jpeg(opciones?: { quality?: number; mozjpeg?: boolean; progressive?: boolean }): Sharp
    webp(opciones?: { quality?: number }): Sharp
    toBuffer(): Promise<Buffer>
    metadata(): Promise<{ width?: number; height?: number; format?: string }>
  }
  function sharp(entrada?: Buffer | Uint8Array | string): Sharp
  export default sharp
}
