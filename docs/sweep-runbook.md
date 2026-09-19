# Queue sweep runbook

How the website agent works the whole APEX website queue on a cadence (every two or three days, decision 2026-09-19), rather than ticket by ticket on request. The rules live in the playbook; the sweep is a fresh agent applying them; the humans review the run report and the For Review and Blocked queues.

## Preconditions

1. `node tests/check-release.mjs` prints `release attested` (plugin version and fingerprint match `spec/release-manifest.json`; policy bundle current). No writes otherwise.
2. `access_report` on the Alpha WordPress MCP reports the attested plugin version and operator mode.
3. Credentials in the marketingsupport `.env`: `APEX_API_TOKEN`, `ALPHA_WP_*`, `N8N_API_KEY` (read), `HUBSPOT_SERVICE_KEY` (read where scopes allow).

## Partition by page, run in parallel

The Alpha MCP refuses a write against a stale document hash, so two agents editing the same page cannot silently overwrite each other, but they would waste each other's work and the site-wide cache cooldown. Partition the sweep so no two agents hold the same campus page:

1. Run `agent/intake.mjs` dry over the open queue and group tickets by the campus page (`found.pageUrl`, then `url`, then the program's page from `registry/campus-pages.json`). Multi-page tickets (a removal across three campuses) go to one agent with all their pages.
2. Assign each group to one fresh agent; a group is one page or a few small pages, up to about eight tickets. Tickets with no page (mapping questions, sister sites, tooling) go to a routing-only agent that makes no WordPress writes.
3. Each agent uses its own run id (`sweep-<date>-<partition>`), so receipts and the report are separable.
4. One site cache flush per agent at the end of its writes, honoring `retryAfterSeconds` on a 429; the flush replays as a noop only inside the cooldown (plugin 0.5.5), so a second agent's flush after the window purges again.

## What every agent does with every ticket

Rules from `protocols/apex-website-ticket-protocol.md`, in order: intake (dry, then `--apply`), read the live rendered page, diagnose who writes the element (`spec/synced-targets.json`, `spec/campus-page-controls.json`), then one of four ends, each leaving the ticket with a named person:

- Execute with receipts (`apexTicketId`, `runId` on every call), rendered evidence on desktop and mobile, `page-check` including `edge-cache-current`, and Completed.
- Missing Info to the requester, listing exactly what is needed.
- Route to the owning system's person with the audit line (field, current value, new value, source); never touch WordPress for an n8n- or HubSpot-written element.
- Escalate to website operations (Matt Barge) as Blocked when the owner role has no registered person (protocol 1d).

An OPERATOR INSTRUCTION note on a ticket outranks the classifier (protocol 1c). A ticket whose done condition is already met on the rendered page closes on verification with the actor named from `list_revisions`.

## Defects found while working

The agent files them itself (decision 2026-09-19): `node agent/file-found-ticket.mjs <payload.json>` deduplicates against open tickets by idempotency key, title, and page plus check, creates the APEX Request, and assigns the class owner from the policy bundle (website operations when the role has no person). The payload shape is the one the batches produced: title, description (page, expected, observed, evidence, recommended path, done when), url, program, customFields with `source: agent-found`, `checkId`, `foundWhileWorking`, `idempotencyKey`, `ownerRole`. Tooling defects (Alpha MCP, playbook scripts) are not APEX website tickets; they go to the repo as issues or PRs and are named in the run report.

## The report

Each agent ends with `run-report.md`: per ticket the decision, class, receipts, evidence files, and one line on what the playbook did not tell it; then cross-cutting notes. The coordinator scores it against expectations fixed before the run (the four September batches in the marketingsupport workspace are the pattern), verifies independently (receipts by run id, live pages without cache-busting, ticket states), and turns every gap into a registry, recipe, check, or tool change the same day. The scored sheet plus the report is the review artifact.

## Not yet built (as of 2026-09-19)

- Slack notice for Missing Info and routed tickets (Hailey is building it in APEX); until then assignment alone tells nobody, and the coordinator sends the nudges.
- Automatic partitioning and launch of the parallel agents; today the coordinator partitions by hand.
