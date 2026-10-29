# Signal-to-Meeting Engine

An open-source, locally operated business application for evidence-backed outreach, individual human review, follow-ups, replies and interest-led meetings. Business identity, offerings, research sources and operating policy are configurable.

**Ready to install in send-disabled mode. Each business's live integration verification remains pending until genuine evidence is supplied.** Environment flags alone cannot activate sending. The installation also requires fresh authenticated sender/integration verification and separate human activation. Neither setup, the console nor the verification commands enable sending.

## Install and open locally

Requirements: Git, Node.js 24+ (including npm), and an existing computer. No npm dependencies, database server, Docker, paid enrichment or model subscription is required.

```sh
git clone https://github.com/hunterbell3122-lab/signal-to-meeting-engine.git
cd signal-to-meeting-engine
npm run setup
npm start
```

Open `http://127.0.0.1:3401`. Sign in with the `admin` value in your private, ignored `runtime/keys.json` file. Setup creates configuration, separate random operator credentials and a local SQLite database without overwriting existing files. Keep credentials private. For platform-specific steps, checks, configuration, and troubleshooting, follow the [local installation guide](docs/SETUP.md).

After signing in, complete the **Setup Interview** to configure the business, offer, research sources, outreach rules and optional connection details. Review your answers, save, then restart the application. The interview preserves existing data, creates a sending hold and does not activate integrations or sending. Each fresh installation receives its own tenant ID and local database; use a separate copy for each business. Keep `DRY_RUN=true`, `LIVE_SEND_ENABLED=false`, `CONTROLLED_AUTONOMY_ENABLED=false` and `OWNER_EMAIL_ENABLED=false` until separately authorized. Read access has its own switches and is off by default. No live email, Gmail draft, deployment or account mutation is performed during installation.

## Everyday workflow

1. Record or import a researched company, person/role and exact published business route.
2. Capture approved official sources. Pasted evidence cannot clear production.
3. Author supported facts, honest possibilities and a useful question. Review the exact recipient, subject and body.
4. Record permission and individual human approval. Evaluate the separate technical release.
5. Use Operations for scheduled work, held delivery, owner digest/alert previews and audit. Read verified inbound context before authoring any response.
6. Use Verification and `npm run doctor` to see the business's unresolved checks. The console provides no send or activation endpoint.

The running application executes durable scheduled jobs for mailbox/DSN reads, source watch, sequence planning, associated Calendar reads, Notion projection, delivery admission and owner notifications. Reads/writes and every outbound channel remain independently gated. Restart recovery, leases, bounded read retries and uncertain-send reconciliation are implemented. The host must remain running; optional service templates do not install themselves.

## Safety and capability

Scores and headcount remain advisory. Exact source/contact association, honest claims, current permission/suppression/history, human approval, signed purpose/thread/touch-bound releases, mailbox identity, expiry, caps, local windows and pacing remain required. Replies, bounces and opt-outs cancel sequences. Responses need fresh exact-copy approval. An optional experiment allows a verified Google booking link in initials and third follow-ups; middle follow-ups stay link-free and responses still require verified interest. Provider acceptance, simulations and link clicks do not prove delivery, meetings or revenue.

Gmail, Calendar, Notion and public-source adapters are included. The mailbox verifier reads six existing, selected owned-inbox artifacts, checks receiving authentication/TLS, exact delivered copy, mirrored replies and unsubscribe, and records local suppression enforcement. It sends nothing and cannot create proof from simulation. Each business must provide its own accounts and actual artifacts; this repository contains none.

```sh
npm run doctor
npm run worker
npm run backup
npm run check
npm run demo
```

The separate fictional demo always uses mocks and can be viewed with `npm run dashboard` on port 3400. Integration verification and reconciliation commands are described in the setup/operations guides. An optional digest reads the actual configured Notion saved view and reports it separately from local approval counts; an incomplete query fails closed. CI is manually triggered and requires no deployment credentials.

## Guides

- [Business installation walkthrough](docs/SETUP.md) and [readiness checklist](docs/BUSINESS_READINESS.md)
- [What this repository implements and what remains separate](docs/CURRENT_IMPLEMENTATION.md)
- [Capabilities and verification limits](docs/CAPABILITIES.md), [architecture](docs/ARCHITECTURE.md), [build specification](BUILD.md)
- [Security and approval](SECURITY.md), [writing](docs/WRITING.md), [operations/recovery](docs/OPERATIONS.md)
- [Customization/migration](docs/CUSTOMIZATION.md), [schema](schema/README.md), [validation](docs/VALIDATION.md)
- [Gmail](docs/integrations/GMAIL.md), [Calendar](docs/integrations/CALENDAR.md), [Notion](docs/integrations/NOTION.md), [research](docs/integrations/RESEARCH.md)
- [Provenance and reuse status](LICENSE_STATUS.md)

## Supporting the project

The repository is configured for GitHub Sponsors. Sponsorships become available after the owner's GitHub Sponsors profile is approved and payout setup is complete.

This is a single-business local deployment, not a hosted multi-tenant CRM. It does not promise unrestricted semantic claim verification, web-wide discovery, autonomous prose authoring or commercial results. Source and message authoring remain explicitly reviewed. The private hosted implementation's recurring controlled-test sender renewal and automated daily discovery are not included; the local verifier reads existing owned-inbox artifacts without sending. No original production data/history or third-party source text is included. This repository is available under the [MIT License](LICENSE).
