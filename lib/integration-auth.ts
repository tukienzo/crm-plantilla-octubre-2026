import { supabaseProjectRef } from "@/lib/preview-runtime"
import { canonicalPhone } from "@/lib/crm-phone"

export function authorizePreviewSync(request: Request) {
  const expected = process.env.SUPABASE_PROJECT_REF
  // La barrera de seguridad es la referencia exacta del proyecto de Supabase,
  // no VERCEL_ENV: exigir `preview` bloquearía todos los crons en producción.
  if (!expected || supabaseProjectRef() !== expected) {
    return { ok: false as const, status: 403, error: "Proyecto Supabase no autorizado" }
  }
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false as const, status: 401, error: "No autorizado" }
  }
  return { ok: true as const }
}

export function normPhone(value: unknown) {
  return canonicalPhone(value)
}

export function normEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase()
  return email.includes("@") ? email : null
}

export function normInstagram(value: unknown) {
  const username = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9._]/g, "")
  return username || null
}
