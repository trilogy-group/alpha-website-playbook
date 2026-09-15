# APEX Website Ticket Protocol

Version 0.2, September 15, 2026. Applies to every APEX ticket whose request type is Website or Website QC, regardless of which agent or person executes it. Machine form of the intake rules: `spec/ticket-classes.json`. Validator: `tests/validate-ticket.mjs`.

The protocol has eight steps. A ticket is complete only when all eight are done and written down.

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
| map-community | Growth map rows, community URLs | out of scope for the website; route to Operations or the map owner |
| health | Observer or source health findings | not a website change; route to the observer owner |

Run the validator. If any required input is missing:

- set the ticket to Missing Info,
- write the Missing Info note using the template in step 7, naming every missing item and the owner who can supply it,
- do not guess at the missing parts. Parts of the ticket whose inputs are complete are still executed (see the rule below).

If the ticket is out of scope for a website edit, write a triage note naming the owner and leave the status unchanged.

**Do as much good as the ticket allows.** When a ticket has several parts and only some inputs are missing, execute the parts that are complete, test them, and send the ticket back for the rest. Never leave a fixable defect on the page because a different part of the same ticket is blocked. Example: a launch-copy ticket whose approved card is missing still gets its sentence fixed; the ticket then goes to Missing Info for the card, with the resolution block listing the sentence as done. The ticket is never marked Completed while any part is open.

## 2. Claim

Set the ticket to In Progress with a note naming the actor, the date, and the playbook version. One actor per ticket at a time. Anyone who changes a page, for any reason, updates the ticket for that page the same day, including partial work.

## 3. Reconcile before editing

Read the live page first. Compare the full ticket scope against what the page shows now, not only the element the ticket names. Record what is already correct, what is still wrong, and anything else on the page that violates the playbook. Partial prior work is common; the ticket must end in the true state of the page.

## 4. Execute

Use the recipe for the class (`protocols/recipes/`). All alpha.school edits go through the Alpha WordPress MCP: resolve the page, find the exact field, prepare without writing, check the prepared diff touches only the intended field, apply, regenerate the page's CSS, clear cache, verify. Keep the prepare-time snapshot reference; it is the rollback.

Refuse and send back rather than guess when: the target field cannot be found exactly once; the replacement text or asset is not specified or not approved; the change would touch claims, pricing, admissions, legal text, or campus-opening facts without the named owner's approval; the page structure is not one the recipe supports.

## 5. Test in three rings

All three rings run on the canonical public URL after cache clearing. Screenshots are taken in the agent's browser and attached.

**Ring 1, the change.** The requested content is present, the old content is absent, exactly one field changed.

**Ring 2, the whole page.** On desktop and mobile:

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

Do not file a new ticket for something the observer already has open on the same page and check; link the existing one instead (search the queue by page URL first).

## What this protocol changes from before

- The whole page is tested, not only the ticketed element, and two untouched pages are checked after any site-wide action.
- Visual inspection by screenshot is required. Text checks alone never close a ticket.
- Tickets are validated before work starts, and incomplete tickets go back with a specific ask instead of partial work.
- The page is reconciled against the full ticket scope before editing, so prior partial work is finished rather than missed.
- Tickets with a blocked part still get their fixable parts done, and stay open for the rest.
- New defects found during a ticket become their own tickets, filed the same way the observer files them.
