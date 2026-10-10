// Cliente mínimo de Google Sheets (API v4) con cuenta de servicio, sin dependencias.
// Credenciales: GOOGLE_SERVICE_ACCOUNT_JSON (el JSON tal cual, o en base64) y GOOGLE_SHEET_ID.
import { createSign } from "node:crypto"

const SCOPE = "https://www.googleapis.com/auth/spreadsheets"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const API = "https://sheets.googleapis.com/v4/spreadsheets"

type ServiceAccount = { client_email: string; private_key: string }
type Token = { value: string; expiresAt: number }
let cachedToken: Token | null = null

export function sheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SHEET_ID)
}

function serviceAccount(): ServiceAccount {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim()
  if (!raw) throw new Error("Falta GOOGLE_SERVICE_ACCOUNT_JSON")
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")
  const parsed = JSON.parse(json) as Partial<ServiceAccount>
  if (!parsed.client_email || !parsed.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON incompleto (client_email / private_key)")
  return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n") }
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const sa = serviceAccount()
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${claims}`)
  const signature = b64url(signer.sign(sa.private_key))
  const assertion = `${header}.${claims}.${signature}`
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Google OAuth: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`)
  const payload = (await response.json()) as { access_token: string; expires_in: number }
  cachedToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 }
  return cachedToken.value
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const id = process.env.GOOGLE_SHEET_ID
  if (!id) throw new Error("Falta GOOGLE_SHEET_ID")
  const token = await accessToken()
  const response = await fetch(`${API}/${id}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Sheets ${path.split("?")[0]}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`)
  return (await response.json()) as T
}

export type SheetTab = { sheetId: number; title: string; index: number; rowCount: number; columnCount: number }

export async function listTabs(): Promise<SheetTab[]> {
  const meta = await call<{ sheets: Array<{ properties: { sheetId: number; title: string; index: number; gridProperties: { rowCount: number; columnCount: number } } }> }>(
    "?fields=sheets.properties(sheetId,title,index,gridProperties)",
  )
  return meta.sheets.map(s => ({
    sheetId: s.properties.sheetId, title: s.properties.title, index: s.properties.index,
    rowCount: s.properties.gridProperties?.rowCount || 0, columnCount: s.properties.gridProperties?.columnCount || 0,
  }))
}

export function a1(tab: string, range: string): string {
  return `'${tab.replace(/'/g, "''")}'!${range}`
}

export async function getValues(range: string): Promise<unknown[][]> {
  const data = await call<{ values?: unknown[][] }>(`/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`)
  return data.values || []
}

export async function writeValues(data: Array<{ range: string; values: unknown[][] }>): Promise<void> {
  if (!data.length) return
  await call("/values:batchUpdate", { method: "POST", body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }) })
}

export async function clearValues(range: string): Promise<void> {
  await call(`/values/${encodeURIComponent(range)}:clear`, { method: "POST", body: "{}" })
}

export async function duplicateTab(sourceSheetId: number, newTitle: string, insertIndex: number): Promise<SheetTab> {
  const result = await call<{ replies: Array<{ duplicateSheet: { properties: { sheetId: number; title: string; index: number; gridProperties: { rowCount: number; columnCount: number } } } }> }>(
    ":batchUpdate",
    { method: "POST", body: JSON.stringify({ requests: [{ duplicateSheet: { sourceSheetId, insertSheetIndex: insertIndex, newSheetName: newTitle } }] }) },
  )
  const p = result.replies[0].duplicateSheet.properties
  return { sheetId: p.sheetId, title: p.title, index: p.index, rowCount: p.gridProperties?.rowCount || 0, columnCount: p.gridProperties?.columnCount || 0 }
}

export function columnLetter(index0: number): string {
  let n = index0 + 1, s = ""
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26) }
  return s
}
