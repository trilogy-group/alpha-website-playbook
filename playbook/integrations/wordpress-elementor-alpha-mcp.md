# WordPress, Elementor, and Alpha MCP Runbook

Last verified: September 17, 2026  
Alpha MCP contract inspected: version 0.3.2

## Boundary

WordPress stores content and users. Elementor stores campus-page documents and global templates. Alpha MCP provides bounded read, prepare, apply, restore, cache, and verification operations. APEX remains the ticket, lease, approval, checkpoint, and evidence system.

Do not use WordPress as the durable edit surface for a value owned by HubSpot, n8n, Airtable, an event importer, or another source in `spec/source-authority.json`.

## Resolve before reading or writing

Use `resolve_page` with the exact URL. For a read:

```json
{
  "url": "https://alpha.school/example-campus/",
  "mutationIntent": "read"
}
```

For a live mutation, repeat with `mutationIntent: "live"` and the object ID already approved by APEX:

```json
{
  "url": "https://alpha.school/example-campus/",
  "mutationIntent": "live",
  "expectedObjectId": 1234
}
```

Stop on draft status, redirect ambiguity, duplicate slug, competing object, unexpected canonical URL, environment mismatch, or object mismatch.

## Read and locate

Use `get_page` to read support fields and the Elementor summary. Use `find_elementor_component` with a stable ID, component name, exact person, exact text, attachment, or recognized structure.

Zero matches and multiple matches are stop conditions. Do not choose the first result.

Recognized staff placement values are:

- `leadership`
- `existing_scroll`
- `existing_carousel`

Mutating an existing recognized scroll or carousel component can be supported. Creating, cloning, converting, or restructuring one is not.

## Prepare and apply

Every mutation follows:

1. Current ticket revision and lease
2. Canonical resolution
3. Source check
4. Exact component or field resolution
5. Full pre-change snapshot
6. Raw and semantic hashes
7. Prepare without writing
8. Review exact diff and public postconditions
9. Approve exact proposed semantic hash
10. Apply with fresh authorization
11. Readback
12. CSS, cache, and public verification

Do not submit raw Elementor document replacement through a broad custom endpoint. Use field-scoped or component-scoped tools.

### Staff preparation example

The preparation must bind the canonical URL, object, component, action, exact person, placement, expected semantic hash, ticket, and explicit asset mapping when a photo changes. A photo mapping includes person name, WordPress attachment ID, APEX asset ID, and `sourceConfirmed: true`.

Never identify a person or campus from appearance. The source must make the name-to-file relationship explicit.

### General content preparation

Use `find_text_occurrences` before `prepare_elementor_content_patch`. Confirm the expected occurrence count, duplicate responsive copies, exact element pointers, allowed fields, and expected current text. A change that crosses unapproved fields, removes a block signature, injects unsafe HTML, or matches an unknown element stops before apply.

### Post fields

Use `get_post_fields`, `prepare_post_fields_patch`, and `apply_post_fields_patch` for supported title, excerpt, body, and approved Yoast fields. Preserve block delimiters. Store the post-field snapshot for `restore_post_fields_snapshot`.

### Status

`set_post_status` is bounded but high impact. The ticket must name expected current and target status, approver, canonical behavior, sitemap expectation, and rollback. The scheduled APEX Alpha MCP path is not currently documented as integrated for this tool.

## Media

`upload_media_from_apex_asset` accepts an exact approved APEX asset, download URL, person mapping, filename, title, alt text, and expected SHA-256. The bridge validates the source and hash.

Version 1 does not fetch unreviewed Slack or Drive files. Overflow assets must be attached to the APEX ticket or another approved source record first.

Media standards are in `playbook/quality/accessibility-performance-browser-media.md`.

## Snapshots and hashes

- Raw hash proves byte-level identity of the stored snapshot.
- Semantic hash proves parsed Elementor meaning despite harmless serialization differences.
- Approval binds the proposed semantic hash.
- Restoration uses the full raw snapshot and verifies both hashes afterward.

WordPress revisions do not contain a dependable restore point for Elementor documents.

## Overlapping writers

Other active or exposed paths include APEX Elementor routes, an EMCP compatibility path, WordPress Abilities, a broad `custom/v1` route, browser users, n8n, and plugin importers. An APEX lease coordinates cooperating agents but cannot prevent a human or workflow from editing the page.

The current semantic hash must therefore be checked immediately before apply. A changed hash invalidates the old preparation.

## Tool versus actor support

The Alpha MCP bridge exposes 20 tools, but the scheduled APEX Alpha path currently centers on staff add, staff copy update, and staff removal plus their media, recovery, cache, and verification steps. General content, post fields, status, and reorder tools must not be assumed available to the scheduled agent.

Read `docs/actor-capability-matrix.md` before choosing an actor.

## Operator mode

Alpha MCP operator mode can allow an authenticated WordPress executor to write without an APEX-signed token while retaining prepare, hash, snapshot, capability, and receipt checks. The production policy for this mode is unresolved. Until the decision is recorded, human production work uses an APEX ticket and lease.

## Completion

WordPress readback alone is not completion. Follow the cache runbook and require `verified_pass` on the query-free canonical URL, plus desktop and mobile review and ring 3 when a shared surface was touched.

## Unsupported work

Alpha MCP does not authorize:

- New pages or templates
- New or cloned carousels or sections
- Arbitrary Elementor document replacement
- Unknown component structures
- Inferred image identities
- Workflow or plugin changes
- Unapproved legal, admissions, pricing, claim, or launch copy
- Scheduled browser fallback

Route structural work to the Elementor owner as a staged project.
