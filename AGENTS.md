# Agent Entry: Alpha Website Playbook

You are working with the source of truth for alpha.school page requirements and the APEX website ticket protocol.

Read in this order: `README.md`, `playbook/00-how-to-use.md`, then the part you need: `playbook/` for what a page must be, `protocols/` for how to execute and test a ticket, `spec/` for the machine-readable rules, `registry/` for approved assets, exemplars, owners, and sources. `playbook/foundation/` states purpose, audience, and who controls content, design, and functionality; when a request conflicts with a requirement, apply the decision rule in `playbook/foundation/website-charter.md` section 8.

Rules:

- Never invent a requirement, a copy line, or an asset. If the playbook and registry do not have it, the correct action is to record what is missing and who owns it.
- If prose and spec disagree, stop and report the disagreement; do not pick one.
- A ticket is done only when the ticketed change, the whole page, and any shared template are verified with evidence, per `protocols/`.
- Changes to this repo go through a pull request approved by a code owner.

## Intake agent

`agent/intake.mjs` is the scheduled APEX intake administrator (see `tests/README.md`). It reads only the compiled policy bundle, then classifies, checks policy and input ownership, requests typed requester clarification, and routes to an exact domain owner or the shared website-agent-operator pool. It re-evaluates the same ticket after a requester revision. It never edits WordPress, HubSpot, n8n, or another delivery system.

When a ticket goes to Missing Info or Blocked, the requester is told by Slack DM through `agent/notify-requester.mjs` (dry run first; rules and once-only ledger in `agent/requester-notice-policy.mjs`; protocol section 7, "Requester notices"). APEX does not send that notice. A notice goes to the reviewer first (`--review`; `spec/requester-notices.json`), who reacts ✅ to send or ❌ to hold; `agent/notice-review-poll.mjs --once --send` performs the approved sends. An agent never reacts on a review DM. Blocked and Missing Info have a clock: `agent/queue-aging.mjs` (protocol 1e) nudges the named person after three idle days, escalates to the website agent operator after seven, and lists class gaps (`needs-rule`, `internal-triage`) daily; it never closes a ticket.

Any agent taking an APEX website ticket by hand follows the same steps: protocol step 0 (contract), step 1 (class and inputs), and step 1b (pathway and owner). Ask requesters only for requester-owned facts. Derive canonical URLs and source-owned values from the registries and authoritative systems. An unregistered or ambiguous owner fails closed on execution, never on ownership: the route stays as the policy decided it and the ticket is Blocked on the website agent operator pool (Matt Barge or Yash Chitneni) with the role, the system, and the change named (protocol 1d; intake does this itself). Never re-route work to Matt or Yash merely because no rule matched. Only ticket classes in the release manifest's scheduled Alpha MCP allowlist may enter the execution queue.
