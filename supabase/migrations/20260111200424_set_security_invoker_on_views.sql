create or replace view "public"."transactions_earn"
WITH(security_invoker = true)
 as  SELECT t.id,
    t.user_id,
    t.date,
    t.type,
    t.category_id,
    COALESCE(t.category, c.name) AS category,
    t.bank_account_id,
    COALESCE(t.bank_account, b.name) AS bank_account,
    t.amount,
    t.tags,
    t.notes,
    t.created_at,
    t.updated_at
   FROM ((public.transactions t
     LEFT JOIN public.bank_accounts b ON ((t.bank_account_id = b.id)))
     LEFT JOIN public.categories c ON ((t.category_id = c.id)))
  WHERE (t.type = 'earn'::public.transaction_type);

create or replace view "public"."transactions_save"
WITH(security_invoker = true)
 as  SELECT t.id,
    t.user_id,
    t.date,
    t.type,
    t.category_id,
    COALESCE(t.category, c.name) AS category,
    t.bank_account_id,
    COALESCE(t.bank_account, b.name) AS bank_account,
    t.amount,
    t.tags,
    t.notes,
    t.created_at,
    t.updated_at
   FROM ((public.transactions t
     LEFT JOIN public.bank_accounts b ON ((t.bank_account_id = b.id)))
     LEFT JOIN public.categories c ON ((t.category_id = c.id)))
  WHERE (t.type = 'save'::public.transaction_type);


create or replace view "public"."transactions_spend"
WITH(security_invoker = true)
 as  SELECT t.id,
    t.user_id,
    t.date,
    t.type,
    t.category_id,
    COALESCE(t.category, c.name) AS category,
    t.bank_account_id,
    COALESCE(t.bank_account, b.name) AS bank_account,
    t.amount,
    t.tags,
    t.notes,
    t.created_at,
    t.updated_at
   FROM ((public.transactions t
     LEFT JOIN public.bank_accounts b ON ((t.bank_account_id = b.id)))
     LEFT JOIN public.categories c ON ((t.category_id = c.id)))
  WHERE (t.type = 'spend'::public.transaction_type);


create or replace view "public"."view_monthly_category_totals"
WITH(security_invoker = true)
 as  SELECT t.user_id,
    date_trunc('month'::text, (t.date)::timestamp with time zone) AS month,
    c.name AS category,
    t.type,
    sum(t.amount) AS total
   FROM (public.transactions t
     JOIN public.categories c ON ((t.category_id = c.id)))
  GROUP BY t.user_id, (date_trunc('month'::text, (t.date)::timestamp with time zone)), c.name, t.type
  ORDER BY t.user_id, (date_trunc('month'::text, (t.date)::timestamp with time zone)) DESC, c.name, t.type;


create or replace view "public"."view_monthly_totals"
WITH(security_invoker = true)
 as  SELECT user_id,
    date_trunc('month'::text, (date)::timestamp with time zone) AS month,
    type,
    sum(amount) AS total
   FROM public.transactions
  GROUP BY user_id, (date_trunc('month'::text, (date)::timestamp with time zone)), type
  ORDER BY user_id, (date_trunc('month'::text, (date)::timestamp with time zone)) DESC, type;


create or replace view "public"."view_yearly_totals"
WITH(security_invoker = true)
 as  SELECT user_id,
    date_trunc('year'::text, (date)::timestamp with time zone) AS year,
    type,
    sum(amount) AS total
   FROM public.transactions
  GROUP BY user_id, (date_trunc('year'::text, (date)::timestamp with time zone)), type
  ORDER BY user_id, (date_trunc('year'::text, (date)::timestamp with time zone)) DESC, type;


create or replace view "public"."bank_accounts_with_usage"
WITH(security_invoker = true)
 as  SELECT b.id,
    b.user_id,
    b.name,
    b.description,
    b.created_at,
    b.updated_at,
    COALESCE(u.cnt, (0)::bigint) AS in_use_count
   FROM (public.bank_accounts b
     LEFT JOIN ( SELECT transactions.user_id,
            transactions.bank_account_id,
            count(*) AS cnt
           FROM public.transactions
          WHERE (transactions.bank_account_id IS NOT NULL)
          GROUP BY transactions.user_id, transactions.bank_account_id) u ON (((u.user_id = b.user_id) AND (u.bank_account_id = b.id))));


create or replace view "public"."tags_with_usage"
WITH(security_invoker = true)
 as  SELECT g.id,
    g.user_id,
    g.name,
    g.description,
    g.created_at,
    g.updated_at,
    COALESCE(u.cnt, (0)::bigint) AS in_use_count
   FROM (public.tags g
     LEFT JOIN ( SELECT tr.user_id,
            x.tag,
            count(*) AS cnt
           FROM (public.transactions tr
             CROSS JOIN LATERAL unnest(tr.tags) x(tag))
          GROUP BY tr.user_id, x.tag) u ON (((u.user_id = g.user_id) AND (u.tag = g.name))));


create or replace view "public"."view_yearly_category_totals"
WITH(security_invoker = true)
 as  SELECT t.user_id,
    date_trunc('year'::text, (t.date)::timestamp with time zone) AS year,
    c.name AS category,
    t.type,
    sum(t.amount) AS total
   FROM (public.transactions t
     JOIN public.categories c ON ((t.category_id = c.id)))
  GROUP BY t.user_id, (date_trunc('year'::text, (t.date)::timestamp with time zone)), c.name, t.type
  ORDER BY t.user_id, (date_trunc('year'::text, (t.date)::timestamp with time zone)) DESC, c.name, t.type;


create or replace view "public"."view_yearly_totals"
WITH(security_invoker = true)
 as  SELECT user_id,
    date_trunc('year'::text, (date)::timestamp with time zone) AS year,
    type,
    sum(amount) AS total
   FROM public.transactions
  GROUP BY user_id, (date_trunc('year'::text, (date)::timestamp with time zone)), type
  ORDER BY user_id, (date_trunc('year'::text, (date)::timestamp with time zone)) DESC, type;

create or replace view "public"."categories_with_usage"
WITH(security_invoker = true)
 as  SELECT c.id,
    c.user_id,
    c.type,
    c.name,
    c.description,
    c.created_at,
    c.updated_at,
    COALESCE(u.cnt, (0)::bigint) AS in_use_count
   FROM (public.categories c
     LEFT JOIN ( SELECT transactions.user_id,
            transactions.category_id,
            count(*) AS cnt
           FROM public.transactions
          WHERE (transactions.category_id IS NOT NULL)
          GROUP BY transactions.user_id, transactions.category_id) u ON (((u.user_id = c.user_id) AND (u.category_id = c.id))));

