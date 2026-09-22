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

- Execute with receipts (`apexTicketId`, `runId` on every call), rendered evidence on desktop and mobile attached to the ticket (`agent/attach-evidence.mjs --section` on the `tests/section-shot.mjs` crop of the element Look for names, then the same tool on the `rendered-controls.mjs --screenshots` full-page files, same `runId`), `page-check` including `edge-cache-current` and, for staff changes, `team-photo-framing` passing for the card (run with `--playwright <dir>`; a skipped check is not a pass), and Completed.
- Missing Info to the requester, listing exactly what is needed.
- Route to the owning system's person with the audit line (field, current value, new value, source); never touch WordPress for an n8n- or HubSpot-written element.
- Escalate to website operations (Matt Barge) as Blocked when the owner role has no registered person (protocol 1d).

An OPERATOR INSTRUCTION note on a ticket outranks the classifier (protocol 1c). A ticket whose done condition is already met on the rendered page closes on verification with the actor named from `list_revisions`.

## HubSpot Program fields: the agent writes them, with an audit line

Since 2026-09-22 the website agent reads and writes HubSpot Programs (object 2-43470849) directly through the Marketing Syncing private app (`HUBSPOT_MARKETING_SYNCING_TOKEN` in the marketingsupport `.env`; 151 properties readable). The APEX campus editor and the hosted `campus-intro` route are no longer the only write path. Rules:

- Read first, always: the audit line on the ticket names field, before, after, actor, time, and the ticket ids; the same line goes to `work-assets/apex-website-tickets/hubspot-program-writes-<date>.jsonl` in marketingsupport.
- `website_campus_intro` keeps the `[DISPLAY_NAME]` placeholder and the second paragraph; only the status sentence changes. Open campus: "[DISPLAY_NAME] is open and enrolling."; Announced with a confirmed date: "[DISPLAY_NAME] is opening <Month Year>."; a requester's sentence only with the brand rules applied (no em dash).
- `type` (Pre-Announcement, Announced, Open) changes only on an explicit decision recorded on the ticket (Jamaica Plain, Matt, 2026-09-22): it moves the map pin, community routing, and the page template.
- `wordpress_post_id` is set only after the synced fields are compared with the page (the workflow skips empty values; a filled wrong value overwrites the page nightly).
- Never change `display_name`, `admission_link`, tuition, or address without the owning person's decision (Farhan, Cory, Rachel) on the ticket.
- Nothing publishes until the nightly run (00:15 CT); the ticket stays In Progress until the page is verified the next morning with a section capture.

## Open campus with launch words: fix, do not park

An Open campus page showing launch copy ("is launching in Fall 2026", "Coming Fall 2026") is the most damaging copy defect on the site (decision 2026-09-22). The element is n8n-written from the HubSpot Program, so the fix is the Program field, never WordPress. Rule: the finding is filed HIGH, it goes to the website-agent-operator with the requirement sentence pre-filled ("Alpha <Campus> is open and enrolling.") and the APEX campus editor path, it is listed at the top of every sweep report until the page is clean after a nightly run, and it never sits in Blocked waiting on a scope or a decision. The reviewer's note on any other ticket for that page names it on the "Also open on this page" line.

## Defects found while working

The agent files them itself (decision 2026-09-19): `node agent/file-found-ticket.mjs <payload.json>` deduplicates against open tickets by idempotency key, title, and page plus check, creates the APEX Request, and assigns the class owner from the policy bundle (website operations when the role has no person). The payload shape is the one the batches produced: title, description (page, expected, observed, evidence, recommended path, done when), url, program, customFields with `source: agent-found`, `checkId`, `foundWhileWorking`, `idempotencyKey`, `ownerRole`. Tooling defects (Alpha MCP, playbook scripts) are not APEX website tickets; they go to the repo as issues or PRs and are named in the run report.

## Status means one thing

Decided 2026-09-22 after Matt's first review pass found plan-only and waiting tickets parked in For Review:

