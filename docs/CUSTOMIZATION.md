# Customization and migration to a new business

Use a new private configuration and a fresh database for each business. No original company's records or integration IDs are bundled. Start with fictional data to understand the gates, then research one candidate for your own offering.

| Setting | Replace with |
|---|---|
| Tenant and business identity | A new stable business identifier and accurate identity |
| Sender and Reply-To | An existing authorized account/verified alias and working reply route |
| Signature/postal address | Approved actual identity, website and complete business address |
| Offers and tags | Services/products your business can accurately provide |
| ICP and markets | Intended sectors/regions; size remains advisory |
| Discovery | Approved public company-controlled sources and exact host allowlist |
| Priority weights | Human-selected advisory weights totaling one |
| Timezone/window/caps/spacing | Conservative business-approved policy; combined mailbox cap includes responses and follow-ups |
| Follow-up days | Up to three ascending offsets, individually authored with useful new context |
| Writing rules | Suitable subject and first-touch ranges; accurate footer and clear reply unsubscribe remain mandatory |
| Integrations | Your own Gmail/Notion/Calendar identifiers and real booking URL |

Offer routing is a human-selected `offerId` with advisory tag relevance. The core does not invent a problem based on a company sector or headcount. A service business, manufacturer or software company can define different offers without modifying transport logic. Research sources, wording and opportunity fit still require real business review.

For migration from another CRM, import only authorized data into an ignored local file. Map companies, people, route evidence and activity to the neutral entities; deduplicate by stable IDs and domain/route. Old scores, headcount fields, inferred emails and CRM stages are not proof. Re-capture sources, verify contacts, review permission and author exact drafts anew. Do not import old approvals or releases. Import historical provider thread/attempt and suppression state through a reviewed migration so previous contact and opt-outs cannot be forgotten. No general historical-import CLI is shipped; use an audited local migration with dry-run counts and backup/rollback.

Every source/policy/identity change can invalidate unsent approvals. A sent initial's follow-up authorization remains tied to the original immutable message and business policy, while new touches need current sources and new exact releases. Preserve sent history and human edits. Notion is a system-owned projection; its old checkboxes cannot silently authorize new delivery.

When adding a new adapter: inject its transport, verify identity, use deterministic integration IDs, preserve purpose/thread boundaries and uncertain outcomes, and add isolated failure tests before live integration verification. Record any dependency's actual license and notices. Do not copy private third-party source just because the destination repository is private.
