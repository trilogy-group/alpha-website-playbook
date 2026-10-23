# Control Matrix: who provides content, who provides design, who controls functionality

Status: Confirmed rows cite a decision, a system, or a recorded Slack exchange. Rows marked Gap or Q-xx are unresolved and are listed for staff in `docs/questions-for-staff-2026-09-17.md`. Roles, not people, hold control; current holders are in `registry/people.json` and `playbook/responsibilities.md`. Last verified September 17, 2026.

Three questions are answered for every surface:

- **Content**: who supplies the words, facts, media, and data that appear.
- **Design**: who decides how it looks, including layout, templates, brand visuals.
- **Functionality**: who decides what the surface can do (forms, sync, plugins, maps, scripts), and who can change that.

Plus who approves and who executes. "Supplies" is not "decides": a campus supplies a headshot; marketing decides whether staff photos appear at all.

## 1. Summary

| Layer | Content supplied by | Content decided by | Design decided by | Functionality controlled by | Approves changes | Executes |
| --- | --- | --- | --- | --- | --- | --- |
| Campus facts (state, address, grades, tuition, phone, email, intro sentence, apply and booking links) | Campus leadership and Expansion, through the APEX campus editor or HubSpot | HubSpot Programs is the truth; website operators may update website-driven values (decision 2026-09-17) | n/a (data) | n8n sync owner (workflow), HubSpot program admin (properties) | Website operations, with a trailing audit | n8n at 00:15 Central |
| Campus staff cards | Campus leadership (Head of Schools, DoA, DoP) via APEX ticket | Campus leadership decides who; marketing decides the format and title list | Elementor owner (Gap) | Alpha MCP staff tools | Website operations | Website agent or operator via MCP |
| Campus page static copy and section structure | Marketing | Brand authority for wording; website operations for content | Elementor owner (Gap); the campus SEO template (object 6140) | Elementor, Alpha MCP | Website operations; MacKenzie for new wording | MCP or Elementor editor |
| Public events on campus and events pages | Events team, in HubSpot Marketing Events | Events team | Events plugin owner (Garbhit) | Events plugin owner; HubSpot owner | Events team makes public; website does not | Import every ~30 minutes |
| Info packets | Variable data from HubSpot; template in Canva | Packet owner Yash Chitneni (Matt Barge, 2026-10-07; Matt Barge held it from 2026-08-27), brand signoff MacKenzie, language QA Rachel Goodlad | Canva template; marketing-collateral (Chris Davidson) | Flipsnack hosting and the campus-page button; Alpha MCP for the link | Packet owner and brand authority | Website operations |
| Alpha Answers (`/ai/`) | Airtable, LLM content program | Website operations (Yash is the byline author) | Post template | Airtable import | Website operations | Import |
| Blog, news, podcasts, video resources | Marketing; press links often supplied by campuses | Q-14: no recorded editorial owner or calendar | Post templates; Elementor owner (Gap) | WordPress, Airtable video gallery plugin | Q-14 | Website operations |
| Homepage and program pages | Marketing direction from MacKenzie and Joe Liemandt (meeting records) | Brand authority and executive sponsor | Same, plus Elementor owner (Gap) | WordPress, growth map embed, GTM | MacKenzie and Yash | Website operations |
| Locations and maps | HubSpot Programs via the growth map API | HubSpot | Map app (growth-map owner, Gap) | Growth-map owner (Gap); Community app owner (Gap) | Q-15 | Map app team |
| Admissions, forms, application routes | HubSpot program admin (Farhan Raja): forms, Finalsite routing, `submission_campus` | Admissions leadership (Q-16: who) | Form templates; Elementor owner (Gap) | HubSpot program admin; Finalsite | Q-16 | HubSpot program admin |
| Header, footer, navigation, global scripts | Marketing | Website operations | Elementor owner (Gap) | WordPress admin (Gap), analytics-and-consent owner (Gap) | Staging first, human only | WordPress admin |
| Legal pages | Legal content owner (Gap) | Legal content owner (Gap) | n/a | n/a | Legal content owner (Gap) | Website operations, verbatim |
| Hosting, DNS, CDN, plugins, WordPress users | n/a | n/a | n/a | WordPress admin (person not recorded), WP Engine account holder (Q-17), Cloudflare account holder (Q-17), alpha.school DNS: Central SaaS team via their Kayako portal | Q-17 | Q-17 |
| Design system and visual brand | Brand documents (Alpha Event Design Guidelines, brand skill draft) | MacKenzie Price for brand; Q-12 for site-level visual decisions | Elementor owner (Gap); refresh candidate design team (see `origin-and-ownership.md`) | Elementor kit (global colors and fonts) | MacKenzie | Elementor owner (Gap) |

## 2. Campus and admissions staff: what they control

This is the question the matrix is most often asked to answer. Evidence is recorded; the rule is Proposed until Yash confirms (Q-13).

**What campus staff supply** (Confirmed by requester history and `playbook/responsibilities.md`):

