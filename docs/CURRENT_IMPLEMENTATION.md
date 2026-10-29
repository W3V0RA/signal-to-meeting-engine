# What this repository is

Signal-to-Meeting Engine is a configurable, single-business local application for researching businesses, preparing sourced outreach, recording human review, managing follow-ups and recording observed replies and meetings. Its local database is the system of record. Gmail, Google Calendar and Notion are optional integrations; the shipped installation starts with sending and external reads disabled.

This repository is an independently written generic implementation. It does not contain another business's credentials, prospects, messages, proof, approvals or operating database. The local app is not the private hosted implementation and does not deploy or control it.

| Capability | Generic implementation | Current boundary |
| --- | --- | --- |
| Research and five-contact target | Configured source watch, named-contact and exact-route evidence, and an optional daily count of distinct newly sourced drafts | No autonomous web-wide research or prose authoring; a human or separate authorized researcher supplies candidates. The progress counter does not imply approval or delivery. |
| Draft quality | Optional three-part brief, framework, source-bound facts, configurable word/subject rules and comparison of current drafts | Exact citation checks are conservative; a human still reviews meaning, copy and any proposed workflow. |
| Approval and history | Optional unapproved technical baseline before initial/response approval; signed purpose-bound releases, preserved local source and approval snapshots, optional separate stable Notion communication rows | The generic console records approval locally. Notion is a projection; a Notion checkbox does not authorize this app's sending. |
| Capacity and follow-ups | Configurable combined daily cap, separate initial/shared spacing, up to three ordered personalized touches and optional gaps from actual prior sends | Owner-notification capacity is shared by default and can be explicitly separated. Follow-ups stop on inbound. |
| Booking | Optional verified Google schedule in initials and follow-up 3; actual accepted Calendar event for confirmation | Follow-ups 1 and 2 remain link-free. Responses require real interest and separate approval. Schedule identity is read from Google; a named human reviews the displayed duration. |
| Digest | Local approval and follow-up counts and optional actual saved Notion view count | View rows and local approvals are reported separately; neither proves a message can send. |
| Sender proof | Read-only collection of six existing owned-inbox artifacts, with configurable expiry bounded by actual artifacts | The private hosted deployment's recurring controlled-test send, reply/opt-out test and guarded authority restoration have not been ported. Each installation still needs real proof and a separately authorized activation. |

The optional `config/recent-policy.example.json` expresses the recent operating limits without any real account identifiers. The example is a partial policy, not a configuration to run unchanged or a grant of sending permission. See [local setup](SETUP.md), [business readiness](BUSINESS_READINESS.md), [writing](WRITING.md) and [validation limits](VALIDATION.md).
