# CRM · plantilla para operaciones de venta

> ## ⚠️ Antes de instalar: requisitos obligatorios
>
> La IA que instale esta plantilla (Claude Code, Codex, OpenClaw, Cursor, Gemini CLI u otra) **tiene que estar
> conectada a todas estas herramientas antes de empezar**. Si falta una, se detiene y te pide que la conectes:
> no instala "a medias".
>
> - **Línea de comandos**: git, Node 20+, GitHub CLI con sesión, Supabase CLI con sesión (o el conector MCP de
>   Supabase) y Vercel CLI con sesión.
> - **Conectores MCP**: Fathom, Google Drive, Gmail, Google Calendar, Sandcastles, Miro, Apify y Higgsfield.
> - **Claves**: las de Supabase y `CRON_SECRET` son obligatorias; cada integración (Anthropic, Groq, Apify, Meta,
>   iClosed, ManyChat, Fathom, Google, YouTube, Mercury, VAPID) prende su módulo.
>
> Detalle y cómo conectar cada una: [`REQUISITOS.md`](REQUISITOS.md). Comprobación automática:
> `node scripts/verificar-requisitos.mjs`.
>
> **¿Lo instalás con una IA?** Abrila en esta carpeta y pedile: **"Leé EMPEZA-ACA.md y hacé lo que dice."**

CRM completo para una operación de ventas high ticket (formación, consultoría, agencia, servicios): agendas,
pipeline, seguimientos, pagos con planes y cuotas, cobranza, clientes, leaderboard y comisiones, embudos con
inversión en Meta Ads, contenido (banco de ángulos, formatos, calendario, YouTube), radar de contenido de
Instagram, tareas del equipo, finanzas, calidad de datos, un panel del negocio autosuficiente y una vista 3D de
toda la operación.

**No contiene datos, usuarios, claves, fotos ni nombres propios.** Todo lo que cambia por operación se configura
en `.env.local` (marca, equipo, programas, metas, integraciones) y en `lib/negocio.ts` (la descripción del
negocio que usan los modelos de IA).

## Instalación (resumen)

El paso a paso completo, pensado para que lo siga una IA con alguien que no programa, está en
[`EMPEZA-ACA.md`](EMPEZA-ACA.md). En corto:

```bash
node scripts/verificar-requisitos.mjs --solo-herramientas   # PASO 0: herramientas, sesiones y MCP
npx pnpm install
npx supabase link --project-ref <ref>                        # proyecto de Supabase NUEVO
npx supabase db push                                         # 51 migraciones, en orden
cp .env.example .env.local                                   # y completarlo
node scripts/instalar.mjs --generar-secretos                 # CRON_SECRET, CRM_INGEST_KEY, VAPID
node scripts/instalar.mjs --usuario ceo@empresa.com "Contraseña" "Nombre Apellido"
npx pnpm build && npx pnpm dev                               # http://localhost:3000
npx vercel link && npx vercel --prod                         # con las mismas variables cargadas en Vercel
node scripts/verificar-requisitos.mjs                        # verificación final
```

En el plan **Hobby** de Vercel los crons solo pueden correr una vez por día: copiá `vercel.hobby.json` encima de
`vercel.json` antes de publicar. `vercel.json` trae las frecuencias del plan **Pro**.

## Mapa de módulos

Qué hace cada pantalla y qué integración necesita para mostrar algo (sin ella, la pantalla funciona con lo que se
cargue a mano o queda vacía).

### General y Panel del negocio

| Pantalla | Qué hace | Necesita |
|---|---|---|
| Home (`/`) | KPIs del mes por rol: cash, ventas, agendas, avance contra la meta | Supabase |
| Panel del negocio (`/panel/*`) | Tablero autosuficiente: resumen, embudo, pipeline, año, llamadas, fuentes, contenido, cobranzas, proyección, asistente de voz y generador de carruseles; con el CRM vacío muestra un demo | Supabase (Meta Ads para el CAC) |
| El equipo (`/panel/equipo`) | Tareas de cada integrante (Hoy · En progreso · Completadas, diarias y semanales) | Supabase |

### Ventas

