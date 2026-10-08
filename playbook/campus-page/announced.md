# Announced Campus Page Requirements

State: Announced, as decided by HubSpot Programs. Machine form: `spec/campus-page-requirements.json`.

HubSpot determines whether the campus is Announced. A public page may exist, but it must not imply that the campus is already open. Requirements based only on observed structure remain baselines until approved.

| Section | Requirement | Source | Owner when missing | Checks |
| --- | --- | --- | --- | --- |
| Page existence | A public page is optional until the launch owner approves it. Any published page must be canonical, complete enough for parents, and intentionally indexable | HubSpot lifecycle and launch owner | Expansion and website operations | Status, canonical, sitemap, noindex |
| Hero identity | H1 and location identity match the exact HubSpot Program and grade source | HubSpot Programs | HubSpot Program owner | H1, identity, grade-source check |
| Status sentence | Names a month or season and year, such as “Alpha Bethesda opens January 2027.”, when the HubSpot Program has `launch_date` or `opening_date`; “Coming soon” alone is then a defect. A Program with neither date reads “<name> is coming soon.” (Matt Barge, 2026-09-28; `spec/campus-lifecycle.json` states.Announced.introSentence) | Bethesda APEX decision and requirement catalog | HubSpot Program owner for the date | `announced-names-launch-date` |
| Claims | Does not say open, now enrolling, or otherwise describe an operating campus unless the lifecycle has changed in HubSpot | HubSpot lifecycle precedence | HubSpot Program owner | State-copy and source checks |
| Hero CTAs | Only approved destinations appear. Apply, events, packet, and Community controls are conditional on verified routes | Source authority registry | Field-specific owner | Logged-out destination and campus identity |
| Book a Call | Visible on desktop, tablet and mobile, linking to this campus's own HubSpot Program `call_scheduling_link` (Rachel Goodlad, Slack 2026-10-06; supersedes the 2026-09-24 Lexington hidden exception) | HubSpot Program `call_scheduling_link` | Website agent (widget); HubSpot Program owner when the link is empty | `campus.resources.booking.present`, `campus.resources.booking.source-sync`, reachable and campus-specific destination |
| Intro media | Uses approved launch-stage media for this campus and date; never another campus, expired season, or open-state claim | Approved media registry | Website operations | Media identity, seasonal, crop and screenshot |
| Events | If present, the strip is scoped to the exact HubSpot program-interest label | HubSpot event-import contract | Events plugin owner | Event filter and source sync |
| Contact and resources | Shows only verified public facts and destinations. Missing facts are omitted or handled by an approved pattern, never invented | HubSpot and owner registries | Field-specific owner | Source, link, schema and map checks |
| Team | Optional. Any visible person has approved name, public title, bio, photo, and effective date | APEX request and campus owner | Expansion or campus role owner | Same-card and placeholder checks |
| Galleries and proof | Optional until approved, campus-relevant media exists | Approved media source | Photography, brand, website operations | Media, claim, identity and accessibility checks |
| Accreditation | Badge visibility matches the HubSpot source and does not imply an unearned status | HubSpot Program through n8n | HubSpot and n8n owners | Source and screenshot |
| SEO and schema | Canonical, title, description, H1, indexability, schema, sitemap, Markdown, and LLM behavior are explicitly set for the launch page | SEO and LLM publishing rules | Website operations | Discovery-surface checks |
| Header and footer | Shared templates render with styles; any change is a separate global ticket | Shared template rule | Elementor owner | Header, footer and ring 3 |

## Proposed campus pending local approval (Lexington)

