# Website as a Funnel: gap register

Written 2026-09-28 after the framework, the first baseline, the tooling registry (35 entries), the project home and the context guide were all in place. A gap is anything that stops the project answering its six questions (framework section 1) or reaching level 2, Instrumented, on a capability. Severity: blocking (nothing downstream moves), important (limits what can be said), hygiene (wrong or drifting records). Each gap names the owner who can close it and the next action.

## A. Ownership and decisions

| # | gap | severity | owner | next action |
|---|---|---|---|---|
| A1 | No product owner of alpha.school and no accountable outcome. Charter questions Q-04 (who owns the site as a product) and Q-03 (what it is accountable for) are open, and Q-01 (the primary next step for a prospective parent) decides every CTA and every conversion criterion. | blocking | Matt, then MacKenzie | Matt proposes the answer to Q-01 and Q-03 before the Haven meeting; MacKenzie confirms |
| A2 | Analytics-and-consent owner unnamed. 23 of the 35 tools in the registry have no owner; nobody can grant GA4 access, read GTM, or answer a consent question. | blocking | Matt | Name the owner (Matt interim) and record it in `registry/owners.json` and the tooling registry |
| A3 | No decision has ever been recorded about analytics or the funnel. The playbook decision log has zero rows on it; the maturity model, the audience classes and the five outcomes are proposals with no decider. | important | Matt | Record the framework, the five outcomes and the audience classes as decisions with `record-decision.mjs` |
| A4 | No cadence and no home for the numbers. The site-truth report has a script and a folder; the funnel has a one-off baseline and no weekly run, no dashboard destination, no reader. | important | Matt, Yash | Decide the destination (a markdown report from the script, a HubSpot dashboard, or Looker Studio once GA4 is read) and a weekly slot |

## B. Access and instrumentation

| # | gap | severity | owner | next action |
|---|---|---|---|---|
| B1 | GA4 and Search Console reports unreadable. Property and domain property known; report proxies return missing scopes. | blocking | Matt | Connect Site Kit to a Google account with access, or add a service account as Viewer on property 452530593 |
| B2 | GTM container unread; every CTA a bare link; no event taxonomy; Google tag linker covers alpha.school only, so sessions break at go., events. and apply. subdomains. | blocking for on-site behaviour | analytics owner; Cristi or Garbhit for GTM access | Get read access to GTM-5W56ZLQJ, inventory triggers, then implement the five events and cross-domain linking |
| B3 | HubSpot traffic is not domain-split. No saved analytics view exists, so every HubSpot number covers alpha.school, go.alpha.school, the map app and any sister site with the portal code. | important | analytics owner; Garbhit | Create HubSpot analytics views per domain, or treat HubSpot as outcomes-only and GA4 as traffic-only |
| B4 | Search Console automation unconfigured in the observer (OAuth client present, refresh token absent). The AEO system was designed to ingest it and does not. | important | Matt (aeo secrets) | Mint the refresh token once GA4 access is sorted, or read Search Console through Site Kit |
| B5 | Consent and traffic hygiene unknown: no consent banner in HTML (HubSpot may inject one), no internal or bot exclusion recorded, Voiceflow at a 20 percent rollout with leads landing outside HubSpot. | important | analytics owner | Confirm consent state from a browser render; define internal-traffic and bot rules in GA4 and HubSpot |
| B6 | Outcome systems unjoined to sessions: Finalsite applications, Goldcast attendance, Community app (PostHog), Voiceflow leads, meetings without a campus. | important | Yash (HubSpot), Garbhit, community-app-owner | Per outcome, name the join key (email, contact id, campaign, campus) and where it is written |
| B7 | Layer 2, tool health, is unbuilt. Tag presence, container version, linker, HubSpot cookie and Search Console reads are watched by nothing. | important | website agent | Add a measurement-integrity lane to the observer using the heartbeat pattern |

## C. Data model

