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

Planned, not built: a roster diff tool that reads a deck (or a sheet with the same columns), compares it with the live team section (`get_page_inventory` staff cards), and writes a For Review plan of adds, removes, title changes, and photo changes, each add carrying a proposed binding for the operator to confirm. Ordering waits on the team-layout standard from Joe and Mackenzie; until then the plan proposes membership only. Sheets need the Google source reader in APEX PR 295.

## What is still on people

- Deploy of the APEX binding route (merge `agent/headshot-bind`).
- Slack file access for `slack-file` sources (bot token with file read; Hailey's Slack work).
- A Google Slides API reader so slide and image ids are the real object ids rather than export order.
- The roster diff tool and the team-layout standard.
