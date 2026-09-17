# Questions for staff: what the playbook cannot answer from the record

Date: September 17, 2026  
Compiled by: Matt Barge's website agent while writing `playbook/foundation/`  
Purpose: every item below is a fact or decision the foundation layer needs and that no repository, Slack export, meeting record, or system of record answers. Each names who should be asked and what the answer unlocks. Answers become decisions in `docs/decisions.md` and rules in `spec/`.

Grouped by who to ask. An item appears once under its primary respondent even when several people should weigh in.

## Ask Yash Chitneni (website operations)

| Id | Question | Why it matters | Unlocks |
| --- | --- | --- | --- |
| Q-04 | Who is the product owner of alpha.school as a product: the person who sets purpose, audience, priorities, and accepts or rejects requirements? Is it you, MacKenzie, Joe, or a role to be created? Is Joe Liemandt the executive sponsor? | Every open decision in `docs/decisions.md` is waiting on someone; today that is "Yash and Matt" by default | Charter section 6; unblocks Q-01, Q-03, Q-20 |
| Q-03 | What is the website accountable for? Booked calls, event registrations, applications started, waitlist sign-ups, search click-through, LLM citations, campus-truth defects, brand violations, or something else? Who looks at the number, and how often? | No outcome measure exists; the site cannot be judged better or worse after a change | Charter section 5; analytics owner scope |
| Q-13 | Campus and admissions staff control: (a) do Directors of Admissions have write access to HubSpot Program properties today, and should they; (b) may a campus request messaging changes to its page, or only facts and staff; (c) may a campus request functionality (a form, a booking link, a calendar embed); (d) who at a campus approves a staff add or removal when the Head of Schools is not the requester? | The control matrix says campus staff supply, marketing decides; that rule is inferred from practice, not stated by you | Control matrix section 2 becomes Confirmed |
| Q-14 | Who owns blog, news, and podcast landing pages editorially? Is there an editorial calendar, an approval path, and an expiry rule for podcast and press landing pages? | About 125 editorial URLs have no recorded owner | Editorial family owner; `pr-and-comms` role holder |
| Q-15 | Who approves a change to the Locations page or a map pin when the underlying HubSpot Program is correct but the map app or card renders it wrong? | The growth-map owner is unnamed; Locations tickets have no approver | Locations family status |
| Q-17 | Who are the WordPress administrators (11 on August 6, 2026), who holds the WP Engine account, who holds the Cloudflare account, and who is the DNS registrar contact? Should the admin list be reduced? | Eleven admins with no names is the largest unrecorded risk on the site | Origin section 3; `registry/people.json` wordpress-admin; least-privilege workstream |
| Q-18 | Who owns the Airtable base (Alpha Answers, video gallery), the Flipsnack account (info packets), the Goldcast account, and the Vercel team `alpha-school-admissions`? | Four production dependencies with no recorded owner | `registry/owners.json`, control matrix section 4 |
| Q-19 | Who designed and built the WordPress site, when did it launch, what preceded it (Finalsite, Substack, another CMS), and is anyone from that build still reachable? Also ask Garbhit Sharma and Hailey McSpadden. | No origin record exists at all; Austin and Miami sit on an older template nobody can explain | Origin section 1 |
| Q-20 | Is the Next.js refresh (`trilogy-group/alpha-school-website`, built by Garbhit from April 2026) sanctioned to replace production? Who sponsors it, and on what timeline? Also ask Joe. | Decides how deeply to document the WordPress design system and whether requirements should target both | Origin section 2; design-system scope |
| Q-21 | Where do the brand source documents live (MacKenzie's quiz workbook, the choices document, the April 1, 2026 style guide transcript, Dmitri's document), and can they be committed to `alpha-branding-skill`? Also ask Haven Mass. | The word-level rules cite documents no agent can open | Brand rules provenance |
| Q-22 | Should author pages (`/author/...`) be indexed? | They are in the sitemap today with no decision | Author family status |
| Q-23 | Should `/resources-austin/`, `/resources-miami/`, `/resources-brownsville/` exist as separate pages, or redirect to their campus pages? | Campus-scoped pages outside the campus template drift | Reference family |
| Q-25 | What is the title-tag pattern per page family? Today `/admission/` is titled "Private School in Austin" and New York City uses a different campus pattern from every other campus. | Detector cannot flag drift without a pattern | Site rules; observer check |
| Q-26 | Who owns the parent survey results page and when is it refreshed? | Dated proof ages | Reference family |

## Ask MacKenzie Price (brand authority), through Yash or Haven

