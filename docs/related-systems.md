# Related systems

Map of what already exists outside this repo so agents stop rediscovering it in chat. This file is a pointer, not a second playbook.

## In scope for this repo

This repo is the source of truth for **website page correctness** and the **APEX ticket protocol** (execute / test / close). Related systems that belong in that loop:

| System | Role |
| --- | --- |
| This playbook (`trilogy-group/alpha-website-playbook`) | SoT for page state and ticket execute/test |
| `trilogy-group/AlphawordpressMCP` | Safe WordPress read/write for alpha.school |
| `superbuilders/aeo` | Production observer; files APEX tickets; must eventually read `spec/` |
| `trilogy-group/alpha-event-task-management` | APEX tickets |
| `trilogy-group/alpha-branding-skill` | Brand rules (MacKenzie) |
| Deployed Alpha Community app | Separate program registry and router for Community IDs, slugs, visibility, and `campus=<slug>` destinations. See `playbook/site/community-routing.md`. |
| Live site + Joe AEO board | Campus Elementor pages on alpha.school; board at https://alpha-aeo.pages.dev (WP Agent owns the production loop) |

## Related but out of scope for v1 of this playbook

Joe city-OS / local growth is a sibling product. It may *cite* this playbook for the “SEO city page have / missing / stale” column. It must **not** be merged into campus-page requirements.

| System | Role |
| --- | --- |
| Joe city-OS living brief (Work Ops) | Standardized local checklist (press, reviews, Maps, SEO, chamber, backlinks) applied across ~45–50 campuses. Measurement exists; a playbook *engine* does not. |
| Campus AEO Monday scoreboard | HubSpot Programs × Peec. HTML lives on disk under the campus-scoreboard workspace. Public Superbuilders repo URL is still Holding (`superbuilders/alpha-campus-scoreboard` does not exist). |
| Peec Alpha project | 150/150 prompts. Mon 14 Sep 2026 board: overall Alpha vis 42.8% (16 Aug–14 Sep; was 38.9% on 31 Aug). Blind = San Juan only. OAV filter ~45 campuses. Holes: Blind 1 / No Niche 30 / Rank 13 / OK 1. City “No page” = 0. |
| Local SERP meter | https://alpha-local-seo.pplx.app/ (monthly). Optional column. Not a second Joe-facing operator loop without a Yash decision. |
| Niche for Alpha | Yash is partner admin. DoPs supply facts only. Surveys / review waves are manual. |
| HubSpot portal Programs | Campus list truth (Rachel + campus editors). Campus AEO owns the Monday pull. |

## Ownership cheat sheet

| Layer | Owner |
| --- | --- |
| Page requirements + APEX website protocol | This repo (Yash + Matt, code owners) |
| Monday Peec / HubSpot scoreboard + one Hole | Campus AEO |
| WP city page publish / alpha-aeo.pages.dev | Yash review + WP Agent |
| Observer production Actions | Matt / `superbuilders/aeo` |
| Community program records and router | `community-app-owner`, not yet named |
| City-OS growth checklist product | Not built. Work Ops holds the brief only. |
| Niche admin submit | Yash |
| Google Business Profiles (two central location groups; access, manager, owner changes) | Yash. Facts flow HubSpot to RioSEO and n8n to Google. See `playbook/integrations/google-business-profile.md` |

## How agents should use related systems

1. Read **this repo first** for any campus-page or APEX website ticket. `playbook/` + `spec/` + `protocols/` win over chat lore.
2. Use AlphawordpressMCP to inspect or change live pages. Use APEX for ticket state.
3. Do **not** invent city-OS automation (press, Maps, chamber, backlinks, Niche waves) from this playbook or from chat. City-OS is a sibling; Work Ops holds the brief until a product exists.
4. When a city-OS checklist needs “does this campus have a correct city page?”, cite this playbook. Do not copy city-OS columns into `spec/`.
5. Do not invent live Peec / Niche / scoreboard numbers. If a number is not in this file or in a dated Campus AEO board, look it up or leave it blank.
