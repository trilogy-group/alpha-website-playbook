# Who is responsible for what

Departments own areas. Roles within departments own, approve, or supply specific things. People hold roles for a while and then change, so people never appear in the rules. Machine form: `spec/responsibilities.json` (departments, roles, ticket routing, and what registry each ticket class needs), `registry/people.json` (department-role holders with a source and date), `registry/campus-roles-snapshot.json` (campus-role holders, generated), `registry/campus-leadership.json` (what the campus page Team sections show).

Missing Info class routing (role-based, no people in rules): `registry/missing-info-routing.md` and `registry/missing-info-routing.json`.

## Live roles and registered roles

Two kinds of role, resolved two ways:

| Kind | Roles | How an agent resolves the person | Why |
| --- | --- | --- | --- |
| Live (campus) | Director of Admissions, Dean of Parents, Senior Admissions Specialist coverage | `node tests/resolve-campus-roles.mjs --campus <slug> --role dean-of-parents` reads the Admissions Hub org chart at run time, applies `registry/campus-roles-overrides.json`, and attaches the email from HubSpot owners. `--write` refreshes `registry/campus-roles-snapshot.json`, a dated cache used only when the hub or HubSpot is unreachable. | These change every few weeks. A copied list is wrong within a month. |
| Registered (department) | HubSpot owner, HubSpot admin, n8n sync owner, website operations, website agent operator, events, photography, videography, video editing, calendars, packet owner (person gap), brand authority, expansion, Elementor owner, observer owner | `registry/people.json`, entries with a source and an as-of date | These change a few times a year and are set by declaration, not by a system. |

The Admissions Hub, not HubSpot, is the source of truth for who is Director of Admissions or Dean of Parents at a campus. HubSpot does not model those roles on the Programs object; it holds the people (owners with work emails, and a DoPs team of five). APEX mirrors the hub in its directory and carries the rows Hailey confirmed ahead of the chart; the playbook mirrors the same rows in the overrides file. When the hub and the overrides disagree, the override wins until the hub catches up, and the row is dated.

A snapshot older than seven days is stale: the validator should re-resolve before naming a person in a Missing Info note.

## Departments

| Department | Owns | Roles |
| --- | --- | --- |
| Campus leadership (one per campus) | Who is on the campus page, their bios, photos, titles; the campus's admissions facts and links | Head of Schools, Dean of Parents, Director of Admissions, Head Guide, Lead Guide, Campus Coordinator |
| Marketing | Website changes, approved media, packets, events, PR, brand | website operations (Yash), website agent operator (Matt), packet owner, events, PR and comms, brand authority (MacKenzie) |
| HubSpot | The Programs records that are the source of truth for campus state and facts; marketing events; email; HubSpot to WordPress n8n sync | HubSpot owner (Hailey McSpadden); HubSpot admin; n8n sync owner (Cristi Constantin primary, Dmitry Bakaev partner) |
| Expansion | Pre-announcement and announced campuses, launch dates, community destinations | new programs (Ashley Rahr), founding (rachel@alpha.school) |
| Web platform | Header and footer templates, layout, CSS, structural changes, WordPress admin, the events plugin stack | Elementor owner (not yet named), events plugin owner (Garbhit), WordPress admin, GitHub admin (Fernando) |
| Operations | The National Growth Map sheet and the map API | not yet named |
| QC | The production observer and its tickets | observer owner (Matt) |

## How a ticket finds its person

1. The validator classifies the ticket (`spec/ticket-classes.json`).
2. `spec/responsibilities.json` `ticketRouting` says which role supplies missing inputs, which role approves, and which role executes.
3. For campus roles, the resolver names the person for the ticket's campus (live). For department roles, `registry/people.json` names the person.
4. The Missing Info note names that person with their email. If the campus has nobody in the role (the hub shows Franklin, Nashville, Palo Alto, Park City, Tampa, and Tulsa with neither a DoA nor a DoP), the note names, in order: the Senior Admissions Specialist covering the market, the Dean of Parents for Expansion (Jeremy Williams), the Head of Schools, and website operations. The gap is recorded on the ticket.

## What registry each ticket class needs

Machine form: `spec/responsibilities.json` `registryByTicketClass`. Examples:

