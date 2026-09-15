# Campus Page Model

Derived on September 15, 2026 from the live Elementor structure of 44 campus pages, read through the Alpha WordPress MCP. Machine form: `spec/campus-page-model.json`. Raw inventory: `spec/inventory/campus-pages-2026-09-15.json`.

This page describes what the template is. It does not yet say what each section must contain per campus state; that is the requirements matrix (M3).

## Sections, in canonical order

| # | Section (Elementor container title) | On pages | What it holds |
| --- | --- | --- | --- |
| 1 | Home Hero | 44 of 44 | Campus name as H1, subtitle "K-8 Private School in City, State", hero background, CTA row |
| 2 | Top section | 29 of 44 | Optional strip above the intro; contents vary by campus |
| 3 | Center section | 42 of 44 | Intro heading "Welcome to the Future of Education in City", body copy, the campus status sentence, the "Join us for an info session" paragraph, and the intro card slot |
| 4 | FoundingFamilies | 44 of 44 | "See How Alpha Transforms Kids" with three parent proof videos |
| 5 | Events | 44 of 44 | Campus event strip fed from HubSpot events for this campus |
| 6 | Contact and resources | 42 of 44 | Contact (address, phone, email), resources (info packet, calendar, booking), map |
| 7 | Team | 44 of 44 | Staff cards: photo, "Name \| Title" heading, bio, optional quote |
| 8 | videogallery | 44 of 44 | Airtable video gallery |
| 9 | Gallery | 42 of 44 | Photo gallery |
| 10 | Lower section | 42 of 44 | Closing CTA block |
| 11 | cognia_candidate | 44 of 44 | Accreditation candidate badge, shown when applicable |
| 12 | cognia_yes | 44 of 44 | Accreditation badge, shown when accredited |

Off-page surfaces that belong to the same campus and must agree with the page: the homepage and Locations map pin, the Locations page card (name, grade range, tuition), the page title and meta description, School schema, social preview, and the sitemap entry.

## Hero CTA row

Present on all 44 pages: STAY IN-THE-KNOW, Attend an Info Session, Apply now. Book a Call is on 39 pages (spelled two ways, "Book a Call" and "Book A Call"). Three pages show Join The Community and one shows Contact Admissions instead.

## The intro status sentence

The first paragraph of the Center section names the campus state. Observed on September 15, 2026:

| Sentence pattern | Pages |
| --- | --- |
| "Alpha City is open and enrolling." | 27 |
| "Alpha City is launching in Fall 2026." | 5 (before the group A fix; Chicago still reads this way) |
| "Alpha City is coming soon." | 3 (Franklin, San Juan, Houston Heights) |
| "Alpha Bethesda opens January 2027." | 1 |
| Other one-off wording | 7 |

Two approved patterns exist today: "is open and enrolling." for Open campuses, and a launch statement that names the month and year for Announced campuses. Everything else is a candidate for cleanup once the requirements matrix is approved.

## The intro card slot

The image beside the video widget in the Center section. Observed:

- 14 pages: the campus's "Open and Enrolling" card from the September 7 set made by Yash Chitneni.
- 15 pages: a campus video only, no image.
- 13 pages: an older image, several of them "Coming Fall 2026" or "coming soon" graphics (Atlanta, La Jolla, Santa Monica, Franklin, Carrollton, San Juan and others).
- 2 pages: no Center section at all (Austin, Miami use an older layout).

## Variants that deviate from the canonical order

- Austin and Miami use an older template with unnamed sections and two Team sections.
- Kirkland has three extra unnamed sections at the end.
- Chicago has a "Visible Blogs and News" section; Greenwich has an "In the News" section.
- Section order differs in small ways on 20 pages (Gallery before Team, or Top section absent). None of these are known to be wrong; whether they are allowed is a requirements decision.

## Staff cards

Counts range from 1 (Atlanta, Dorado, Lake Travis, Nashville, Park City) to 21 (Miami, New York). Every card is a heading in the form "Name | Title", which is what the MCP staff tools and the observer key on.

## Pages that could not be read

`austin-founders` and `lexington` have no published WordPress object at those paths. The Locations page links them; the map calls Lexington's page `boston-suburbs`.
