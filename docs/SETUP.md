# Setup walkthrough

## 1. Prove the offline installation

Install Node.js 24+. From the repository directory run `npm test`, `npm run demo`, then `npm run dashboard`. Open the loopback URL printed by the dashboard command. No installation of npm dependencies is required. SQLite is provided by Node; its API is still evolving, so validate your intended Node version using the included tests before upgrades. CI covers Node 24 on Windows and Linux.

The demo always loads `config/example.json` and mock providers. Its generated approval/release records, message identifiers, source text and bookings are fictional and remain in ignored runtime directories. No external service is contacted. Keep this database separate from any real business database.

## 2. Configure one business

Copy `config/example.json` to ignored `config/local.json` and `.env.example` to ignored `.env`. The environment file selects `ENGINE_CONFIG=config/local.json` and a private `ENGINE_DATABASE=runtime/business.sqlite`. Change the example tenant ID before using a new database. An existing database rejects another tenant.

Edit every identity field, actual signature and postal address; offer descriptions/tags; ICP sectors and optional preferred headcount; markets; allowlisted company source hosts and URLs; priority weights; timezone, weekdays, window, caps, spacing and cadence; real booking URL and integration IDs. Keep headcount and priority advisory. Review market-specific permission requirements with your business's responsible operator. A published email route alone does not establish outreach permission.

Keep all send/write toggles disabled. The environment file is not loaded implicitly by npm. Either export variables in your shell or use Node's environment-file support as shown below.

## 3. Prepare one reviewed candidate locally

An input JSON file in `runtime/` has three fields: `prospect`, `pages` and `draft`. [The fictional scenario](../fixtures/scenario.mjs) is the full data contract example. Build JSON using your researched company, exact person/role quotation, separately published route and supported company fact. Source pages contain URL, captured text, digest, checked timestamp and capture mode; use the PublicWeb adapter for actual sources. Draft sections refer to claim IDs and contain only supported facts, honest possibilities, configured offer wording and one final question.

```sh
node --env-file=.env scripts/review.mjs --input=runtime/review.json
```

The command stores research and exact copy locally, prints gaps, and leaves the message **unapproved and unreleased**. It never sends, invokes OAuth, writes Notion or creates a Gmail draft. Re-importing an unattempted draft clears existing approval and release. Existing attempted messages are immutable. Review the current stored draft before importing a replacement.

## 4. Integrate trusted operator actions

`openEngine()` in `src/bootstrap.mjs` creates a local engine using configuration and environment credentials. `Engine.approve()` is the authenticated human boundary. `Engine.release()` is the trusted evaluator boundary, requiring verified evidence, permission and a separately signed preflight proof. `Engine.deliver()` returns `dry_run` with defaults. No provided command enables live flags, produces production sender proof, grants live approval, or launches an unattended scheduler.

Use distinct random approval/release/inbound/preflight keys in a trusted local process. Store an authenticated reviewed permission record keyed by the recipient with `allowed`, `basis`, `reviewedBy` and `expiresAt`. This is an operator decision, not inferred consent. Keep suppressed/history records intact. Detailed integration contracts and gaps are documented in `docs/integrations/` and `SECURITY.md`.

## 5. Live readiness is a separate scope

Before a future live rollout: implement the trusted production artifact collector, set up your own OAuth/integration credentials, verify actual received sender authentication/TLS and reply/suppression/opt-out handling using an explicitly authorized owned inbox, validate actual Calendar association, add an authenticated worker/scheduler and owner notifications, and review the current exact copy. A simulation cannot serve as this proof. Any live communication or rollout needs its own authorization; installation does not grant it.

The immediate onboarding next step is to run the offline demo and copy the business configuration. You do not need credentials or a license decision to inspect and evaluate this private local reference within your authorized business.
