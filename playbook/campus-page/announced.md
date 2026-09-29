# Announced Campus Page Requirements

State: Announced, as decided by HubSpot Programs. Machine form: `spec/campus-page-requirements.json`.

HubSpot determines whether the campus is Announced. A public page may exist, but it must not imply that the campus is already open. Requirements based only on observed structure remain baselines until approved.

| Section | Requirement | Source | Owner when missing | Checks |
| --- | --- | --- | --- | --- |
| Page existence | A public page is optional until the launch owner approves it. Any published page must be canonical, complete enough for parents, and intentionally indexable | HubSpot lifecycle and launch owner | Expansion and website operations | Status, canonical, sitemap, noindex |
| Hero identity | H1 and location identity match the exact HubSpot Program and grade source | HubSpot Programs | HubSpot Program owner | H1, identity, grade-source check |
| Status sentence | Names a month or season and year, such as “Alpha Bethesda opens January 2027.”, when the HubSpot Program has `launch_date` or `opening_date`; “Coming soon” alone is then a defect. A Program with neither date reads “<name> is coming soon.” (Matt Barge, 2026-09-28; `spec/campus-lifecycle.json` states.Announced.introSentence) | Bethesda APEX decision and requirement catalog | HubSpot Program owner for the date | `announced-names-launch-date` |
| Claims | Does not say open, now enrolling, or otherwise describe an operating campus unless the lifecycle has changed in HubSpot | HubSpot lifecycle precedence | HubSpot Program owner | State-copy and source checks |
| Hero CTAs | Only approved destinations appear. Apply, booking, events, packet, and Community controls are conditional on verified routes | Source authority registry | Field-specific owner | Logged-out destination and campus identity |
| Intro media | Uses approved launch-stage media for this campus and date; never another campus, expired season, or open-state claim | Approved media registry | Website operations | Media identity, seasonal, crop and screenshot |
| Events | If present, the strip is scoped to the exact HubSpot program-interest label | HubSpot event-import contract | Events plugin owner | Event filter and source sync |
| Contact and resources | Shows only verified public facts and destinations. Missing facts are omitted or handled by an approved pattern, never invented | HubSpot and owner registries | Field-specific owner | Source, link, schema and map checks |
| Team | Optional. Any visible person has approved name, public title, bio, photo, and effective date | APEX request and campus owner | Expansion or campus role owner | Same-card and placeholder checks |
| Galleries and proof | Optional until approved, campus-relevant media exists | Approved media source | Photography, brand, website operations | Media, claim, identity and accessibility checks |
| Accreditation | Badge visibility matches the HubSpot source and does not imply an unearned status | HubSpot Program through n8n | HubSpot and n8n owners | Source and screenshot |
| SEO and schema | Canonical, title, description, H1, indexability, schema, sitemap, Markdown, and LLM behavior are explicitly set for the launch page | SEO and LLM publishing rules | Website operations | Discovery-surface checks |
| Header and footer | Shared templates render with styles; any change is a separate global ticket | Shared template rule | Elementor owner | Header, footer and ring 3 |

## Transition to Open

Changing HubSpot to Open does not complete the website transition. The same APEX launch ticket or linked tickets must verify removal of launch wording and launch media, open-state CTA destinations, campus facts, staff, events, SEO, schema, maps, Locations, and the next normal n8n run.
