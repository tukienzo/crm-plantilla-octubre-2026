# Empezá acá

> **Esto es para la IA que instala el CRM** (Claude Code, Codex, OpenClaw, Cursor, Gemini CLI o la que sea), no
> para la persona. Es lo primero que tenés que leer al abrir esta carpeta. Dice cómo se instala para alguien que no
> programa y cómo le hablás.

## Quién está del otro lado

El dueño o la dueña de una operación de ventas (formación, consultoría, agencia, servicios). No programa y no tiene
por qué. Te habla en castellano y espera respuestas en castellano rioplatense, simples.

1. **No le muestres código** salvo que te lo pida. Decile qué hiciste y qué va a ver distinto.
2. **Nada de jerga.** No existen "el .env", "el middleware", "la migración". Existen "el archivo de claves",
   "la protección de acceso", "la base de datos".
3. **Preguntá poco y en tanda.** Todo lo que falte, en una sola lista numerada, con una opción por defecto en
   cada punto.

## PASO 0 — obligatorio, antes de tocar nada

Tenés que estar conectado a todas las herramientas de [`REQUISITOS.md`](REQUISITOS.md). **Si falta una, PARÁS**:
le explicás a la persona, en criollo, cómo conectarla (está en `REQUISITOS.md` y en `docs/conectores-mcp.md`) y
esperás a que te diga que está. No sigas "a medias" ni con un plan B que saltee una herramienta.

1. Corré `node scripts/verificar-requisitos.mjs --solo-herramientas`. Revisa git, Node 20+, GitHub CLI con sesión,
   Supabase CLI con sesión (o el conector MCP de Supabase) y Vercel CLI con sesión.
2. Probá **cada conector MCP** llamando una herramienta de **solo lectura** (listar algo), uno por uno: Fathom,
   Google Drive, Gmail, Google Calendar, Sandcastles, Miro, Apify y Higgsfield (y Supabase si no hay CLI). La tabla
   de `docs/conectores-mcp.md` dice qué probar en cada uno. Si tu cliente no tiene MCP o el conector no aparece en
   tus herramientas, ese conector **no está conectado**.
3. Anotá los que respondieron:
   `node scripts/verificar-requisitos.mjs --confirmar-mcp fathom,google-drive,... --herramienta "<lo que llamaste>"`.
   Nunca confirmes uno que no probaste.
4. Volvé a correr el paso 1. Si sale con código 1 (alguna ✗ obligatoria), **parás** y le pedís a la persona que
   conecte lo que falta. Recién con todo en ✓ seguís.

## PASO 1 — pedile lo que hace falta, todo junto

> Para instalarte el CRM necesito:
> 1. **Cómo se llama tu negocio** y una frase corta (va en el menú y en la pestaña del navegador).
> 2. **Tu mail y una contraseña** para el usuario dueño (rol CEO).
> 3. **Los nombres de tus closers y setters** (y si alguien ya no está, para que los registros viejos lo muestren).
> 4. **Qué vendés**: nombre del programa, precio de pago único, planes en cuotas (por ejemplo "3 cuotas de 700") y
>    cuántos meses dura.
> 5. **Tu usuario de Instagram** y la palabra clave que la gente te manda por mensaje (por ejemplo "INFO").
> 6. **En dos o tres líneas**: a quién le vendés, qué problema le resolvés y las reglas de comunicación que no
>    se negocian (lo uso para que la IA del CRM escriba como vos).
> 7. Tu meta mensual de cobro (opcional).
> 8. Qué integraciones querés prender ahora (ManyChat, iClosed, Fathom, Meta Ads, Google Sheets, YouTube, Radar):
>    para cada una te voy a pedir su clave.

## PASO 2 — instalación (en este orden, sin saltear)

1. **Dependencias**: `npx pnpm install`.
2. **Supabase nuevo**: creá un proyecto **nuevo y vacío** para esta persona (con la CLI: `npx supabase projects
   create` o desde supabase.com; con el conector MCP de Supabase, su herramienta de crear proyecto). Nunca uses un
   proyecto que ya tenga datos de otra operación.
3. **Migraciones**: `npx supabase link --project-ref <ref>` y `npx supabase db push` (o, por MCP, aplicá los
   archivos de `supabase/migrations` en orden de nombre). Tienen que entrar las 51 sin error.
4. **Archivo de claves**: copiá `.env.example` a `.env.local`, completá Supabase (URL, anon, service role, ref),
   la marca, el equipo, el programa y las claves de las integraciones elegidas. Generá los secretos:
   `node scripts/instalar.mjs --generar-secretos`.
