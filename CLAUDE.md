# CRM · mapa técnico para la IA

> **PASO 0 obligatorio** antes de instalar o tocar nada: `node scripts/verificar-requisitos.mjs --solo-herramientas`
> y probar cada conector MCP (Fathom, Google Drive, Gmail, Google Calendar, Sandcastles, Miro, Apify, Higgsfield)
> con una herramienta de solo lectura. Si falta algo, **parás** y le explicás a la persona cómo conectarlo
> ([`REQUISITOS.md`](REQUISITOS.md)). El proceso completo está en [`EMPEZA-ACA.md`](EMPEZA-ACA.md); este archivo es
> la referencia técnica.

## Stack

Next.js 16 (App Router) + React 19 + Tailwind 4 + shadcn/Radix · Supabase (Postgres, Auth, RLS, funciones SQL,
Storage) · Vercel (hosting y crons) · pnpm (`npx pnpm <cmd>` si no está global). Todo en español; quedan en inglés
los términos del oficio (lead, closer, setter, pipeline, cash collected).

## Estructura

```
app/(dashboard)/        una carpeta por pantalla (56) + sistema/* (maqueta de la capa de agentes)
app/api/                rutas del servidor (83): métricas, pagos, cobranza, sincronizaciones, crons, radar, ciudad, tareas
app/login, solicitar-acceso, pendiente     acceso
app/privacidad, terminos, eliminar-datos   páginas legales públicas (las pide Meta para publicar una app)
components/             UI del CRM (crm-navigation, content-workspace, ciudad/, tareas-equipo…) y components/ui (shadcn)
components/os/          el sistema de diseño: tokens (os.css, tema-futurista.css), primitivas (ui.tsx), maqueta de agentes (data.ts, pages/)
components/os-rail.tsx  raíl de navegación de escritorio (lee los módulos de crm-navigation)
lib/                    reglas de negocio y configuración (ver abajo), integraciones (meta-*, fathom-*, radar/*), supabase-*
supabase/migrations/    51 migraciones en orden (esquema completo, sin datos del negocio)
scripts/                verificar-requisitos.mjs (PASO 0), instalar.mjs, crear-usuario.mjs, aplicar-sql.mjs, utilidades
public/panel/           "Panel del negocio": HTML autosuficiente embebido en /panel/*, lee /api/panel/datos
public/radar/           Radar de contenido: HTML embebido en /radar, lee /api/radar/*
middleware.ts           sesión + permisos por rol en cada request (fail-closed)
docs/                   integraciones.md, conectores-mcp.md, ciudad.md
```

## Configuración: nada del negocio en el código

Lo que cambia por operación vive en `.env.local` (comentado línea por línea en `.env.example`) y en un solo
archivo de texto:

- **Marca**: `NEXT_PUBLIC_BRAND_*` → `lib/brand.ts` (`BRAND.name`, `igHandle`, `ctaKeyword`, `legalName`…,
  `META_CASH_MENSUAL`, `PRECIO_BASE`). Se usa en layout, manifest, OG, raíl, login, páginas legales, prompts, panel.
- **Equipo**: `NEXT_PUBLIC_CRM_*` → `lib/equipo.ts` (CEO, closers, setters actuales e históricos, alias,
  responsables de contenido, calendario general, nombres para Fathom). Quién entra y con qué rol sale de
  `team_members`, no de acá.
- **Programas y precios**: `NEXT_PUBLIC_PROGRAMA_*` / `NEXT_PUBLIC_PRECIO_BASE` o `NEXT_PUBLIC_CRM_PROGRAMAS`
  (JSON) → `lib/programas.ts`.
- **Descripción del negocio para la IA**: `lib/negocio.ts` (`contextoNegocio()`). Todos los prompts (guionista,
  Radar, setting, WhatsApp, Fathom) la usan; ningún prompt describe el negocio por su cuenta.
- **Ángulos y formatos de contenido**: en la base (`crm_angulos`, `crm_formatos`), editables desde Contenido.
  `lib/angulos-semilla.ts` es solo el respaldo neutro.
- **Socios (Finanzas)**: claves internas `socio_a` / `socio_b`; nombres visibles en `NEXT_PUBLIC_CRM_SOCIO_A/B`.

Las variables `NEXT_PUBLIC_*` se inyectan al compilar: cambiarlas exige reiniciar `dev` o volver a hacer `build`.

