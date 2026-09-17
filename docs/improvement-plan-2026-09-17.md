# Improvement plan: from supervised operator to autonomous website agent

Drafted 2026-09-17 from `docs/stress-test-2026-09-17-website-agent-system.md`, the fresh-agent survey, and `docs/autonomy-readiness-2026-09-17.md`. Each workstream names the deliverable, the owner, what it depends on, the acceptance test, and a size (S: a day, M: a few days, L: a week or more). Tranches are ordered by what unblocks the most.

## Tranche 1: stop unsafe execution (target: week of September 22)

### 1. APEX readiness gates
- Deliverable: replace the single `agentEligible` flag with structured fields: `intakeValid`, `routeSupported`, `inputsComplete`, `actorSupported`, `approved`, `executionReady`; `executionReady` can only be true when every other field is true. The playbook's `tests/validate-ticket.mjs --contract` becomes the reference implementation for `intakeValid`.
- Owner: Hailey (APEX). Website agent supplies the validator and fixtures.
- Depends on: nothing.
- Acceptance: of the 293 website-family Requests in the stress sample, zero contract-invalid Requests are `executionReady`; the intake agent's dry-run and APEX agree on every one.
- Size: M.

### 2. Rendered evidence as a closure gate
- Deliverable: APEX refuses `COMPLETED` on a website-family Request unless the evidence profile for its class is attached: rendered-controls JSON or desktop and mobile screenshots for the canonical URL, page-check JSON, and MCP receipt ids. Evidence attaches as files or links on the Request.
- Owner: Hailey (APEX gate); website agent (evidence profile per class in `spec/ticket-classes.json`, already partly there as `doneWhen`).
- Depends on: 1 for the class field.
- Acceptance: a Request with a source-only "verified_pass" cannot be completed; the September 17 Book a Call miss is unreproducible.
- Size: M.

### 3. Attestation
- Deliverable: a signed release manifest in the playbook (`spec/release-manifest.json`): playbook commit, policy-bundle hash, MCP bridge version, plugin version, `abilitySchemaSha256` (health, 0.5.1), supported operations by actor, approved canary ids. The intake agent, the hosted worker, and the bridge health check refuse to claim or write when production health disagrees with the manifest.
- Owner: website agent (manifest, bridge check); Hailey (worker check).
- Depends on: 0.5.1 deployed (PR 16).
- Acceptance: a deliberate mismatch (old plugin, wrong bundle hash) blocks claim with a typed error; a matching manifest passes.
- Size: S for the manifest and bridge check; S for the worker.

### 4. Hosted worker hygiene
- Deliverable: a dedicated Alpha MCP preflight (health, manifest, one read against a canary page); `inspect_only` and preflight modes mutually safe by default; every inspected Request gets a disposition (completed, waiting, held, blocked, conflict, failed, skipped, unsupported) and the counts sum.
- Owner: Hailey.
- Depends on: 3.
- Acceptance: a run log always explains every inspected Request; a one-click preflight cannot conflict with inspect mode.
- Size: S.

## Tranche 2: make the playbook the executable policy (target: by October 3)

### 5. Compiled policy bundle
- Deliverable: `npm run build:policy` in the playbook produces one versioned JSON bundle from `spec/ticket-classes.json`, `spec/responsibilities.json`, `spec/source-authority.json`, `spec/actor-capabilities.json`, `spec/campus-page-field-map.json`, `spec/synced-targets.json`, and `registry/people.json`: classification rules, required inputs, source owner, actor capability, approver, evidence profile, stop conditions, retry policy. The intake agent consumes only the bundle. The hosted worker loads the same bundle and drops its embedded `CAMPUS_OPERATING_CONTEXT` copies.
- Owner: website agent (bundle, intake); Hailey (worker consumption).
- Depends on: 1 (so APEX and the bundle share field names).
- Acceptance: cross-harness fixtures (7) produce identical route, stop, owner, and evidence decisions from the bundle alone.
- Size: L.

### 6. Published agent contract and client
- Deliverable: OpenAPI and JSON Schema for `/api/agent`: search, claim, lease renew, checkpoint, evidence attach, partial completion, owner handoff, retry, close. A small client (`@alpha/apex-agent`, Node) generated from it. The playbook scripts (`file-apex-ticket`, `triage-ticket`, `agent/intake.mjs`) move from description PATCHes to the contract.
- Owner: Hailey (contract, publication); website agent (client adoption).
- Depends on: nothing for publication; 1 for field names.
- Acceptance: a clean container with only the playbook and the client claims, checkpoints, attaches evidence, and closes a fixture Request without reading APEX source.
- Size: L.

