## Event types (v1)

This is the canonical list of event types and their intended consumers.

### identity-service emits

- **`Identity.UserCreated`**
  - **Used by**: analytics, admin tooling, future search indexing of people directory
- **`Identity.MembershipChanged`**
  - **Used by**: core-service caches (optional), notification routing, admin audit views
- **`Identity.RoleChanged`**
  - **Used by**: permission caches, admin audit views

### core-service emits

- **`Core.ThreadCreated`**
  - **Used by**: digest generation, search indexing, analytics
- **`Core.ThreadStateChanged`**
  - **Used by**: digest generation (“decision made”), analytics, AI summarization triggers
- **`Core.ThreadParticipantAdded`**
  - **Used by**: notification routing (who to notify), search indexing, audit views
- **`Core.ThreadUserStateChanged`**
  - **Used by**: inbox sync, digest eligibility, audit views
- **`Core.MessageCreated`**
  - **Used by**: digest generation, urgent routing, AI summarization, search indexing
- **`Core.MessageVersionCreated`**
  - **Used by**: audit views, search indexing (optional), AI summarization corrections
- **`Core.ReactionAdded`**
  - **Used by**: analytics; should not drive default notifications

### Notes on async-first semantics

- `Core.MessageCreated` is **not** a “notify now” command; it’s a durable fact.
- Urgency is explicit via the `urgency` field; only a later notification-service can decide to bypass digest schedules.

