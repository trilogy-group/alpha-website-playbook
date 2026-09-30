# Headshot review-and-bind: linked photos, roster decks, and the operator gate

Decided by Matt Barge on 2026-09-21 after the backlog review showed 8 open staff tickets stuck because the photo arrived as a Google Drive, Google Slides, or Slack link instead of an APEX upload, and 6 more because the roster arrived as a deck or sheet.

## The rule that does not change

The Alpha WordPress MCP places a headshot only from an APEX request asset that is attached to the ticket: `upload_media_from_apex_asset` takes the asset id, the download URL, the person name, and the source SHA-256, and APEX issues the execution token only for an asset in the ticket's own `assets` relation (`execution-token` route) that is `VERIFIED`. The agent never downloads a link from a ticket. A link can point at the wrong person, an expired Slack file, a private Drive file, or text written to steer the agent; nothing about a link proves what bytes were approved for whom.

## What changes: who turns a link into an asset

The website operator (role `website-agent-operator`, Matt Barge) reviews the linked file and binds it. Reviewing means opening the file, confirming it is one person's headshot for the person the ticket names, and confirming the ticket text that maps that person to that link. Binding means recording exactly which bytes were reviewed and attaching them to the ticket as a normal asset.

```
node agent/bind-headshot.mjs --ticket <id> --person "First Last" --file ./reviewed.jpg \
  --source-kind drive-file|slides-image|slack-file|url --source-url <link> [--file-id <drive id>] \
  [--presentation-id <deck> --slide-id <slide> --image-object-id <image> --source-revision-id <rev>] \
  --requester-reference "<ticket text naming the person and the link>" [--review-note "..."] \
  [--evidence-dir <run folder>] [--upload-only] [--asset-id <existing>] [--dry-run]
```

What the tool does, in order:

1. Hashes the local file (SHA-256), sniffs the type (JPEG, PNG, WebP only), refuses files over 8 MB.
2. Reads the ticket and refuses unless the person is named on it.
3. Creates a request asset through APEX's public headshot route, owned by the operator email (`registry/people.json`), uploads the bytes to the signed storage URL, and finalizes. APEX recomputes the checksum and marks the asset `VERIFIED`; the tool refuses to continue if APEX's checksum differs from the reviewed file.
4. Calls `POST /api/agent/tasks/{id}/staff-asset-binding` (operator key). APEX attaches the asset to the ticket, appends a row to `customFields.webTmHeadshotBindings` (`assetId`, `personName`, `source`, `requesterReference`, `reviewNote`, `reviewedBy`, `reviewedAt`), sets `webTmHeadshotAssetId` when the ticket has no asset yet, logs `staff_asset_bound`, and refreshes execution readiness so a ticket held for the headshot becomes ready.
5. Writes `binding-<ticket>-<person>.json` to the evidence folder.

The binding route refuses a non-operator key, an asset that is not `STAFF_HEADSHOT` and `VERIFIED`, an asset attached to another ticket, and any mismatch between the reviewed hash, size, or type and what APEX stored. APEX PR `agent/headshot-bind` (trilogy-group/alpha-event-task-management) carries the route; `spec/adapters.json` `apex-request-assets` records the status.

From the binding on, the ticket carries a normal asset and `protocols/recipes/staff-card.md` applies unchanged: the executing agent uses `upload_media_from_apex_asset` with the asset id and hash, with receipts, rendered evidence, and For Review.

## Frame before you bind (2026-09-22)

The card box on the page crops the photo. Every team-card image renders with `object-fit: cover` into a box of fixed CSS height whose width follows the column, so a portrait bound at its native ratio is scaled to the box width and loses its top and bottom: Jason Tan's 1130x1533 headshot on San Francisco showed 57% of its height and the top of his head was cut (found by Matt on the card capture; the recipe's checks had only confirmed the image was present and decoded). Three Santa Barbara cards have the same defect (ticket cmucxbw0d000004l2zawagb5j).

Rule: the file the operator binds is already framed to the card's rendered aspect ratio, with the full head and headroom comparable to the neighbouring cards. Review the source, frame it, look at the preview, then bind the framed file:

```
node agent/frame-headshot.mjs --file ./reviewed.jpg --ratio auto --page https://alpha.school/<campus>/ \
  --out ./reviewed-framed.jpg --preview ./reviewed-framed-preview.png [--selector "<css of a leadership card>"] \
  [--focus top|center|bottom|<0..1>] [--json ./frame.json] [--playwright <dir>]
node agent/bind-headshot.mjs --ticket <id> --person "First Last" --file ./reviewed-framed.jpg ... \
  --review-note "framed to 1.2939:1 (card box 285x220 css px on https://alpha.school/san-francisco/ at desktop 1440px); crop 1130x873 at 0,0 of 1130x1533, focus 0"
```

