-- Create a comprehensive view for transactions with all related data
-- This view is used for displaying transactions list in the UI with resolved names

CREATE OR REPLACE VIEW transactions_with_details
WITH(security_invoker = true)
AS 
SELECT
  t.id,
  t.user_id,
  t.date,
  t.amount,
  t.notes,
  t.type,
  t.category_id,
  c.name AS category_name,
  c.type AS category_type,
  t.bank_account_id,
  ba.name AS bank_account_name,
  t.created_at,
  t.updated_at,
  array_remove(array_agg(DISTINCT tt.tag_id ORDER BY tt.tag_id), NULL) AS tag_ids,
  array_remove(array_agg(DISTINCT tg.name ORDER BY tg.name), NULL) AS tag_names
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
LEFT JOIN bank_accounts ba ON t.bank_account_id = ba.id
LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
LEFT JOIN tags tg ON tt.tag_id = tg.id
GROUP BY t.id, t.user_id, t.date, t.amount, t.notes, t.type, 
         t.category_id, c.name, c.type, t.bank_account_id, ba.name, 
         t.created_at, t.updated_at;

-- Add comment explaining the view
COMMENT ON VIEW transactions_with_details IS 'Transactions with resolved category, bank account, and tag names for UI display';
