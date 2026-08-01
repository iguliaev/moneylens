-- S1: get_transaction_tags had no ownership check, allowing any authenticated user to read
-- another user's tags for a known transaction id (IDOR).
CREATE
OR REPLACE FUNCTION public.get_transaction_tags (p_transaction_id UUID) RETURNS jsonb LANGUAGE SQL STABLE SECURITY DEFINER
SET
  search_path = '' AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'description', t.description
            ) ORDER BY t.name
        ) FILTER (WHERE t.id IS NOT NULL),
        '[]'::jsonb
    )
    FROM public.transaction_tags tt
    JOIN public.tags t ON tt.tag_id = t.id
    WHERE tt.transaction_id = p_transaction_id
      AND EXISTS (
        SELECT 1 FROM public.transactions t2
        WHERE t2.id = p_transaction_id AND t2.user_id = auth.uid()
      );
$$;

-- S2: check_transaction_category_type validated the category's type but never verified the
-- category belongs to the transaction's user, allowing a transaction to reference another
-- user's category.
CREATE
OR REPLACE FUNCTION public.check_transaction_category_type () RETURNS TRIGGER LANGUAGE plpgsql
SET
  search_path = '' AS $$
DECLARE
  v_category_type public.transaction_type;
  v_category_user_id uuid;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT type, user_id INTO v_category_type, v_category_user_id
    FROM public.categories WHERE id = NEW.category_id;

    IF v_category_user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Category does not belong to the user' USING ERRCODE = '23514';
    END IF;

    IF NEW.type IS DISTINCT FROM v_category_type THEN
      RAISE EXCEPTION 'Transaction type (%) does not match category type (%)', NEW.type, v_category_type;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
