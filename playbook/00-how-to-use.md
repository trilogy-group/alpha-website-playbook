# How to Use the Alpha Website Playbook

Use this page first whenever you receive an APEX Website or Website QC ticket. The goal is to determine what owns the requested value, whether your actor can change it, and what proof is required before the ticket can close.

This playbook covers the Alpha public WordPress site only. It does not authorize changes to sister-brand sites.

## The five-minute model

The visible website is not always the source of its content.

```text
APEX request and lease
    -> authoritative source
    -> delivery workflow
    -> WordPress or Elementor destination
    -> Elementor, WP Engine, and Cloudflare caches
    -> canonical public URL
    -> APEX evidence and closure
```

Common source and delivery paths:

| Public content | Change it here | How it reaches the site |
| --- | --- | --- |
| Campus state, address, grades, tuition, phone, email, intro text, application and booking values | HubSpot Programs, usually through the APEX campus editor or an authorized HubSpot person | n8n campus workflow to Elementor |
| Staff names, titles, biographies, and headshots | Approved APEX ticket and asset | Alpha MCP staff tools for supported structures |
| Public events | HubSpot Marketing Events | WordPress event import plugin, about every 30 minutes |
| Alpha Answers | Airtable | Alpha Answers import |
| Community destination identity | Visible Community program joined by exact HubSpot Program ID | Growth map or WordPress CTA, depending on the surface |
| Page-owned static copy, links, media, and SEO | WordPress or Elementor, when the field map says direct | Alpha MCP when the actor and operation are supported |

The complete registry is `spec/source-authority.json`. Never patch a downstream Elementor value when that registry names another source.

## Ticket procedure

### 1. Read and validate the ticket

Read the entire request, comments, attachments, effective date, and prior execution state. Then run the intake validator when you have an export:

```bash
node tests/validate-ticket.mjs --file <tickets.json> --contract
```

The ticket must identify the page or surface, requested outcome, authoritative source or approved replacement, requester, owner, done condition, and evidence requirement. Missing information produces a Missing Info response. Do not invent it.

### 2. Search for duplicate or related work

Search APEX for the canonical URL, campus slug, affected person or field, and the exact requested value. Link related tickets. Do not create a second ticket for a defect that is already open.

The playbook repository does not currently provide a queue-search CLI. Use the APEX user interface or API available to your actor and record the related ticket IDs. This is a documented tooling gap, not permission to skip deduplication.

### 3. Resolve the public page and source

For a campus field, run:

```bash
node tests/diagnose-field.mjs --url https://alpha.school/<campus>/ --element <field-map-key> --json diagnosis.json
```

For a WordPress operation, call Alpha MCP `resolve_page` with `mutationIntent: read` first. Before any live mutation, resolve again with `mutationIntent: live` and the expected object ID. A draft, preview URL, redirect target mismatch, duplicate slug, or competing object is a stop condition.

Read:

- `spec/campus-page-field-map.json` for campus fields
- `spec/source-authority.json` for site-wide source ownership
- `docs/website-architecture.md` for delivery paths

### 4. Confirm the actor and tool

Read `docs/actor-capability-matrix.md` and `spec/actor-capabilities.json`.

Tool availability does not imply scheduled-agent support. The Alpha MCP bridge exposes more operations than the APEX scheduled worker currently routes. If your actor is not marked allowed and tested for the exact operation, stop and route the ticket to the named owner.

Unattended browser mutation is not a fallback.

### 5. Choose production or staging

Read `protocols/production-and-staging.md`.

Production requires an eligible APEX ticket, canonical object resolution, an approved execution path, collision control, a rollback artifact, and a public verification plan. Unknown structure, global code, new components, new pages, plugin changes, workflow changes, and untested operation types go to staging first.

### 6. Claim the ticket and lease

APEX owns the claim and website lease. The canonical API path is:

```text
POST /api/agent/tasks/{ticketId}/claim
```

The Alpha MCP helper can use that path when its endpoint template is configured:

