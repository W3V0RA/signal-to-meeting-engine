# Schema, migrations and backup

`001_initial.sql` defines prospects/record entities, exact attempts, suppression, inbound, audit, costs, outcomes and projection checkpoints. `002_operations.sql` adds durable scheduler jobs, the owner-notification outbox and verification-event storage. No production seed, account ID or original source data is bundled.

`Store` first checks an existing database's tenant, then runs numbered immutable migrations through `src/migrations.mjs`. Each migration is transactional and recorded with its SHA-256 checksum. An altered applied migration or a database newer than the installation fails closed. The original local generic schema is adopted only after required attempt columns are checked. Unknown legacy schemas require an explicit reviewed migration.

SQLite WAL, busy timeout and `BEGIN IMMEDIATE` serialize local reservations. Message, follow-up-touch and response/inbound uniqueness prevent duplicates. Notification reservations count toward the combined mailbox cap. Reserved/uncertain attempts are retained and cannot be cleared to retry.

`npm run backup` uses SQLite's consistent backup API into ignored `runtime/backups/`. Protect backups as private business data. For restore, stop the application/worker, preserve the current database and WAL files, select a verified consistent backup, restore into a new database path, validate tenant/schema/counts/suppression/history, and restart with sending held. Never replace a running database's main file alone. A backup that omits a later externally accepted send needs provider reconciliation before any future activation.

A new business uses a fresh config/tenant/database. Historical CRM imports require an audited mapping that preserves suppression, prior threads, attempted/sent copy and provider identifiers; old approvals/releases are never imported as current authority. The repository does not import any original business data.

PostgreSQL/Supabase are optional future storage adapters. A hosted adapter needs tenant access controls and a transactional shared-store reservation implementation; this SQLite schema is not advertised as a deployable PostgreSQL migration.
