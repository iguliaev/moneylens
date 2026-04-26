-- Enable Supabase Realtime for the transactions table.
--
-- REPLICA IDENTITY FULL is required so that UPDATE and DELETE events include
-- the full old row, allowing Supabase Realtime to apply RLS and the
-- user_id=eq.{userId} broadcast filter correctly.
--
-- Without this, only INSERT events would be filterable; UPDATE/DELETE payloads
-- would lack the user_id column needed to route events to the right subscriber.

ALTER TABLE public.transactions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
