# Generic build specification

## Purpose and boundaries

Support one business per private local database through:

`Discovery → Research → Contact verification → Advisory priority → Exact draft → Human approval → Trusted release → Safe delivery → Reply handling → Interest → Approved response → Verified meeting → Learning`

Use existing business systems where available. The offline reference has zero external dependencies and zero additional infrastructure cost. An existing email account can incur its own provider costs; no paid enrichment, LLM, secondary domain or subscription is a prerequisite. Paid model use is neither configured nor required.

## Configuration contract

Identity includes business name, website, sender, Reply-To, display name, actual postal address and full signature. Offers have stable IDs, descriptions and relevant tags. ICP and markets describe intended research; headcount preferences only inform operators. Public source host allowlists constrain fetching. Advisory weights prioritize; thresholds never authorize or deny transport. Policy defines IANA timezone, weekdays, local send window, separate first-touch and combined mailbox caps, minimum spacing, up to three follow-up offsets, evidence age, inbound freshness and release lifetime up to one hour. Integration IDs and booking URL are business-specific values in ignored local config.

## Research and authoring

Capture public company-controlled source text, timestamp and digest. Link each fact to an exact source quote. Verify the person/role and exact published route independently; a shared or official free-mail business address may be on a different company page. Address the researched person by first name without implying personal mailbox ownership. A missing name may be displayed as `Hello,` during authoring but remains a research gap for release.

Represent message paragraphs as typed facts, possibilities, configured offers and questions. Facts must match cited text; hypotheses must remain honest possibilities. Reject unsupported assertions independently of valid citations. This bounded verifier deliberately does not approve arbitrary semantic paraphrases. Humans assess relevance, language, opportunity honesty and the applicable permission basis.

The writing standard uses an outcome-first possible payoff, prompt connection to a supported company fact, a small relevant next step, plain text, a single soft final question, and an accurate identity/address/opt-out footer. First-touch default limits are 50–80 main-copy words and 3–7 subject words within 36–50 characters. Follow-ups and real responses use their own context rather than first-touch length limits. Compare up to ten stored drafts and flag repeated subjects, openings or questions; a smaller available portfolio cannot prove full cohort review.

## Approval and release

The authenticated loopback console supports an individual trusted human reviewing the exact recipient, subject, body, claims, route, suppression and outreach permission. Stale edits/reviews are refused. Approval stores a digest binding content, business configuration, evidence and purpose. Copy edits clear approval and release. Refreshing source evidence invalidates an unsent approval. Attempted messages are immutable.

Approval and trusted technical release are separate. A release binds tenant, message, exact digest, sender, Reply-To, recipient, purpose, parent, thread and touch order. It expires within one hour and within the authenticated sender proof lifetime. Signer keys are held by trusted local operator processes, never by a model, browser or projection. Simulation keys/artifacts cannot clear production. Production sender proofs must derive from actual received authentication/TLS, reply routing, suppression, unsubscribe and healthy inbound artifacts collected outside the demo.

## Transport and recovery

Disabled mode exits before provider access, reservations or mutations. Live transport additionally requires the explicit three send flags, production evidence/proof/release and the Gmail adapter. Fresh sender identity and thread checks precede atomic SQLite reservation. Recheck exact content, source/permission/suppression, release expiry and send window before transport. Reservations count toward caps, including ambiguous outcomes. Never automatically retry a send after provider timeout or uncertain local persistence. Reconcile provider Sent manually; preserve history rather than deleting attempts.

Overflow is held and a next eligible window is recorded. The durable worker reconsiders approved/released work in later eligible windows while the application runs. Installation activation, source/proof expiry and every transport guard are rechecked. The local database supports multiple workers on the same machine through serialized transactions; it is not a distributed queue or multi-tenant hosted service.

## Lifecycle and outcomes

Initial approval may authorize up to three individually authored follow-ups. Every touch still needs fresh sources and its own signed purpose release; no template automatically inherits clearance. Any inbound reply, bounce or unsubscribe cancels the sequence. Bounce/opt-out suppresses the exact route; unrelated addresses on the same free-mail provider are unaffected. Responses require their own exact-copy approval and current inbound context. New inbound invalidates pending response approvals.

By default, provide a booking URL only in an approved response to explicit verified interest. An optional verified Google schedule experiment permits the configured link in initials and follow-up 3; follow-ups 1 and 2 remain link-free. A response still needs verified interest and its own approval. An actual provider event, matching organizer, accepted recipient and valid time interval, associated with a sent booking link or an approved interest response, is required to mark confirmed. Cancellations update the durable outcome. Link clicks and mock events never prove actual bookings.

Track technical provider acceptance separately from delivery and commercial outcomes. Audit every material state change; log no credentials. Cost accounting starts at zero and records actual supplied costs; it does not measure external subscriptions automatically. Learning reports observations and recommendations and never changes scores, caps or autonomy itself.

## Release acceptance

Require passing offline lifecycle, failure, concurrency, persistence, evidence, identity, approval, release, history, cap, clock/DST, reply/bounce/cancellation and booking tests; secret/private-data scan of the complete staged tree; newly authored provenance review; and a fresh Git history. The operator console, durable scheduler, owner outbox, source watch, broader inbound parsing, evidence collector, checksummed migrations, backup and exact Sent reconciliation are implemented. Live credential/recipient/owner verification and explicit production activation remain business-specific authorized steps.