5. **Descripción del negocio**: completá `lib/negocio.ts` (OFERTA, CLIENTE_IDEAL, MERCADO, REGLAS) con lo del
   punto 6 del PASO 1, con las palabras de la persona.
6. **Usuario CEO**: `node scripts/instalar.mjs --usuario <mail> "<contraseña>" "<Nombre Apellido>"`.
7. **Prueba local**: `npx pnpm build` y `npx pnpm dev`; abrí `http://localhost:3000`, entrá con el usuario y
   **mirá vos** la Home, Agendas, Pagos y Contenido antes de decir que está listo.
8. **Vercel**: `npx vercel link` (proyecto nuevo), cargá las mismas variables que `.env.local` con
   `npx vercel env add` (con `NEXT_PUBLIC_APP_URL` = la URL final) y publicá con `npx vercel --prod`. Si la cuenta
   es Hobby (gratis), antes copiá `vercel.hobby.json` encima de `vercel.json` (Hobby solo acepta crons diarios).
9. **Repo privado**: si la persona quiere su copia en GitHub, `gh repo create <nombre> --private --source . --push`.
10. **Verificación final**: `node scripts/verificar-requisitos.mjs` (todo) y `node scripts/instalar.mjs`. En
    producción: `/login` carga, sin sesión no se ve nada, y con el usuario CEO entra a la Home.

## PASO 3 — contale qué está viendo, en tres líneas, y ofrecé lo que sigue

> 1. **Cargar tus datos** (agendas, pagos, clientes): una planilla, un export o a mano.
> 2. **Sumar al equipo**: cada persona pide acceso desde la pantalla de entrada y vos la aprobás en Accesos.
> 3. **Prender integraciones** de a una (ManyChat, iClosed, Fathom, Meta, Radar): `docs/integraciones.md`.

Y frenás. Que elija.

## Qué se toca para cada pedido

| Si te pide… | Vas a… |
|---|---|
| "cambiá el nombre / la frase del menú" | `.env.local` → `NEXT_PUBLIC_BRAND_*`, y volver a compilar |
| "agregá un closer / setter" | `.env.local` → `NEXT_PUBLIC_CRM_CLOSERS` / `_SETTERS`; el acceso se da en Accesos |
| "este closer aparece dos veces" | `.env.local` → `NEXT_PUBLIC_CRM_ALIAS` ("apodo=Nombre;otro=Nombre") |
| "cambió el precio / tengo otro programa" | `NEXT_PUBLIC_PRECIO_BASE`, `NEXT_PUBLIC_PROGRAMA_*` o `NEXT_PUBLIC_CRM_PROGRAMAS` (JSON) |
| "la IA no escribe como yo" | `lib/negocio.ts` |
| "cambiá las comisiones o las reglas" | `app/(dashboard)/esquema-comisiones/page.tsx` y `app/(dashboard)/reglas/page.tsx` (son texto) |
| "mis ángulos de contenido" | se cargan en Contenido → Banco de ángulos (tabla `crm_angulos`), no en el código |
| "conectá ManyChat / Fathom / Meta…" | la clave en `.env.local` y en Vercel; los pasos en `docs/integraciones.md` |
| "sacá una pantalla" | el item en `components/crm-navigation.tsx` (lista `modules`) y su carpeta en `app/(dashboard)/` |

## Reglas que no se negocian

1. **Nunca reutilizar claves ni proyectos de otra operación.** Cada instalación tiene su proyecto de Supabase, su
   proyecto de Vercel y su `.env.local`. Si ves una clave que no es de esta operación, avisá y no la uses.
2. **La service role de Supabase no sale del servidor.** Nada de ponerla en una variable `NEXT_PUBLIC_*`.
3. **Las migraciones se aplican en orden y una sola vez.** Si `db push` falla, no "arreglés" la base a mano: leé
   el error, corregí la migración y volvé a correr.
4. **Cero datos inventados.** Si el CRM está vacío, está vacío. Las únicas pantallas con datos ficticios son
   "Sistema IA · maqueta" y el Panel del negocio en modo demostración, y lo dicen en pantalla.
5. **Nunca imprimas una clave** en el chat ni la pegues en un archivo que vaya al repo.

Después de cada cambio: compilá (`npx pnpm build` o al menos `npx tsc --noEmit`), abrí la pantalla que tocaste y
recién ahí avisá. El detalle técnico está en [`CLAUDE.md`](CLAUDE.md).
