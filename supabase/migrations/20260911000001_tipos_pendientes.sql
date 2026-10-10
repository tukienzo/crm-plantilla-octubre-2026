-- 20260911000001 · Ajustes de esquema (se aplica con `node scripts/aplicar-sql.mjs <este archivo>`
-- usando un token de https://supabase.com/dashboard/account/tokens, o con `supabase db push`).
-- Los marcadores {{CRON_SECRET}} y {{APP_URL}} los completa aplicar-sql.mjs desde .env.local.
-- Si la aplicás con `supabase db push`, los marcadores quedan sin completar y el aviso al sheet
-- (punto 5) queda apagado hasta que cargues los valores reales en crm_config:
--   update public.crm_config set valor = 'https://tu-crm.example/api/sheet-sync' where clave = 'sheet_sync_url';
--   update public.crm_config set valor = '<el mismo CRON_SECRET del .env>' where clave = 'cron_secret';

-- 1) plan_pago_items.pago_id: el esquema base lo dejó uuid, pero todo el código lo
--    compara y lo asigna como text (`pago_id = payment.id::text`, `payment_id::text`). Sin esto, cargar
--    un pago que no otorgue acceso (Fee, Cuota) desde la pantalla falla con "operator does not exist: uuid = text".
alter table public.plan_pago_items drop constraint if exists plan_pago_items_pago_id_fkey;
drop trigger if exists crm_plan_item_access_after on public.plan_pago_items;  -- depende de la columna; se vuelve a crear abajo
alter table public.plan_pago_items alter column pago_id type text using pago_id::text;
create trigger crm_plan_item_access_after
after insert or update of pago_id,da_acceso,estado on public.plan_pago_items
for each row execute function public.crm_plan_item_access_after();

-- 2) fecha_agenda / fecha_closer llevan hora (timestamp sin zona).
--    Las vistas crm_data_quality_queue / crm_exception_queue dependen de la columna: se guardan, se tiran y se recrean.
do $$
declare v_calidad text; v_excepciones text;
begin
  if to_regclass('public.crm_data_quality_queue') is not null then v_calidad := pg_get_viewdef('public.crm_data_quality_queue'::regclass, true); end if;
  if to_regclass('public.crm_exception_queue') is not null then v_excepciones := pg_get_viewdef('public.crm_exception_queue'::regclass, true); end if;
  drop view if exists public.crm_exception_queue;
  drop view if exists public.crm_data_quality_queue;
  alter table public.agendas alter column fecha_agenda type timestamp using fecha_agenda::timestamp;
  alter table public.agendas alter column fecha_closer type timestamp using fecha_closer::timestamp;
  if v_calidad is not null then execute 'create view public.crm_data_quality_queue as ' || v_calidad; end if;
  if v_excepciones is not null then execute 'create view public.crm_exception_queue as ' || v_excepciones; end if;
end $$;

-- 3) Conceptos de pago que otorgan acceso al programa.
create or replace function public.crm_payment_type_grants_access(p_type text)
returns boolean language sql immutable parallel safe as $$
  select coalesce(p_type,'') = any(array[
    'Venta Nueva',
    'Venta Nueva (En Call)',
    'Venta Nueva (Post Fee)',
    'Adentro en Seguimiento',
    'Adentro en Seguimiento y Post Fee',
    'Completó PIF',
    'Completó PIF (Post Fee)',
    'Completa Total (Post Venta)',
    'Venta Interna',
    'Venta Nueva Interna',
    'Venta Nueva Interna (Post Fee)',
    'Upsell'
  ])
$$;

