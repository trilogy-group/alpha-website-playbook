# Info packets and calendars

Machine forms: `registry/campus-packets.json` (per-campus links with logged-out status, read 2026-09-16), `spec/campus-page-controls.json` (`resources.info-packet`, `resources.calendar`). Ticket class: `packet` (`spec/ticket-classes.json`).

## What a packet is and where it lives

| Thing | Where | Owner |
| --- | --- | --- |
| The 2026-27 masters | Canva, Alpha Marketing team: "WORKING COPY - APEX Autofill - Calendar A - 2026-2027" (DAHT_7CFWmY) and "MASTER - Alpha Campus Info Packet - Calendar B - 2026-2027" (DAHThjCo7Dw). Calendar A and B are the two school-year calendars (A = the San Francisco PDF, B = the Santa Barbara PDF, per the APEX template config). | packet-owner (Yash Chitneni, since 2026-10-07: Matt Barge, "info packets are all yash"; Matt Barge held it 2026-08-27 to 2026-10-07) |
| The per-campus profile | APEX `CampusPacketProfile`: school year, calendar variant, currently enrolling grades, sibling discount, first payment date, rolling admissions, cover image, learn-more and apply QR destinations, Canva design URL, PDF URL, WordPress URL, status, approver and approval time, and a HubSpot snapshot refreshed every 30 minutes | packet-owner; approval recorded in APEX by a person |
| The variable data | HubSpot Program: school_address, start and end grade, tuition, enrollment_deposit, application_fee, email, contact_number, school_year_start and end, website, admission_link | hubspot-program-admin (Farhan Raja) |
| Generated PDFs | Supabase storage bucket (APEX), then published to alpha.school uploads or Flipsnack | packet-owner |
| Published packets on the site | Flipsnack account BADA559BDC9 on 56 of 64 packet buttons; alpha.school-hosted PDFs on 5 (Chicago, Fort Worth, Kirkland, Raleigh, Southlake, the APEX-generated ones); Google Drive on 3 | website-agent-operator swaps the link; packet-owner supplies it |
| The 2025-26 packets | Flipsnack, Canva design DAG1VqFXhv8 (last updated about four months before 2026-08-27 by Dmitry Bakaev) | historical; leave as is |
| Collateral (flyers, trifolds, one-pagers) | Chris Davidson (marketing-collateral) through the Marketing Collateral request type | not packets; different owner |

## Rules

1. **No unapproved packet is linked publicly; approval is per campus.** MacKenzie Price gave final sign-off on the 2026-27 packet masters on 2026-09-25. From then on a Dean of Parents approving their campus packet in APEX generates the packet and publishes it on their campus page; a campus whose DOP has not approved keeps its 2026/27 button hidden (the approved interim state, `registry/campus-packets.json` `interimPolicy`), and a visible button on a campus without that approval is a defect. The per-campus read below is from 2026-09-16 and is refreshed as approvals are read back. (Before the sign-off: as of 2026-09-16 no 2026-27 packet was approved and twenty Open pages showed a visible button.)
2. **The placeholder stays hidden.** The template carries a button labeled "INFO PACKET - update link"; it is responsive-hidden on all devices until an approved packet exists. A visible placeholder is a defect.
3. **Packet facts follow the HubSpot Program.** The APEX generator reads start and end grade, tuition, fees, address, email, and phone from the Program record. A packet that disagrees with the record is regenerated, not hand-edited. Which grade property packets state is part of the pending grade-property decision (APEX cmu4g13kc00000agmdogkxihp).
4. **Approval is a person in APEX**, recorded on the profile. Brand review before that is the marketing meeting (MacKenzie Price and Joe), per Brittany Goodman on 2026-08-27.
5. **A packet ticket is packet work, not a page edit.** The website part is the link swap after approval, verified logged out (200, right campus, right year).
6. **Calendars** are per campus, variant A or B, published as alpha.school PDFs under `wp-content/uploads/calendars/2026_27/`. Google Drive calendars must be public; four return 401 today. Announced campuses without a calendar hide the button.