## Base de datos

- Migraciones con versión única `AAAAMMDD00000N_nombre.sql`, en orden de dependencia. Una nueva va con la fecha
  del día y el siguiente `N`. Se aplican con `npx supabase db push` (o `node scripts/aplicar-sql.mjs <archivo>`).
- Probadas en orden sobre un Postgres 17 vacío: 63 tablas, 2 vistas, 40 funciones, RLS en todas las tablas.
  Siembran solo catálogos neutros: 7 ángulos de ejemplo, 5 formatos, la regla genérica de reparto entre socios
  y dos filas de `crm_config` con marcadores.
- RLS activo en todo `public`; el acceso pasa por el servidor (service role) después del chequeo de rol del
  middleware. `team_members.estado = 'aprobado'` y el rol deciden todo; sin aprobación, `/pendiente`.
- `crm_config` (`sheet_sync_url`, `cron_secret`) habilita el aviso de la base al espejo de Google Sheets
  (pg_net). Con marcadores `{{…}}` el aviso queda apagado (ver `docs/integraciones.md`).

## Permisos

`lib/role-access.ts` tiene `pageRules` (qué rol entra a qué ruta) y `apiRules` (qué rol llama a qué API y con
qué método). Una pantalla o ruta nueva **tiene que** figurar ahí. Roles: CEO, Sales Manager, Manager MKT,
Contaduria, Setter, Closer, Cobranzas, CSM, Editor. Las rutas de cron e ingesta validan su propio secreto
(`hasIndependentAuth` en `middleware.ts`).

## Crons

`vercel.json` (plan Pro: frecuencias de minutos u horas) y `vercel.hobby.json` (plan Hobby: una vez por día,
copiarlo encima de `vercel.json`). Todas las rutas de cron exigen `Authorization: Bearer <CRON_SECRET>` y se
saltean solas si falta la clave de su integración.

## Trampas conocidas

- **Zona horaria**: la plantilla asume hora de Argentina (UTC-3, `America/Argentina/Buenos_Aires` o `-03:00`)
  para interpretar fechas sin zona (por ejemplo `fecha_closer`) y para calcular "hoy". Aparece en unos 20 archivos
  (`grep -rlE "\-03:00|America/Argentina" app lib components`). Si la operación está en otra zona, cambiá esos
  puntos juntos.
- **Semanas del mes**: Métricas divide el mes en semanas de lunes a domingo con `lib/semanas.ts` (si la primera o
  la última quedan de 2 días o menos, se suman a la vecina). Si tu operación usa otro corte, cambialo ahí.
- **Teléfonos**: `lib/crm-phone.ts` y la migración `20260825000001` normalizan números de Argentina (54/549) para
  unificar personas duplicadas. Con otros países no se rompe nada, pero no hay esa unificación.
- **Content-Security-Policy** en `next.config.mjs`. `upgrade-insecure-requests` solo en https. Si agregás un
  script externo, sumá su dominio ahí. `/panel/index.html` y `/radar/index.html` tienen su propia CSP.
- **`/panel/*` y `/radar` son HTML estáticos** embebidos por iframe. El panel carga `/api/panel/datos` como
  `<script>` (arma `DATOS` desde agendas y pagos con `lib/panel-negocio.ts`, o devuelve el demo de
  `public/panel/datos.js` si el CRM está vacío).
- **`sistema/*` son maquetas** con datos ficticios (`components/os/data.ts`) y lo dicen en pantalla.
- **sharp** reduce imágenes del Radar en local; en Vercel no siempre carga (módulo nativo con pnpm) y el Radar
  guarda las imágenes sin reducir.
- **El primer usuario** se crea con `node scripts/instalar.mjs --usuario …` (o `scripts/crear-usuario.mjs`).

## Verificar antes de decir que está listo

```bash
node scripts/verificar-requisitos.mjs      # requisitos (herramientas, MCP, claves)
npx tsc --noEmit                           # tipos
npx pnpm lint                              # 0 errores (hay advertencias heredadas)
npx pnpm build                             # compila las 56 pantallas y 83 rutas
npx pnpm dev                               # y abrir: /login → Home → Agendas → Pagos → Contenido
```

Cero errores de consola en el navegador; en la Home aparecen los KPIs (en cero si no hay datos) y el raíl con los
grupos del rol.
