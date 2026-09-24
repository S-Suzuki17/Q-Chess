-- An older installation may have the table but no configuration row.
-- Never overwrite an operator's existing maintenance/version/announcement settings.
insert into public.system_status(id,maintenance_mode) values(1,false)
on conflict(id) do nothing;
