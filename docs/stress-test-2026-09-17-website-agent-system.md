# Alpha Website Agent System Stress Test

Date: September 17, 2026

Scope: Alpha Website Playbook, APEX Website Ticket Protocol, APEX Website and Website QC Requests, Alpha WordPress MCP, and the scheduled hosted agent

Mode: read-only production inspection plus local validation; no WordPress content was changed

## Executive verdict

The system is a sound narrow foundation, but it is not yet a general autonomous website-ticket system.

- **Alpha MCP narrow-path safety: 78/100.** Canonical object checks, leases, prepared hashes, snapshots, receipts, idempotency, and rollback are strong on the supported staff path.
- **General autonomous ticket-processing readiness: 32/100.** APEX frequently marks incomplete or unsupported Requests as ready or agent-eligible, policy is duplicated across repositories, and the hosted worker does not execute the playbook as its governing policy.
- **Whole-system readiness: 48/100.** A carefully supervised pilot may continue for explicitly allowlisted, fully specified staff changes. The scheduled agent should not consume the general Website queue yet.

Correct refusal counts as success in this test. A safe agent must stop, classify, or hand off unsupported work instead of forcing every Request through WordPress.

## Goal under test

A fresh agent, using any model or harness, should be able to:

1. Discover the governing contract.
2. Find and claim an eligible APEX Website or Website QC Request.
3. Determine the authoritative source and responsible owner.
4. Decide whether the Request is executable, partially executable, blocked, or a handoff.
5. Use the approved adapter, including Alpha MCP when WordPress is the correct destination.
6. Prepare, approve, apply, verify, and recover safely.
7. Store sufficient evidence in APEX and close only the completed scope.
8. Reach the same route and stop decision as another conforming agent.

The current stack does not yet meet steps 1, 2, 4, 7, or 8 consistently.

## Test method

The test combined:

- A 670-Request open-queue audit, including a 293-Request Website-family sample.
- A clean-room trace of six materially different real Requests.
- Production Alpha MCP health, canonical-resolution, wrong-object, missing-object, read, and public-verification checks.
- Live source-path diagnosis against HubSpot/n8n-owned campus data.
- Offline and live duplicate-search comparison.
- Two read-only hosted-agent workflow runs.
- Repository contract inspection across the playbook, APEX, and Alpha MCP.
- A traceability search for the referenced “Did You Know” Request.
- Local playbook validation and tests.

No ticket was claimed, no APEX Request was modified, and no WordPress page content was changed.

## Weighted rubric

Scores use a 0–10 scale. Weighted points sum to 100.

| Criterion | Weight | Score | Weighted points | Finding |
| --- | ---: | ---: | ---: | --- |
| Cold-start discoverability | 10 | 3 | 3.0 | A capable agent can reconstruct the path, but must traverse three repositories and conflicting version/owner statements. |
| Ticket contract and readiness | 12 | 2 | 2.4 | Only 43 of 293 Website-family Requests passed the playbook contract; 210 Requests were classed ready while contract-invalid. |
| Source authority and routing | 10 | 5 | 5.0 | The source map is valuable, but multi-Program ambiguity and ownership conflicts are not consistently fail-closed. |
| Canonical page and object safety | 12 | 7 | 8.4 | Wrong and missing objects are rejected, but a preview URL can resolve to the homepage and `get_page` did not always bind the supplied canonical URL to the object. |
| Capability and version negotiation | 8 | 2 | 1.6 | Production, repository, playbook, and worker capability versions can disagree without blocking execution. |
| Claim, lease, and approval safety | 10 | 8 | 8.0 | The narrow path has strong collision and approval controls; the public contract is not discoverable to arbitrary harnesses. |
| Preparation, idempotency, and rollback | 10 | 8 | 8.0 | Strong Alpha MCP design and canary evidence on supported staff changes. Compound Requests have no durable step graph. |
| Rendered public verification | 12 | 4 | 4.8 | The protocol is correct, but production 0.3.3 passed a CTA hidden on every breakpoint and APEX closure does not enforce screenshot evidence. |
| Evidence and closure | 8 | 6 | 4.8 | Ashley Storms has strong receipts; “Did You Know” cannot be traced to a Request or verification bundle. |
| Queue scale, retries, and recovery | 8 | 3 | 2.4 | The runner is alive and bounded, but the current scheduled scope cannot progress and inspection/API failures are opaque. |
| **Total** | **100** |  | **48.4** | **Not ready for general autonomous execution.** |

