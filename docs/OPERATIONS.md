# Operation and recovery

Run `npm run setup` once and `npm start` to open the authenticated local console and minute scheduler. Default configuration keeps research/integration reads, Notion writes, prospect sending and owner email disabled. The independent installation hold prevents environment flags alone from enabling transport.

## Scheduled work

The worker persists time-slot jobs for mailbox reads, source watch, lifecycle planning, Notion projection, associated Calendar reads, owner alerts and delivery admission. The approval digest is scheduled once per configured local weekday after the configured digest time, including catch-up after restart. It links to each exact message separately and cannot approve anything.

Jobs are atomically leased to one worker, heartbeated, and recoverable after a crash. Read failures back off and become held after bounded attempts. Inbound failure preserves its cursor and imposes a durable installation send hold. External send attempts have independent immutable reservations; job retry never retries an uncertain message or notification. Held/overflow messages remain visible and are reconsidered in later eligible windows only while approval/release remain current.

The process must stay running. No OS service or Codex task is created by setup. Optional service templates use existing infrastructure with sending explicitly disabled. A single local database is not a multi-machine distributed queue.

## Inbound and authoring

Read integration access is separate from sending. Mailbox scans inspect actual known threads and mailbox-wide delivery-status messages. Plain/HTML/attached text is bounded; quoted unsubscribe language is excluded from current intent. Exact configured aliases can establish interest; an unknown thread participant stops the sequence and cannot automatically establish booking interest. Unmatched DSNs and read/parse failures hold sending rather than assuming no reply.

Read the actual inbound text in the console before authoring a response. Every reply stops follow-ups; bounces/opt-outs persist exact-route suppression. New inbound invalidates pending response approvals. One initial review may authorize up to three individually personalized touches, each with current evidence and its own purpose release. No model fabricates replacement copy or changes authorization.

Calendar associations are reviewed event IDs, never title keyword guesses. Actual accepted event readback is required; cancellation updates outcomes and queues an owner alert idempotently. Owner notifications are delivered only to the configured owner, share the mailbox cap/spacing, and remain preview-only while sending is held.

## Uncertain sends

Before external transport, the exact context and generated RFC Message-ID are durably reserved. On timeout, incomplete confirmation or local completion failure, preserve the uncertain attempt. Do not delete it, edit expiry or retry automatically.

With explicitly configured read-only account access and a named verifier, use `npm run reconcile -- --message-id=<held ID>`. It compares actual Sent Message-ID, sender/Reply-To, recipient, decoded subject and body to the original reserved context. Exactly one matching Sent artifact records provider acceptance and keeps sending held. Zero matches do not prove unsent; multiple/mismatched results remain held. Reconciliation sends nothing and never resets a reservation. Notification uncertainty likewise remains held for private provider investigation.

## Backup and monitoring

Use `npm run doctor`, Operations and the local audit to inspect unresolved proof, held work, caps and uncertainty. `npm run worker` runs one cycle. `npm run backup` creates a consistent ignored backup. Protect file permissions/retention and validate a restore on the target machine. Audit is durable, not tamper-proof against a local administrator. Cost rows record supplied operation costs, not all provider subscription charges.

Business verification and activation are fresh, expiring authorities. Any changed identity/configuration/evidence, later inbound, expired proof, suppression or uncertainty must fail closed. Verification never substitutes for individual approval, and provider acceptance never substitutes for delivered mail or economic value.
