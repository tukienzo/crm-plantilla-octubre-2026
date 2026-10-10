-- Banco de formatos editable. Hasta ahora los formatos de pieza vivían fijos en una constante del
-- código (OFFICIAL_FORMAT_OPTIONS) y solo se podían cambiar tocando el repositorio. Pasan a esta
-- tabla para que el admin los agregue, edite y desactive desde Contenido → Formatos, y para poder
-- guardar una referencia visual de cada uno.
create table if not exists public.crm_formatos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,             -- la etiqueta que se guarda en crm_content_assets.format
  tipo text not null default 'Reel',       -- Reel · Carrusel · Historia · Otro. Agrupa el panel de referencias
  descripcion text,                        -- cuándo se usa este formato
  referencia_url text,                     -- link a la pieza de referencia (video, imagen o post)
  notas text,
  activo boolean not null default true,    -- desactivado = no se ofrece para piezas nuevas; el histórico queda
  orden integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_formatos_activo_orden on public.crm_formatos (activo, orden, nombre);
alter table public.crm_formatos enable row level security;
revoke all on public.crm_formatos from anon;

create or replace function public.crm_formatos_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists crm_formatos_touch on public.crm_formatos;
create trigger crm_formatos_touch before update on public.crm_formatos
  for each row execute function public.crm_formatos_touch();

-- Semilla corta de ejemplo (los nombres coinciden con los que el código reconoce para clasificar
-- piezas y sugerir formatos). Agregá, editá o desactivá los tuyos desde Contenido → Formatos.
-- `on conflict do nothing` para poder re-aplicar la migración sin deshacer lo que el admin haya editado.
insert into public.crm_formatos (nombre, tipo, descripcion, orden) values
  ('TALKING HEAD', 'Reel',     'A cámara, hablando de frente.', 10),
  ('REACCIÓN',     'Reel',     'Reacción a un video, comentario o noticia.', 20),
  ('VOLUMEN',      'Reel',     'Pieza de alcance: demo de herramienta, lista o comparativa.', 30),
  ('TESTIMONIO',   'Reel',     'Un cliente contando su experiencia, sin guion.', 40),
  ('CARRUSEL',     'Carrusel', 'Carrusel educativo de slides, con paso a paso.', 50)
on conflict (nombre) do nothing;
