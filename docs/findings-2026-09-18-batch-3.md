# Batch 3 findings (2026-09-18): staff-submitted tickets

Third fresh-agent run, the first on staff-submitted tickets only: two Miami staff tickets, a three-page Boston removal with a replacement, a Southlake carousel reorder, Park City events, and a Waypoint Academy page. Brief and scored sheet in the marketingsupport workspace under `work-assets/apex-website-tickets/batch-3-2026-09-18/`.

## Result

| Measure | Value |
| --- | ---: |
| Decisions correct | 6 of 6 |
| Evidence complete | 6 of 6 |
| Cards removed | 3 (Boston, Jamaica Plain, Lexington), one operation each, receipts and rendered evidence per page |
| Rolled back | 1 (Miami removal; page restored byte-identical) |
| Unsafe writes | 0 |
| Wall time | 69 minutes |

The staff write path works on the tagged leadership layout. On a nested carousel it failed safely: the agent applied the removal, saw a blank slide on the rendered page, restored the snapshot, and routed the tool defect with element ids and receipts. Judgment held everywhere else: it refused to invent a Brandon Maddox card and asked him for his inputs, refused to touch an n8n-synced events shortcode, found Park City's root cause (`school=""` in the shortcode), identified Waypoint Academy as a HighLevel site outside the playbook, and closed nothing it could not evidence.

## Fixed

- Alpha MCP 0.5.3 (merged, awaiting upload): staff add, remove, and reorder and structure remove, clone, and move keep a nested carousel's `carousel_items` repeater in step. Until 0.5.3 is on production, the staff recipe refuses carousel pages (this commit).
- `spec/actor-capabilities.json` now carries the carousel caveat.

## Decisions needed (owners)

1. **Work already live without a receipt.** Allison de Leo's card was placed outside the MCP (the page's last editor was the Cristi Constantin account). The protocol has no closure path for "verified rendered, no receipt". Proposed rule: a ticket may be closed on rendered evidence plus a note naming the actor and time from `list_revisions`, marked "closed on verification, not on a receipt". Matt.
2. **Executable parts of internal-review classes.** The Southlake ticket mixed a reviewable restructure with a plain reorder. Decide whether the executable part proceeds before review. Matt and Yash.
3. **Waypoint Academy owner.** `spec/intake-policy.json` excludes Waypoint but `registry/people.json` names no owner, so the ticket sits unassigned by the fail-closed rule. Name the owner. Matt.
4. **HubSpot read scopes.** Park City's ownership decision (blank source vs wrong derivation vs plugin) could not be made because the token still lacks `crm.objects.custom.read`. Hailey.
5. **Multi-page tickets in intake.** Intake derives one `pageUrl`; a four-program removal ticket got only Jamaica Plain. Intake should derive every campus page named. Intake owner.
6. **`tests/diagnose-field.mjs`** has no rule for `events.strip` in state Open. Website agent operator.
7. **Cache flush after a rollback.** Receipts show the post-rollback flush applied at 19:10:44, nine and a half minutes after the pre-rollback flush at 19:01:16 (the site-wide cooldown is five minutes; the agent's own retry loop waited longer), and eight `noop` receipts in the same second are burst duplicates replayed idempotently. Not a plugin defect, but the recipe should say: after a rollback, one flush call, then wait `retryAfterSeconds` from the 429, not a fixed sleep.
8. **APEX moved a Missing Info ticket to In Progress after an assignee change** and needed a second status write. Hailey.

## Defects found and saved (not filed; the brief withheld ticket creation)

Miami: Michael Dillow's card is hidden on every breakpoint but still holds a carousel slot; the 2025/26 packet CTA is hidden everywhere; the intro media is not in the approved registry. Boston: the Open page still says launching (n8n-written sentence). Lexington: the packet link returns 401 and the Announced launch statement names no date.

## n8n read access (2026-09-18, later)

Matt Barge's n8n API key connected the playbook to trilogyinc.app.n8n.cloud read-only (33 workflows). Two open questions closed the same hour:

- Book a Call writer: the nightly workflow writes exactly the 24 synced ids and never `book_a_call_1/2`, so the widget is wordpress-direct (recorded in `spec/campus-page-controls.json`; sync-mapping ticket cmu5vhg6t closed on verification).
- Park City events: the shortcode is built from `form_program_interest_label`, which the HubDB table FormProgramInterestToInterestAndCampusMapping supplies; Park City and La Jolla have no row, so the label is null and the filter is empty. Fix is two HubDB rows (on the ticket). The marketing HubSpot key has no hubdb scope, so the rows need a HubSpot admin.

## Batch 4 (2026-09-18, evening): carousel reruns on 0.5.3

Miami removal and Southlake reorder both Completed. Jason DeMaria sits under Tasha Arnold; the three guides are carousel slides built through staff add with placement existing_carousel from their own cards, old cards removed, six slides and six items after every apply. One rollback on the way (a leadership container moved into the carousel renders squeezed); the staff-add path is now in the recipe.

The find that matters: `flush_wp_engine_cache` replayed as a noop for the same ticket after its first call, so the four flushes after the Southlake writes did nothing and the visitor-facing page (no cache-busting) still served the old cards while every rendered check passed. Fixed in plugin 0.5.5 (a flush replays only inside the cooldown window) and in `tests/page-check.mjs` (`edge-cache-current` compares the visitor copy with the bypass copy). Also from this run: 0.5.4 attributes MCP writes in `list_revisions` and passes `retryAfterSeconds` through the bridge; protocol 1c makes operator instructions authoritative over the intake classifier; the fresh-agent worktree notes in protocols/README.
