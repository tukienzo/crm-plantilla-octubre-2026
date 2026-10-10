-- Costo por seguidor. Una fila por día (hora argentina):
--   nuevos_manychat  → contactos que ManyChat etiquetó "Nuevo Seguidor | <mes>" y se suscribieron ese día
--                      (lo carga la sincronización de contactos de ManyChat, con historia hacia atrás)
--   seguidores_total → total de seguidores de la cuenta propia al momento de la foto diaria (Apify, paso "seguidores"
--                      del Radar a las 00:05 hora argentina). La diferencia entre dos días es el crecimiento neto.
-- El gasto no se guarda acá: sale de Meta campaña por campaña (lib/ads-embudos.ts) para respetar el embudo de cada una.

create table if not exists public.crm_seguidores_dia (
  dia date primary key,
  nuevos_manychat integer,
  seguidores_total integer,
  seguidores_at timestamptz,
  actualizado timestamptz not null default now()
);

alter table public.crm_seguidores_dia enable row level security;
revoke all on public.crm_seguidores_dia from anon;
revoke all on public.crm_seguidores_dia from authenticated;
