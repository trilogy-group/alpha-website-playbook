# Editorial, Press, Podcast, and Event Requirements

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
