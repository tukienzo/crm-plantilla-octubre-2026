-- Banco de ángulos editable. Los ángulos se editan, agregan y desactivan desde
-- Contenido → Banco de ángulos. El código mantiene una semilla (lib/angulos-semilla.ts)
-- como respaldo si la tabla estuviera vacía o la base no respondiera.
create table if not exists public.crm_angulos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,          -- el "N" de la etiqueta "N · título"; es la clave estable
  titulo text not null,
  dolor text not null,                     -- agrupa la rotación de Volumen (ver lib/content-volume-angle.ts)
  activo boolean not null default true,    -- desactivado = no se ofrece para contenido nuevo, pero el histórico sigue leyéndose
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_angulos_activo_numero on public.crm_angulos (activo, numero);
alter table public.crm_angulos enable row level security;
revoke all on public.crm_angulos from anon;

create or replace function public.crm_angulos_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists crm_angulos_touch on public.crm_angulos;
create trigger crm_angulos_touch before update on public.crm_angulos
  for each row execute function public.crm_angulos_touch();

-- Semilla: los mismos ángulos de ejemplo de lib/angulos-semilla.ts, por etapa de consciencia
-- (PROBLEMA / SOLUCIÓN / PRODUCTO / MENTALIDAD / VOLUMEN/TOFU). Reemplazalos por los tuyos desde la
-- pantalla. Si ya existe el número, no se pisa (se puede re-aplicar sin deshacer ediciones).
insert into public.crm_angulos (numero, titulo, dolor) values
  (1, 'EL PROBLEMA PRINCIPAL DE TU CLIENTE', 'PROBLEMA'),
  (2, 'LO QUE YA PROBÓ Y NO LE FUNCIONÓ',    'PROBLEMA'),
  (3, 'EL CAMINO PASO A PASO',               'SOLUCIÓN'),
  (4, 'CASO DE ÉXITO',                       'PRODUCTO'),
  (5, 'CÓMO ES TRABAJAR CON NOSOTROS',       'PRODUCTO'),
  (6, 'MI HISTORIA',                         'MENTALIDAD'),
  (7, 'HERRAMIENTAS Y RECURSOS',             'VOLUMEN/TOFU')
on conflict (numero) do nothing;
