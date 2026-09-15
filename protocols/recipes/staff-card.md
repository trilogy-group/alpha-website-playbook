# Recipe: staff cards (add, update, remove, photo)

Classes `staff-add`, `staff-update`, `staff-remove`, `staff-photo`. The Team section of a campus page is a set of cards; each card is an image, a heading in the form `Name | Title`, a bio, and an optional quote. The Alpha WordPress MCP staff tools key on that heading, so the name must match the card exactly.

## Inputs (from the validator)

- Page URL, resolved from the program name when the ticket only names the campus.
- Full name exactly as it should appear.
- For add: public title, bio, headshot asset, placement (leadership row or existing scrolling row or carousel), and order.
- For update: each field that changes and its new value.
- For photo: the headshot asset and the explicit name-to-photo mapping confirmed by the requester.
- For remove: the name and the effective date.

## Steps

1. `resolve_page` on the campus URL; refuse if the live object is ambiguous.
2. `find_elementor_component` with `personName` (update, remove, photo) or with `structure: leadership | existing_scroll | existing_carousel` (add). Exactly one match or stop.
3. Photo: `upload_media_from_apex_asset` with the confirmed mapping. Never infer who a portrait is; never reuse a similar-looking image. The attachment is applied at full size.
4. `prepare_elementor_staff_patch` with the action, the person fields, and `expectedCurrent` for update and remove. Check the diff touches only that card.
5. Apply, regenerate the page's CSS, clear cache.
6. Tests. Ring 1: the card shows the requested name, title, bio, and photo, and no other card changed. Ring 2: full page check plus screenshots of the Team section on desktop and mobile; faces not clipped. Ring 3 after the cache clear.

## Refuse and send back when

- The person cannot be found exactly once (update, remove) or the target row is not a recognized structure (add).
- The title is not in the approved title list, or the bio contains claims, pricing, or admissions promises.
- The photo mapping is not explicitly confirmed, or the file is not JPEG, PNG, or WebP within limits.
- The request asks to create, clone, or restructure a carousel or row.

## Related

`registry/sources.json` staffRoster: no roster source is configured yet, so the requester is the source of truth for names and titles until one exists.
