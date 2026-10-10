# Guía rápida del CRM para el equipo

Entrás con tu mail y contraseña en la dirección del CRM (la que te pasó quien lo administra). Si todavía no
tenés usuario, en la pantalla de entrada tocá **Pedir acceso**: la cuenta queda pendiente hasta que alguien con
rol CEO la apruebe en **Operaciones → Sistema → Accesos**.

## Quién ve qué

| Rol | Qué ve |
|---|---|
| CEO | Todo: Home con cash, Panel del negocio, métricas, finanzas, equipo, accesos. |
| Sales Manager | Ventas, métricas, equipo y Panel del negocio (sin finanzas). |
| Manager MKT | Marketing (Contenido, Formatos, Ángulos, Radar, YouTube, Testimonios), métricas y Panel. |
| Closer | Home con **sus** números, pipeline, sus agendas, carga de pagos, pagos, seguimientos, cobros y clientes. |
| Setter | Pipeline, agendas, seguimientos, carga de pagos, resumen de setting. |
| CSM · Cobranzas · Contaduría · Editor | Su módulo (clientes, cobros, finanzas, contenido). |

Lo que no le corresponde a un rol rebota con "Tu cuenta no tiene acceso a este módulo". Los permisos exactos
están en `lib/role-access.ts`.

## El recorrido de un lead

1. **Entra la agenda** sola desde iClosed (cada 10 minutos, si está conectado) o a mano en *Agendas → Vista de
   agendas*. Cada agenda tiene closer, setter, fecha de la llamada, calificación (LEAD S/A/B/C/D) y las respuestas
   del formulario.
2. **La llamada** se marca en el pipeline (sin eso el show-up no es real): show / no show, estado (Adentro en
   Call, Hacer Seguimiento, Agendó 2da call…), motivo de no cierre, link de la grabación.
3. **El cierre se carga en "Cargar pago"** (Pagos → Cargar pago):
   - Closer → Categoría (Front End = venta nueva, Back End = venta a un cliente que ya está) → Nombre del cliente
     (busca su agenda) → Programa → operación.
   - Pagos: fecha, monto en USD y **concepto**. Primer pago: *Fee* (guarda el lugar, no da acceso), *Venta Nueva*
     (cerró en la llamada), *Adentro en Seguimiento* (cerró después), *Venta Interna* / *Upsell*. Pagos
     siguientes: *Completó PIF*, *Adentro en Seguimiento y Post Fee*, *Cuota 1…10*, *Cuota Venta Interna*.
   - "Guardar y Cargar en CRM" crea el pago, el plan de pagos con sus cuotas, marca la agenda como cerrada y crea
     al cliente. "Copiar mensaje" arma el texto del plan para el grupo del equipo.
4. **Cuotas y cobros**: *Cobros y cuotas* muestra lo que vence, lo atrasado y quién lo tiene que cobrar. Cuando
   entra una cuota, se carga desde el mismo "Cargar pago" eligiendo el plan existente.
5. **Clientes**: se crean solos al cargar una venta. Ahí van onboarding, llamadas con CSM, estado y baja.

## Seguimientos

Ventas → Seguimientos: los leads que quedaron para seguir, por closer.

- **Cada closer ve solo sus leads**; dirección y setters ven todos y filtran por closer.
- Una fila por lead: tuvo llamada, situación, tipo de lead, dolor, **los 10 seguimientos como casilleros**,
  próximo contacto, notas y estado (Activo · Reagendó · Cerrado · Descartado).
- Cada seguimiento se abre tocándolo: fecha, hecho o preparado, nota, mensaje, link y capturas (también con Ctrl+V).
- Todo se guarda solo. Cuando el lead cierra, se carga el pago y el seguimiento pasa a Cerrado.

## Radar de contenido

Marketing → Radar. Sigue cuentas de Instagram (la propia, la competencia y referentes) y muestra qué publican,
cómo les rinde y cómo se haría esa pieza con nuestra marca. Arranca **sin cuentas**: se agregan en **Semillas**.

- **Semana** y **Grilla**: piezas del período con comentarios, views, outlier (views sobre la mediana de su
  cuenta) y score.
- **Análisis** (Claude): formato, etapa de consciencia, hook, estructura, CTA, keyword y si es recreable.
- **Generar recreación**: escribe nuestra versión (reel, carrusel, historias). **Reel → Contenido** la manda al
  pipeline como pieza con guion.
- **Cuentas**, **Guion**, **Historias**, **Comentarios**: lectura a fondo de cada cuenta, anatomía de guiones,
  historias capturadas antes de que venzan y minería de comentarios.
- Las métricas de historias ajenas no son públicas: alcance, respuestas y salidas solo existen para la cuenta propia.

Necesita `APIFY_TOKEN`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY` y, para las métricas propias, `IG_INSIGHTS_TOKEN`
+ `IG_USER_ID`.

## Embudos y métricas

Ventas → Embudos: la misma tabla para Webinar, Orgánico y Outbound, mes por mes.

- **Cierre** = cliente que entró al programa (Venta Nueva o Adentro en Seguimiento en el mes). Un fee no es cierre.
- **AOV Trato Cerrado** = lo que pagó cada cliente el día que entró. **AOV Día 1** = lo recibido el día del cierre
  sobre todos los compromisos (los que entraron + los que dejaron fee).
- **Cash collected** sale de la tabla de pagos y se atribuye al embudo de la agenda del cliente.
- **Meta Ads**: inversión del mes por embudo, costo por agenda, por presentada, por cierre y retorno. Las campañas
  con "webinar" o "masterclass" en el nombre (o las palabras de `ADS_PALABRAS_WEBINAR`) van a Webinar, las de
  "outbound" o "prospección" a Outbound y el resto a Orgánico; se puede corregir por campaña.
- **Operaciones → Métricas** tiene el mismo corte por embudo y los botones se combinan (por ejemplo Orgánico +
  Outbound se miden como uno solo).

## Tareas del equipo

Panel del negocio → El equipo: las tareas de cada uno (Hoy · En progreso · Completadas). Tocá el círculo para
avanzarla. Las diarias y semanales vuelven solas a Hoy. Un CEO ve las de todos, asigna, edita y fija la prioridad
del día; el resto ve solo las suyas.

## Ciudad

Operaciones → Ciudad: todo el negocio como una ciudad en 3D (contenido → ManyChat → setters → agendas → closers
→ seguimiento → clientes). Cada figura es un registro real; lo que no tiene fuente dice N/D. Detalle en
`docs/ciudad.md`.

## Avisos en el celular o la compu

En **Contenido → Semanal**, **"Activar avisos"** (CEO, Sales Manager y Manager MKT): cuando un editor mueve una
pieza de Grabado → En producción o a Revisar, llega una notificación. Se activa por dispositivo. En iPhone solo
funciona con el CRM agregado a la pantalla de inicio. Necesita las claves VAPID.

## Reglas para que los números cierren

- El **concepto** del pago decide todo: cash collected, comisiones y si el cliente tiene acceso. Usá siempre el
  de la lista.
- El **monto** va en USD. Si cobraron en moneda local, cargá el equivalente en USD y el original en su campo.
- La **fecha** del pago es la del cobro, no la de la carga.
- **Nombre del cliente** igual al de la agenda (buscalo, no lo escribas de cero) para que se vincule a la misma
  persona.
- No borres pagos: se anulan (queda el rastro).
