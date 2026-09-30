# Website as a Funnel: framework and maturity baseline

Project name: **Website as a Funnel**. Started 2026-09-28 by Matt Barge after MacKenzie Price's 2026-09-25 ask (about 5,000 visits a day, "we are throwing away all these leads", which pages kill visitors, which cities are hot, which content converts, and recommendations rather than a data dump). This document lays the groundwork: what we hold, how mature each capability is, and the layers to build. It is a system-maturity view, not an operations report; page breakage and ticket flow live in the QC loop documents.

Companion documents: marketingsupport `docs/Alpha Website Funnel and Analytics Plan 2026-09-25.md` (the first deliverable list), marketingsupport `docs/Website as a Funnel Baseline and Build Plan 2026-09-28.md` (the first browser/API-verified 90-day baseline and implementation plan), `docs/funnel-operating-model.md` (measurement contract, five outcomes), `playbook/foundation/audience-and-messaging.md` and `website-charter.md` (ICP, belief sequence, funnel stages), marketingsupport `docs/meetings/2026-09-25 MacKenzie Price website strategy.md`.

## 1. The questions this project has to be able to answer

1. Who is visiting: prospective parents, current parents, staff, press, job seekers, city champions. Today nobody can say.
2. Where do they come from and where do they go: entry pages, paths, the page where they stop, the CTA they take.
3. Which of the five outcomes happen, and from where: Book a Call, Attend an Info Session, Info Packet, Apply, Join the Community.
4. Which cities are hot or dead, and why (press, events, search).
5. Which content works: podcasts, videos, quotes, campus pages, and whether content leads anywhere.
6. The meta question: is the site being run as a funnel for the Alpha business, or as a brochure that operations keeps tidy.

## 2. Maturity model

Five levels, applied to six capabilities. The level names are the vocabulary for every later status update.

| level | name | meaning |
|---|---|---|
| 0 | Blind | the capability has no data, no owner, no definition |
| 1 | Present | tools or definitions exist but nobody can use them (no access, no owner, unverified) |
| 2 | Instrumented | data is collected to a known definition with an owner, and we can pull it |
| 3 | Measured | baseline numbers exist with criteria for good and bad, reported on a cadence |
| 4 | Understood | causes are known (why a page kills, why a city is hot), segmented by audience |
| 5 | Steering | findings become decisions and site changes on a loop, with the effect measured |

### Where we are today (verified 2026-09-30)

