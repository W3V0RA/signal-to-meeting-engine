# Release history

## Unreleased — configurable controls and local onboarding

Adds optional distinct first-touch spacing, an explicitly configurable owner-notification budget boundary, neutral shared-inbox greetings, and a digest that can read an actual configured Notion saved view without substituting an approximate count. Local exact-copy approval counts and the separate view count are not send-eligibility claims. Existing configurations retain their previous behavior when the new options are omitted. Local installation steps now cover prerequisites, cloning, setup, sign-in, offline tests and troubleshooting.

This generic installation is not the hosted private deployment: the newer initial/final-follow-up booking-link experiment and provider-specific scheduled sender-renewal workflow have not been ported. The generic implementation continues to permit the configured booking URL only in a separately approved response to verified interest. No real recipient, business credentials, production history or proof was migrated. Offline tests do not establish live delivery or funding outcomes.

## Version 0.2 — Send-disabled business installation

The operator console, scheduler, owner outbox, broader inbound parser, evidence collector, independent installation hold, migrations, backup and exact Sent reconciliation are now implemented. See [implementation acceptance](IMPLEMENTATION_ACCEPTANCE.md) for 189 passing tests, six evaluations and fresh-install/restore verification. Business-specific live proof remains pending and no sending was enabled.

## Version 0.1 — Initial private reference release

Validated locally on Node.js 24.19.0 on Windows:

- 113 isolated tests passed; real network access is refused by the test preload.
- Six labeled synthetic research evaluation cases matched expected decisions.
- Offline demo completed research, exact synthetic approval/release, mock delivery, inbound cancellation, separately approved response, fictional confirmed booking, projection, audit and learning.
- Local review CLI stored an unapproved/unreleased draft with no provider call.
- Every JavaScript module passed syntax checking.
- The read-only loopback dashboard rendered in the in-app browser.
- Complete project/staged text scan found no prohibited runtime/credential artifacts, secret patterns or non-fictional email addresses. A separate predecessor-specific identifier check found no original business/private identifiers in the project tree.

The implementation was newly authored in a separate checkout with a fresh Git history. Private predecessor checkouts and business systems were reference-only for this task. Concurrent activity elsewhere in those checkouts was observed and was not altered or imported. No original history, actual prospect/source ledger, private research, audit/export, release receipt, OAuth file or live mailbox message was copied.

**VERIFIED COMPLETE:** private runnable generic reference, offline safety/lifecycle, configuration, setup/migration/security/integration documentation, synthetic evaluation and manual CI definition.

**TESTED BUT NOT PROVEN:** Gmail/Notion/Calendar contract stubs, bounded inbound parsing and mock follow-up/response/booking flow; no claim of actual delivery, booking, business performance or production reliability.

**BLOCKED for production rollout:** trusted real sender-artifact collection, actual credentials and separately authorized live verification, fuller inbound/bounce coverage, worker scheduling and owner digest delivery. No production send, Gmail draft, deployment, approval or business-system mutation was performed. A wider distribution/public-license decision remains for the owner; no open-source license is invented.

Onboarding: run `npm run demo`, then copy `config/example.json` to ignored `config/local.json` and set the business's own identity/offers/markets with sending disabled. Follow `docs/SETUP.md` to preview one researched candidate locally.
