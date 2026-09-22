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
3. Photo: `upload_media_from_apex_asset` with the confirmed mapping. Never infer who a portrait is; never reuse a similar-looking image. The attachment is applied at full size, and the card box crops it (below), so the asset must already be framed: an asset whose ratio is not the card's is not ready to place. If the ticket's asset is an unframed portrait, the operator frames and binds a framed copy first (`docs/headshot-binding.md`, "Frame before you bind"); the agent does not crop.
4. `prepare_elementor_staff_patch` with the action, the person fields, and `expectedCurrent` for update and remove. Check the diff touches only that card.
5. Apply, regenerate the page's CSS, clear cache.
6. Tests. Ring 1: the card shows the requested name, title, bio, and photo, and no other card changed. Ring 2: `tests/page-check.mjs` including `team-photo-framing` (the framing check must report the card as pass on desktop and mobile; a skipped check is not a pass, pass `--playwright <dir>`), plus a section capture of the card itself on desktop and mobile with its photo decoded (`node tests/section-shot.mjs --url <canonical URL> --selector "#team_carousel .swiper-slide" --slide-containing "<person>" --name "team carousel: <person> card" --out <dir>`; the tool moves the carousel to that slide, so a card past the visible slides is captured on screen; for a leadership card use its container selector). Look at the crop: the full head is visible with headroom like the neighbouring cards. Ring 3 after the cache clear.
7. Attach both pairs to the ticket on the same run id: the card crop with `node agent/attach-evidence.mjs --ticket <id> --run <runId> --page <canonical URL> --desktop <slug>-desktop.png --mobile <slug>-mobile.png --section "team carousel: <person> card"`, then the full-page ring 2 pair with the same command without `--section` (`--label "Team section after <person>"` optional). Then write the RESOLUTION note with Look for naming the card the section capture shows and the framing ("<person> card, sixth slide of the team carousel: full head visible, headroom like the neighbouring cards"), and Tests naming `team-photo-framing pass (desktop, mobile)` (protocol section 7); a Look for that names a card the crop does not show, or a crop that shows a cut head, is not finished.

## The card box crops the photo (2026-09-22)

Every team-card image renders with `object-fit: cover` into a box of fixed CSS height whose width follows the column (San Francisco carousel 284.66x220 css px on desktop, 1.29:1; Santa Barbara 450x280, 1.61:1; Miami 321x220, 1.46:1; mobile boxes are squarer). A portrait bound at its native ratio is scaled to the box width and the browser discards the rest from the top and bottom (object-position 50% 50%) or the bottom (50% 0%): Jason Tan's 1130x1533 headshot on San Francisco showed 57% of its height with the top of his head gone, and Kele Mkpado, Carson Lehmann, and Catherine Streicher on Santa Barbara show 59 to 62% (ticket cmucxbw0d000004l2zawagb5j). The recipe's "image present and decoded" never saw it; Matt did, on the card capture. Two rules follow:

- Source side: every headshot is framed to the card's rendered ratio before it is bound, with the full head and headroom comparable to the neighbouring cards: `node agent/frame-headshot.mjs --file <reviewed.jpg> --ratio auto --page <canonical URL> --out <framed.jpg> --preview <preview.png>` measures the page's desktop carousel box (`--selector` for a leadership card), crops with the head kept (top-anchored for portraits, centred for landscapes, `--focus` to move the window), writes the side-by-side preview for the operator to look at, and prints the framed file's dimensions and sha256. Bind the framed file, unchanged, with `agent/bind-headshot.mjs`, and put the tool's `reviewNote` line ("framed to 1.2939:1 ...") in `--review-note`. The ratio is per page, measured live, never a constant (`spec/team-card-frame.json` records the measured boxes).
- Evidence side: `tests/page-check.mjs team-photo-framing` measures every card image on desktop and mobile and fails when less than 95% of the height is visible or a side cut passes 30% of the width; the section capture is the card itself; the note's Look for line names the framing. A staff change without that check passing for the card and a card capture showing the full head is sent back (`docs/sweep-runbook.md`).

## Card tagging decides which tool applies (2026-09-17)

The staff tool treats a card as part of the leadership collection only when its Elementor title starts with `Team head`. Pages built by copying a card keep the copied person's title (East Bay: ten cards titled `Dr. Kori Riordan`), so `find_elementor_component` by `personName` finds the card but `prepare_elementor_staff_patch` reports `alpha_mcp_staff_card_not_found`. Then:

- Photo only: use `prepare_elementor_content_patch` with one `set_image` edit on the card's image widget (`expectedCurrentAttachmentId` set to the current id, `assetMapping` with the confirmed name and attachment). The diff must be exactly the image id and url of that widget. Sarah Rettig on East Bay was done this way.
- Title, bio, or quote only: `replace_substring` edits on the heading and text widgets with `expectedCurrent` counts, same rings.
- Add or remove in an untagged row: tag the cards first with a structure patch (`set_element_meta` with `title: Team head` and `expectedCurrent` set to the copied title, one operation per card), apply, then run the staff tool normally. Plugin 0.5.0 or later; before that, send back to the Elementor owner.

## Known tool limits

- `add` on plugin builds before 0.3.3 clones the template card with duplicate element ids on every child. Refuse to apply an add unless `health` reports 0.3.3 or later. Production has run 0.3.3 since 2026-09-17; the Tara Marlow add on Tulsa was the first add applied.
- Two uploads in one session on plugin builds before 0.3.3 replay the first upload's attachment. The bridge now keys each upload by asset id and hash; always compare `sourceSha256` in the receipt with the file you approved before using the attachment id.
- Uploads wider or taller than 2560 px are served by WordPress as the `-scaled` copy, so `verify_public_page` reports the original file name as missing media. Pass the `-scaled` URL (or check the live `src`) for large headshots; Edward Kang on Chicago (4672 by 7008) was verified this way.
- Full-page screenshots show team photos blank because the images lazy-load, and a lazy image with `decoding=async` reports `complete` and `naturalWidth` before it paints (San Francisco, 2026-09-22). For ring 2, capture the card with `tests/section-shot.mjs`, which scrolls it into view and awaits `img.decode()` on every image inside before the screenshot, and attach that pair with `--section`.

## Refuse and send back when

- The person cannot be found exactly once (update, remove) or the target row is not a recognized structure (add).
- The title is not in the approved title list, or the bio contains claims, pricing, or admissions promises.
- The photo mapping is not explicitly confirmed, or the file is not JPEG, PNG, or WebP within limits, or the asset is not framed to the card ratio (the binding carries no "framed to" note and the ratio differs from the page's card box by more than 5%): Missing Info to the operator to frame and rebind, not a crop by the agent.
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
