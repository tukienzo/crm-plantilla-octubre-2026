-- crm_angulos_manychat: mismo resultado, más rápido. Antes, para cada agenda se buscaban las etiquetas del contacto
-- recorriendo todos los contactos (el CTE materializado no tiene índice) y con muchos contactos cortaba por tiempo.
-- Ahora la búsqueda va directo al contacto por el índice único (source, asset_type, source_id). Si la persona tiene dos
-- contactos de ManyChat se toma el que tiene más etiquetas (antes era uno cualquiera).
CREATE OR REPLACE FUNCTION public.crm_angulos_manychat(p_desde date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with subs as (
  select a.source_id, a.metadata->'tags' as tags, (a.metadata->>'subscribed')::timestamptz as subscribed
  from public.crm_integration_assets a
  where a.source = 'manychat' and a.asset_type = 'subscriber' and jsonb_typeof(a.metadata->'tags') = 'array'
),
tag_counts as (
  select t as tag, count(*) as leads, count(*) filter (where subscribed >= p_desde) as nuevos
  from subs, jsonb_array_elements_text(subs.tags) t
  group by t
),
ang as (
  -- tipo de ángulo por contacto (un contacto puede tener varios): sale de cualquier tag que lo nombre
  select distinct s.source_id, s.subscribed,
    case when t ~* 'soluci' then 'Solución' when t ~* 'volumen|tofu' then 'Volumen/TOFU'
         when t ~* 'producto' then 'Producto' when t ~* 'problema' then 'Problema' end as tipo
  from subs s, jsonb_array_elements_text(s.tags) t
  where t ~* 'soluci|volumen|tofu|producto|problema'
),
ang_counts as (
  select tipo, count(*) as leads, count(*) filter (where subscribed >= p_desde) as nuevos from ang where tipo is not null group by tipo
),
ag as (
  select g.id, g.person_id, g.nombre, coalesce(g.fecha_agenda, g.fecha_closer)::date as fecha, g.show, g.cerro, g.calificacion, g.fuente, g.recurso,
    (select a.metadata->'tags' from public.crm_identities i
       join public.crm_integration_assets a on a.source = 'manychat' and a.asset_type = 'subscriber' and a.source_id = i.value
      where i.person_id = g.person_id and i.kind = 'manychat' and jsonb_typeof(a.metadata->'tags') = 'array'
      order by jsonb_array_length(a.metadata->'tags') desc, a.source_id limit 1) as tags,   -- con dos contactos, el que tiene más etiquetas
    coalesce((select sum(p.monto) from public.pagos p where p.person_id = g.person_id and p.voided_at is null and p.fecha >= p_desde), 0) as cash
  from public.agendas g
  where coalesce(g.fecha_agenda, g.fecha_closer) >= p_desde and g.person_id is not null
)
select jsonb_build_object(
  'tags', (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'leads', leads, 'nuevos', nuevos) order by leads desc), '[]'::jsonb) from tag_counts where leads >= 2),
  'angulos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'leads', leads, 'nuevos', nuevos)), '[]'::jsonb) from ang_counts),
  'agendas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'person_id', person_id, 'nombre', nombre, 'fecha', fecha, 'show', show, 'cerro', cerro,
                 'calificacion', calificacion, 'fuente', fuente, 'recurso', recurso, 'tags', coalesce(tags, '[]'::jsonb), 'cash', cash)), '[]'::jsonb) from ag),
  'agendas_sin_persona', (select count(*) from public.agendas g where coalesce(g.fecha_agenda, g.fecha_closer) >= p_desde and g.person_id is null),
  'contactos', (select count(*) from subs),
  'contactos_nuevos', (select count(*) from subs where subscribed >= p_desde)
);
$function$;
