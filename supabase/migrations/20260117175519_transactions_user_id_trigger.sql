DROP TRIGGER IF EXISTS set_user_id_on_transactions ON public.transactions;
CREATE TRIGGER set_user_id_on_transactions
BEFORE INSERT ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_user_id();