# Open campus page requirements (partial)

State: Open, as decided by HubSpot Programs. Machine form: `spec/campus-page-requirements.json`. Rows written so far are the ones the September 15 launch-copy tickets exercised; the remaining sections follow.

| Section | Requirement | Source | Owner when missing | Checks | Exemplar |
| --- | --- | --- | --- | --- | --- |
| Hero identity | H1 "Alpha Campus"; subtitle "grade range Private School in City, State" with HubSpot values | HubSpot Programs | Program record owner | page-check h1, observer heading and grade sync | Plano, Scottsdale |
| Hero CTAs | STAY IN-THE-KNOW, Attend an Info Session, Book a Call, Apply now; all reachable and campus-specific | Demonstrated-correct pages | Admissions owner; Elementor owner | page-check CTAs and link resolution | Plano |
| Intro status sentence | "Alpha Campus is open and enrolling." first; then the info-session paragraph; no launch-era words on the page | HubSpot state Open; exemplar wording | None, wording is fixed | page-check status sentence and launch words; observer stale-launch | Plano, Scottsdale |
| Intro media | The campus's "Open and Enrolling" card or an approved campus video; never a launch graphic, another campus's image, or unrelated footage | Media registry | Yash (cards) | page-check media; observer stale-launch, video, image identity | Boca Raton, Raleigh |
| Intro heading | "Welcome to the Future of Education in City" (held: the word "education" is MacKenzie's call) | Demonstrated-correct pages | None | Screenshot | Plano |
| Header and footer | Theme-builder header with stylesheet, logo, nav, Contact Us; footer | Atlanta incident | Elementor owner | page-check header stylesheet, footer | Any |
| Info packet | When an approved packet exists, the CTA opens a public document for this campus and year | Requirement catalog; replay found 401s | Packet owner | page-check links; observer packet checks | Plano |

Announced campuses differ in one row: the status sentence names a month or season and a year (`playbook/campus-page/announced.md`, to be written).