- Names, titles, biographies, headshots, and effective dates for the campus Team section.
- Campus facts they know first: location label, address, phone, grade range, launch date. These go to HubSpot Programs, not to the page.
- Local press links, local events, and local photos or videos as candidates.
- The report that something is wrong: "South Bay still shows Manhattan Beach" (John Stuart, `#support-websites`, 2026-08-27).

**How they supply it**: an APEX Website request (Intake tile, choose the campus, request type Website), or a `#support-websites` message that website operations converts to an APEX ticket. Source messages are intake, not authorization.

**What campus staff do not decide** (Confirmed: `playbook/responsibilities.md`, "They do not decide website structure or brand wording; those belong to marketing, brand, and web platform"):

- Page structure, section order, templates, layout.
- Brand wording, claims, statistics, tone.
- Functionality: forms, sync, plugins, maps, scripts.
- Whether a request is executed as asked. Website operations may decline, reshape, or route a request to a source owner.
- A campus-only element. Campus pages stay uniform (Confirmed: MacKenzie Price, 2026-09-25); a one-off exists only as a named exception in `spec/site-rules.json` `site.uniformity.campus-template`, and a request for one that is not listed is internal review, not execution.

**Who at a campus may ask** (Observed): Directors of Admissions and Campus Coordinators file most requests. Deans of Parents are often the only role at a campus and marketing collateral is "not in their purview" (Crystle Dorsey, 2026-08-27). Heads of Schools rule on vacancies and card removals. The Admissions Hub org chart is the roster of record.

**Open questions for admissions leadership** (Q-13):

- Do Directors of Admissions have write access to HubSpot Program properties today, and should they? Rachel Goodlad (Expansion) owns 44 of 98 Program records; it is not recorded who else edits them.
- May a campus request a change to its page's messaging (for example a local headline or a different CTA), or only to facts and staff?
- May a campus request a functionality change (a local form, a different booking link, an embedded calendar)? Today such requests exist (Book a Tour link changes) and are handled case by case.
- Who at a campus approves a staff addition or removal when the Head of Schools is not the requester?
- Is there an admissions leadership role (national) that should approve admissions-page copy and application routes? Q-16.

## 3. Marketing and brand: what they control

| Decision | Holder | Evidence |
| --- | --- | --- |
| Word-level brand rules, held phrases, terminology | MacKenzie Price | `playbook/site/site-rules.md`; marketing workspace `docs/rules/alpha-brand-copy-rules.md` |
| Visual treatment approval on the refresh candidate | MacKenzie Price | September 8, 2026 feedback incorporated in the refresh preview (Nessie transcript, 2026-09-09) |
| Marketing direction and priorities | Joe Liemandt with MacKenzie | Marketing meeting records June through August 2026 |
| Day-to-day content and page changes | Yash Chitneni (website operations) | `registry/people.json`; APEX assignment |
| Agent execution, observer, QC loop | Matt Barge | `registry/people.json` |
| Events content | Brittany Goodman (Head of Experiences and Engagement) | HubSpot Marketing team, APEX event editors |
| Collateral production (Canva) | Chris Davidson (marketing-collateral) | `playbook/responsibilities.md` |
| Photography, videography, editing | Named in `registry/people.json` | |

Not decided: whether MacKenzie's authority covers site-level visual design (layout, typography, color usage) or only brand and wording (Q-12); whether there is an editorial owner for blog and news (Q-14).

## 4. Platform and functionality: who can change what the site does

