# Site-wide rules

Rules that apply to every alpha.school page regardless of campus or state. Machine form: `spec/site-rules.json`. Each rule has an id, a source, and the check that enforces it (observer check names are in `registry/observer-checks.json`).

## Uniformity and named exceptions (`site.uniformity.*`)

- Campus pages follow one template and are as uniform as possible; a single Director of Admissions or Dean of Parents asking for a one-off is not a reason for a page to diverge (MacKenzie Price, 2026-09-25). A campus-specific element exists only as a named exception in `spec/site-rules.json` `site.uniformity.campus-template.namedExceptions`, with the campus, the element, the reason and the decider; a ticket asking for one that is not listed is internal review for website operations, never executed as asked. First named exception: Alpha Raleigh's region-specific legal element (the crisis-line text "To reach the Suicide and Crisis Lifeline, call 988 or text HOME to 741741." in the Contact and resources block, text editor 8d5b4f9; identified 2026-09-25). Check: manual at intake until an observer check exists.

## Header and footer (`site.header.*`, `site.footer.*`)

- Every page renders the theme-builder header with its stylesheet linked, the logo, the navigation, and the Contact Us button; and the theme-builder footer. Source: demonstrated-correct pages; the September 15 Atlanta incident. Check: `page-check header-stylesheet-linked`, observer `route-browser-inspection`.
- Navigation and footer are shared templates: never edited under a campus ticket. Any change to them is its own ticket, and ring 3 runs afterward on two untouched pages.

## Layout and rendering (`site.layout.*`)

- Desktop viewport 1440 by 1000 and mobile 390 by 844 both render without horizontal overflow beyond 160 px (24 px is a warning), without the header overlapping headings by more than 48 px or 25 percent, without clipped text, and with primary CTAs inside the viewport. Source: observer thresholds. Checks: `campus-layout-horizontal-overflow`, `campus-layout-header-overlap`, `campus-layout-clipped-text`, `campus-layout-offscreen-content`.
- Visible images render; at most 20 broken images site-wide before the run fails. Staff and guide photos do not clip faces. Checks: `images-render`, `campus-image-crop-risk`.
- Console errors on critical routes stay under 20. Check: `browser-errors`.

## Brand copy (`site.brand.*`)

- MacKenzie's recorded choices govern all copy and take precedence over every other guide. The full rule table, holds, and detector live in the marketing workspace (`docs/rules/alpha-brand-copy-rules.md`, `npm run website:brand-qc`) and in `trilogy-group/alpha-branding-skill`. Headline items: no em dashes; no exclamation marks in headings or buttons; twice as much, never twice as fast; 2x lowercase; 2 Hour Learning; WonderLab and LearningLab one word; Alphas is the currency; AlphaTest one word; love school, never love learning; classes rank in the top 1 percent, never students; no manufactured urgency; no "pedagogy" or "whole child".
- Four items are held for MacKenzie's decision and must not be edited: the homepage commitment sentence, the "Learn 2x in 2hrs" nav label, the word "education", and the Oxford comma list.
- Visual brand (`site.brand.visual`): the official Alpha School Brand Guidelines are the visual source (decision 2026-09-22): Montserrat on every text element; backgrounds, headlines and large fields from the four blues, white, black, or the two tints; no never-row contrast pair; the logo an unmodified canonical file from `playbook/brand/assets/`. Word rules above win on any overlap. Prose: `playbook/site/visual-brand.md`; values: `spec/brand-visual.json`. Check: `page-check brand-visual` (advisory on the first version; findings file as `observer-brand-visual`).

## Identity and cross-brand (`site.identity.*`)

- No Alpha page carries sister-brand names (Nova, NextGen Academy, Waypoint Academy, Texas Sports Academy) in page-owned content, except the named Brownsville and Nova exception. Navigation listing the specialty schools is allowed. Check: `campus-sister-brand-leak`; `page-check no-sister-brand-words`.
- No page references another campus in image file names, alt text, links, packets, calendars, or schema. Checks: `campus-image-identity-conflict`, `page-check no-other-campus-in-image-names`.

## Seasonal and dated content (`site.seasonal.*`)

