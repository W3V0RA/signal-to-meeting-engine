# Notion projection setup

Offline use uses `MockNotion` and needs no integration token. The default engine does not write to Notion, and no original page or data source is included.

For a later authorized integration, create/share your own data source with an integration. Configure its data-source ID and private token; do not confuse a database container ID with the collection's data-source ID. Add these properties:

| Property | Type |
|---|---|
| Name | Title |
| Engine ID | Rich text |
| Engine State | Rich text |
| Next Action | Rich text |

The adapter uses Notion API version `2025-09-03`, queries the stable Engine ID before creating a page, and updates only the system-owned properties above. More than one matching page fails closed. A local checkpoint avoids repeating unchanged writes. Creation uncertainty is reconciled by querying the stable ID on retry; simultaneous external creations are not a transactional guarantee. A distributed writer needs stronger coordination.

The adapter includes a read-only data-source/property-mapping check. Enable integration writes only within a separately authorized rollout. `syncNotion()` returns dry run before calls unless writes are enabled and dry run is false. The [data-source query reference](https://developers.notion.com/reference/query-a-data-source) documents the collection boundary.

Exact drafts and human approvals remain canonical in the local engine. Notion checkboxes do not authorize delivery. Human copy is never overwritten by this projection. Inbound facts are summarized through state/work and audit; approval occurs in the local authenticated exact-copy console. Arbitrary CRM field mapping and bidirectional human-edit reconciliation are outside the shipped system-owned projection. Extend them with explicit authority and readback tests before live use.
