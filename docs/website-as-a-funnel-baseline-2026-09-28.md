# Website as a Funnel: first baseline and what it says about our readiness

Written 2026-09-28. Data: HubSpot reporting for 2026-09-01 to 2026-09-27, pulled read-only with `scripts/website-funnel/hubspot-baseline.mjs` into `work-assets/website-as-a-funnel/baseline-2026-09-28/` (summary, raw aggregates, provenance for every call; no personal data). Framework and maturity model: `docs/website-as-a-funnel-framework-2026-09-28.md`. Project home: marketingsupport `docs/website-as-a-funnel-project-home.md`; the pull script and raw aggregates live in marketingsupport.

## 1. What we can read today, and with what

Tested endpoint by endpoint on 2026-09-28. HubSpot traffic analytics, forms, submissions and marketing events read with the Marketing Syncing and Private App tokens; meetings and contacts read with the Service Key and Automation tokens. GA4 and Search Console reports stay unreadable until Site Kit is connected to a Google account with access, or a service account is granted Viewer on GA4 property 452530593. GTM, Google Ads, Meta, Cloudflare, WP Engine, YouTube Studio and PostHog are dashboards only. PostHog runs in the Community app and Alpha Camp, not on alpha.school.

## 2. The numbers

| measure | 1 to 27 September |
|---|---|
| Sessions | 215,090; 7,966 a day; range 4,583 to 15,153 |
| Unique visitors | 150,443; about 5,572 a day; 70 percent of sessions are new visitors |
| Pageviews, pages per session | 378,683; 1.76 |
| Bounce rate, time per session | 63.5 percent; 80 seconds |
| Mobile share | 71.5 percent; mobile bounces at 65.9 percent and stays 68 seconds, desktop 57.1 percent and 108 seconds |
| Sources | organic search 41.0, direct 28.8, social 18.8 (Instagram about 32,000 sessions), referrals 9.5 (map.app.alpha.school the largest single referrer at 13,400), AI answer engines 0.7, paid about zero |
| Geography | US 82 percent; California 17, Texas 12.8, Florida 7.7, New York 6.2, Illinois 5.2; city drill-down works per state |
| Campaign-tagged sessions | 31,292, 14.5 percent; the Instagram "alpha leads" campaign is 23,226 of them |
| Form submissions | 4,224 across 119 forms; Bring Alpha to Your City 1,583, Homepage Interest 938, applications through the Finalsite-redirect forms about 520, General Contact converts 3 percent of its views |
| New contacts | 8,273; session-to-contact 3.8 percent; one third carry a web source, two thirds are created offline by integrations |
| Calls booked through HubSpot scheduling pages | 710; 310 completed, 297 scheduled, 57 no-shows, 28 cancelled |
| Marketing events in the window | 166; 10,534 registrants, of which Founders Weekend 6,206; 2,036 attendees, attendance reliable only where Goldcast checks in |

Caveats that change the reading:

- HubSpot has no saved analytics views, so every traffic number covers every domain that carries the portal's tracking code (alpha.school, go.alpha.school, the map app, and any sister site with the same code), not alpha.school alone. MacKenzie's "5,000 a day" is probably the alpha.school-only figure from GA4; visitors per day, about 5,600, is the closer comparison.
- HubSpot has no per-URL data for WordPress pages. Page-level entry, path and drop-off are GA4 territory. What HubSpot does give at page level is each new contact's first page seen: alpha.school/ 1,055, go.alpha.school/alpha-to-your-city 357, /locations 271, /bring-alpha-to-your-city 210, then campus pages in the teens.
- Organic search terms are all hidden ("Unknown keywords, SSL"). Search terms need Search Console.
- No contact property is the campus of record. Fifteen properties mention campus; `submission_campus` on the application forms matches the site's slugs but is filled on 24 percent of new contacts; `program` (Program Interest) is filled on 91 percent but is a 193-value list. Meetings carry no campus at all; campus is recoverable only from scheduling-page titles.
- Of 5,054 meetings created, 1,559 are internal staff meetings and 2,817 are notetaker duplicates; the 710 booked through public scheduling pages are the website-attributable ones.

## 3. The meta question: are we equipped to answer "what are these people here for?"

Take the mobile finding as the test case: 71.5 percent of sessions are mobile, and mobile sessions bounce more and stay shorter. The question a funnel program has to answer is not "how many" but "why are they here, and did they get it". Answering intent needs five kinds of evidence, in rising order of directness. Where we stand on each, in the maturity vocabulary:

| evidence of intent | what it tells you | status today |
|---|---|---|
| Entry context: landing page crossed with source and device | A session landing on /raleigh/ from a Google search is a family evaluating Raleigh; one landing on the homepage from an Instagram reel is curiosity. This is the workhorse of intent analysis. | Blind (0). HubSpot gives device, source and geography but cannot cross them with each other or with a page. GA4 crosses all four and is not readable yet. |
| Search demand: the queries that bring people | "alpha school raleigh tuition" and "alpha school reviews" are different intents. | Blind (0). Terms are hidden in HubSpot; Search Console has them and is not readable yet. |
| On-site behaviour: which CTA, how far down, which video, how long | Distinguishes browsing from evaluating from deciding, per page family. | Blind (0). No CTA, scroll, or video events exist. The event taxonomy in the operating model is unbuilt. |
| Declared intent: what people submit or choose | Bring Alpha to Your City, Homepage Interest, Apply, Book a Call, event registration each name an intent, and the form fields add program interest and sometimes a campus. | Instrumented (2) for the 3.8 percent who convert; readable today. Blind for the other 96 percent. |
| Stated intent: what people say | Chat transcripts (Voiceflow, 20 percent of visitors eligible), admissions call notes (the notetaker records attached to 2,817 meetings), the objections DoAs hear. | Present (1). The records exist and are readable; nobody has mined them, and there is no on-site question ("what brings you here today?"). |

Read across: today we can say what the converting 4 percent wanted, from the form they chose, and we can say nothing about the intent of the 96 percent who did not convert, which is where the mobile question lives. We cannot yet tell whether mobile bounces are an Instagram in-app-browser artefact, a slow mobile page, or people who found what they came for on the first screen. That is the honest maturity position: level 1 on intent.

What it takes to reach Instrumented on intent, in order:

1. GA4 read (Site Kit connection or a service-account Viewer): landing page by source by device by campus page family, the entry-context table above, and the page kill list.
2. Search Console read: queries by page and by state, the demand side of hot cities.
3. Audience classes written and applied (framework section 5): prospective parent, current parent, staff, press, job seeker, city champion, bot, so that every intent question is asked per class. Bring Alpha to Your City at 1,583 submissions says the city-champion class is large and unowned.
4. An event taxonomy on the five CTAs, video plays and scroll depth, implemented in GTM with cross-domain linking to go., events. and apply. subdomains, so on-site behaviour exists as data.
5. Declared and stated intent joined to sessions: a campus-of-record property on contacts, and a first pass over the call notes and chat transcripts to name the top intents in the visitors' own words.

Reaching Understood then needs the angles (framework layer 5) run per class and per device, and a decision on whether to ask one on-site question for the anonymous majority.

## 4. Decisions this baseline puts in front of Matt

1. Connect Site Kit to a Google account with GA4 and Search Console access, or grant a service account Viewer on property 452530593. Nothing in section 3 rows one and two moves without it.
2. Name the contact property that is the campus of record for a website lead, or ask Garbhit to add one that every website form writes.
3. Confirm the audience classes in framework section 5, including city champions as a class of their own.
4. Set the criteria on the baseline numbers (each row of the summary carries a placeholder).
