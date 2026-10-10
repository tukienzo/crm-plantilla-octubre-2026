# Vista ciudad

Ruta: **Operaciones → Ciudad** (`/ciudad`), para CEO, Sales Manager y Manager MKT. Solo lectura: no escribe en el
CRM, no manda mensajes ni publica nada.

## Qué es

El embudo del negocio dibujado como un lugar. Cada pieza de contenido es una **isla** en el agua; de cada isla baja
una **cinta** a la cinta grande de **ManyChat**, que entra a **Captación**. De ahí el recorrido sigue por la fila de
arriba (Captación → Sala de espera → Setters → plaza de **Agendas**) y vuelve por la de abajo (oficinas de
**Closers** → **Seguimiento** → **Clientes** → **Formación**).

Tres reglas mandan sobre el diseño:

1. **Cada figura es un registro real.** Si un grupo tiene más gente de la que entra en el patio, se dibujan los más
   recientes (hasta 14) y el número del cartel es el total; la lista completa está en el panel (hasta 200 por grupo).
   Los paquetes que avanzan por las cintas marcan caudal, no personas, y la leyenda lo dice.
2. **Lo que no tiene fuente es N/D, nunca cero.** Una isla sin etiqueta de ManyChat muestra «leads N/D»; Formación
   dice «actividad no disponible».
3. **Solo hay modo real.** No hay datos de demostración; con el CRM vacío, la ciudad se ve vacía.

## Qué alimenta cada zona

| Zona | Qué se dibuja | Fuente |
|---|---|---|
| Islas | Una por pieza publicada en los últimos 21 días (hasta 24), color = ángulo de ManyChat | Etiquetas de pieza de ManyChat (`crm_angulos_manychat`) + piezas propias del Radar (`radar_piezas`, cuenta `NEXT_PUBLIC_BRAND_IG_HANDLE`) |
| Cintas | Contactos nuevos de los últimos 7 días cuya primera etiqueta de pieza es esa isla | `crm_integration_assets` (ManyChat) |
| Captación | Contactos nuevos de hoy, barras de los últimos 7 días | ManyChat |
| Sala de espera | Contactos de 7 días sin la etiqueta ASIGNADO y sin agenda | ManyChat + `crm_identities` + `agendas` |
| Setters | Setters del equipo (agendas hoy / 7 días, conversaciones del mes) | `team_members`, `agendas`, `metricas_manual` |
| Agendas | Una fila de sillas por closer; color = estado | `agendas` del día (`fecha_closer`) |
| Closers | Una oficina por closer con sus llamadas del día | `agendas` + `team_members` |
| Seguimiento | Leads en estado Activo o Reagendó; naranja = seguimiento vencido | `seguimientos` |
| Clientes | Los que entraron en los últimos 30 días + cuotas vencidas sin pago | `clientes`, `plan_pago_items`, `planes_pago` |
| Formación | Los clientes activos como alumnos | `clientes` (sin actividad conectada) |

Las fórmulas completas están en el **Diccionario** (botón arriba a la derecha) y salen de `DICCIONARIO` y
`ESTADOS_SILLA` en `lib/ciudad.ts`: si cambia una regla, se cambia ahí y la página la muestra sola.

## Arquitectura

- `lib/ciudad.ts` → `leerCiudad(sb, { dia, diasContenido })`: una sola lectura de todo, con service role. Si el
  cálculo de piezas (la consulta más pesada) falla dos veces, la ciudad se arma igual sin el embudo de las piezas y
  lo avisa.
- `lib/angulos-manychat.ts` → `medirAngulos(sb, dias)`: el cálculo de Ángulos, compartido con Marketing → Ángulos.
- `app/api/ciudad/route.ts` → `GET /api/ciudad?dia=AAAA-MM-DD&dias=21` (protegida por rol en `lib/role-access.ts`).
- `components/ciudad/escena.tsx` → three.js con React Three Fiber y drei: cámara ortográfica en 3/4, geometría
  simple, carteles como capas HTML, un solo tooltip compartido.
- `components/ciudad/panel.tsx` → resumen, detalle por zona con los registros exactos, diccionario.
- `components/ciudad/vista.tsx` → barra (día, ocultar nombres, pausar animación, Ciudad / Tabla / Diccionario).
  Sin WebGL, arranca en Tabla. Con «reducir movimiento» del sistema, arranca pausada.
- `components/ciudad/modelos.tsx` → modelos procedurales (personas, muebles, salas, islas) y animaciones.
- **Trampa de drei + React 19:** las capas HTML se montan recién cuando el lienzo conectó sus eventos
  (`TrasConectar`); si se crean antes, drei las recrea al conectarse y la primera queda vacía.

## Miniaturas de las islas

Cada isla muestra la miniatura del post de Instagram de esa pieza. ManyChat no guarda qué post dispara cada
automatización, así que el vínculo se arma con evidencia (`lib/ciudad-vinculos.ts`, tabla `crm_piezas_instagram`):

1. El Radar trae los posts propios con su miniatura.
2. Se baja una muestra de hasta 30 comentarios de cada post (Apify, se paga por comentario).
3. Se cruzan los que comentaron con los contactos de ManyChat que tienen cada etiqueta de pieza: gana la etiqueta con
   más comentaristas en común, a no más de 7 días del post y una sola etiqueta por post.
4. Si una pieza todavía no tiene vínculo, se usa el único post del mismo día y tipo, avisando que no está confirmado;
   si no, la placa dice «sin vista previa».

Se actualiza dos veces por día (cron del Radar, paso `vincular`). A mano: `npx tsx scripts/ciudad-miniaturas.ts esperar`.
Necesita Apify (`APIFY_TOKEN`) y la cuenta propia configurada (`NEXT_PUBLIC_BRAND_IG_HANDLE`).

## Ideas para seguir

- Estado en vivo de las llamadas (desde iClosed o Fathom) para que la silla pase a «en llamada».
- Actividad de los alumnos (comunidad o asistencia a clases) para Formación.
- Repetición del día con `crm_events` y recorrido de una persona.
- Tiempo real con Supabase Realtime (hoy la página se relee cada 5 minutos).
