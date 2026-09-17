# APEX Website Ticket Protocol

Version 0.3, September 16, 2026. Applies to every APEX ticket whose request type is Website or Website QC, regardless of which agent or person executes it. Machine form of the intake rules: `spec/ticket-classes.json`. Validator: `tests/validate-ticket.mjs`.

The protocol has eight steps. A ticket is complete only when all eight are done and written down.

## 0. The ticket contract

Every ticket, whoever filed it, must carry: a claim, the page, the element, the observed value with the page's modified time, the expected value and its rule, the source that was read with field and read time (or an explicit "not read: reason"), the class, the defect class, the owner role and person, the fix path, the done condition, and evidence. Machine form: `spec/ticket-contract.json`. The validator's `--contract` mode enforces it.

A ticket that fails the contract goes back to its creator, not to a person: an observer ticket without a source field and read time means the observer check or its config is fixed; a form ticket without inputs gets the Missing Info template; an agent ticket that fails means the filer is fixed. Nobody works a ticket that does not say who owns it and how it ends.

The body is rendered from the contract (`tests/render-ticket.mjs`) and regenerated whenever the class or owner changes. History is one line per change. Prior bodies are never appended.

## 1. Classify and validate the ticket

Every ticket belongs to one class. The class decides the required inputs, the execution recipe, and the tests.

| Class | How to recognize it | Required before work starts |
| --- | --- | --- |
| staff-add | Website form, "Add a team member" | page URL, full name, public title, bio, headshot asset, placement or order, effective date, requester |
| staff-update | Website form, "Update a team member" | page URL, existing name, each field that changes with its new value, headshot asset if the photo changes |
| staff-remove | Website form, "Remove a team member" | page URL, existing name, effective date |
| program-info | Website form, "Update program info" | page URL, each fact that changes, current value, new value, and confirmation that the source of truth (HubSpot Programs or Operations) already holds the new value or that the requester owns it |
| copy | Website form, "Other", or observer copy findings | page URL, section, exact current text, exact replacement text, approver |
| media | Observer stale-media or image-identity findings, or form requests to change an image | page URL, slot, approved asset (registry entry or attachment id) and its owner |
| link-cta | Missing or wrong packet, apply, calendar, booking, community links | page URL, CTA, destination URL, proof the destination is reachable and campus-specific |
| fact-sync | Observer grade, tuition, phone, address, email, name, or coordinate mismatches | page URL, source system, source value, observed value; a ruling on which is right when the sources disagree |
| status | Publish, unpublish, restore a page | page URL, expected current status, target status, approver |
| event-sync | HubSpot event missing from site or wrong campus feed | out of scope for a page edit; route to the event owner |
| layout | Header overlap, overflow, clipped text, offscreen CTA | out of scope for the content MCP; route to the Elementor owner |
| map-community | Growth map rows or Community destinations | identify the surface first: WordPress CTA to `link-cta`; map destination to growth-map owner; Community record, slug, visibility, or router to community-app-owner |
| health | Observer or source health findings | not a website change; route to the observer owner |
| hubspot-data | A HubSpot Program or event field contradicts the requirement for the campus state (found by the loop or by step 1b) | page URL, element and CSS ID, source field, current source value with read time, expected value and the rule it comes from, owner |
| sheet-data | An onboarding-sheet Website Copy value is wrong | page URL, tab, key, current and expected value |
| sync-mapping | The source is right but the n8n derivation onto the page is wrong or missing | element, CSS ID, current derivation, proposed derivation, reason |
| sync-delivery | Source and mapping are right and the page is still stale after the 00:15 CT run | page URL, CSS ID, source value, page value, last run evidence |

Run the validator. If any required input is missing:

- set the ticket to Missing Info,
- write the Missing Info note using the template in step 7, naming every missing item and the owner who can supply it,
- do not guess at the missing parts. Parts of the ticket whose inputs are complete are still executed (see the rule below).

If the ticket is out of scope for a website edit, write a triage note naming the owner and leave the status unchanged.

### 1b. Pathway diagnosis: never edit before knowing who writes the element

