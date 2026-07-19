# Bulk Upload API Documentation

Technical reference for the `bulk_upload_data` RPC function.

## Function Signature

```sql
CREATE OR REPLACE FUNCTION public.bulk_upload_data(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
  -- Implementation
$$;
```

## Parameters

### `p_payload` (JSONB)

A JSON object containing optional sections for bulk data import.

**Type**: `JSONB` object with optional properties:
- `categories` (optional): Array of category objects
- `bank_accounts` (optional): Array of bank account objects
- `tags` (optional): Array of tag objects
- `transactions` (optional): Array of transaction objects

**Authentication**: Requires authenticated user (via `auth.uid()`)

## Payload Schema

### Payload Root Structure

```typescript
interface BulkUploadPayload {
  categories?: CategoryInput[];
  bank_accounts?: BankAccountInput[];
  tags?: TagInput[];
  transactions?: TransactionInput[];
}
```

### Category Input Schema

```typescript
interface CategoryInput {
  type: "earn" | "spend" | "save";  // Required
  name: string;                      // Required
  description?: string | null;       // Optional
}
```

**Constraints:**
- `type`: Must be one of the valid enum values: `earn`, `spend`, or `save`
- `name`: Max 255 characters, non-null
- Duplicate detection: `(user_id, type, name)` unique constraint
  - If duplicate exists, it's silently skipped (ON CONFLICT DO NOTHING)
- `description`: Optional, max 1000 characters

**Validation:**
- Both `type` and `name` are required for every element in the array
- If any element is missing `name` or `type`, the **whole batch** is rejected with:
  `insert_categories: one or more items are missing required fields "name" or "type"`
- If any element has an invalid `type`, the whole batch is rejected with:
  `insert_categories: invalid transaction_type: <value>`