### 7. Cross-harness fixtures
- Deliverable: `tests/fixtures/decisions/` with twenty real Requests (the six stress-test traces plus fourteen from the September batches: staff add with and without asset, photo-only in an untagged row, hidden CTA, packet, launch copy, grade mismatch, Greenwich ambiguity, event, redirect, unpublish, observer health false alarm, FAQ, bulk deck). Each fixture states the expected class, route, owner, evidence profile, and stop reason. `npm test` asserts them against the bundle; a second harness (Codex) runs the same fixtures weekly.
- Owner: website agent.
- Depends on: 5.
- Acceptance: both harnesses match all twenty; a regression fails CI.
- Size: M.

### 8. Least-privilege credentials
- Deliverable: an APEX key for the website agent scoped to the agent contract only (no broad `/api/v1` patch or delete); a WordPress application password on the executor role only (already the case for the bridge user; confirm with `access_report`).
- Owner: Hailey (APEX key); website agent (audit).
- Depends on: 6.
- Acceptance: the agent key cannot delete or bulk-patch through `/api/v1`; `access_report` shows the bridge user without `manage_options` (configuration endpoints then move to an admin-issued key).
- Size: S.

## Tranche 3: compound work and other systems (target: October)

### 9. Step graph for compound Requests
- Deliverable: a Request holds typed steps (source adapter, destination adapter, owner, missing inputs, dependency, wake condition, per-object lease and approval, prepared hash, rollback artifact, evidence profile, state). Example: HubSpot change (Farhan) then nightly sync (wait on run) then WordPress verification (website agent). Successful steps stay complete when a sibling fails.
- Owner: Hailey (APEX model); website agent (step definitions per class in the bundle).
- Depends on: 5, 6.
- Acceptance: the Group A launch-sentence ticket replays as three steps, resumes after the nightly run, and closes only when the page survives it.
- Size: L.

