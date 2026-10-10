-- Suscripciones de notificaciones push del navegador (Web Push, VAPID).
-- Una fila por dispositivo/navegador que activó los avisos; el email es el del usuario logueado.
create table if not exists public.crm_push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  fallos integer not null default 0
);
create index if not exists crm_push_suscripciones_email_idx on public.crm_push_suscripciones (lower(email));
alter table public.crm_push_suscripciones enable row level security;
