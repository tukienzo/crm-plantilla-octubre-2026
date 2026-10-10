-- Ciudad: qué publicación de Instagram es cada pieza de ManyChat (etiqueta "Formato - ÁNGULO - fecha").
-- Se vincula cruzando quién comentó cada post propio (radar_comentarios_crudos) con los contactos que tienen la
-- etiqueta. Solo agrega una tabla: no toca datos.
create table if not exists public.crm_piezas_instagram (
  etiqueta text primary key,
  radar_pieza_id text not null,
  url text,
  coincidencias integer not null,
  comentaristas integer not null,
  metodo text not null default 'comentaristas',
  actualizado timestamptz not null default now()
);
alter table public.crm_piezas_instagram enable row level security;
revoke all on public.crm_piezas_instagram from anon, authenticated;