Before any campus-page edit, and for every observer finding, look the element up in `spec/campus-page-field-map.json` (human form `playbook/campus-page/field-map.md`). The row says who writes it (n8n from HubSpot, n8n from the onboarding sheet, the events plugin, WordPress direct, or a shared template), which source field, and how the value is derived. Then:

1. Read the source live. HubSpot Programs is the source for campus state (`type`) and facts; the growth map API mirrors state, name, address, grade range, and links when the token lacks Programs scopes. Record the value and the read time on the ticket. A cached value never justifies a ticket on its own.
2. Compute the expected value from the requirement for the campus state.
3. Classify. Source wrong: `hubspot-data`, `sheet-data`, or `event-data`, owner the source's owner role. Source right and page stale after the run: `sync-delivery` or `event-sync`, owner n8n-sync-owner or events-plugin-owner. Source right, page equals source, requirement still violated: `sync-mapping`, owner n8n-sync-owner, decision by Matt, Yash, and the HubSpot owner. WordPress-direct element: the website class from step 1.
4. `node tests/diagnose-field.mjs --url <page> --element <key>` performs 1 to 3 and prints the ticket. File it with `tests/file-apex-ticket.mjs`, assigned to the owner role's person from `registry/people.json`, not to the website operators.

The website ticket that triggered the diagnosis is not closed by a WordPress edit when the element is automation-written. It stays open, linked to the source ticket, until the page shows the expected value after the next run.

**Community links cross three surfaces.** Before executing a Community-link request, separate the requested change into: the WordPress CTA, the HubSpot-backed map destination, and the Community program or router. A WordPress ticket may update only the CTA and only when the destination is supplied on the ticket or verified in `registry/campus-identities.json`. A map defect routes to the growth-map owner. A Community ID, slug, visibility, or router defect routes to `community-app-owner`. Use separate linked tickets when more than one surface must change. Never infer a Community slug from the campus name or modify the Community app as a side effect of a WordPress ticket.

**Who to name.** `spec/responsibilities.json` maps every class to the role that supplies missing inputs, the role that approves, and the role that executes. Campus roles (Director of Admissions, Dean of Parents) resolve live: `node tests/resolve-campus-roles.mjs --campus <slug> --role <role>` reads the Admissions Hub and attaches the HubSpot email; `registry/campus-roles-snapshot.json` is the fallback when the hub is down and is stale after seven days. `registry/people.json` names the person for department roles. `spec/responsibilities.json` `registryByTicketClass` lists what each class needs on hand and where Missing Info goes when the campus role is vacant. Missing Info notes and triage notes name the person, not the department.

**Do as much good as the ticket allows.** When a ticket has several parts and only some inputs are missing, execute the parts that are complete, test them, and send the ticket back for the rest. Never leave a fixable defect on the page because a different part of the same ticket is blocked. Example: a launch-copy ticket whose approved card is missing still gets its sentence fixed; the ticket then goes to Missing Info for the card, with the resolution block listing the sentence as done. The ticket is never marked Completed while any part is open.

## 2. Claim

Set the ticket to In Progress with a note naming the actor, the date, and the playbook version. Claim the ticket through `POST /api/agent/tasks/{id}/claim` and record the execution, revision, lease, and expiration. One actor per ticket at a time. A lease conflict, changed revision, or unresolved prior execution stops a new mutation. Renew an active lease through the execution heartbeat and release it when work stops. Full procedure: `protocols/production-and-staging.md`.

Anyone who changes a page, for any reason, updates the ticket for that page the same day, including partial work. Every MCP write is also stored as a receipt in WordPress; `list_receipts` by ticket id is the audit when a ticket note is missing.

## 3. Reconcile before editing

Read the live page first, rendered, not the source. Compare the full ticket scope against what the page shows now, not only the element the ticket names. "Shows" means a parent can see it: run `node tests/rendered-controls.mjs --url <page>` (desktop and mobile, reports every control as visible or hidden with the reason) or take the ring 2 screenshots. A string in the HTML, a link in the source, or `verified_pass` from the MCP proves presence in the document, not visibility; an Elementor widget hidden on every breakpoint passes all three. Never close a ticket as already correct on a source check (decision 2026-09-17, after the Oklahoma City and Tulsa Book a Call misses). Record what is already correct, what is still wrong, and anything else on the page that violates the playbook. Partial prior work is common; the ticket must end in the true state of the page.

