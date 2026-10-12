# Schema and migrations

`001_initial.sql` creates neutral local tables for record entities, message attempts, suppression, inbound events, audit, costs, outcomes and projection checkpoints. `Store` applies this idempotent schema automatically and persists the tenant metadata. It requires no remote database, project ID or seed from a real business.

Use a new ignored SQLite path for a business. Test migrations on a consistent backup, check row counts/uniqueness/suppression/history, then apply new numbered migrations through a trusted operator process. This initial release has one migration; a migration-history/checksum runner for later versions is not yet implemented. Never edit an applied schema silently once real data exists.

SQLite WAL plus `BEGIN IMMEDIATE` and uniqueness constraints protect same-machine reservations. Every reserved or uncertain attempt counts toward caps. Attempts cannot be bulk-deleted to retry mail. One database belongs to one tenant and refuses a different tenant identifier.

A PostgreSQL or Supabase deployment is optional future work, not a default prerequisite. Translate these entities, add organization-scoped access controls, authenticated service roles and an atomic transaction/reservation procedure, then test concurrent workers and failure recovery. Do not point a new deployment at an existing production project or copy its credentials, seeds, audit dumps or schema IDs. The included SQLite schema is not advertised as a ready-to-run hosted PostgreSQL migration.

Importing existing business history needs a separate reviewed mapping that preserves suppression, prior threads, attempts and exact sent content. Never import approvals/releases as newly valid. A storage provider swap must preserve the same admission, idempotency, cancellation and recovery contract before production use.
