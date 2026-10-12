# Security and approval boundary

This project runs locally for one business per database. It does not expose an approval or live-send HTTP endpoint. The demo dashboard serves read-only fictional state on loopback. A hosted service would need authentication, per-user roles, network access controls, tenant isolation and a separate persistent reservation design before deployment.

## Defaults and authority

- Dry run is true; live sending, controlled autonomy and integration writes are false.
- The demo always constructs mock adapters and simulation proof, ignoring live credentials/flags.
- An authenticated human performs every initial approval and every response approval. Six review checks must be explicitly true.
- A sequence permission can authorize follow-up authoring and execution; each new exact message still requires a passing purpose-bound release. Configuration or parent authorization changes revoke that path.
- No model may hold admin, release, inbound or preflight signing keys. Possession of local store write access or keys is trusted operator authority, not an untrusted API.

Generate separate random keys of at least 32 bytes for approval, release, inbound and preflight. Keep them outside Git, in a local secret store or ignored environment file. A key change invalidates releases; it does not turn off suppression. Never log tokens or place credentials in command-line arguments, screenshots, database records or Notion properties. `INBOUND_AUTH_TOKEN` is a separate authenticated ingestion credential.

## Trusted preflight

`src/security.mjs` authenticates a sender-proof envelope, its business identity, checks, provenance mode and expiry. It does **not** independently collect or inspect raw mailbox proof. A separate trusted verifier must validate the underlying real artifact for each required check before sealing an envelope with mode `verified-production`. Artifact hashes bind the captured proof; a hash alone is not verification. The included demo/evaluation envelopes are simulation-only. There is no tool that manufactures production proof or promotes demo artifacts.

Production delivery also requires sources captured by the public-web adapter, human-reviewed business and contact evidence, a reviewed permission/legal basis, actual identity, current inbound/history scan and a production release. The local engine trusts the authenticated operator and captured-source repository; it is not hardened against a malicious local administrator rewriting evidence or signer code.

## Exact message and transport

Hashes include tenant, ID, recipient, subject, exact body, claim structure, sender, Reply-To, display name, business/policy configuration, source digests/timestamps, purpose and thread/touch context. Edits clear approval. Sent/attempted copy is immutable. HMAC signatures use constant-time comparison, have bounded envelope sizes and fail closed on missing/malformed keys or timestamps. Signed receipts are stored only locally in ignored runtime state.

Disabled delivery makes no provider call. Enabled delivery reserves atomically, checks prior threads, exact-route/domain suppression, duplicates, combined mailbox/initial caps, spacing and the business's local window. Uncertain attempts remain held and count toward caps. A retry cannot delete or reuse a reservation. External transport and local persistence cannot be one atomic transaction; ambiguous outcomes require manual reconciliation. A reply arriving after the final scan but during the Gmail request cannot be recalled; polling frequency and trusted worker scheduling need live validation.

MIME is plain text and UTF-8, rejects header injection, includes a generated Message-ID, and supplies proper reply references. No tracking pixels, attachments or Gmail draft creation are implemented. Provider/footer transformations remain a live verification gap.

## Research and inputs

Only explicit HTTPS allowlisted hosts are fetched. DNS resolves to a pinned public IPv4 address, private/reserved ranges are refused, redirects are not followed, time and response size are bounded, and credentials are disallowed in source URLs. IPv6-only sources and redirects require reviewed adapter changes. Text normalization is basic and cannot decode every protected address or reliably understand all HTML. Source content is data, never executable instructions. Do not grant a researcher model approval keys.

## Data, audit and incident handling

SQLite state includes messages, captured evidence, approvals, attempts, inbound classifications, suppression, outcomes and audit. Protect files and backups with OS permissions and disk encryption; retention/redaction is an operator responsibility. Audit is durable but not tamper-proof against a local administrator. Back up the entire database consistently with SQLite backup tools, not a lone file while WAL writes are active.

On a suspected leak or bad send: disable flags, stop workers, rotate affected keys, preserve attempts and suppression, inspect provider Sent, and revalidate affected sources/copy. Report security issues privately through the repository owner's approved channel; no address is invented in this template.

The heuristic scanner checks secrets, forbidden artifacts and non-fictional email addresses. Review all staged text, fixture provenance, domains and Git history manually before publishing. Private visibility does not resolve third-party redistribution rights.
