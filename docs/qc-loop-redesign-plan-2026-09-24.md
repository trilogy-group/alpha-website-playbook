# Website QC loop redesign: the playbook defines, the observer measures, the protocol files

Date: September 24, 2026. Owner: Matt Barge. Source of truth: this file; the marketingsupport workspace keeps a copy. Companion evidence: the observer sweep of 2026-09-24 (marketingsupport `work-assets/apex-website-tickets/sweep-2026-09-24-observer/`, `sweep-summary.md` and `scoring.json`).

## Why

On 2026-09-24 fresh agents worked all 180 open tickets filed by the production observer (`superbuilders/aeo alpha-site-system`). 101 closed on verification without any change to the site or a source, 79 ended Blocked on a named person with the decision written, 7 new defects were found, zero WordPress or HubSpot writes were needed. Of the 101: about 39 were real when filed and were fixed by a person, a nightly run, or the coordinator while the ticket stayed open; about 56 were observer false positives (a threshold the observer's own filing rule does not meet, a degraded browser session, a stale or dead source input, an exception it does not read, a pipeline it read before the import landed); 6 were past events nobody reached. 151 of the 180 were filed before the playbook existed (created 2026-09-15); the observer still reads its own thresholds and config, not the playbook's spec, and `docs/observer-requirements.md` already lists the changes it needs.

The problem is not the observer's coverage. It is that one program decides what correct is, measures it, and files tickets, with no closing step, and the definition it uses is not the playbook.

## Design: three layers, one direction of dependency

| Layer | Owns | Never does |
| --- | --- | --- |
| Playbook (`spec/`, `registry/`) | What to check, on which pages and states, against which source field, comparator and threshold, severity, enforced or advisory, ticket class, owner role, dedupe scope, evidence profile | Fetch, render, or file |
| Observer (aeo) | Scheduling, rendering, source reads, measurement, retries, incident state, loop health | Define a rule, a threshold, an owner, or ticket wording |
| Ticket protocol (playbook `agent/`, intake, APEX) | Whether a finding becomes a ticket, how many, to whom, its contract, its evidence, and when it closes | Decide what correct is |

Rules that follow from the split:

1. The observer loads one compiled, hashed check bundle (`spec/check-bundle.generated.json`, built like `spec/policy-bundle.generated.json`) and cites the requirement id and bundle version on every finding. A check not in the bundle is telemetry, never a ticket. The release manifest carries the bundle hash so a run is reproducible.
2. Thresholds, host lists, exemptions, grace periods, and source contracts live only in spec and registry rows. The observer's local config keeps only credentials, schedules, and rendering budgets.
3. Loop health (a degraded browser, a failed source collection, a stale sheet snapshot) is a separate output channel to the observer owner and suppresses the affected findings; it never enters the website queue.
4. One ticket per dedupe scope: page, shared template, program, or site. A shared-template defect carries the page list; a per-event defect carries the event list.
5. A ticket closes when its check id clears on a later run for the number of runs the row specifies (default two), with the run as evidence: the playbook's "done means survived the next run" applied to the ticket, by the filer, not by a person.
6. The filer is the same code the agents use (`agent/file-found-ticket.mjs`, `agent/intake.mjs`), so observer tickets and agent-found tickets are indistinguishable and follow the same contract, class, owner, and evidence rules.

## Workstreams

Sizes: S a day, M a few days, L a week or more. Tranche 1 uses only what exists; tranche 2 changes the observer; tranche 3 switches over.

### Tranche 1: the definition (target: week of September 28)

**1. Check bundle builder.** `tests/build-checks.mjs` produces `spec/check-bundle.generated.json` (schema in `spec/schemas/`) from `spec/campus-page-requirements.json`, `spec/page-family-requirements.json`, `spec/campus-page-field-map.json`, `spec/source-authority.json`, `spec/community-routing.json`, `spec/campus-lifecycle.json`, `spec/site-rules.json`, `spec/brand-visual.json`, `spec/observer-check-map.json`, and `registry/` (sister-brand exceptions, open media, packets, campus identities, people). Each row: requirement id, page selector (family, lifecycle state), element, expected value or derivation (source, field), comparator, threshold, severity, status (enforced, advisory), ticket class, owner role, dedupe scope, clear-after runs, grace period, evidence profile. Every current observer check id gets a row or a retirement entry with the reason. Owner: website agent. Acceptance: `npm run validate` fails on an observer check with no row and no retirement; the bundle hash is in `spec/release-manifest.json`. Size: L.

**2. Spec and registry corrections the sweep proved.** Header overlap: threshold and dedupe scope shared-template, mobile and desktop stated separately (A1 and A2 measured 12.5 to 16.4 px box overlap with visible clearance; the observer detects above 8% and files at 48 px or 25%). Community host: `www.community.alpha.school` canonical, apex host redirecting, URL form decided (`?campus=<slug>` vs `/campuses/prog-<id>`). Grades: compare `start_grade_level` and `end_grade_level`, never `grade_levels` (a property HubSpot no longer defines). Brand leak: the observer reads `registry/sister-brand-exceptions.json` (Brownsville Nova path, proper nouns, shared nav, event-card venues). Events: an import grace period of four hours after a HubSpot event becomes public, and past events never file. Packets: a hidden 2026-27 packet button is the approved interim state, not `cta-hidden-everywhere`. Operations sheet: a snapshot older than 168 hours is loop health, and the observer packet artifact is the sweep read path (`registry/sources.json`). Images: a page where every image "failed" in one run is loop health. Timeouts: `expected rendered HTTP 2xx` findings need two consecutive runs. Owner: website agent for the rows; Matt Barge for the six decisions already on his Blocked queue (Atlanta cmtnl00rs, Short Hills cmu4g45fg, Columbus cmtyu32gf, health lead cmtneqjw4, packets lead cmtlz33vo, sheet snapshot cmtnxta3p). Acceptance: replaying today's 180 tickets through the bundle files at most the 79 that ended Blocked plus the 7 found defects. Size: M.

**3. Intake administers every observer ticket.** `agent/intake.mjs` `isWebsiteFamily` accepts observer tickets whose URL is a HubSpot record, a GitHub workflow, or events.alpha.school; `--ticket` never drops an id silently; the 1d escalation (unregistered owner role, Blocked on the website agent operator) happens inside intake instead of as a second PATCH; `observer-health` and `observer-layout` title patterns stop swallowing timeouts and images-render findings. Owner: website agent. Acceptance: `intake.mjs` dry over the 180 sweep ids selects all 180 and classifies each to its check row's class. Size: S.

**4. Disposition of the tickets already filed.** The 101 closed today stay COMPLETED (each carries evidence and a section-7 note). A one-time backfill sets `customFields.resolutionKind` on each from the run reports: `fixed-elsewhere` (about 39), `false-positive` (about 56, with the retired or corrected check id), `aged-out` (6), so telemetry can measure the old loop honestly. The 79 Blocked tickets stay as they are; when a check row is retired or corrected in workstream 2, its Blocked duplicates close on the lead's decision with `resolutionKind: check-retired`. Owner: coordinator (this workspace). Acceptance: every sweep ticket has a `resolutionKind`; `tests/telemetry-report.mjs` reports precision for the pre-redesign period. Size: S. Decision for Matt: whether false positives should instead move to CANCELLED so they never count as completed work (recommended: keep COMPLETED with `resolutionKind`, because CANCELLED-shaped PATCHes are treated as authorization revocation by APEX today).

### Tranche 2: the measurer and the filer (target: by October 9)

**5. Observer loads the bundle.** aeo `alpha-site-system` reads `spec/check-bundle.generated.json` by hash from the playbook release, drops its local thresholds and host lists, runs only enforced and advisory rows, and emits `findings.json` where every finding carries requirement id, bundle version, page, element, observed, expected, source read time, and evidence paths. Loop health goes to `health.json`. Findings under an unhealthy source are suppressed and counted. Owner: observer owner (Matt Barge) with the aeo maintainer. Depends on 1 and 2. Acceptance: a shadow run produces findings with requirement ids only; `checks.mjs` contains no threshold literal. Size: L.

**6. Filer in the playbook.** `agent/file-observer-findings.mjs` consumes `findings.json` and `incidents.json`: validates the ticket contract (`tests/validate-ticket.mjs --contract`), applies the dedupe scope (one ticket per template, program, or site defect with the page or event list), applies grace periods, attaches the evidence profile (`agent/attach-evidence.mjs`), assigns class and owner from the policy bundle, and auto-resolves a ticket whose check id has cleared for the row's clear-after runs, writing the run id as evidence and `resolutionKind: check-cleared`. Reuses `agent/file-found-ticket.mjs` dedupe. Owner: website agent. Depends on 5. Acceptance: replaying the 2026-09-24 run's incidents auto-resolves the 39 fixed-elsewhere tickets and the 24 header-overlap findings collapse to one ticket. Size: M.

**7. APEX support.** `resolutionKind` as a first-class field on website Requests; completion clears `agentStatus`; the hosted reconciler skips tickets that carry an observer check id and a filer run id (today it moved tickets under the sweep agents four times); observer tickets show the requirement id and bundle version in the panel. Owner: Hailey McSpadden. Acceptance: a filer-closed ticket shows the clearing run in Evidence and a null `agentStatus`. Size: M.

### Tranche 3: shadow, measure, switch (target: by October 16)

**8. Shadow mode and precision.** Run the new observer and filer for three scheduled runs without writing to APEX, diff against what the old observer filed, and compute precision as tickets that end in a site change, a source change, or a recorded decision, divided by tickets filed. `tests/telemetry-report.mjs` gains this number per run. Owner: website agent with Matt Barge. Acceptance: three runs at or above 80% precision on the shadow set before switching; after the switch the old filer is disabled. Size: M.

**9. Decision cadence.** The six decisions the sweep left on Matt's queue and the grade and Greenwich decisions on Farhan and Yash feed workstream 2 rows; each gets a date in the weekly fifteen-minute review. Owner: Matt Barge. Size: S, recurring.

## Exit criteria

Every observer check maps to a playbook requirement row or is retired; the observer contains no rule of its own; every finding cites a requirement id and bundle version; one ticket per root cause; a ticket closes on its own when the check clears; loop health never reaches the website queue; precision is measured every run and the first three post-switch runs stay at or above 80%; intake administers every observer ticket.
