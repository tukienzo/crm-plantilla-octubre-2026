-- Vista ciudad: los contactos de ManyChat se filtran por fecha de suscripción (metadata->>'subscribed').
-- Sin índice la consulta recorre todos los contactos. Solo agrega un índice: no toca datos.
create index if not exists crm_integration_assets_mc_subscribed_idx
  on public.crm_integration_assets ((metadata->>'subscribed'))
  where source = 'manychat' and asset_type = 'subscriber';
