-- Tareas pendientes del equipo (Panel del negocio → El equipo).
-- Cada miembro ve y tilda las suyas; el rol CEO ve y administra las de todos (se controla en /api/tareas).
-- Las tareas pueden ser de una vez, diarias o semanales. Una diaria cuenta como hecha si se tildó hoy
-- (hora argentina) y una semanal si se tildó en la semana en curso (de lunes a domingo): no hace falta
-- ningún proceso que las «reinicie». Cada tilde queda en crm_tareas_marcas, que guarda el historial.

create table if not exists public.crm_tareas (
  id uuid primary key default gen_random_uuid(),
  miembro_id bigint not null references public.team_members(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 300),
  detalle text check (detalle is null or char_length(detalle) <= 2000),
  frecuencia text not null default 'una_vez' check (frecuencia in ('una_vez', 'diaria', 'semanal')),
  vence date,
  origen text,
  origen_url text,
  hecha_at timestamptz,        -- última vez que se tildó (en las de una vez, cuándo se terminó)
  hecha_por text,
  archivada boolean not null default false,
  orden integer not null default 0,
  creada_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tareas_miembro_idx on public.crm_tareas (miembro_id, orden) where not archivada;

create table if not exists public.crm_tareas_marcas (
  id bigint generated always as identity primary key,
  tarea_id uuid not null references public.crm_tareas(id) on delete cascade,
  fecha date not null,          -- día de la tilde en hora argentina
  marcada_por text,
  created_at timestamptz not null default now(),
  unique (tarea_id, fecha)
);

create index if not exists crm_tareas_marcas_fecha_idx on public.crm_tareas_marcas (fecha);

-- Solo se accede desde el servidor con la clave de servicio: sin políticas, el acceso anónimo queda cerrado.
alter table public.crm_tareas enable row level security;
alter table public.crm_tareas_marcas enable row level security;