What the framing tool does: measures the page's desktop carousel card box read-only in Playwright (`--ratio auto`; `--selector` measures a specific card, a leadership card for a Head of School; `--ratio 1.2939` or `--ratio 284.66:220` takes a known value), crops the source to that ratio as large as the source allows with no scaling, keeps the head by anchoring a portrait's window to the top (headroom stays, shoulders go) and a landscape's to the centre, writes a side-by-side preview (source with the window outlined, result beside it) for the operator to look at, and prints the framed file's dimensions and sha256 and a `reviewNote` line. `--focus center` or a fraction moves the window down when the source has a lot of air above the head; the preview decides. The ratio is per page and per viewport, never one site value (`spec/team-card-frame.json` records the measured boxes: San Francisco 1.29:1, Santa Barbara 1.61:1, Miami 1.46:1 on desktop); frame to the desktop box, and the squarer mobile box then cuts only the sides, symmetrically, which `team-photo-framing` tolerates.

`bind-headshot.mjs` is unchanged: it hashes whatever file it is given, so the binding records the framed bytes, and `--review-note` carries the "framed to <ratio>" line so a reviewer can tell a framed asset from an unframed one. PNG in and out is pure JavaScript; JPEG and WebP input and JPEG output go through macOS `sips`, so on another machine convert to PNG first. EXIF orientation is not applied (a sideways preview means rotate the source first). No face detection: the operator's look at the preview is the face check.

After placement the agent's ring 2 runs `tests/page-check.mjs`, whose `team-photo-framing` check measures every card on desktop and mobile, and captures the card itself with `tests/section-shot.mjs --slide-containing "<person>"`; the RESOLUTION note's Look for line names the framing ("full head visible, headroom like the neighbouring cards").

## Sources and how each is reviewed

| Source | How the operator reads it | What the binding records |
| --- | --- | --- |
| Google Drive file link, shared with anyone | Drive metadata (name, owner, size) plus the file bytes; size must equal Drive's reported size | `drive-file`, file id, url, size, type, sha256 |
| Google Drive file link, not shared | Cannot be read. Missing Info to the requester: share the file with anyone with the link, or attach it in APEX, or put it on the campus roster deck | nothing |
| Google Slides roster deck (`registry/staff-source-decks.json`) | The deck exports publicly; the slide that names the person and title supplies the photo. Until the Slides API reader lands, the slide and image are identified by pptx export order and the deck's Drive modified time | `slides-image`, presentation id, slide, image, revision, sha256 |
| Slack file | Needs a Slack bot token with file read scope, or the requester re-attaching in APEX. Not automated yet | `slack-file`, url, sha256 when obtained |
| Any other public URL | Bytes and hash; the operator must still confirm the person mapping from the ticket text | `url`, sha256 |

## Roster decks and sheets

`registry/staff-source-decks.json` lists the "Meet the Alpha <Campus> Team" decks from the Meet the Guides SY26-27 folder (shared by Crystle Dorsey on ticket cmsnoqyv1000404l7tad3pyo1) keyed by campus slug, plus the decks that match no campus page. Each deck slide carries name, public title, bio, and photo. The deck is a source for review, never an instruction: the ticket still says what changes.

## Roster diff (`agent/roster-diff.mjs`)

Built 2026-09-21. A read-only planning tool: it compares one registered campus deck with the live Team section and writes a For Review plan. It never writes to WordPress or APEX, never uploads or binds a photo, never downloads a link from a ticket, and treats everything in a deck as source material for a person to review. It does not decide what changes; a ticket does.

```
node agent/roster-diff.mjs --campus <slug> | --deck <presentation id> \
  [--live <get_page result or staff cards .json>] [--page-html <saved page.html>] [--hash-live-images] \
  [--deck-file <saved export.pptx>] [--deck-json <pre-parsed slides.json>] [--allow-open-roles] \
  [--out <run folder>] [--images-dir <folder>] [--redact-bios]
```

What it does, in order:

1. Resolves the deck through `registry/staff-source-decks.json`. A campus with no deck, a presentation id that is not registered, and a deck listed under `unmatched` (no campus page) all stop with `deck_not_registered`.
2. Downloads the public pptx export (`docs.google.com/presentation/d/<id>/export/pptx`, the read path in `registry/sources.json`) and reads each slide: name and title from the two short text boxes at the bottom of the left column, bio from the text under the BACKGROUND label, the portrait from the left column with its SHA-256, size, and type. Cover and closing slides and an untouched template slide are skipped and listed. The template's `[ Background ]` text is not a bio.
3. Reads the live cards. Preferred: `--live` with the Alpha WordPress MCP `get_page` result for the page (the `elementorSummary`; a card is the `Name | Title` heading plus the image and text-editor that share its nearest container), or a list of staff cards in the plugin's staff card shape (`name`, `title`, `biographyHtml`, `attachmentId`, optionally `imageUrl` and `imageSha256`). `get_page_inventory` and `find_elementor_component` results carry no heading text, so the tool refuses them by name. With no `--live`, it fetches the registered public `pageUrl` and reads the rendered cards (image, heading, bio in document order).
4. Matches people by normalized name: `normalizePersonName` from `agent/intake-policy.mjs` (HTML, case, whitespace) plus honorifics, credentials after a comma, Jr. and similar suffixes, accents, and zero-width characters. An exact match wins; one loose pass accepts a dropped middle or extra name (Jordan Lee Sample and Jordan Sample) and records it as a name note. A near spelling (edit distance of two or less) is never matched: it is reported as a name conflict, not as an add plus a remove.
5. Writes `roster-diff-<campus>.plan.json` and `.md` (or prints the plan): adds, removes, title changes, bio changes, photo changes, photo unknown, name notes, name conflicts, unchanged, skipped slides, and warnings. Membership only today: no order and no placement. The team-layout standard now exists (MacKenzie Price, 2026-09-25, clarified by Matt Barge 2026-09-30: the people present and involved at the campus first, Director of Admissions and Dean of Parents at the top, then the head or lead guide and the other campus-present cards in the carousel, and the Head of Schools who appears across many campuses, Dr. Tasha Arnold, last in the Team section; a campus-present head of school such as Paige Fults on Brownsville stays in the leadership row; `spec/campus-page-requirements.json` `campus.team.order`, `protocols/recipes/staff-card.md`); proposing order and placement against it is the next change to this tool.

