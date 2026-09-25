# Origin and Ownership

Status: what is Confirmed is cited; what is Observed is dated; the rest is an Open question. Last verified September 17, 2026. This file exists because no document in either repository says who built alpha.school, when, or on what, and because the people who hold the keys today are recorded by role but often not by name.

## 1. What is known about how the site was built

| Question | Answer | Status |
| --- | --- | --- |
| Who originally designed alpha.school? | Not recorded anywhere. No designer, agency, or creative team is named in either repository, in the Brainlift, or in the Slack exports reviewed. | Q-19 |
| Who originally built the WordPress site? | Not recorded. | Q-19 |
| When did it launch, and was it migrated from another platform? | Not recorded. The oldest published post in the URL inventory is dated September 8, 2025, which bounds the content, not the site. Three campuses' application routes are described as "Finalsite-migrated," which implies an earlier Finalsite admissions stack. A "Substack import" and a "menu migration" appear among admin workflows in the August 2026 admin inventory. | Q-19 |
| Who has developed it since? | Cecilia De Grandis, former web developer: built and updated the custom HubSpot events sync plugin and the Locations page with map in 2025, and the video gallery plugin; no activity after January 2026 (`registry/people.json`, source `#admin-websites` 2025-08 to 2025-12). Garbhit Sharma: events plugin owner, WordPress and Elementor finishing (`registry/people.json`). Yash Chitneni: website operations. Matt Barge: agent operator, Alpha WordPress MCP author. | Confirmed |
| What is it built on? | WordPress 7.0.x, Genesis Block Theme, Elementor 4.1.1 and Elementor Pro, ElementsKit, ACF, WPCode, Yoast SEO Premium, Site Kit by Google, HubSpot content embed, a custom `ahse-events` widget, `emcp-tools`, an Airtable video gallery plugin, a Life Skills curriculum widget, the Redirection plugin. 43 plugins, 32 active, on August 6, 2026. Hosted on WP Engine behind Cloudflare. | Observed 2026-08-06 and 2026-09-17 |
| Is there a design system? | No tokens file, no component library, no Storybook, no documented Elementor global styles. Design lives in the Elementor kit and in two brand documents (Alpha Event Design Guidelines; the `alpha-branding-skill` repository, whose portfolio marks Alpha as "guidelines in progress, controlled draft"). See `design-system.md`. | Observed |
| Are there two pages on an older template? | Yes: Austin and Miami (`docs/findings-2026-09-15.md`). Whether they are the original template or a later variant is Q-19. | Observed |

## 2. The Next.js refresh (not live)

A production rebuild of alpha.school on Next.js, React, Tailwind, Payload CMS, Supabase, and HubSpot, deployed to Vercel, lives at `trilogy-group/alpha-school-website`.

| Fact | Detail | Source |
| --- | --- | --- |
| Started | April 20, 2026, first commit "intial Plan" by Garbhit Sharma (`sudogarbhit`) | git history |
| Built by | Garbhit Sharma authored about 22 of 28 commits between April 20 and May 20, 2026: campus pages, admissions page, team bios, HubSpot forms, campus map, events sync, blog | git history |
| Continued by | Yash Chitneni merged PR 3 on July 21, 2026; Matt Barge added video resource pages (July 21), Alpha Answers navigation (August 4), a marketing experience refresh (August 5), Learning Science Summit registration (August 13) | git history |
| Design direction | MacKenzie Price's September 8, 2026 feedback and a light-blue treatment were incorporated in a September 9 preview; the Vercel team is `alpha-school-admissions` | Nessie transcripts 2026-09-09; browser review 2026-08-28 |
| Status | Discovery baseline as of August 6, 2026: "a credible design and technical prototype, but not yet a production-equivalent replacement"; 99 missing production paths, 18 missing campus routes, no analytics, consent, or chat, no implemented CMS. All 12 marketing decisions and 6 operations decisions Pending. WordPress stays authoritative until every release gate passes. | marketing workspace `docs/migration/README.md`, `marketing-decisions.md` |
| Variants | Four sibling working copies exist locally (dynamic redesign, refresh light blue, tagline preview, Alpha Answers Huberman), all from the same April 20 root, last touched August 31 to September 9, 2026 | local filesystem |

Why this matters for the playbook: the refresh was designed and built by the same person who owns the events plugin, with brand approval from MacKenzie. It is the closest thing to a recorded design intent for the site, and none of it has been captured as requirements. Q-20 asks whether the refresh is sanctioned to replace production and on what timeline, because that decides whether the WordPress design system in `design-system.md` is worth documenting deeply or only maintaining.

## 3. Who holds the keys today

