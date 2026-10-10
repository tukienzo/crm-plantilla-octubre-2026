-- Inversión en Meta Ads guardada en el CRM, mes por mes y campaña por campaña, con el embudo al que se le imputa.
-- La llena lib/ads-embudos.ts leyendo la Graph API (cuenta META_ADS_ACCOUNT_ID). El embudo sale del nombre de la
-- campaña (las reglas están en lib/ads-embudos.ts); si alguien lo cambia a mano desde Ventas → Embudos,
-- embudo_manual queda en true y la sincronización ya no lo pisa (tampoco en los meses siguientes).

create table if not exists public.ads_campanas_mes (
  mes text not null,                   -- 'AAAA-MM'
  campaign_id text not null,
  campaign_name text,
  objetivo text,
  embudo text not null,                -- Webinar / Orgánico / Outbound
  embudo_manual boolean not null default false,
  spend numeric not null default 0,    -- USD, como lo informa Meta
  impresiones bigint,
  clics bigint,
  alcance bigint,
  actualizado timestamptz not null default now(),
  primary key (mes, campaign_id)
);
create index if not exists ads_campanas_mes_campana on public.ads_campanas_mes (campaign_id);

-- una fila por mes sincronizado (también los meses sin gasto, para no volver a preguntarle a Meta en cada carga)
create table if not exists public.ads_meses (
  mes text primary key,
  total numeric not null default 0,
  fuente text not null default 'meta',
  actualizado timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ads_campanas_mes', 'ads_meses'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
  end loop;
end $$;
