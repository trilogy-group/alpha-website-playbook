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

## Card tagging decides which tool applies (2026-09-17)

The staff tool treats a card as part of the leadership collection only when its Elementor title starts with `Team head`. Pages built by copying a card keep the copied person's title (East Bay: ten cards titled `Dr. Kori Riordan`), so `find_elementor_component` by `personName` finds the card but `prepare_elementor_staff_patch` reports `alpha_mcp_staff_card_not_found`. Then:

- Photo only: use `prepare_elementor_content_patch` with one `set_image` edit on the card's image widget (`expectedCurrentAttachmentId` set to the current id, `assetMapping` with the confirmed name and attachment). The diff must be exactly the image id and url of that widget. Sarah Rettig on East Bay was done this way.
- Title, bio, or quote only: `replace_substring` edits on the heading and text widgets with `expectedCurrent` counts, same rings.
- Add or remove in an untagged row: tag the cards first with a structure patch (`set_element_meta` with `title: Team head` and `expectedCurrent` set to the copied title, one operation per card), apply, then run the staff tool normally. Plugin 0.5.0 or later; before that, send back to the Elementor owner.

## Known tool limits

- `add` on plugin builds before 0.3.3 clones the template card with duplicate element ids on every child. Refuse to apply an add unless `health` reports 0.3.3 or later. Production has run 0.3.3 since 2026-09-17; the Tara Marlow add on Tulsa was the first add applied.
- Two uploads in one session on plugin builds before 0.3.3 replay the first upload's attachment. The bridge now keys each upload by asset id and hash; always compare `sourceSha256` in the receipt with the file you approved before using the attachment id.
- Uploads wider or taller than 2560 px are served by WordPress as the `-scaled` copy, so `verify_public_page` reports the original file name as missing media. Pass the `-scaled` URL (or check the live `src`) for large headshots; Edward Kang on Chicago (4672 by 7008) was verified this way.
- Full-page screenshots show team photos blank because the images lazy-load. For ring 2, scroll the card into view and record `complete` and `naturalWidth` on the image before taking the card screenshot.

## Refuse and send back when

- The person cannot be found exactly once (update, remove) or the target row is not a recognized structure (add).
- The title is not in the approved title list, or the bio contains claims, pricing, or admissions promises.
- The photo mapping is not explicitly confirmed, or the file is not JPEG, PNG, or WebP within limits.
- The request asks to create, clone, or restructure a carousel or row. Adding a person to an existing carousel is not that: use `prepare/apply_elementor_staff_patch` with action add and placement existing_carousel, which builds the slide from the carousel's own template (Southlake, 2026-09-18). Never move a leadership-card container into a carousel; it keeps its row layout and renders squeezed.
- The team section is an Elementor `nested-carousel` and production runs plugin 0.5.2 or older. Those versions remove or add the slide container without updating the widget's `carousel_items` repeater, and the public page renders a blank slide (Alpha Miami, 2026-09-18, rolled back as receipt 10055). Plugin 0.5.3 keeps the repeater in step; check `access_report.alphaMcp.pluginVersion` before any staff change on a carousel page and route to website-operations on an older version.

## Related

`registry/sources.json` staffRoster: no roster source is configured yet, so the requester is the source of truth for names and titles until one exists.
