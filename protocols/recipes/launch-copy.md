# Recipe: "still shows launch copy but is already open"

Class `observer-launch-copy`. Scope is media and copy. Both must be true before the ticket closes.

1. Confirm the campus state is Open in HubSpot (`spec/campus-lifecycle.json` mirrors the map API, which HubSpot feeds). HubSpot is the source of truth: if HubSpot says Open, the page says open even if a launch date lingers on the record. If HubSpot says Announced, the ticket is wrong; send it back naming the state.
2. Copy: the intro text-editor widget in the Center section reads "Alpha <Campus> is open and enrolling." followed by the info-session paragraph. Replace the launch sentence only, keep the campus name as written. Exemplars: Plano, Scottsdale.
3. Media: the intro card slot shows the campus's approved open-state media from `registry/campus-open-media.json`. If the registry has no asset, Missing Info naming Yash Chitneni and the exact card needed. Never substitute another campus's image or unrelated footage.
4. Also check the hero and the rest of the page for launch-era words or images (Coming Soon, Coming Fall, Launching, Opening).
5. Tests: ring 1 (sentence), ring 2 (whole page with screenshots of header and intro), ring 3 (two untouched pages after cache clear). Then request an observer rerun and confirm the SITE id clears.

## Where the sentence really lives (added 2026-09-16)

The intro status sentence is the `content_body_4` text widget, and the n8n campus-page workflow rewrites it every night at 00:15 Central from the HubSpot Program property `website_campus_intro` (with `[DISPLAY_NAME_WITHOUT_SCHOOL_KEYWORD]`, `[CITY]`, and `[DISPLAY_REGION]` substituted). A WordPress edit to that block lasts one day: the September 15 group A edits were reverted on September 16.

The durable recipe for an Open campus is therefore:

1. Read the current rendered sentence (`find_text_occurrences` still tells you the element and confirms it is `content_body_4`).
2. File an APEX campus program change on `website_campus_intro` for the campus: keep the placeholder form, change only the status sentence to `[DISPLAY_NAME_WITHOUT_SCHOOL_KEYWORD] is open and enrolling.`, leave the info-session paragraph. Approver: `hubspot-program-admin` or `hubspot-owner`. Link it from the website ticket.
3. After the next 00:15 run (or an on-demand run by the `n8n-sync-owner`), run ring 1 and ring 2 on the page. The ticket closes when the page shows the sentence after a run, not when HubSpot is saved.
4. The intro card (image or video) is not n8n-controlled and still goes through the MCP `set_image` step below.

The batch runner refuses a `content_body_4` edit unless the plan records an override, so the WordPress path cannot be taken by accident.
