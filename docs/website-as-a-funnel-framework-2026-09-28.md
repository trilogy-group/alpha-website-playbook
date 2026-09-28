# Website as a Funnel: framework and maturity baseline

Project name: **Website as a Funnel**. Started 2026-09-28 by Matt Barge after MacKenzie Price's 2026-09-25 ask (about 5,000 visits a day, "we are throwing away all these leads", which pages kill visitors, which cities are hot, which content converts, and recommendations rather than a data dump). This document lays the groundwork: what we hold, how mature each capability is, and the layers to build. It is a system-maturity view, not an operations report; page breakage and ticket flow live in the QC loop documents.

Companion documents: marketingsupport `docs/Alpha Website Funnel and Analytics Plan 2026-09-25.md` (the first deliverable list), `docs/funnel-operating-model.md` (measurement contract, five outcomes), `playbook/foundation/audience-and-messaging.md` and `website-charter.md` (ICP, belief sequence, funnel stages), marketingsupport `docs/meetings/2026-09-25 MacKenzie Price website strategy.md`.

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

### Where we are today (verified 2026-09-28)

| capability | level | evidence |
|---|---|---|
| A. Traffic measurement | 1 | GTM container GTM-5W56ZLQJ and Google tag GT-PJNQ32T9 on every page through Site Kit; HubSpot tracking for portal 40051392; UTM-to-cookie script. No GA4 property id, credential, or API client in any repo; GTM container not readable by us; no owner on any row of `registry/global-runtime.json`. Search Console is fetched by the observer and read by nothing. |
| B. Audience identity (current vs prospective, city, source) | 0 | No definition of audience classes, no identity join to HubSpot contacts, no page-family signal used. The ICP names one prospective-parent persona and says enrolled families are not the site's audience, yet admission forms, calendars and packets on the site are current-parent surfaces. |
| C. Conversion outcomes | 1 | Five outcomes defined in the operating model with "a click is not a conversion". Every CTA is a bare link with no event; the Google tag's cross-domain linker covers alpha.school only, so sessions break at go.alpha.school, events.alpha.school and apply.alpha.school. HubSpot tokens are content and CRM read, no meetings, events or reporting scope. No outcome measure adopted (charter Q-01 open). |
| D. Content performance | 1 | Podcast cards auto-ordered on listens plus trend (Yash, weekly email promised). Videos are YouTube embeds without progress events. About 125 editorial URLs with no owner, no link from content to a next step. |
| E. Audience and messaging governance | 1 | One ICP, seven-step belief sequence, three commitments, word rules and a review standard exist. Claims, testimonials and feedback-ledger registries are `not-yet-created`; the highest-authority source (MacKenzie's quiz workbook) sits in Downloads. Nothing in the ICP is validated against traffic, search or admissions data. |
| F. Feedback loop into the site | 2 | Decisions recorded with `record-decision.mjs`, rules become check rows, the observer measures the rendered site twice daily and files tickets. The loop measures conformance, not outcomes: its audience-funnel loop is one advisory CTA-routing check; the two audience rows were retired as ungrounded. |

Read across: the site is at level 1 on the business questions and level 2 only on keeping itself correct. That is the honest answer to the meta question. The site is run as a brochure kept tidy, with the funnel described on paper and measured nowhere.

## 3. What we hold, what we lack

**Held.** HubSpot private apps (content, CRM reads, Program writes, marketing events); WordPress admin and the Alpha WordPress MCP (44 tools, none analytics); n8n read; Slack; APEX; the observer with a rendered-site inventory of every CTA per campus (`spec/campus-page-controls.json`, 12 controls, 44 pages); Search Console credentials in the aeo repo secrets; the ICP, belief sequence, funnel stages, messaging review standard and brand rules.

**Lacking, in the order it blocks work.**

1. GA4: which property GT-PJNQ32T9 feeds, and read access to it (API or a service account). Without it every traffic number is hearsay.
2. GTM: read access to container GTM-5W56ZLQJ, to learn whether any conversion trigger exists. Today conversion tracking is either inside the container or nowhere.
3. HubSpot reporting: a private app with meetings, marketing-events and forms analytics scopes, to count booked calls, registrations and form fills.
4. An analytics and consent owner. The role exists in `registry/owners.json` as a gap; there is no consent banner on the site while the spec assumes one.
5. An event taxonomy: the five events and the stable keys in the operating model, implemented in GTM with cross-domain linking to the three conversion subdomains.
6. Audience classes: a written definition of current parent, prospective parent, staff, press, job seeker, city champion, and the signals that assign a session to one (identified HubSpot contact and its lifecycle, Community app referral, page family, campaign).
7. The claims and testimonials registries, so messaging can be attached to pages and outcomes.

## 4. The layers, as Matt set them

| layer | deliverable | what exists | what it needs |
|---|---|---|---|
| 1. Base layer: the tool inventory | `registry/website-funnel-tooling.json` in the playbook: every tool, plugin, skill, credential and data source we use to understand the site, each with owner, access path, status, and what it can answer | `global-runtime.json`, `plugins.json`, `forms.json`, `sources.json`, aeo config; the three inventories behind this document | access to GA4 and GTM recorded; HubSpot reporting app; the owner named |
| 2. Health of the tools | a health check that runs on a cadence: does each tool answer, is the tag firing, is the linker right, is the container unchanged, does the HubSpot tracking cookie set, does Search Console return rows | the observer's loop-health lane and heartbeat pattern | a `measurement-integrity` lane in the observer (the operating model's loop 2), reading tags and container state, not rendered copy |
| 3. Tracking-state report | one page: what is tracked, what is not, what is broken, per CTA and per page family, with the level from section 2 | the tracking inventory in this document | GA4 and GTM read access to turn "unknown" into "yes" or "no" |
| 4. Current metrics with criteria | baseline numbers for the last 90 days: sessions, landing pages, per-campus visits, drop-off by page, each outcome count from the system that holds it, form fill rates; with a stated criterion for each ("a campus page under X sessions a week is dead") | the deliverable list in the 09-25 plan | GA4 read, HubSpot reporting scopes; the tracking redesign is a separate later topic, the baseline uses what is collected today |
| 5. Angles | named analyses, each a question with a method: page kill list, hot cities and their cause, content that leads to a next step, video drop-off, mobile versus desktop, source and campaign, current versus prospective behaviour | MacKenzie's list from 09-25 | layer 4 data plus the audience classes |
| 6. ICP | the persona set validated against data: which tensions actually show up in search terms, landing pages and admissions-call objections; a persona-to-entry-page map; the secondary audiences ranked | one persona, six tensions, seven belief steps, on paper | search terms (Search Console), landing-page mix (GA4), objections from admissions calls (HubSpot meetings notes or a DoA interview) |
| 7. Messaging | pain points and what we are trying to find out, written as questions the data must answer; the claims and testimonials registries created; per-CTA intent (what a parent signals by choosing each next step) | review standard, brand rules, pilot deck findings, rejected-wording list | the registries; a decision on the primary next step (Q-01) |
| 8. The plan | the build plan for layers 1 to 7 with owners, access, sequence and the level each capability reaches | this document | Matt's decisions in section 6 |