| Capability | Controlled by | Person recorded? | Evidence |
| --- | --- | --- | --- |
| WordPress plugins, users, theme, updates | WordPress admin role | No person recorded for the role; the access report tool lists users with edit rights when plugin 0.5.0 is live | `docs/environments-and-identities.md`, `registry/plugins.json` (production versions unknown) |
| Elementor global templates (header 76, footer 77, campus template 6140), kit, CSS | Elementor owner | Gap | `registry/templates.json` |
| HubSpot to WordPress campus sync (n8n workflow) | n8n sync owner | Cristi Constantin, partner Dmitry Bakaev | `playbook/integrations/hubspot-and-n8n.md` |
| HubSpot Programs object, forms, Finalsite routing | HubSpot program admin | Farhan Raja | `registry/people.json` |
| HubSpot account, owners, marketing events | HubSpot owner | Hailey McSpadden | `registry/people.json` |
| Events import plugin (`ahse-events`) | Events plugin owner | Garbhit Sharma | `registry/people.json` |
| Growth map API and map app | Growth-map owner | Gap | `registry/owners.json` |
| Community app program routing | Community app owner | Gap | `playbook/site/community-routing.md` |
| GTM, Site Kit, ad pixels, consent | Analytics-and-consent owner | Gap | `registry/global-runtime.json` |
| Voiceflow chatbot, founder chat | Platform owner | Gap | `registry/global-runtime.json` |
| alpha.school DNS | Central SaaS team, requests through the Central SaaS Kayako portal | Yes; Q-17 DNS part resolved 2026-10-21 | Slack [D0B5Y9Z2600/1792401579.635079](https://go-alpha.slack.com/archives/D0B5Y9Z2600/p1792401579635079), [C099GQ9F15X/1768213303.703969](https://go-alpha.slack.com/archives/C099GQ9F15X/p1768213303703969) |
| WP Engine account, Cloudflare account, DNS registrar | Not recorded | Gap; Q-17 | |
| Alpha WordPress MCP plugin (agent write path) | Matt Barge (author), production install by the WordPress admin | Yes | `docs/actor-capability-matrix.md` |
| GitHub organization (trilogy-group) | GitHub admin | Fernando | `registry/people.json` |
| Airtable (Alpha Answers, video gallery) | Not recorded | Gap; Q-18 | |
| Flipsnack (info packets) | Not recorded | Gap; Q-18 | |
| Goldcast (events registration) | Events team | Assumed; Q-18 | |

## 5. Approval rules that already hold

- Nothing is published, scheduled, enabled, or marked complete in APEX without evidence, and never on a source-only check (decision 2026-09-17).
- Structural, global-template, plugin, form, script, redirect, and legal changes are human-only and staging-first (`docs/actor-capability-matrix.md`).
- Website operators may change HubSpot Program values and n8n mappings for website content, with a trailing audit (Yash Chitneni, 2026-09-17).
- Source-of-truth findings go to the source owner before the page is touched (`spec/source-authority.json`).
- A Missing Info ticket goes back to its creator, who is usually the campus requester (decision 2026-09-17).

## 7. Requester evidence: who actually asks for website changes

Twenty-eight website tasks recorded in the marketing workspace between June 30 and September 17, 2026 (Observed).

| Requester group | Requests | Examples |
| --- | --- | --- |
| Campus admissions staff with a resolved title (Director of Admissions, Dean of Parents, Admissions Associate, Senior Admissions Specialist) | 6 | Rebecca Haack (DoA, The Woodlands) national virtual info session; John Stuart (DoA, South Bay) staff additions; Tara Marlow (DoP, Tulsa) own card; Lina Yee (Admissions Associate, East Bay) headshot; Kellie Mowll (DoP) bio typo; Carolyn Hopper (Senior Admissions Specialist) La Jolla events |
| Campus requesters whose title is not yet recorded | 5 | Shannon Kebisek (East Bay, Palo Alto, SF), Linzi Gobble (Boca Raton), Lindsay Dudley (Chicago), Hayley Whittier (Greenwich), rachel@alpha.school (Bethesda) |
| Central marketing and HubSpot | 6 | Hailey McSpadden (events on pages, sync), Dmitry Bakaev (staff removals, approval badge, sync) |
| Brand authority | 3 | MacKenzie Price (Alpha High bootcamp thumbnail, search visibility), Haven Mass relaying the brand fixes workbook |
| Automated observer, assigned by Matt Barge | 3 | Launch copy on 15 pages, Bethesda and Brownsville staff corrections |
| Unmapped | 5 | Cyndie Jensen, Kathrine Ledesma, Katie Smith, Chloe Belvin, one null requester |

What the ledger shows about control:

- Campus staff supply facts and people; they are asked only to confirm their own facts ("Tara Marlow: confirm the card text and photo"). No campus person approves a change.
- Every review instruction routes to Matt Barge and Yash Chitneni. Executors are Matt, Yash, or the website agent.
- Central marketing requests are about sync and events, campus requests are about staff and local facts, brand requests are about wording and assets. The three groups almost never overlap, which is why a control matrix by layer works.
- Eleven WordPress administrators existed on August 6, 2026 (sanitized inventory, `docs/migration/generated/wordpress-admin-browser-inventory.json` in the marketing workspace). Their names are not recorded in either repository. Q-17.

## 6. What this file needs from staff

Collected in `docs/questions-for-staff-2026-09-17.md`: Q-12 (visual authority), Q-13 (campus and admissions control), Q-14 (editorial owner), Q-15 (Locations approvals), Q-16 (admissions leadership), Q-17 (hosting and DNS account holders), Q-18 (Airtable, Flipsnack, Goldcast, Canva account owners).

## Sources

- `playbook/responsibilities.md`, `spec/responsibilities.json`, `registry/people.json`, `registry/owners.json`, `docs/decisions.md`, `docs/actor-capability-matrix.md`, `docs/environments-and-identities.md`.
- Slack: John Stuart and Matt Barge, `#support-websites`, 2026-08-27 (location label and staff add for South Bay); Brittany Goodman, Crystle Dorsey, Dmitry Bakaev, Yash Chitneni, Matt Barge group DM, 2026-08-27 (info packet ownership, campus roles and purview, Canva team transfer, HubSpot as data source).
- Marketing meeting records June through August 2026 (marketing workspace `docs/`).
- Requester history: marketing workspace `tasks/*website*.json`, 28 tasks June 30 to September 17, 2026 (section 7).
