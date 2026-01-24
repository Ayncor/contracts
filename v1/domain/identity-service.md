## identity-service (v1) domain model

This service owns **authentication**, **users**, **organizations**, **memberships**, **roles/permissions**, and **audit logs**.

### Global invariants

- **Tenant isolation**: any org-scoped record includes `org_id`; the API enforces that the caller is a member of the org and authorized for the operation.
- **Auth separation**: access tokens are short-lived; refresh tokens are revocable and rotated.
- **Auditability**: security-relevant and admin actions are written to `AuditLog` with stable action codes.

---

## Entities

### Organization

**Purpose**: tenant boundary / billing boundary / policy boundary.

**Fields**

- `id` (uuid, pk)
- `name` (string, required, 3..120)
- `slug` (string, required, unique, 3..60, `[a-z0-9-]+`)
- `status` (enum: `ACTIVE` | `SUSPENDED` | `DELETED`, required)
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)
- `deleted_at` (timestamp, nullable) — soft delete marker

**Constraints**

- `slug` unique among non-deleted orgs.
- `status=DELETED` implies `deleted_at` set and no new memberships can be created.

---

### User

**Purpose**: identity principal shared across org memberships.

**Fields**

- `id` (uuid, pk)
- `email` (string, required, unique, lowercased)
- `email_verified_at` (timestamp, nullable)
- `display_name` (string, required, 1..120)
- `avatar_url` (string, nullable)
- `status` (enum: `ACTIVE` | `SUSPENDED` | `DELETED`, required)
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)
- `deleted_at` (timestamp, nullable)

**Constraints**

- Users are global; membership governs org access.
- `status=DELETED` implies `deleted_at` set and refresh tokens must be revoked.

---

### Membership

**Purpose**: binds a `User` to an `Organization` with role/permissions.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `user_id` (uuid, required)
- `role_id` (uuid, nullable) — `null` means “use default org role” (optional pattern)
- `status` (enum: `ACTIVE` | `INVITED` | `SUSPENDED` | `LEFT`, required)
- `joined_at` (timestamp, nullable)
- `invited_by_user_id` (uuid, nullable)
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)

**Constraints**

- Unique `(org_id, user_id)` for non-`LEFT` memberships.
- Only one “active” membership per `(org_id, user_id)` at a time.

**Notes**

- Invitations are represented via `status=INVITED` until accepted; acceptance sets `joined_at` and flips to `ACTIVE`.

---

### Role

**Purpose**: org-scoped permission bundle.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `name` (string, required, 1..80)
- `permissions` (string[], required) — stable permission codes
- `is_system` (bool, required) — true for built-in roles (e.g. `ORG_ADMIN`)
- `created_at` (timestamp, required)
- `updated_at` (timestamp, required)

**Constraints**

- Unique `(org_id, name)` for non-deleted roles (v1 can omit deletes for roles; prefer immutability + “disabled” later).

**Recommended v1 permission codes**

- `org:read`
- `org:manage_members`
- `org:manage_roles`
- `audit:read`
- `channels:manage`
- `threads:moderate` (state transitions / archival policies)

---

### RefreshToken

**Purpose**: revocable session continuation.

**Fields**

- `id` (uuid, pk)
- `user_id` (uuid, required)
- `org_id` (uuid, required) — refresh token is scoped to an org “session context”
- `token_hash` (string, required) — store only a salted hash
- `expires_at` (timestamp, required)
- `created_at` (timestamp, required)
- `rotated_at` (timestamp, nullable)
- `revoked_at` (timestamp, nullable)
- `revoked_reason` (string, nullable)
- `device_label` (string, nullable) — “MacBook”, “Chrome on Windows”, etc.
- `ip_first_seen` (string, nullable)
- `ip_last_seen` (string, nullable)

**Constraints**

- Rotation is **one-way**: refresh calls revoke the old token and mint a new one.
- `revoked_at` implies the token is invalid.

---

### AuditLog

**Purpose**: immutable record of security/admin actions.

**Fields**

- `id` (uuid, pk)
- `org_id` (uuid, required)
- `actor_user_id` (uuid, nullable) — nullable for system actions
- `action` (string, required) — stable code, e.g. `org.member.invited`
- `target_type` (string, required) — e.g. `membership`, `role`, `org`
- `target_id` (uuid, nullable)
- `metadata_json` (json, required) — action-specific metadata (no secrets)
- `created_at` (timestamp, required)

**Constraints**

- Append-only.

---

## Authentication contract (claims)

### Access token (JWT)

- **Lifetime**: short (e.g. 10–20 minutes).
- **Claims (v1)**:
  - `sub`: `user_id`
  - `org_id`: active organization context
  - `member_id`: membership id in that org (optional but useful)
  - `roles` or `perms`: either role names or flattened permissions (prefer flattened `perms` to keep runtime checks simple)
  - `iat`, `exp`
  - `jti` (token id; optional for audit correlation)

### Refresh token

- Opaque string; only hashed value stored.
- Scoped to (`user_id`, `org_id`) to avoid ambiguous multi-org refresh semantics.