| Pantalla | Qué hace | Necesita |
|---|---|---|
| Agendas (`/ventas`, `/centro-agendas`, `/pipeline`) | Vista de agendas, alta y edición, pipeline por estado, calificación S/A/B/C/D automática | iClosed (opcional) |
| Seguimientos (`/seguimientos`) | Leads a seguir por closer, con 10 seguimientos, capturas y próximo contacto | Supabase |
| Embudos (`/embudos`) | Webinar · Orgánico · Outbound mes a mes, con inversión en Meta Ads, CAC y retorno | Meta Ads (opcional) |
| Resumen de setting (`/setting-resumen`) | El setter pega sus notas y sale el reporte del día y el mensaje para WhatsApp | Anthropic |
| Resumen de ventas (`/ventas/resumen`) | Reporte diario de closing por lead, con el análisis de la llamada | Fathom + Anthropic |
| WhatsApp (`/whatsapp`) | Grupos del equipo con resumen por IA | Conector propio de WhatsApp + Anthropic |
| Pagos (`/pagos`, `/carga-pagos`, `/todos-pagos`) | Carga de pagos con plan de cuotas, mensaje del plan, alta de cliente | Supabase |
| Cobros y cuotas (`/recordatorios`, `/cuotas`, `/planes-pago`, `/cobros`) | Vencimientos, atrasos, gestiones de cobranza | Supabase |

### Producto

| Pantalla | Qué hace | Necesita |
|---|---|---|
| Leaderboard (`/equipo`) | Ranking de closers y setters, comisiones por escalones (según la meta) y strikes | Supabase |
| Esquema de comisiones (`/esquema-comisiones`) | Texto de ejemplo del esquema (adaptalo) | — |
| Clientes (`/clientes-hub`, `/clientes`, `/historia-leads`) | Clientes por etapa de entrega, ficha y línea de tiempo de cada persona | Supabase |

### Marketing

| Pantalla | Qué hace | Necesita |
|---|---|---|
| Contenido (`/contenido-angulos`) | Semana de contenido, pipeline de piezas, banco de ángulos editable, guionista con IA, historias | Anthropic (guionista) |
| Formatos (`/contenido/formatos`) | Catálogo de formatos y su rendimiento (agendas, cierres, cash por pieza) | ManyChat (para el cruce) |
| Ángulos (`/contenido/angulos`) | Qué ángulo trae leads, agendas y cierres, con métricas de Instagram | ManyChat + Instagram |
| YouTube (`/youtube`) | Tablero de videos largos y sus clips | YouTube |
| Radar (`/radar`) | Sigue cuentas de Instagram, analiza piezas, historias y comentarios, y propone la versión propia | Apify + Groq + Anthropic (+ Instagram) |
| Testimonios (`/testimonios`) | Banco de testimonios y candidatos | Supabase |

### Operaciones

| Pantalla | Qué hace | Necesita |
|---|---|---|
| Ciudad (`/ciudad`) | Toda la operación como una ciudad 3D con registros reales (contenido → clientes) | ManyChat + Radar para las islas |
| Métricas (`/rendimiento`, `/metricas`, `/evolucion-diaria`) | Tasas, ROAS, CAC, setting y cash por embudo, combinables | Meta Ads (opcional) |
| Tablero semanal (`/tablero-semanal`) | Agendas, ventas y cash de la semana contra la meta prorrateada | Supabase |
| Calidad (`/calidad-datos`) | Cola de datos incompletos o inconsistentes, por rol | Supabase |
| Reporte de llamadas (`/reporte-llamadas`) | Llamadas de Fathom procesadas y su análisis | Fathom + Anthropic |
| Análisis IA (`/analisis-ia`) y Asistente (`/asistente`) | Preguntas en lenguaje natural sobre los datos del CRM | Anthropic |
| Finanzas (`/finanzas`, `/gastos`, `/payroll`) | Cierre mensual auditable, reparto entre socios, gastos y payroll | Mercury (opcional) |
| Sistema (`/operaciones-tecnicas`, `/accesos`, `/reglas`, `/sop-crm`) | Salud de integraciones, aprobación de accesos, reglas y manual de uso | Supabase |

### Sistema IA · maqueta

Centro de Mando, Agentes, Tareas, Agenda, Herramientas, Analítica de contenido, Contenido IA y Memoria
compartida (`/sistema/*`). **Son maquetas con datos ficticios** de una capa de agentes y lo dicen en pantalla.

## Qué configura cada grupo de variables

Todas están explicadas en [`.env.example`](.env.example).

