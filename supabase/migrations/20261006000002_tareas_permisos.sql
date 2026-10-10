-- Las tareas del equipo solo se leen y se escriben desde el servidor (/api/tareas, con la clave de servicio).
-- Además de RLS sin políticas, se les sacan los permisos a anon y authenticated, como en las migraciones
-- recientes: así ni siquiera aparecen en el esquema público de la API.
revoke all on public.crm_tareas from anon, authenticated;
revoke all on public.crm_tareas_marcas from anon, authenticated;