```bash
APEX_CLAIM_ENDPOINT_TEMPLATE='/api/agent/tasks/{ticketId}/claim' \
node <alpha-mcp-repo>/bin/alpha-mcp-apex-claim.mjs <ticket-id>
```

Do not copy credentials into a command, ticket, or repository. A `409` lease conflict, expired lease, changed ticket revision, unresolved prior checkpoint, or mismatched page hash stops the new operation. Follow `protocols/apex-website-ticket-protocol.md` and `protocols/rollback-and-incidents.md`.

### 7. Prepare before applying

Open the recipe named by `spec/ticket-classes.json`. Preparation must produce:

- Canonical URL and object ID
- Exact target component or field
- Before value and semantic hash
- Proposed diff and proposed semantic hash
- Complete snapshot or supported post-field restore artifact
- Public present and absent checks
- Expected cache steps

Review the prepared diff. It must touch only the ticketed fields. Approval applies to the exact prepared hash, not a general instruction.

### 8. Apply and record checkpoints

Apply only while the same ticket revision, lease, object ID, current semantic hash, actor, and environment remain valid. Store each receipt in APEX. Do not reuse an approval across pages or changed preparations.

### 9. Recover caches

Follow `playbook/integrations/cache-and-public-verification.md`:

1. Confirm the write by readback.
2. Regenerate page-scoped Elementor CSS when required.
3. Batch WP Engine clear-all operations when required.
4. Purge exact Cloudflare URLs when the approved provider path is available.
5. Treat stale public output as `unverified`, not success.

### 10. Verify and close

Run all three rings in `protocols/apex-website-ticket-protocol.md`:

1. Exact ticketed outcome on the canonical public URL
2. Whole-page structure, content, links, identity, desktop, and mobile
3. Two untouched pages after any shared-template, global CSS, or site-wide cache action

Only `verified_pass` can complete a ticket. `verified_failure` requires correction or rollback. `unverified` remains open.

Record the actor, environment, ticket and lease, canonical URL, object ID, before and after values, hashes, snapshot, receipts, cache actions, screenshots, verification time, result, and playbook commit.

## Stop conditions

Stop before writing when any of these is true:

- The canonical page or backing object is ambiguous.
- The field's authoritative source is unknown or disagrees with another source without a precedence rule.
- Your actor is not allowed and tested for the operation.
- The ticket, lease, approval, or expected hash is missing or stale.
- The Elementor structure is unknown or the target matches zero or multiple components.
- A person-to-photo mapping is not explicit.
- The replacement copy, destination, asset, or approver is missing.
- The request affects legal text, claims, pricing, admissions, launch timing, a global template, a plugin, or a workflow without the required owner.
- Public verification is unavailable after bounded retries.
- A previous execution has unresolved prepared, applied, rollback, or owner-review state.

Write the exact blocker and owner on the APEX ticket. Do not substitute a browser edit or another endpoint.

For brand/design work, first resolve `registry/sources.json` → `brandVisual` and read `playbook/site/visual-brand.md`. Do not promote historical Slack/Drive documents into current guidance or use sources explicitly marked retired.

## Where to look next

| Need | File |
| --- | --- |
| Full ticket lifecycle | `protocols/apex-website-ticket-protocol.md` |
| Production and staging choice | `protocols/production-and-staging.md` |
| Rollback and incidents | `protocols/rollback-and-incidents.md` |
| Source ownership | `spec/source-authority.json` |
| Actor support | `docs/actor-capability-matrix.md` |
| Campus field writer | `playbook/campus-page/field-map.md` |
| HubSpot and n8n | `playbook/integrations/hubspot-and-n8n.md` |
| WordPress, Elementor, and Alpha MCP | `playbook/integrations/wordpress-elementor-alpha-mcp.md` |
| Cache and verification | `playbook/integrations/cache-and-public-verification.md` |
| Forms and admissions | `playbook/integrations/forms-and-admissions.md` |
| SEO and LLM publishing | `playbook/integrations/seo-and-llm-publishing.md` |
| Page-family requirements | `playbook/page-families/README.md` |
| Owners | `playbook/responsibilities.md` and `registry/people.json` |