| capability | level | evidence |
|---|---|---|
| A. Traffic measurement | 2 | GA4, Search Console, GTM, and HubSpot aggregate reporting are readable in the unattended AEO runtime. The first cross-system synthesis succeeded in run `36776010659`, the first automated 90-day baseline succeeded in `36776831844`, and post-merge decision support succeeded in `36777936249`. No analytics owner is named, destinations do not share the primary property, and no website completion event is an approved GA4 key event. |
| B. Audience identity (current vs prospective, city, source) | 0 | No definition of audience classes, no identity join to HubSpot contacts, no page-family signal used. The ICP names one prospective-parent persona and says enrolled families are not the site's audience, yet admission forms, calendars and packets on the site are current-parent surfaces. |
| C. Conversion outcomes | 1 | Five outcomes are defined and GTM version 6 emits diagnostic CTA starts for Book a Call, Info Session, Info Packet, Apply, and eligible main-document Community links. GA4 ingestion was verified for the first four. Aggregate HubSpot booking and Marketing Event authorities are readable, but no downstream record is joined to its originating session. The primary GA4 property is absent from `go.alpha.school` and `events.alpha.school`; the primary Community controls are unobservable inside the cross-origin map iframe; no final outcome definition is adopted (charter Q-01 open). |
| D. Content performance | 1 | Podcast cards auto-order on listens plus trend. GA4 collects `video_start`, `video_progress`, and `video_complete`; the synthesis now reports same-page video and governed CTA-start aggregates. It does not claim user-level or causal attribution. About 125 editorial URLs still have no owner or declared next step. |
| E. Audience and messaging governance | 1 | One ICP, seven-step belief sequence, three commitments, word rules and a review standard exist. Claims, testimonials and feedback-ledger registries are `not-yet-created`; the highest-authority source (MacKenzie's quiz workbook) sits in Downloads. Nothing in the ICP is validated against traffic, search or admissions data. |
| F. Feedback loop into the site | 2 | Decisions recorded with `record-decision.mjs`, rules become check rows, the observer measures the rendered site twice daily and files tickets. The loop measures conformance, not outcomes: its audience-funnel loop is one advisory CTA-routing check; the two audience rows were retired as ungrounded. |

Read across: repeatable traffic, acquisition, page, mobile, search, CTA-start, booking, and event evidence now exists. The site remains at level 1 on completed business outcomes and audience identity because ownership, cross-domain attribution, completion joins, and approved audience signals are missing. It is measured, but it is not yet steered from reconciled outcomes.

## 3. What we hold, what we lack

**Held.** Supervised and unattended GA4, Search Console, and GTM access; production GTM version 6 with five diagnostic CTA-start events; a dedicated HubSpot reporting key plus a bounded read-only fallback for the legacy traffic endpoint; recurring seven-, 28-, and 90-day cross-system synthesis; aggregate traffic-quality, landing-page, mobile, page-attention, search, CTA-start, booking, and public-event evidence; WordPress admin and Site Kit configuration access; Alpha WordPress MCP (44 tools, none analytics); n8n read; Slack; APEX; Peec; Bing; the observer with a rendered-site inventory of every CTA per campus (`spec/campus-page-controls.json`, 12 controls, 44 pages); the ICP, belief sequence, funnel stages, messaging review standard and brand rules.

**Lacking, in the order it blocks work.**

1. Destination continuity: `G-G7M04CYHH0` is absent from `go.alpha.school` and `events.alpha.school`; adding linker domains to the main site alone is insufficient. Each destination needs the agreed property and a controlled client/session continuity test.
2. Completion reconciliation: aggregate bookings and Marketing Events are readable but not joined to the originating WordPress session; Info Packet, Apply, and Community still lack readable governed completion authorities.
3. Community coverage: primary controls inside `map.app.alpha.school` require direct instrumentation or an approved origin-checked `postMessage` bridge.
4. An analytics and consent owner. The role exists in `registry/owners.json` as a gap; there is no consent banner on the site while the spec assumes one.
5. Audience classes: a written definition of current parent, prospective parent, staff, press, job seeker, city champion, and the signals that assign a session to one (identified HubSpot contact and its lifecycle, Community app referral, page family, campaign).
6. The claims and testimonials registries, so messaging can be attached to pages and outcomes.

## 4. The layers, as Matt set them

| layer | deliverable | what exists | what it needs |
|---|---|---|---|
| 1. Base layer: the tool inventory | `registry/website-funnel-tooling.json` in the playbook: every tool, plugin, skill, credential and data source we use to understand the site, each with owner, access path, status, and what it can answer | 37 entries in registry version 1.0; the synthesis, dedicated identities, production GTM version, destination-tag evidence, and live access results are recorded | keep evidence current and name the formal owner |
| 2. Health of the tools | a health check that runs on a cadence: does each tool answer, is the tag firing, is the linker right, is the container unchanged, does the HubSpot tracking cookie set, does Search Console return rows | implemented on AEO `main`; run 36774252259 proved real GA4, Search Console, GTM, HubSpot authority, legacy traffic fallback, and live start-event reads | merge the code-owner-approved contract, add the rendered Meta Pixel check, and calibrate thresholds after four clean weeks |
| 3. Tracking-state report | one page: what is tracked, what is not, what is broken, per CTA and per page family, with the level from section 2 | `registry/website-measurement-contract.json` version 0.5 records the live diagnostic start events, destination surfaces, empty approved-key-event list, aggregate completion semantics, and explicit blockers | destination instrumentation, Community coverage, completion joins, and human approval of outcome meaning |
| 4. Current metrics with criteria | baseline numbers for the last 90 days: sessions, landing pages, per-campus visits, drop-off by page, each outcome count from the system that holds it, form fill rates; with a stated criterion for each | successful automated seven- and 90-day synthesis runs; traffic-quality, landing-page, mobile, and page-attention criteria are explicit in every JSON packet | reconcile completions and calibrate the relative criteria against business decisions |
| 5. Angles | named analyses, each a question with a method: page kill list, hot cities and their cause, content that leads to a next step, video drop-off, mobile versus desktop, source and campaign, current versus prospective behaviour | traffic-quality, landing-page, mobile, page-attention, CTA-by-page, same-page content, city-volume, and equal-window trend candidates now run automatically | causal interpretation, exits/ordered paths, and current-versus-prospective behavior still require BigQuery/session joins, completion joins, and approved audience classes |
| 6. ICP | the persona set validated against data: which tensions actually show up in search terms, landing pages and admissions-call objections; a persona-to-entry-page map; the secondary audiences ranked | one persona, six tensions, seven belief steps, on paper | search terms (Search Console), landing-page mix (GA4), objections from admissions calls (HubSpot meetings notes or a DoA interview) |
| 7. Messaging | pain points and what we are trying to find out, written as questions the data must answer; the claims and testimonials registries created; per-CTA intent (what a parent signals by choosing each next step) | review standard, brand rules, pilot deck findings, rejected-wording list | the registries; a decision on the primary next step (Q-01) |
| 8. The plan | the build plan for layers 1 to 7 with owners, access, sequence and the level each capability reaches | this document | Matt's decisions in section 6 |

## 5. Current-parent versus prospective-parent: how we will tell

Today: not at all. The proposal, to be built in layer 6 and measured in layer 4:

- Identified sessions: HubSpot's tracking cookie ties a session to a contact once a form or a known link identifies it. A contact with an enrolled-student association or a customer lifecycle stage is a current parent; a lead or MQL is prospective. HubSpot reporting is readable; this now needs an approved contact-property mapping and privacy boundary.
- Behavioural classes for anonymous sessions: sessions that land on calendars, packets, admission forms, or arrive from the Community app or ParentSquare read as current-parent behaviour; sessions that land on campus pages, program pages, podcasts, or from search and paid read as prospective. The classes are written down first, then checked against the identified sessions to see how well they predict.
- Staff and test traffic excluded by network and by the internal-traffic rule GA4 supports.

Until this exists, "5,000 visits a day" is an unsegmented number and any recommendation built on it is guesswork.

## 6. Decisions and asks for Matt now

1. Name the analytics and consent owner. Proposal: Matt as owner of definitions and access, Yash as owner of HubSpot reporting, the website agent as the executor of layers 1 to 4.
2. GA4, Search Console, and GTM scheduled read access are complete. Preserve least privilege and monitor the real API checks for regression.
3. Preserve the dedicated least-privilege HubSpot reporting key and bounded read-only traffic fallback; request no new scope unless a named endpoint proves it is required and supported.
4. Decide the primary next step for a prospective parent (charter Q-01: event, call, apply, or a personalised path). Every funnel stage's CTA and every conversion criterion waits on it.
5. Confirm that the first four layers are in scope for the next meeting with MacKenzie and Haven (week after next), with layers 5 to 8 framed as the following month.

## 7. First two weeks

Baseline pulled the same day from HubSpot: `docs/website-as-a-funnel-baseline-2026-09-28.md` (numbers, caveats, and the intent-readiness assessment: level 1 on intent, level 2 only for the converting 4 percent).

Gap register (what stops each capability reaching Instrumented, with owners): `docs/website-as-a-funnel-gap-register-2026-09-28.md`.

### 7a. Progress log

- Days 1 to 3: tooling registry reconciled, live browser health checked, first raw 90-day GA4 + HubSpot baseline pulled, and GA4/GTM/Search Console access requests sent.
- Days 4 to 7: completed. The tracking-state report, measurement-integrity lane, read-only synthesis, traffic-quality screen, and 90-day baseline are live.
- Days 8 to 10: partially complete. Landing-page, mobile, page-attention, source, city-volume, CTA-by-page, content, and trend candidates now run; causal city/content interpretation and campus outcome joins remain blocked on the named authorities.
- Meeting with MacKenzie and Haven: the maturity table with levels then versus now, the baseline, three angles with recommendations, and the ICP validation plan.
