-- De qué link salió la portada que está cargada. Sirve para dos cosas: volver a bajarla cuando se
-- cambia el reel de referencia, y no pisar nunca una portada que se subió a mano desde la compu
-- (esas quedan con portada_origen en null).
alter table public.crm_formatos add column if not exists portada_origen text;
