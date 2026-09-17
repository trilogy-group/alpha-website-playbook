# Small batch findings (2026-09-17)

First run of the upgraded system on live tickets: plugin 0.5.2, policy bundle 585ede26a165, release manifest 2026-09-17.2, run by a fresh agent from the playbook alone (brief and scored sheet in the marketingsupport workspace, `work-assets/apex-website-tickets/small-batch-2026-09-17/`). Six tickets, chosen so that three could execute or split and three must not touch WordPress.

## Result

| Measure | Value |
| --- | ---: |
| Decisions correct | 6 of 6 |
| Evidence complete | 6 of 6 |
| WordPress writes | 0 |
| Receipts for the run | 0 |
| Wall time | 29 minutes |

Every ticket ended in the right state: Boston no-defect to For Review (the observer ticket was stale), Santa Barbara split with the layout part routed, Bethesda Missing Info to the campus, Houston and McLean routed to the HubSpot program admin with audit lines, Chicago packet routed to the packet owner with brand-authority added for the rename. The one sheet expectation that was wrong (Boston) was the reviewer's, not the agent's.

Every failure the agent hit was in tooling or registries, never in judgment. That is the useful outcome of the batch.

## Fixed in this commit

- `tests/rendered-controls.mjs` now takes `--screenshots <dir>` (full-page desktop and mobile PNGs, ring 2) and checks every `book_a_call_*` widget by CSS id. Houston's two widgets are relabelled "Join The Community" and hidden on every breakpoint; the label-based check passed them, the id-based check fails them.
- `tests/page-check.mjs` `cta-hidden-everywhere` no longer counts a hidden placeholder (label "update link" or href ending in `/...`) as a hidden CTA, which matches `spec/campus-page-controls.json`. Five pages were failing on the `resource_2` placeholder.

## Fixed elsewhere

- Alpha MCP bridge: `list_receipts` ignored the `runId` and ticket filters because the bridge moved them into operator claims (MCP PR, bridge only).

## Reported to the intake rewrite in progress

- Intake overwrites `customFields.checkId` with the class, which destroys the observer id (SITE-31323DE752 on Boston).
- Intake replaces assignees instead of merging (Houston lost Farhan Raja and Yash Chitneni).
- An unresolved owner role resolves to an empty string and the ticket ends unowned.

## Decisions needed (owners)

1. **Book a Call writer.** `playbook/campus-page/controls.md` says n8n has written show/hide and the URL since 2026-03; `spec/campus-page-controls.json` says unverified; `spec/campus-page-field-map.json` calls hero CTAs `wordpress-direct`; `spec/synced-targets.json` and the plugin's synced ids do not include `book_a_call_1/2`, so the plugin would allow a write. One answer is needed from Cristi Constantin (ticket cmu5vhg6t000204k1jqbcjr95); until then the ids should be in `spec/synced-targets.json` so the guard refuses.
2. **Elementor owner.** `registry/people.json` has no `elementor-owner`; every layout ticket dead-ends at the website-operations fallback, and the playbook does not say whether the fallback may execute. Matt and Yash.
3. **Bethesda roles.** Two Deans of Parents are listed (Chelsea Winters, Pam Jackson); `tests/resolve-campus-roles.mjs` does not know bethesda or houston. Admissions Hub or an override entry.
4. **McLean.** Program or relocation of Chantilly. Farhan Raja.
5. **Product rename rule.** "Test2Pass" to "AlphaTest" in a packet is a brand change; the packet class should name brand-authority as approver for renames. MacKenzie Price to confirm.
6. **Open-media registry.** `registry/campus-open-media.json` lacks santa-barbara, chantilly, chicago; `open-intro-media-approved` reports no entry rather than a defect.
7. **Media diagnosis.** `tests/diagnose-field.mjs` cannot evaluate an image slot and returns an empty value with defect class presentation; the protocol should say to use `get_page_inventory` for media elements until the diagnoser handles them.

## Follow-up finding on Houston

Both Book a Call widgets were repurposed to "Join The Community" links and hidden. Setting `call_scheduling_link` in HubSpot restores the button only if the nightly workflow writes these widgets, which is the unverified question above. The Houston ticket stays with Farhan Raja, and the website agent re-checks the rendered page after the run that follows his change.
