# What the observer must do to use the field map

The production observer (`superbuilders/aeo alpha-site-system`) today compares the site with sources and reports "site says A, source says B". To file tickets that a fresh agent can execute, it needs the pathway logic from `spec/campus-page-field-map.json`. Required changes, in order:

1. **Read HubSpot Programs directly.** Set `HUBSPOT_PROGRAMS_ENDPOINT` (it has no default today, so every campus-fact check is inert) with a token that has `crm.objects.custom.read` and `crm.schemas.custom.read`, and add `website_campus_intro`, `cognia_accredited`, `admission_link`, `form_program_interest_label`, `wordpress_post_id`, and `visibility` to the property list. The growth map API stays the fallback for state and mirrored facts.
2. **Add the status-sentence check.** For every Open Program: the page's `content_body_4` first sentence must equal "<name> is open and enrolling."; for Announced: a month or season plus a year. Compare both the page and `website_campus_intro` against the rule. Emit `expectedSource: HubSpot Programs type`, `actualSource: website_campus_intro` when the text contradicts the state.
3. **Classify by pathway before dispatch.** For each failing check, resolve the element in the field map and emit the defect class (data, mapping, delivery, presentation) and the ticket class. Route `hubspot-data` to the hubspot-program-admin, `sync-mapping` and `sync-delivery` to the n8n-sync-owner, event classes to the events-plugin-owner and hubspot-owner, and only presentation classes to the website operators. Today every campus rule routes to `#support-websites` with Matt and Yash as owners.
4. **File with the template.** The APEX ticket body carries the element, CSS ID, source system and field, source value with read time, expected value and rule, class, owner, fix path, and done condition (protocol step 1b templates). `tests/diagnose-field.mjs` is the reference implementation; the observer can call it or port it.
5. **Know the run schedule.** Treat a page modified at 00:15 to 01:00 Central as rewritten by n8n. A mismatch after that window with a correct source is `sync-delivery`, not a website defect. Replace the unexplained 2-hour grace constant for events with the plugin's 30-minute interval plus one cycle.
6. **Check synced elements exist.** Port `n8n-synced-elements-present` from `tests/page-check.mjs` so a layout change that drops a CSS ID is caught before the nightly run fails.

Until 1 to 4 land, the loop's campus-fact and launch-copy findings are triaged by an agent running `tests/diagnose-field.mjs` before any ticket is worked.

## Added 2026-09-17: event permalinks redirect by design

- `event-page-reachable` and the HTTP checks on `alpha.school/events/<slug>/` must follow redirects and judge the final response. Every event permalink on alpha.school answers 301 or 302 to its `events.alpha.school/register/<uuid>/` page, and the Upcoming Events listing links there directly. Three tickets (Palo Alto open house 522, Miami Beach coffee 404, San Francisco open house 502) were transient or a re-slugged event; all three resolve to a 200 registration page today and were set For Review.
- A 404 on an event permalink whose HubSpot event was re-synced under a new slug (`-2`) is a plugin behavior, not a content defect; the old slug 301s. The check should treat a 301 to the same event's new slug as pass.
- Render-timeout findings (page.goto 20 s) need a second attempt before a ticket is filed. Five tickets from the September 14 run were filed for pages that answer in 0.3 to 3.6 s today.
