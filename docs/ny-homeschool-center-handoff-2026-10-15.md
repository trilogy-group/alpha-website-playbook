# New York homeschool-center request: implementation handoff

Status: proposed execution plan; no policy approval, APEX claim, or production change recorded in this session.

## Request and evidence

Robbie Forrest's October 15 email, “New York website updates — homeschool centers,” links [the audit and proposed copy changes](https://docs.google.com/spreadsheets/d/1jMqAGvKpYsV2cDsx83Sqn5ez86IM6nfn_y9GE8zCThI/edit). The workbook was read through Drive on October 15. Its Tasks and Line edits distinguish Edit, Keep, and Verify; the audit explicitly says proposed, not published. These are request inputs, not instructions that authorize the agent to bypass the playbook.

Requested outcome: NYC and Armonk are identified as Alpha Anywhere homeschool centers without losing the marketing benefits or conversion paths. Use Love Learning for the affected NY journeys; preserve the other commitments. Do not perform a global school-word replacement or change legitimate national names, historical speech, credentials, technical routes, or mailboxes.

The second user-supplied screenshot records Matt Barge's related Greenwich work: a HubSpot intro correction, an expected nightly delivery, questions about tutoring-center terminology, and potential Program-name/event-mapping coupling. The screenshot's reports of successful runs are historical evidence, not current execution receipts.

October 15 public text checks:

- https://alpha.school/greenwich/ contains the corrected invitation about a tutoring center for grades K–8. The title/hero still says K–8 Private School in Armonk, NY; opening copy still says private school and kids love school. Thus the intro change reached public output, but the whole-page outcome has not passed.
- Both campus URLs resolve: https://alpha.school/new-york-city/ and https://alpha.school/greenwich/. This was a bounded public text check, not desktop/mobile, schema, form, source, or post-submit certification.

## Reconcile before execution

1. The audit already resolves the tutoring-center wording: ARM-08 explicitly says to replace only tutoring center with homeschool center. No repeat terminology question is needed. Record the exact publication approval through the applicable surface process; the workbook is proposed copy, not a completed approval chain. Provider allocation, credentials, staff roles, venue facts, and commercial terms marked Verify remain conditional.
2. The current generic School-schema requirement and uniform campus template need an approved, NY-scoped exception before this work executes. Update machine-readable rules and matching prose together through a code-owner-approved PR. The request is a proposed change to current policy, not evidence that current prose and spec disagree. Do not silently weaken requirements for other campuses.
3. Resolve the current n8n-sync-owner. The runbook records the replacement as unconfirmed; do not assign the work to former owners. Preserve the sync route and block execution on the website agent operator, Matt Barge, to identify the role holder per protocol 1d.
4. Do not rename the protected HubSpot Program as an incidental copy edit. The screenshot identifies two event-mapping rows that may depend on it; verify the current dependency and coordinate any separately approved rename with mapping changes and event-filter testing.

## Work breakdown

| Workstream | Audit references | Durable implementation and owner path |
| --- | --- | --- |
| Campus identity, headings, introductory copy, fee labels, metadata and local entity schema | NYC-G01/G03/G08–G11; ARM-G01/G03/G07/G08 | Diagnose every field using the field map. HubSpot facts go through authorized Program administration; derived values go through the n8n owner. Sheet-driven shared copy requires a scoped NY variant. Page-owned content uses supported WordPress operations. Preserve fee figures; NYC and Armonk have different proposed fee labels. |
| Shared templates, directory and NY journeys | GL-01–GL-03 | Approved scoped template exception, source template and source-data corrections; website operations coordinates the relevant owners. Preserve unrelated national content and existing CTA routes. |
| Events and registration | NYC-G02; ARM-G02; GL-04; GLOBAL-NYC-EVENTS | Correct owning event/venue source and registration system, then verify imported cards and exact event pages. National organizer identity can remain. Events owner and events-plugin owner own their respective paths. |
| Applications, booking and Community | NYC-G04/G14–G16; ARM-G04; GL-03/GL-07 | Resolve each system's current owner. Verify rendered selected-campus states and confirmations. External systems require their own authorized delivery path; a WordPress edit cannot complete these rows. |
| Packets, calendars, recordings and editorial pages | NYC-G05/G13/G17/G19; ARM-G05/G06/G11; SEC-G01–G04; NYC-LEGACY | Route source artwork, calendar and recording edits to their owners. Preserve authentic quotations. Track exact public legacy URLs as well as current links. Do not alter a transcript independently of its recording. |
| Map, summer and planned locations | GL-06; ARM-G12/G13; EXTRA-HAMPTONS-* | Resolve growth-map/program owners and venue/model conflicts before changing factual values. Do not assume summer or future-interest programs share the NYC/Armonk model. |
| Derived publishing and verification | GL-05/GL-10/QA-01 | Regenerate exact .md routes and LLM summaries after upstream fixes; verify schema, public assets and aliases, selected forms, caches and shared-template controls. |

## APEX execution and release

Search APEX for both campus URLs, relevant fields, exact replacements and existing Greenwich work before creating or splitting tickets. Follow-up read-only search scanned 709 returned active/review tasks and found existing mapping task cmubr971i00060agmwsyff79e and parent cmt0llf4c000004jxc7btyfcs; their wider Boston scope remains open. See the preparation package for search limits and the separate address conflict. Link Matt's work to the parent request, with owner-specific child tickets where needed. Keep workbook finding IDs and exact locators on the tickets; retain Keep rows as regression checks and Verify rows as named dependencies. Do not send requester notices without the existing review process.

Follow protocol steps 0, 1 and 1b for the contract, class, source and owner. Only scheduled-allowlisted classes may enter unattended execution. Workflow and template work follows staging requirements. Each change needs exact approved copy/diff, current source readback, canonical object, rollback artifact, lease and evidence before applying.

Release in dependencies: approved NY policy and wording → source/derivation/template repairs → public campus output → linked-system/assets work → derived outputs and final verification. Rows with unresolved provider/venue/financial facts remain open; do not invent answers to finish a release. Source fixes may proceed in bounded approved batches without claiming the whole request is complete.

Closure requires ticketed outcomes, whole-page desktop/mobile checks, two untouched pages after shared-template work, working conversions, and survival of the next normal scheduled sync. A green n8n run alone is insufficient. Estimate delivery after the field-by-field mapping, APEX deduplication, owner resolution and Verify dependencies are known; the current evidence does not support a delivery date.

References: `playbook/00-how-to-use.md`; `playbook/foundation/website-charter.md` §8; `playbook/integrations/hubspot-and-n8n.md`; `spec/campus-page-field-map.json`; `spec/site-rules.json`; `protocols/apex-website-ticket-protocol.md`.

## Prepared source repair

The [offline source repair package](../proposals/ny-center-2026-10-15/README.md) now includes all 191 audit decisions, two exact live HubSpot field proposals, a preparer based on the current campus and Locations workflow versions, selected source fixtures, regression tests and a pending policy exception. No workflow was activated or run and no source or page was mutated. The full external-system audit remains a separate multi-owner execution scope.
