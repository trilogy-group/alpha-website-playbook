# Autonomy readiness: what the two September 17 assessments got right, what changed the same day, and what is still missing

Two independent reviews ran on September 17, 2026: a fresh-agent survey ("could I run website tickets with the existing system") and the stress test (`docs/stress-test-2026-09-17-website-agent-system.md`, 48/100 whole-system, 32/100 general autonomous readiness). Both ran against plugin 0.3.3. This note reconciles them with the state at the end of the day and names the pillars that are still missing.

## Already true by end of day (both reviews predate it)

| Finding | Status now |
| --- | --- |
| Production ran 0.3.3; every 0.5 tool returned no route | Plugin 0.5.0 is live (health attests it; 43 abilities). |
| Source verification passed a CTA hidden on every breakpoint | 0.5.0 `verify_public_page` fails `hidden_everywhere`; the three Book a Call tickets were rerun and closed on rendered evidence; `tests/rendered-controls.mjs` and page-check `cta-hidden-everywhere` exist. |
| No stored receipts, no kill switch, guard only in the bridge | Receipts persist in WordPress (`list_receipts`); per-ability kill switch and rate limits; synced-target guard enforced server-side with 24 ids seeded from `spec/synced-targets.json`; campus template id configured. |
| Structure, media library, redirects, status scheduling, template drafts, batches "unsupported" | Implemented for the operator path (`playbook/integrations/wordpress-elementor-alpha-mcp.md`). The scheduled APEX route is still not established for them. |
| Book a Call writer contradiction | Recorded as unverified in `spec/campus-page-controls.json`; sync-mapping ticket to Cristi open. |
| "The bridge advertises 49 tools" | It advertises 43. |

## Still true, and the honest list

1. **APEX readiness semantics.** `agentEligible` mixes "belongs in the agent queue" with "safe to execute now". 210 of 293 Requests were classed ready while contract-invalid. Owner: Hailey (APEX). This is the single largest defect; nothing downstream is safe while it stands.
2. **No executable policy.** The playbook is prose plus specs; the intake agent reads some specs; the hosted worker embeds its own copies. Two harnesses can decide differently. Owner: playbook (compile one policy bundle) and APEX (consume it).
3. **No public agent contract.** Claim, lease, heartbeat, checkpoint, evidence, close exist in APEX code but are not published; the playbook PATCHes descriptions as a workaround. Owner: Hailey.
4. **No release attestation.** The bridge, plugin, playbook, and worker can disagree without blocking. The plugin now reports its version, ability list, and configuration in health; nothing yet refuses a claim on mismatch. Owner: MCP (fingerprint in health, done in part) and APEX (enforce).
5. **No step graph for compound Requests.** HubSpot change, nightly sync, then WordPress verification is one ticket with hand-written notes. Owner: APEX.
6. **Adapters exist for WordPress only.** HubSpot, n8n, packets, events, Community, forms, and human handoff are routing rules, not typed adapters. HubSpot reads still lack scopes. Owner: APEX plus Hailey for scopes.
7. **Rendered evidence is a rule, not a gate.** The intake agent and protocol require it; APEX does not refuse a close without it. Owner: APEX.
8. **No staging.** WP Engine basic auth blocks application passwords, so no risky recipe can be rehearsed. Every 0.5.0 write is tested against an in-memory stub and then production. Owner: WP Engine admin (Yash or Dmitry).
9. **Owners and sources.** Seven owner roles unnamed; no staff roster source; Operations sheet has no owner or access path; packet approval unknown; 31 people without emails. Owner: Matt and Yash.
10. **Decisions.** Seven Proposed decisions block real tickets (grade property, Greenwich, launch date, packets, McLean, NYC photos, intro sentence). Owner: Matt, Yash, Farhan.

## Pillars missing from the control-plane list

The control-plane list (executable policy, readiness gates, agent interface, attestation, step graph, adapters, verification gate, recovery, least privilege) is right. Four things sit outside it and will bite regardless:

- **A place to rehearse.** Without staging, canaries are the test. That caps how fast any capability can be promoted. This is an infrastructure ask, not code.
- **A decision cadence.** Blocked tickets outnumber executable ones because decisions sit in a Proposed table with no owner or date. A weekly fifteen-minute decision review with Matt, Yash, and Farhan would clear more of the queue than any tool.
- **Cross-harness fixtures.** The stress test proposes clean-room decisions across models; the playbook has no fixture set that asserts route, stop, owner, and evidence profile for a ticket. Until it exists, "two agents decide the same" cannot be checked.
- **Telemetry.** There is no place to see how many tickets went through, how many were refused and why, or how long completion takes. The receipts store is the first data source; nothing reads it yet.

## Order of work and who does it

1. APEX: split readiness into structured fields; refuse execution-ready for contract-invalid Requests. (Hailey; the playbook validator can be the reference implementation.)
2. Playbook: compile ticket classes, source ownership, capabilities, owners, evidence profiles, and stop conditions into one versioned policy bundle with fixtures; make the intake agent and the hosted worker consume it. (Website agent.)
3. APEX: publish the agent contract and a small client. (Hailey.)
4. MCP and APEX: attestation. Health already reports version and abilities; add a schema fingerprint and make the runner refuse on mismatch. (Website agent for the MCP half.)
5. APEX: rendered evidence as a closure gate; step graph; adapters. (Hailey with the playbook's adapter definitions.)
6. Infrastructure: staging with an app-password path. (Yash or Dmitry.)
7. People: owners, roster, decisions. (Matt, Yash.)

Until 1 through 4 land, the operating rule from the stress test stands: scheduled execution only for an explicit allowlist of fully specified staff Requests; the website agent in operator mode keeps working the queue ticket by ticket with rendered evidence and receipts, which is what happened today.
