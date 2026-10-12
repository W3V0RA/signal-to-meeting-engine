# Capability and verification matrix

Statuses describe this new repository. Predecessor documentation was reconciled with code/tests and the latest operating contract; unfinished transport/digest behavior was not treated as proven.

| Capability | Generic implementation | Verification / explicit gap |
|---|---|---|
| Business identity, offers, ICP, markets and integrations | Configuration file | Validated offline; real values not configured |
| Discovery and source watch | Mock discovery and bounded configured URL fetching | Offline discovery proven; broad search, automated signal extraction/change scheduler absent |
| Evidence and source-to-claim | Captured text/digest/time and exact cited fact paragraphs | Tested; arbitrary semantic paraphrase cannot clear this bounded verifier |
| Company and named contact | Exact domain, verified business flag, person/role quote, independently published address token | Tested; authenticated human must establish business relevance/ownership, parser has limited HTML normalization |
| Shared and official free-mail routes | Exact official page publication; no same-email-domain restriction | Tested with fictional alternate-domain routes; greeting uses researched first name |
| Headcount and scores | Advisory preference and weights | Missing/out-of-range/low values never block release |
| Outcome-first and v2 writing | Configurable format and typed paragraphs, one soft question, portfolio repetition checks | Tested; subjective truth/voice needs human review; third-party claims/text not imported |
| Exact approval | Human authentication and six checks; content/evidence/config digest | Tested; there is no public approval endpoint or Notion-checkbox authority |
| Trusted release | HMAC exact message, tenant, sender, purpose, thread, touch, source and proof binding; ≤1h expiry | Forgery/change/expiry tested; real production sender-proof collector remains absent |
| Suppression, consent, history and duplicates | Durable route/domain suppression; reviewed permission; provider read; atomic uniqueness | Tested offline; actual mailbox history and permission basis not verified |
| Caps, pacing and timezone | Initial/combined daily caps, spacing and local weekday window/DST | Tested; overflow remains held; actual worker scheduling not installed |
| Gmail delivery | OAuth identity/sendAs checks, exact plain-text MIME, thread references | Stub-transport tests; no credentials, draft, send or received-mail proof performed |
| Replies, bounces, opt-outs | Plain-text reply rules and structured delivery-status parsing; authenticated ingestion | Mock parser/lifecycle tested; rich HTML-only replies, alternate routes and mailbox-wide bounce reconciliation need extension/live proof |
| Follow-ups | Three personalized authoring tasks, initial sequence permission, new release per touch | Mock dispatch/cancellation tested; human/local authoring and scheduler needed |
| Responses | Current inbound/thread association and separate approval; newer replies revoke pending approvals | Mock response transport tested; live response authoring/approval/transport not proven |
| Booking | Link only after explicit interest and approved response; specified accepted Calendar event; cancellation | Mock booking and adapter reads tested; actual event association and delivery not proven |
| Notion sync | Stable-ID system-owned projection, write flag, local checkpoint | Mock/HTTP stub tested; no existing page changed; live workspace setup remains required |
| Dashboard | Read-only local demo snapshot and metric library | Local render checked; no production operator UI |
| Learning, evaluations, audit and costs | Observational rates, synthetic labeled evaluation, durable audit and explicit cost rows | Tested; no automatic policy change, training/performance promises or verified revenue |
| Owner alerts and daily digest | Durable pending owner-alert work item | Actual notification composition, scheduling and delivery absent; no owner email sent |
| Multi-business use | Independent business config/database | Sequential isolated deployments; hosted multi-tenant isolation and distributed queue absent |

**VERIFIED COMPLETE:** runnable offline reference, generic settings and templates, safe defaults, original provenance boundary, persisted lifecycle and tested policy controls.

**TESTED BUT NOT PROVEN:** integration contracts with injected transports and mock lifecycle, MIME, reply parsing, Notion projection and Calendar association. These do not prove real delivery, bookings, revenue, or production reliability.

**BLOCKED for live rollout:** actual credentials and independently verified sender artifacts; live inbox/cancellation/booking checks; scheduler and owner digest implementation; production authorization and any licensing decision needed for wider distribution. Offline use is not blocked by these items.
