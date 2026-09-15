# ADR: Answers to the September 15, 2026 findings questions

Status: **Proposed — awaiting Yash + Matt approval** on Q2–Q6.

Source questions: `docs/findings-2026-09-15.md`. Q1 (HubSpot wins campus state) is already recorded on main in `docs/decisions.md` (Matt Barge, 2026-09-15). This ADR keeps the other five answers Proposed so they can be reviewed without pretending the whole set is locked. Do not change `spec/` for Q2–Q6 until approved. After approval, conflicts become failing checks and the rest of M3 can lock.

## Q1 — When HubSpot / Operations sheet / growth map API disagree on campus lifecycle, who wins?

**Recorded on main (aligned):** HubSpot is the source of truth for campus state. If HubSpot says Open, the website says open. Operations sheet and growth map are downstream; where they disagree with HubSpot, HubSpot wins and the other source is corrected. See `docs/decisions.md`.

**Still Proposed (detail):** Ops “Enrolling” stays compatible with map Open or Announced (observer already does this) and must not invent a separate playbook state until HubSpot has a field. Map API is a projection of HubSpot, not an override.

**Rationale:** Scoreboard and map already treat HubSpot as list truth.

**Open:** Confirm with Matt that Ops never intentionally diverges for website display.

**Implications for M3:** Lifecycle checks read HubSpot (via map projection). Ops-only values are not playbook states.

## Q2 — Does an Open campus keep `launchDate`, or clear it at opening?

**Proposed:** Clear `launchDate` (or stop displaying it) when state is Open. Open pages must not show “Coming Fall 2026” / launch graphics. Free-text `Fall 2026` on Open campuses (Charlotte, Chicago, Dorado, Palo Alto, Raleigh, Santa Monica, The Woodlands) is a defect: clear the field in HubSpot / map source and remove launch media from the page.

**Rationale:** Matches the September 15 ticket intent and avoids Open + launchDate ambiguity.

**Exception:** None for v1 unless Matt / Yash name a Launching state with month/year later.

**Implications for M3:** Open + visible launch date / launch media is a failing check. Clearing the source field is part of the fix. Partial Open rows already forbid launch graphics in intro media; this ADR extends that to the HubSpot/map `launchDate` field itself.

## Q3 — Greenwich: one page or two?

**Proposed:** Keep **one** page `/greenwich/` for Armonk + Port Chester until brand / product asks for two. Page copy and Locations cards must name both campuses clearly. Observer tickets must not file duplicates under two names as separate page defects — file against `/greenwich/` with both program IDs. Registry lists both HubSpot programs → one URL.

**Rationale:** Matches the current live structure and the scoreboard “shared URL” pattern. Splitting is a product project, not a silent agent split.

**Implications for M3:** One URL, two program IDs. Tickets and inventory keys are the page path, not the program name.

## Q4 — Which section-order variants are allowed; migrate Austin and Miami?

**Proposed for M3 Open matrix:** The current template (majority of Open campuses) is the exemplar. Austin and Miami older templates are **allowed variants** marked `legacy-template` in the registry until a dedicated migration ticket. Agents must not “normalize” them in opportunistic ticket work. Kirkland extra trailing sections / Chicago + Greenwich news sections: allowed if present on approved exemplars; do not add news sections to campuses that lack them. Section-order variance on ~20 pages: document observed orders; require presence of required sections, not identical order, until MacKenzie / Matt lock a single order.

**Rationale:** Avoids drive-by template rewrites. Migration is explicit work.

**Implications for M3:** Required-section presence, not identical order. Austin / Miami stay `legacy-template` until a named ticket.

## Q5 — Who owns campus facts (grades, tuition, phone, address, email) when Locations card ≠ page?

**Proposed:** HubSpot Programs (and campus editors / Rachel) own the canonical facts. The campus page must match HubSpot. The Locations card must match HubSpot. When card ≠ page, both are wrong until HubSpot is checked. Fix page and card to HubSpot in one ticket class “facts”. Do not treat either surface as authoritative alone (findings already said this).

**Rationale:** Aligns with Programs as campus truth. Closes Austin PK-8 vs PreK-5 / tuition mismatches as HubSpot-first.

**Implications for M3:** Facts checks compare both surfaces to HubSpot, not to each other.

## Q6 — Who is the staff roster source?

**Proposed:** Until a configured source exists, the staff / team section is **optional for enforcement** and must not be invented. Preferred future source: a named Operations / staff roster sheet or HubSpot object Matt designates. The observer must not assert staff names without a source pointer in `registry/sources`. Missing roster = Missing Info on staff tickets, not agent-written bios.

**Rationale:** Findings: the observer has none configured. Inventing staff is worse than leaving the section optional.

**Implications for M3:** No failing staff-name checks until `registry/sources` names a roster. Staff tickets without a source close as Missing Info. Responsibility-layer campus roles (DoA / DoP) are a separate routing concern from public staff cards.

## Maintenance (after Q2–Q6 approval)

- Weekly inventory drift PRs against `spec/inventory/`.
- APEX closes cite the spec version they were tested against.
- Defects become failing checks before page fixes.
- City-OS stays a sibling. See `docs/related-systems.md`. It may cite this playbook for the city-page column; it is not merged into campus-page requirements.
- Finish M3 Open-state matrix for remaining sections after these answers lock.