| Layer | Role | Person recorded | Notes |
| --- | --- | --- | --- |
| WordPress administrators | wordpress-admin | 11 administrators, 1 editor, 3 authors on 2026-08-06; names deliberately not recorded in the sanitized inventory | Q-17. Plugin 0.5.0's access report will list them once deployed |
| WordPress user used by the agent | Alpha MCP executor | Matt Barge's user (id 34) in operator mode | `docs/environments-and-identities.md` |
| WP Engine account (production and staging `alpha20245stg`) | wordpress-admin | Not recorded | Q-17 |
| Cloudflare account, DNS, registrar | platform | "Engineering" in the integration register; no person | Q-17 |
| HubSpot portal 40051392 | hubspot-owner | Hailey McSpadden | Confirmed |
| HubSpot Programs object, forms, Finalsite routing | hubspot-program-admin | Farhan Raja | Confirmed |
| n8n campus sync workflow | n8n-sync-owner | Cristi Constantin, Dmitry Bakaev | Confirmed |
| Events plugin and HubSpot Marketing Events import | events-plugin-owner | Garbhit Sharma | Confirmed |
| Growth map API and map app | growth-map-owner | Not named ("Operations") | Gap |
| Community app | community-app-owner | Not named | Gap |
| Airtable (Alpha Answers, video gallery) | not defined | Not recorded | Q-18 |
| Canva (info packets, collateral) | packet-owner, marketing-collateral | Canva team transferred to Matt Barge on 2026-08-27; Chris Davidson produces collateral | Confirmed |
| Flipsnack (packet hosting, account BADA559BDC9) | not defined | Not recorded | Q-18 |
| Goldcast (events registration) | events | Assumed events team | Q-18 |
| Google Tag Manager, Site Kit, ad pixels, consent | analytics-and-consent-owner | Not named | Gap |
| Voiceflow chatbot | platform-owner | Not named | Gap |
| Google Business profiles | various | Cristian-Gabriel Constantin (primary owner), Dmitry Bakaev, Yash Chitneni (owners); Matt Barge, Monica La Vella, Rio SEO (managers) | Confirmed, `docs/google-business/README.md` in the marketing workspace. Rio SEO is the only third-party vendor named anywhere |
| GitHub organization trilogy-group | github-admin | Fernando | Confirmed |
| Vercel team alpha-school-admissions | not defined | Not recorded | Q-20 |
| Brand source documents (MacKenzie's quiz workbook, choices document, April 1, 2026 style guide transcript, Dmitri's document) | brand-authority | Held by Yash and Haven; not in any repository | Q-21 |

## 4. Ownership by department (summary)

From `playbook/responsibilities.md`. Departments own areas; roles within them own, approve, or supply.

- **Marketing** owns website changes, media, packets, events, PR, brand. Website operations (Yash), agent operator (Matt), brand authority (MacKenzie).
- **HubSpot** owns the Programs records that are the truth for campus state and facts, marketing events, and the n8n sync.
- **Campus leadership** owns who is on the campus page and the campus facts, and supplies them. Not in charge of website choices.
- **Expansion** owns pre-announcement and announced campuses, launch dates, Community destinations.
- **Web platform** owns templates, layout, CSS, structural changes, WordPress admin, the events plugin stack, Community routing. Elementor owner and Community app owner are not named.
- **Operations** owns the National Growth Map sheet and map API. Not named.
- **QC** owns the observer and its tickets (Matt).

The observer checks presence, not absence, and starts from the source, not from the site (decision 2026-09-25, Matt Barge, after the East Bay launch card reached a meeting 32 days after HubSpot said Open): it enumerates the campuses from HubSpot Programs (type Open or Announced, website on alpha.school) and then looks at each page, so a Program with no page, no registry rows or no render is found from the source; and a registry keyed by campus (approved open media, leadership, packets) that has no entry for an in-scope campus is a Missing Info ticket to that registry's owner, with the exact ask, never "no expectation". The approved intro media is judged by the attachment recorded in `registry/campus-open-media.json`, not by the absence of launch words in the alt text or file name. Spec: `spec/check-rows.json` 1.3 (`entitySource`, `expected.derive.onMissing`, the `site.coverage.*` rows).

Nobody is named as product owner of the website as a whole (Q-04). Joe Liemandt appears in meeting records as the marketing decision maker but holds no recorded website role.

## 5. Questions this file raises

- Q-19: Who designed and built the WordPress site, when did it launch, what preceded it, and is anyone from that build still reachable? Ask Yash, Garbhit, Hailey, and the longest-tenured WordPress administrator.
- Q-20: Is the Next.js refresh sanctioned to replace production, who sponsors it, and on what timeline? Ask Yash and Joe.
- Q-17: Names of the WordPress administrators, the WP Engine account holder, the Cloudflare account holder, and the DNS registrar contact. Ask Yash and Garbhit; confirm with the plugin access report.
- Q-18: Account owners for Airtable, Flipsnack, Goldcast, and Vercel. Ask Yash, Brittany, Dmitry.
- Q-21: Where the brand source documents live and whether they can be committed to `alpha-branding-skill`. Ask Yash and Haven.

## Sources

- `registry/people.json`, `registry/owners.json`, `playbook/responsibilities.md`, `docs/environments-and-identities.md`, `docs/related-systems.md`, `docs/findings-2026-09-15.md` (this repo).
- Marketing workspace: `docs/migration/generated/wordpress-admin-browser-inventory.json` (2026-08-06), `docs/migration/README.md`, `docs/migration/marketing-decisions.md`, `docs/migration/integration-register.md`, `docs/migration/implementation-backlog.md`, `docs/google-business/README.md`, `docs/rules/alpha-brand-copy-rules.md`.
- `trilogy-group/alpha-school-website` git history (local clone).
- Slack group DM 2026-08-27 (Canva team transfer), Nessie transcripts 2026-09-09 (refresh previews with MacKenzie's feedback).
