-- Update category totals views to show "Parent / Child" format in the category
-- column, consistent with the rest of the app. Root-level categories continue
-- to show just their own name.

CREATE OR REPLACE VIEW
  public.view_monthly_category_totals
WITH
  (security_invoker = TRUE) AS
SELECT
  t.user_id,
  DATE_TRUNC('month', t.date) AS month,
  COALESCE(p.name || ' / ' || c.name, c.name) AS category,
  t.type,
  SUM(t.amount) AS total
FROM
  transactions t
  JOIN categories c ON t.category_id = c.id
  LEFT JOIN categories p ON c.parent_id = p.id
WHERE
  t.deleted_at IS NULL
GROUP BY
  t.user_id,
  DATE_TRUNC('month', t.date),
  COALESCE(p.name || ' / ' || c.name, c.name),
  t.type;


CREATE OR REPLACE VIEW
  public.view_yearly_category_totals
WITH
  (security_invoker = TRUE) AS
SELECT
  t.user_id,
  DATE_TRUNC('year', t.date) AS year,
  COALESCE(p.name || ' / ' || c.name, c.name) AS category,
  t.type,
  SUM(t.amount) AS total
FROM
  transactions t
  JOIN categories c ON t.category_id = c.id
  LEFT JOIN categories p ON c.parent_id = p.id
WHERE
  t.deleted_at IS NULL
GROUP BY
  t.user_id,
  DATE_TRUNC('year', t.date),
  COALESCE(p.name || ' / ' || c.name, c.name),
  t.type;

