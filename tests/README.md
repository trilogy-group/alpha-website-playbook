# Tests and checkers

Agent-independent scripts. Plain Node 20+, no dependencies. Run the repository checks with `npm test` or the detailed validator with `npm run validate`.

- `search-apex-tickets.mjs --url <canonical> [--text <term>] [--check <id>]`: read-only duplicate search over active APEX website tickets. Add `--file <export.json>` for an offline search.

- `validate-ticket.mjs --file <apex tasks json> [--summary]`: protocol step 1. Classifies APEX website tickets against `spec/ticket-classes.json`, reports which inputs are missing, and writes the Missing Info text.
- `page-check.mjs --url <canonical url> [--url ...] [--state Open|Announced] [--json out.json] [--playwright <dir>] [--skip-rendered]`: protocol step 5, ring 2 (text, structure, and framing). Header template and its stylesheet, footer, H1, hero CTAs, intro section, canonical tag, state rules (no launch-era words on Open pages; a named month or season and year on Announced pages), sister-brand words, other-campus image names, approved intro media, CTA link resolution, and `edge-cache-current`. Scans page-owned content only, so shared navigation and footer do not count against a page. Then one rendered check, `team-photo-framing`, in Playwright (borrowed like `rendered-controls.mjs`; `--playwright <dir>` or `PLAYWRIGHT_ROOT`) on desktop 1440x1000 and mobile 390x844: every team-card image (leadership row and carousel slides, lazy loading forced eager, looped duplicates skipped) is measured against its `object-fit: cover` box and the check fails when less than 95% of the image height is visible or more than 30% is cut from either side, naming each failing card with coverage, natural size, box size, and the cropped edges (`viewports.<name>.cards[]` in the JSON has every card). A second rendered check, `brand-visual` (`tests/brand-visual.mjs`, `spec/brand-visual.json`), reads every visible text element's computed font-family, colour and effective solid background on desktop and reports, with selector, value and rule: text not in Montserrat (icon fonts skipped; HubSpot embeds, the Alpha HubSpot Events cards, chat and consent widgets allowlisted and listed as INFO with the reason), a never-row contrast pair from the brand guide's table (sky blue on white or near-white, white on sky blue, white on light blue at body size, navy on medium blue), off-palette large fields and H1-H3 colours once per colour (INFO), and every logo image with the served file's sha256 against `playbook/brand/assets` (INFO). Advisory on the first version: fail-severity findings make the row `warn`, printed and not counted in the exit code, until `check.enforcement.mode` in the spec is `enforced`; severities per finding kind are in the spec. Without Playwright either check is `skipped` with the reason, never passed; `--skip-rendered` skips them on purpose for ring 3 header and footer runs. Exit code 1 on any failure. Screenshots are still required by the protocol and are not produced by this script.
- `validate-community-routing.mjs [--live-map]`: validates the Community routing spec, the partial campus identity crosswalk, canonical URLs, lifecycle mapping, and dated inventory. It is offline by default. `--live-map` adds a read-only comparison with the public growth map and never changes the map or Community app.
- `section-shot.mjs --url <page> --selector <css> [--slide-containing "<text>"] [--name <section>] [--out <dir>] [--viewports desktop,mobile] [--json out.json] [--timeout <ms>] [--playwright <dir>]`: protocol step 5 ring 2 and step 7, the section pair. `--slide-containing "Jason Tan"` (alias `--scroll-to-text`) picks, among the selector's matches, the one whose text contains the string, and when it sits in a Swiper carousel calls `slideTo` on its index first, so `--selector "#team_carousel .swiper-slide" --slide-containing "<person>"` captures a card past the visible slides on screen. Loads the page in Playwright (borrowed the way `rendered-controls.mjs` borrows it), scrolls the element into view, forces its lazy images to load and awaits `img.decode()` on each (bounded, 15 s default), then screenshots the element plus a 16 px margin at deviceScaleFactor 2 on desktop (1440x1000) and mobile (390x844), writing `<slug>-desktop.png` and `<slug>-mobile.png` (slug of `--name`, default the selector). Exit 0 when every image decoded; 1 `IMAGES_NOT_DECODED` (captures still written, each undecoded image named); 2 `SELECTOR_NOT_FOUND`, `NAV_FAILED`, `BAD_URL`, `PLAYWRIGHT_NOT_FOUND`. Attach the pair with `agent/attach-evidence.mjs --section "<name>"`.
- Ring 3 (shared templates): run `page-check.mjs` on two untouched campus pages after any site-wide action and confirm `header-stylesheet-linked` and `footer-template-present` pass.

