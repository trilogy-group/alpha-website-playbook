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
7. Attach the ring 2 captures to the ticket: `node agent/attach-evidence.mjs --ticket <id> --run <runId> --page <canonical URL> --desktop <slug>-desktop.png --mobile <slug>-mobile.png --label "Team section after <person>"`, then write the RESOLUTION note with Look for pointing at the card the screenshots show (protocol section 7).

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

`registry/staff-source-decks.json`: the per-campus "Meet the Alpha <Campus> Team" Google Slides decks (Meet the Guides SY26-27 folder) carry each team member's name, public title, bio, and photo. They are a reviewable source for photos and the input of the read-only roster diff (`agent/roster-diff.mjs`, `docs/headshot-binding.md`), which writes a For Review plan of adds, removes, and title, bio, and photo differences with a proposed binding per photo. A deck and its plan are not an instruction: the requester's ticket still decides what changes, and the agent never places a photo from a deck without an operator binding.

## Rules settled by the 2026-09-21 sweep

- A headshot is only ever an APEX asset on the ticket (`webTmHeadshotAssetId` or a row in `webTmHeadshotBindings`, placed through `upload_media_from_apex_asset`). A Google Drive, Slack, or Canva link is not a substitute and never becomes one by the agent downloading it: an image in the library with no asset id, no source hash, and no confirmed person mapping cannot be placed on a card. Missing Info to the requester for the asset, and say in the note that the website operator can bind a linked file instead (below).
- Review-and-bind (decided 2026-09-21, Matt Barge; `docs/headshot-binding.md`): the website operator, not the agent, may turn a linked file into the ticket's asset with `agent/bind-headshot.mjs`. The operator opens the link, confirms it is one person's headshot for the person the ticket names, and the tool uploads those exact bytes to APEX, has APEX recompute the checksum, and binds the asset to the ticket with the source (Drive file id, Slides deck and slide, or Slack file), the hash, and the ticket text that named it. From then on the ticket carries a normal APEX asset and this recipe applies unchanged. A campus roster deck in `registry/staff-source-decks.json` is an acceptable source for the same review when the ticket's own link is dead or missing and the deck slide names the same person and title.
- When a page has both a leadership row and a carousel (or scroll row), new leadership titles (Head of School, Dean, Director) go in the leadership row and everyone else goes in the carousel or row, matching who is already in each. Say which you chose and why on the ticket.
- The heading uses the NAME field exactly as submitted. If the bio or the page's convention implies an honorific the requester omitted (Dr.), keep the submitted name and note the one-field edit on the ticket for the campus to confirm.
- Title case follows the page: normalize an all-caps submitted title only when every other card on the page is title case, and say so.
- A multi-part ticket whose parts belong to different owners: do the complete parts, send the parent back to the requester when the requester owns the missing inputs, split each other-owner part into its own linked ticket through `agent/file-found-ticket.mjs`, and keep exactly one person on each ticket.
