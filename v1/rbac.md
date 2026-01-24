## RBAC (v1)

This document defines **authorization requirements** for v1 APIs.

### Principles

- **Org isolation first**: even `org:read` requires membership in the org.
- **Prefer small stable permission codes** over endpoint-specific permissions.
- **Async-first**: “moderation” and “state transitions” are explicit, privileged operations.

---

## Permission codes (v1)

### Organization / admin

- `org:read`
- `org:manage_members`
- `org:manage_roles` (role creation/editing can be v2; keep the permission reserved)
- `audit:read`

### Core entities

- `channels:read`
- `channels:manage`
- `threads:read`
- `threads:write` (create thread, post messages, edit via new versions)
- `threads:moderate` (thread state transitions, archive policies, participant overrides)

---

## Recommended built-in roles (v1)

These are **org-scoped** roles; services may flatten permissions into JWT claims.

- **ORG_ADMIN**
  - `org:read`, `org:manage_members`, `org:manage_roles`, `audit:read`
  - `channels:read`, `channels:manage`
  - `threads:read`, `threads:write`, `threads:moderate`
- **MEMBER**
  - `org:read`
  - `channels:read`
  - `threads:read`, `threads:write`
- **OBSERVER** (optional)
  - `org:read`
  - `channels:read`
  - `threads:read`

---

## Endpoint authorization matrix

### identity-service

- **POST** `POST /auth/login`
  - **auth**: none
- **POST** `POST /auth/refresh`
  - **auth**: none (refresh token required)
- **POST** `POST /auth/logout`
  - **auth**: none (refresh token required)
- **GET** `GET /me`
  - **auth**: JWT
- **POST** `POST /orgs`
  - **auth**: JWT
  - **perm**: (v1) allow any authenticated user; enterprise deployments may gate behind an allowlist later
- **GET** `GET /orgs/:orgId`
  - **perm**: `org:read`
- **POST** `POST /orgs/:orgId/members`
  - **perm**: `org:manage_members`
- **PATCH** `PATCH /orgs/:orgId/members/:memberId`
  - **perm**: `org:manage_members`
- **GET** `GET /orgs/:orgId/audit`
  - **perm**: `audit:read`

### core-service

- **POST** `POST /orgs/:orgId/channels`
  - **perm**: `channels:manage`
- **GET** `GET /orgs/:orgId/channels`
  - **perm**: `channels:read`
- **POST** `POST /orgs/:orgId/channels/:channelId/threads`
  - **perm**: `threads:write`
- **GET** `GET /orgs/:orgId/threads/:threadId`
  - **perm**: `threads:read` (and must be a participant if thread is private/explicit-only)
- **POST** `POST /orgs/:orgId/threads/:threadId/messages`
  - **perm**: `threads:write` (and must be a participant unless explicitly allowed by thread policy)
- **POST** `POST /orgs/:orgId/messages/:messageId/versions`
  - **perm**: `threads:write` (and must be author or moderator; enforcement is server-side)
- **POST** `POST /orgs/:orgId/threads/:threadId/state`
  - **perm**: `threads:moderate` (or thread owner; enforcement is server-side)
- **GET** `GET /orgs/:orgId/inbox`
  - **perm**: `threads:read`
- **PATCH** `PATCH /orgs/:orgId/threads/:threadId/user-state`
  - **perm**: `threads:read` (user can only mutate their own `ThreadUserState`)

