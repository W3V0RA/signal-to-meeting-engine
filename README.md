# Signal-to-Meeting Engine

A private, reusable reference implementation for turning verified business signals into reviewed outreach and interest-led meetings. Customize the business, offers, markets and policy in configuration. Research facts, hypotheses, recommendations and execution remain distinct.

**Ready for offline use. Live operation is not verified or enabled.** The project is newly authored from inspected predecessor requirements, with no imported prospect records, credentials, source history or third-party writing text. No open-source license is granted; see [reuse status](LICENSE_STATUS.md).

## Start here

Install Node.js 24 or newer. No database server, Docker, subscription or external account is required.

```sh
npm test
npm run demo
npm run dashboard
```

Open `http://127.0.0.1:3400`. The dashboard is a read-only view of the fictional demo. Stop it with Ctrl+C. The demo creates a fresh ignored `runtime/demo-...` folder each time and uses mock providers even if live environment variables exist. It never sends mail or writes to an external system.

The demo shows discovery, captured evidence, a named contact at a separately verified shared inbox, outcome-first copy, simulated human approval, signed simulated release, simulated delivery, reply cancellation, separately approved response, interest-gated booking, mock Notion projection, audit and learning. Every result is fictional; provider acceptance is not proof of inbox delivery or revenue.

## Customize for your business

```sh
cp config/example.json config/local.json
cp .env.example .env
```

On Windows use `Copy-Item` instead of `cp`. Update business identity, offering, ICP, markets, public sources, sender, reply route, signature, postal address, timezone, caps, pacing, cadence, booking URL and integration IDs. Keep `DRY_RUN=true`, `LIVE_SEND_ENABLED=false` and `CONTROLLED_AUTONOMY_ENABLED=false`. The demo deliberately uses the example configuration; your private settings are used by your local integration runner described in [setup](docs/SETUP.md).

Numerical scores and headcount are advisory and cannot block a prospect. Company facts, exact published contact routes, accurate copy, reviewed outreach permission, suppression/history, approval, authenticated expiring releases and sender proof remain hard gates.

## What's included

| Area | Implementation |
|---|---|
| Core | Configurable policies, evidence/contact checks, claim-structured copy and advisory scoring |
| Safety | Exact-copy human approval, purpose/thread/touch-bound HMAC releases, expiry, suppression and consent |
| Delivery | Atomic local reservation, duplicate/history guards, caps, timezone/window/spacing, uncertain-send holds |
| Lifecycle | Personalized follow-up work, cancellation, reply/bounce/opt-out parsing, fresh response approval |
| Meetings | Interest gate and read-only Calendar adapter; confirmed accepted event required |
| Integrations | Gmail, public-web, Notion and Calendar adapters with injectable offline providers |
| Operations | Durable SQLite state, localhost demo dashboard, audit, cost totals, synthetic evaluations and CI |

See the [capability matrix](docs/CAPABILITIES.md) for exact limitations. This is a local library and reference workflow, not a deployed unattended sales service. Automatic broad prospect discovery, unrestricted semantic claim verification, trusted production preflight collection, scheduled digest delivery and live integration proofs remain explicit gaps.

## Documentation

- [Setup walkthrough](docs/SETUP.md) and [customization/migration](docs/CUSTOMIZATION.md)
- [Generic build specification](BUILD.md), [architecture](docs/ARCHITECTURE.md) and [capability matrix](docs/CAPABILITIES.md)
- [Approval and security](SECURITY.md), [writing guidance](docs/WRITING.md) and [operations](docs/OPERATIONS.md)
- [Gmail](docs/integrations/GMAIL.md), [Notion](docs/integrations/NOTION.md), [Calendar](docs/integrations/CALENDAR.md) and [research](docs/integrations/RESEARCH.md)
- [Schema and migration](schema/README.md), [validation](docs/VALIDATION.md) and [reuse/provenance](LICENSE_STATUS.md)

Run `npm run check` for tests, synthetic evaluations and the privacy scan. CI runs those checks without external credentials; there is no deployment or send workflow.