## Per-campus links (read 2026-09-16, logged out)

| Campus | State | 2026/27 packet | 2025/26 packet | Placeholder | Calendar |
| --- | --- | --- | --- | --- | --- |
| atlanta | Open | hidden www.flipsnack.com [200] | none | hidden | alpha.school [200] |
| austin | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| bethesda | Announced | none | none | hidden | none |
| boca-raton | Open | none | none | hidden | alpha.school [200] |
| boston | Open | none | none | hidden | alpha.school [200] |
| boston-suburbs | Announced | none | none | hidden | hidden drive.google.com [401] |
| brownsville | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| carrollton | Announced | none | none | hidden | none |
| chantilly | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| charlotte | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| chicago | Open | alpha.school [200] | none | hidden | alpha.school [200] |
| denver | Open | none | none | hidden | alpha.school [200] |
| dorado | Open | www.flipsnack.com [200] | none | none | alpha.school [200] |
| east-bay | Open | www.flipsnack.com [200] | none | hidden | alpha.school [200] |
| fort-worth | Open | alpha.school [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| franklin | Announced | none | none | hidden | none |
| greenwich | Open | none | none | hidden | alpha.school [200] |
| highland-park | Open | none | none | none | alpha.school [200] |
| houston | Announced | none | none | hidden | none |
| jamaica-plain | Announced | none | none | hidden | none |
| kirkland | Open | none | none | none | alpha.school [200] |
| la-jolla | Open | none | none | hidden | hidden alpha.school [200] |
| lake-travis | Announced | none | none | hidden | alpha.school [200] |
| malibu | Open | none | none | hidden | hidden alpha.school [200] |
| miami | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| miami-beach | Open | none | none | hidden | alpha.school [200] |
| nashville | Open | none | none | hidden | none |
| new-york-city | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| oklahoma-city | Open | none | none | hidden | drive.google.com [401] |
| orange-county | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| palm-beach | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| palo-alto | Open | www.flipsnack.com [200] | none | hidden | alpha.school [200] |
| park-city | Open | none | none | hidden | alpha.school [200] |
| plano | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| raleigh | Open | alpha.school [200] | none | none | alpha.school [200] |
| san-francisco | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| san-juan | Announced | none | none | hidden | none |
| santa-barbara | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| santa-monica | Open | hidden www.flipsnack.com [200] | none | hidden | alpha.school [200] |
| scottsdale | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| south-bay-la | Open | none | none | VISIBLE | drive.google.com [401] |
| southlake | Open | alpha.school [200] | none | hidden | alpha.school [200] |
| the-woodlands | Open | www.flipsnack.com [200] | hidden www.flipsnack.com [200] | none | alpha.school [200] |
| tulsa | Open | none | none | hidden | drive.google.com [401] |

Findings from this read: four calendars return 401 (Boston Suburbs, Oklahoma City, South Bay LA, Tulsa, all Google Drive); seven Announced pages have no calendar button (expected); Highland Park has no packet button at all; Kirkland's only packet is an alpha.school PDF without a school-year label. The existing Oklahoma City, Tulsa, and South Bay LA packet tickets describe the calendar links, not the packets; they need re-titling.

## Who to ask

| Question | Role | Person |
| --- | --- | --- |
| Is this packet approved; when will the 2026-27 batch be done | packet-owner | Yash Chitneni |
| Has this campus's DOP approved its 2026-27 packet (generates and publishes it) | dean-of-parents, live | the campus Dean of Parents; Yash Chitneni sends the notifications |
| Current Canva master, template edits | website-operations | Yash Chitneni |
| A fact in the packet (tuition, grades, address) | hubspot-program-admin | Farhan Raja |
| Flyers and trifolds | marketing-collateral | Chris Davidson |
| Calendar PDF for a campus | calendars | Zara Raheem |