### 10. Adapter registry
- Deliverable: typed adapters, each declaring read, write, verify, rollback, credential audience, error taxonomy, and supported classes: WordPress (Alpha MCP, done), HubSpot Programs (read via scopes or APEX; write via the APEX campus editor per Yash's audit rule), n8n delivery (read run status; write is a person), events (read), packets (read registry; write is a person), Community (read), forms (registry first), cache (done), human handoff (typed).
- Owner: website agent (definitions, WordPress, cache, reads); Hailey (APEX campus editor write path and HubSpot read proxy).
- Depends on: 6; HubSpot scopes (12).
- Acceptance: every ticket class maps to an adapter or a typed handoff; unknown classes fail closed.
- Size: L.

### 11. Recovery and telemetry
- Deliverable: retry taxonomy (transient, stale, conflict, unsupported, unauthorized), dead-letter state, dependency wakeups (nightly run, observer rerun, owner reply), correlated run ids end to end (bridge `runId` is in receipts already), a dashboard from stored receipts and APEX dispositions: throughput, refusals by reason, complete-evidence rate, time to verified completion.
- Owner: Hailey (APEX states); website agent (receipt-based dashboard as a published page).
- Depends on: 6, 9.
- Acceptance: a simulated APEX 500, stale hash, cache failure, and browser failure each land in a named state with an owner.
- Size: M.

## Tranche 4: environment, sources, people (start now, finish as owners allow)

### 12. HubSpot read access
- Deliverable: `crm.objects.custom.read` and `crm.schemas.custom.read` on the private app ending `eded` (portal 40051392), or an APEX read proxy for Program values.
- Owner: Hailey.
- Acceptance: `tests/diagnose-field.mjs` reads `website_campus_intro`, tuition, phone, and `call_scheduling_link` directly; the growth-map mirror becomes the fallback.
- Size: S.

### 13. Staging with an application-password path
- Deliverable: WP Engine staging reachable by the bridge (basic auth exception for the REST namespace, or a staging-only app password behind an allowlisted IP), plugin 0.5.x installed, `alpha_mcp_production_writes_enabled` off, `ALPHA_WP_BASE_URL` for staging in the bridge config.
- Owner: Yash or Dmitry (WP Engine); website agent (staging validation matrix rerun).
- Acceptance: the staging mutation matrix (`scripts/run-staging-mutation-validation.mjs`) passes on 0.5.x, including structure and media operations.
- Size: S for access; M for the matrix.

### 14. Decision cadence
- Deliverable: a standing fifteen-minute weekly review of `docs/decisions.md` Proposed rows with Matt, Yash, and Farhan; each row gets an owner and a date. Current backlog: grade property, Greenwich one page or two, launch date on Open campuses, unapproved packets, McLean, NYC photos, intro-sentence derivation.
- Owner: Matt.
- Acceptance: no Proposed row older than two weeks; the 33 tickets blocked on these decisions move.
- Size: S, recurring.

### 15. Owners, sources, registries
- Deliverable: name the seven unnamed roles (packet, Elementor, Operations sheet, Community app, Admissions Hub editor, legal, analytics/consent); a staff roster source (the People Bio tab or an APEX view) the agent can read; Operations sheet owner and access path; packet approval status per campus; fill the 31 missing emails and 40 missing titles in `registry/people.json`; form ids in `registry/forms.json`; plugin, redirect, and navigation inventories (`access_report` and `list_redirects` now supply two of these).
- Owner: Matt and Yash (names); website agent (inventories).
- Acceptance: `npm run validate` reports zero owner gaps; every Missing Info class has a person to go to.
- Size: M spread over owners.

### 16. Tagging and template hygiene on the site
- Deliverable: tag every campus leadership card `Team head` (East Bay's ten untagged cards first) with `set_element_meta`; run `compare_to_template` on all 44 campus pages and file drift tickets (Austin, Miami known); resolve the Book a Call writer question with Cristi and set the synced-id list accordingly.
- Owner: website agent.
- Depends on: 0.5.0 (done).
- Acceptance: the staff tool addresses every leadership card; drift report is zero or ticketed.
- Size: S.

## What starts immediately (website agent, no dependencies)

- 3: release manifest and bridge check (after PR 16 merges).
- 5: policy bundle builder and intake consumption.
- 7: fixture set from the September tickets.
- 16: East Bay tagging, site-wide drift report.
- 15: inventories through the new reads.

## What waits on others

- 1, 2, 4, 6, 8, 9, 11 (APEX): Hailey.
- 12 (scopes): Hailey.
- 13 (staging): Yash or Dmitry.
- 14, 15 (decisions, owners): Matt and Yash.

## Exit criteria (from the stress test, unchanged)

Every supported class maps to a typed adapter or handoff; unknown classes fail closed; cross-harness fixtures agree; contract-invalid Requests cannot be execution-ready; the release fingerprint is enforced before claim or write; compound state survives interruption; completion is impossible without rendered evidence; failure drills produce a recoverable state with an owner; agent credentials cannot bypass the control plane; a staged multi-class pilot and an allowlisted production pilot run with zero unsafe writes.

---
## Build status (2026-09-17, end of day)

Built by the website agent and either merged, pushed to main, or open for review:

| Workstream | Where | State |
| --- | --- | --- |
| 1 Intake validity and execution readiness columns | APEX PR 330 (`agent/website-control-plane`) | open, needs Hailey |
| 2 Reconcile evidence gate (rendered evidence required to complete) | APEX PR 330 | open; step-level evidence profiles still to come |
| 3 Release manifest, `tests/check-release.mjs`, intake `--apply` gate, bridge `abilitySchemaSha256`, worker `--preflight-alpha-mcp` | playbook main, MCP 0.5.1, APEX PR 330 | done; manifest hash set after the 0.5.1 or 0.5.2 upload |
| 4 Ready queue serves only execution-ready Requests | APEX PR 330 | open |
| 5 Policy bundle (`tests/build-policy.mjs`, `spec/policy-bundle.generated.json`), intake reads the bundle only | playbook main | done |
| 6 Agent OpenAPI at `/api/docs/agent` | APEX PR 330 | open |
| 7 Twenty decision fixtures asserted by `npm test` | playbook main | done; second-harness run still to do |
| 8 API key scopes | APEX PR 330 | open |
| 9 Step graph per class (`steps` in the bundle: adapter, owner, wake, evidence) | playbook main | definitions done; APEX step model waits on Hailey |
| 10 Adapter registry (`spec/adapters.json`, validator fails on unmapped classes) | playbook main | done |
| 11 Telemetry (`tests/telemetry-report.mjs` from receipts and APEX; first report `docs/telemetry/2026-09-17.md`) | playbook main | report done; retry states and dead letter wait on APEX |
| 12 HubSpot scopes and agent key | Hailey | waiting |
| 13 Staging with an application-password path | Yash or Dmitry | waiting |
| 14 Decision cadence, seven Proposed decisions | Matt, Yash, Farhan | waiting |
| 15 Inventories (`registry/plugins.json`, `redirects.json`, `global-runtime.json`) | playbook main | done; forms ids still empty |
| 16 East Bay tagging, drift report (MCP 0.5.2 normalizes drift keys) | done; MCP PR 17 | 0.5.2 open |
