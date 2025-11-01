<<<<<<< HEAD
drop view if exists public.categories_with_usage;

drop view if exists public.bank_accounts_with_usage;

drop view if exists public.tags_with_usage;

drop view if exists public.view_monthly_category_totals;

drop view if exists public.view_monthly_tagged_type_totals;

drop view if exists public.view_monthly_totals;

drop view if exists public.view_tagged_type_totals;

drop view if exists public.view_yearly_category_totals;

drop view if exists public.view_yearly_tagged_type_totals;

drop view if exists public.view_yearly_totals;

=======
>>>>>>> 44c319f (Fix security advisor findings (#44))
create or replace view public.categories_with_usage
with (security_invoker = true) as
select
  c.id,
  c.user_id,
  c.type,
  c.name,
  c.description,
  c.created_at,
  c.updated_at,
  coalesce(u.cnt, 0)::bigint as in_use_count
from public.categories c
left join (
  select user_id, category_id, count(*)::bigint as cnt
  from public.transactions
  where category_id is not null
  group by user_id, category_id
) u
  on u.user_id = c.user_id
 and u.category_id = c.id;

comment on view public.categories_with_usage is 'Per-user categories with reference counts from transactions (in_use_count).';

create or replace view public.bank_accounts_with_usage
with (security_invoker = true) as
select
  b.id,
  b.user_id,
  b.name,
  b.description,
  b.created_at,
  b.updated_at,
  coalesce(u.cnt, 0)::bigint as in_use_count
from public.bank_accounts b
left join (
  select user_id, bank_account_id, count(*)::bigint as cnt
  from public.transactions
  where bank_account_id is not null
  group by user_id, bank_account_id
) u
  on u.user_id = b.user_id
 and u.bank_account_id = b.id;

create or replace view public.tags_with_usage
with (security_invoker = true) as
select
  g.id,
  g.user_id,
  g.name,
  g.description,
  g.created_at,
  g.updated_at,
  coalesce(u.cnt, 0)::bigint as in_use_count
from public.tags g
left join (
  select tr.user_id, x.tag, count(*)::bigint as cnt
  from public.transactions tr
  cross join lateral unnest(tr.tags) as x(tag)
  group by tr.user_id, x.tag
) u
  on u.user_id = g.user_id
 and u.tag = g.name;

comment on view public.tags_with_usage is 'Per-user tags with reference counts from transactions (in_use_count).';
<<<<<<< HEAD


create or replace view "public"."view_monthly_category_totals"
with (security_invoker = true) as
SELECT t.user_id,
    date_trunc('month'::text, (t.date)::timestamp with time zone) AS month,
    c.name AS category,
    t.type,
    sum(t.amount) AS total
   FROM (transactions t
     JOIN categories c ON ((t.category_id = c.id)))
  GROUP BY t.user_id, (date_trunc('month'::text, (t.date)::timestamp with time zone)), c.name, t.type
  ORDER BY t.user_id, (date_trunc('month'::text, (t.date)::timestamp with time zone)) DESC, c.name, t.type;


create or replace view "public"."view_monthly_tagged_type_totals"
with (security_invoker = true) as
 SELECT user_id, 
    date_trunc('month'::text, (date)::timestamp with time zone) AS month,
    type,
    tags,
    sum(amount) AS total
   FROM transactions
  GROUP BY user_id, (date_trunc('month'::text, (date)::timestamp with time zone)), type, tags;


create or replace view "public"."view_monthly_totals"
with (security_invoker = true) as
 SELECT user_id,
    date_trunc('month'::text, (date)::timestamp with time zone) AS month,
    type,
    sum(amount) AS total
   FROM transactions
  GROUP BY user_id, (date_trunc('month'::text, (date)::timestamp with time zone)), type
  ORDER BY user_id, (date_trunc('month'::text, (date)::timestamp with time zone)) DESC, type;


create or replace view "public"."view_tagged_type_totals"
with (security_invoker = true) as
 SELECT user_id,
    type,
    tags,
    sum(amount) AS total
   FROM transactions
  GROUP BY user_id, type, tags;


create or replace view "public"."view_yearly_category_totals"
with (security_invoker = true) as
 SELECT t.user_id,
    date_trunc('year'::text, (t.date)::timestamp with time zone) AS year,
    c.name AS category,
    t.type,
    sum(t.amount) AS total
   FROM (transactions t
     JOIN categories c ON ((t.category_id = c.id)))
  GROUP BY t.user_id, (date_trunc('year'::text, (t.date)::timestamp with time zone)), c.name, t.type
  ORDER BY t.user_id, (date_trunc('year'::text, (t.date)::timestamp with time zone)) DESC, c.name, t.type;


create or replace view "public"."view_yearly_tagged_type_totals"
with (security_invoker = true) as
 SELECT user_id,
    date_trunc('year'::text, (date)::timestamp with time zone) AS year,
    type,
    tags,
    sum(amount) AS total
   FROM transactions
  GROUP BY user_id, (date_trunc('year'::text, (date)::timestamp with time zone)), type, tags;


create or replace view "public"."view_yearly_totals"
with (security_invoker = true) as
 SELECT user_id,
    date_trunc('year'::text, (date)::timestamp with time zone) AS year,
    type,
    sum(amount) AS total
   FROM transactions
  GROUP BY user_id, (date_trunc('year'::text, (date)::timestamp with time zone)), type
  ORDER BY user_id, (date_trunc('year'::text, (date)::timestamp with time zone)) DESC, type;
=======
>>>>>>> 44c319f (Fix security advisor findings (#44))
