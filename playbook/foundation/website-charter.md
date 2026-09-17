# Website Charter

Status: Proposed for adoption by Yash Chitneni and MacKenzie Price, with Joe Liemandt where noted. Drafted September 17, 2026 by Matt Barge's website agent from the sources cited. Open questions are listed in `docs/questions-for-staff-2026-09-17.md`.

## 1. What alpha.school is

alpha.school is the public marketing and admissions website for Alpha School, the private school network operated with 2 Hour Learning. It is a WordPress site built with Elementor Pro, hosted on WP Engine behind Cloudflare, with roughly 350 public URLs of which 44 are campus pages (Observed, `information-architecture.md`).

It is one surface among several that a family touches:

| Surface | Audience | Owner of record | In this playbook |
| --- | --- | --- | --- |
| alpha.school (this site) | Prospective families, press, search engines, LLMs | Marketing, website operations | Yes |
| apply.alpha.school, Finalsite application routes, `/application-fs/` | Applying families | Admissions systems (HubSpot program admin) | Only the links to it |
| go.alpha.school meetings (HubSpot) | Families booking a call | HubSpot owner | Only the links to it |
| events.alpha.school (Goldcast) | Families registering for events | Events | Only the links to it |
| community.alpha.school (Community app) | Waitlist and pre-announcement interest; enrolled families | Community app owner (not named) | Only the routing contract |
| map.app.alpha.school growth map | Embedded in Locations and homepage | Growth-map owner (not named) | Only the data contract |
| ParentSquare, TimeBack, support.alpha.school | Enrolled families and students | Campus operations, Edu Support | No |
| Sister-brand sites (alphahigh.school, novaacademy.school, and others) | Their own prospects | Their own owners | No |

Source: `docs/website-architecture.md`, `docs/related-systems.md`, live-site survey 2026-09-17, Matt Barge's Alpha Website Brainlift (August 2026).

## 2. Purpose

The website exists to do four jobs, in this order of priority:

1. **Convert a qualified prospective parent to the approved next step for the correct campus.** The next step is an event, a call, or an application, depending on the campus state and the page. (Confirmed as intent: Brainlift Insight 8, homepage family purpose in `playbook/page-families/homepage-and-locations.md`, ICP review 2026-08-26. Which next step is primary is an Open question, Q-01.)
2. **Answer the parent's questions with credible proof.** Kids love school, kids learn twice as much in two hours, kids learn life skills; each claim inside its evidence boundary. (Confirmed as messaging intent: `audience-and-messaging.md`; brand wording rules in `playbook/site/site-rules.md`.)
3. **Be the accurate public record of which campuses exist and what state each is in.** Every campus page, Locations card, and map pin must match HubSpot Programs. (Confirmed: decision 2026-09-15, HubSpot wins; Brainlift purpose statement: "reflect the most up-to-date information across the entire Alpha program and all campuses.")
4. **Be the source that search engines and LLMs cite when a parent asks about Alpha.** Canonical, crawlable answer pages, `llms.txt`, Markdown alternates, schema. (Confirmed as a program: `docs/LLM Content Visibility Project Overview.md` in the marketing workspace; `playbook/integrations/seo-and-llm-publishing.md`.)

A change that serves a lower-priority job at the expense of a higher one is wrong. A change that serves none of them does not belong on the site.

## 3. Who it is for

**Primary audience: prospective parents** actively evaluating a private-school alternative for a school-age child. Full profile in `audience-and-messaging.md`. (Confirmed: ICP review 2026-08-26 and reimagining criteria 2026-08-28, both in the marketing workspace `docs/migration/`; Brainlift Insight 6.)

**Not for current families.** Enrolled families use the Community app, TimeBack, and until the 2026-27 cutover ParentSquare. The public site does not carry enrolled-family operations, calendars, or announcements. (Confirmed: Brainlift Insight 6; Tasha Arnold in `#supportcollab`, July 29, 2026: Alpha is no longer using ParentSquare for 26/27 and the Community app is the replacement.) Where a campus page shows an event, it is a prospective-family event from HubSpot Marketing Events, not a school calendar.

**Secondary audiences the site visibly serves today but nobody has ranked** (Observed; Q-02):

| Audience | Evidence on the live site | Question |
| --- | --- | --- |
| Press and media | `/news/` (about 31 items), `/founders/`, podcast landing pages, press logos on campus pages | Is press a served audience or only a proof source for parents? |
| Job seekers and prospective guides | `/careers/` | Does the site recruit, or only link out? |
| City champions and partners | `/bring-alpha-to-your-city/`, `community.alpha.school` waitlist | Who owns this funnel and its follow-up? |
| Regulators, accreditors, school-board gatekeepers | Cognia and state approval language on campus pages | Which approval claims may appear, and who verifies them? |
| Existing families looking for admissions forms | `/admission-forms/`, `/application-status/` | Should re-enrollment paths live here or on the Community app? |

## 4. Funnel: what each page family is for

Each page family serves one stage of the prospective-to-enrolled journey and should carry one dominant call to action for that stage. Two pages at different stages should not share the same primary CTA. (Confirmed as principle: Brainlift Insight 8; reimagining criteria section 4. The stage assignments below are Proposed.)

