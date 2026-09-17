# Information Architecture

Status: Observed September 17, 2026 from the Yoast sitemap index, the homepage HTML, and redirect traces. Machine form: `spec/inventory/site-url-inventory-2026-09-17.json` (347 URLs with family), `spec/inventory/navigation-2026-09-17.json`, `spec/inventory/redirects-observed-2026-09-17.json`. Per-family signals: `docs/page-family-signals-2026-09-17.md`. Designed IA: none exists; the "Proposed" notes below are the first attempt.

## 1. The site at a glance

| Family | URLs | Content type | Template | Requirements file |
| --- | ---: | --- | --- | --- |
| Homepage | 1 | page 3657 | kit 8, popup 3713 | `page-families/homepage-and-locations.md` |
| Campus pages | 44 | page (hand-built, no CPT) | 6140 template; Austin and Miami older | `campus-page/` |
| Campus local-SEO posts | 33 | post nested under a campus slug | single-post 4476 | `page-families/editorial-and-events.md` |
| Video resources | 89 | `alpha_video_resource` CPT at `/resources/` | theme render | `page-families/video-and-media-library.md` |
| Blog | 69 plus `/blog/` | post | single-post 4476 | `page-families/editorial-and-events.md` |
| Alpha Answers | 38 plus `/ai/` | post under `/ai/` | single-post 4476 | `page-families/alpha-answers.md` |
| News and press | 26 plus `/news/` | post | single-post 8919 | `page-families/editorial-and-events.md` |
| Reference | 9 | page | various | `page-families/program-reference-and-careers.md` |
| Podcast landings | 7 | page | various | `page-families/editorial-and-events.md` |
| Program | 6 | page | 3719 and others | `page-families/program-reference-and-careers.md` |
| Events | 5 | page plus imported `hubspot_event` posts | 3414 | `page-families/editorial-and-events.md` |
| Utility and confirmation | 5 | page | | `page-families/legal-campaign-review.md` |
| Campaign landings | 5 | page | `/jb/` renders homepage document 3657 | `page-families/legal-campaign-review.md` |
| Admissions | 3 plus non-sitemap application pages | page | 3789, 3481, 8429, 8352 | `page-families/admissions-forms-and-confirmations.md` |
| Legal | 3 | page | | `page-families/legal-campaign-review.md` |
| Author | 3 | archive | 9123 | `page-families/program-reference-and-careers.md` |
| Careers | 1 | page (stub, 48 words) | theme render | `page-families/program-reference-and-careers.md` |

Total in sitemaps: 347 (163 posts, 92 pages, 89 video resources, 3 authors). Not in sitemaps but live: `/apply/` (redirect chain), `/application-fs/?submission_campus=...`, `/application/?submission_campus=...`, `/resources/` archive. `/alpha-answers/` is a 404.

## 2. Navigation (observed)

Header template 76, identical on desktop and mobile. Six top-level items:

| Item | Destination | Children |
| --- | --- | --- |
| The Program | `/the-program/` | Love School, Learn 2x in 2hrs, Learn Life Skills (anchors); Alpha in Action (`/video-library/`); Life Skills Workshops (missing trailing slash, extra 301); Alpha High School (external) |
| Admission | `/admission/` | none |
| Locations | `/locations/` | See Alpha on the Map, then 18 state groups plus Puerto Rico and Alpha Anywhere, each listing campuses |
| Events | `/upcoming-events/` | none |
| Resources | none (`#`) | Blog, In the Media (`/news/`), Alpha Answers (`/resources/`, the video archive), Video Library, FAQ, Careers |
| Specialty Schools | none (`#`) | GT School, Montessorium, NextGen Academy, Nova Academy, Texas Sports Academy, Waypoint Academy (all external) |

Header CTA: "Contact Us" to `/learn-more/`, which is a general page with the only HubSpot form embedded in HTML (form `d95ac89a-10ad-43c4-a90f-460cd0fd3179`).

Footer template 77: Cognia badge; About (program anchors, workshops); Resources (Alpha in Action, Alpha Anywhere, Locations, Bring Alpha to My City, FAQs); Insights (Blog, In the Media, Other Articles which also points at `/blog/`); Other Schools (Future of Education linktree, GT School, Texas Sports Academy, NextGen, Nova); legal row (Privacy Policy, Terms of Use, Editorial Policy); copyright. No social links in the footer. `/founders/` swaps in footer 4107.

Menu ownership: the WordPress menu IDs are in the navigation inventory; who may change the menu is the Elementor owner gap.

## 3. Redirects (observed)

Three layers are active and identifiable by the `x-redirect-by` header: Yoast SEO Premium (`/lake-forest/` to `/orange-county/`), the Redirection plugin (most vanity and legacy routes), and WordPress core canonical redirects (trailing slashes). The August admin inventory counted 225 Redirection rules; they have not been exported.