## 4. Execute

Use the recipe for the class (`protocols/recipes/`). Confirm the actor supports the operation in `spec/actor-capabilities.json`. Supported alpha.school edits go through the Alpha WordPress MCP: resolve the page, read the stored element with `get_element` (never infer settings from the public HTML), find the exact field, prepare without writing, check the prepared diff touches only the intended field, apply, regenerate the page's CSS, clear cache, verify. Structure (clone, remove, move, tag, repeater items), media library, post fields including noindex and canonical, redirects, scheduled status, popups, template drafts, and batches have their own tools since plugin 0.5.0 (`playbook/integrations/wordpress-elementor-alpha-mcp.md`). Keep the prepare-time snapshot reference; it is the rollback. Tool availability does not imply the scheduled APEX agent is integrated for that operation. Unsupported work routes to its owner without browser fallback.

Choose the environment through `protocols/production-and-staging.md`. Recover through `protocols/rollback-and-incidents.md`.

Refuse and send back rather than guess when: the target field cannot be found exactly once; the replacement text or asset is not specified or not approved; the change would touch claims, pricing, admissions, legal text, or campus-opening facts without the named owner's approval; the page structure is not one the recipe supports.

## 5. Test in three rings

All three rings run on the canonical public URL after cache clearing. Screenshots are taken in the agent's browser and attached according to `protocols/evidence-and-screenshots.md`.

**Ring 1, the change.** The requested content is present, the old content is absent, exactly one field changed.

**Ring 2, the whole page.** Mandatory for every closure, including no-change closures. On desktop and mobile:

- Header renders with logo and navigation styled; footer renders.
- Hero title, subtitle, and CTA row present.
- Intro section: heading, status sentence, and intro card slot correct for the campus state.
- No launch-era words or images on an Open campus; no sister-brand words; no other campus's name in images, alt text, links, or schema.
- Every CTA and resource link resolves to a reachable, campus-specific destination.
- Staff cards render without clipped faces; events strip shows only this campus's events.
- The page's own observer assertions pass (`registry/observer-checks.json`).
- Screenshot of the top of the page and of the changed section, inspected by the actor.

**Ring 3, shared templates.** After any site-wide action (cache clear, CSS regeneration, header or footer edit, plugin change), re-verify ring 2's header and footer checks on two untouched pages. This is what catches a cached render that lost its stylesheet.

Any ring 2 or ring 3 failure caused by the change is a mandatory rollback (step 6). A ring 2 failure not caused by the change is a new finding: file its own ticket (step 8) and reference it on the current ticket; do not fold it into this one and do not fix it under this ticket.

## 6. Rollback

Restore from the prepare-time snapshot through the MCP, re-run rings 1 to 3 to confirm the page is back to its prior state, write what happened on the ticket, and set the ticket to Blocked with the cause. Then fix the cause (tool, recipe, or requirement) before retrying.

## 7. Document, communicate, close

**Done means survived.** For any element the field map marks as automation-written (n8n, the events plugin), the ticket closes only after the public page shows the expected value following the next run of that automation, and the observer rerun clears the check. Same-day verification after a WordPress edit is ring 1, not closure. The class's `doneWhen` in `spec/ticket-classes.json` is the closing test.


Write to the ticket, in this order, so a reviewer can read the outcome in ten seconds:

```
RESOLUTION (actor, date, playbook version)
Page: <canonical URL> (object <id>)
Change: "<before>" -> "<after>" in <section / field>
Evidence: before hash, after hash, snapshot ref, screenshot links
Tests: ring 1 pass; ring 2 pass (desktop, mobile); ring 3 pass (<two pages>)
Observer: <check ids> cleared on run <id>   (observer tickets only)
```

Then set Completed. If any item cannot be written, the ticket is not complete.

Missing Info template:

```
MISSING INFO (actor, date)
This ticket needs the following before it can be executed:
1. <item> (owner: <name>)
2. <item> (owner: <name>)
What is already correct on the page: <list or "nothing checked yet">
The agent will execute and verify as soon as the items above are on the ticket.
```

