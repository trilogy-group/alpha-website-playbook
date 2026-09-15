# Recipe: campus facts (grade range, tuition, phone, address, email, name, coordinates)

Classes `observer-fact-sync` and `program-info`. Facts appear in several places at once: the hero subtitle, the intro copy, the contact block, the Locations page card, the page title and meta description, and the School schema. A fix is complete only when every surface agrees.

## Sources, in order

1. HubSpot Programs (property candidates in `registry/sources.json`), as published by the growth map API.
2. The Operations sheet, when HubSpot has no value.
3. The requester, for form tickets, when they own the campus.

HubSpot is the source of truth (decision, Matt Barge, 2026-09-15). When the Operations sheet or the map disagrees with HubSpot, use the HubSpot value on the website and file a ticket for the other source to be corrected. When HubSpot has no value, use the Operations sheet and say so on the ticket. When a requester's value disagrees with HubSpot, the requester updates HubSpot first; the website follows HubSpot.

## n8n sync comes first

Some campus-page fields are written by an n8n workflow from HubSpot Programs (owner: `n8n-sync-owner` in `registry/people.json`; routing class `hubspot_campus_facts` in `registry/missing-info-routing.md`). A hand edit to a synced field is overwritten on the next run. The synced field list is not yet recorded (see the gap in `spec/responsibilities.json`), so for grade range, tuition, address, phone, and email: correct HubSpot first, ask the n8n-sync-owner to run or confirm the sync, and only patch WordPress for surfaces the sync does not write (SEO title and description, schema text, intro copy) or when the sync owner confirms the field is not synced. New locations need `wordpress_post_id` set in HubSpot before the sync can target the page.

## Steps

1. `resolve_page`, then `find_text_occurrences` with the observed value to list every place it appears on the page (hero subtitle, contact block, intro, schema text, SEO title and description). `get_post_fields` covers the SEO fields.
2. Confirm the source value is current: read the map API entry for the campus (`gradeRange`, `address`, `city`) and, for tuition, phone, and email, the HubSpot program record.
3. Prepare one content patch per store: `prepare_elementor_content_patch` for the widgets, `prepare_post_fields_patch` for SEO title and description. Each edit uses `replace_substring` with the exact old value and an expected occurrence count.
4. Apply, regenerate CSS, clear cache.
5. Tests. Ring 1: every listed occurrence now shows the source value; `expectedAbsent` carries the old value. Ring 2: full page check; the Locations page card for this campus agrees (run the marketing workspace `website:campus-facts-qc` for that campus); schema and meta agree. Ring 3 after cache clear.

## Refuse and send back when

- Only one of the two disagreeing surfaces can be checked against a source.
- The source value is blank or older than the page's value with no explanation.
- The requested value changes an admissions promise (grade range, tuition) without the campus owner named on the ticket.

## Grade range wording

Locations card uses `K-8`, `PK-8`, `K-12`. The hero subtitle uses `K-8 Private School in City, State`. The intro or contact block may use `K - 8th Grade`. Change all forms together; the check `campus-page-grade-source-sync` and the Locations card comparison must both pass.
