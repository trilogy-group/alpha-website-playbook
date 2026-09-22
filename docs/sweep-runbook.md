# Queue sweep runbook

How the website agent works the whole APEX website queue on a cadence (every two or three days, decision 2026-09-19), rather than ticket by ticket on request. The rules live in the playbook; the sweep is a fresh agent applying them; the humans review the run report and the For Review and Blocked queues.

## Preconditions

1. `node tests/check-release.mjs` prints `release attested` (plugin version and fingerprint match `spec/release-manifest.json`; policy bundle current). No writes otherwise.
2. `access_report` on the Alpha WordPress MCP reports the attested plugin version and operator mode.
3. Credentials in the marketingsupport `.env`: `APEX_API_TOKEN`, `ALPHA_WP_*`, `N8N_API_KEY` (read), `HUBSPOT_SERVICE_KEY` (read where scopes allow).

## Partition by page, run in parallel

The Alpha MCP refuses a write against a stale document hash, so two agents editing the same page cannot silently overwrite each other, but they would waste each other's work and the site-wide cache cooldown. Partition the sweep so no two agents hold the same campus page:

1. Run `agent/intake.mjs` dry over the open queue and group tickets by the campus page; each partition agent then runs intake with `--ticket id,id` (or `--page <url>`) so it administers only its own tickets (`found.pageUrl`, then `url`, then the program's page from `registry/campus-pages.json`). Multi-page tickets (a removal across three campuses) go to one agent with all their pages.
2. Assign each group to one fresh agent; a group is one page or a few small pages, up to about eight tickets. Tickets with no page (mapping questions, sister sites, tooling) go to a routing-only agent that makes no WordPress writes.
3. Each agent uses its own run id (`sweep-<date>-<partition>`), so receipts and the report are separable.
4. One site cache flush per agent at the end of its writes, honoring `retryAfterSeconds` on a 429; the flush replays as a noop only inside the cooldown (plugin 0.5.5), so a second agent's flush after the window purges again.

## What every agent does with every ticket

Rules from `protocols/apex-website-ticket-protocol.md`, in order: intake (dry, then `--apply`), read the live rendered page, diagnose who writes the element (`spec/synced-targets.json`, `spec/campus-page-controls.json`), then one of four ends, each leaving the ticket with a named person:

- Execute with receipts (`apexTicketId`, `runId` on every call), rendered evidence on desktop and mobile attached to the ticket (`agent/attach-evidence.mjs` on the `rendered-controls.mjs --screenshots` files, same `runId`), `page-check` including `edge-cache-current`, and Completed.
- Missing Info to the requester, listing exactly what is needed.
- Route to the owning system's person with the audit line (field, current value, new value, source); never touch WordPress for an n8n- or HubSpot-written element.
- Escalate to website operations (Matt Barge) as Blocked when the owner role has no registered person (protocol 1d).

An OPERATOR INSTRUCTION note on a ticket outranks the classifier (protocol 1c). A ticket whose done condition is already met on the rendered page closes on verification with the actor named from `list_revisions`.

## Defects found while working

The agent files them itself (decision 2026-09-19): `node agent/file-found-ticket.mjs <payload.json>` deduplicates against open tickets by idempotency key, title, and page plus check, creates the APEX Request, and assigns the class owner from the policy bundle (website operations when the role has no person). The payload shape is the one the batches produced: title, description (page, expected, observed, evidence, recommended path, done when), url, program, customFields with `source: agent-found`, `checkId`, `foundWhileWorking`, `idempotencyKey`, `ownerRole`. Tooling defects (Alpha MCP, playbook scripts) are not APEX website tickets; they go to the repo as issues or PRs and are named in the run report.

## The review

The reviewer works from APEX, not from a dashboard: the For Review queue filtered to website requests (`/intake?status=FOR_REVIEW&requestType=Website`), one ticket at a time. Each agent-closed ticket carries the page in its URL field (set by intake when the requester left it empty, or by the agent), its desktop and mobile screenshots in the panel's Evidence section directly under that field (attached by `agent/attach-evidence.mjs`; each card names the page, capture time, run id, and who attached it, and the thumbnails open full size), and a RESOLUTION note whose first three lines are Go here, Look for, Recommend (protocol section 7). The reviewer reads the three lines, looks at the two screenshots for the thing Look for names, clicks the URL only when the screenshots leave a doubt, and completes or sends back. A ticket with no Evidence section is not ready for review: send it back to the agent, because the rendered result was never attached. Anything that needs more than that from the reviewer is the agent's gap to fix in the note, not the reviewer's job to dig for.

## The report

Each agent ends with `run-report.md`: per ticket the decision, class, receipts, evidence files, and one line on what the playbook did not tell it; then cross-cutting notes. The coordinator scores it against expectations fixed before the run (the four September batches in the marketingsupport workspace are the pattern), verifies independently (receipts by run id, live pages without cache-busting, ticket states), and turns every gap into a registry, recipe, check, or tool change the same day. The scored sheet plus the report is the review artifact.

## Operator step before a sweep: bind linked headshots

Tickets whose photo is a Drive, Slides, or Slack link stay Missing Info until the website operator reviews the file and binds it with `agent/bind-headshot.mjs` (`docs/headshot-binding.md`). Do that before partitioning so the sweep agents find a normal APEX asset on the ticket; the agents never fetch links.

## Operator step for a roster ticket: run the roster diff

For a ticket that points at a campus deck (class `staff-bulk`, or several staff tickets for one campus), run `node agent/roster-diff.mjs --campus <slug> --live <get_page result> --out <run folder> --images-dir <run folder>/deck-photos` before partitioning. It is read only: it compares the registered deck with the live Team section and writes a For Review plan of adds, removes, title, bio, and photo differences, with a proposed binding per add and photo change. The plan is source material: the ticket still decides what changes, the operator still reviews and binds each photo, and the sweep agents still execute one staff-card recipe per person. A typed error (unregistered deck, deck not exportable, slide without a name, ambiguous name match) means fix the deck or the registry first; never work around it by hand-editing the plan.

## Not yet built (as of 2026-09-21)

- Slack notice for Missing Info and routed tickets (Hailey is building it in APEX); until then assignment alone tells nobody, and the coordinator sends the nudges.
- Automatic partitioning and launch of the parallel agents; today the coordinator partitions by hand.
- The APEX agent-API completion gate (`POST /tasks/{id}/status COMPLETED` answers 409 "Successful public verification evidence for this agent run is required") reads a hosted execution checkpoint that playbook agents do not write, and `/release` rejects the operator key. Until APEX documents the checkpoint and release calls for playbook agents (asked of Hailey 2026-09-21), an agent that has receipts and rendered evidence sets For Review with a RESOLUTION note and the coordinator marks Completed through the v1 task API after reviewing the run folder.
- Slack file access for bindings, a Google Slides API reader (the roster diff uses pptx export order for slide and image ids), a sheet reader for roster sheets, and order or placement in roster plans, which waits on the team-layout standard (`docs/headshot-binding.md`).
