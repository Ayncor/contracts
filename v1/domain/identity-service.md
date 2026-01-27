## identity-service (v1) domain model

This service owns **authentication**, **users**, **organizations**, **memberships**, **invites**, **roles/permissions**, **audit logs**, and **health**.

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

**API**

- `GET /orgs/:orgId/roles` — list roles (any org member). Used for role dropdown when adding members/invites.
- `POST /orgs/:orgId/roles` — create custom role (org admin only). Body: `name`, `permissions`. Names `ORG_ADMIN`, `ORG_MEMBER` are reserved.
- `PATCH /orgs/:orgId/roles/:roleId` — update custom role (org admin only). System roles cannot be updated.

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
- `revoked_at` (timestamp, nullable)
- `replaced_by_id` (uuid, nullable) — id of the token that replaced this one (rotation)
- `user_agent` (string, nullable) — User-Agent header at issue (device/browser context)
- `ip_at_issue` (string, nullable) — client IP when the token was created
- `last_used_at` (timestamp, nullable) — when the token was last used (e.g. on refresh)
- `last_used_from_ip` (string, nullable) — client IP at last use

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
  - `membership_id`: membership id in that org (required in implementation)
  - `role_id`: optional
  - `perms`: flattened permission codes (string[]) — preferred over role names for runtime checks
  - `iat`, `exp`
  - `jti` (token id; optional for audit correlation)

### Refresh token

- Opaque string; only hashed value stored.
- Scoped to (`user_id`, `org_id`) to avoid ambiguous multi-org refresh semantics.
- **Rotation**: one-time use; reuse detection revokes all refresh tokens for that user/org.

### JWT consumers (same secret)

- **core-service** and **realtime-gateway** validate the same access token using the same `JWT_ACCESS_SECRET`. No separate token issuance; identity-service is the sole issuer.

---

## API surface (summary)

- **Health**: `GET /health` (liveness), `GET /health/ready` (readiness with DB check). No auth.
- **Auth**: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all` (Bearer). Placeholders: `POST /auth/password-reset/request` (202), `POST /auth/password-reset/confirm` (501).
- **Sessions (devices)**: `GET /me/sessions` (Bearer) — list active refresh tokens (device/IP metadata) for "Your devices" UI. `DELETE /me/sessions/:sessionId` (Bearer) — revoke that session by id (404 if not found or already revoked).
- **Rate limiting**: login 5/60s, refresh 30/60s, password-reset/request 5/60s, invites/accept 5/60s.
- **Me**: `GET /me` (Bearer) — user, org, membership.
- **Orgs**: `POST /orgs`, `GET /orgs/:orgId` (Bearer).
- **Roles**: `GET /orgs/:orgId/roles` (list; any org member), `POST /orgs/:orgId/roles` (create custom role; org admin), `PATCH /orgs/:orgId/roles/:roleId` (update custom role; org admin; system roles are read-only).
- **Members**: `POST /orgs/:orgId/members`, `PATCH /orgs/:orgId/members/:memberId` (Bearer).
- **Invites**: `POST /orgs/:orgId/invites`, `GET /orgs/:orgId/invites`, `POST /orgs/:orgId/invites/revoke` (Bearer). Public: `POST /orgs/:orgId/invites/verify`, `POST /orgs/:orgId/invites/accept`, `POST /orgs/:orgId/invites/decline`.
- **Audit**: `GET /orgs/:orgId/audit` (Bearer). Query: `page_size` (default 50, max 200), `cursor` (opaque), `action` (filter by action prefix). Response: `items`, `next_cursor` (opaque; null when no more pages).