-- 4) La carga atómica de pago + plan: "Adentro en Seguimiento y Post Fee" no es un fee.
create or replace function public.crm_create_payment_plan_atomic(
  p_request_id text,
  p_payment jsonb,
  p_plan jsonb,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_result jsonb;
  resolved_person uuid;
  payment_id uuid;
  plan_id uuid;
  agenda_id uuid;
  client_id bigint;
  item jsonb;
  result_payload jsonb;
  is_fee boolean;
begin
  if nullif(trim(p_request_id), '') is null then
    raise exception 'request_id requerido';
  end if;
  select r.result into existing_result
  from public.crm_operation_requests r
  where r.request_id = p_request_id and r.operation = 'payment_plan';
  if existing_result is not null then return existing_result; end if;

  insert into public.crm_operation_requests(request_id,operation)
  values(p_request_id,'payment_plan')
  on conflict(request_id) do nothing;
  if not found then
    raise exception 'Operación idéntica todavía en proceso';
  end if;

  resolved_person := nullif(p_payment->>'person_id','')::uuid;
  if resolved_person is null then
    resolved_person := public.crm_resolve_person(
      p_payment->>'cliente', p_payment->>'telefono', null, 'atomic_payment'
    );
  end if;
  if resolved_person is null then raise exception 'No se pudo resolver identidad'; end if;

  insert into public.pagos(
    cliente,operacion,monto,tipo,medio_de_pago,closer,fecha,comprobante,
    fecha_alta,fecha_baja,telefono,setter,calificacion,cc_ars,ppp,fuente,
    contenido_contestado,tipo_cambio_usd,otras_comisiones,es_reactivacion,person_id
  ) values (
    nullif(p_payment->>'cliente',''), nullif(p_payment->>'operacion',''),
    nullif(p_payment->>'monto','')::numeric, nullif(p_payment->>'tipo',''),
    nullif(p_payment->>'medio_de_pago',''), nullif(p_payment->>'closer',''),
    nullif(p_payment->>'fecha','')::timestamp, nullif(p_payment->>'comprobante',''),
    nullif(p_payment->>'fecha_alta',''), nullif(p_payment->>'fecha_baja',''),
    nullif(p_payment->>'telefono',''), nullif(p_payment->>'setter',''),
    nullif(p_payment->>'calificacion',''), nullif(p_payment->>'cc_ars','')::numeric,
    nullif(p_payment->>'ppp',''), nullif(p_payment->>'fuente',''),
    nullif(p_payment->>'contenido_contestado',''), nullif(p_payment->>'tipo_cambio_usd','')::numeric,
    nullif(p_payment->>'otras_comisiones',''), coalesce((p_payment->>'es_reactivacion')::boolean,false),
    resolved_person
  ) returning id into payment_id;

  insert into public.planes_pago(
    cliente,telefono,operacion,closer,setter,calificacion,fuente,
    contenido_contestado,fecha_alta,fecha_baja,person_id
  ) values (
    nullif(p_plan->>'cliente',''), nullif(p_plan->>'telefono',''),
    nullif(p_plan->>'operacion',''), nullif(p_plan->>'closer',''),
    nullif(p_plan->>'setter',''), nullif(p_plan->>'calificacion',''),
    nullif(p_plan->>'fuente',''), nullif(p_plan->>'contenido_contestado',''),
    nullif(p_plan->>'fecha_alta','')::date, nullif(p_plan->>'fecha_baja','')::date,
    resolved_person
  ) returning id into plan_id;

  for item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into public.plan_pago_items(
      plan_id,orden,concepto,numero_cuota,monto,fecha_planeada,medio_de_pago,
      da_acceso,estado,pago_id
    ) values (
      plan_id, coalesce((item->>'orden')::integer,0), nullif(item->>'concepto',''),
      nullif(item->>'numero_cuota','')::integer, nullif(item->>'monto','')::numeric,
      nullif(item->>'fecha_planeada','')::date, nullif(item->>'medio_de_pago',''),
      coalesce((item->>'da_acceso')::boolean,false), coalesce(nullif(item->>'estado',''),'pendiente'),
      case when coalesce((item->>'use_new_payment')::boolean,false) then payment_id::text else nullif(item->>'pago_id','') end
    );
  end loop;

  agenda_id := nullif(p_payment->>'agenda_id','')::uuid;
  if agenda_id is null then
    select a.id into agenda_id from public.agendas a
    where a.person_id = resolved_person
    order by a.fecha_agenda desc nulls last, a.created_at desc
    limit 1;
  end if;
  -- solo los conceptos que EMPIEZAN con Fee (o Refuerzo de Fee) son fee: 'Adentro en Seguimiento y Post Fee' es una venta
  is_fee := coalesce(p_payment->>'tipo','') ilike 'fee%' or coalesce(p_payment->>'tipo','') ilike 'refuerzo de fee%';
  if agenda_id is not null then
    update public.agendas set
      cerro=true,
      estado=case when is_fee then 'Fee' else 'Adentro en Call' end,
      operacion=coalesce(nullif(p_payment->>'operacion',''),operacion),
      plan_de_pago=coalesce(nullif(p_payment->>'ppp',''),plan_de_pago),
      medio_de_pago=coalesce(nullif(p_payment->>'medio_de_pago',''),medio_de_pago),
      comprobante=coalesce(nullif(p_payment->>'comprobante',''),comprobante),
      cc_dia_1=coalesce(nullif(p_payment->>'monto','')::numeric,cc_dia_1),
      fecha_tc=case when not is_fee then coalesce(nullif(p_payment->>'fecha','')::timestamp,now()::timestamp) else fecha_tc end,
      fecha_baja=coalesce(nullif(p_payment->>'fecha_baja','')::timestamp,fecha_baja),
      link_fathom=coalesce(nullif(p_payment->>'link_fathom',''),link_fathom)
    where id=agenda_id and person_id=resolved_person;
  end if;

  select c.id into client_id from public.clientes c
  where c.person_id=resolved_person and c.record_status='active'
  order by c.fecha_ingreso desc nulls last, c.created_at desc limit 1;

  result_payload := jsonb_build_object(
    'success',true,'payment_id',payment_id,'plan_id',plan_id,
    'person_id',resolved_person,'agenda_id',agenda_id,'client_id',client_id
  );
  update public.crm_operation_requests
  set result=result_payload, completed_at=now() where request_id=p_request_id;
  return result_payload;
end $$;

revoke all on function public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.crm_create_payment_plan_atomic(text,jsonb,jsonb,jsonb) to service_role;


-- 5) Espejo CRM → Google Sheet: cada alta o cambio en pagos/agendas avisa al CRM (pg_net) y el CRM
--    escribe la fila en el sheet. Si pg_net no está disponible, el cron diario de Vercel hace lo mismo.
create extension if not exists pg_net with schema extensions;
-- La URL y el secreto viven en crm_config (sin acceso para anon/authenticated); el rol postgres no puede ALTER DATABASE SET.
create table if not exists public.crm_config (
  clave text primary key,
  valor text not null,
  updated_at timestamptz not null default now()
);
alter table public.crm_config enable row level security;
revoke all on public.crm_config from anon, authenticated;
insert into public.crm_config (clave, valor) values ('sheet_sync_url', '{{APP_URL}}/api/sheet-sync'), ('cron_secret', '{{CRON_SECRET}}')
on conflict (clave) do update set valor = excluded.valor, updated_at = now()
  where excluded.valor not like '%{{%';  -- no pisa valores reales con marcadores sin completar
