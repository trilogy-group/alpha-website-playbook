# Replay: group A launch-copy tickets against the playbook

Date: September 15, 2026. Purpose: test the ticket protocol and its checkers against the 16 tickets that were worked earlier the same day, to see whether the playbook would have prevented the two known misses (three stale image cards closed as done; an unstyled header cached on Atlanta). Read-only; no page was changed during the replay.

## Step 1, intake validation (`tests/validate-ticket.mjs`)

| Outcome | Tickets |
| --- | --- |
| Ready | 13 (Boca Raton, Boston, Denver, Dorado, Greenwich x2, Highland Park, Malibu, Oklahoma City, Park City, Raleigh, South Bay LA, Tulsa) |
| Missing Info: no approved open-campus media | 3 (Atlanta, La Jolla, Santa Monica) |

Matches the PRD acceptance criterion exactly. Under the protocol, the three would have gone back to Yash before any edit, with the Missing Info note naming the card needed.

## Step 3, reconcile against the live page

The page model and the media registry show that 12 of the 15 pages already had approved intro media (10 cards, 2 videos) before the batch. The protocol's reconcile step records that as "already correct" on the ticket, which the original sweep did not do.

## Step 5, ring 2 (`tests/page-check.mjs`), 17 checks per page

| Page | Result | Failing checks |
| --- | --- | --- |
| Boca Raton, Boston, Denver, Dorado, Greenwich, Highland Park, Malibu, Park City, Raleigh | pass | none |
| Atlanta | fail | intro media not approved (stale "Coming Fall 2026 To Roswell" card) |
| La Jolla | fail | intro media not approved (stale "Coming Fall 2026 To San Diego" card) |
| Santa Monica | fail | intro media not approved (stale "Coming Fall 2026 To Santa Monica" card) |
| Oklahoma City | fail | info packet link returns 401 (Google Drive file not public) |
| South Bay LA | fail | info packet link returns 401 (Google Drive file not public) |
| Tulsa | fail | info packet link returns 401 (Google Drive file not public) |

The three media failures are the misses from the original sweep, caught. The three packet failures are new, real defects the sweep never looked at; South Bay LA already has an observer ticket for it, Oklahoma City and Tulsa do not.

A first version of the checker also flagged sister-brand words and Austin images on every page. Those came from the shared navigation and footer, not the page. The checker now scans only page-owned content, and the false positives are gone.

## Ring 3, shared templates

The `header-stylesheet-linked` check passes on all 15 pages now. Earlier in the day Atlanta's cached render lacked the header stylesheet link; this check fails on exactly that condition, so ring 3 on two untouched pages after the cache clear would have caught it before a visitor did.

## What the replay proves

- Intake validation prevents the media miss.
- Ring 2 catches the media miss again if intake were skipped, and finds three packet defects for free.
- Ring 3 catches the header regression.
- The checker needs page-owned scoping to avoid template noise, which is now built in.

## What the replay does not prove

- Screenshots. The protocol requires them and the checker does not take them; an agent still has to look.
- Announced-state rules, staff cards, events, and facts were not exercised; only Open-state launch-copy pages were replayed.
- Lifecycle correctness. The checker trusts `spec/campus-lifecycle.json`, which is the map API's word, and seven Open campuses still carry a Fall 2026 launch date (see `docs/findings-2026-09-15.md`).

## Addendum: what the replay could not see

The replay ran before the content pipelines were mapped. With `spec/synced-targets.json` in place, the dry-run of the group A plan against the live Atlanta page is blocked: the sentence sits in `content_body_4`, which the n8n workflow rewrites daily. A protocol that had this guard would have sent every group A ticket to the HubSpot path instead of editing WordPress. Verify the 14 pages after the next n8n run before treating group A as closed.
