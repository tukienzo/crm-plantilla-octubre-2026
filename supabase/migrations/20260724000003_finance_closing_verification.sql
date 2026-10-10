-- Separa "existe evidencia de cierre final" de "el desglose numérico está completo".
-- Un cierre puede estar verificado (hay evidencia del resultado final) aunque
-- no tenga todas las cifras para reproducir el detalle financiero.

alter table public.finance_closings
  add column if not exists closing_verified boolean not null default false,
  add column if not exists verification_source text,
  add column if not exists verification_summary text;

-- Los cierres con evidencia completa quedan verificados de entrada.
update public.finance_closings
set
  closing_verified = true,
  verification_source = coalesce(verification_source, evidence_source),
  verification_summary = coalesce(verification_summary, evidence_summary)
where evidence_level = 'completo';