`build-checks.mjs [--check] [--observer-source <aeo src/checks.mjs>]` compiles `spec/check-rows.json` into `spec/check-bundle.generated.json` (QC loop redesign 2026-09-24, workstream 1): one row per observer check with page family, lifecycle states, element, expected literal or derivation, comparator and threshold, severity, enforced or advisory, ticket or loop-health channel, ticket class and owner role (from the policy bundle), dedupe scope, clear-after runs, grace period, consecutive-run requirement, evidence profile (from the class) and source-health dependencies; plus `retired[]`. It fails closed on an unknown ticket class, role, page family, element, source or requirement reference, on a check that is both a row and retired, and on any name in `registry/observer-checks.json` with neither. `--check` exits 1 when the committed bundle is stale; `--observer-source` re-extracts the check names from a local aeo checkout and fails when the registry is stale. `npm run validate` runs the same build, validates the bundle against `spec/schemas/check-bundle.schema.json`, and checks `spec/release-manifest.json` `checkBundleSha256`. Run it (`npm run build:checks`) after any change to `spec/check-rows.json`, the policy bundle, or a registry the rows cite, then put the new `sha256` in the release manifest.

`validate-playbook.mjs` parses every JSON file, validates core source, actor and page-family records, checks ticket-to-recipe references, checks protocol version alignment, and fails on stale entry-point markers. `.github/workflows/validate-playbook.yml` runs it on pull requests and main.

Still planned: full JSON Schema documents, a renderer that compares every prose requirement with its machine row, and complete observer-to-page-family coverage.

## page-check.mjs: synced elements

On Open and Announced pages the checker now verifies that every CSS ID in `spec/synced-targets.json` `expectedOnCampusPages` is present (`n8n-synced-elements-present`) and flags any `-disabled` override so the ticket and restore condition can be confirmed (`n8n-override-recorded`). The same file drives the Alpha MCP batch runner's `--synced-targets` guard, which refuses edits to those elements.

## validate-ticket.mjs --contract

Enforces `spec/ticket-contract.json` on any ticket set: claim, page, element, observed, expected, source with read time, class, defect class, a single owner, fix path, done condition, evidence. Tickets that fail are listed by creator (observer, form, agent) with the missing fields and go back to that creator. On 2026-09-16 all 15 observer grade tickets failed (no source field or read time, suggested-owner list, no class or fix path).

## render-ticket.mjs and triage-ticket.mjs

`render-ticket.mjs` renders a ticket body from a contract object. `triage-ticket.mjs` brings existing APEX tickets up to the contract: it runs the pathway diagnosis, sets class, defect class, and owner, regenerates the rendered body below the `--- Website agent triage ---` marker while keeping the requester's original description first and verbatim, keeps any existing `checkId` (the triaged class is recorded in `triagedClass`), and adds the owner's APEX user to the assignees without removing anyone. Dry-run by default.

```bash
node tests/triage-ticket.mjs --file tickets.json [--element intro.status-sentence] [--class hubspot-data] [--owner-role hubspot-program-admin] [--status BLOCKED] [--related <id>] [--note "..."] [--apply]
```

## diagnose-field.mjs

Pathway diagnosis (protocol step 1b). Given a campus URL and an element from `spec/campus-page-field-map.json`, it reads the rendered page, the growth map API (HubSpot mirror), HubSpot Programs directly when the token has the scopes, and the requirement for the campus state; then prints the defect class (data, mapping, delivery, presentation, none), the owner role and person, and a ready ticket.

```bash
node tests/diagnose-field.mjs --url https://alpha.school/atlanta/ --element intro.status-sentence --json dx.json
node tests/file-apex-ticket.mjs --from-diagnosis dx.json --parent <ticket or loop> [--assign farhan.raja@trilogy.com] [--create]
```

`file-apex-ticket.mjs --assign <email>` connects the APEX user from `registry/people.json` (`apexUserId`).

## resolve-campus-roles.mjs

Resolves Director of Admissions, Dean of Parents, and Senior Admissions Specialist coverage per campus, live from the Admissions Hub org chart, with `registry/campus-roles-overrides.json` applied and emails attached from HubSpot owners.

```bash
node tests/resolve-campus-roles.mjs                                  # print the roster
node tests/resolve-campus-roles.mjs --campus atlanta --role dean-of-parents
HUBSPOT_SERVICE_KEY=... node tests/resolve-campus-roles.mjs --write  # refresh registry/campus-roles-snapshot.json
```

Without a HubSpot token the emails come from the last snapshot. The hub page is parsed from its embedded script tables; if the page layout changes the script stops with an error rather than guessing.

## agent/intake.mjs (the intake agent)

Runs on top of the APEX API as an administrative gatekeeper, not a website executor. For every new or revised website-family ticket it reads the compiled policy, classifies the request, separates requester-owned inputs from derivable and system-owned inputs, applies the policy guard, and resolves one exact owner. Missing requester inputs become typed APEX clarification requirements assigned to the requester. Canonical page URLs and authoritative source values are never requested merely because they were absent from the prose brief. Requester revisions, verified assets, and human comments change the input fingerprint and trigger re-evaluation; intake-authored fields and comments do not.

