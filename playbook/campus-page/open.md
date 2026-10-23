# Open Campus Page Requirements

State: Open, as decided by HubSpot Programs. Machine form: `spec/campus-page-requirements.json`.

Rows sourced from a named decision or system rule are active. Rows sourced only from the 44-page live inventory are an observed baseline and still need owner approval before an agent restructures a page to match them.

| Section | Requirement | Source | Owner when missing | Checks | Exemplar |
| --- | --- | --- | --- | --- | --- |
| Hero identity | H1 "Alpha Campus"; subtitle "grade range Private School in City, State" with HubSpot values | HubSpot Programs | Program record owner | page-check h1, observer heading and grade sync | Plano, Scottsdale |
| Hero CTAs | STAY IN-THE-KNOW, Attend an Info Session, Book a Call, Apply now; all reachable and campus-specific | Demonstrated-correct pages | Admissions owner; Elementor owner | page-check CTAs and link resolution | Plano |
| Intro status sentence | The campus's enrollment-state sentence first, then the info-session paragraph; no launch-era words on the page. Enrolling: "Alpha Campus is open and enrolling." Waitlist: "Alpha Campus is open, and we’re accepting applications for our 2026–27 waitlist. Apply for future enrollment, and our admissions team will guide you through the next steps." verbatim, and no other waitlist wording | HubSpot state Open; enrollment state from `registry/campus-enrollment-state.json` (MacKenzie Price, 2026-10-05); exemplar wording | None, both wordings are fixed | page-check status sentence and launch words; observer `campus-source-status-sentence` and `campus-page-status-sentence`; observer stale-launch | Denver (enrolling), Boca Raton (waitlist) |
| Enrollment state | All four elements agree: the intro sentence, the top banner application button, the resources-section application buttons, and the intro card. Waitlist campuses read "Apply for [segment] waitlist" on every apply control and show the waitlist card; every other Open campus carries no waitlist wording and no waitlist card | MacKenzie Price 2026-10-05 (the 13 campuses); Yash Chitneni, same thread (the four elements); `registry/campus-enrollment-state.json` | Website operations for the copy; Yash Chitneni for the card | page-check `open-enrollment-state-controls`; observer `campus-enrollment-state-controls`; `campus.intro.media.current` for the card | Boca Raton |
| Intro media | The campus's "Open and Enrolling" card or an approved campus video; never a launch graphic, another campus's image, or unrelated footage | Media registry | Yash (cards) | page-check media; observer stale-launch, video, image identity | Boca Raton, Raleigh |
| Intro heading | "Welcome to the Future of Education in City" (held: the word "education" is MacKenzie's call) | Demonstrated-correct pages | None | Screenshot | Plano |
| Header and footer | Theme-builder header with stylesheet, logo, nav, Contact Us; footer | Atlanta incident | Elementor owner | page-check header stylesheet, footer | Any |
| Info packet | When an approved packet exists, the CTA opens a public document for this campus and year | Requirement catalog; replay found 401s | Packet owner | page-check links; observer packet checks | Plano |
| Top section | Optional. Its absence alone is not a defect. Any visible content follows the source and seasonal rules. | Live inventory: present on 29 of 44 pages | Content owner | Whole-page and seasonal checks | None approved |
| Founding families | Parent-proof section remains present when the approved template includes it; videos and claims must be approved and playable | Live inventory: present on 44 of 44 pages | Brand and website operations | Screenshot, links, media, claim checks | Needs approval |
| Events | Campus strip is present and scoped to the exact HubSpot program-interest label; public events match HubSpot | HubSpot event-import contract | Events plugin owner | Event sync and campus filter checks | Any verified scoped page |
| Contact and resources | Address, phone, email, map, Apply, booking, calendar, Community, and packet values come from their exact field-map sources; optional controls appear only when a verified destination exists | HubSpot, field map, packet and Community registries | Field-specific owner | Source diagnosis, logged-out link, schema and map checks | Needs approval |
| Team | Only approved current staff cards; exact name, public title, bio, photo, and order; no placeholders or crossed photos. Order: the people present and involved at the campus first: Director of Admissions and Dean of Parents at the top, then the head or lead guide and the other campus-present cards in the carousel, and the Head of Schools who appears across many campuses (Dr. Tasha Arnold) last; a campus-present head of school (Brownsville, Paige Fults) stays in the leadership row (MacKenzie Price, 2026-09-25, clarified by Matt Barge 2026-09-30; `campus.team.order`) | APEX staff request and campus role owner; team order decision 2026-09-25, clarified 2026-09-30 | Dean of Parents, then Head of Schools; website operations for placement | Same-card MCP verification, desktop and mobile; Team section screenshot for order | Needs approval |
| Guide videos | "Meet Your Alpha City Guides" section with each guide's "Welcome to Alpha, I'm your guide" video, on every campus page from one template (advisory until the source is registered) | MacKenzie Price 2026-09-25; Chris Moss's campus guide video sheet (`registry/sources.json` campusGuideVideos, unregistered) | Sheet owner (Chris Moss) for the video; website operations for the section | Manual until the source is registered | Raleigh |
| Video gallery | Approved Alpha and campus-relevant records imported from Airtable; no wrong-campus or sister-brand content | Airtable video pipeline and site identity rules | Website operations | Import, media, identity and link checks | Needs approval |
| Photo gallery | Optional until approved assets exist; every visible image has rights, campus identity, alt text, and an acceptable crop | Approved media source and media standard | Photography and website operations | Media identity, render, crop, desktop and mobile | Needs approval |
| Lower section | Retains the approved template structure and contains no stale launch, seasonal, cross-brand, or unapproved claim content | Live inventory: present on 42 of 44 pages; site rules | Elementor and content owner | Whole-page, brand, seasonal and claim checks | Needs approval |
| Accreditation | Candidate and accredited states reflect `cognia_accredited`; mutually inconsistent badges cannot be visible | HubSpot Program through n8n | HubSpot Program and n8n owners | Source read, CSS-ID presence and screenshot | Needs approval |
| SEO and schema | Unique campus title and description, canonical URL, semantic H1, indexable state, School schema matching source facts, sitemap entry | Site rules and HubSpot campus facts | Website operations or n8n owner by field | Metadata, canonical, schema, sitemap and Googlebot parity | Needs approval |
| Global header and footer | Shared templates and styles render normally; never modified under the campus ticket | Shared template rule and Atlanta incident | Elementor owner | Header stylesheet, footer and ring 3 | Any healthy campus page |

## Enrollment state: enrolling or waitlist

An Open campus is in one of two named enrollment states. `type` stays **Open** for both; waitlist is not a lifecycle
type, nothing about the page family changes, and every requirement above still applies. Decided by MacKenzie Price on
2026-10-05 ("Please update the website with the following locations now on Waitlist: Austin High School, Boca Raton,
Boston, Dorado, New York, Palo Alto, Park City, Plano, Raleigh, San Francisco, Scottsdale, The Woodlands, Tulsa"),
relayed and confirmed by Matt Barge, and recorded in `docs/decisions.md` with the fixture
`tests/fixtures/decisions/recorded/2026-10-05-campus-enrollment-state-48a1221b.json`.

Admissions set the policy in the same thread (Rachel Goodlad): the process does not change, families still complete the
existing application, and the only new fact is that there is no immediate enrolment. It applies to 2026-27. It is a
campus-level announcement, never a per-family state shown on the site.

The state is **four coordinated elements**, not one sentence (Yash Chitneni's list of what he changed):

| Element | Enrolling | Waitlist |
| --- | --- | --- |
| `intro.status-sentence` | "Alpha Campus is open and enrolling." | the approved waitlist sentence, verbatim |
| `hero.ctas` top banner application button | "Apply now" and its variants | "Apply for waitlist" |
| `resources.apply` application buttons | "APPLY TODAY!" and its variants | "Apply for [segment] waitlist" |
| `intro.media` enrolment graphic | the Open and Enrolling card | the `<slug>-waitlist-2026-27` card |

A page carrying some of the four and not the others is a finding, and so is the inverse: an Open campus that is **not**
on the list must carry no waitlist button label, no waitlist copy and no waitlist card.

**Leaving the waitlist.** A campus comes off the waitlist only with MacKenzie Price's approval on the Thursday sales call. Until that approval is recorded, its page keeps all four waitlist elements, whoever asks for the change. Source: Slack [C09CJCDD1L0/1792510867.689729](https://go-alpha.slack.com/archives/C09CJCDD1L0/p1792510867689729).

### Why membership is in a registry and not read off the page

**No HubSpot Program property records enrollment state.** `campuspipelinestatus` and `student_capacity` both cut
straight across the two groups: read on 2026-10-05, Transitioned covers 5 waitlist and 10 enrolling campuses and Build
Mode covers 5 and 12, and capacity runs 21-195 on waitlist against 10-193 on enrolling. None of the 151 Program
properties is about enrollment state. So on the source side the only signal that a campus is full is the sentence
somebody typed, and a rule that simply accepted both wordings could no longer catch a campus whose sentence is wrong in
either direction: a full campus still advertising enrolment, or a campus that reopens and still says waitlist. That is
the same class of defect as 2026-09-28, when a hand-typed field silently contradicted the Program state.

Two things keep the rule as strong as the data allows:

1. **`registry/campus-enrollment-state.json`** is a second, versioned source of membership, from MacKenzie's named list
   and nothing else. The checks measure each page against that list, not against the copy they are checking. It is a
   hand-maintained stopgap and says so.
2. **Only the approved waitlist wording passes.** Not any sentence containing "waitlist": the whole sentence pair,
   verbatim, with only the subject wildcarded and typography folded. The school year is part of the wording, so a stale
   year fails. Waitlist language that is not the approved wording fails. A page claiming both states fails. Every other
   clause of the old rule, including the requirement that the sentence name this campus, is still enforced.

The real fix is derivation. `registry/sources.json` `hubspotPrograms.enrollmentStateField` is `null` with the exact ask:
a single-select `enrollment_state` on Programs with the values `enrolling` and `waitlist`. Yash Chitneni already put
that ask to Rachel Goodlad on 2026-10-05 ("no dedicated campus waitlist switch. Should we add a campus-level setting in
HubSpot to manage this consistently?") and it is unanswered, so the ask is live with admissions, not new.

**Alpha High School** is the 13th name on MacKenzie's list and is not an alpha.school campus page: it is
`https://alphahigh.school`, with no campus-page row and no n8n campus-page delivery. Its HubSpot Program carries the
approved waitlist sentence, but that site read on 2026-10-05 contains no waitlist wording at all. No check here covers
it; it is recorded in `registry/campus-enrollment-state.json` under `offSite` so the gap is visible.

Announced campuses differ in one row: the status sentence names a month or season and a year (`playbook/campus-page/announced.md`, to be written).
