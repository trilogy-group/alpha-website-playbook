# Funnel Measurement and Experiment Operating Model

Status: **Working operating model with adopted measurement governance.** Written 2026-09-25 from Matt Barge's request to treat alpha.school as a funnel and the MacKenzie Price website strategy meeting that day. On 2026-09-30 Matt approved the interim analytics owner, five completion definitions, a 30-day dual-view attribution policy, and raw-plus-screened reporting. The website charter defines the stages and purpose; this document defines the order of operations. It does not choose Alpha's primary conversion, approve copy, authorize an experiment, or promote a GA4 key event.

## 1. Run three loops, in this order

Treating the site as a funnel does not replace website quality control. It adds two loops after it.

| loop | question | evidence | may change the site? |
| --- | --- | --- | --- |
| 1. Site integrity | Is the page accurate, available, current, and policy-compliant? | HubSpot and other sources of truth, rendered desktop/mobile pages, the observer packet, APEX verification | Only through the website ticket protocol |
| 2. Measurement integrity | Can a visitor's journey be measured from landing page through the external destination and confirmed completion? | GTM/Google event debug, consent state, network receipts, destination records, reconciliation | Instrumentation changes require the analytics owner and the production/staging protocol |
| 3. Funnel optimization | Where do qualified visitors stop, and which approved change improves the next-step rate? | Versioned funnel definition, baseline, experiment assignment, downstream completions, guardrails | Only an approved experiment may change copy, design, hierarchy, or routing |

A page with an unresolved lifecycle, routing, form, or rendering defect is excluded from optimization analysis. A conversion lift never makes an inaccurate page acceptable. A click is not a completed conversion.

## 2. Measure one journey, with lifecycle-specific destinations

The common journey is:

```text
qualified landing
  -> campus or program identified
  -> appropriate next step shown
  -> CTA engaged
  -> destination loaded
  -> downstream completion confirmed
```

The completion systems are different, so do not collapse them into a single unweighted "conversion" number:

| outcome | start signal | completion authority | important distinction |
| --- | --- | --- | --- |
| Book a Call | approved meetings CTA click | HubSpot meeting booked | a click or meetings page load is not a booking |
| Info Session | approved event CTA click | registration in the event system / HubSpot Marketing Event path | registration must retain campus and source |
| Info Packet | approved packet CTA click | successful delivery of the correct governed campus packet | a request, click, generic download, and successful delivery are separate stages |
| Application | application CTA click | submitted application in Finalsite or the governed campus admissions system | report starts and submits separately; only submit is the approved completion |
| Community | approved Community CTA click | Community join or interest submission | valid primarily for the lifecycle states named in the campus controls |

Until the product owner chooses the primary outcome and its value by campus lifecycle, report each outcome separately. Do not create a blended score that silently values an application, an event registration, and a packet click as equivalent.

## 3. Establish the measurement contract before building a dashboard

The rendered site currently exposes GTM `GTM-5W56ZLQJ`, Google tag `GT-PJNQ32T9`, HubSpot portal `40051392`, and attribution-propagation JavaScript (`registry/global-runtime.json`). Presence is not proof that the funnel is measurable.

The read-only instrumentation audit must identify:

1. The Google Analytics property and data access path, GTM container owner, consent owner, and release process.
2. Every approved CTA destination by campus and lifecycle, taken from the campus controls and source-authority registries.
3. The event emitted for CTA impression, CTA engagement, destination arrival, form/application start, and confirmed completion.
4. The stable keys carried through the journey: campus Program ID, campus slug, lifecycle at event time, page family, CTA type and position, landing page, source/medium/campaign, device, experiment id and variant.
5. Cross-domain behavior for `go.alpha.school`, event registration, Finalsite/application routes, and Community, including whether attribution and consent survive the handoff.
6. The join key and attribution window used to reconcile site events with each downstream completion system.
7. Bot, employee, test, duplicate, and consent-denied handling.

The contract is versioned. A dashboard always names the contract version and data-through date. A changed event name, CTA route, consent rule, campus identity, or attribution window is a measurement change and must not rewrite historical meaning silently.

The machine-readable contract is `registry/website-measurement-contract.json`. It records the observed events and their evidence-window counts, the five outcome authorities, required dimensions, public health markers, cross-domain requirements, adopted governance, and every explicit gap. Its approved definitions do not turn a start into a completion: a null event name, join key, consent owner, or completion count remains a blocker to resolve, not a blank for an agent to complete from intuition.

Matt Barge approved the following on 2026-09-30:

