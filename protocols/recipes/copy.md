# Recipe: Page Copy

Classes: `copy`, `observer-brand-leak`, and the WordPress-direct portion of other copy tickets.

## Inputs

FAQ items (plugin 0.5.0): the campus FAQ is an Elementor accordion with five template slots. Replace existing questions with `prepare_elementor_content_patch` on `tabs.N.tab_title` and `tabs.N.tab_content`; add or remove items with `prepare_elementor_structure_patch` (`repeater_add_item`, `repeater_remove_item` on the accordion widget, `repeater: tabs`, `expectedCount` set). Unhide the section with `set_visibility` when it ships hidden.

- Canonical page URL
- Exact current text
- Exact approved replacement
- Section or component
- Approver and source
- Expected occurrence count
- Effective date when seasonal

## Source check

Look up the field in `spec/source-authority.json` and, for campus pages, `spec/campus-page-field-map.json`. If HubSpot, n8n, Airtable, an importer, or a template owns it, stop this recipe and use the source-system recipe.

Run the brand checks. Do not change held copy, legal language, pricing, admissions promises, launch dates, or evidence claims without the named owner.

## Prepare

1. Claim the APEX ticket and lease.
2. Call `resolve_page` for the canonical live object.
3. Call `find_text_occurrences` with the exact current text.
4. Identify desktop and mobile duplicates and confirm every intended field is editable.
5. Use `prepare_elementor_content_patch` for Elementor or `prepare_post_fields_patch` for post content.
6. Bind the expected current text and occurrence count.
7. Review the diff, snapshot, semantic hash, block structure, and exact present and absent checks.

Zero occurrences, extra occurrences, uneditable fields, unknown structure, or a changed source is a stop condition.

## Apply

Apply the exact approved preparation with fresh authorization. Read back the complete affected store and compare the proposed semantic hash.

## Verify

- New text is present exactly where required.
- Old text is absent from the intended page-owned scope.
- Responsive duplicate copies agree.
- No sibling widget or unrelated post field changed.
- Brand, identity, claim, seasonal, desktop, and mobile checks pass.
- Ring 3 passes after a shared or site-wide action.

## Rollback

Use the stored Elementor or post-field snapshot through `protocols/rollback-and-incidents.md` if the diff, readback, public result, or page checks fail because of this change.

## Scheduled-agent status

Alpha MCP implements bounded content tools, but the scheduled APEX Alpha path is not documented as integrated for general copy. Route to a human Alpha MCP operator unless `spec/actor-capabilities.json` has been updated with release evidence.
