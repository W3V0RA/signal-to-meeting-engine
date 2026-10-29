# Business installation walkthrough

## 1. Install safely

1. Install [Git](https://git-scm.com/install/) and [Node.js](https://nodejs.org/en/download), version 24 or newer. npm comes with Node.js. Open PowerShell on Windows or a terminal on macOS/Linux and check:

   ```sh
   git --version
   node --version
   npm --version
   ```

2. In the folder where you keep projects, clone the repository and enter it.

   ```sh
   git clone https://github.com/W3V0RA/signal-to-meeting-engine.git
   cd signal-to-meeting-engine
   ```

3. Initialize the local installation:

   ```sh
   npm run setup
   ```

   This creates ignored local files: `config/local.json`, `.env`, `runtime/keys.json` and `runtime/engine.sqlite`. No provider credentials or paid services are needed. Re-running setup preserves configuration, keys and history and reapplies the send hold.

4. Start the console and leave that terminal open:

   ```sh
   npm start
   ```

   Open `http://127.0.0.1:3401` on the same computer. Stop the process with Ctrl+C; start it again from the project directory with `npm start`.

5. Open `runtime/keys.json` locally and copy only the `admin` value into the console sign-in. Enter your reviewer name as well. Treat the key like a password: do not post it, commit it, put it in a URL or share a screenshot containing it. The other credentials remain in the trusted server process.

6. In a second terminal in the same directory, check the held installation and offline tests:

   ```sh
   npm run doctor
   npm run check
   ```

   `doctor` reports the real missing configuration and verification checks; gaps are expected in a fresh install. `check` runs isolated tests, synthetic evaluations and a heuristic privacy scan. Neither command sends a message. A Node.js SQLite experimental warning may appear.

If `node` or `npm` is not found, reopen the terminal after installation. If port 3401 is in use, stop the other process or change `ENGINE_PORT` in `.env` and `operations.consoleUrl` in `config/local.json` to the same available loopback port. If the browser cannot connect, check that `npm start` is still running on the same computer. The loopback console is not a public web deployment.

The console binds to loopback and requires a short-lived authenticated session and same-origin mutation token.

## 2. Configure one business

Select **Setup Interview** after signing in. A fresh installation opens it automatically. Answer the five screens:

1. Enter the business name, website, sender identity, reply address, postal address and owner notification address.
2. Describe the primary offer, target markets and sectors, and approved research URLs. Other existing offers are preserved.
3. Choose the time zone, weekdays, sending window, separate initial and combined daily caps, pacing, follow-up offsets, opt-out wording and review rules. Approval remains required.
4. Optionally enter your own Calendar, Notion, owned verification inbox and OAuth credentials. Blank credential fields preserve existing values. The interview stores them in your ignored local `.env`; it never displays previously stored credentials. Entering connection details does not enable access. The optional booking experiment requires your own canonical Google schedule, title and duration, with separate verification before release.
5. Review the displayed answers and choose **Save Configuration And Keep Sending Held**. Stop the process with Ctrl+C and run `npm start` again. A changed configuration can invalidate prior approvals and verification; review them again as required. The interview never approves, sends, activates or clears the hold.

Each fresh `npm run setup` generates a tenant ID. Use a separate copy and database for each business; another business's database is refused. Advanced settings not offered by the interview remain in `config/local.json` and `.env`. Existing shell environment values override `.env`, so remove conflicting shell variables before restarting. Keep scores/headcount advisory.

The policy fields `dailyInitialCap`, `dailyMailboxCap` and `minimumSpacingMinutes` already control initial volume, combined volume, and shared spacing. Optionally set `minimumFirstTouchSpacingMinutes` separately; when omitted it falls back to `minimumSpacingMinutes`. For example, a business that has authorized ten total prospect messages per weekday, at least 30 minutes between initial messages and 15 minutes across all prospect messages can configure:

```json
"dailyInitialCap": 10,
"dailyMailboxCap": 10,
"minimumSpacingMinutes": 15,
"minimumFirstTouchSpacingMinutes": 30,
"includeOwnerNotificationsInMailboxCap": false
```

These are fields inside the existing `policy` object, not a complete JSON file. This example does not grant authority to send. When `includeOwnerNotificationsInMailboxCap` is absent or true, owner notifications continue to share the mailbox cap and spacing, preserving the previous behavior. Set it to false only when the business has explicitly approved a separate owner-notification budget. Reserved and uncertain prospect attempts count conservatively. Changing a local setting does not change another installation or a hosted sender.

Optional `"sharedInboxGreeting": "neutral"` in `policy` uses `Hi there,` for a route explicitly recorded as shared; direct contacts retain their named greeting. The default is the previous named greeting. Verify the person and exact published business route separately either way; configuration changes do not rewrite existing saved messages.

The file `config/recent-policy.example.json` shows current-style settings as a partial `policy` object: ten total prospect messages, 30-minute initial spacing, 15-minute shared spacing, three- and eleven-day minimum intervals after the preceding follow-up, neutral shared-inbox greetings, 60–100-word initials, sentence-case subjects, pre-approval release, a three-part brief, ten current-draft comparisons, a five-contact daily progress target and up to 24-hour owned-inbox proof. Copy selected fields into the existing `policy` object in `config/local.json`; do not replace the entire configuration with the partial example. A ten-draft minimum deliberately blocks release when fewer than ten other eligible drafts exist. Set a lower minimum only if the business chooses to review a smaller available portfolio. These settings do not enable sending or authorize another business's policy.

`dailyDiscoveryTarget` is a local progress target, not an autonomous researcher. The counter starts when the option is enabled and counts a newly observed, distinct named person only once when the initial draft has qualifying actual company-source captures. Simulations, old contacts, weekends, missing facts and repeat rewrites do not create new weekday claims. The count does not imply approval, release or delivery. A human or separately authorized research workflow must still find and author candidates.

The environment file loads with the application commands. Keep every send/write switch false and dry run true. Existing shell environment values take precedence over Node's environment file, but the durable installation hold still prevents activation. `INTEGRATION_READS_ENABLED` and `RESEARCH_NETWORK_ENABLED` are separate, explicit read-only permissions; enabling them does not enable sending. `OWNER_EMAIL_ENABLED` also defaults false.

## 3. Review one company

Use Companies to add a real company, supported fact, named person/role, exact published inbox and their source URLs. Shared inboxes and official alternate-provider business routes are accepted when separately verified. Pasted quotations are labeled operator imports, never production captures. Add the reviewed company host to the allowlist, enable research reads deliberately, then refresh official sources. Unsupported or stale facts remain gaps.

Author an initial through the console's paragraph editor. Inspect its exact recipient, subject/body, source evidence and gaps. With `requireAuthoringBrief` enabled, record the observed fact, possible workflow, smallest next step and writing framework, then inspect and acknowledge the displayed current-draft comparison. Record reviewed permission/basis with an expiry. With `requirePreApprovalRelease` enabled, first use **Evaluate Before Approval** while the copy is unapproved; it needs genuine current source and sender proof. Then check the individual review items and use **Evaluate Technical Release**. A technical baseline does not approve or send the message. An initial may authorize up to three individually authored follow-ups; every touch still needs fresh evidence and its own release. Every response requires real inbound context, a new unapproved baseline when enabled, and its own fresh human review. The console has no send or activation control.

For file-based imports, put authorized inputs in ignored runtime storage and use `node --env-file=.env scripts/review.mjs --input=runtime/review.json`. The fictional scenario documents the neutral data contract. Rewriting an unattempted draft clears approval; stale console edits are refused. Attempted copy is immutable.

## 4. Verify the business's accounts without sending

Configure your own Google OAuth and optional Notion/Calendar integrations. No original account or ID is included. Enable read-only integration/source access deliberately. Name the responsible human with `VERIFICATION_REVIEWER`, then run `npm run verify -- integrations`. It checks account identity, configured source access, fresh mailbox-worker health and enabled integration mappings. Optional unconfigured Notion/Calendar adapters do not block use without those integrations.

For mailbox proof, configure a distinct inbox you own and that inbox's separate read-only OAuth credentials. Enter six provider message IDs in `verification.references`: `sent`, `received`, `replySent`, `replyReceived`, `optOutSent`, `optOutReceived`. Run `npm run verify -- mailbox`. The command reads existing artifacts; it neither sends, drafts, approves, resets suppression nor activates. It requires matching actual Sent/received IDs, exact initial subject/body, aligned receiving authentication and TLS, mirrored owned replies, real unsubscribe intent and fresh timestamps. It records exact-route suppression and local refusal for the observed controlled inbox.

If those artifacts do not exist or have expired, verification fails. A fresh real owned-inbox experiment requires a separately authorized business action outside this send-disabled installation. Do not invent IDs, copy simulated artifacts or edit expiry to pass. Sender proofs default to one hour; an explicitly configured `senderProofHours` can be at most 24 hours and cannot extend beyond the observed artifact timestamps. Exact-message releases still expire within one hour, and future live use needs current proof throughout the intended operating window. This generic app does not yet automate the separate recurring controlled-test sender renewal used by the private hosted deployment.

### Optional booking-link experiment

The default remains interest-gated. `config/booking.example.json` shows the two relevant configuration locations using fictional values; it is a partial example, not a complete configuration or working schedule. To opt in, set `integrations.bookingUrl` to your own Google appointment URL and add a `booking` object inside `policy` with `strategy: "initial-and-final"`, your own `canonicalScheduleUrl`, exact `scheduleTitle`, and `durationMinutes`. An optional `appointmentLabel` requires that label in the final question. An optional ISO timestamp `requireInitialLinkSince` requires the link in initials authored at or after that date while preserving older no-link copy. Do not put another business's real booking URL into the repository.

Open the booking page yourself and verify its identity and displayed duration before recording that review. In PowerShell, for example, run these commands using your own reviewer name:

```powershell
$env:INTEGRATION_READS_ENABLED = 'true'
$env:VERIFICATION_REVIEWER = 'Your name'
$env:BOOKING_DURATION_CONFIRMATION = 'I verified the displayed appointment duration'
npm run verify -- booking
```

On macOS/Linux, use `export` for the same three environment variables before the npm command. The command reads the configured Google URL and checks that its redirect and page title match the configured canonical schedule. The named human review is the evidence for the displayed duration; the page-title check does not independently measure duration. The local signed result expires after at most one hour. The command does not book, draft, approve or send. If the page is unavailable, the title differs, the human duration review is missing, or the result expires, releases using the link fail closed. The verifier accepts Google appointment URLs only.

For an opted-in initial or follow-up 3, the message editor can add the configured link after the closing question. Mention the reviewed duration and any configured appointment label in that question. Follow-ups 1 and 2 cannot include it. A response can contain a booking link only after verified actual interest and its own fresh approval. A link click is not a booking; an associated accepted Calendar event must be read back.

## 5. Operate the held installation

While `npm start` runs, the worker evaluates scheduled work each minute. Operations shows durable jobs and local owner digest/alert previews. It performs no external reads with defaults and no outbound communication while held. `npm run worker` runs one safe cycle; `npm run doctor` lists real readiness gaps; `npm run backup` creates a consistent private SQLite backup.

For an optional Notion saved-view count, set `operations.notionApprovalViewId` to your own view ID, configure the existing Notion data source and token, and explicitly enable `INTEGRATION_READS_ENABLED`. The digest queries that saved view, checks pagination and completeness, and reports its count separately from local exact-copy approvals. If the view cannot be read completely, the digest job fails closed rather than estimating the view from local stages. A view count or an approval is not proof of send eligibility. This is a read-only view query; local approvals remain the authority for this generic application.

To project separate follow-up and response work rows, set `operations.projectCommunicationWork` to `true` and configure the Notion integration. Stable communication IDs keep those rows separate from the original prospect projection. Only system-owned projection properties are written. Projection writes still require their explicit integration-write authorization and do not check an approval box or transfer approval authority to Notion.

Use an existing machine for persistent operation and optional service templates in `deploy/`. No operating-system service, Codex automation or scheduled task is installed automatically. Verify restart/recovery and backup restore on the target machine. Do not expose the loopback console through a proxy without separately designing authentication and network controls.

## 6. Future activation remains separate

Installing, passing tests, collecting proof or checking message review does not grant sending permission. A future trusted operator must explicitly authorize verified activation using the library boundary, with all readiness checks passing, then deliberately configure the transport flags. There is no packaged one-click unlock. Activation expires within one hour, and exact-message approval/release, source freshness, suppression/history and caps still apply. This completion leaves the installation held.

The immediate onboarding action is `npm run setup`, followed by business configuration and `npm start`. No credential is needed for the offline demo or tests.