| Stage | Page families | Parent's question | Dominant next step (Observed today) | Approved? |
| --- | --- | --- | --- | --- |
| Discover | Homepage, `/the-program/`, `/2-hour-learning/`, podcast and press landings, `/news/` | What is Alpha and is it real? | Several competing CTAs: Find an event, Explore campuses, Learn More, Watch Videos | No; Q-01 |
| Believe | `/ai/` Alpha Answers, blog, video resources, `/faq/`, `/founders/`, parent survey results | Are the claims true? Is this just screens? Who are the guides? | Internal links to campus and admissions; no single CTA | No |
| Localize | `/locations/`, campus pages, campus local-SEO posts | Is there a campus near me and what state is it in? | Open: Book a Call, Apply, Info packet, events. Announced: waitlist or Community. Pre-announcement: Community only | Partly: campus lifecycle in `playbook/campus-page/` |
| Act | `/admission/`, `/admission-forms/`, `/high-school-application/`, `/apply/`, event registration | How do I take the next step? | Apply (Finalsite/`/application-fs/`), Book a Call (HubSpot meetings), Register (Goldcast) | Routes documented; primary not decided |
| Confirm | `/success/`, `/thank-you/`, `/application-submission/`, `/application-status/` | Did it work, what happens next? | None | Indexability undecided; several are in the sitemap today |

## 5. Outcomes and measures

No outcome measure for the website is written down anywhere in the two repositories or the Brainlift (Confirmed absence, audit 2026-09-17). Analytics have no named owner (`registry/owners.json` gap `analytics-and-consent-owner`).

Proposed measures, each with the system that already records it. None is adopted; Q-03 asks Yash and Joe which of these, or what else, the site is accountable for.

| Proposed measure | Where the number lives today | Why this one |
| --- | --- | --- |
| Booked calls per campus per week | HubSpot meetings (go.alpha.school) | The most common campus-page CTA |
| Event registrations attributed to the site | Goldcast, HubSpot Marketing Events | The ICP review's proposed primary next step |
| Applications started from site links, by campus | HubSpot Programs `admission_link` destinations, Finalsite | The commercial outcome |
| Waitlist or Community sign-ups for announced and pre-announcement campuses | Community app | The only conversion available before opening |
| Search click-through on city queries | Google Search Console (Site Kit is installed) | Localize-stage health; already tracked by the AEO campus scoreboard |
| LLM citation share on parent prompts | Peec, `superbuilders/aeo` | Purpose 4 |
| Campus-truth defects open longer than one day | Observer, APEX | Purpose 3 |
| Brand-rule violations on live pages | `website:brand-qc` detector | Purpose 2 |

## 6. Ownership

| Role | Holder | Status |
| --- | --- | --- |
| Product owner of the website as a product (sets purpose, audience, priorities, accepts or rejects requirements) | Not named | Gap; Q-04. Yash Chitneni acts in this role by default today |
| Website operations (executes and approves day-to-day changes) | Yash Chitneni | Confirmed, `registry/people.json` |
| Website agent operator (runs the supervised agent, owns the observer) | Matt Barge | Confirmed |
| Brand authority (wording, claims, visual brand) | MacKenzie Price | Confirmed for wording; visual scope is Q-12 |
| Executive sponsor | Joe Liemandt appears in marketing meeting records as the decision maker on marketing direction | Not recorded as a website role; Q-04 |
| Elementor and visual template owner | Not named | Gap |
| Analytics and consent owner | Not named | Gap |
| Legal content owner | Not named | Gap |

Full per-surface control is in `control-matrix.md`.

## 7. Non-goals

The website does not:

- Serve enrolled families' school life (Community app, TimeBack, ParentSquare).
- Host the application itself (Finalsite, apply.alpha.school) or process payment beyond linking to the approved route.
- Represent sister brands; each has its own site and owner.
- Publish anything a source-of-truth system contradicts. HubSpot Programs beat the page.
- Carry unapproved claims, statistics, or media, however persuasive.

## 8. The decision rule

When two tickets, two owners, or a ticket and a requirement conflict, apply this test in order:

1. Does the change match HubSpot Programs and the other named sources? If not, fix the source or stop.
2. Does it move the primary parent toward the approved next step for the correct campus?
3. Does it stay inside the proof boundary and the brand wording rules?
4. Does it keep the whole page and any shared template correct, not just the ticketed element?
5. Does it have a named approver for its surface in `control-matrix.md`?

A change that fails any step is not made. Silence from an approver is not approval.

## Sources

- Matt Barge, Alpha Website Brainlift (Nessie context, created 2026-08-19, updated 2026-08-31): purpose statement, Insight 6 (prospective families only), Insight 8 (one CTA per funnel stage), Insight 9 (no single source of truth for new campuses).
- `docs/migration/refresh-icp-messaging-form-factor-review-2026-08-26.md` and `docs/migration/alpha-website-reimagining-criteria-2026-08-28.md` (marketing workspace).
- `docs/project-overview.md`, `docs/website-architecture.md`, `docs/related-systems.md`, `docs/decisions.md` (this repo).
- Live-site survey 2026-09-17 (`spec/inventory/site-url-inventory-2026-09-17.json`).
