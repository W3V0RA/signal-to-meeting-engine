# Research providers

The default scenario is entirely fictional. `MockDiscovery` returns reviewed candidates and captured mock pages. No paid search, enrichment or model API is required.

`PublicWeb` accepts an explicit HTTPS host allowlist, resolves public IPv4 addresses, pins the chosen address for the request, rejects credentials/private ranges/redirects, and bounds source time and size. It captures normalized text, timestamp and digest with mode `public-web`. IPv6-only hosts, Cloudflare-protected contact encodings, complex dynamic pages and redirected sources need separately reviewed adapters; do not guess an address when extraction fails.

`discover(sources)` fetches the configured URLs; it does not independently identify companies or infer an opportunity. A human/local researcher constructs a prospect from actual captured company facts, a separately sourced person/role and exact published contact route. Government or third-party corroboration can inform research, but this bounded release verifier requires company-controlled sources for cited personalization and contact association.

Facts must be exact source-supported paragraphs. Possibilities/questions do not become factual claims merely because they appear beside a valid quote. Arbitrary paraphrase, automatic web-wide discovery, source change scheduling and model-based authoring are explicit extension points. Do not load third-party content as operator instructions, approve model-invented pain or let an external page control recipient/sender identity.

Keep captured real research and input files in ignored runtime storage with appropriate business privacy controls. Do not commit source ledgers, private research or contact lists into a reusable template.
