-- Videos largos de YouTube: los que están en producción (idea → guion → grabado → edición →
-- miniatura → listo) y los ya publicados, que se traen del canal con la YouTube Data API.
-- Los clips de cada video NO viven acá: son piezas de contenido normales en crm_content_assets
-- con metadata.youtube_video_id apuntando a este id, así entran en el pipeline y se asignan
-- a un editor como cualquier otra pieza.
create table if not exists public.crm_youtube_videos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  estado text not null default 'idea',       -- idea · guion · grabado · edicion · miniatura · listo · publicado
  descripcion text,
  notas text,
  guion_url text,                            -- documento del guion
  miniatura_url text,                        -- imagen de la miniatura (o la que trae YouTube)
  video_url text,                            -- archivo/borrador en Drive, o el link publicado
  youtube_id text unique,                    -- id del video en YouTube cuando ya está publicado
  publicado_at timestamptz,
  duracion_seg integer,
  vistas integer,
  likes integer,
  comentarios integer,
  responsable text,
  fecha_objetivo date,
  origen text not null default 'crm',        -- crm (lo creamos acá) · youtube (vino del canal)
  stats_at timestamptz,                      -- última vez que se refrescaron las métricas
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_youtube_videos_estado on public.crm_youtube_videos (estado, coalesce(publicado_at, created_at) desc);
alter table public.crm_youtube_videos enable row level security;
revoke all on public.crm_youtube_videos from anon;

create or replace function public.crm_youtube_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists crm_youtube_touch on public.crm_youtube_videos;
create trigger crm_youtube_touch before update on public.crm_youtube_videos
  for each row execute function public.crm_youtube_touch();

-- Los clips se buscan por este campo dentro del metadata de la pieza.
create index if not exists crm_content_assets_youtube on public.crm_content_assets ((metadata->>'youtube_video_id'));