Alpha Lexington (https://alpha.school/boston-suburbs/, HubSpot Program `51223157555`) is a proposed campus under Lexington School Committee review. HubSpot keeps it `Announced`, but the page, Locations card, search and share text and map follow the rules below instead of the normal Announced copy. Machine form: `spec/campus-lifecycle.json` `campuses.boston-suburbs.proposedCampusHold`. Decisions: `docs/decisions.md` rows 2026-10-02 (J.C. Fischer, counsel wording), 2026-10-06 (Robbie Forrest, surfaces and `admission_link`) and 2026-10-07 (map pin hold).

Already recorded elsewhere, not repeated here: the n8n Lexington SEO exception, the inquiry-only Locations entry and the blank `admission_link` caveat (`playbook/integrations/n8n-workflow-map.md`, caveats 4 and 6); the 2026-09-28 `introStatementException` and the 2026-10-06 Book a Call decision that retired the 2026-09-24 hidden exception (`docs/decisions.md`, `registry/campus-cta-exceptions.json` `boston-suburbs`); the map calling this page `boston-suburbs` (`page-model.md`).

### Counsel wording (source of truth)

Source: J.C. Fischer (EVP Operations, 2 Hour Learning), relaying Lexington counsel, email thread "Alpha Lexington", 2026-10-01 and 2026-10-02. His words win over any summary. Verbatim text: `tests/fixtures/decisions/recorded/2026-10-02-campus-lifecycle-8f878d4e.json`.

Counsel's rules (2026-10-02), quoted:

1. Header: "I would remove the line 'K-8 Private School in Boston, MA' from the header to avoid any implications that there's an active school (also, that statement will never be accurate even when open – Boston is 20 miles from Lexington!)". The website team also removed it from the SEO and social titles.
2. Approval phrase: "replace 'not been approved' with 'not yet received approval' – the former could imply it was (or is expected to be) rejected". Never write "not been approved".
3. Closing: "Alpha welcomes inquiries from interested families, and will update this page if and when the School Committee takes action", with "a hyperlink on the 'welcomes inquiries' to the stay-in-the-know popup". This replaces counsel's earlier last line about visiting Beacon Hill or Jamaica Plain.

The approved body, as counsel sent it on 2026-10-01 with the 2026-10-02 edits applied:

| Block | Text |
| --- | --- |
| Section heading | Alpha in Greater Boston |
| Operating campuses | Alpha operates two campuses in Greater Boston today: Alpha Beacon Hill and Alpha Jamaica Plain. Both are open for enrollment. |
| Subheading | Proposed Lexington campus |
| Status | Alpha has proposed a campus in Lexington, Massachusetts. The proposal is under review by the Lexington School Committee and has not yet received approval. No Lexington campus is open, and Alpha is not enrolling students for a Lexington location. |
| Closing (own paragraph) | Alpha welcomes inquiries from interested families, and will update this page if and when the School Committee takes action. ("welcomes inquiries" opens the stay-in-the-know HubSpot CTA) |

Counsel's three opening paragraphs (the mastery-based, two-hour academics, life skills and "kids love school" text) stay as counsel wrote them, with campus-specific references removed. Robbie Forrest (2026-10-05) had the standalone sentence "We will update this page if and when the School Committee takes action." deleted, because the closing already carries it. Do not add it back.

Do not add any claim that a Lexington campus is open, enrolling, accepting applications or has a start date. Do not add an Apply control. No Lexington campus is open or enrolling; Beacon Hill and Jamaica Plain are the operating Greater Boston campuses.

### Search and share, HubSpot and Locations

- Meta, Open Graph and X descriptions (live 2026-10-06, after Robbie Forrest asked for alignment): "Alpha has proposed a campus in Lexington, MA. The proposal is under Lexington School Committee review. No Lexington campus is open, and Alpha is not enrolling students there." Written by the n8n Lexington exception in `Prepare website data - various attributes`.
- HubSpot Program `51223157555`: `type` stays Announced and `is_open` false. `admission_link` stays empty while the campus is proposed so the nightly Locations publish does not bring back Apply Now (cleared 2026-10-06 after Robbie Forrest's request). A blank field does not clear an existing page button; check the destination.
- Locations card: "Proposed · under School Committee review · not open or enrolling", with Stay In-the-Know linking to https://alpha.school/boston-suburbs/ and no Apply Now.
- After any edit to `/boston-suburbs/`, purge WP Engine and Cloudflare for that URL and verify in a fresh browser session. On 2026-10-06 Cloudflare served a stale copy after the WordPress change.

### Map pin hold (temporary)

- [trilogy-group/educrm-city-communities PR 236](https://github.com/trilogy-group/educrm-city-communities/pull/236), merged 2026-10-07 8:29 AM PT, holds Program `51223157555` off the map.app.alpha.school feed (and the map embedded on alpha.school) through `MAP_PUBLICATION_HOLDS` in `backend/dashboard/constants/map-publication-holds.constant.ts`. HubSpot lifecycle and visibility, the campus page, the Locations card and other map records are unchanged.
- Why code: Robbie Forrest asked on 2026-10-06 for the pin to come off because it showed green and "enrolling". The feed requests hidden programs, so a HubSpot visibility or Pre-Announcement change would still publish a pin. Robbie confirmed on 2026-10-07 that map-only was intentional for now.
- Fernando Pina dos Santos approved it as a temporary exception and prefers HubSpot-managed visibility to code exceptions: remove it within 15 days, or revisit by **2026-11-06** with a permanent HubSpot-driven map-visibility mechanism. A follow-up ticket for that mechanism was requested on the PR.
- Open items from Robbie Forrest (2026-10-07): document the temporary hold in HubSpot so the exception is visible there; before changing the broader HubSpot visibility flag, confirm which pages, forms and systems it controls and whether it would remove the inquiry path.
- Release: only after campus approval and an explicit website-operations decision to republish. A lifecycle change alone must not restore the pin.

### Exit condition

Everything in this section ends when the Lexington School Committee acts and the HubSpot Program type or status changes. Then the normal Announced or Open rules apply. Each exception (counsel copy, inquiry-only Locations entry, n8n SEO exception, empty `admission_link`, map hold, `introStatementException`) is removed by an explicit, recorded change, not left to lapse.

### Known gaps (2026-10-08)

- The header subtitle came back. `hero.title` is written by n8n (`spec/campus-page-field-map.json` `hero.title`). After the 2026-10-07 10:19 PM PT publish, the live H1, `<title>` and `og:title` read "K-8 Private School in Boston, MA" again (cache MISS, checked 2026-10-08 8:48 AM PT). Fixed in n8n 2026-10-08 8:54 AM PT: `Prepare website data - various attributes` now has a Lexington title and header exception (H1 "Alpha Lexington" only; SEO, Open Graph and X title "Alpha Lexington | Proposed Campus"; `playbook/integrations/n8n-workflow-map.md` caveat 6). It reaches the page on the next nightly publish (about 10:15 PM PT); verify the H1, `<title>`, `og:title` and `twitter:title` after that run and purge WP Engine and Cloudflare if a stale copy shows.
- `introStatementException.wording` ("Our proposed Lexington campus is pending School Committee approval...") is no longer on the Lexington page. It needs updating to the current `website_campus_intro` before `campus.intro.status-source` can rely on it.
- https://alpha.school/jamaica-plain/ still carries Robbie Forrest's 2026-09-24 regional sentence ("Our proposed Lexington campus is pending School Committee approval and is not yet open for enrollment."). Counsel's notes covered the Lexington page only. Ask J.C. Fischer whether Jamaica Plain should use counsel's wording.
- The operating-campuses sentence says both Greater Boston campuses are "open for enrollment", while Alpha Boston (Beacon Hill) has been on the 2026-27 waitlist since 2026-10-02 (`registry/campus-enrollment-state.json`). Counsel's wording stands. Raise it with J.C. Fischer instead of editing it.

## Transition to Open

Changing HubSpot to Open does not complete the website transition. The same APEX launch ticket or linked tickets must verify removal of launch wording and launch media, open-state CTA destinations, campus facts, staff, events, SEO, schema, maps, Locations, and the next normal n8n run.
