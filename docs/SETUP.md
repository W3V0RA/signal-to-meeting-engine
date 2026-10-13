# Business installation walkthrough

## 1. Install safely

Install Node.js 24+. Clone/open this private repository, then run `npm run setup` and `npm start`. Open `http://127.0.0.1:3401`. Setup creates ignored local files only: `config/local.json`, `.env`, `runtime/keys.json` and the database. Re-running setup preserves configuration, keys and history and reapplies the send hold. Stop the process with Ctrl+C.

The operator access key is the `admin` value in `runtime/keys.json`; read that file privately and paste the value into the console. Release, preflight and inbound keys remain in the trusted server process. Do not put any key into a URL or public document. The console binds to loopback and requires a short-lived authenticated session and same-origin mutation token. It is not a public web deployment.

## 2. Configure one business

Edit `config/local.json`: tenant ID; business name, sender/Reply-To/display name, website, signature and actual postal address; offerings; ICP/markets; approved source hosts/URLs; advisory weights; timezone/weekdays/window, first-touch and combined caps, spacing and up to three follow-up offsets; booking URL and integration IDs; owner email and digest time. Keep scores/headcount advisory. Use a fresh `ENGINE_DATABASE` path for a new tenant; another business's database is refused before migrations.

The environment file loads with the application commands. Keep every send/write switch false and dry run true. Existing shell environment values take precedence over Node's environment file, but the durable installation hold still prevents activation. `INTEGRATION_READS_ENABLED` and `RESEARCH_NETWORK_ENABLED` are separate, explicit read-only permissions; enabling them does not enable sending. `OWNER_EMAIL_ENABLED` also defaults false.

## 3. Review one company

Use Companies to add a real company, supported fact, named person/role, exact published inbox and their source URLs. Shared inboxes and official alternate-provider business routes are accepted when separately verified. Pasted quotations are labeled operator imports, never production captures. Add the reviewed company host to the allowlist, enable research reads deliberately, then refresh official sources. Unsupported or stale facts remain gaps.

Author an initial through the console's paragraph editor. Inspect its exact recipient, subject/body, source evidence and gaps. Record reviewed permission/basis with an expiry, and check all six review items individually. An initial may authorize up to three individually authored follow-ups; every touch still needs fresh evidence and its own release. Every response requires new review of current inbound context. The console has no send or activation control.

For file-based imports, put authorized inputs in ignored runtime storage and use `node --env-file=.env scripts/review.mjs --input=runtime/review.json`. The fictional scenario documents the neutral data contract. Rewriting an unattempted draft clears approval; stale console edits are refused. Attempted copy is immutable.

## 4. Verify the business's accounts without sending

Configure your own Google OAuth and optional Notion/Calendar integrations. No original account or ID is included. Enable read-only integration/source access deliberately. Name the responsible human with `VERIFICATION_REVIEWER`, then run `npm run verify -- integrations`. It checks account identity, configured source access, fresh mailbox-worker health and enabled integration mappings. Optional unconfigured Notion/Calendar adapters do not block use without those integrations.

For mailbox proof, configure a distinct inbox you own and that inbox's separate read-only OAuth credentials. Enter six provider message IDs in `verification.references`: `sent`, `received`, `replySent`, `replyReceived`, `optOutSent`, `optOutReceived`. Run `npm run verify -- mailbox`. The command reads existing artifacts; it neither sends, drafts, approves, resets suppression nor activates. It requires matching actual Sent/received IDs, exact initial subject/body, aligned receiving authentication and TLS, mirrored owned replies, real unsubscribe intent and fresh timestamps. It records exact-route suppression and local refusal for the observed controlled inbox.

If those artifacts do not exist or have expired, verification fails. A fresh real owned-inbox experiment requires a separately authorized business action outside this send-disabled installation. Do not invent IDs, copy simulated artifacts or edit expiry to pass. Proofs expire within one hour; future live use needs current proof throughout the intended operating window.

## 5. Operate the held installation

While `npm start` runs, the worker evaluates scheduled work each minute. Operations shows durable jobs and local owner digest/alert previews. It performs no external reads with defaults and no outbound communication while held. `npm run worker` runs one safe cycle; `npm run doctor` lists real readiness gaps; `npm run backup` creates a consistent private SQLite backup.

Use an existing machine for persistent operation and optional service templates in `deploy/`. No operating-system service, Codex automation or scheduled task is installed automatically. Verify restart/recovery and backup restore on the target machine. Do not expose the loopback console through a proxy without separately designing authentication and network controls.

## 6. Future activation remains separate

Installing, passing tests, collecting proof or checking message review does not grant sending permission. A future trusted operator must explicitly authorize verified activation using the library boundary, with all readiness checks passing, then deliberately configure the transport flags. There is no packaged one-click unlock. Activation expires within one hour, and exact-message approval/release, source freshness, suppression/history and caps still apply. This completion leaves the installation held.

The immediate onboarding action is `npm run setup`, followed by business configuration and `npm start`. No credential is needed for the offline demo or tests.
