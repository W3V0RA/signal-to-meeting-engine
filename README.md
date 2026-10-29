# Signal-to-Meeting Engine

A private, generic business application for evidence-backed outreach, individual human review, follow-ups, replies and interest-led meetings. Business identity, offerings, research sources and operating policy are configurable.

**Ready to install in send-disabled mode. Each business's live integration verification remains pending until genuine evidence is supplied.** Environment flags alone cannot activate sending. The installation also requires fresh authenticated sender/integration verification and separate human activation. Neither setup, the console nor the verification commands enable sending.

## Install and open locally

Requirements: Git, Node.js 24+ (including npm), and an existing computer. No npm dependencies, database server, Docker, paid enrichment or model subscription is required. The repository is currently private; cloning requires access.

```sh
git clone https://github.com/hunterbell3122-lab/signal-to-meeting-engine.git
cd signal-to-meeting-engine
npm run setup
npm start
```

Open `http://127.0.0.1:3401`. Sign in with the `admin` value in your private, ignored `runtime/keys.json` file. Setup creates configuration, separate random operator credentials and a local SQLite database without overwriting existing files. Keep credentials private. For platform-specific steps, checks, configuration, and troubleshooting, follow the [local installation guide](docs/SETUP.md).

Copy/customize `config/local.json` for the business before importing real data. Use a new tenant ID and database path for each business. Keep `DRY_RUN=true`, `LIVE_SEND_ENABLED=false`, `CONTROLLED_AUTONOMY_ENABLED=false` and `OWNER_EMAIL_ENABLED=false`. Read access has its own switches and is off by default. No live email, Gmail draft, deployment or account mutation is performed during installation.

## Everyday workflow

1. Record or import a researched company, person/role and exact published business route.
2. Capture approved official sources. Pasted evidence cannot clear production.
3. Author supported facts, honest possibilities and a useful question. Review the exact recipient, subject and body.
4. Record permission and individual human approval. Evaluate the separate technical release.
5. Use Operations for scheduled work, held delivery, owner digest/alert previews and audit. Read verified inbound context before authoring any response.
6. Use Verification and `npm run doctor` to see the business's unresolved checks. The console provides no send or activation endpoint.

The running application executes durable scheduled jobs for mailbox/DSN reads, source watch, sequence planning, associated Calendar reads, Notion projection, delivery admission and owner notifications. Reads/writes and every outbound channel remain independently gated. Restart recovery, leases, bounded read retries and uncertain-send reconciliation are implemented. The host must remain running; optional service templates do not install themselves.

## Safety and capability

Scores and headcount remain advisory. Exact source/contact association, honest claims, current permission/suppression/history, human approval, signed purpose/thread/touch-bound releases, mailbox identity, expiry, caps, local windows and pacing remain required. Replies, bounces and opt-outs cancel sequences. Responses need fresh exact-copy approval; booking links require explicit verified interest. Provider acceptance, simulations and link clicks do not prove delivery, meetings or revenue.

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
- [Capabilities and verification limits](docs/CAPABILITIES.md), [architecture](docs/ARCHITECTURE.md), [build specification](BUILD.md)
- [Security and approval](SECURITY.md), [writing](docs/WRITING.md), [operations/recovery](docs/OPERATIONS.md)
- [Customization/migration](docs/CUSTOMIZATION.md), [schema](schema/README.md), [validation](docs/VALIDATION.md)
- [Gmail](docs/integrations/GMAIL.md), [Calendar](docs/integrations/CALENDAR.md), [Notion](docs/integrations/NOTION.md), [research](docs/integrations/RESEARCH.md)
- [Provenance and reuse status](LICENSE_STATUS.md)

This is a single-business local deployment, not a hosted multi-tenant CRM. It does not promise unrestricted semantic claim verification, web-wide discovery, autonomous prose authoring or commercial results. Source and message authoring remain explicitly reviewed. No original production data/history or third-party source text is included, and no open-source redistribution license has been invented.