Complete tickets either enter the scheduled execution queue or route to a human/system owner. The execution queue is limited to the operations explicitly listed in `spec/release-manifest.json`; an Alpha MCP tool existing is not enough. Before an execution-ready ticket is released, intake runs `tests/check-release.mjs` and refuses that handoff unless the compiled policy, production plugin health, and release manifest agree. This gate does not block unrelated clarification or human routing. Ambiguous or unregistered owners, policy exceptions, unknown classes, and exact duplicate candidates fail closed for review. Intake preserves the original description and never edits WordPress, HubSpot, n8n, or another delivery system.

Writes use a two-phase marker: `intakePendingHash` is stored before the typed APEX action, and `intakeHash` is finalized only after that action succeeds and the ticket input fingerprint is still current. A failed or concurrent action therefore retries instead of being skipped. Scheduled by `.github/workflows/intake-agent.yml` every ten minutes, dry-run unless the repository variable `INTAKE_APPLY` is `true`; each run scans a 24-hour revision window and uploads its report as an artifact.

```bash
node agent/intake.mjs --file tickets.json --replay --report replay.json     # score a saved set, no writes
node agent/intake.mjs --since 2026-09-17T00:00:00Z --report out.json         # read-only dry-run against APEX
node agent/intake.mjs --since 2026-09-17T00:00:00Z --apply                   # administer APEX only
```

Rollout: keep `INTAKE_APPLY` false; replay the open queue read-only; review missing-info, owner, duplicate, and execution-eligibility deltas; then run one explicitly dispatched APEX-only canary batch reviewed by Matt and Yash. Enable scheduled apply only after the canaries and owner-registry gaps are accepted.

## agent/attach-evidence.mjs (screenshots onto the ticket)

Attaches a desktop and mobile pair to the APEX ticket through `POST /api/agent/tasks/{id}/evidence/screenshots` with the operator key (`APEX_API_TOKEN`, `APEX_API_BASE` derived as intake derives them): the `tests/section-shot.mjs` crop of the element Look for names with `--section "<name>"` (1 to 80 characters, the label the reviewer reads above the thumbnail), and the full-page `tests/rendered-controls.mjs --screenshots <dir>` pair without it; one invocation per pair, same run id. Each file is hashed and posted with the viewport, page URL, run id, capture time, and section when given; APEX verifies the hash, stores the bytes on the ticket, posts the agent comment, logs who attached what and when, and shows the run in the ticket panel's Evidence section with the section crops first. Idempotent per (ticket, viewport, sha256), so the section pair and the full-page pair never collide. Fails closed with typed errors (`MISSING_ARG`, `BAD_PAGE_URL`, `MISSING_FILE`, `NOT_IMAGE`, `TOO_LARGE`, `MISSING_TOKEN`, `APEX_ERROR` with the status and body, `NETWORK`) and sends nothing else. Tests use a mocked fetch.

```bash
node tests/section-shot.mjs --url https://alpha.school/park-city/ --selector "#hubspot_events" --name "events strip" --out ./evidence
node agent/attach-evidence.mjs --ticket <id> --run <runId> --page https://alpha.school/park-city/ \
  --desktop ./evidence/events-strip-desktop.png --mobile ./evidence/events-strip-mobile.png --section "events strip"
node agent/attach-evidence.mjs --ticket <id> --run <runId> --page https://alpha.school/park-city/ \
  --desktop ./evidence/park-city-desktop.png --mobile ./evidence/park-city-mobile.png [--label "..."] [--captured-at <ISO>] [--dry-run]
```

## agent/notify-requester.mjs and agent/notify-shared-blocker.mjs (requester notices)

APEX does not tell a requester when their ticket goes to Missing Info or Blocked, so the website system does, by Slack DM from the `marketing_support` bot (decision 2026-09-23, Matt Barge). `agent/requester-notice-policy.mjs` is pure: it composes the two messages (Missing Info; Blocked, with a shared-blocker two-liner), screens the items against the denylist of what an internal source can supply (page URL, HubSpot value, filename, "confirm", packet URL), checks every rule as a typed error (`DASH`, `EXCLAMATION`, `JARGON`, `TOO_LONG`, `NOT_SENTENCE_CASE`, `OWNER_IS_ROLE`, `NO_ITEMS`, `BAD_PERMALINK`), hashes the ask, and decides against the ticket's ledger (`customFields.requesterNotices`: same ask never twice, changed ask once more, one `blocked` then `blocked-update` only on change). `agent/notify-requester.mjs` reads the ticket (APEX or `--file`), resolves the recipient with `users.lookupByEmail`, prints the preview (dry run, the default) and with `--send` posts the DM, records the ledger with a v1 PATCH that carries only `customFields` (merged), and appends the text to the description under a dated "REQUESTER NOTICE (Slack DM)" heading with the requester's text first. A requester with no Slack user gets no DM; the ledger and stdout say so, the note still goes on the ticket, and `--digest` lists those tickets. `agent/notify-shared-blocker.mjs` posts one channel note and sends each requester the two-line DM through the same path. `agent/intake.mjs` carries the preview in its report for Missing Info and blocked decisions and sends only with `--apply --notify-send`. Tests mock Slack and APEX with one fetch double; the intake child never receives `SLACK_BOT_TOKEN`.

