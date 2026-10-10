-- Las cuotas de un plan guardan también el cobro en pesos y el tipo de cambio (el código lo espera y el
-- esquema base no lo tenía): "Cargar pago" desde una cuota fallaba con "Could not find the 'cc_ars' column".
alter table public.plan_pago_items
  add column if not exists cc_ars numeric,
  add column if not exists tipo_cambio_usd numeric;
