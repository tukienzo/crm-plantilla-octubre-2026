-- 20260925000001 · Seguimientos de leads por closer.
-- Réplica de una pestaña de seguimientos de un Google Sheet: un lead por fila, con los 10 FUP
-- como casilleros (acá cada casillero guarda además la fecha y quién lo marcó), situación, tipo de lead,
-- problema/dolor, razón para la call, link de Fathom y notas. Cada closer ve y edita solo los suyos;
-- CEO, Sales Manager y Manager MKT ven todos.
create table if not exists public.seguimientos (
  id uuid primary key default gen_random_uuid(),
  agenda_id uuid references public.agendas(id) on delete set null,
  person_id uuid references public.crm_people(id) on delete set null,
  mes text,                                   -- 'AAAA-MM' de la call (columna MES del sheet)
  nombre text not null,
  telefono text,
  instagram text,
  fecha_call timestamp,                       -- ☎️ Fecha Call
  closer text,                                -- dueño del seguimiento (primer nombre canónico)
  tuvo_call boolean,                          -- 🙋 Tuvo Call?
  situacion text,                             -- 🙎 Situación del Lead
  enviado_audio boolean not null default false,
  tipo_lead text,                             -- LEAD S/A/B/C/D
  problema_dolor text,
  fups jsonb not null default '{}'::jsonb,    -- {"1": {"hecho": true, "fecha": "2026-01-15", "por": "Ana", "nota": ""}, ...}
  etapa smallint not null default 0,          -- último FUP marcado (0 = todavía sin FUP)
  proximo_fup date,                           -- cuándo toca el próximo contacto
  razon_call text,
  transcripcion_fathom text,                  -- link o texto
  notas text,
  estado text not null default 'Activo',      -- Activo · Reagendó · Cerrado · Descartado
  creado_por text,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists seguimientos_agenda_idx on public.seguimientos (agenda_id) where agenda_id is not null;
create index if not exists seguimientos_closer_idx on public.seguimientos (lower(closer), estado);
create index if not exists seguimientos_proximo_idx on public.seguimientos (proximo_fup);
create index if not exists seguimientos_mes_idx on public.seguimientos (mes);
alter table public.seguimientos enable row level security;   -- se accede con la service role desde /api/seguimientos
drop trigger if exists seguimientos_set_updated_at on public.seguimientos;
create trigger seguimientos_set_updated_at before update on public.seguimientos for each row execute function public.crm_set_updated_at();