| Ticket class | Must have on hand | Comes from | Missing Info goes to |
| --- | --- | --- | --- |
| staff-add, staff-update, staff-remove, staff-photo | The campus page and its Team section model; the approver; the approved title list; an explicit name-to-photo mapping | `registry/campus-pages.json`, `spec/campus-page-model.json`; Dean of Parents, live; `spec/campus-page-requirements.json`; the ticket | Dean of Parents, then Head of Schools, then website operations |
| program-info, observer-fact-sync | The fact as HubSpot has it; who can change HubSpot; who speaks for the campus; n8n sync when the site is still wrong | growth map API (HubSpot's public mirror); HubSpot owner from `registry/people.json` (Hailey); Director of Admissions, live; n8n sync owner from `registry/people.json` | HubSpot owner when HubSpot is blank; Director of Admissions when the requester disagrees with HubSpot; n8n sync owner when HubSpot is correct but site still wrong or sync would overwrite |
| copy, observer-brand-leak | Brand rules; the brand authority for new wording; campus sign-off | marketing workspace brand rules and the branding skill; MacKenzie Price from `registry/people.json`; Dean of Parents, live | requester; brand authority for held items |
| observer-launch-copy, media, observer-media-identity | Campus state; the approved card asset; the card producer | growth map API; `registry/campus-open-media.json`; website operations (Yash) | website operations; photography or videography when new footage is needed |
| link-cta, observer-link-cta, observer-packet | The destination; the calendar owner for calendar links; packet path roles | the ticket or HubSpot admission_link; calendars (Zara Raheem); marketing-collateral + brand-authority + website-operations (packet-owner person is an open gap) | Director of Admissions, live; calendars; marketing-collateral / brand-authority / website-operations |
| observer-event, event-sync | The HubSpot marketing event; the event owner | HubSpot; events (Hailey McSpadden, Brittany Goodman) | events |
| observer-layout, layout | The template owner | Elementor owner, not yet named | Elementor owner, else website operations |
| observer-map-community | The program row; the Operations sheet row; the expansion owner | HubSpot Programs via the map API; the sheet; expansion new programs (Ashley Rahr) | expansion; Operations sheet owner, not yet named |
| other-workflow | The owning workflow's assignee | APEX request-type routing: photography (Gaby Guajardo), videography (Chris Mass, Alfred Gomez), video editing (Haven Mass, Nick Stich), collateral (Chris Davidson), calendars (Zara Raheem) | the owning workflow |

## Key contacts (registered roles, confirmed 2026-09-15)

| Person | Role | Email | Confirmed by |
| --- | --- | --- | --- |
| Hailey McSpadden | HubSpot owner; Director of Event and Marketing Operations; confirms roster corrections | hailey.mcspadden@alpha.school (also @2hourlearning.com) | Admissions Hub, HubSpot owner record, APEX permissions, Slack title |
| Yash Chitneni | Website operations; website ticket auto-assignee | yash.chitneni@superbuilders.school | APEX routing, HubSpot owner record |
| Matt Barge | Website agent operator; website ticket auto-assignee; observer owner | matthew.barge@superbuilders.school | APEX routing, HubSpot owner record |
| Haven Mass | Video editing; relayed MacKenzie's brand choices to the web team | haven.mass@alpha.school | APEX video editing owners; HubSpot owner record is a personal address |
| Chris Mass | Videography coverage owner | chris.mass@alpha.school | APEX coverage owners |
| Gaby Guajardo | Photography coverage owner | gaby.guajardo@alpha.school | APEX coverage owners, HubSpot Marketing team |
| Gaby Sullivan | Dean of Parents, Atlanta (Associate DoP by Slack title) | gaby.sullivan@alpha.school | Admissions Hub roster, HubSpot owner record |
| Brittany Goodman | Events; Head of Experiences and Engagement | brittany.goodman@alpha.school | APEX event editors, HubSpot Marketing team |
| MacKenzie Price | Brand authority | mackenzie@alpha.school | HubSpot Marketing team record |
| Zara Raheem | Calendars | zara.raheem@alpha.school | APEX routing |
| Ashley Rahr | Expansion new programs; Senior Admissions Specialist (Tampa, Orlando, Scottsdale) | ashley.rahr@alpha.school | Admissions Hub, APEX requester history |
| Rachel Goodlad | Head of Expansion | rachel.goodlad@alpha.school | Admissions Hub, HubSpot owner record |
| Jeremy Williams | Dean of Parents for Expansion (fallback DoP) | jeremy.williams@2hourlearning.com | Admissions Hub, HubSpot DoPs team |
| Garbhit Sharma | Events plugin owner; WordPress and Elementor finishing; HubSpot push rights | garbhit.sharma@alpha.school | #admin-websites, APEX topology doc, observer routing |
| Farhan Raja | HubSpot program admin: Program records, Finalsite and form routing; HubSpot push rights | farhan.raja@trilogy.com | APEX topology doc, #admin-websites |
| Cristi Constantin | n8n sync owner (HubSpot Program to WordPress; wordpress_post_id; Locations List; overwrite exceptions) | cristi.constantin@trilogy.com | Cristi GDM with Matt/Yash/Dmitry; #admin-websites Locations List n8n automation |
| Dmitry Bakaev | HubSpot admin; n8n sync owner partner; events HubSpot to site sync reliability (with Garbhit). Not info-packet Canva owner | dmitry.bakaev@trilogy.com | APEX HubSpot push; Cristi GDM; Matt #admin-websites Aug 2026 |

Emails come only from HubSpot owner records, APEX permission files, or the person. Never derive one from a name: the roster carries nicknames and other surnames, and two Deans are on a different domain.

Campus staff submit tickets and supply what only they have: names, titles, bios, photos, effective dates, campus facts. They do not decide website structure or brand wording; those belong to marketing, brand, and web platform.

## Where the information comes from, and how to keep it current

| Source | What it gives | Access today |
| --- | --- | --- |
| Campus page Team sections (through the MCP) | The roster the public sees: names and titles per campus | Yes; re-run `spec/inventory` extraction |
| APEX requester history | Who actually submits for each campus, with emails | Yes; export from the APEX API |
| Admissions Hub org chart | Director of Admissions and Dean of Parents per campus; central admissions, marketing, and expansion tables; approved assignment updates | Yes, public page; `tests/resolve-campus-roles.mjs` |
| APEX routing and permission files | Auto-assignees by request type, coverage owners, HubSpot push and event-editor rights, DoA/DoP overrides Hailey confirmed | Yes, source checkout in the marketing workspace |
| HubSpot owners | Work emails, owner ids, teams (Marketing, DoPs, Admissions, Admin) | Yes, `GET /crm/v3/owners` with the marketing service key (263 owners on 2026-09-15) |
| HubSpot Programs properties | Campus facts and any per-program contact fields | No; the token lacks `crm.objects.custom.read` and `crm.schemas.custom.read`. Read through the growth map API until granted |
| Slack directory | Titles and Slack ids for 1,730 members | Yes for ids and titles; no emails without `users:read.email` |
| Named decisions | Who owns what by declaration | Recorded in `docs/decisions.md` |

Refresh the roster and requester extractions monthly, or whenever a staff ticket closes. A person with no role for 90 days is retired from the registry, not deleted.

## Open gaps

- packet-owner person unclear. Dmitry Bakaev was incorrectly the sole holder and was removed. Packet work is campus facts + Chris Davidson (marketing-collateral / Canva) + MacKenzie (brand-authority) signoff + Rachel (expansion-founding) language QA + Matt/Yash (website-operations) hosting public links. See `registry/missing-info-routing.md` class `info_packet`.
- Elementor owner and Operations owners are not named.
- Nobody is named as the editor of the Admissions Hub org chart; Hailey confirms corrections today.
- HubSpot has no owner record for several roster names (Samantha Kravitz, Morgan Petek, Q Tang, Crystal Cybulski, Nancy Wisniewski Torvund), so the resolver returns no email for them.
- Twelve campus pages have no Dean of Parents card and seventeen no Director of Admissions card. Either the role is vacant or the card is missing; each needs a ruling from the Head of Schools.
- Two placeholder staff cards were live on Austin and Palo Alto when this was written; tickets filed.
- Chelsea Winters appears as Dean of Parents on Bethesda, Carrollton, Franklin, Houston, and San Juan while a Bethesda ticket asks to remove her. Confirm which campuses she still covers.
