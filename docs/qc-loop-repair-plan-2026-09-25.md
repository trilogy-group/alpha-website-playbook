# QC Loop Repair Plan: why East Bay reached a meeting

Written 2026-09-25 after MacKenzie Price saw the Alpha East Bay page carrying a "Coming Fall 2026 To Piedmont" card while HubSpot has had the campus Open since 2026-08-24. Companion to `docs/qc-loop-redesign-plan-2026-09-24.md`. Everything below was verified against HubSpot property history, the observer's own packets, the observer code, and the APEX queue on 2026-09-25.

## 1. What happened to East Bay, exactly

| when | fact | who or what saw it |
|---|---|---|
| 2026-03-11 | HubSpot `website_campus_intro` set by hand to "launching in Fall 2026" | nobody checks this field against `type` |
| 2026-08-24 | HubSpot `type` set to Open (opening date 2026-08-12) | growth map followed; observer applied the Open rules to the page from then on |
| 08-24 to 09-13 | page status sentence read "launching in Fall 2026" on an Open campus for 20 days | no observer check exists for sentence-versus-type; a sweep found the same defect on New York on 09-21 |
| 2026-09-13 | intro sentence rewritten by integration to "is open and enrolling" | fixed as a side effect of the Program intro clean-up, not by a ticket |
| every full run since 08-24 | observer fetched the page, saw the intro image `Piedmont-1024x704.webp`, alt empty, recorded `staleLaunchSignal: false` | the detector reads words in alt, title, filename and nearby text; the launch words are painted into the pixels, so it read clean |
| 2026-09-21 | a sweep agent's page-check flagged "no registry entry" and filed a found ticket (`cmubrkkm800000agmvukxsioc`) | intake: no ticket class matches checkId `open-intro-media-approved`, outcome needs-rule, owner role internal-triage (no person), status Blocked |
| 09-21 to 09-25 | ticket Blocked, assigned by hand to Yash and Matt, re-evaluated by intake on 09-25 with the same outcome | nothing ages or escalates a Blocked ticket |
| 2026-09-25 | MacKenzie sees the card on the call | 32 days after Open |

The card is WordPress-direct. No source of truth derives it, so a HubSpot flip can never change it; the only correct value is a human-made "Open and Enrolling" card that, for East Bay and eleven other Open campuses, was never made.

## 2. Three layers of cause

**Layer 1: the detector measures the absence of known-bad words, not the presence of the approved asset.** The check row `campus.intro.media.current` says comparator `equals-approved-media` against `registry/campus-open-media.json`. The observer implements "count of stale-launch signals must be 0", where a signal is a launch word in alt, title, filename or nearby text, or an asset-name pattern. A neutral filename with an empty alt and the words in the picture produces zero signals. The registry value is only used to decorate the finding message; a `null` or missing entry does not change the verdict. Nothing tests that the observer implements what the row says.

**Layer 2: coverage is not itself checked.** The open-media registry has 26 rows; HubSpot has 38 Open programs on the map, and twelve Open alpha.school campuses have no row (Austin, Brownsville, Charlotte, Chantilly, East Bay, Fort Worth, New York, Orange County, Palm Beach, San Francisco, Scottsdale, The Woodlands). A missing row is treated as "no expectation" instead of "no approved media recorded for an Open campus", which is the defect. The same pattern holds for every registry-derived row (leadership, packets, CTA exceptions). Eight tickets of this exact class sit Blocked on Yash producing cards from the template, one campus at a time.

**Layer 3: a finding is not a fix, and Blocked is a parking lot with no clock.** Of 201 open website tickets, 145 are Blocked, 26 for more than three days; 42 sit in internal-triage or needs-rule, meaning the playbook has no class for them and so no owner. Found tickets carry page-check ids (`open-intro-media-approved`) rather than bundle row ids (`campus.intro.media.current`), so classes that match on the row id miss them. Nothing nudges, escalates or reports the Blocked queue; the sweep report listed East Bay at the top of its media section and nobody who decides reads sweep reports. Loop health has the same shape: in the last 24 hours 3 observer runs failed and 7 were cancelled out of 38 (runner out of disk in the runtime-state persist step); the local shadow job was dead for five hours on a zsh reserved-variable error (fixed today); a run that never produces a packet produces no loop-health finding, so there is no dead-man's switch; and the shadow ledger counted events-mode packets, which run no campus checks, as evidence that the loop would file nothing.