| Id | Question | Why it matters | Unlocks |
| --- | --- | --- | --- |
| Q-01 | What is the primary next step the homepage and campus pages should drive: attend an event, book a call, apply, or a personalized path? The August 26 review recommended event-first because families cannot simply tour a campus. | Every page family's dominant CTA depends on it; today the homepage has six competing CTAs | Charter section 4; messaging section 8 |
| Q-07 | Confirm the official spelling and capitalization of Alpha Test, Test2Pass, TimeBack, Queue Breaks, Shadow Day, Alpha Experience; whether Shadow Day or Shadow Week language is approved for the public funnel; the current approved statistics and exact wording for the 2x and top 1% claims; and whether "programs" or "campuses" is the public noun for the network count. | These appear on live pages now with no approved form | Claim registry; brand detector rules |
| Q-08 | Guide proof model: curated "exceptional adults" proof or a staff directory? The August review rejected the directory for the homepage; the campus Team section is still a directory. Does the campus Team section stay as it is? | Determines whether staff-card tickets are maintaining the right thing | Campus Open team row; `/guides/` |
| Q-09 | Which approval and accreditation claims (Cognia, state approval, "top 1%") may appear per campus and per state, and who verifies them? | Regulatory claims on campus pages have no recorded source | Campus Open accreditation row; claim registry |
| Q-10 | Where do permission records for parent quotes, student quotes, and footage of children live, and who keeps them? | The proof standard requires them; none are recorded | Messaging section 6; video family |
| Q-12 | Does your authority cover site-level visual design (layout, typography, color usage, motion) or brand and wording only? If not you, who decides visual design for alpha.school? | Design has no named owner; the September 8 refresh feedback suggests you act in this role | Design system owner; Elementor owner gap |

## Ask Hailey McSpadden (HubSpot owner) and Farhan Raja (HubSpot program admin)

| Id | Question | Why it matters | Unlocks |
| --- | --- | --- | --- |
| Q-16 | Who is the admissions leadership owner for admissions-page copy, application routes, and forms? Is there a national admissions lead who should approve `/admission/`, `/admission-forms/`, `/high-school-application/`, and the Finalsite routing? | Admissions family has a system owner but no content approver | Admissions family status; control matrix |
| Q-05 | In which states may the site mention ESA or voucher funding, and in what words? | The payer context is in the ICP but never on a page | Messaging section 1; campus facts |
| Q-06 | Should re-enrollment and current-family forms live on alpha.school or on the Community app? | `/admission-forms/` and `/application-status/` serve enrolled families on a prospective-family site | Charter section 3; admissions family |
| Q-13a | (with Yash) Which HubSpot users can edit Program properties today? Export the list. | Confirms or refutes campus write access | Control matrix section 2 |

## Ask Brittany Goodman (events) and Crystle Dorsey (campus staffing)

| Id | Question | Why it matters | Unlocks |
| --- | --- | --- | --- |
| Q-02 | Which secondary audiences does the site deliberately serve: press, job seekers, city champions (`/bring-alpha-to-your-city/`), regulators? For each, who owns the funnel and follow-up? | Pages exist for audiences nobody has claimed | Charter section 3 |
| Q-24 | Who owns `/careers/`, and is it meant to recruit or to link to the hiring system? | Page with no owner or purpose | Careers family |
| Q-11 | Should a parent be asked their city first, have it inferred, or see the national story first? (Also MacKenzie.) | Determines the Localize stage design | Messaging section 9 |

## Ask Garbhit Sharma (events plugin, WordPress and Elementor finishing)

| Id | Question | Why it matters | Unlocks |
| --- | --- | --- | --- |
| Q-19a | What do you know about the site's build history, the older Austin and Miami template, and the plugin stack's origins? | You are the longest-tenured technical contributor on record | Origin section 1 |
| Q-17a | Which plugins are essential, which are legacy, and who installed `emcp-tools`, the Airtable video gallery, and the Life Skills widget? | `registry/plugins.json` has unknown production versions and owners | Plugin inventory |
| Q-12a | Will you hold the Elementor owner role for templates and layout, or who should? | Seven gaps trace to this one unnamed role | `registry/owners.json` |

## Already answered, recorded for completeness

- Who the site is for: prospective families, not enrolled families (Brainlift Insight 6; Tasha Arnold 2026-07-29).
- Campus facts truth: HubSpot Programs wins (decision 2026-09-15).
- Website operators may change HubSpot Program values and n8n mappings for website content, with a trailing audit (Yash, 2026-09-17).
- Campus staff supply, do not decide (`spec/responsibilities.json`; requester ledger).
- Info packet ownership: Matt Barge took the Canva team on 2026-08-27; edits are variable data, not language (Yash, same thread).

## How to answer

Reply in the APEX ticket or Slack thread that carries this list, or edit this file in a pull request. Each answer is recorded in `docs/decisions.md` with the date and the name, then applied to `spec/` and the relevant `playbook/` file. Unanswered items stay Open; the playbook keeps failing closed on them.
