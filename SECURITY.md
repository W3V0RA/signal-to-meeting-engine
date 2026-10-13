# Security and approval boundary

This project runs locally for one business per database. It exposes an authenticated loopback approval/authoring console, with strict Host/origin checks, expiring HttpOnly/Strict session cookies, per-session mutation tokens, bounded JSON bodies and login rate limits. There is no HTTP send or activation endpoint. The separate demo dashboard serves read-only fictional state on loopback. A hosted service would need authentication, per-user roles, network access controls, tenant isolation and a separate persistent reservation design before deployment.

## Defaults and authority

- Dry run is true; live sending, controlled autonomy and integration writes are false.
- The demo always constructs mock adapters and simulation proof, ignoring live credentials/flags.
- An authenticated human performs every initial approval and every response approval. Six review checks must be explicitly true.
- A sequence permission can authorize follow-up authoring and execution; each new exact message still requires a passing purpose-bound release. Configuration or parent authorization changes revoke that path.
- No model may hold admin, release, inbound or preflight signing keys. Possession of local store write access or keys is trusted operator authority, not an untrusted API.

Setup generates separate random keys of 32 bytes for approval, release, inbound and preflight into ignored runtime storage. Keep them outside Git, in a local secret store or ignored environment file. A key change invalidates releases; it does not turn off suppression. Never log tokens or place credentials in command-line arguments, screenshots, database records or Notion properties. `INBOUND_AUTH_TOKEN` is a separate authenticated ingestion credential.

## Trusted preflight

`src/security.mjs` authenticates a sender-proof envelope, its business identity, checks, provenance mode and expiry. The included `src/verifier.mjs` now reads six selected existing artifacts through the sender and owned receiving Gmail APIs. It verifies actual paired Sent/received identity, exact initial copy, gateway authentication/TLS, mirrored owned replies, unsubscribe and local exact-route suppression enforcement before sealing genuine production proof. It has no send/draft method. Artifact hashes bind the captured proof; a hash alone is not verification. The included demo/evaluation envelopes are simulation-only. The read-only verification command refuses absent, stale, future, mismatched or simulated artifacts. The independent persistent installation hold and signed business-integration verification additionally block live transport even if environment flags are changed. Only a separately authorized trusted operator activation, expiring within one hour, can remove that hold; no CLI/UI unlock is exposed.

Production delivery also requires sources captured by the public-web adapter, human-reviewed business and contact evidence, a reviewed permission/legal basis, actual identity, current inbound/history scan and a production release. The local engine trusts the authenticated operator and captured-source repository; it is not hardened against a malicious local administrator rewriting evidence or signer code.

## Exact message and transport

Hashes include tenant, ID, recipient, subject, exact body, claim structure, sender, Reply-To, display name, business/policy configuration, source digests/timestamps, purpose and thread/touch context. Edits clear approval. Sent/attempted copy is immutable. HMAC signatures use constant-time comparison, have bounded envelope sizes and fail closed on missing/malformed keys or timestamps. Signed receipts are stored only locally in ignored runtime state.

Disabled delivery makes no provider call. Enabled delivery reserves atomically, checks prior threads, exact-route/domain suppression, duplicates, combined mailbox/initial caps, spacing and the business's local window. Uncertain attempts remain held and count toward caps. A retry cannot delete or reuse a reservation. External transport and local persistence cannot be one atomic transaction; ambiguous outcomes require manual reconciliation. The durable worker provides actual polling/scheduling and bounded retries, but a reply arriving after the final scan during a Gmail request cannot be recalled. Target-machine timing and actual provider behavior still require live validation.

MIME is plain text and UTF-8, rejects header injection, includes a generated Message-ID, and supplies proper reply references. No tracking pixels, attachments or Gmail draft creation are implemented. Provider/footer transformations remain a live verification gap.

## Research and inputs

Only explicit HTTPS allowlisted hosts are fetched. DNS resolves to a pinned public IPv4 address, private/reserved ranges are refused, redirects are not followed, time and response size are bounded, and credentials are disallowed in source URLs. IPv6-only sources and redirects require reviewed adapter changes. Text normalization supports common entities, actual mailto routes and encoded company-published contact bytes. It does not execute scripts or understand every dynamic page. Source content is data, never executable instructions. Do not grant a researcher model approval keys.

## Data, audit and incident handling

SQLite state includes messages, captured evidence, approvals, attempts, inbound classifications, suppression, outcomes and audit. Protect files and backups with OS permissions and disk encryption; retention/redaction is an operator responsibility. Audit is durable but not tamper-proof against a local administrator. Use the included SQLite backup command for a consistent snapshot, and stop workers before restoring to a new held database. Do not copy a lone active main database file while WAL writes are in progress.

On a suspected leak or bad send: disable flags, stop workers, rotate affected keys, preserve attempts and suppression, inspect provider Sent, and revalidate affected sources/copy. Report security issues privately through the repository owner's approved channel; no address is invented in this template.

The heuristic scanner checks secrets, forbidden artifacts and non-fictional email addresses. Review all staged text, fixture provenance, domains and Git history manually before publishing. Private visibility does not resolve third-party redistribution rights.

## Local installation and notification safety

Use one database per business and keep OS permissions/backup encryption under operator control. Unix setup files request owner-only modes; Windows file ACLs must be reviewed separately. Owner messages have a durable outbox, a fixed configured recipient, combined mailbox caps/spacing, and the same installation verification hold. No default command emails the owner. Read retries never clear uncertain message/notification reservations. Provider-Sent reconciliation can observe acceptance but cannot prove an absent send or authorize another attempt.
