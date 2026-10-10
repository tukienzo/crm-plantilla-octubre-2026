# Cómo conectar cada integración

Todas son opcionales salvo Supabase: si la clave está vacía, el módulo queda apagado y su cron se saltea.
Las claves van en `.env.local` (para correrlo en tu compu) **y** en Vercel → Project → Settings → Environment
Variables (para producción). Nunca al repo. Después de cargar una variable `NEXT_PUBLIC_*` hay que volver a
compilar (`npx vercel --prod` o un `pnpm build`).

## Supabase (obligatorio)

1. supabase.com → New project. Anotá la contraseña de la base.
2. Settings → API: copiá `Project URL` → `NEXT_PUBLIC_SUPABASE_URL` (y `SUPABASE_URL`), `anon public` →
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `service_role` → `SUPABASE_SERVICE_ROLE_KEY`. El ref (lo que va antes de
   `.supabase.co`) → `SUPABASE_PROJECT_REF`.
3. Migraciones: `npx supabase login` · `npx supabase link --project-ref <ref>` · `npx supabase db push`.
4. Authentication → URL Configuration → Site URL = la URL final del CRM (para los links de recuperación).
5. **Espejo a Google Sheets por la base (opcional)**: la migración `20260911000001` crea los avisos de la base
   (pg_net) y deja en `crm_config` los valores `sheet_sync_url` y `cron_secret` con marcadores. Para activarlo,
   cargá los valores reales una vez (SQL Editor de Supabase):
   `update crm_config set valor = 'https://<tu-crm>/api/sheet-sync' where clave = 'sheet_sync_url';`
   `update crm_config set valor = '<tu CRON_SECRET>' where clave = 'cron_secret';`
   Sin esto, el cron diario hace lo mismo una vez por día.

## Vercel (publicación y crons)

- `npx vercel login` · `npx vercel link` · cargar las variables · `npx vercel --prod`.
- `vercel.json` trae los crons con la frecuencia del plan **Pro**. En el plan **Hobby** (gratis) Vercel solo
  acepta crons diarios y el deploy falla con los frecuentes: copiá `vercel.hobby.json` encima de `vercel.json`
  antes de publicar.
- Cada cron se autentica con `Authorization: Bearer <CRON_SECRET>` (Vercel lo manda solo si `CRON_SECRET` está
  cargada en el proyecto).

## Anthropic (Claude)

`ANTHROPIC_API_KEY` de console.anthropic.com. La usan: asistente, análisis de llamadas (Fathom), guionista de
Contenido, resumen de setting, WhatsApp, cierre de ventas diario y el Radar (`RADAR_MODELO` elige el modelo).
Antes de usar los modelos, completá la descripción del negocio en `lib/negocio.ts`.

## Groq (transcripción)

`GROQ_API_KEY` de console.groq.com (Whisper). Transcribe reels e historias del Radar. Alternativa:
`OPENAI_API_KEY`.

## Apify (Radar e Instagram)

`APIFY_TOKEN` de console.apify.com → Settings → Integrations. Lee piezas, perfiles, historias y comentarios de las
cuentas que sigue el Radar. El plan gratis no permite los actores de historias. `RADAR_PLAN` regula la frecuencia
(y el gasto): `gratis`, `estandar` o `completo`; `RADAR_TOPE_USD` pone un tope mensual.

## Meta (Ads, CAPI, Instagram)

- **Inversión en Ads**: `META_ADS_ACCESS_TOKEN` (token de usuario de sistema con `ads_read`) y
  `META_ADS_ACCOUNT_ID` (`act_…`). Embudos, Métricas y Panel muestran la inversión por campaña.
- **Conversiones (CAPI)**: `META_CAPI_ACCESS_TOKEN` + `META_CAPI_DATASET_ID` (el píxel/dataset). Manda a Meta los
  leads calificados que se presentaron a la llamada.
- **Público "tiene llamada agendada"**: `META_HAMMER_AUDIENCE_ID` (público personalizado). Suma a quien agenda y
  lo saca cuando pasa la llamada.
