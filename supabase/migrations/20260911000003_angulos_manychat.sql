-- Medidor de ángulos de comunicación: junta en una sola llamada lo que ManyChat etiquetó
-- (todos los contactos con sus tags) con las agendas del período y el cash de cada persona.
-- Corre en la base porque pueden ser decenas de miles de contactos con tags: traerlos por PostgREST sería inviable.
create or replace function public.crm_angulos_manychat(p_desde date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
    (select s.tags from public.crm_identities i join subs s on s.source_id = i.value
      where i.person_id = g.person_id and i.kind = 'manychat' limit 1) as tags,
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
$$;

revoke all on function public.crm_angulos_manychat(date) from public;
revoke all on function public.crm_angulos_manychat(date) from anon;
grant execute on function public.crm_angulos_manychat(date) to service_role;

-- Mensajes de los grupos de WhatsApp (los carga un bot externo, si lo usás)
create table if not exists public.crm_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  chat_name text,
  msg_id text not null,
  sender text,
  sender_name text,
  text text,
  media_type text,
  is_group boolean not null default true,
  from_me boolean not null default false,
  sent_at timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (chat_id, msg_id)
);
create index if not exists crm_whatsapp_messages_chat_sent on public.crm_whatsapp_messages (chat_id, sent_at desc);
alter table public.crm_whatsapp_messages enable row level security;
revoke all on public.crm_whatsapp_messages from anon;
