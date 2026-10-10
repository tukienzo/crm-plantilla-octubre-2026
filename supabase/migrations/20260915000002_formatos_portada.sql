-- La referencia de un formato es el link al reel/carrusel de ejemplo, y casi siempre es de
-- Instagram, que no deja incrustar nada. La portada es la imagen que se ve en el panel: o se sube
-- desde la compu, o se baja una vez del og:image del propio posteo. Son dos cosas distintas y por
-- eso van en dos columnas: pisar referencia_url con la imagen perdía el link al ejemplo real.
alter table public.crm_formatos add column if not exists portada_url text;
