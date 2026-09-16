# Campus page controls: every button and where its link comes from

Machine form: `spec/campus-page-controls.json`, from a crawl of 44 live campus pages on 2026-09-16. Element ownership (who writes the widget) is in `playbook/campus-page/field-map.md`; this page is about the destinations.

| Control | Where | CSS ID | Destination pattern | URL source | Writer | Owner | Pages |
| --- | --- | --- | --- | --- | --- | --- | --- |
| STAY IN-THE-KNOW | hero CTA row |  | # (opens the HubSpot popup form; no navigation) | HubSpot form embed (leadin / hubspot-content-embed) | wordpress-direct | hubspot-owner (form) / website-operations (placement) | 44 |
| Attend an Info Session | hero CTA row |  | #events (scrolls to the campus event strip) | fixed anchor; the strip itself is the events plugin | n8n-sheet (attend_cta_button text) / wordpress-direct (hero copy) | website-operations | 51 |
| Book a Call | hero CTA row (and lower CTA rows) |  | https://go.alpha.school/<meetings path>[?uuid=<id>] (HubSpot meetings page for the campus); Dorado points at t | HubSpot Program call_scheduling_link (n8n drives show/hide and URL since 2026-03; Cristi 2 | n8n-hubspot | hubspot-program-admin (link value) / hubspot-owner (meetings page) | 71 |
| Apply now | hero CTA row |  | #resources (scrolls to the resources block where APPLY TODAY! lives); one page links the application directly | fixed anchor | wordpress-direct | website-operations | 45 |
| APPLY TODAY! (also Apply today, Apply for K-8, A | resources block | resource_4 | https://alpha.school/application/?submission_campus=<slug> (32); https://alpha.school/application-fs/?submissi | HubSpot Program admission_link (n8n writes resource_4 link.url); the route behind it is le | n8n-hubspot | hubspot-program-admin | 44 |
| ADMISSION GUIDE | resources block |  | https://alpha.school/admissions/ (site-wide page) | fixed | wordpress-direct | website-operations | 44 |
| 2026/27 INFO PACKET, 2025/26 INFO PACKET, INFO P | resources block | resource_1 (and a second slot on pages with two years) | Flipsnack (www.flipsnack.com/BADA559BDC9/<packet>) on 56 buttons; alpha.school-hosted PDF on 5; Google Drive o | packet-owner publishes the approved packet; APEX CampusPacketProfile holds pdfUrl and word | wordpress-direct | packet-owner | 64 |
| 2026/27 CALENDAR (variants 26/27 CALENDAR, 2026- | resources block | resource_2 | https://alpha.school/wp-content/uploads/calendars/2026_27/2026-2027-Calendar-<Campus>.pdf (33); Google Drive o | calendar A or B per campus (Admissions Hub calendar table; APEX INFO_PACKET_CALENDARS A =  | wordpress-direct | calendars | 37 |
| SEE ALL UPCOMING EVENTS | events strip |  | https://alpha.school/programs-events/ (redirects to /upcoming-events/) | fixed | wordpress-direct | website-operations | 44 |
| SEE MORE STORIES FROM ALPHA PARENTS / EXPLORE TH | video gallery |  | #videogallery; https://alpha.school/video-library/ | fixed | wordpress-direct | website-operations | 110 |
| CONTACT ADMISSIONS | contact block (older template) |  | https://alpha.school/admission/ | fixed | wordpress-direct | website-operations | 3 |
| JOIN THE COMMUNITY | Announced or Pre-Announcement pages |  | https://community.alpha.school/?preferred_campus=<Campus display name> | HubSpot Program community_url (growth map communityUrl) | n8n-hubspot (candidate; confirm) | expansion-new-programs / community-app-owner | 8 |

## How to read a control request

- **Book a Call**: the URL is the HubSpot Program `call_scheduling_link` and n8n writes it. A wrong or missing Book a Call is a HubSpot data ticket (Farhan), and the meetings page itself belongs to the HubSpot owner. Dorado is the known exception (links to events).
- **Apply**: the button is n8n-written from `admission_link`; the route behind it is one of three (legacy WordPress form, Finalsite redirect, HubSpot redirect form) and is owned by the HubSpot program admin. The `submission_campus` slug must match the form's campus configuration. Never change the button without testing the route through to the intended campus.
- **Admission guide, Contact admissions, See all events, video links**: fixed site routes, WordPress-direct, website operations.
- **Info packet and calendar**: WordPress-direct links to documents owned elsewhere (`playbook/site/info-packets.md`). The website change is only the link swap after the document is approved.
- **Stay in-the-know and Attend an info session**: anchors, not navigation. One opens the HubSpot popup form, the other scrolls to the events strip.
- **Join the community**: pre-open pages only; the destination is the Program's community URL and is checked by the observer's community checks.

Anything not in this table is not a known control; a ticket asking for a new button is a layout change for the Elementor owner, not a content edit.