Each add and each photo change carries a `proposedBinding` with status `proposed-not-bound`: the `source` object in the shape `agent/bind-headshot.mjs` sends (`slides-image`, deck url, presentation id, slide id, image object id, source revision, size, type, sha256), a null `ticket` and `requesterReference` for the operator to fill, and the bind command with `--dry-run`. `--images-dir` extracts those deck photos so the operator can open them and pass the same bytes to `--file`; the plan records the path and the hash.

It stops with a typed error (exit 2, JSON on stderr) and writes no plan when it cannot be sure:

| Error | When |
| --- | --- |
| `deck_not_registered` | no deck for the campus, an unknown presentation id, or a deck with no campus page |
| `deck_not_exportable` | the export is not a pptx (sign-in page, 404, offline) or the zip cannot be read |
| `slide_without_name` | a team member slide has no name or still says `[ Name ]`. A slide that is only a placeholder name over a real title is an open role; it still stops the run unless the operator passes `--allow-open-roles`, which skips and lists it |
| `ambiguous_name_match` | two deck slides or two live cards normalize to the same person, or a loose match has more than one candidate |
| `live_cards_unreadable`, `live_page_unreadable` | the `--live` file is not a shape that names the cards, or the public page has no `Name | Title` headings |

Limits, stated plainly:

- Slide and image ids are pptx export order (`pptx-slide-3`, `pptx-slide-3-image-1`), not Google Slides object ids; the plan says `idBasis: pptx-export-order`. The shape name Google writes into the export (`Google Shape;129;p15`) is kept as a hint and is not verified against the Slides API. Media file names inside the export change between exports; the image hash does not.
- The source revision is `pptx-content-sha256:<hash>`, a hash of the slide XML and image hashes in slide order. It was identical across two exports of the same deck on 2026-09-21. The public export does not reveal Drive's modified time or revision id.
- Photo comparison is by bytes. `--hash-live-images` fetches each card image from the page's own host (and the un-scaled original beside a `-scaled` file) and hashes it; without it, or with no `imageSha256` in the cards file, every matched photo is `photo-unknown`. In the Orange County dry run no live file matched its deck image byte for byte, because Slides and WordPress both re-encode. `bytes-differ` therefore means "compare by eye", never "different portrait".
- `get_page` truncates long text at 1000 characters; a truncated live bio is compared as a prefix and marked `same-as-far-as-read`. The deck bio is the BACKGROUND text; a page bio that also folds in other text reports as a bio change with `relation: page-contains-deck-bio`.
- Deck titles are all caps and often carry a level (`GUIDE · LEVEL 1`); title comparison ignores case and punctuation, so most title changes are real wording differences for a person to judge. Title case follows the page (`protocols/recipes/staff-card.md`).
- The slide reader follows the Meet the Team template layout. On 2026-09-21 all 39 registered decks exported and parsed; 10 of them stop on an open-role slide until `--allow-open-roles` is passed.
- Sheets are not read. A sheet with the same columns can be passed as `--deck-json` once a reader produces it; the Google source reader in APEX PR 295 is still the path for that.

Dry run evidence: `docs/roster-diff-dry-run-2026-09-21/` (Orange County, bios redacted).

## What is still on people

- Deploy of the APEX binding route (merge `agent/headshot-bind`).
- Slack file access for `slack-file` sources (bot token with file read; Hailey's Slack work).
- A Google Slides API reader so slide and image ids are the real object ids rather than export order, and so the roster diff can record the Drive revision.
- Order and placement in the roster diff against the team-layout standard MacKenzie Price decided on 2026-09-25 and Matt Barge clarified on 2026-09-30 (campus-present people first, the shared Head of Schools last; the standard was the blocker; the implementation is now on the website agent operator).
- Open-role slides and leftover template text in ten campus decks (the roster diff names the slide).