| # | gap | severity | owner | next action |
|---|---|---|---|---|
| C1 | No campus of record on contacts. Fifteen campus-like properties; the best (`submission_campus`) is filled on 24 percent of new contacts; meetings carry no campus. Per-campus funnel numbers are impossible. | blocking for campus views | Matt decides; Garbhit implements | Choose one property, make every website form and scheduling page write it |
| C2 | Audience classes undefined. Current versus prospective parent, staff, press, job seeker, city champion, bot. City champions alone submitted 1,583 forms in 27 days and have no owner or path. | blocking for intent | Matt | Confirm the classes in framework section 5 and the signals that assign them |
| C3 | No page-family dimension in analytics. The playbook knows page families and funnel stages; no analytics tool carries them, so traffic cannot be read by stage. | important | analytics owner | Content grouping in GA4 (or a URL-pattern map in the report script) from `spec/page-family-requirements.json` |
| C4 | SIS unknown (system and owner), so current parents cannot be identified and student quotes cannot be checked. | important | MacKenzie's office, Yash | Name the system and owner in `registry/sources.json` |
| C5 | 119 HubSpot forms with no website-form taxonomy; 24 of them are internal meeting-link forms that cannot be exported. Which forms are website conversions is undefined. | important | Yash | Tag the website forms and map each to one of the five outcomes |

## D. Method

| # | gap | severity | owner | next action |
|---|---|---|---|---|
| D1 | No criteria. Every baseline number carries a placeholder; nothing says what good looks like, so no finding can be called a problem. | important | Matt | Set criteria on the baseline summary rows, starting with bounce, session-to-contact and calls per week |
| D2 | ICP unvalidated by data. One persona, six tensions, written from calls and a synthesis; no plan yet to test them against landing pages, search terms and call objections. | important | Matt, Yash | Layer 6 plan once B1 and B4 are read; mine the call notes first |
| D3 | Claims and testimonials registries absent, so the messaging layer has no data hook and the observer's claims loop stays advisory. | important | marketing (Matt for now) | Create the two registries from the brand-guide claims and the 13 localized quotes |
| D4 | Content-to-outcome unmeasured: podcasts, videos, blog. YouTube retention lives in Studio only; the weekly podcast email is promised, not evidenced; no content page carries a next-step event. | important | Yash (podcast), analytics owner | Include content pages in the page-family dimension and the event taxonomy; confirm the weekly email exists |
| D5 | Intent for the non-converting 96 percent has no instrument. No on-site question, no mining of call notes or chat transcripts. | important | Matt decides | Decide whether to ask one on-site question; run a first pass over the 2,817 call-note records |

## E. Records and consistency

| # | gap | severity | owner | next action |
|---|---|---|---|---|
| E1 | Six documents describe the project (framework, baseline, project home, context guide, the 09-25 plan, the operating model) with small disagreements: the project home says the registry has 28 entries (35), says the Meta pixel script was observed live (only a DNS prefetch is), omits PostHog. | hygiene | website agent, other session | One index in the project home naming which document owns which question; fix the three lines |
| E2 | `registry/global-runtime.json` is stale (Meta and LinkedIn row wrong, every analytics row an owner gap) and the campus CTA inventory is a 09-16 snapshot. | hygiene | website agent | Refresh both from the tooling registry and a live crawl |
| E3 | The baseline script lives in marketingsupport uncommitted, with no npm script, and its output folder is not linked from the project home. | hygiene | other session (commits) | Commit, add `npm run funnel:baseline`, link the folder |

## F. Delivery risk

| # | gap | severity | owner | next action |
|---|---|---|---|---|
| F1 | The Haven and MacKenzie meeting is about ten days out and GA4 may still be unread. Without it the meeting can show sources, geography, devices, cities and outcomes, but not the page kill list she asked for. | important | Matt | Do B1 this week; if it slips, present the maturity table honestly and the HubSpot findings |
| F2 | Two agent sessions edit the same documents concurrently. The commit split (the other session owns marketingsupport commits) exists; the content already drifted once. | hygiene | Matt | Keep the rule; the project home is the only place that states current status, everything else links to it |
| F3 | The city-champion signal (Bring Alpha to Your City, the largest form) is a business finding with no owner, outside the five outcomes. | important | Matt, MacKenzie | Decide whether it is a sixth outcome or a separate program |

## What closes first

B1, A2 and C1 are the three that unblock everything else, and all three are single decisions by Matt with a few minutes of execution behind each: connect Site Kit, name the owner, choose the campus property.