create or replace function public.crm_sheet_webhook() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  url text;
  secreto text;
begin
  select valor into url from public.crm_config where clave = 'sheet_sync_url';
  select valor into secreto from public.crm_config where clave = 'cron_secret';
  -- Apagado mientras no esté configurado (vacío o con los marcadores {{...}} sin completar).
  if url is null or url !~ '^https?://' or url like '%{{%'
     or secreto is null or secreto = '' or secreto like '%{{%' then
    return new;
  end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secreto),
    body := jsonb_build_object('table', TG_TABLE_NAME, 'id', new.id::text, 'op', TG_OP),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  return new;
end
$$;
drop trigger if exists crm_sheet_webhook_pagos on public.pagos;
create trigger crm_sheet_webhook_pagos after insert or update on public.pagos
for each row execute function public.crm_sheet_webhook();
drop trigger if exists crm_sheet_webhook_agendas on public.agendas;
create trigger crm_sheet_webhook_agendas after insert or update on public.agendas
for each row execute function public.crm_sheet_webhook();

-- 6) Bandeja de avisos: columnas que el esquema base no trajo (las usa crm_queue_exception_notifications).
alter table public.crm_notification_outbox add column if not exists notification_key text;
alter table public.crm_notification_outbox add column if not exists channel text;
alter table public.crm_notification_outbox add column if not exists owner_name text;
alter table public.crm_notification_outbox add column if not exists title text;
alter table public.crm_notification_outbox add column if not exists body text;
alter table public.crm_notification_outbox add column if not exists available_at timestamptz;
alter table public.crm_notification_outbox add column if not exists sent_at timestamptz;
create unique index if not exists crm_notification_outbox_notification_key_idx on public.crm_notification_outbox (notification_key);
