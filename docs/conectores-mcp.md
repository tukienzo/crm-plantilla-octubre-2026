# Conectores MCP que tiene que tener la IA que instala el CRM

La IA que instala y opera la plantilla (Claude Code, Codex, OpenClaw, Cursor, Gemini CLI u otra) tiene que tener
conectados estos conectores **antes** de empezar. Cada uno se prueba llamando una herramienta de solo lectura (listar
algo). Si alguno no responde, la instalación se frena hasta que el usuario lo conecte.

| Id | Servicio | Dirección oficial del servidor | Prueba de solo lectura |
|---|---|---|---|
| `fathom` | Fathom (grabaciones de llamadas) | `https://api.fathom.ai/mcp` | listar reuniones (`list_meetings`) o ver la identidad (`get_identity`) |
| `google-drive` | Google Drive | En Claude: conector oficial de Google Drive. En otros clientes: `https://drivemcp.googleapis.com/mcp/v1` | buscar o listar archivos recientes |
| `gmail` | Gmail | En Claude: conector oficial de Gmail. En otros clientes: `https://gmailmcp.googleapis.com/mcp/v1` | listar etiquetas (`list_labels`) |
| `google-calendar` | Google Calendar | En Claude: conector oficial de Google Calendar. En otros clientes: `https://calendarmcp.googleapis.com/mcp/v1` | listar calendarios (`list_calendars`) |
| `sandcastles` | Sandcastles (investigación de videos cortos) | `https://mcp.sandcastles.ai/` (planes Pro o superiores) | verificar la conexión o listar espacios de trabajo |
| `miro` | Miro (tableros) | `https://mcp.miro.com/` | ver el usuario conectado o buscar tableros |
| `apify` | Apify (lectura de Instagram para el Radar) | `https://mcp.apify.com` | buscar actores o ver los detalles de uno |
| `higgsfield` | Higgsfield (imágenes y videos con IA) | `https://mcp.higgsfield.ai/mcp` | una herramienta de consulta (cuenta, saldo o modelos disponibles) |
| `mcp-supabase` | Supabase (alternativa a la CLI) | `https://mcp.supabase.com/mcp` | listar proyectos |

## Cómo se conecta cada uno

- **Claude (web, escritorio y Claude Code)**: Fathom, Google Drive, Gmail y Google Calendar están en
  Configuración → Conectores como conectores oficiales (Connect y autorizar). Los demás se agregan como conector
  personalizado con la dirección de la tabla (Add custom connector) y se autorizan con la cuenta de cada servicio.
  En Claude Code también: `claude mcp add --transport http <id> <dirección>` y después `/mcp` para iniciar sesión.
  Fathom documenta para Claude Code: `claude mcp add fathom -- npx mcp-remote@latest https://api.fathom.ai/mcp`.
- **Codex, Cursor, Gemini CLI, OpenClaw y otros clientes con MCP remoto**: agregá cada dirección en la configuración
  de servidores MCP del cliente (servidor HTTP remoto) y completá el inicio de sesión (OAuth) que abre el navegador.
- **Google Drive, Gmail y Calendar fuera de Claude**: Google pide un proyecto de Google Cloud con las APIs habilitadas
  (`gcloud services enable gmailmcp.googleapis.com drivemcp.googleapis.com calendarmcp.googleapis.com`, más
  `gmail.googleapis.com`, `drive.googleapis.com` y `calendar-json.googleapis.com`), una pantalla de consentimiento
  OAuth con los permisos de lectura y un cliente OAuth. La guía oficial está en
  developers.google.com/workspace/guides/configure-mcp-servers.
- **Sandcastles**: el conector se habilita en sandcastles.ai → Settings → Connectors (descarga el paquete para el
  escritorio de Claude). Para otros clientes, la dirección es la de la tabla; si tu cliente no la acepta, el soporte
  de Sandcastles indica cómo conectarlo.
- **Miro**: si la cuenta es de una organización Enterprise, un administrador tiene que habilitar el servidor MCP
  primero. Al conectar se elige el equipo que tiene los tableros.

## Para qué sirve cada uno en la operación

- **Fathom**: leer las llamadas de venta para el análisis y el cierre diario (además de la integración por API).
- **Google Drive / Gmail / Calendar**: planillas, documentos del negocio, avisos y la agenda del equipo.
- **Sandcastles**: investigar formatos y ganchos de la competencia para Contenido y el Radar.
- **Miro**: mapas de procesos y embudos.
- **Apify**: probar los actores que usa el Radar antes de cargar la clave en el CRM.
- **Higgsfield**: portadas e imágenes para Contenido y el generador de carruseles.
- **Supabase**: aplicar migraciones y consultar la base si la CLI no está disponible.

## Confirmar la prueba

Después de probar cada conector, la IA lo anota (vale 24 horas):

```bash
node scripts/verificar-requisitos.mjs --confirmar-mcp fathom,google-drive,gmail,google-calendar,sandcastles,miro,apify,higgsfield --herramienta "<herramientas que llamó>"
node scripts/verificar-requisitos.mjs --solo-herramientas
```

Nunca confirmes un conector que no probaste: si una herramienta falla o no aparece, ese conector no está conectado.