## Results by layer

### 1. Playbook and ticket protocol

What worked:

- The source-authority boundary correctly prevents direct WordPress edits to HubSpot-, n8n-, Airtable-, event-, and Community-owned values.
- The protocol names canonical resolution, leases, prepared diffs, semantic hashes, snapshots, cache recovery, three verification rings, and fail-closed stop conditions.
- The offline duplicate checker found the known South Bay Book a Call Request.
- Local validation passed: 44 JSON files parsed, all required references resolved, and the repository tests passed.

What failed or remained ambiguous:

- The prose says no queue-search CLI exists even though `tests/search-apex-tickets.mjs` exists.
- Packet ownership conflicts across the registry and documentation.
- Bethesda campus-role resolution fails closed because the snapshot has no Bethesda entry.
- Book a Call ownership conflicts: one document says n8n writes it while the inspected workflow-control record says it does not.
- The live duplicate checker sent repeated status parameters in a form the APEX endpoint did not honor, producing a dangerous false-negative.
- The field diagnostic selected one of two HubSpot Programs sharing `/greenwich/` instead of stopping on the ambiguity.
- The ticket validator infers structured fields from prose/HTML. This caused false-ready, unclassified, and wrong-observer results.

### 2. APEX queue and readiness

Open-queue sample:

| Measure | Result |
| --- | ---: |
| Website-family Requests audited | 293 |
| Not Started | 151 |
| Blocked | 83 |
| Missing Info | 48 |
| In Progress | 11 |
| Passed the playbook ticket contract | 43 |
| Failed the playbook ticket contract | 250 |
| Classed ready | 212 |
| Classed ready while contract-invalid | 210 |
| Marked agent-eligible | 112 |
| Agent-eligible while contract-invalid | 108 |
| Agent-eligible but not class-ready | 25 |

This is the largest operational defect. `agentEligible` currently mixes “belongs in an agent-facing queue” with “safe for this actor to execute now.” Those are different facts.

The intake agent dry-run over 126 recent Requests produced 57 routed, 51 missing-info, and 18 ready-for-execution results without writes or model calls. It is useful as triage, but does not yet enforce the complete execution contract.

The intake family filter also misses some `agent-found`, `website-agent`, and New Program website Requests.

### 3. Alpha WordPress MCP

Authenticated production health passed:

- Plugin version `0.3.3`
- Environment `production`
- Operator mode enabled
- Production writes enabled
- WordPress `7.0.4`
- Elementor `4.1.1`
- Actor user ID `34`

Safety checks:

| Test | Result |
| --- | --- |
| Resolve Kirkland canonical page | Pass: object `9216` |
| Reject Kirkland draft/wrong object `9850` | Pass: `alpha_mcp_wrong_object` |
| Reject nonexistent page | Pass: `alpha_mcp_page_not_found` |
| Resolve Greenwich | Pass: object `9213` |
| Resolve South Bay LA | Pass: object `9208` |
| Resolve Bethesda | Pass: object `5743` |
| Basic page read and source verification | Pass |
| Preview URL with live mutation intent | **Fail:** `/?page_id=9953&preview=true` resolved to homepage object `3657` instead of refusing the preview/draft URL |
| Object/canonical URL binding | **Fail:** local `get_page` accepted object `9213` with the wrong supplied canonical URL |
| Hidden CTA verification | **Fail in production 0.3.3:** South Bay Book a Call passed source verification while hidden on every breakpoint |
| New local routes against production | Expected fail: `rest_no_route`, because newer plugin routes are not deployed |

Production runs plugin `0.3.3`; the MCP repository main line reports `0.3.4`, and the concurrent local branch contains still-newer routes. Health does not attest the exact MCP tool schema, plugin route schema, or compatibility fingerprint expected by the worker.

### 4. Scheduled hosted agent

Current production configuration observed during the run:

- Live edits enabled.
- Generic MCP enabled with `all_supported` scope.
- Alpha MCP enabled with `pilot` scope.
- Alpha MCP pilot allowlist contains the already-completed Ashley Storms Request `cmu2yctcn000004jwiqv6o25n`.
- General scheduled scope is pinned to blocked Kirkland bulk Request `cmtrrm3qn000204l5qehtzzrk`.
- The pinned Request repeatedly skips after exhausting its retry budget.

The completed Ashley Storms canary contains good MCP receipts, object identity, and public verification evidence. It proves a narrow staff-update path; it does not prove general Website Request support.

Read-only hosted runs:

