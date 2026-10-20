# Database design

PostgreSQL 16. The schema is created **only** by migrations
(`src/database/migrations`, `synchronize` is always off). Column names are
snake_case, every timestamp is `timestamptz`, and every key and constraint has
an explicit, readable name.

## ERD

```mermaid
erDiagram
    users ||--o{ sessions : "has (CASCADE)"
    users ||--o{ api_keys : "has (CASCADE)"
    users |o--o{ audit_logs : "acts in (RESTRICT)"
    products ||--o{ product_categories : "linked (CASCADE)"
    categories ||--o{ product_categories : "linked (CASCADE)"

    users {
        uuid id PK
        varchar_255 email UK "lowercase + trimmed (CHECK)"
        varchar_255 password_hash "NULL only for agents (CHECK)"
        varchar_100 name
        user_role role "super_admin | admin | user | agent"
        boolean is_active "never deleted, only deactivated"
        timestamptz created_at
        timestamptz updated_at
    }
    sessions {
        uuid id PK "= sid claim of the access token"
        uuid user_id FK
        varchar_64 refresh_token_hash UK "sha256 of the refresh secret"
        varchar_512 user_agent
        varchar_45 ip_address
        timestamptz expires_at "absolute lifetime"
        timestamptz revoked_at
        timestamptz last_used_at
        timestamptz created_at
    }
    api_keys {
        uuid id PK
        uuid user_id FK "agent users only"
        varchar_100 name
        varchar_16 key_prefix "pmk_xxxxxxxx (shown to humans)"
        varchar_64 key_hash UK "sha256 of the full key"
        timestamptz expires_at
        timestamptz revoked_at
        timestamptz last_used_at "written at most every 5 min"
        timestamptz created_at
    }
    products {
        uuid id PK
        varchar_64 sku UK "uppercase business key (CHECK)"
        varchar_200 name
        text description "max 5000"
        numeric_12_2 price ">= 0 (CHECK)"
        integer stock ">= 0 (CHECK)"
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    categories {
        uuid id PK
        varchar_100 name UK "unique on lower(name)"
        text description "max 2000"
        timestamptz created_at
        timestamptz updated_at
    }
    product_categories {
        uuid product_id PK, FK
        uuid category_id PK, FK
        timestamptz created_at "when linked"
    }
    audit_logs {
        uuid id PK
        timestamptz occurred_at
        uuid actor_id FK "NULL = anonymous"
        audit_actor_type actor_type "user | agent | anonymous"
        varchar_255 actor_email "snapshot"
        varchar_32 actor_role "snapshot"
        varchar_16 auth_method "jwt | api_key"
        varchar_64 action "e.g. category.products.add"
        audit_outcome outcome "success | denied"
        varchar_32 resource_type
        uuid resource_id
        jsonb changes "snapshot or from/to diff"
        jsonb metadata "e.g. denied route + roles"
        varchar_64 request_id "= X-Request-Id"
        varchar_45 ip_address
    }
```

## Tables

### users
| Constraint / index | Purpose |
| --- | --- |
| `PK_users` | uuid primary key (`gen_random_uuid()`) |
| `UQ_users_email` | one account per email |
| `CHK_users_email_normalized` | `email = lower(btrim(email))`, so uniqueness is effectively case-insensitive |
| `CHK_users_password_by_role` | `(role = 'agent') = (password_hash IS NULL)`: agents can never log in with a password, humans always have one |
| `UQ_users_single_super_admin` | partial unique index on `role WHERE role = 'super_admin'`: at most one super_admin |

Users are never deleted (business rule). Access is removed with `is_active = false`.

### sessions
One row per login. Its `id` is the `sid` claim of every access token issued for
it, so revoking the row invalidates those tokens immediately.
`UQ_sessions_refresh_token_hash` and `IDX_sessions_user_id` (logout-all,
deactivation). `FK_sessions_user_id ... ON DELETE CASCADE`.

### api_keys
Agent keys. Only `key_prefix` (to recognize a key) and `key_hash` (sha256, used
for lookup, `UQ_api_keys_key_hash`) are stored; the key itself is never stored.
`IDX_api_keys_user_id`, `FK_api_keys_user_id ... ON DELETE CASCADE`.

### products
| Constraint | Rule |
| --- | --- |
| `UQ_products_sku` | unique SKU |
| `CHK_products_sku_format` | `^[A-Z0-9][A-Z0-9-]{0,63}$` (the API uppercases input) |
| `CHK_products_name_not_blank` | name is not only spaces |
| `CHK_products_price_non_negative`, `CHK_products_stock_non_negative` | no negative money or stock |
| `CHK_products_description_length` | at most 5000 characters |

### categories
`UQ_categories_name_lower`: a unique **expression** index on `lower(name)`
("Keyboards" and "keyboards" conflict). It is written by hand in the migration
because TypeORM cannot express it. Also `CHK_categories_name_not_blank` and
`CHK_categories_description_length` (2000).

### product_categories (the many-to-many)
- `PK_product_categories (product_id, category_id)`: a pair can exist only once.
  As the leading column, `product_id` also serves "categories of a product".
- `IDX_product_categories_category_id`: "products of a category".
- Both FKs `ON DELETE CASCADE`: deleting a product or a category removes its
  links, never the other side.
- `created_at`: when the product was put into the category.

### audit_logs
Append-only: the trigger `TRG_audit_logs_append_only` makes every `UPDATE` and
`DELETE` fail (`audit_logs is append-only`). Indexes: `IDX_audit_logs_occurred_at`
(newest-first listing), `IDX_audit_logs_resource (resource_type, resource_id)`
("history of this product"), `IDX_audit_logs_actor_id` ("what did this agent do").
Through the API only super_admin can read it (`GET /api/audit-logs`, separation
of duties); nobody can write to it.
`FK_audit_logs_actor_id ... ON DELETE RESTRICT`: since users are never deleted,
an audit row always points to its actor. Email and role are also stored as
snapshots, so the row stays correct even if the user changes later.

## Design decisions

1. **UUID keys everywhere** (`gen_random_uuid()`, built into PostgreSQL 13+, no
   extension). Ids are not guessable or countable through the API, and a session
   id can be generated by the app before the insert (it is part of the refresh token).
2. **An explicit join entity** (`product_categories`) instead of an implicit
   `@ManyToMany`: readable constraint names, a `created_at`, and full control over
   cascades.
3. **Integrity in the database, not only in code.** Every rule that must never be
   broken (unique email/SKU/category name, non-negative price and stock, one
   super_admin, agents without passwords, append-only audit) is a constraint, so
   it also holds for concurrent requests and manual SQL. The API maps violations
   to clean errors: unique/FK → 409, check → 400.
4. **Money as `numeric(12,2)`**, passed through the API as a decimal string: no
   floating-point rounding.
5. **Additional attributes** beyond name and description: `sku` (a stable
   business key for humans and agents), `price`, `stock`, `is_active` (hide a
   product without deleting it) on products; `created_at`/`updated_at` everywhere.
6. **Hard delete for catalog data, with an audit snapshot.** Deleting a product
   or category removes it and its links (CASCADE). The full "before" state is
   kept in `audit_logs.changes`. Users, in contrast, are never deleted.
7. **Audit rows are written in the same transaction** as the change they
   describe: either both are committed or neither is (tested: a failed write
   leaves no audit row).
8. **Row locks (`SELECT … FOR UPDATE`)** on the product/category/user/session
   being changed, so concurrent changes run one after the other and the "before"
   values in the audit log are always correct.
