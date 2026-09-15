# Who is responsible for what

Departments own areas. Roles within departments own, approve, or supply specific things. People hold roles for a while and then change, so people live in the registry with a source and a date, never in the rules. Machine form: `spec/responsibilities.json` (departments, roles, ticket routing), `registry/people.json` (people and the roles they hold), `registry/campus-leadership.json` (per campus: Head of Schools, Dean of Parents, Director of Admissions, Head and Lead Guides).

## Departments

| Department | Owns | Roles |
| --- | --- | --- |
| Campus leadership (one per campus) | Who is on the campus page, their bios, photos, titles; the campus's admissions facts and links | Head of Schools, Dean of Parents, Director of Admissions, Head Guide, Lead Guide, Campus Coordinator |
| Marketing | Website changes, approved media, packets, events, PR, brand | website operations (Yash), website agent operator (Matt), packet owner, events, PR and comms, brand authority (MacKenzie) |
| HubSpot | The Programs records that are the source of truth for campus state and facts; marketing events; email | HubSpot owner (Hailey McSpadden) |
| Expansion | Pre-announcement and announced campuses, launch dates, community destinations | new programs (Ashley Rahr), founding (rachel@alpha.school) |
| Web platform | Header and footer templates, layout, CSS, structural changes, WordPress admin | Elementor owner (not yet named), WordPress admin |
| Operations | The National Growth Map sheet and the map API | not yet named |
| QC | The production observer and its tickets | observer owner (Matt) |

## How a ticket finds its person

1. The validator classifies the ticket (`spec/ticket-classes.json`).
2. `spec/responsibilities.json` `ticketRouting` says which role supplies missing inputs, which role approves, and which role executes.
3. For campus roles, `registry/campus-leadership.json` names the person for the ticket's campus. For department roles, `registry/people.json` names the person.
4. The Missing Info note names that person. If the campus has nobody in the role (12 pages show no Dean of Parents, 17 no Director of Admissions), the note names the Head of Schools and the website operations owner, and the gap is recorded.

Campus staff submit tickets and supply what only they have: names, titles, bios, photos, effective dates, campus facts. They do not decide website structure or brand wording; those belong to marketing, brand, and web platform.

## Where the information comes from, and how to keep it current

| Source | What it gives | Access today |
| --- | --- | --- |
| Campus page Team sections (through the MCP) | The roster the public sees: names and titles per campus | Yes; re-run `spec/inventory` extraction |
| APEX requester history | Who actually submits for each campus, with emails | Yes; export from the APEX API |
| HubSpot owners and Programs contact properties | The official owner per program and the admissions contacts | No; the marketing token lacks the scopes. Ask Hailey for `crm.objects.owners.read` and the Programs object read scope |
| Slack directory | Titles and emails | Partial; the bot sees 28 members. Ask for `users:read` at workspace level |
| Named decisions | Who owns what by declaration | Recorded in `docs/decisions.md` |

Refresh the roster and requester extractions monthly, or whenever a staff ticket closes. A person with no role for 90 days is retired from the registry, not deleted.

## Open gaps

- Elementor owner and Operations owners are not named.
- Hailey's email is not recorded.
- Twelve campus pages have no Dean of Parents card and seventeen no Director of Admissions card. Either the role is vacant or the card is missing; each needs a ruling from the Head of Schools.
- Two placeholder staff cards were live on Austin and Palo Alto when this was written; tickets filed.
- Chelsea Winters appears as Dean of Parents on Bethesda, Carrollton, Franklin, Houston, and San Juan while a Bethesda ticket asks to remove her. Confirm which campuses she still covers.
