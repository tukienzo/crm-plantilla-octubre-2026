# Instrucciones para agentes de IA (Codex, OpenClaw, Cursor, Gemini CLI, Claude Code y otros)

Este repositorio es una **plantilla de CRM** (Next.js 16 + Supabase + Vercel) que un agente instala para una
persona que no programa. Antes de hacer cualquier cosa, leé [`EMPEZA-ACA.md`](EMPEZA-ACA.md) entero: ahí está el
proceso completo y cómo hablarle a la persona (español rioplatense, sin jerga).

## PASO 0 — obligatorio. Si falla, no se sigue.

1. Corré `node scripts/verificar-requisitos.mjs --solo-herramientas`.
   Comprueba: git, Node 20+, GitHub CLI con sesión (`gh auth status`), Supabase CLI con sesión (o el conector MCP
   de Supabase) y Vercel CLI con sesión (`vercel whoami`).
2. Probá **cada conector MCP** llamando una herramienta de **solo lectura** (listar algo): Fathom, Google Drive,
   Gmail, Google Calendar, Sandcastles, Miro, Apify y Higgsfield. Qué llamar en cada uno y la dirección oficial de
   cada servidor: [`docs/conectores-mcp.md`](docs/conectores-mcp.md).
3. Anotá solo los que respondieron de verdad:
   `node scripts/verificar-requisitos.mjs --confirmar-mcp <ids separados por coma> --herramienta "<qué llamaste>"`.
4. Repetí el paso 1. **Si sale con código 1, PARÁ**: explicale a la persona qué falta y cómo conectarlo
   ([`REQUISITOS.md`](REQUISITOS.md)), y esperá a que lo resuelva. No instales "a medias", no saltees un conector y
   no inventes un reemplazo. Si tu cliente no soporta MCP, decilo: la instalación no puede seguir con ese cliente.

La lista exacta de requisitos (para leer por programa) está en [`requisitos.json`](requisitos.json).

## Después del PASO 0

Seguí [`EMPEZA-ACA.md`](EMPEZA-ACA.md): Supabase nuevo → migraciones (`npx supabase db push`) → `.env.local` →
`lib/negocio.ts` → usuario CEO (`node scripts/instalar.mjs --usuario …`) → Vercel con crons → verificación.

## Reglas

- Nunca uses claves, proyectos de Supabase ni proyectos de Vercel que no sean de esta instalación.
- Nunca imprimas el valor de una clave ni la escribas en un archivo que se suba al repo (`.env.local` está en
  `.gitignore`).
- La service role de Supabase nunca va en una variable `NEXT_PUBLIC_*`.
- Migraciones: en orden, una vez, sin "arreglar" la base a mano.
- Sin datos inventados en las tablas reales.
- Después de cambiar código: `npx tsc --noEmit` y `npx pnpm build` sin errores, y mirar la pantalla tocada.

El mapa técnico (estructura, permisos, variables, trampas conocidas) está en [`CLAUDE.md`](CLAUDE.md).