1. [Run 35266246396](https://github.com/trilogy-group/alpha-event-task-management/actions/runs/35266246396) failed with only `{"event":"hosted_worker_failure","category":"apex","status":500}`.
2. [Run 35266689543](https://github.com/trilogy-group/alpha-event-task-management/actions/runs/35266689543) succeeded on retry. It inspected 15 assigned Requests, completed none, made no model calls, and reported four `information_packet_hold` skips. It did not explain the disposition of the other 11 Requests.

The workflow also defaults `inspect_only` to true while preflight modes require it to be false. Selecting a preflight without manually changing that default causes a mode-conflict failure.

`--preflight-mcp` checks the generic Elementor MCP path, not `HOSTED_AGENT_ALPHA_MCP_SITES_JSON`. There is no dedicated hosted Alpha MCP compatibility preflight.

### 5. Six-Request clean-room sample

A fresh-agent review reached safe decisions for all six Requests, but required about ten minutes, multiple repositories, live page inspection, and judgment beyond the machine contract. Zero were safe for immediate Alpha MCP execution.

| Request | Correct disposition | Current-system issue |
| --- | --- | --- |
| `cmu4hqkdg00000agmcjcawem0` — Chicago packet edits | Hold for packet workflow, authoritative grades, approval, and exact replacement scope | APEX/playbook can label packet work as ready or agent-eligible even though Alpha MCP cannot edit the PDF. Packet-owner records conflict. |
| `cmu4kvhy500000agm20nunige` — Bethesda Morgan Hatt | Missing Info: keep/remove decision, exact title/bio/headshot/effective date, then exact component check | Unclassified; owner lookup fails; no approved asset or decision. Potentially executable only after all gates pass. |
| `cmu1knrne00000agmyfn0bj7v` — McLean application route | Multi-system owner handoff; decide Program identity and route before any page work | Unsupported page creation, Finalsite, Program, n8n, and redirect work is presented as website execution. `/mclean/` returned 404. |
| `cmu5vhf93000004k1320lnmft` — South Bay Book a Call | Wait for source-owner decision and deployed visibility capability; then canary | Production source verification missed widgets hidden on desktop and mobile. New `set_visibility` support was not deployed/tested for the scheduled actor. |
| `cmu1f1bei000004jvui4picz8` — Jacksonville launch | Expansion/HubSpot/n8n/human finishing workflow | New Program work enters website maintenance as ready even though Alpha MCP must not create or structurally clone pages. |
| `cmu5vmgyy00010agma1ejqd0w` — Miami observer health | No page mutation; rerun observer and reconcile as transient if clear | Current `/miami/` returned 200 and passed 14/14 rendered checks, so the Request needs health reconciliation, not execution. |

This sample demonstrates an important distinction: the fresh agent’s refusals were mostly correct, but the architecture did not make those decisions cheap, deterministic, or portable.

### 6. “Did You Know” trace

Result: **not auditable; fail on evidence traceability**.

- Exact APEX search for “Did You Know” returned zero title/description matches.
- A scan of 4,101 queue records found no literal match.
- Expanded full-record reads completed for 3,715 records; 386 reads failed or were rate-limited. No successful record contained a near match.
- No exact Request ID, canonical URL, source ruling, prepared diff, MCP receipt, public screenshot, or three-ring verification bundle could be tied to the name “Did You Know.”

This does not prove the page work was wrong. It proves the system cannot currently prove that it was right. Under the ticket protocol, that is not a verified completion.

## Root architectural problem

The playbook is not the hosted worker’s executable policy.

The intake agent reads playbook rules but never edits pages. The hosted worker separately embeds `CAMPUS_OPERATING_CONTEXT`, hard-coded plans, supported unions, and blocking rules. APEX readiness logic, ticket prose, the legacy website worker, and the Alpha MCP client add more copies of the same decisions.

Consequences:

- Updating the playbook does not reliably update runtime behavior.
- Two models or harnesses can reach different decisions.
- A fresh agent must reverse-engineer internal TypeScript and environment configuration.
- The published APEX OpenAPI covers `/api/v1`, not the `/api/agent` claim, lease, checkpoint, evidence, approval, and recovery contract.
- Compound Requests have no durable step graph.
- Rendered desktop/mobile proof is not an enforced closure invariant.
- Agent credentials are not structurally scoped away from broad raw APIs.

## Components that should exist

The missing layer is a **Website Agent Control Plane**. It should be an executable release of the playbook, not a second source of truth or another ticket database.

### 1. Signed website-agent release manifest

Pin, in one machine-readable artifact:

- Playbook commit and policy-bundle hash
- APEX agent API/schema version
- Alpha MCP package, bridge, plugin, route, and tool-schema fingerprint
- Supported operation matrix by actor and environment
- Required adapters and credential audiences
- Approved staging and production canary IDs

Any mismatch must block claim or mutation.

### 2. Public, versioned APEX agent contract

Publish OpenAPI and JSON Schemas for discovery, search, claim, lease, renew, prepare, approve, checkpoint, evidence, partial completion, owner handoff, retry, and recovery. Generate a small SDK/CLI so Codex, Claude Code, Cursor, or a generic container does not reverse-engineer APEX internals.

### 3. Compiled deterministic policy bundle

Compile the playbook’s ticket classes, source ownership, actor capabilities, owners, required evidence, stop conditions, and retry policy into one validated bundle consumed by intake, APEX, and every runner.

The model may extract intent and propose a plan. Deterministic code must enforce source, capability, readiness, lease, approval, object, hash, and evidence rules.

### 4. Durable Request-to-step graph

Represent a compound Request as typed steps with:

- Source and destination adapter
- Owner and missing inputs
- Dependencies and wake conditions
- Per-object lease and approval
- Prepared hash and rollback artifact
- Evidence profile and completion state

Successful independent steps stay complete; failed siblings remain open. Do not roll back successful siblings unless a shared document write failed.

### 5. Versioned adapter registry

Define typed adapters for WordPress/Alpha MCP, HubSpot Programs, n8n delivery, events, packets, Community, onboarding sheets, cache providers, and owner handoffs. Each adapter must declare read, write, verify, rollback, credential audience, error taxonomy, and supported ticket classes.

### 6. Central rendered-verification service

Produce durable desktop and mobile screenshots, typed assertions, viewport metadata, canonical URL, observer run, cache ring, artifact hashes, and two untouched-page checks when ring 3 is required. APEX must reject completion if the ticket’s evidence profile is incomplete.

### 7. Harness-neutral runner

Provide a CLI/SDK that:

- Loads and verifies the release manifest.
- Retrieves only structurally eligible Requests.
- Produces a deterministic route/stop decision.
- Invokes a replaceable model only for bounded interpretation or plan generation.
- Executes adapters only through the control plane.
- Emits the same typed receipts in every harness.

### 8. Recovery and operations layer

Add a shared retry taxonomy, uncertain-write reconciliation, dependency wakeups, dead-letter queue, correlated run IDs, provider health, SLOs, and actionable alerts. A generic `category=apex,status=500` is not sufficient to recover an unattended run.

These components can begin as packages and workers inside APEX plus compiled artifacts from the playbook. They do not require a second workflow database or a new standalone service on day one.

## Prioritized remediation

### P0 — before general queue execution

| Repository/component | Change | Acceptance test |
| --- | --- | --- |
| APEX | Split `intakeValid`, `routeSupported`, `executionReady`, and `agentEligible` into separate structured fields | No Request can be returned as execution-ready unless its contract, source, capability, approval, and evidence profile pass. |
| APEX | Publish `/api/agent` OpenAPI/JSON Schema and generated client | A clean container discovers, claims, checkpoints, and hands off a fixture without reading APEX source. |
| Playbook + APEX | Compile one versioned policy bundle and remove duplicated routing truth | Codex, Claude Code, Cursor, and a generic runner produce identical route/stop results for the same fixtures. |
| APEX | Add a durable typed step graph for compound Requests | Ready steps complete independently; blocked steps retain owner/wake state; replay is idempotent. |
| Alpha MCP + APEX | Require exact tool/plugin/route/schema fingerprint attestation | Any playbook, bridge, plugin, or tool-schema mismatch blocks claim and write. |
| Alpha MCP | Refuse preview/draft query URLs for live intent and bind object ID to canonical URL on every read/write | Preview URL and mismatched URL/object fixtures fail closed. |
| Alpha MCP | Deploy and canary the current hidden/disabled-element verification behavior | South Bay hidden Book a Call fails verification on desktop and mobile. |
| APEX | Enforce typed desktop/mobile/ring-3 evidence at closure | Missing, stale, wrong-URL, or tampered screenshot evidence blocks completion. |
| APEX security | Issue audience-bound, least-privilege website-agent credentials | Website-agent key cannot invoke broad `/api/v1` patch/delete routes. |

### P1 — before increasing volume

| Repository/component | Change | Acceptance test |
| --- | --- | --- |
| Playbook | Resolve packet owner, Book a Call writer, campus role coverage, and stale version records | No contradictory owner/writer/version values in validation. |
| Playbook | Fix live duplicate search to use an endpoint-supported status query and add a live contract test | Known active duplicate is returned; API parameter regression fails CI. |
| Playbook | Make multi-Program URL ambiguity a hard stop | Greenwich fixture with two Programs returns typed ambiguity. |
| APEX | Store contract fields structurally instead of parsing rendered prose | Packet, New Program, staff, and observer fixtures classify consistently. |
| Hosted agent | Add a dedicated Alpha MCP preflight and make workflow mode inputs mutually safe by default | One-click Alpha preflight verifies exact manifest and cannot conflict with `inspect_only`. |
| Hosted agent | Report a disposition for every inspected Request | `inspected = completed + waiting + held + blocked + conflicts + failed + skipped + unsupported`. |
| Operations | Add retry taxonomy, dead letters, dependency wakeups, and correlated telemetry | Simulated APEX, WordPress, MCP, cache, HubSpot, n8n, and browser failures produce actionable recovery state. |

### P2 — expand capability only through canaries

- Promote general Elementor text/link/image tools one operation at a time.
- Promote post fields, status changes, and visibility changes only with staging and production canaries.
- Keep new pages, structural cloning, global templates, plugins, forms, and workflow changes outside routine scheduled execution until separately designed and tested.

## Recommended operating decision

Continue production only for a small, explicit allowlist of staff Requests that meet every contract and capability gate. Do not point the scheduled agent at all Website Requests merely because they are `agentEligible`.

The next production pilot should contain three to five fully specified staff changes and require:

1. Exact Alpha MCP compatibility fingerprint.
2. Canonical live object resolution with preview-query refusal.
3. Explicit person-to-asset mapping.
4. Supported component with exactly one match.
5. Fresh lease, ticket revision, semantic hash, and exact approval.
6. Snapshot, apply receipt, readback, cache evidence, and public desktop/mobile proof.
7. Automatic stop and owner handoff on any mismatch.

General queue rollout should wait for the P0 control-plane work.

## Permanent stress-test suite

The system should run four layers of tests on every release:

1. **Static conformance:** schemas, policy/prose parity, owner/source completeness, capability manifest, and version fingerprints.
2. **Clean-room decisions:** identical fixtures run in multiple model/harness combinations; route, stop, owner, and required evidence must match exactly.
3. **Staging mutation and chaos:** lease races, stale hashes, expired approvals, partial saves, uncertain writes, cache failures, rollback, dependency outage, and idempotent replay.
4. **Production canaries:** one narrowly allowlisted operation at a time with independent public verification.

Track:

- Contract-valid share of incoming Website Requests
- Execution-ready precision and recall
- Correct route/refusal rate
- Wrong-object, wrong-person, duplicate, and source-boundary violations: target zero
- Complete evidence rate: target 100%
- Straight-through completion rate by supported class
- Clarification messages per completed Request
- Median and p95 time to verified completion
- Recovery rate and time from transient failures
- Requests in dead-letter or unresolved checkpoint state

## Evidence references

- Production Alpha MCP health and read-only safety checks: September 17, 2026 test session.
- Hosted runs: [initial 500](https://github.com/trilogy-group/alpha-event-task-management/actions/runs/35266246396), [successful retry](https://github.com/trilogy-group/alpha-event-task-management/actions/runs/35266689543).
- Playbook validation: `npm test` and `npm run validate`, both passing on September 17, 2026.
- Repositories inspected at their then-current heads: `trilogy-group/alpha-website-playbook`, `trilogy-group/alpha-event-task-management`, and `trilogy-group/AlphawordpressMCP`.

## Retest exit criteria

The system earns general autonomous approval only when:

- Every supported class maps to a typed adapter or typed owner handoff.
- Unknown classes fail closed.
- Cross-harness fixtures produce identical deterministic decisions.
- Contract-invalid Requests cannot be execution-ready.
- Exact release fingerprint is enforced before claim or mutation.
- Compound Request state survives interruption and resumes correctly.
- Completion is impossible without the required public rendered evidence.
- Failure drills generate a recoverable state and a named owner.
- Least-privilege agent credentials cannot bypass the control plane.
- A staged multi-class pilot and narrowly allowlisted production pilot meet the published metrics with zero unsafe writes.
