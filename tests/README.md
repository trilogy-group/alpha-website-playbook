# Tests and checkers

Agent-independent scripts. Plain Node 20+, no dependencies. Run the repository checks with `npm test` or the detailed validator with `npm run validate`.

- `search-apex-tickets.mjs --url <canonical> [--text <term>] [--check <id>]`: read-only duplicate search over active APEX website tickets. Add `--file <export.json>` for an offline search.

- `validate-ticket.mjs --file <apex tasks json> [--summary]`: protocol step 1. Classifies APEX website tickets against `spec/ticket-classes.json`, reports which inputs are missing, and writes the Missing Info text.
- `page-check.mjs --url <canonical url> [--url ...] [--state Open|Announced] [--json out.json]`: protocol step 5, ring 2 (text and structure). Header template and its stylesheet, footer, H1, hero CTAs, intro section, canonical tag, state rules (no launch-era words on Open pages; a named month or season and year on Announced pages), sister-brand words, other-campus image names, approved intro media, and CTA link resolution. Scans page-owned content only, so shared navigation and footer do not count against a page. Exit code 1 on any failure. Screenshots are still required by the protocol and are not produced by this script.
- `validate-community-routing.mjs [--live-map]`: validates the Community routing spec, the partial campus identity crosswalk, canonical URLs, lifecycle mapping, and dated inventory. It is offline by default. `--live-map` adds a read-only comparison with the public growth map and never changes the map or Community app.
- Ring 3 (shared templates): run `page-check.mjs` on two untouched campus pages after any site-wide action and confirm `header-stylesheet-linked` and `footer-template-present` pass.

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