```bash
node agent/notify-requester.mjs --ticket <id> --kind missing-info --item "Dawn Adams: headshot and bio" --item "..." [--already-done "..."]   # dry run
node agent/notify-requester.mjs --ticket <id> --kind blocked --blocker "..." [--owner "<person>"] [--when "..."] [--already-done "..."] --send
node agent/notify-shared-blocker.mjs --channel C09GRQ8L533 --title "..." --body-file note.md --tickets id,id [--send]
node agent/notify-requester.mjs --digest
```

## photo-framing.mjs and agent/frame-headshot.mjs (headshot framing)

`tests/photo-framing.mjs` holds the framing math (`frameCoverage`, `judgeFraming`, `frameForFit`) and the in-page measurement (`measureTeamCardsInPage`) behind `page-check.mjs team-photo-framing`. Coverage is `min(imageRatio, boxRatio) / max(imageRatio, boxRatio)`; the cropped axis is vertical when the image is taller than the box (the head-cutting case) and horizontal when wider; the cut edges follow `object-position`. `object-fit: contain` never crops; `fill` fails when it stretches by more than 5%. The measured card boxes per page are in `spec/team-card-frame.json` (the ratio is per page and viewport, not one site value).

`agent/frame-headshot.mjs --file <img> --ratio <w:h | decimal | auto> --out <file> [--page <url> [--selector <css>]] [--focus top|center|bottom|<0..1>] [--preview <png>] [--json <file>]` crops a reviewed headshot to the card ratio before `agent/bind-headshot.mjs` binds it (`docs/headshot-binding.md`, "Frame before you bind"). `--ratio auto` measures the page's desktop carousel box read-only in Playwright. Portraits are cropped from the top (head and headroom stay), landscapes from the centre, no scaling, no face detection; the side-by-side preview is what the operator reviews. Prints the framed dimensions, sha256, and a `reviewNote` line for the binding. PNG in and out is pure JavaScript; JPEG and WebP input and JPEG output go through macOS `sips`. Typed errors exit 2 (`MISSING_ARG`, `BAD_RATIO`, `BAD_FOCUS`, `BAD_URL`, `UNSUPPORTED_IMAGE`, `NEEDS_MACOS_SIPS`, `SIPS_FAILED`, `MEASURE_FAILED`).

```bash
node tests/page-check.mjs --url https://alpha.school/san-francisco/ --playwright ../aeo --json ./run/page-check.json
node agent/frame-headshot.mjs --file ./reviewed.jpg --ratio auto --page https://alpha.school/san-francisco/ --out ./reviewed-framed.jpg --preview ./preview.png --playwright ../aeo
node tests/section-shot.mjs --url https://alpha.school/san-francisco/ --selector "#team_carousel .swiper-slide" --slide-containing "Jason Tan" --name "team carousel: Jason Tan card" --out ./evidence
```

Tests cover the framing math (portrait into a landscape box, landscape into a portrait box, equal ratios, the Jason Tan 1130x1533 numbers into the measured 284.66x220 box), the check row, the crop geometry and the PNG codec on a synthetic image generated in the test, and the section-shot option parsing; no browser and no `sips` in `npm test`.

## agent/roster-diff.mjs (read-only roster plan)

Compares a registered campus "Meet the Team" deck (`registry/staff-source-decks.json`) with the live Team section and writes a For Review plan: adds, removes, title, bio, and photo differences, membership only, with a proposed `agent/bind-headshot.mjs` binding per add and photo change. It never writes to WordPress or APEX and never binds a photo. Usage, typed errors, and limits: `docs/headshot-binding.md`.

```bash
node agent/roster-diff.mjs --campus orange-county --live get-page.json --out ./run --images-dir ./run/deck-photos
node agent/roster-diff.mjs --campus scottsdale --redact-bios          # rendered public page as the live side
```

Tests use synthetic fixtures only (`tests/fixtures/roster-diff/`): `build-synthetic-pptx.mjs` builds a pptx shaped like the Google Slides export from `synthetic-deck.json`, and the live side comes as a staff cards list, a `get_page` result, and rendered HTML.