**Layer 0: the sources of truth were incomplete.** The intro sentence was a second, hand-maintained field parallel to `type` (MacKenzie's decision of 2026-09-25 settles it: derive from `type` in n8n, change pending). The card has no source at all; the registry was meant to be it and was filled for 26 campuses by hand on 2026-09-07.

## 3. Repairs, in order

Each repair names where it lives, who owns it, and the test that proves it. Ordering is by how much of the East Bay chain each one removes.

1. **Presence, not absence (playbook rows + observer).** For every row whose expectation derives from a registry, an in-scope entity with no registry entry is a finding: "no approved intro media recorded for Open campus East Bay", class observer-media-identity, filed Missing Info to the registry owner (website operations) with the exact ask. `equals-approved-media` is implemented literally: the rendered slot's attachment id must equal the registry's `attachmentId`; anything else is a finding with the observed asset named. Test: the East Bay fixture page with the current registry files one finding; with an east-bay row naming attachment 8550 it files a mismatch; with the approved card it passes. Owner: me (playbook PR + aeo PR).
2. **Read the picture.** For the primary campus visuals only (intro card, hero), on full runs, run a vision pass over the screenshot the observer already captures: launch-era words, another campus's name, placeholder text. Bounded to about 40 images per full run. Test: the current East Bay card yields "Coming Fall 2026 To Piedmont". Owner: me (aeo).
3. **Bundle-versus-observer conformance test.** The observer publishes the comparators it implements; the playbook build refuses a row whose comparator is not implemented; aeo CI runs each row's comparator against a fixture packet. A row like `campus.intro.media.current` can never again say one thing while the code does another. Owner: me (both repos).
4. **Coverage rows.** New rows `site.coverage.open-campus-registries` (every Open program with an alpha.school page has rows in open-media, leadership, packets, CTA exceptions where required) and `site.coverage.open-campus-rendered` (every Open campus page rendered in every full run, else loop-health). Gaps file Missing Info to the registry owner, one ticket per campus. Test: today's state files twelve open-media coverage tickets. Owner: me.
5. **Derive the card from the source, so the class dies.** When `type` flips to Open, the agent generates the Open and Enrolling card from Yash's template (campus name only varies), uploads it as an attachment, writes the registry row, patches the slot, and sends the page For Review. Until that exists, the eight Blocked card tickets become one dated batch for Yash. Owner: Yash supplies the template file and approves the first three generated cards; I build the generator. Built 2026-09-25: `agent/generate-open-card.mjs` (SVG template with `{{CAMPUS}}`, or PNG plus a text layout; sharp, resvg, Playwright's Chromium or ImageMagick, none added as a dependency), `protocols/recipes/open-card.md` (generate, operator review, APEX asset, `upload_media_from_apex_asset`, media recipe, registry row, For Review; the only production path), `registry/campus-open-media.json` `template` (source null, owner Yash, the ask verbatim), `tests/open-card.test.mjs` with a placeholder fixture template. Waits on Yash's template.
6. **A clock on Blocked and Missing Info.** Protocol rule: three days without movement sends a nudge to the named person on the ticket; seven days escalates to Matt with the list; needs-rule and internal-triage tickets go to Matt daily as playbook defects (a missing class), not as work for the requester. Implemented as `agent/queue-aging.mjs` on the daily lane of the observer-filer workflow, posting to #support-websites. Test: today's queue produces 26 nudges, 5 escalations, and a 42-line class-gap list. Owner: me; Matt adds classes for the gaps.
7. **One id everywhere.** Page-check ids map to bundle row ids; found tickets carry `requirementId`; ticket classes match on `requirementId` or `checkId`, never only on a title pattern. Test: re-running intake on `cmubrkkm800000agmvukxsioc` classifies it observer-media-identity, owner website operations. Owner: me.
8. **Loop health with a dead-man's switch.** A scheduled check expects a verified full packet every 12 hours and an events packet every 2 hours, and files a loop-health ticket plus a Slack line when one is missing. Fix the runner disk (the runtime-state branch is rewritten every run; keep state as an artifact or prune history) and the cancelled runs (concurrency group). The shadow ledger records the packet mode and only full-mode packets count toward the three-clean-runs gate. Owner: me.
9. **What MacKenzie sees.** A weekly site-truth report derived from the packet, not from tickets: one line per Open campus with state, sentence, card, team order, packet, CTAs, guide video, green or red, with the date each red item was first seen and the ticket it waits on. This is what the next meeting opens with. Owner: me; Matt and Yash review the first one. Built 2026-09-25: `tests/site-truth-report.mjs` (markdown and JSON from a full-mode packet plus the registries; `tests/site-truth-report.test.mjs` on the trimmed fixture `tests/fixtures/site-truth/`). First run on packet `site-full-2026-09-25T10-27-41-079Z`: 38 Open and 7 Announced rows; among the Open rows the intro card is red on 20 (11 with no card recorded, 9 recorded as missing; East Bay got its row in PR 38), the team order on 32 (the 2026-09-25 decision has not been applied to any page yet), the status sentence absent on 6, the packet on 3, the CTAs on 3; state never disagrees between HubSpot, the map and the page.