- Matt is the interim analytics owner for measurement definitions, access, reporting policy, and attribution governance. Consent ownership remains open.
- Book a Call completes when a governed HubSpot scheduling-page booking record is created.
- Info Session completes when a governed event-registration record is created and represented through the HubSpot Marketing Event path.
- Info Packet completes when the correct governed campus packet is successfully delivered.
- Apply completes when the governed application is submitted in Finalsite or the approved campus admissions system.
- Community completes when a governed interest or join record is created in the Community system.
- Attribution reports first touch and latest meaningful touch side by side over a 30-day window. Direct-traffic handling remains part of the versioned implementation rule.
- Reports always retain raw totals and publish any approved screened view separately, with excluded aggregate evidence and the screening-rule version retained.

These decisions approve meaning, not instrumentation. Cross-domain continuity, privacy-safe join keys, downstream read access, consent ownership, screening-rule thresholds, and GA4 key-event promotion remain separate gates.

As of 2026-10-01, production GTM version 7 emits five diagnostic CTA-start events with seven governed parameters, including the privacy-safe `destination_key`. Four events were observed in GA4 DebugView, and controlled preview plus post-publish Tag Assistant verified the destination key on Homepage Info Session, Austin Book a Call, Austin Apply, and legacy Goldcast registration routes. The primary Community controls remain inside a cross-origin iframe, and the contract's approved-key-event list is intentionally empty. Public inspection of the actual routes visitors reach, rather than the destination domain homepages, found that the HubSpot booking route runs `AW-11219766583` without the primary Alpha property and the Goldcast registration route exposes no Google measurement. The outbound links carried no `_gl` linker value. Therefore, adding linker domains to the main site alone is not a cross-domain repair: each governed destination must first run the agreed property, then a controlled journey must prove client/session continuity. The native candidates are HubSpot's domain-level Tracking integrations setting for `go.alpha.school`, subject to proof that the specialized Meetings surface inherits it, and Goldcast's organization-level Google Analytics integration, which documents registration-page visits plus `Open Registration` and `Submit Registration`. Both require a controlled test route before release, and Goldcast organization- and event-level scripts must not be duplicated. Community requires direct app instrumentation or an approved origin-checked `postMessage` bridge; iframe focus is not a valid proxy for an internal CTA.

The contract also defines aggregate-only HubSpot authority snapshots for public/embedded scheduling-page bookings and public Marketing Events. These establish downstream totals, not attributed website conversions. Read-only inspection found a non-personal scheduling-link identity (`hs_meeting_created_from_link_id`) on governed bookings and non-personal event identities (`externalEventId` or `eventUrl`) on Marketing Events. Version 1.0 records the live privacy-safe `dk1` destination identity: public Goldcast registration UUIDs use `info_session:event:<uuid>` and other routes use `<outcome>:route:dk1:<hash>` derived only from normalized host and path. Query strings, fragments, and personal or free-text values are excluded. This identity is live as a diagnostic event parameter, but it is not an approved completion join key. On 2026-10-01, a GA4 administrator registered `destination_key` as the event-scoped custom dimension `Destination key`; AEO run `36909740628` verified the definition through the Admin API. Its first Data API read returned zero processed keys because the definition is non-retroactive and may need 24 to 48 hours. The 30-day attribution views are approved, but the totals remain separate from CTA starts until destination-key population, controlled authority reconciliation, destination instrumentation, each cross-domain path, and each join are verified.

As of 2026-09-30, the read-only `superbuilders/aeo` synthesis operationalizes the evidence layer on seven-, 28-, and 90-day windows. It keeps GA4 sessions, HubSpot tracked visits, HubSpot contacts, CTA-start clicks, bookings, and event registrations separate; publishes transparent traffic-quality, landing-page, mobile, page-attention, search, city, and trend review candidates; and labels partial instrumentation or row-cap coverage. The aggregate GA4 Data API does not expose exits or ordered user paths. Those require an approved BigQuery export. None of this adopts a primary outcome, joins a person, or authorizes a site change.

## 4. Prove instrumentation with journeys, not tag presence

For each page family and each lifecycle-specific CTA path:

1. Start a clean browser session with a known test campaign.
2. Record the landing event and required dimensions.
3. Confirm the CTA was actually visible before its engagement event.
4. Follow the approved destination and confirm cross-domain attribution.
5. Complete the test only in a permitted test path; otherwise stop at the external boundary and have the destination owner supply the completion receipt.
6. Reconcile the browser events with the destination record and label the journey pass, partial, or failed.
7. Repeat on desktop and mobile, and in the consent states the owner requires.

The measurement-readiness report includes a data-quality panel: journeys tested, completion systems connected, orphan clicks, completions with no attributable visit, duplicate completions, missing campus identity, and freshness. Unknown or partial data stays visible; it is never filled in by inference.

## 5. Baseline before recommendations