| Grupo | Variables | Qué hacen |
|---|---|---|
| Base | `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_REF`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL` | Conexión, crons, URL. Obligatorias |
| Marca | `NEXT_PUBLIC_BRAND_*` | Nombre, frase, Instagram, palabra clave, datos legales |
| Programa y metas | `NEXT_PUBLIC_PROGRAMA_*`, `NEXT_PUBLIC_PRECIO_BASE`, `NEXT_PUBLIC_CRM_PROGRAMAS`, `NEXT_PUBLIC_META_CASH_MENSUAL` | Catálogo de "Cargar pago", ticket base, meta y escalones de comisión |
| Equipo | `NEXT_PUBLIC_CRM_*` | Closers, setters, alias, responsables de contenido, socios |
| Accesos | `CRM_CEO_NAMES`, `*_EXPORT_EMAILS`, `CRM_INGEST_KEY` | Quién es CEO, quién exporta, cargas externas |
| Integraciones | `ANTHROPIC_*`, `GROQ_*`, `APIFY_*`, `RADAR_*`, `META_*`, `IG_*`, `ICLOSED_*`, `MANYCHAT_*`, `FATHOM_*`, `GOOGLE_*`, `YOUTUBE_*`, `MERCURY_*`, `VAPID_*` | Vacías = apagadas |

Cómo conectar cada integración: [`docs/integraciones.md`](docs/integraciones.md).

## Crons (Vercel)

| Ruta | Pro (`vercel.json`) | Qué hace |
|---|---|---|
| `/api/lead-scoring-sync` | cada 15 min | Recalcula la calificación automática de las agendas |
| `/api/sheet-sync` · `/api/sheet-pull` | 5 y 10 min | Espejo con Google Sheets (ida y vuelta de pagos) |
| `/api/iclosed-sync` | 10 min | Trae agendas de iClosed |
| `/api/fathom-sync` · `/api/fathom-show-reconcile` | 30 min · 2 h | Grabaciones de Fathom, análisis y show real |
| `/api/manychat-sync` | 6 h | Contactos y etiquetas de ManyChat |
| `/api/operations-refresh` | 1 h | Colas de excepciones y avisos |
| `/api/cron-diario` | diario | Repaso general de integraciones |
| `/api/youtube-sync` | diario | Videos del canal |
| `/api/radar-sync?paso=…` | 10 min a semanal | Radar: piezas, historias, perfiles, comentarios, métricas, vínculos |
| `/api/ventas-diario` | diario | Cierre diario de ventas (concilia llamadas, closers y pagos duplicados) |

Todas exigen `Authorization: Bearer <CRON_SECRET>` y se saltean solas si falta la clave de su integración.

## Qué no incluye

Datos de ningún negocio, usuarios, comprobantes, fotos del equipo, campañas, cuentas seguidas del Radar, el bot de
WhatsApp ni los scripts de importación de planillas propias. Las imágenes del generador de carruseles del panel
son placeholders.

## Cosas que conviene saber

- **Zona horaria**: la plantilla interpreta fechas sin zona y "hoy" en hora de Argentina (UTC-3). Ver `CLAUDE.md`.
- **Teléfonos**: la normalización de identidades asume números de Argentina (prefijo 54/549) para unificar
  duplicados; con otros países funciona, pero sin esa unificación.
- **Comisiones y reglas** (`/esquema-comisiones`, `/reglas`) son texto de ejemplo: adaptalas.
- **Fotos del equipo**: no hay; se muestran iniciales. Si querés fotos, van en `public/avatars/`.
- **Páginas legales** (`/privacidad`, `/terminos`, `/eliminar-datos`): plantillas a revisar por un abogado.

## Para desarrolladores

Stack: Next.js 16, React 19, Tailwind 4, shadcn/Radix, Supabase, Vercel, pnpm. Mapa técnico (estructura,
permisos por rol, sistema de diseño, trampas conocidas) en [`CLAUDE.md`](CLAUDE.md). Instrucciones para agentes
de IA en [`AGENTS.md`](AGENTS.md). Guía de uso para el equipo en [`GUIA-EQUIPO.md`](GUIA-EQUIPO.md).

```bash
npx tsc --noEmit      # tipos
npx pnpm lint         # estilo (0 errores)
npx pnpm build        # producción
```
