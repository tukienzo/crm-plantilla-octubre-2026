-- Tareas del equipo con la interfaz de «Tareas» (Hoy · En progreso · Completadas) y la prioridad del día.
-- «En progreso» vale para el período en curso: en las diarias, si se marcó hoy; en las semanales, si se
-- marcó esta semana; en las de una vez, hasta que se terminan.
alter table public.crm_tareas add column if not exists en_progreso_desde date;
alter table public.crm_tareas add column if not exists en_progreso_por text;

-- La prioridad del día la escribe un CEO; vale la última.
create table if not exists public.crm_equipo_prioridad (
  id bigint generated always as identity primary key,
  texto text not null check (char_length(texto) between 1 and 500),
  definida_por text,
  created_at timestamptz not null default now()
);
alter table public.crm_equipo_prioridad enable row level security;
revoke all on public.crm_equipo_prioridad from anon, authenticated;