- **For Review**: the work is done and verified, and the reviewer's click completes it. Nothing else goes here. A ticket that also needs a yes-or-no from the reviewer may stay only when that answer is the last step (the note says "Complete after <one question>").
- **Missing Info**: waiting on the requester, with the exact ask; assigned to the requester (the coordinator relays when the requester has no APEX user).
- **Blocked**: waiting on anyone else (a decision, another system's owner, a packet, a deploy); assigned to that person, with "DECISION NEEDED" in the note when it is a decision. Reviewer decisions live here, filtered by assignee, not in For Review.
- **In Progress**: a person or agent is executing now, or a published source change is waiting for its nightly run.

A plan the reviewer must approve before execution is Blocked on the reviewer, not For Review.

## The review

The reviewer works from APEX, not from a dashboard: the For Review queue filtered to website requests (`/intake?status=FOR_REVIEW&requestType=Website`), one ticket at a time. Each agent-closed ticket carries the page in its URL field (set by intake when the requester left it empty, or by the agent), its screenshots in the panel's Evidence section directly under that field, and a RESOLUTION note whose first three lines are Go here, Look for, Recommend (protocol section 7). The Evidence section shows one card per run: the section crops first, at a legible size, each labelled with the element it shows ("events strip", "team carousel: Isabella Cofresi card"), its viewport, and its capture time; then the full-page desktop and mobile pair as context; the card names the page, run id, and who attached it, and every thumbnail opens full size. The reviewer reads the three lines, looks at the section crop for the thing Look for names, clicks the URL only when the crop leaves a doubt, and completes or sends back. Send back, without looking further, when: there is no Evidence section (the rendered result was never attached); there is only a full-page pair and no section crop (the reviewer would have to hunt inside a thumbnail, which is what failed on the Park City events ticket, 2026-09-22); the section crop does not show what Look for names (wrong element, images grey, the card cut off); or, on a staff change, the section crop is not the card itself or the card shows a cut head (the top of the head, or the chin, outside the frame): the photo was bound unframed (Jason Tan, San Francisco, 2026-09-22), and the ticket goes back to the operator to frame and rebind (`docs/headshot-binding.md`). A staff RESOLUTION note without `team-photo-framing pass (desktop, mobile)` on its Tests line is sent back the same way. The readiness card above the URL field reads "Awaiting review" on a For Review ticket; its intake checks are history, not a claim that the work is still to be done. Anything that needs more than that from the reviewer is the agent's gap to fix in the note, not the reviewer's job to dig for.

## The report

Each agent ends with `run-report.md`: per ticket the decision, class, receipts, evidence files, and one line on what the playbook did not tell it; then cross-cutting notes. The coordinator scores it against expectations fixed before the run (the four September batches in the marketingsupport workspace are the pattern), verifies independently (receipts by run id, live pages without cache-busting, ticket states), and turns every gap into a registry, recipe, check, or tool change the same day. The scored sheet plus the report is the review artifact.

## Operator step before a sweep: bind linked headshots

Tickets whose photo is a Drive, Slides, or Slack link stay Missing Info until the website operator reviews the file and binds it with `agent/bind-headshot.mjs` (`docs/headshot-binding.md`). Frame first: `agent/frame-headshot.mjs --ratio auto --page <canonical URL>` crops the reviewed file to the page's card ratio and writes a preview to look at; bind the framed file with the tool's "framed to" line in `--review-note`. Do that before partitioning so the sweep agents find a normal, framed APEX asset on the ticket; the agents never fetch links and never crop.

## Operator step for a roster ticket: run the roster diff

For a ticket that points at a campus deck (class `staff-bulk`, or several staff tickets for one campus), run `node agent/roster-diff.mjs --campus <slug> --live <get_page result> --out <run folder> --images-dir <run folder>/deck-photos` before partitioning. It is read only: it compares the registered deck with the live Team section and writes a For Review plan of adds, removes, title, bio, and photo differences, with a proposed binding per add and photo change. The plan is source material: the ticket still decides what changes, the operator still reviews and binds each photo, and the sweep agents still execute one staff-card recipe per person. A typed error (unregistered deck, deck not exportable, slide without a name, ambiguous name match) means fix the deck or the registry first; never work around it by hand-editing the plan.

## Not yet built (as of 2026-09-21)

- Slack notice for Missing Info and routed tickets (Hailey is building it in APEX); until then assignment alone tells nobody, and the coordinator sends the nudges.
- Automatic partitioning and launch of the parallel agents; today the coordinator partitions by hand.
- The APEX agent-API completion gate (`POST /tasks/{id}/status COMPLETED` answers 409 "Successful public verification evidence for this agent run is required") reads a hosted execution checkpoint that playbook agents do not write, and `/release` rejects the operator key. Until APEX documents the checkpoint and release calls for playbook agents (asked of Hailey 2026-09-21), an agent that has receipts and rendered evidence sets For Review with a RESOLUTION note and the coordinator marks Completed through the v1 task API after reviewing the run folder.
- Slack file access for bindings, a Google Slides API reader (the roster diff uses pptx export order for slide and image ids), a sheet reader for roster sheets, and order or placement in roster plans, which waits on the team-layout standard (`docs/headshot-binding.md`).
