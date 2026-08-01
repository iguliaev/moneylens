-- get_transaction_tags joined tags without excluding soft-deleted rows, so a transaction
-- could show a tag that the user had already (soft-)deleted. Add the deleted_at IS NULL
-- filter used everywhere else tags are joined.
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
    JOIN public.tags t ON tt.tag_id = t.id AND t.deleted_at IS NULL
    WHERE tt.transaction_id = p_transaction_id
      AND EXISTS (
        SELECT 1 FROM public.transactions t2
        WHERE t2.id = p_transaction_id AND t2.user_id = auth.uid()
      );
$$;