- These are validation errors (SQLSTATE `P0001`) and are surfaced to the client with this exact
  message — see [Error Response](#error-response) below.

### Bank Account Input Schema

```typescript
interface BankAccountInput {
  name: string;                      // Required
  description?: string | null;       // Optional
}
```

**Constraints:**
- `name`: Max 255 characters, non-null
- Duplicate detection: `(user_id, name)` unique constraint
  - If duplicate exists, it's silently skipped
- `description`: Optional, max 1000 characters

**Validation:**
- `name` is required for every element in the array
- If any element is missing `name`, the **whole batch** is rejected with:
  `insert_bank_accounts: one or more items are missing required field "name"` (SQLSTATE `P0001`)

### Tag Input Schema

```typescript
interface TagInput {
  name: string;                      // Required
  description?: string | null;       // Optional
}
```

**Constraints:**
- `name`: Max 255 characters, non-null
- Duplicate detection: `(user_id, name)` unique constraint
  - If duplicate exists, it's silently skipped
- `description`: Optional, max 1000 characters

**Validation:**
- `name` is required for every element in the array
- If any element is missing `name`, the **whole batch** is rejected with:
  `insert_tags: one or more items are missing required field "name"` (SQLSTATE `P0001`)

### Transaction Input Schema

```typescript
interface TransactionInput {
  date: string;                      // Required (YYYY-MM-DD)
  type: "earn" | "spend" | "save";  // Required
  amount: number;                    // Required (positive)
  category?: string | null;          // Optional (category name)
  bank_account?: string | null;      // Optional (account name)
  tags?: string[];                   // Optional (tag names)
  notes?: string | null;             // Optional
}
```

**Constraints:**
- `date`: Cast directly to a Postgres `date` — use `YYYY-MM-DD` to avoid ambiguity. There's no
  explicit format check; a malformed value surfaces as a sanitized per-row error (see below),
  not a descriptive format message.
- `type`: Must be `earn`, `spend`, or `save`
- `amount`: Numeric. There's no positivity check today — zero/negative values are accepted.
- `category`: Must reference an existing **leaf** category (no sub-categories) of matching
  `type` for the authenticated user, or one included in the same `categories` section
- `bank_account`: Must reference an existing bank account for the authenticated user, or one
  included in the same `bank_accounts` section
- `tags`: Array of strings, each must reference an existing tag for the authenticated user, or
  one included in the same `tags` section

**Validation (per row, 1-indexed, collected into `error.details` — see
[Error Response](#error-response)):**
- `date`, `type`, and `amount` presence: `Missing required field: <field>` or
  `Missing required fields: <a>, <b>`
- Invalid `type` value: `Invalid transaction type: "<value>"`
- Category not found as a leaf for the row's type: `Category "<name>" not found as leaf for type "<type>"`
- Bank account not found: `Bank account "<name>" not found`
- Tag not found: `Tag "<name>" not found`
- Any other unexpected DB error for the row (e.g. a malformed `date`) is sanitized rather than
  passed through raw — see [Error Response](#error-response)

## Return Value

### Success Response

```json
{
  "success": true,
  "categories_inserted": 5,
  "bank_accounts_inserted": 3,
  "tags_inserted": 8,
  "transactions_inserted": 100
}
```

**Type**: `JSONB` object

**Fields:**
- `success`: Boolean, always `true` on successful completion
- `categories_inserted`: Number of categories actually inserted (duplicates skipped)
- `bank_accounts_inserted`: Number of bank accounts actually inserted
- `tags_inserted`: Number of tags actually inserted
- `transactions_inserted`: Number of transactions inserted

### Error Response

On any error, the entire operation is rolled back (atomicity guaranteed). Errors are **not**
returned inside the JSONB return value — there is no `{success: false, ...}` shape. Instead the
function raises a Postgres exception, so supabase-js resolves the call with `data: null` and a
populated `error` (a `PostgrestError`):

```typescript
const { data, error } = await supabase.rpc('bulk_upload_data', { p_payload: payload });
// on failure: data === null
// error.message — see below
// error.details — a JSON string, only populated for per-row transaction errors
// error.code    — the Postgres SQLSTATE
```

**Validation errors** (missing required fields, invalid enum values, "not found" lookups) are
raised with SQLSTATE `P0001` and pass through to the client with their exact message unchanged
— see the per-section validation messages above. These are safe, intentional, user-facing
strings.

**Per-row transaction errors**: `bulk_insert_transactions` validates each transaction
independently and, if any fail, raises a single exception for the whole call:
- `error.message`: `"Bulk insert failed with N error(s)"`
- `error.details`: a JSON **string** — call `JSON.parse(error.details)` to get an array of
  `{ index, error, sqlstate? }`, one entry per failed row (`index` is 1-indexed). `sqlstate` is
  present only when the row failed on an unexpected DB error rather than app-level validation.

**Unexpected/internal errors**: any DB error not covered by the validation above (e.g. a
constraint the app doesn't explicitly check for) is sanitized to a fixed message instead of the
raw Postgres error text, so internals like constraint names are never leaked to the client:
- For a failed transaction row, that row's `error` field in `error.details` becomes one of
  `"Duplicate entry"`, `"Referenced record not found"`, `"Value violates a constraint"`, or
  `"Row could not be inserted"` (fallback) — the real SQLSTATE is still in that row's `sqlstate`
  field.
- For anything else (the categories/bank_accounts/tags helpers, or `bulk_upload_data` itself),
  `error.message` becomes a fixed string: `"insert_categories failed"`,
  `"insert_bank_accounts failed"`, `"insert_tags failed"`, or `"bulk_upload_data failed"`. The
  original SQLSTATE is preserved on `error.code`, but no free-text detail is exposed.
- This also applies to auth failures: if `auth.uid()` is null inside `bulk_upload_data` itself,
  the client does **not** see `"Not authenticated"` verbatim — it's folded into the generic
  `"bulk_upload_data failed"` message with `error.code === '42501'`. Check `error.code` rather
  than matching on `error.message` to detect this case.

## Examples

### Example 1: Upload Categories Only

**Request:**
```typescript
const payload = {
  categories: [
    {
      type: "spend",
      name: "Groceries",
      description: "Food and household items"
    },
    {
      type: "earn",
      name: "Salary",
      description: "Monthly salary"
    }
  ]
};

const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: payload
});
```

**Response:**
```json
{
  "success": true,
  "categories_inserted": 2,
  "bank_accounts_inserted": 0,
  "tags_inserted": 0,
  "transactions_inserted": 0
}
```

### Example 2: Upload Transactions Only

**Request:**
```typescript
const payload = {
  transactions: [
    {
      date: "2025-10-15",
      type: "spend",
      amount: 45.67,
      category: "Groceries",
      bank_account: "Monzo",
      tags: ["essentials"],
      notes: "Weekly shopping"
    },
    {
      date: "2025-10-16",
      type: "earn",
      amount: 3000.00,
      category: "Salary",
      notes: "October salary"
    }
  ]
};

const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: payload
});
```

**Response:**
```json
{
  "success": true,
  "categories_inserted": 0,
  "bank_accounts_inserted": 0,
  "tags_inserted": 0,
  "transactions_inserted": 2
}
```

### Example 3: Complete Upload (All Sections)

**Request:**
```typescript
const payload = {
  categories: [
    { type: "spend", name: "Groceries" },
    { type: "earn", name: "Salary" },
    { type: "save", name: "Emergency Fund" }
  ],
  bank_accounts: [
    { name: "Monzo", description: "Primary account" },
    { name: "Revolut", description: "Travel account" }
  ],
  tags: [
    { name: "essentials" },
    { name: "work-related" }
  ],
  transactions: [
    {
      date: "2025-10-15",
      type: "spend",
      amount: 45.67,
      category: "Groceries",
      bank_account: "Monzo",
      tags: ["essentials"]
    },
    {
      date: "2025-10-16",
      type: "earn",
      amount: 3000.00,
      category: "Salary",
      bank_account: "Monzo"
    }
  ]
};

const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: payload
});
```

**Response:**
```json
{
  "success": true,
  "categories_inserted": 3,
  "bank_accounts_inserted": 2,
  "tags_inserted": 2,
  "transactions_inserted": 2
}
```

### Example 4: Empty Payload

**Request:**
```typescript
const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: {}
});
```

**Response:**
```json
{
  "success": true,
  "categories_inserted": 0,
  "bank_accounts_inserted": 0,
  "tags_inserted": 0,
  "transactions_inserted": 0
}
```

### Example 5: Validation Error (Invalid Category Type)

**Request:**
```typescript
const payload = {
  categories: [
    {
      type: "invalid",
      name: "Bad Category"
    }
  ]
};

const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: payload
});
```

**Result:**
```typescript
data === null;
error.message === 'insert_categories: invalid transaction_type: invalid';
error.code === 'P0001';
error.details === null;
```

### Example 6: Validation Error (Missing Required Field)

**Request:**
```typescript
const payload = {
  categories: [
    {
      description: "This category is missing the required 'name' field"
    }
  ]
};

const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: payload
});
```

**Result:**
```typescript
data === null;
error.message === 'insert_categories: one or more items are missing required fields "name" or "type"';
error.code === 'P0001';
error.details === null;
```

### Example 7: Per-Row Transaction Validation Error

**Request:**
```typescript
const payload = {
  transactions: [
    { type: "spend", amount: 45.67 } // missing `date`
  ]
};

const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: payload
});
```

**Result:**
```typescript
data === null;
error.message === 'Bulk insert failed with 1 error(s)';
error.code === 'P0001';

const rows = JSON.parse(error.details);
// rows === [{ index: 1, error: 'Missing required field: date' }]
```

### Example 8: Sanitized Unexpected Error

An unexpected DB error (anything not covered by the app's explicit validation) never surfaces
raw Postgres text. For a failed transaction row this looks like:

```typescript
const rows = JSON.parse(error.details);
// rows === [{ index: 3, error: 'Value violates a constraint', sqlstate: '23514' }]
```

For everything else, `error.message` is a fixed string (e.g. `'insert_categories failed'`) with
the real SQLSTATE preserved on `error.code`.

## Error Codes & Messages

`error.code` is the Postgres SQLSTATE. `P0001` is what Postgres assigns to a plain
`RAISE EXCEPTION` with no explicit `ERRCODE` — that's what every validation message below uses,
but generic/sanitized errors can also carry `P0001` in other parts of the schema, so match on
the message text (or `error.details` for per-row transaction errors), not on `error.code` alone,
except where noted.

### Authentication Errors

| Code | Message | Cause |
|---|---|---|
| `42501` | `"bulk_upload_data failed"` | `auth.uid()` returned NULL. The underlying `"Not authenticated"` text is not exposed to the client — detect this case via `error.code`, not the message. |

### Category Errors (whole batch, not per-row)

| Code | Message | Cause |
|---|---|---|
| `P0001` | `insert_categories: one or more items are missing required fields "name" or "type"` | Any element in `categories` is missing `name` and/or `type` |
| `P0001` | `insert_categories: invalid transaction_type: <value>` | Any element's `type` isn't `earn`/`spend`/`save` |
| *original code* | `"insert_categories failed"` | Any other DB error — sanitized; original SQLSTATE preserved on `error.code` |

### Bank Account Errors (whole batch, not per-row)

| Code | Message | Cause |
|---|---|---|
| `P0001` | `insert_bank_accounts: one or more items are missing required field "name"` | Any element in `bank_accounts` is missing `name` |
| *original code* | `"insert_bank_accounts failed"` | Any other DB error — sanitized |

### Tag Errors (whole batch, not per-row)

| Code | Message | Cause |
|---|---|---|
| `P0001` | `insert_tags: one or more items are missing required field "name"` | Any element in `tags` is missing `name` |
| *original code* | `"insert_tags failed"` | Any other DB error — sanitized |

### Transaction Errors (per row — read from `JSON.parse(error.details)`)

| `error` value | `sqlstate` present? | Cause |
|---|---|---|
| `Missing required field: <field>` / `Missing required fields: <a>, <b>` | no | Row is missing `date`, `type`, and/or `amount` |
| `Invalid transaction type: "<value>"` | no | Row's `type` isn't `earn`/`spend`/`save` |
| `Category "<name>" not found as leaf for type "<type>"` | no | No matching leaf category for that user/type/name |
| `Bank account "<name>" not found` | no | No matching bank account for that user/name |
| `Tag "<name>" not found` | no | No matching tag for that user/name |
| `Duplicate entry` | yes (`23505`) | Sanitized — an unhandled uniqueness conflict |
| `Referenced record not found` | yes (`23503`) | Sanitized — an unhandled foreign-key violation |
| `Value violates a constraint` | yes (`23514`) | Sanitized — e.g. the transaction's `type` doesn't match its category's `type` |
| `Row could not be inserted` | yes (other) | Sanitized fallback for any other unexpected error, e.g. a malformed `date` |

## Security Considerations

### Row-Level Security (RLS)

- Function uses `SECURITY DEFINER` to run with elevated privileges
- Only the authenticated user's data can be modified (enforced by RLS policies)
- User ID is extracted from `auth.uid()` automatically

### Data Isolation

- Each user can only see and modify their own data
- Categories, accounts, tags, and transactions are isolated per user
- No cross-user data access or leakage possible

### Atomicity & Consistency

- Entire operation is wrapped in transaction
- All changes succeed or all fail (no partial states)
- Foreign key constraints are enforced
- On any error, entire operation rolled back

## Performance Characteristics

### Benchmarks

Testing with realistic payloads:

| Operation | Records | Duration | Notes |
|---|---|---|---|
| Categories insert | 50 | ~50ms | Batch insert, ON CONFLICT checks |
| Bank accounts insert | 20 | ~20ms | Simple insert with duplicate check |
| Tags insert | 30 | ~30ms | Batch insert with duplicate check |
| Transactions insert | 1000 | ~800ms | Complex operation with FK validation |
| **Total (Complete)** | **1100 items** | **~900ms** | All sections together |

### Recommendations

**Optimal batch sizes:**
- Categories: Up to 100 per upload
- Bank accounts: Up to 50 per upload
- Tags: Up to 100 per upload
- Transactions: Up to 1000 per upload
- **Maximum file size**: 1MB

**Large imports:**
- Split imports over 10,000 transactions into multiple calls
- No need to wait between calls (function is stateless)
- Use idempotency for safety: same file can be uploaded multiple times

## Idempotency

**The function is idempotent for entities (categories, accounts, tags):**

| Section | Behavior | Result |
|---|---|---|
| Categories | ON CONFLICT DO NOTHING | Second upload skips duplicates |
| Bank Accounts | ON CONFLICT DO NOTHING | Second upload skips duplicates |
| Tags | ON CONFLICT DO NOTHING | Second upload skips duplicates |
| Transactions | Always insert | Second upload creates duplicates |

**Use case**: Safe to retry with same payload on network errors or timeout.

```javascript
// Safe to call again with identical payload
const { data, error } = await supabase.rpc('bulk_upload_data', {
  p_payload: payload
});

if (error && error.message.includes('network')) {
  // Safe retry
  const { data: retry } = await supabase.rpc('bulk_upload_data', {
    p_payload: payload
  });
}
```

## TypeScript Integration

```typescript
import { BulkUploadPayload, BulkUploadResult } from '@/providers/data-provider/types';

async function uploadData(payload: BulkUploadPayload): Promise<BulkUploadResult> {
  const { data, error } = await supabase.rpc('bulk_upload_data', {
    p_payload: payload as any,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return data as BulkUploadResult;
}
```

## Migration from `bulk_insert_transactions`

The old `bulk_insert_transactions` function accepted:
```typescript
interface BulkUploadPayload_Old {
  transactions: TransactionInput[];
}
```

The new `bulk_upload_data` function accepts:
```typescript
interface BulkUploadPayload_New {
  categories?: CategoryInput[];
  bank_accounts?: BankAccountInput[];
  tags?: TagInput[];
  transactions?: TransactionInput[];
}
```

**Migration code:**
```typescript
// Old
const { data } = await supabase.rpc('bulk_insert_transactions', {
  p_payload: { transactions: [...] }
});

// New
const { data } = await supabase.rpc('bulk_upload_data', {
  p_payload: { transactions: [...] }
});
```

Both payloads are accepted and processed identically for transactions.

## Frequently Asked Questions

**Q: What's the maximum payload size?**  
A: 1MB total file size recommended. Larger payloads will work but may timeout.

**Q: Can I partial update an entity?**  
A: No, the function only inserts. To update, use the direct table API.

**Q: Are timestamps (created_at, updated_at) set automatically?**  
A: Yes, all records get `created_at` and `updated_at` from triggers.

**Q: Can I upload without authentication?**  
A: No, `auth.uid()` must return a valid user ID.

**Q: What happens if a transaction references a non-existent category?**  
A: The upload fails atomically with a clear error message before any changes.

**Q: Can I use this for data exports?**  
A: This function only imports. Export functionality is not yet available.

---

**Last Updated**: July 19, 2026
