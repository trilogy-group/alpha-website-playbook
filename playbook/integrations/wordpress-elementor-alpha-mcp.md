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

Use `get_page` to read support fields and the Elementor summary. Use `get_element` (by JSON pointer path, Elementor id, or CSS id) for the full stored settings of one element, including its responsive visibility, parent, and children; every diagnosis starts from stored settings, never from the public HTML. Use `find_elementor_component` with a stable ID, component name, exact person, exact text, attachment, recognized structure, CSS id (`elementId`), widget type, element type, CSS class, or a setting value (`settingEquals`).

Page-level reads (0.5.0): `get_page_inventory` lists every CSS id (with duplicates), widget, link with visibility, image with attachment id, and element hidden on every breakpoint. `list_revisions` says who saved the page and when, with the Elementor hash of each revision, which is how "did n8n or a person change this" is answered. `compare_to_template` reports section and CSS id drift against the campus template. `list_campus_pages` lists every campus page with its hash and last editor. `search_site` finds a string across pages with field paths. `access_report` lists users with rights, application passwords, plugins, and the plugin's own settings.

Zero matches and multiple matches are stop conditions. Do not choose the first result.

Recognized staff placement values are:

- `leadership`
- `existing_scroll`
- `existing_carousel`

Mutating an existing recognized scroll or carousel component can be supported. Creating or converting one from nothing is not; cloning an existing sibling, removing, moving, and tagging elements are structure-patch operations (below).

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

### Structure (0.5.0)

`prepare_elementor_structure_patch` and `apply_elementor_structure_patch` carry up to twenty operations on one page: `clone_element` (copy an existing sibling with fresh element ids and allowlisted text or link overrides; the CSS id is dropped unless `keepCssId`), `remove_element` (`expectedId` required; the last child of a container needs `allowEmptyParent`), `move_element` (reorder within the parent), `set_element_meta` (Elementor title, CSS id, CSS classes; this is how an untagged team card becomes `Team head`), `repeater_add_item` and `repeater_remove_item` (tabs, items, icon lists, slides; this is how FAQ items are added). The diff is limited to the touched parent or element, duplicate element ids are refused, and postconditions (child counts, ids present or absent, repeater counts) are checked on readback. Use it for the cases the content patch cannot reach: a missing CTA button (clone the Apply button with a new label and link), FAQ slots, untagged cards. Never use it on header, footer, navigation, or the campus template under a campus ticket.

### Post fields

Use `get_post_fields`, `prepare_post_fields_patch`, and `apply_post_fields_patch` for supported title, excerpt, body, and approved Yoast fields: `seo_title`, `seo_description`, `seo_noindex` (empty for the site default, `1` for noindex, `2` for index), and `seo_canonical` (absolute https URL or empty). Preserve block delimiters. Store the post-field snapshot for `restore_post_fields_snapshot`.

### Status

`set_post_status` is bounded but high impact. The ticket must name expected current and target status, approver, canonical behavior, sitemap expectation, and rollback. Scheduled changes (0.5.0): `newStatus: future` with `publishAt` schedules a publish; `unpublishAt` schedules a later change to draft through WP-Cron, listed by `list_scheduled_status_changes`. Seasonal popups: `list_popups` shows every Elementor popup with its conditions and timing; `set_popup_status` publishes or drafts one with the current status asserted. The scheduled APEX Alpha MCP path is not currently documented as integrated for these tools.

## Media

`upload_media_from_apex_asset` accepts an exact approved APEX asset, download URL, person mapping, filename, title, alt text, and expected SHA-256. The bridge validates the source and hash.

Version 1 does not fetch unreviewed Slack or Drive files. Overflow assets must be attached to the APEX ticket or another approved source record first.

Library operations (0.5.0): `search_media` finds attachments by file name, alt, title, person mapping, or APEX asset id, so an existing headshot is reused instead of re-uploaded. `get_attachment_usage` lists every page that references an attachment and is the precondition for `delete_attachment` (usage must be zero, file name asserted). `update_attachment_meta` sets alt text, title, caption, or description with current values asserted; this is the fix for media-identity findings. `replace_attachment_file` swaps the bytes behind an attachment while keeping its id and MIME type, with the same hash and person-mapping checks as upload, so every page that shows it updates at once.

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

## Governance (0.5.0)

- Every attested receipt is stored in WordPress (`alpha_mcp_receipt`) and exported by `list_receipts` (by ticket, object, operation, run id, result, or time). This is the trailing audit inside the site; the APEX ticket carries the same facts.
- `runId` on any write is recorded on the claims and the receipt; the intake agent passes its run id.
- Per-ability kill switch (`alpha_mcp_disabled_abilities`) and hourly rate limits (`alpha_mcp_rate_limits`, `*` for all writes) are set through the plugin's configuration endpoints and reported by `health`.
- The synced-target guard now lives in the plugin: CSS ids in `alpha_mcp_synced_css_ids` (and everything inside them) refuse content and structure edits unless the request carries `syncedOverride` with the APEX ticket and reason. Keep the option equal to `spec/synced-targets.json`.
- `compare_to_template` and `create_draft_from_template` read the template id from `alpha_mcp_campus_template_id`.

## Site operations (0.5.0)

- Redirects: `list_redirects` and `create_redirect` go through the Redirection plugin; a redirect must start at a non-home Alpha path and point at an https Alpha URL, never at itself, and never duplicate an enabled source.
- New campus pages: `create_draft_from_template` clones the campus template into a draft with fresh element ids and every CSS id kept, so n8n can address it. It never publishes.
- Batches: `prepare_batch_content_patch` prepares content patches on up to 25 pages and returns one `batchApprovalHash`; `apply_batch_content_patch` applies each page under its own idempotency key and reports per page. Use it for brand sweeps and group fixes.

## Tool versus actor support

The Alpha MCP bridge exposes 43 tools (`docs/tool-inventory.md` in the MCP repository), but the scheduled APEX Alpha path currently centers on staff add, staff copy update, and staff removal plus their media, recovery, cache, and verification steps. General content, structure, post fields, status, media library, redirect, template, and batch tools are implemented for the human Alpha MCP operator (and the website agent running in operator mode) and must not be assumed available to the scheduled agent.

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