## 4. Sequence

- Today: shadow script fixed and re-run (done); repair 6's report run once by hand so the 42 class gaps and 26 stale tickets are in front of Matt tomorrow.
- Next two days: repairs 1, 4, 7 (playbook rows, observer presence logic, id mapping) and 8 (dead-man's switch, runner disk), reviewed and merged in that order; three clean full-mode shadow runs; then apply switches on.
- Following: repair 3 (conformance), 2 (vision pass), 5 (card generator once Yash supplies the template), 9 (weekly report before the meeting with MacKenzie).

## 5. Build status (2026-09-25, evening)

Matt approved the full build and added repair 10. Built by six agents in worktrees, reviewed, merged in order; the other Claude session merged overlapping work at the same time (playbook #38 lifecycle source and delivery checks with the east-bay media row, #40 legacy id routing; aeo #39 durable state on `site-runtime-state`, #40 vision as verdict on approved cards), and every PR here was rebased over it.

| repair | where | merged |
|---|---|---|
| 1 presence not absence, 4 coverage rows, 7 one id, 10 source-first | playbook #42 (bundle 1.3), aeo #37 | yes |
| 2 vision pass (tesseract.js, reads the East Bay card at 95 percent) | aeo #36 | yes |
| 3 conformance (observer publishes 35 comparators and 123 check ids; CLI and CI step; playbook sync test) | playbook #46 (bundle 1.4), aeo #43 | yes |
| 5 card generator and recipe (template null until Yash supplies it) | playbook #41 | yes |
| 6 queue aging (protocol 1e, `agent/queue-aging.mjs`, daily workflow dry unless `QUEUE_AGING_APPLY`) | playbook #43 | yes |
| 8 heartbeat, writer gate, disk report; disk fix itself | aeo #38; aeo #39 (other session) | yes |
| 9 site-truth report | playbook #41 | yes |
| review fixes (slot-only attachment compare, gate reads the observe job, one Missing Info per campus and registry, page-status not diverted) | aeo #41, playbook #45 | yes |

First packet on bundle 1.3 (run 36196908791, 22:32Z, full, verified): 143 findings; East Bay files as `campus-page-stale-launch-media` high with the OCR text as evidence and `missingExpectation`; twelve Open campuses get "no approved intro media recorded" Missing Info; 11 HubSpot status-sentence contradictions; filer dry-run would file 33 and hold 16 Missing Info. Noise found in that packet and being fixed: a non-campus Program (High School SAT Prep, website 2hourlearning.com) entered the campus set; informational registry gaps (CTA exceptions) filed as high; approved cards flagged by the vision verdict. Site-truth report from the same packet: 38 Open campuses, 71 red cells, team order red on 32 pages (Tasha Arnold is card 1), intro card red on 20.

Later the same night: aeo #44 removed the first-packet noise (bare-domain Programs out of the campus set, informational registries never filed, approved videos recognised from rendered embeds), and this PR flips the three rows to `onMissing: skip` (bundle 1.5).

Still open: `OBSERVER_FILER_APPLY` stays off until the noise fixes land and one clean full packet follows (the gate counts full-mode packets only); Yash's card template; the three rows that declare `onMissing: finding` without an observer implementation (`site.search.schema.url`, `campus.resources.packet.present`, `campus.team.roster.present`) to flip to skip; classes for the 36 class-gap tickets.

## 6. What this does to the existing tickets

East Bay and the seven other card tickets wait on repair 5, batched under one date; the 42 ownerless tickets get classes (the list is in the queue-aging report); the twelve Open campuses with no registry row get coverage tickets from repair 4 and are the first cards the generator makes.
