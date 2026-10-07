# Integration Runbooks

Use these pages after source diagnosis identifies the system that owns or delivers the requested value.

- `hubspot-and-n8n.md`: Program fields, APEX editor, HubSpot readback, n8n mapping, execution, recovery, and verification.
- `program-data-reliability.md`: shared reader pagination versus mapping duplicates, HubDB primary aliases, isolated publication, fresh execution proof, downstream validation and partial imports. Contract: `spec/program-data-reliability.json`; new automated safeguards are not yet deployed.
- `wordpress-elementor-alpha-mcp.md`: WordPress object resolution, Elementor, Alpha MCP, overlapping writers, and bounded mutations.
- `cache-and-public-verification.md`: Elementor CSS, WP Engine, Cloudflare, canonical verification, and batches.
- `forms-and-admissions.md`: HubSpot forms, `submission_campus`, Finalsite, payments, UTM behavior, and safe QA.
- `seo-and-llm-publishing.md`: canonicals, sitemaps, robots, noindex, redirects, schema, Markdown pages, LLM exports, and Alpha Answers.

Existing specialized system maps remain in:

- `playbook/site/content-pipelines.md`
- `playbook/site/community-routing.md`
- `playbook/site/info-packets.md`

Runbooks explain operations. `spec/source-authority.json` remains the machine-readable authority registry.
