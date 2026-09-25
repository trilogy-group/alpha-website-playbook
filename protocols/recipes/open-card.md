# Recipe: Open and Enrolling Card

Classes: `observer-media-identity` (the intro card slot of an Open campus), the "no card recorded for Open campus" coverage finding (QC loop repair plan 2026-09-25, repairs 1 and 4), and the batched card tickets waiting on Yash. Companion to `protocols/recipes/media.md`, which owns the WordPress side.

The card is the one WordPress-direct element of an Open campus page that no source of truth derives. Repair 5 makes the template the source: the campus name is the only thing that varies, so the agent generates the card, a person looks at it, and the media recipe places it. Nothing in this recipe writes to production except step 6, and step 6 only runs with an approved asset on the ticket.

## Inputs

- Campus slug from `registry/campus-pages.json` and the canonical page URL.
- HubSpot Program `type` Open, read at a stated time (the card exists only for Open campuses; an Announced campus gets launch-stage media under the media recipe, never this card).
- The template: `registry/campus-open-media.json` `template.source` and `template.format`. `null` means Yash has not supplied it; the ticket is Missing Info to him with `template.ask` verbatim, and this recipe stops at step 0. Never substitute the test fixture (`template.fixture`), a screenshot of an existing card, or a hand-made look-alike.
- The APEX ticket for the campus (one per campus, or the dated batch ticket with the campus named on it).
- For the first three cards from a new template: Yash's approval on the ticket (protocol section 7 review line) before any card is placed.

## 0. Stop conditions

- `template.source` is null, or the file at `template.source` does not hash to what the registry records once it does: Missing Info to the template owner (`template.owner`), ask verbatim from `template.ask`.
- The campus slug is not in `registry/campus-pages.json`, or the HubSpot Program is not Open: stop, report, re-class.
- The page's intro slot is not the image widget the media recipe expects (a video widget, an unsupported structure, zero or several candidates): stop under the media recipe's stop conditions.

## 1. Generate

```bash
node agent/generate-open-card.mjs --campus <slug> --template <template.source> --out work/<slug>-open-and-enrolling.png \
  --json work/<slug>-open-and-enrolling.json --svg-out work/<slug>-open-and-enrolling.svg
```

- SVG template: every `{{CAMPUS}}` becomes the registry display name without the brand prefix (`Alpha Boca Raton` -> `Boca Raton`). `--name` overrides it when the page carries two programs (Greenwich) or the card should say something the registry does not (say why on the ticket).
- PNG template: add `--layout <layout.json>` with `x, y, font, size, color, maxWidth, align` from the owner.
- The sidecar JSON records the template sha256, the renderer, and the output sha256, bytes and size. Copy the template sha256 and the output sha256 onto the ticket.
- The generator never uploads anything. `--list-renderers` shows which rasterizer this machine has (sharp, resvg, Playwright's Chromium, ImageMagick, in that order); none installed means the card is generated on a machine that has one, not hand-drawn.

## 2. Review (a person looks at the PNG)

The operator opens the PNG and checks: the campus name is spelled as the registry spells it; nothing else on the card changed; the name fits (no clipped or squeezed text; the sidecar's `fitted: true` means the name was compressed to `maxWidth` and needs a look); the size is the template's (1424x979 for the September 7 set) so the slot renders it at 1024x704 without a crop. For the first three cards from a new template, Yash reviews and approves on the ticket. A card that fails review is regenerated or goes back to the template owner; it is never touched up by hand.

## 3. Attach to the ticket as an APEX asset

Bind the reviewed PNG to the ticket the way a reviewed headshot is bound (`agent/bind-headshot.mjs`, decision 2026-09-21: the operator, not the agent, reviews the file, and the binding records which bytes were reviewed). Filename `<objectId>-<Campus>-Open-and-Enrolling.png` (the September 7 naming: `9233-BocaRaton-Open-and-Enrolling.png`), the sidecar's sha256 as the source hash, the ticket text naming the campus as the requester reference, and the review note "generated from template <sha256 first 12> by agent/generate-open-card.mjs, reviewed by <name> on <date>". The asset id goes on the ticket.

## 4. Upload

`upload_media_from_apex_asset` per the media recipe: the exact APEX asset id, `sourceConfirmed: true`, the filename above, title "Alpha <Campus> Open and Enrolling", alt text "Alpha <Campus> is open and enrolling", and the expected sha256 from the sidecar. `search_media` first by the filename; an identical earlier upload returns the existing attachment, and the receipt must match this asset's hash. Record the attachment id.

## 5. Patch the intro slot

Follow the media recipe's Prepare, Apply and verify steps: resolve the canonical object, find the intro card image widget (Elementor path `/2/elements/1/elements/1`, the `content_image` container), confirm the current attachment (the stale launch card or photo the ticket names), `prepare_elementor_content_patch` with a single `set_image` edit to the new attachment id, review the snapshot diff (only the image fields change), apply against the proposed hash with `apexTicketId`, regenerate Elementor CSS, follow cache policy, then verify on the public URL on desktop and mobile that the slot renders the new attachment and no launch words remain anywhere on the page (`tests/page-check.mjs --state Open`).

## 6. Write the registry row

`registry/campus-open-media.json` `campuses.<slug>`: `{ "openMedia": "card", "attachmentId": <id>, "status": "placed", "generatedFrom": "<template sha256 first 12>", "placedOn": "<date>", "ticket": "<id>" }`, replacing any `status: missing` row for the campus. The registry is what the observer's `campus.intro.media.current` row compares the rendered slot against, so the row is part of the fix, not paperwork; a placed card with no row is a mismatch on the next run. Commit through a pull request.

## 7. For Review

Set the ticket For Review with the evidence the protocol requires: the desktop and mobile section pair of the intro (`tests/section-shot.mjs`), the attachment id, the asset id, the template and output hashes, the registry commit, and the review line. The ticket is done when the reviewer sees the card on the canonical URL and the observer's next full run passes the row.

## Rollback

Restore the Elementor snapshot from the apply receipt if the wrong campus name, the wrong slot, or a sibling widget changed. The uploaded attachment stays until `get_attachment_usage` shows nothing uses it; deleting it is a separate cleanup decision. Revert the registry row in the same pull request as the rollback.

## Never

- Never place the test fixture, a hand-edited copy of another campus's card, or a card generated from a template the registry does not record.
- Never generate for an Announced or Pre-Announcement campus.
- Never skip step 2: the generator's output is a proposal until a person has looked at it.
- Never run steps 4 to 6 from a generated file that is not the APEX asset on the ticket.