## 5. Current-parent versus prospective-parent: how we will tell

Today: not at all. The proposal, to be built in layer 6 and measured in layer 4:

- Identified sessions: HubSpot's tracking cookie ties a session to a contact once a form or a known link identifies it. A contact with an enrolled-student association or a customer lifecycle stage is a current parent; a lead or MQL is prospective. This needs HubSpot reporting access and a contact-property mapping.
- Behavioural classes for anonymous sessions: sessions that land on calendars, packets, admission forms, or arrive from the Community app or ParentSquare read as current-parent behaviour; sessions that land on campus pages, program pages, podcasts, or from search and paid read as prospective. The classes are written down first, then checked against the identified sessions to see how well they predict.
- Staff and test traffic excluded by network and by the internal-traffic rule GA4 supports.

Until this exists, "5,000 visits a day" is an unsegmented number and any recommendation built on it is guesswork.

## 6. Decisions and asks for Matt now

1. Name the analytics and consent owner. Proposal: Matt as owner of definitions and access, Yash as owner of HubSpot reporting, the website agent as the executor of layers 1 to 4.
2. Ask for GA4 and GTM access. Site Kit was configured by someone with the Google account that owns the property; the likely holders are Cristi Constantin (site infrastructure) or Garbhit Sharma (HubSpot and integrations). One message asks for: the GA4 property id behind GT-PJNQ32T9, viewer access for a service account, and read access to GTM-5W56ZLQJ.
3. Ask HubSpot admin (Garbhit) for a private app with meetings, marketing-events and forms scopes, or add them to the Marketing Syncing app.
4. Decide the primary next step for a prospective parent (charter Q-01: event, call, apply, or a personalised path). Every funnel stage's CTA and every conversion criterion waits on it.
5. Confirm that the first four layers are in scope for the next meeting with MacKenzie and Haven (week after next), with layers 5 to 8 framed as the following month.

## 7. First two weeks

Baseline pulled the same day from HubSpot: `docs/website-as-a-funnel-baseline-2026-09-28.md` (numbers, caveats, and the intent-readiness assessment: level 1 on intent, level 2 only for the converting 4 percent).

### 7a. Progress log

- Days 1 to 3: the tooling registry (layer 1), the access requests sent, the audience classes drafted, the tracking-state report in its "unknown" form.
- Days 4 to 7: with GA4 and GTM read, the tracking-state report completed, the measurement-integrity lane in the observer (layer 2), the 90-day baseline pulled (layer 4 in raw form).
- Days 8 to 10: criteria agreed, the first three angles run (kill list, hot cities, content to next step), the site-truth report joined to traffic so every campus row shows visits and outcomes next to its defects.
- Meeting with MacKenzie and Haven: the maturity table with levels then versus now, the baseline, three angles with recommendations, and the ICP validation plan.