- Seasonal CTAs and popups appear only inside their approved window. Summer 2026 registration, programs, and camps copy expired on August 15, 2026. Check: `campus-expired-seasonal-cta`.
- A launch statement anywhere on the site names a month or season and a year; "coming soon" alone is a defect. Source: APEX ticket for Alpha Bethesda, August 2026. Exception (Matt Barge, 2026-09-28): an Announced campus whose HubSpot Program has neither `launch_date` nor `opening_date` reads "<name> is coming soon." until a date is set (`spec/campus-lifecycle.json` states.Announced.introSentence).

## Search, schema, and AI discovery (`site.search.*`)

- robots.txt reachable; sitemap index populated; critical routes (home, the program, locations, admission, upcoming events) indexable and with a canonical tag; no duplicate titles or duplicate canonicals across pages; JSON-LD valid on critical routes; Googlebot and browser see the same status. Checks: `robots-reachable`, `sitemap-populated`, `critical-route-indexable`, `canonical-present`, `duplicate-title`, `duplicate-canonical`, `json-ld-valid`, `googlebot-parity`.
- AI discovery files (llms.txt and its companions) reachable and non-empty. Check: `llm-file-reachable`. LLM source-material decisions follow the marketing workspace rule `docs/rules/llm-content-readiness.md`.
- Every campus page has School schema with the campus URL, address, and coordinates within one mile of the source. Checks: `campus-school-schema`, `campus-schema-url`.

## Claims (`site.claims.*`)

- Statistics and named-entity claims on the site must exist in the claim registry with evidence. Checks: `claim-registry`, `claim-evidence`, `named-entity-evidence` (advisory today).

## Events (`site.events.*`)

- A HubSpot marketing event marked public appears on `/upcoming-events/` and on its campus strip within four hours of becoming public (past events never file); registration links resolve; weekday and time match the source; canceled or private events accept no public registration; sister-brand events are excluded from Alpha pages. Checks: `public-event-sync`, `campus-event-filter`, `event-registration-url`, `event-registration-reachable`, `event-time-valid`, `event-weekday-sync`, `event-required-facts`, `event-page-reachable`, `event-source-readable`.

## Maps and locations (`site.map.*`)

- The homepage and Locations maps render, every program appears once with the right label, status, coordinates, and destination, Pre-Announcement pins route to a campus-specific Community URL on the approved host, and the map does not trap page scrolling. Checks: `campus-map-*`, `embedded-map-scroll-trap`, `preannouncement-community-url`, `preannouncement-community-host`, `community-campus-parameter`, `public-program-url`, `public-program-host`, `duplicate-program-url`, `duplicate-program-id`, `program-lifecycle-valid`, `hubspot-map-sync`, `operations-map-*`, `map-campus-missing-from-operations`, `wordpress-campus-missing-from-map`, `campus-sitemap-missing`.

## Community routing (`site.community.*`)

- A Community destination uses the current `https://www.community.alpha.school/?campus=<community-slug>` contract. The slug comes from an exact HubSpot program ID join to a visible Community program record, never from a campus-name guess. `invite` and `ref` may be preserved as referral parameters. `preferred_campus` is legacy and must not be generated for new links. Source and full procedure: `playbook/site/community-routing.md`. Checks: `tests/validate-community-routing.mjs`; observer coverage for the current parameter is advisory until the observer is updated.
- HubSpot owns campus facts and business lifecycle. Community owns only its IDs, slugs, visibility, and Community-specific behavior. Community counts and operational relationships are not public website facts without explicit approval.

## Synced content (`site.sync.*`)

- An Elementor element whose CSS ID is in the n8n field map, or whose value comes from a HubSpot Program property, is never hand-edited as a durable fix. Correct HubSpot, run the sync, verify the page. `hubspot_event` posts are never created or edited by hand. Source: the APEX publishing contracts and the December 2025, February 2026, and May 2026 overwrite incidents. Full map: `playbook/site/content-pipelines.md`.
- A layout change on a campus page keeps every CSS ID the n8n workflow expects, and the SEO Template page gets the same change, because new campus drafts are cloned from it.

## Accessibility (`site.a11y.*`)

- A proposed operational baseline now covers WCAG 2.2 AA, alt text, semantic headings, keyboard operation, focus, contrast, forms, captions, reduced motion, performance, browser support and media handling in `playbook/quality/accessibility-performance-browser-media.md`.
- It is not an enforced rule until a named owner approves it. Existing source-backed media identity and safe-upload controls remain active.
