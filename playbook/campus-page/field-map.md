# Campus page field map: who writes what, from where

Machine form: `spec/campus-page-field-map.json`. This is the map an agent or the observer uses to turn "the page says X" into "field F in system S says Y, the derivation is D, so this is a data, mapping, delivery, or presentation defect owned by role R". Nothing on a campus page is edited until its row here has been read.

October 7 active-version evidence and caveats: [n8n workflow map](../integrations/n8n-workflow-map.md). These observations do not authorize new publications or change campus lifecycle requirements.

## Four kinds of writer

| Writer | What it means | Fix path |
| --- | --- | --- |
| n8n from HubSpot | Program values are written on schedule; historically 00:15 Central, but the inherited timezone needs confirmation in the October 7 export. WordPress edits may be overwritten; empty source values may be skipped. | The website operators change the HubSpot value through the APEX campus editor (two-way sync), or a person edits the Program in HubSpot; the n8n derivation is changed only by the n8n-sync-owner. |
| n8n from the onboarding sheet | Same run, using the "School onboarding" Google Sheet, Website Copy Fixed. The Dynamic branch is disabled in the October 7 active export. | Change the sheet. |
| Events plugin | The campus event strip is rendered from `hubspot_event` posts imported from HubSpot Marketing Events every 30 minutes; n8n writes the shortcode that scopes it to the campus. | HubSpot event data, plugin settings, or the shortcode. |
| WordPress direct | No automation writes it. | Alpha WordPress MCP under the ticket protocol. |

Shared header and footer are a fifth case: theme-builder templates, edited only under their own ticket by the Elementor owner.

## The map

| Element | CSS ID | Writer | Source | Derivation | Mismatch becomes |
| --- | --- | --- | --- | --- | --- |
| Hero title and subtitle | `title` | n8n from HubSpot | name, grade_levels, city, state | "Alpha X" plus "K-8 Private School in City, State" (New York special case) | hubspot-data, or sync-mapping if the wording rule is wrong |
| Hero CTA row | none | WordPress direct | requirement | fixed four CTAs | link-cta |
| Campus label | `campus` | n8n from HubSpot | campus | verbatim | hubspot-data |
| Intro title, body 1 to 3, attend CTA | `content_title`, `content_body_1` to `_3`, `attend_cta_button` | n8n from sheet | Website Copy Fixed (Dynamic disabled) | sheet text with [CITY], [DISPLAY_REGION], [DISPLAY_NAME] substituted; New York hardcoded | sheet-data |
| Intro status sentence and info-session paragraph | `content_body_4` | n8n from HubSpot | `website_campus_intro` (hand-typed), with `type` as the state it must agree with | verbatim with substitutions. The sentence is not derived from the status field yet; decided 2026-09-25 (MacKenzie Price) that it will be, in the n8n workflow (pending with the n8n-sync-owner). | hubspot-data when the text contradicts `type`; sync-mapping for the proposal to derive it from `type` |
| Intro card image or video | `content_image`, `content_video` | WordPress direct | media registry by state | Open card or approved video | media |
| Address and grade line | `address` | n8n from HubSpot | school_address, grade_levels_suffixed | "K - 8th Grade" title (Austin hardcoded PreK - 5th), address text; hidden when empty; Raleigh excluded | hubspot-data; sync-mapping for the Austin hardcode |
| Map | `map` | n8n from HubSpot | map_location_name, school_address | hidden when no address | hubspot-data |
| Phone, email, tuition | `phone`, `email`, `tuition` | n8n from HubSpot | contact_number, email, tuition_usd_yearly | formatted links and "$" amount | hubspot-data |
| Cognia badge | `cognia_yes*`, `cognia_candidate*` | n8n from HubSpot | cognia_accredited | Yes, Candidate, or hidden | hubspot-data |
| Events strip | `hubspot_events` | events plugin; shortcode by n8n | Marketing Events with Public = Yes and the campus form program interest | plugin cards, limit 3 | event-data, event-sync, or sync-mapping for the label |
| Info packet, calendar | `resource_1`, `resource_2` | WordPress direct | packet owner, calendars role | approved public document or hidden | observer-packet, link-cta |
| Apply | `resource_4` | n8n from HubSpot | admission_link | link URL | hubspot-data; link-cta when the route itself breaks |
| Team titles | `team_top_title`, `team_title` | n8n from HubSpot | name | "Alpha X", "Meet our Team" | hubspot-data |
| Team cards | `team_*`, `top_staff_*` | WordPress direct | requester; onboarding People Bio; Admissions Hub for DoA and DoP | Name, title, bio, photo, quote | staff-add, staff-update, staff-remove, staff-photo |
| Gallery and FAQ titles | `gallery_title`, `faq_title` | n8n from HubSpot | name | "Alpha X Gallery", "Alpha X FAQs" | hubspot-data |
| Gallery images, FAQ answers, blog section | various | WordPress direct | photography, brand | identity and brand rules | observer-media-identity, copy |
| SEO title and description, social titles, JSON-LD | post fields | n8n from HubSpot | name, grades, city, state, contact, coordinates, profile links | fixed wording plus fields | hubspot-data; sync-mapping for wording |
| Page exists and is public | page | n8n from HubSpot | type, visibility, wordpress_post_id | eligible reader Program with post id -1 creates a page; no extra Announced-only gate observed; verify actual WordPress publication separately | hubspot-data, sync-delivery, or status |

## How the loop uses it

1. A check fails on an element. Look the element up here.
2. If the writer is WordPress direct, it is a website ticket in the class shown. Stop here.
3. Otherwise read the source live: HubSpot Programs for the named property (the growth map API mirrors `type`, name, address, city, state, grade range; `website_campus_intro`, tuition, phone, email, Cognia, and the Apply link need the Programs read scopes), the onboarding sheet for sheet elements, HubSpot events for the strip.
4. Compute the expected value from the requirement for the campus's state (`spec/campus-page-requirements.json`, state from `type`).
5. Decide the class. Source wrong: hubspot-data, sheet-data, or event-data. Source right and page wrong after the run: sync-delivery or event-sync. Source right, page matches the source, but the requirement is violated: the derivation is wrong, sync-mapping.
6. File the ticket with the template in the protocol, carrying the element, CSS ID, source system and field, current source value with its read time, expected value and the rule it comes from, the class, the owner role and person, the fix path, and how the fix is verified. `tests/diagnose-field.mjs` does steps 1 to 6 and prints the ticket.

## Worked example: the launch sentence

Atlanta's page reads "Alpha Atlanta is launching in Fall 2026." The element is `content_body_4`, writer n8n from HubSpot, source `website_campus_intro`, state field `type`. The growth map API says `type` is Open. The requirement for Open is "Alpha Atlanta is open and enrolling." The page matches the HubSpot text, so the run delivered correctly; the HubSpot text contradicts the state. Class: hubspot-data, owner hubspot-program-admin, fix through the APEX campus Program editor, verified after the next 00:15 run. A second ticket, sync-mapping, proposes deriving the sentence from `type` so the text field can never contradict the status again; owner n8n-sync-owner. Decided in favour on 2026-09-25 by MacKenzie Price (lifecycle and staff changes propagate from the source of truth without a person reporting them); the workflow change is still pending with the n8n-sync-owner.