After the instrumentation audit passes, preserve an initial baseline long enough to include normal weekday variation and known campaign/event effects. The baseline dashboard shows:

- sessions and qualified landings;
- campus/program identification rate;
- CTA impression, engagement, destination-arrival, and confirmed-completion rates;
- time and steps between stages;
- exits and errors at each stage;
- results by campus, lifecycle, page family, landing page, source/campaign, device, and new/returning visitor where consent permits;
- a separate data-quality and site-integrity status beside every result.

Use both perspectives:

- **Visitor cohort:** what happened to people who arrived during the period.
- **Completion cohort:** which earlier visits produced completions during the period.

Never compare campuses without lifecycle, traffic mix, volume, and measurement coverage. Low-volume campuses get confidence intervals or an explicit insufficient-data label, not a league table.

## 6. Turn leaks into governed experiments

Prioritize an opportunity by **affected qualified volume × observed drop-off × confidence in the cause × expected value**, then account for effort and risk. The experiment brief must state:

- the observed leak and evidence;
- the page family and audience;
- one falsifiable hypothesis;
- the one meaningful variable being changed;
- primary completion metric and guardrails;
- eligible traffic, exclusions, planned duration, and stopping rule;
- exact approved copy, design, media, or routing variant;
- owners and approvals;
- rollback and post-experiment verification;
- what becomes a playbook rule if the result is adopted.

Authority remains unchanged:

- MacKenzie Price approves brand wording and claims. An agent does not rewrite messaging on its own.
- Haven Mass supplies design and layout direction.
- Source-owned campus facts and destinations remain controlled by their source systems.
- Global templates, scripts, analytics, consent, forms, and routing follow staging and the ticket protocol.

Do not begin an experiment when the relevant integrity check is red, completion events are not reconciled, another material change is running on the same audience, or the traffic is too small to answer the question. A test that cannot reach a decision is churn, not learning.

## 7. Feed results back into the operating system

Every experiment ends in one of four states: adopt, reject, inconclusive, or invalid measurement. Adoption requires:

1. the experiment result and uncertainty;
2. human approval for the permanent copy/design/functionality;
3. a playbook requirement or named exception with its source;
4. a ticketed production change with rollback and public evidence;
5. an observer check when the adopted behavior is machine-checkable;
6. a clean post-change measurement-integrity journey.

The observer protects the adopted state; it does not decide which variant converts better. Analytics proposes; the playbook governs; the ticket protocol executes; the observer maintains.

## 8. First implementation sequence

1. Completed 2026-09-30: Matt Barge is the interim analytics owner. Name the separate consent owner and grant read access to the remaining completion sources.
2. Decide the primary and secondary outcomes by campus lifecycle. The five completion meanings are approved, but their relative priority is still open; keep every outcome separate until then.
3. Completed: produce the CTA-to-completion inventory and measurement contract; version 1.0 inspects the real booking and registration routes, audits privacy-safe authority identity coverage, records the bounded `dk1` destination schema live in GTM version 7, and records the API-verified event-scoped GA4 custom dimension. Next, verify destination-key population after GA4 processing and controlled authority reconciliation, instrument the real destination routes with the primary property, and prove cross-domain continuity before approving any join key.
4. Run the desktop/mobile synthetic journey audit and repair instrumentation gaps.
5. Publish the baseline dashboard with its data-quality panel.
6. Review the largest three evidenced leaks with Matt, Yash, MacKenzie, and Haven as their authority applies.
7. Run one bounded experiment, then take it through the adoption loop above.

The first useful deliverable is therefore not a redesign or an AI list of copy changes. It is a trustworthy path from a known visitor and campus to a confirmed downstream outcome, plus a baseline that shows where that path breaks.

## Sources and boundaries

- `playbook/foundation/website-charter.md`: website purpose, audience, stages, outcomes, authority, and the decision rule.
- `spec/campus-page-controls.json`: lifecycle-specific campus CTA controls.
- `spec/source-authority.json`: owner and system for website values.
- `registry/global-runtime.json`: observed tracking and attribution runtime markers; presence only.
- `protocols/production-and-staging.md`: staging requirements for analytics, global script, form, and routing changes.
- `protocols/recipes/forms-admissions.md`: form and admissions verification.
- MacKenzie Price website strategy meeting, 2026-09-25 (Granola transcript held in the marketing-support workspace): request to analyze the site as a funnel, with messaging remaining subject to human authority.

Open decisions remain open. This document does not resolve website charter Q-01 (primary next step), Q-04 (product owner), the consent-owner gap, the join keys, screening thresholds, or GA4 key-event promotion. It does resolve the interim analytics owner, completion meanings, 30-day attribution views, and raw-plus-screened reporting policy.
