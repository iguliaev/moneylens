-- A fresh local/CI Postgres built only from migrations + seeds ends up with just
-- TRUNCATE/REFERENCES/TRIGGER granted to anon/authenticated/service_role on public
-- schema tables. Prod and staging additionally have SELECT/INSERT/UPDATE/DELETE,
-- granted out-of-band (e.g. via Studio) before the baseline schema was captured, so
-- this was never recorded in a migration. Without these grants, every query from
-- those roles fails at the object-privilege level before RLS is even evaluated.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
