# Requisitos para instalar el CRM

La IA que instala la plantilla tiene que estar conectada a **todo** lo de las secciones 1 y 2 antes de empezar.
Si falta algo, se detiene, te dice qué falta y cómo conectarlo, y espera. La lista para máquinas está en
[`requisitos.json`](requisitos.json) y la comprobación automática es:

```bash
node scripts/verificar-requisitos.mjs --solo-herramientas   # antes de instalar (CLIs, sesiones y MCP)
node scripts/verificar-requisitos.mjs                        # al final (además, las claves)
node scripts/verificar-requisitos.mjs --estricto             # exige también todas las claves de integraciones
```

Muestra una tabla con ✓ / ✗ y sale con código 1 si falta algo obligatorio. Nunca imprime el valor de una clave.

## 1. Línea de comandos (obligatorio)

| Herramienta | Cómo se verifica | Cómo se conecta |
|---|---|---|
| Git | `git --version` | git-scm.com/downloads |
| Node.js 20 o más | `node --version` | nodejs.org (versión LTS). pnpm no hace falta: `npx pnpm …` |
| GitHub CLI con sesión | `gh auth status` | cli.github.com → `gh auth login` |
| Supabase CLI con sesión | `npx supabase projects list` | `npx supabase login` (abre el navegador). Alternativa: el conector MCP de Supabase |
| Vercel CLI con sesión | `npx vercel whoami` | `npx vercel login` |

## 2. Conectores MCP en la IA (obligatorio)

Cada uno se prueba llamando una herramienta de **solo lectura**. Después, la IA lo anota con
`node scripts/verificar-requisitos.mjs --confirmar-mcp <ids>` (vale 24 horas). Direcciones oficiales, qué probar
y cómo se conecta en cada cliente: [`docs/conectores-mcp.md`](docs/conectores-mcp.md).

| Id | Servicio | Servidor oficial |
|---|---|---|
| `fathom` | Fathom | `https://api.fathom.ai/mcp` |
| `google-drive` | Google Drive | conector oficial en Claude · `https://drivemcp.googleapis.com/mcp/v1` |
| `gmail` | Gmail | conector oficial en Claude · `https://gmailmcp.googleapis.com/mcp/v1` |
| `google-calendar` | Google Calendar | conector oficial en Claude · `https://calendarmcp.googleapis.com/mcp/v1` |
| `sandcastles` | Sandcastles | `https://mcp.sandcastles.ai/` (plan Pro o superior) |
| `miro` | Miro | `https://mcp.miro.com/` |
| `apify` | Apify | `https://mcp.apify.com` |
| `higgsfield` | Higgsfield | `https://mcp.higgsfield.ai/mcp` |
| `mcp-supabase` | Supabase (solo si no hay CLI) | `https://mcp.supabase.com/mcp` |

Si el cliente de IA no soporta MCP, la instalación no puede seguir con ese cliente.

## 3. Claves para `.env.local`

### Base (obligatorias)

| Variable | Para qué | De dónde sale |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Conexión con la base | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sesión de los usuarios | Supabase → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Lecturas y escrituras del servidor (nunca al navegador) | Supabase → API → service_role |
| `SUPABASE_PROJECT_REF` | Barrera de los crons de sincronización | El ref del proyecto |
| `CRON_SECRET` | Autoriza los crons y las automatizaciones | `node scripts/instalar.mjs --generar-secretos` |
| `NEXT_PUBLIC_APP_URL` | URL del CRM (crons, políticas de seguridad) | `http://localhost:3000` / la URL de Vercel |

### Configuración del negocio (recomendadas)

`NEXT_PUBLIC_BRAND_*` (nombre, Instagram, palabra clave, datos legales), `NEXT_PUBLIC_CRM_*` (equipo),
`NEXT_PUBLIC_PRECIO_BASE` / `NEXT_PUBLIC_PROGRAMA_*` / `NEXT_PUBLIC_CRM_PROGRAMAS` (programas) y
`NEXT_PUBLIC_META_CASH_MENSUAL` (meta). Sin ellas el CRM anda, pero con nombres y precios genéricos. Todas
explicadas en [`.env.example`](.env.example).

### Integraciones (cada una prende su módulo)

| Variable(s) | Módulo que la usa | De dónde sale |
|---|---|---|
| `ANTHROPIC_API_KEY` | Asistente, Análisis IA, guionista de Contenido, Resumen de setting, WhatsApp, análisis de Fathom, Radar, cierre de ventas diario | console.anthropic.com |
| `GROQ_API_KEY` (o `OPENAI_API_KEY`) | Radar: transcripción de reels e historias | console.groq.com |
| `APIFY_TOKEN` (+ `RADAR_*`) | Radar y miniaturas de la Ciudad | console.apify.com |
| `META_ADS_ACCESS_TOKEN`, `META_ADS_ACCOUNT_ID` (+ `ADS_PALABRAS_WEBINAR`) | Inversión en Ads en Embudos, Métricas y Panel; costo por seguidor | Meta Business → usuario de sistema |
| `META_CAPI_ACCESS_TOKEN`, `META_CAPI_DATASET_ID` | Envío de leads calificados a Meta (CAPI) | Meta Events Manager |
| `META_HAMMER_AUDIENCE_ID` | Público "tiene llamada agendada" | Meta Ads → Públicos |
| `IG_INSIGHTS_TOKEN`, `IG_USER_ID` | Métricas de Instagram propias (Radar, Ángulos, Ciudad) | Meta Business → usuario de sistema |
| `ICLOSED_API_KEY` (+ `ICLOSED_EVENT_IDS`) | Agendas automáticas | iClosed → Integraciones |
| `MANYCHAT_API_KEY` | Contactos, etiquetas y ángulos | ManyChat → Settings → API |
| `FATHOM_API_KEY` | Reporte de llamadas, Resumen de ventas, cierre diario | Fathom → Settings → API |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID` | Espejo con Google Sheets | Google Cloud → cuenta de servicio |
| `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID` | Tablero de YouTube | Google Cloud → YouTube Data API v3 |
| `MERCURY_API_TOKEN` (+ `MERCURY_PATRON_*`) | Cierre mensual de Finanzas; respaldo del gasto en Ads | Mercury → API tokens |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Avisos push en el navegador | `node scripts/instalar.mjs --generar-secretos` |
| `CRM_INGEST_KEY` | Cargas externas (`/api/ingest/*`, WhatsApp) | `node scripts/instalar.mjs --generar-secretos` |

Paso a paso de cada integración: [`docs/integraciones.md`](docs/integraciones.md).

## 4. Cuentas

- **Supabase**: un proyecto **nuevo** por instalación (el plan gratis alcanza para empezar).
- **Vercel**: un proyecto nuevo. Con plan Hobby, usar `vercel.hobby.json` (crons diarios).
- **GitHub**: para guardar la copia de la instalación en un repo privado.
