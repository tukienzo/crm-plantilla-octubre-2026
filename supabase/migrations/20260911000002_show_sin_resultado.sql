-- agendas.show = null significa "sin resultado" (así lo espera el código y la conciliación con Fathom).
-- El esquema base lo había dejado NOT NULL DEFAULT false, con lo que toda agenda sin marcar parecía un no-show.
alter table public.agendas alter column show drop not null;
alter table public.agendas alter column show drop default;

-- Las importadas sin estado, sin cierre y sin motivo pasan a "sin resultado". Se pausa el aviso al espejo
-- del sheet para no reescribir muchas filas con el mismo dato, y el cursor del espejo arranca después.
alter table public.agendas disable trigger crm_sheet_webhook_agendas;
update public.agendas set show = null
  where show = false and coalesce(estado, '') = '' and not cerro and coalesce(motivo_no_cierre, '') = '';
alter table public.agendas enable trigger crm_sheet_webhook_agendas;
update public.crm_integration_assets
  set metadata = metadata || jsonb_build_object('ultimo', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'lock', null)
  where source = 'gsheet' and asset_type = 'config' and source_id = 'cursor';
