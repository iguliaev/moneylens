# H2 — Atomic Transaction Tag Association Implementation Plan

> **Status: COMPLETE** — Implemented 2026-05-10 · PR [#175](https://github.com/iguliaev/moneylens/pull/175)  
> Branch: `feat/h2-atomic-transaction-tags`  
> 188 pgTAP tests pass · 17 E2E transaction tests pass

## As-Implemented Deviations from Plan

| Area | Planned | Actual |
|---|---|---|
| **pgTAP test count** | 14 (plan) / 15 (adjusted) | **21** — added 6 cross-user ownership security tests |
| **Atomicity test error code** | `23503` (FK violation) | `42501` — ownership check fires *before* INSERT, raising access denied |
| **Category/bank_account ownership** | Not mentioned | Validated against `auth.uid()` in both RPCs before any write |
| **Tag ownership** | Not mentioned | Validated against `auth.uid()` before INSERT in both RPCs |
| **`setIsLoading(false)` on success** | Not in plan | Added before `navigate()` to cleanly reset loading state |
| **Refine navigation blocking** | Not anticipated | Required `warnWhenUnsavedChanges: false` on `useForm` — Refine blocks `navigate()` when form is "dirty" and we bypass its mutation |
| **Router import** | `react-router-dom` (implicit) | `react-router` v7 — `useNavigate` must be imported from `"react-router"` |
| **Date serialisation** | Not specified | Dayjs objects detected via `typeof value.format === "function"` and serialised to `YYYY-MM-DD` |
| **E2E test structure** | One combined create+verify-on-edit test | Two separate tests: "user can create a transaction with a tag" and "user can update tags on a transaction" |

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saving tags with a transaction atomic — either the transaction and its tags both succeed, or neither does — by moving the combined insert/update into Postgres functions and sharing one `handleFinish` hook across create and edit pages.

**Architecture:** Two new `SECURITY DEFINER` Postgres functions (`create_transaction_with_tags`, `update_transaction_with_tags`) perform the transaction row write and tag association in a single DB transaction. A new shared React hook `useTransactionForm` calls the appropriate RPC, handles errors via Refine's `useNotification`, invalidates the Refine cache, and navigates to the list — replacing the duplicated `handleFinish` logic in both `create.tsx` and `edit.tsx`.

**Tech Stack:** PostgreSQL 17, pgTAP (DB tests), Supabase RPC via `@refinedev/supabase` client, React 19, Refine v4 (`useNotification`, `useNavigation`, `useInvalidate`), Ant Design 5, Playwright (E2E)

---

## File Map

| Action | File |
|---|---|
| **Create** | `supabase/migrations/20260510120000_atomic_transaction_with_tags.sql` |
| **Create** | `supabase/tests/atomic_transaction_with_tags_test.sql` |
| **Create** | `apps/web-next/src/hooks/useTransactionForm.ts` |
| **Modify** | `apps/web-next/src/hooks/index.ts` |
| **Modify** | `apps/web-next/src/pages/transactions/create.tsx` |
| **Modify** | `apps/web-next/src/pages/transactions/edit.tsx` |
| **Modify** | `apps/web-next/e2e/tests/transactions.spec.ts` |

---

### Task 1: Write failing pgTAP tests

**Files:**
- Create: `supabase/tests/atomic_transaction_with_tags_test.sql`

- [ ] **Step 1: Write the pgTAP test file**

```sql
-- supabase/tests/atomic_transaction_with_tags_test.sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Setup two test users
select tests.create_supabase_user('atomic_user1@test.com');
select tests.create_supabase_user('atomic_user2@test.com');

select tests.authenticate_as('atomic_user1@test.com');

-- Seed reference data for user1
INSERT INTO public.categories (user_id, type, name)
VALUES (auth.uid(), 'spend'::public.transaction_type, 'AtomicCat')
ON CONFLICT (user_id, type, name) DO NOTHING;

INSERT INTO public.bank_accounts (user_id, name)
VALUES (auth.uid(), 'AtomicAccount')
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.tags (user_id, name)
VALUES (auth.uid(), 'AtomicTag1'), (auth.uid(), 'AtomicTag2')
ON CONFLICT (user_id, name) DO NOTHING;

-- 1) create_transaction_with_tags function exists
SELECT has_function(
  'public', 'create_transaction_with_tags',
  ARRAY['jsonb', 'uuid[]'],
  'create_transaction_with_tags function should exist'
);

-- 2) create_transaction_with_tags returns a transaction row (no tags)
SELECT ok(
  (SELECT (public.create_transaction_with_tags(
    jsonb_build_object(
      'date', '2026-01-01',
      'type', 'spend',
      'amount', 100,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'no-tags-test'
    ),
    ARRAY[]::uuid[]
  )).id IS NOT NULL),
  'create_transaction_with_tags returns row with id'
);

-- 3) Transaction is persisted in DB
SELECT ok(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = auth.uid() AND notes = 'no-tags-test') = 1,
  'Transaction persisted in DB after create_transaction_with_tags'
);

-- 4) create with tags: both transaction and tag association are created
SELECT ok(
  (SELECT (public.create_transaction_with_tags(
    jsonb_build_object(
      'date', '2026-01-02',
      'type', 'spend',
      'amount', 200,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'with-tags-test'
    ),
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'AtomicTag1')]
  )).id IS NOT NULL),
  'create with tags: returns transaction id'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   WHERE t.user_id = auth.uid() AND t.notes = 'with-tags-test') = 1,
  'Tag association created atomically with transaction'
);

-- 5) Atomicity: invalid tag FK causes rollback — no orphan transaction
SELECT throws_ok(
  $$
    SELECT public.create_transaction_with_tags(
      jsonb_build_object(
        'date', '2026-01-03',
        'type', 'spend',
        'amount', 300,
        'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
        'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
        'notes', 'orphan-should-not-exist'
      ),
      ARRAY['00000000-0000-0000-0000-000000000000'::uuid]
    )
  $$,
  '23503',
  'Invalid tag UUID raises FK violation'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = auth.uid() AND notes = 'orphan-should-not-exist') = 0,
  'No orphan transaction left after tag FK violation'
);

-- 6) update_transaction_with_tags function exists
SELECT has_function(
  'public', 'update_transaction_with_tags',
  ARRAY['uuid', 'jsonb', 'uuid[]'],
  'update_transaction_with_tags function should exist'
);

-- Setup: create a transaction to be updated
DO $$
BEGIN
  PERFORM public.create_transaction_with_tags(
    jsonb_build_object(
      'date', '2026-01-10',
      'type', 'spend',
      'amount', 500,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'to-be-updated'
    ),
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'AtomicTag1')]
  );
END;
$$;

-- 7) update returns updated transaction
SELECT ok(
  (SELECT (public.update_transaction_with_tags(
    (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND notes = 'to-be-updated'),
    jsonb_build_object(
      'date', '2026-01-10',
      'type', 'spend',
      'amount', 999,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'updated-notes'
    ),
    ARRAY[(SELECT id FROM public.tags WHERE user_id = auth.uid() AND name = 'AtomicTag2')]
  )).amount = 999),
  'update_transaction_with_tags returns updated amount'
);

-- 8) Updated fields are persisted
SELECT ok(
  (SELECT COUNT(*) FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes' AND amount = 999) = 1,
  'Updated fields persisted in DB'
);

-- 9) Tags are replaced: AtomicTag2 is now associated
SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   JOIN public.tags tg ON tt.tag_id = tg.id
   WHERE t.user_id = auth.uid() AND t.notes = 'updated-notes' AND tg.name = 'AtomicTag2') = 1,
  'AtomicTag2 is now associated after update'
);

-- 10) Tags are replaced: AtomicTag1 is no longer associated
SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   JOIN public.tags tg ON tt.tag_id = tg.id
   WHERE t.user_id = auth.uid() AND t.notes = 'updated-notes' AND tg.name = 'AtomicTag1') = 0,
  'AtomicTag1 removed after tag replacement'
);

-- 11) update with empty tags: removes all tags
SELECT ok(
  (SELECT (public.update_transaction_with_tags(
    (SELECT id FROM public.transactions WHERE user_id = auth.uid() AND notes = 'updated-notes'),
    jsonb_build_object(
      'date', '2026-01-10', 'type', 'spend', 'amount', 999,
      'category_id', (SELECT id FROM public.categories WHERE user_id = auth.uid() AND name = 'AtomicCat'),
      'bank_account_id', (SELECT id FROM public.bank_accounts WHERE user_id = auth.uid() AND name = 'AtomicAccount'),
      'notes', 'updated-notes'
    ),
    ARRAY[]::uuid[]
  )).id IS NOT NULL),
  'update with empty tags does not error'
);

SELECT ok(
  (SELECT COUNT(*) FROM public.transaction_tags tt
   JOIN public.transactions t ON tt.transaction_id = t.id
   WHERE t.user_id = auth.uid() AND t.notes = 'updated-notes') = 0,
  'All tags removed when updated with empty array'
);

-- 12) Cross-user: update_transaction_with_tags raises exception for other user's transaction
select tests.authenticate_as('atomic_user2@test.com');

SELECT throws_like(
  $$
    SELECT public.update_transaction_with_tags(
      (SELECT id FROM public.transactions WHERE notes = 'updated-notes'),
      jsonb_build_object(
        'date', '2026-01-10', 'type', 'spend', 'amount', 1,
        'category_id', '00000000-0000-0000-0000-000000000000'::uuid,
        'bank_account_id', '00000000-0000-0000-0000-000000000000'::uuid
      ),
      ARRAY[]::uuid[]
    )
  $$,
  '%access denied%',
  'User2 cannot update User1 transaction'
);

select * from finish();
ROLLBACK;
```

- [ ] **Step 2: Run tests to confirm they fail (functions don't exist yet)**

```bash
cd /path/to/moneylens
supabase test db
```

Expected: failures for `create_transaction_with_tags` and `update_transaction_with_tags` tests (functions not found).

---

### Task 2: Create DB migration with both atomic functions

**Files:**
- Create: `supabase/migrations/20260510120000_atomic_transaction_with_tags.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260510120000_atomic_transaction_with_tags.sql

-- ============================================================
-- create_transaction_with_tags
-- Inserts a transaction and associates tags in one DB transaction.
-- Atomicity: if tag insertion fails (e.g. invalid FK), the whole operation rolls back.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_transaction_with_tags(
  p_transaction jsonb,
  p_tag_ids     uuid[]
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transaction public.transactions;
BEGIN
  -- tg_set_user_id trigger will set user_id = auth.uid() on INSERT
  INSERT INTO public.transactions (
    date, type, amount, category_id, bank_account_id, notes
  ) VALUES (
    (p_transaction->>'date')::date,
    (p_transaction->>'type')::public.transaction_type,
    (p_transaction->>'amount')::numeric,
    (p_transaction->>'category_id')::uuid,
    (p_transaction->>'bank_account_id')::uuid,
    p_transaction->>'notes'
  )
  RETURNING * INTO v_transaction;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.transaction_tags (transaction_id, tag_id)
    SELECT v_transaction.id, unnest(p_tag_ids)
    ON CONFLICT (transaction_id, tag_id) DO NOTHING;
  END IF;

  RETURN v_transaction;
END;
$$;

COMMENT ON FUNCTION public.create_transaction_with_tags IS
  'Atomically creates a transaction and sets its tag associations in one DB transaction.';

GRANT EXECUTE ON FUNCTION public.create_transaction_with_tags(jsonb, uuid[]) TO authenticated;

-- ============================================================
-- update_transaction_with_tags
-- Updates a transaction and replaces all tag associations atomically.
-- Raises 42501 if the caller does not own p_transaction_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_transaction_with_tags(
  p_transaction_id uuid,
  p_transaction    jsonb,
  p_tag_ids        uuid[]
) RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transaction public.transactions;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE id = p_transaction_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Transaction not found or access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.transactions SET
    date            = (p_transaction->>'date')::date,
    type            = (p_transaction->>'type')::public.transaction_type,
    amount          = (p_transaction->>'amount')::numeric,
    category_id     = (p_transaction->>'category_id')::uuid,
    bank_account_id = (p_transaction->>'bank_account_id')::uuid,
    notes           = p_transaction->>'notes'
  WHERE id = p_transaction_id AND user_id = auth.uid()
  RETURNING * INTO v_transaction;

  -- Replace all tag associations atomically
  DELETE FROM public.transaction_tags WHERE transaction_id = p_transaction_id;

  IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
    INSERT INTO public.transaction_tags (transaction_id, tag_id)
    SELECT p_transaction_id, unnest(p_tag_ids)
    ON CONFLICT (transaction_id, tag_id) DO NOTHING;
  END IF;

  RETURN v_transaction;
END;
$$;

COMMENT ON FUNCTION public.update_transaction_with_tags IS
  'Atomically updates a transaction and replaces all tag associations in one DB transaction.';

GRANT EXECUTE ON FUNCTION public.update_transaction_with_tags(uuid, jsonb, uuid[]) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

```bash
supabase migration up
```

Expected: `Applying migration 20260510120000_atomic_transaction_with_tags.sql... done`

- [ ] **Step 3: Run DB tests — all should pass**

```bash
supabase test db
```

Expected: all 14 tests in `atomic_transaction_with_tags_test.sql` pass; no regressions in other test files.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260510120000_atomic_transaction_with_tags.sql \
        supabase/tests/atomic_transaction_with_tags_test.sql
git commit -m "feat(db): add create_transaction_with_tags and update_transaction_with_tags RPCs

Both functions wrap the transaction write and tag associations in one
DB transaction, preventing orphaned transactions when tag saves fail.
pgTAP tests cover happy path, empty tags, FK atomicity rollback, and
cross-user access denial.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Create `useTransactionForm` hook

**Files:**
- Create: `apps/web-next/src/hooks/useTransactionForm.ts`
- Modify: `apps/web-next/src/hooks/index.ts`

- [ ] **Step 1: Write the hook**

```typescript
// apps/web-next/src/hooks/useTransactionForm.ts
import { useState } from "react";
import { useNotification, useNavigation, useInvalidate } from "@refinedev/core";
import { supabaseClient } from "../utility";

interface UseTransactionFormOptions {
  mode: "create" | "edit";
  id?: string | number;
}

interface UseTransactionFormReturn {
  handleFinish: (values: Record<string, unknown>) => Promise<void>;
  isLoading: boolean;
}

export function useTransactionForm({
  mode,
  id,
}: UseTransactionFormOptions): UseTransactionFormReturn {
  const [isLoading, setIsLoading] = useState(false);
  const { open } = useNotification();
  const { list } = useNavigation();
  const invalidate = useInvalidate();

  const handleFinish = async (values: Record<string, unknown>) => {
    const { tag_ids, ...transactionValues } = values;
    const tagIds: string[] = Array.isArray(tag_ids) ? (tag_ids as string[]) : [];

    setIsLoading(true);
    try {
      if (mode === "create") {
        const { error } = await supabaseClient.rpc(
          "create_transaction_with_tags",
          {
            p_transaction: transactionValues,
            p_tag_ids: tagIds,
          }
        );
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.rpc(
          "update_transaction_with_tags",
          {
            p_transaction_id: id as string,
            p_transaction: transactionValues,
            p_tag_ids: tagIds,
          }
        );
        if (error) throw error;
      }

      await invalidate({ resource: "transactions", invalidates: ["list", "many"] });
      list("transactions");
    } catch (err) {
      open?.({
        type: "error",
        message:
          mode === "create"
            ? "Failed to create transaction"
            : "Failed to update transaction",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return { handleFinish, isLoading };
}
```

- [ ] **Step 2: Add export to the hooks barrel**

In `apps/web-next/src/hooks/index.ts`, add at the end:

```typescript
export { useTransactionForm } from "./useTransactionForm";
```

- [ ] **Step 3: Type-check**

```bash
cd apps/web-next
npm run check-types
```

Expected: no errors.

---

### Task 4: Update `transactions/create.tsx`

**Files:**
- Modify: `apps/web-next/src/pages/transactions/create.tsx`

- [ ] **Step 1: Replace the file contents**

```typescript
import { useMemo } from "react";
import { Create, useForm, useSelect } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, DatePicker, Select, InputNumber, Input } from "antd";
import dayjs from "dayjs";
import { TRANSACTION_TYPE_OPTIONS } from "../../constants/transactionTypes";
import { useTransactionForm } from "../../hooks";

export const TransactionCreate = () => {
  const { formProps, saveButtonProps } = useForm();
  const { handleFinish, isLoading } = useTransactionForm({ mode: "create" });

  const type = Form.useWatch("type", formProps.form);

  const { selectProps: categorySelectProps } = useSelect({
    resource: "categories",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
    filters: type
      ? [{ field: "type", operator: "eq", value: type }]
      : undefined,
  });

  // TODO(M1): replace with useSelect once M1 lands
  const { query: tagsQuery } = useList({
    resource: "tags",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const tagOptions = useMemo(
    () =>
      tagsQuery.data?.data?.map((tag) => ({
        label: tag.name as string,
        value: tag.id as string,
      })) ?? [],
    [tagsQuery.data]
  );

  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    optionLabel: "name",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  return (
    <Create saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
      <Form {...formProps} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          label="Date"
          name={["date"]}
          rules={[{ required: true }]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="Type" name={["type"]} rules={[{ required: true }]}>
          <Select
            options={TRANSACTION_TYPE_OPTIONS}
            onChange={() =>
              formProps.form?.setFieldValue("category_id", undefined)
            }
          />
        </Form.Item>
        <Form.Item
          label="Category"
          name={"category_id"}
          rules={[{ required: true }]}
        >
          <Select {...categorySelectProps} />
        </Form.Item>
        <Form.Item
          label="Amount"
          name={["amount"]}
          rules={[
            { required: true },
            {
              validator: (_, value) =>
                value === null || value === undefined || value === 0
                  ? Promise.reject(new Error("Amount cannot be zero"))
                  : Promise.resolve(),
            },
          ]}
        >
          <InputNumber precision={2} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          label="Bank Account"
          name={"bank_account_id"}
          rules={[{ required: true }]}
        >
          <Select {...bankAccountSelectProps} />
        </Form.Item>
        <Form.Item label="Tags" name={"tag_ids"}>
          <Select
            mode="multiple"
            options={tagOptions}
            loading={tagsQuery.isLoading}
            placeholder="Select tags"
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)
                ?.toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </Form.Item>
        <Form.Item label="Notes" name={["notes"]}>
          <Input />
        </Form.Item>
      </Form>
    </Create>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web-next
npm run check-types
```

Expected: no errors.

---

### Task 5: Update `transactions/edit.tsx`

**Files:**
- Modify: `apps/web-next/src/pages/transactions/edit.tsx`

- [ ] **Step 1: Replace the file contents**

```typescript
import { useEffect, useMemo } from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { useList } from "@refinedev/core";
import { Form, DatePicker, Select, InputNumber, Input } from "antd";
import dayjs from "dayjs";
import {
  TRANSACTION_TYPE_OPTIONS,
  TransactionType,
} from "../../constants/transactionTypes";
import { useTransactionForm } from "../../hooks";

export const TransactionEdit = () => {
  const { formProps, saveButtonProps, query, id, formLoading } = useForm({
    meta: {
      select: "*, transaction_tags(tag_id), category:categories(id, name)",
    },
  });
  const { handleFinish, isLoading } = useTransactionForm({ mode: "edit", id });

  const transactionsData = query?.data?.data;

  const currentTagIds = useMemo(() => {
    const transactionTags =
      (transactionsData as { transaction_tags?: Array<{ tag_id: string }> })
        ?.transaction_tags ?? [];
    return transactionTags.map((tt) => tt.tag_id);
  }, [transactionsData]);

  const selectedType = Form.useWatch("type", formProps.form) as
    | TransactionType
    | undefined;

  const { selectProps: categorySelectProps, query: categoriesQuery } =
    useSelect({
      resource: "categories",
      optionLabel: "name",
      optionValue: "id",
      pagination: { mode: "off" },
      sorters: [{ field: "name", order: "asc" }],
      filters: selectedType
        ? [{ field: "type", operator: "eq", value: selectedType }]
        : [],
      queryOptions: { enabled: !!selectedType },
    });

  const { selectProps: bankAccountSelectProps } = useSelect({
    resource: "bank_accounts",
    defaultValue: transactionsData?.bank_account_id,
    optionLabel: "name",
  });

  // TODO(M1): replace with useSelect once M1 lands
  const { query: tagsQuery } = useList({
    resource: "tags",
    pagination: { mode: "off" },
    sorters: [{ field: "name", order: "asc" }],
  });

  const tagOptions = useMemo(
    () =>
      tagsQuery.data?.data?.map((tag) => ({
        label: tag.name as string,
        value: tag.id as string,
      })) ?? [],
    [tagsQuery.data]
  );

  useEffect(() => {
    if (currentTagIds.length > 0 && formProps.form) {
      formProps.form.setFieldValue("tag_ids", currentTagIds);
    }
  }, [currentTagIds, formProps.form]);

  return (
    <Edit saveButtonProps={{ ...saveButtonProps, loading: isLoading }}>
      <Form
        {...formProps}
        layout="vertical"
        onFinish={handleFinish}
        data-testid="transaction-edit-form"
        aria-busy={formLoading}
      >
        <Form.Item
          label="Date"
          name={["date"]}
          rules={[{ required: true }]}
          getValueProps={(value) => ({
            value: value ? dayjs(value) : undefined,
          })}
        >
          <DatePicker format="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item label="Type" name={["type"]} rules={[{ required: true }]}>
          <Select
            options={TRANSACTION_TYPE_OPTIONS}
            onChange={() => {
              formProps.form?.setFieldValue("category_id", undefined);
            }}
          />
        </Form.Item>
        <Form.Item
          label="Category"
          name={"category_id"}
          rules={[{ required: true }]}
        >
          <Select
            {...categorySelectProps}
            loading={categoriesQuery.isLoading}
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)
                ?.toLowerCase()
                .includes(input.toLowerCase())
            }
          />
        </Form.Item>
        <Form.Item
          label="Amount"
          name={["amount"]}
          rules={[
            { required: true },
            {
              validator: (_, value) =>
                value === null || value === undefined || value === 0
                  ? Promise.reject(new Error("Amount cannot be zero"))
                  : Promise.resolve(),
            },
          ]}
        >
          <InputNumber precision={2} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item
          label="Bank Account"
          name={"bank_account_id"}
          rules={[{ required: true }]}
        >
          <Select {...bankAccountSelectProps} />
        </Form.Item>
        <Form.Item label="Tags" name={"tag_ids"}>
          <Select
            mode="multiple"
            options={tagOptions}
            loading={tagsQuery.isLoading}
            placeholder="Select tags"
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)
                ?.toLowerCase()
                .includes(input.toLowerCase())
            }
            allowClear
          />
        </Form.Item>
        <Form.Item label="Notes" name={["notes"]}>
          <Input />
        </Form.Item>
      </Form>
    </Edit>
  );
};
```

- [ ] **Step 2: Type-check + lint**

```bash
cd apps/web-next
npm run check-types && npm run lint
```

Expected: no errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add apps/web-next/src/hooks/useTransactionForm.ts \
        apps/web-next/src/hooks/index.ts \
        apps/web-next/src/pages/transactions/create.tsx \
        apps/web-next/src/pages/transactions/edit.tsx
git commit -m "feat(frontend): extract useTransactionForm hook, call atomic RPCs

- useTransactionForm calls create_transaction_with_tags (create) or
  update_transaction_with_tags (edit) via supabaseClient.rpc
- Uses useNotification for errors, useInvalidate + useNavigation after success
- Removes duplicated handleFinish from create.tsx and edit.tsx
- Removes direct supabaseClient + message imports from both pages

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Enable and fix the skipped E2E tag test, add edit-with-tags test

**Files:**
- Modify: `apps/web-next/e2e/tests/transactions.spec.ts`

- [ ] **Step 1: Run existing transaction E2E tests to confirm baseline**

```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts
```

Expected: all currently non-skipped tests pass.

- [ ] **Step 2: Replace the skipped tag test and add an edit-with-tags test**

Find the `test.skip("user can add tags to a transaction", ...)` block and replace it — and add an edit test after — with:

```typescript
  test("user can create transaction with tag and verify tag persists on edit", async ({
    page,
  }) => {
    const date = e2eCurrentMonthDate();
    const note = `txn-tagged-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;

    await page.goto("/transactions/create");

    // Fill date
    await page.getByLabel("Date").fill(date);

    // Select type
    await page.getByRole("combobox", { name: "* Type" }).click();
    await page.getByTitle(/spend/i).click();

    // Select category
    await page.getByRole("combobox", { name: "* Category" }).click();
    await page.getByTitle(/Groceries/i).click();

    // Fill amount
    await page.getByLabel("Amount").fill("75.00");

    // Select bank account
    await page.getByRole("combobox", { name: "* Bank Account" }).click();
    await page.getByTitle(/Main Account/i).click();

    // Fill notes
    await page.getByLabel("Notes").fill(note);

    // Select a tag: open the Tags combobox, pick "essentials"
    await page.getByRole("combobox", { name: "Tags" }).click();
    await page.getByTitle("essentials").click();
    await page.keyboard.press("Escape");

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Should redirect to transactions list
    await expect(page).toHaveURL(/\/transactions(?!\/)/);

    // Navigate to the transaction's edit page to verify the tag was persisted
    const row = getTransactionRow(page, {
      note,
      date,
      category: "Groceries",
      amount: "75.00",
      bankAccount: "Main Account",
    });
    await expect(row).toBeVisible({ timeout: 10000 });

    // Click Edit on that row
    await row.getByRole("link", { name: /edit/i }).click();
    await expect(page).toHaveURL(/\/transactions\/edit\//);
    await waitForFormReady(page, "transaction-edit-form");

    // The "essentials" tag should be pre-selected in the Tags field
    await expect(
      page.locator(".ant-select-selection-item", { hasText: "essentials" })
    ).toBeVisible({ timeout: 5000 });
  });

  test("user can edit transaction to change its tags", async ({ page }) => {
    const date = e2eCurrentMonthDate();
    const note = `txn-edit-tags-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;

    // Create a transaction with "essentials" tag
    await page.goto("/transactions/create");
    await page.getByLabel("Date").fill(date);
    await page.getByRole("combobox", { name: "* Type" }).click();
    await page.getByTitle(/spend/i).click();
    await page.getByRole("combobox", { name: "* Category" }).click();
    await page.getByTitle(/Groceries/i).click();
    await page.getByLabel("Amount").fill("50.00");
    await page.getByRole("combobox", { name: "* Bank Account" }).click();
    await page.getByTitle(/Main Account/i).click();
    await page.getByLabel("Notes").fill(note);
    await page.getByRole("combobox", { name: "Tags" }).click();
    await page.getByTitle("essentials").click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/\/transactions(?!\/)/);

    // Open edit for the just-created transaction
    const row = getTransactionRow(page, {
      note,
      date,
      category: "Groceries",
      amount: "50.00",
      bankAccount: "Main Account",
    });
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("link", { name: /edit/i }).click();
    await expect(page).toHaveURL(/\/transactions\/edit\//);
    await waitForFormReady(page, "transaction-edit-form");

    // "essentials" tag should be pre-selected
    await expect(
      page.locator(".ant-select-selection-item", { hasText: "essentials" })
    ).toBeVisible({ timeout: 5000 });

    // Remove "essentials", add "monthly"
    await page
      .locator(".ant-select-selection-item", { hasText: "essentials" })
      .locator(".ant-select-selection-item-remove")
      .click();
    await page.getByRole("combobox", { name: "Tags" }).click();
    await page.getByTitle("monthly").click();
    await page.keyboard.press("Escape");

    // Save
    await page.getByRole("button", { name: /save/i }).click();
    await expect(page).toHaveURL(/\/transactions(?!\/)/);

    // Go back to edit and verify "monthly" is now selected, "essentials" is not
    const editedRow = getTransactionRow(page, {
      note,
      date,
      category: "Groceries",
      amount: "50.00",
      bankAccount: "Main Account",
    });
    await expect(editedRow).toBeVisible({ timeout: 10000 });
    await editedRow.getByRole("link", { name: /edit/i }).click();
    await expect(page).toHaveURL(/\/transactions\/edit\//);
    await waitForFormReady(page, "transaction-edit-form");

    await expect(
      page.locator(".ant-select-selection-item", { hasText: "monthly" })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.locator(".ant-select-selection-item", { hasText: "essentials" })
    ).not.toBeVisible();
  });
```

- [ ] **Step 3: Run the new E2E tests**

```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts -g "tag"
```

Expected: both new tag tests pass. If selectors need adjustment (Ant Design Select uses `combobox` role and `title` attribute for options), update them based on the actual output — do **not** change the assertions, only the selectors.

- [ ] **Step 4: Run the full transactions E2E suite**

```bash
cd apps/web-next
npm run test:e2e:ci -- e2e/tests/transactions.spec.ts
```

Expected: all tests pass, including the previously passing ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web-next/e2e/tests/transactions.spec.ts
git commit -m "test(e2e): enable and add tag persistence E2E tests for transactions

Replace skipped stub with two real tests:
1. Create with tag → verify tag pre-selected on edit page
2. Edit to swap tags → verify new tag persisted, old tag gone

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Self-Review Notes

**Spec coverage check:**

| Spec requirement | Covered in |
|---|---|
| Tags saved atomically (Option A — DB function) | Tasks 1–2 |
| No orphan transaction on tag failure (rollback) | Task 1 test 5–6, Task 2 migration |
| Remove `(result as unknown as ...)` cast | Task 4 (`create.tsx` no longer needs transaction ID) |
| Extract shared `handleFinish` to `useTransactionForm` | Task 3 |
| Use `useNotification` instead of `message.error` | Task 3 hook |
| Both `create.tsx` and `edit.tsx` use the shared hook | Tasks 4–5 |
| `supabaseClient` / `message` imports removed from pages | Tasks 4–5 |

**Placeholder check:** None. All steps contain exact file paths, complete code, and exact commands.

**Type consistency check:** `useTransactionForm` returns `{ handleFinish, isLoading }` — both create.tsx (Task 4) and edit.tsx (Task 5) destructure exactly these names.
