
-- Seed transactions. Tags are attached via the transaction_tags junction table
-- (the legacy transactions.tags / transactions.bank_account columns were dropped
-- in 20260831190631_drop_legacy_transaction_denormalized_columns.sql). Each
-- seeded transaction gets one randomly-picked tag from the same per-type pool
-- that used to populate the array literal; seeds/tags.sql guarantees those tag
-- rows exist for user@example.com.

-- Seed transactions for 'spend' type
WITH ins AS (
  INSERT INTO transactions (id, user_id, date, type, category_id, amount, notes, bank_account_id)
  SELECT
    uuid_generate_v4(),
    u.id,
    CURRENT_DATE - (random() * 365)::int,
    'spend'::transaction_type,
    c.id,
    round((random() * 1000 + 10)::numeric, 2),
    'Sample spend note ' || gs,
    ba.id
  FROM generate_series(1,33) gs
  JOIN auth.users u ON u.email = 'user@example.com'
  JOIN categories c ON c.user_id = u.id AND c.type = 'spend'::transaction_type
   CROSS JOIN LATERAL (
     SELECT id FROM public.bank_accounts
     WHERE user_id = u.id
     ORDER BY random()
     LIMIT 1
   ) ba
  ORDER BY random() LIMIT 33
  RETURNING id, user_id
)
INSERT INTO transaction_tags (transaction_id, tag_id)
SELECT ins.id, t.id
FROM ins
JOIN LATERAL (
  SELECT tg.id
  FROM public.tags tg
  WHERE tg.user_id = ins.user_id
    AND tg.name = ANY (ARRAY['groceries', 'movie', 'bus', 'doctor', 'clothes'])
  ORDER BY random()
  LIMIT 1
) t ON true;

-- Seed transactions for 'earn' type
WITH ins AS (
  INSERT INTO transactions (id, user_id, date, type, category_id, amount, notes, bank_account_id)
  SELECT
    uuid_generate_v4(),
    u.id,
    CURRENT_DATE - (random() * 365)::int,
    'earn'::transaction_type,
    c.id,
    round((random() * 1000 + 100)::numeric, 2),
    'Sample earn note ' || gs,
    ba.id
  FROM generate_series(1,33) gs
  JOIN auth.users u ON u.email = 'user@example.com'
  JOIN categories c ON c.user_id = u.id AND c.type = 'earn'::transaction_type
   CROSS JOIN LATERAL (
     SELECT id FROM public.bank_accounts
     WHERE user_id = u.id
     ORDER BY random()
     LIMIT 1
   ) ba
  ORDER BY random() LIMIT 33
  RETURNING id, user_id
)
INSERT INTO transaction_tags (transaction_id, tag_id)
SELECT ins.id, t.id
FROM ins
JOIN LATERAL (
  SELECT tg.id
  FROM public.tags tg
  WHERE tg.user_id = ins.user_id
    AND tg.name = ANY (ARRAY['salary', 'bonus', 'gift'])
  ORDER BY random()
  LIMIT 1
) t ON true;

-- Seed transactions for 'save' type
WITH ins AS (
  INSERT INTO transactions (id, user_id, date, type, category_id, amount, notes, bank_account_id)
  SELECT
    uuid_generate_v4(),
    u.id,
    CURRENT_DATE - (random() * 365)::int,
    'save'::transaction_type,
    c.id,
    round((random() * 1000 + 50)::numeric, 2),
    'Sample save note ' || gs,
    ba.id
  FROM generate_series(1,34) gs
  JOIN auth.users u ON u.email = 'user@example.com'
  JOIN categories c ON c.user_id = u.id AND c.type = 'save'::transaction_type
   CROSS JOIN LATERAL (
     SELECT id FROM public.bank_accounts
     WHERE user_id = u.id
     ORDER BY random()
     LIMIT 1
   ) ba
  ORDER BY random() LIMIT 34
  RETURNING id, user_id
)
INSERT INTO transaction_tags (transaction_id, tag_id)
SELECT ins.id, t.id
FROM ins
JOIN LATERAL (
  SELECT tg.id
  FROM public.tags tg
  WHERE tg.user_id = ins.user_id
    AND tg.name = ANY (ARRAY['investment', 'retirement', 'vacation'])
  ORDER BY random()
  LIMIT 1
) t ON true;