| From | To | Hops | Layer | Note |
| --- | --- | ---: | --- | --- |
| `/lake-forest/` | `/orange-county/` | 1 | Yoast | Two local-SEO posts still live under `/lake-forest/` |
| `/apply/` | `/apply-austin/` then `/application/?submission_campus=austin_k8` then `/application-fs/?submission_campus=austin_k8` | 3 | Redirection | Generic Apply pre-selects Austin K-8 |
| `/application-fs/` (no query) | `/admission-forms/` | 1 | Redirection | |
| `/admissions/` | `/admission/` | 1 | Redirection | |
| `/events/`, `/programs-events` | `/upcoming-events/` | 1 | Redirection | Homepage and admission CTAs still link `/programs-events` |
| `/about/` | `/the-program` then `/the-program/` | 2 | Redirection then core | |
| `/new-york/` | `/new-york-city/` | 1 | Redirection | |
| `http://`, `www.` | `https://alpha.school/` | 1 | edge | |
| `/alpha-answers/`, `/contact/`, `/tuition/`, `/campuses/`, `/austin-founders/`, `/nyc/`, `/los-angeles/` | 404 | | | `/austin-founders/` is linked from the Locations page |

Policy (from `registry/redirects.json`): one authoritative rule per source route, one hop where practical, preserve campus and tracking parameters. The `/apply/` chain and the `/about/` chain violate it today.

## 4. Content types and their sources

| WordPress type | Count (Aug 2026 admin inventory) | Written by | Read by |
| --- | ---: | --- | --- |
| page | 140 (92 in sitemap) | Elementor editor, n8n (campus fields), Alpha MCP | Visitors, sitemap, llms.txt, `.md` alternates |
| post | 173 (163 in sitemap) | Editors; Substack import; Airtable import for `/ai/` | Same |
| alpha_video_resource | 89 | LLM content program | Same, with VideoObject schema |
| hubspot_event | 350 (29 published, 321 draft) | HubSpot Marketing Events import | Event pages and campus strips; not in sitemap |
| Elementor templates (header, footer, popup, single, archive, 404, kit) | 8 known | Elementor owner (gap) | Every page |
| Redirection rules | 225 | Redirection plugin admin | Every request |

## 5. Machine-readable surfaces

Every HTML response advertises `Link: </llms.txt>; rel="llms-txt"` and a Markdown alternate at `<path>.md` (homepage `/?format=markdown`). `/llms.txt` is regenerated daily by Yoast (154 lines). `/llms-full.txt` timed out on September 17 (Q-32). robots.txt allows everything. Yoast emits a site-wide JSON-LD graph including a FAQPage block on every page, including legal, 404, and thank-you pages. `og:type` is `article` on nearly every page. No page carries `noindex`.

## 6. Structural findings that need a decision, not a ticket

| Id | Finding | Decision needed |
| --- | --- | --- |
| Q-28 | "Alpha Answers" exists twice: the nav item and the `/resources/` video archive carry the name, while the `/ai/` hub (38 posts) is titled "Artificial Intelligence" and `/alpha-answers/` is a 404. | One canonical Alpha Answers destination and one name for `/ai/` |
| Q-29 | No indexability policy: confirmation pages (`/success/`, `/thank-you/`, `/application-submission/`, `/application-status/`), application pages, and author archives are indexable and in the sitemap. | Which families are noindex; who owns the Yoast settings |
| Q-30 | Popup 3713 loads on the homepage and `/jb/` with no recorded purpose, owner, or expiry. | Keep, retire, or document |
| Q-31 | `/jb/` renders the homepage document with three H1s and no meta description; campaign landings have no recorded owner or expiry. | Campaign landing rules per `legal-campaign-review.md`, with owners |
| Q-33 | Two single-post templates (4476, 8919) and a footer variant (4107) exist with no recorded reason. | Consolidate or document |
| Q-34 | The generic `/apply/` route pre-selects Austin K-8 through a three-hop chain; `/application-fs/` shows the campus H1 and admissions email only via client-side script. | Intended application entry, and whether campus identity must be server-rendered |

Defects that are already covered by existing rules and should be filed as tickets, not decided again: the dead `/austin-founders/` link on Locations; `/lake-forest/` posts under a redirected slug; CTAs pointing at `/programs-events`; missing trailing slash on `/lifeskills-workshops`; missing H1 on `/founders/` and `/privacy-policy/`; missing meta descriptions on single posts, video resources, careers, `/jb/`, authors; FAQPage schema on unrelated pages.

## 7. Proposed target structure

Not a redesign. A statement of what each URL space is for, so new pages land in the right place:

- `/` and `/the-program/`, `/2-hour-learning/`, `/lifeskills-workshops/`: Discover.
- `/ai/` (rename to the Alpha Answers name or move the archive), `/blog/`, `/faq/`, `/resources/` videos, `/news/`, podcast landings: Believe. One "answers" hub, not two.
- `/locations/` and `/<campus>/`: Localize. Local-SEO posts stay under their campus and move with it.
- `/admission/`, `/admission-forms/`, application routes, `/upcoming-events/`: Act. One generic apply entry that asks for the campus rather than assuming Austin.
- `/success/`, `/thank-you/`, `/application-submission/`: Confirm. Noindex, out of sitemaps and LLM exports.
- `/careers/`, `/bring-alpha-to-your-city/`, `/founders/`: secondary audiences, each with an owner (Q-02, Q-24).
- Legal: as is, with an owner.

## Sources

`spec/inventory/*-2026-09-17.json`, `docs/page-family-signals-2026-09-17.md`, marketing workspace `docs/migration/generated/wordpress-admin-browser-inventory.json` (2026-08-06), `registry/redirects.json`, `registry/navigation.json`, `registry/templates.json`.
