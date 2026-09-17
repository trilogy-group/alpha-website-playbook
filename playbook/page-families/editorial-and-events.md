# Editorial, Press, Podcast, and Event Requirements

Last verified: September 17, 2026.

## Observed inventory (2026-09-17)

| Sub-family | URLs | Examples | Source system |
| --- | ---: | --- | --- |
| Blog posts at `/blog/<slug>/` | about 85 | `/blog/does-alpha-school-replace-teachers-with-ai/` (transcript, FAQ, sources format) | WordPress; some Substack imports |
| Alpha Answers posts at `/ai/<slug>/` | 39 plus the `/ai/` hub | `/ai/what-is-the-best-private-high-school-in-austin/` | Airtable import (see `alpha-answers.md`) |
| Campus local-SEO posts nested under a campus slug | 33 | `/houston/best-elementary-school-in-houston-.../`, `/lake-forest/...` (still live under a redirected campus slug) | WordPress |
| News and press at `/news/<slug>/` | about 31 plus `/news/` | `/news/alpha-school-featured-on-abc-news-.../` | WordPress |
| Podcast and media landing pages | 8 | `/mike-rowe-.../`, `/shane-parrish-.../`, `/joe-lonsdale-.../` | WordPress pages |
| Events | 4 pages plus imported `hubspot_event` posts | `/upcoming-events/` (119 Goldcast registration links), `/find-an-event-near-you/`, `/upcoming-virtual-information-session/` | HubSpot Marketing Events via the `ahse-events` plugin |

Exact list: `spec/inventory/site-url-inventory-2026-09-17.json`.

Editorial ownership is not recorded: there is no named editor, editorial calendar, or approval path for blog and news (Q-14). Press items are often supplied by campus staff ("add KJRH news article" for Tulsa). Podcast landing pages have no recorded owner or expiry rule (Q-14).

## Campus local-SEO posts

- A post nested under a campus slug inherits that campus's identity: its facts, links, and CTAs must match the campus page and HubSpot Program.
- When a campus slug is redirected (Lake Forest to Orange County), its nested posts are redirected or re-parented in the same change. Posts left under the old slug are a defect.
- Local claims ("best elementary school in Houston") are marketing claims and follow the claim boundary rules.

## Editorial pages and posts

- One canonical URL, semantic H1, unique title, and approved meta description.
- Named author, source, and publication or update date where the format requires them.
- Claims follow the claim registry and brand rules.
- Images have approved rights, alt text, dimensions, and crop.
- Imports from Substack, ART19, or another feed preserve source identity and do not create duplicate canonicals.
- Replaced or consolidated content has one redirect in the authoritative redirect layer.
- Indexability, sitemap, Markdown, and LLM-export behavior follow the page-family policy.

## Event pages

HubSpot Marketing Events is authoritative for public Alpha events under the current architecture.

Requirements:

- Public event source fields include title, event type, program interest, date, time, timezone, location or virtual status, registration URL, and public state.
- Imported `hubspot_event` posts are not edited by hand.
- An eligible public event appears on `/upcoming-events/` and its correctly scoped campus strip within the documented window.
- Registration links resolve logged out.
- Displayed weekday, date, time, timezone, location, and campus match HubSpot.
- Private or canceled events do not accept public registration.
- Sister-brand events do not leak into Alpha feeds.
- Campus shortcodes remain scoped to the approved program-interest label.

## Diagnosis

Inspect HubSpot, plugin import log, imported post and taxonomies, aggregate page, campus shortcode, and cache in that order. Do not fix a campus feed by changing an unrelated event's public state.

## Completion

Verify both the aggregate event page and the campus strip, plus registration behavior and source agreement. For editorial imports, verify source attribution, canonical uniqueness, and no duplicate post.