- **Métricas de Instagram propias** (Radar, Ángulos, Ciudad): `IG_INSIGHTS_TOKEN` (token con `instagram_basic`,
  `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`) e `IG_USER_ID` (id de la cuenta de
  Instagram profesional). Se genera en business.facebook.com → Configuración del negocio → Usuarios del sistema
  → asignar la página y la cuenta de Instagram → Generar token (sin vencimiento).
- Las páginas públicas `/privacidad`, `/terminos` y `/eliminar-datos` existen porque Meta las pide para publicar
  una app: completá `NEXT_PUBLIC_BRAND_LEGAL_NAME`, `NEXT_PUBLIC_BRAND_CONTACT_EMAIL` y `NEXT_PUBLIC_BRAND_SITE`
  y hacelas revisar.

## ManyChat

`MANYCHAT_API_KEY` (ManyChat → Settings → API). Para que cada contacto llegue al instante:

1. ManyChat → Automation → una regla "Etiqueta aplicada" (o al final de cada flujo de entrada) → **Actions →
   External Request**.
2. POST a `https://<tu-crm>/api/manychat-sync`, headers `Authorization: Bearer <CRON_SECRET>` y
   `Content-Type: application/json`, body **Full Contact Data**.
3. Publicar. El cron de `manychat-sync` repasa lo que falte.

El CRM guarda el contacto, lo vincula por Instagram o teléfono a la persona del pipeline y registra cada etiqueta
como evento (pieza que lo trajo, ángulo). Las etiquetas de ángulo siguen el formato
`<pieza> - 🔴PROBLEMA - d/m/aaaa` (🔴 Problema · 🟢 Solución · 🔵 Producto · 🟣 Volumen/TOFU).

## iClosed (agendas)

`ICLOSED_API_KEY` (iClosed → Integraciones → API). `ICLOSED_EVENT_IDS` limita los calendarios a importar (ids
separados por coma; vacío = todos). El cron trae las agendas cada 10 minutos (en Pro).

## Fathom (grabaciones de llamadas)

`FATHOM_API_KEY` (Fathom → Settings → API). El CRM lee las grabaciones, las transcribe y las analiza con Claude,
las vincula a la agenda y marca el show. Para reconocer las llamadas de venta por el título usa los nombres del
equipo (`NEXT_PUBLIC_CRM_CLOSERS`, `NEXT_PUBLIC_CRM_FATHOM_NOMBRES`).

## Google Sheets (espejo de pagos y agendas)

1. Google Cloud → una cuenta de servicio → clave JSON. Pasala a base64 y cargala en `GOOGLE_SERVICE_ACCOUNT_JSON`.
2. Compartí la planilla con el mail de la cuenta de servicio (editor) y poné su id en `GOOGLE_SHEET_ID`.
3. El CRM escribe cada pago y agenda en la pestaña del mes y trae los pagos cargados a mano.

## YouTube

`YOUTUBE_API_KEY` (Google Cloud, YouTube Data API v3) y `YOUTUBE_CHANNEL_ID` (`UC…`). Trae los videos largos del
canal al tablero de YouTube.

## Mercury (finanzas)

`MERCURY_API_TOKEN` (solo lectura). Lee movimientos para el cierre mensual de Finanzas y como respaldo del gasto
en Ads. `MERCURY_PATRON_GASTO_PERSONAL` y `MERCURY_PATRON_RETIRO_SOCIOS` (expresiones regulares) separan gastos
personales y retiros de socios; vacías, no se separa nada.

## Avisos push (VAPID)

`node scripts/instalar.mjs --generar-secretos` genera `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.
`VAPID_SUBJECT` = `mailto:` + un mail de contacto.

## WhatsApp

La pantalla Ventas → WhatsApp muestra grupos que manda un conector propio (un bot que corre aparte y hace POST a
`/api/whatsapp-ingest` con `CRM_INGEST_KEY`). La plantilla no trae ese bot: sin él, la pantalla queda vacía.
