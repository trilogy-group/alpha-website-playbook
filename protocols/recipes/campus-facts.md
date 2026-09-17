# Recipe: campus facts (grade range, tuition, phone, address, email, name, coordinates)

Classes `observer-fact-sync` and `program-info`. Facts appear in several places at once: the hero subtitle, the intro copy, the contact block, the Locations page card, the page title and meta description, and the School schema. A fix is complete only when every surface agrees.

## Sources, in order

1. HubSpot Programs (property candidates in `registry/sources.json`), as published by the growth map API.
2. The Operations sheet, when HubSpot has no value.
3. The requester, for form tickets, when they own the campus.

HubSpot is the source of truth (decision, Matt Barge, 2026-09-15). When the Operations sheet or the map disagrees with HubSpot, use the HubSpot value on the website and file a ticket for the other source to be corrected. When HubSpot has no value, use the Operations sheet and say so on the ticket. When a requester's value disagrees with HubSpot, the requester updates HubSpot first; the website follows HubSpot.

## n8n sync comes first

Phone, address, grade range in the hero and titles, tuition, email, the four content body blocks, the attend CTA, the Cognia badge, the gallery, FAQ and team titles, the events shortcode, and the Apply link on a campus page are written daily by the n8n campus-page workflow from HubSpot Programs (field map in `playbook/site/content-pipelines.md`, machine form `spec/content-pipelines.json`). A hand edit to any of them is overwritten on the next run. For those fields: correct HubSpot, ask the n8n-sync-owner to run or confirm the sync, and verify the public page afterward. Patch WordPress only for surfaces the workflow does not write (schema text outside the mapped fields, intro copy outside the content body blocks) or under the recorded CSS ID override procedure. New locations need `wordpress_post_id` set to -1 in HubSpot before the workflow will create the page.

## The sanctioned path: APEX program change

The tool for changing a campus fact is the APEX campus Program editor (two-way sync with HubSpot), not WordPress. Per Yash Chitneni (2026-09-17) the website operators may make these updates themselves for website-driven values; a person may also edit the Program in HubSpot directly, which is what was done for the Join Community URLs on 2026-09-17. Never edit n8n. A program change in APEX is reviewed and approved by a person, written to HubSpot Programs with a baseline conflict check and read-back, and then published by the daily n8n run. Fields it can change: type, visibility, year open, address, city, state, academic calendar, tuition, application fee, start and end grade, email, phone, website, admission link, call scheduling link, and the website intro copy. The `hubspot-program-admin` (Farhan Raja) and `hubspot-owner` (Hailey McSpadden) approve; the requester or Director of Admissions supplies the value.

## Trailing audit (required for every HubSpot or n8n change)

Yash Chitneni authorized website operators to change HubSpot Program values and n8n mappings for website content on 2026-09-17, on the condition that every change leaves a trailing audit. The audit is the APEX ticket plus the playbook:

1. Before the change, the ticket carries the field, the current value, the new value, the source of the new value, and who approved it.
2. The change is made through the APEX campus editor when the field is one it exposes (it records the change itself), otherwise directly in HubSpot with the ticket id in the property's note, or in n8n by the `n8n-sync-owner` with the workflow version noted.
3. After the change, the ticket's resolution block records the HubSpot property history timestamp (or the n8n version), the run that published it, and the public page check that proved it.
4. The change is listed in `docs/decisions.md` when it sets or changes a rule, and in the marketing workspace task record otherwise.

A HubSpot or n8n change without these four entries is out of policy and is reverted.

For a fact ticket the agent therefore:

1. Confirms the requested value against the requester and, when it changes an admissions promise, the Director of Admissions (live resolver).
2. Files or advances the APEX program change with the field, old value, new value, and source, and links it from the website ticket.
3. Waits for the n8n run (daily, or asks the `n8n-sync-owner` for an on-demand run), then runs the page check and the Locations card comparison.
4. Patches WordPress only for surfaces the workflow does not write, and only after the sync has landed, so the two never disagree.

The website ticket is not complete when HubSpot is saved or when n8n reports success. It is complete when the public page and the Locations card show the value.

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
