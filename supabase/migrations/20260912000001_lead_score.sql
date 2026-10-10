-- Lead scoring automático: el tipo de lead (S/A/B/C/D) calculado con las respuestas del
-- formulario de iClosed vive aparte de la calificación que carga el closer, así nunca se pisan.
alter table public.agendas
  add column if not exists lead_score integer,
  add column if not exists lead_score_grade text,
  add column if not exists lead_score_detalle jsonb,
  add column if not exists lead_score_at timestamptz;
create index if not exists agendas_lead_score_at on public.agendas (lead_score_at);