Slack: post only to close the loop with the original requester, or when a ring failure affects visitors. Use the requester's channel or `#support-websites`. No em dashes, owner first, one sentence on what happened, one on what is needed.

### Ticket templates for source-side classes

hubspot-data:

```
HubSpot data: <Campus> <element> contradicts state <type>
Page: <url>
Element: <field-map key> (CSS ID <id>; writer n8n from HubSpot)
Campus state: <type> (source and read time)
Page shows (modified <time>): "<page value>"
Source: HubSpot Programs <field> = "<value>" (read <time>)   or: not read directly, <reason>
Expected: "<value>" (<requirement rule>)
Derivation today: <from the field map>
Defect class: data. <reason>
Fix path: change <field> for <Campus> through the APEX campus Program editor (approver <role>); n8n publishes at 00:15 CT; the website agent verifies after the run.
Done when: the public page shows the expected value after the next run (tests/page-check.mjs).
Playbook: spec/campus-page-field-map.json <key>; protocol step 1b.
```

sync-mapping:

```
Website mapping: derive <element> from <state field>
Element: <key> (CSS ID <id>)
Current derivation: <from the field map>
Proposed derivation: <rule>, so the source can no longer contradict the state
Reason: <the incident, with pages and dates>
Owner: n8n-sync-owner; decision: Matt Barge, Yash Chitneni, HubSpot owner; recorded in docs/decisions.md
Done when: two campuses render correctly after a run with the new rule, and the field map and synced-targets spec are updated.
```

## 8. New issues found while working

Anything wrong on the page that is outside the current ticket's scope gets its own APEX ticket, filed before the current ticket closes. This keeps every ticket to one verifiable change and keeps the queue honest about what the site needs.

File it through the APEX API, the same way the observer does, so it lands in the same queue with the same fields:

```
POST https://apex.2hourlearning.com/api/v1/tasks
Authorization: Bearer <APEX_API_TOKEN>
Idempotency-Key: agent-found:<parent ticket id>:<page slug>:<check id>
```

Payload (all fields required unless marked optional):

| Field | Value |
| --- | --- |
| title | `<Campus or page>: <one-line defect>` in the observer's style, for example `Alpha Tulsa: info packet link returns 401` |
| description | Lines: summary; `Page: <url>`; blank; `Expected: <value>`; `Observed: <value>`; `Evidence: <how it was seen>`; `Found while working: <parent ticket id>`; `Playbook: <requirement id>`; `Recommended path: <recipe or owner>`; `Done when: <ring 1 condition>` |
| url | the page URL |
| requestType | `Website QC` for defects, `Website` for requested changes |
| workflow | `website-maintenance` |
| program | `["Alpha <Campus>"]` or `["Alpha School"]` |
| requesterEmail | the actor's email |
| status | `NOT_STARTED` |
| priority | `NORMAL`, or `HIGH` when visitors see a broken page or a wrong fact |
| customFields | `source: agent-found`, `foundWhileWorking: <parent id>`, `checkId: <playbook requirement id>`, `severity`, `owners`, `idempotencyKey` |

The helper `tests/file-apex-ticket.mjs` builds and validates this payload and runs dry by default; pass `--create` to file it. After filing, add one line to the parent ticket: `Filed <new id> for <defect> found during this work.`

Do not file a new ticket for something the observer already has open on the same page and check; link the existing one instead. Search the active queue with `node tests/search-apex-tickets.mjs --url <canonical> --check <requirement-id>` and add `--text <person-or-value>` when the page can carry several similar findings.

## What this protocol changes from before

- The whole page is tested, not only the ticketed element, and two untouched pages are checked after any site-wide action.
- Visual inspection by screenshot is required. Text checks alone never close a ticket.
- Tickets are validated before work starts, and incomplete tickets go back with a specific ask instead of partial work.
- The page is reconciled against the full ticket scope before editing, so prior partial work is finished rather than missed.
- Tickets with a blocked part still get their fixable parts done, and stay open for the rest.
- New defects found during a ticket become their own tickets, filed the same way the observer files them.
