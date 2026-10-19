# Recipe: Page Copy

Classes: `copy`, `observer-brand-leak`, and the WordPress-direct portion of other copy tickets.

## Inputs

FAQ items: the campus FAQ is an Elementor `nested-accordion` (verified on Plano and Greenwich, 2026-09-21), not a classic accordion. Questions live in the widget's `items` repeater (`items.N.item_title`); each answer is its own `text-editor` widget (`faq_a_N`) inside the N-th child container. Edit a question with `prepare_elementor_content_patch` on `items.N.item_title` and an answer on the child text-editor's `editor`. Add an item with `prepare_elementor_structure_patch`: `repeater_add_item` on the accordion (`repeater: items`, `expectedCount` set) plus `clone_element` of an existing answer container into the accordion at the matching position; remove with `repeater_remove_item` plus `remove_element`. The number of items is not fixed at five. Unhide the section with the `set_visibility` mode of `prepare_elementor_content_patch` when it ships hidden.

- Canonical page URL
- Exact current text
- Exact approved replacement
- Section or component
- Approver and source
- Expected occurrence count
- Effective date when seasonal

## Source check

Look up the field in `spec/source-authority.json` and, for campus pages, `spec/campus-page-field-map.json`. If HubSpot, n8n, Airtable, an importer, or a template owns it, stop this recipe and use the source-system recipe.

Run the brand checks. Replacement wording follows MacKenzie's style choices (`playbook/site/mackenzie-style-choices.md`): for example AlphaTest (never Test2Pass), WonderLab, Shadow Day, twice as much, classes (never students) rank in the top 1%. Do not change held copy, legal language, pricing, admissions promises, launch dates, or evidence claims without the named owner.

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
