# Missing-Info Ownership Registry (draft)

**Purpose:** When an Alpha website APEX ticket is Missing Info / blocked on facts or assets, who the agent should assign, Slack, or ask — without inventing campus facts.

**SoT stack:** APEX = ticket system of record. Slack (`#support-websites`, `#admin-websites`) = overflow/coordination. HubSpot Program → n8n → WordPress = campus facts sync. Matt/Yash = website operators (execution), not inventers of missing campus data.

**Drafted:** 2026-09-15 (PT). Structured twin: `missing-info-ownership-registry.json`.

---

## Quick routing table

| Missing-info class | Assign / ask | Channel pattern | Do **not** assign |
|---|---|---|---|
| `staff_photo_title_bio` | Requester first (campus DoA/DoP/ADoP) | APEX Provide Info; else `#support-websites` thread | Matt/Yash inventing bios; events sync owners |
| `launch_copy_coming_soon` | Campus requester / lifecycle owner | `#support-websites` or APEX | Events sync; inventing open/closed |
| `hubspot_campus_facts` | Confirm with DoA → edit **HubSpot** → Cristi/Yash/Dmitry if sync | GDM Cristi/Yash/Dmitry/Matt; `#admin-websites` for Locations List | Hand WP edits that n8n overwrites |
| `events_public_sync` | Hailey → Garbhit / Dmitry | `#admin-websites` | **Website APEX** |
| `info_packet` | Campus facts + Chris (Canva) + MacKenzie signoff + Rachel language QA | APEX Info Packets / Website (Other); `#support-websites` | Publishing unapproved Flipsnack |
| `apply_link_admission` | HubSpot `admission_link`/`email` first → Matt/Yash WP map | APEX Website once SoT URL exists | Inventing `submission_campus` |
| `brand_copy_voice_ux` | MacKenzie SoT; Haven UX input | Haven+Yash+Matt GDM; APEX for UX impl | Campus DoA for national brand voice |
| `n8n_overwrite_or_sync_exception` | Cristi / Yash / Dmitry | Existing HubSpot/n8n GDM | “Just edit WP” |
| `admissions_team_leadership` | Rachel Goodlad | `#support-websites` | Amelia Baldwin (gone) |
| `requester_waiting_escalation` | Patrick Skinner | Escalate wait/backlog (not missing facts) | Clearing Missing Info by inventing answers |

---

## People directory

| Name | Email | Slack ID | Roles / owns |
|---|---|---|---|
| Matt Barge | matthew.barge@superbuilders.school | `U0B4W7Z23EX` | Website operator/supervisor; APEX assignee; Missing-Info routing |
| Yash Chitneni | yash.chitneni@superbuilders.school | `U0ARFE1TYQK` | Website operator/supervisor; approvals; HubSpot/n8n collab |
| Patrick Skinner | patrick.skinner@superbuilders.school | `U09G44QU7AA` | Escalation when requesters wait on Matt/Yash |
| Hailey McSpadden | hailey.mcspadden@2hourlearning.com | `U08FWUH9UTB` | Event content; HubSpot Public / cancel |
| Garbhit Sharma | garbhit.sharma@alpha.school | `U09QVARBPJ4` | Events HubSpot→site sync |
| Dmitry Bakaev | dmitry.bakaev@trilogy.com | `U08E0UGUA5D` | Events sync; HubSpot Program governance with Cristi |
| Cristi Constantin | cristi.constantin@trilogy.com | `U08MSRYPGH2` | HubSpot-first n8n→WP; `wordpress_post_id`; Locations List automation |
| Rachel Goodlad | rachel.goodlad@alpha.school | `U057W8JLWBC` | DoA team lead (Amelia Baldwin gone); APEX clarity; packet language QA |
| MacKenzie Price | mackenzie.price@alpha.school | `U05BAN925EG` | Brand SoT; packet template signoff |
| Haven Mass | havenmass@gmail.com | `U0A4MS0SXHB` | Brand/voice UX feedback (calendar also used haven.mass@alpha.school) |
| Chris Davidson | chris@chrismdavidson.com | `U0BDJ2W90GG` | Info packet Canva template design |
| Tara-Anne Johnson | tara.johnson@alpha.school | `U0A4GQQ5388` | DoA Raleigh — staff assets / packet facts |
| John Stuart | john.stuart@alpha.school | `U0BJJA18X42` | DoA South Bay — Meet our Team assets |
| Stephanie Dean | stephanie.dean@alpha.school | `U09E4TCAWV8` | ADoP Raleigh (HubSpot `dop`) |
| Mike Marino | michael.marino@alpha.school | `U0B02V602BY` | ADoP Santa Barbara — staff assets |
| Lindsay Dudley | lindsay.dudley@alpha.school | `U0BJBTXPDLG` | Chicago SAS; packet/calendar asks |
| Brian Howell | brian.howell@alpha.school | `U0B7ABBU4KD` | ADoP Chicago (HubSpot `dop`) |
| Amelia Baldwin | null | null | Historical requester only; gone — do not assign |

**Resolve campus DoA/DoP/SAS:** HubSpot Program `doa` / `dop` / `sas` (owner IDs) + `campus-mapping-data.json` + Slack title. Prefer sheet/Slack when HubSpot `doa` is empty (common).

---

## Class details

### 1. `staff_photo_title_bio` — confidence: high

**When:** Meet our Team / add-team-member blocked on headshot, bio, quote, title, page URL, or keep/remove.

**Ask:** Requester (usually campus DoA/DoP). Fall back to HubSpot/sheet DoP, then Rachel for admissions leadership.

**Pattern:** APEX Provide Information; or `#support-websites` thread. Need exportable image files (deck link alone is not enough).

**Evidence:** Sep 2026 `#support-websites` threads with Tara (Raleigh), John (South Bay), Mike (Santa Barbara); QC loop roster ownership.

### 2. `launch_copy_coming_soon` — confidence: medium

**When:** Coming Soon / Fall launch overlays on open campuses; Missing Info on status or replacement hero media.

**Ask:** Campus requester; Matt/Yash execute once confirmed. Supply approved photos if media library empty.

**Evidence:** Boston Fall 2026 overlay removals; playbook Project Home on Group A launch-copy; QC open-campus rule.

### 3. `hubspot_campus_facts` — confidence: high

**When:** Grades, address, phone, tuition, admissions email, Book a Call disagree with HubSpot, or WP hand-edits will be overwritten.

**Ask:** Campus confirms fact → update HubSpot Program → Cristi/Yash/Dmitry for sync/exceptions. **Not** hand WP for synced fields (Cristi HubSpot-first).

**HubSpot fields (sampled):** `school_address`, `start_grade_level`, `end_grade_level`, `email`, `tuition`, `contact_number`, `admission_link`, `doa`, `dop`, `sas`, `dop_picture`.

**Evidence:** Cristi n8n GDM; Greenwich Port Chester overwrite Sep 15; Hailey “file as program change not Website”; QC HubSpot fact compare.

### 4. `events_public_sync` — confidence: high

**When:** Public=Yes missing/wrong on site, or canceled event still live.

**Ask:** Hailey (content/Public flag) → Garbhit / Dmitry (sync). Route in `#admin-websites`. **Do not file Website APEX.**

**Evidence:** Matt Aug 28–31 `#admin-websites` (“Not filing website tickets”); Hailey Public/cancel; brainlift HubSpot events plugin.

### 5. `info_packet` — confidence: high

**When:** Packet CTA 404 / Flipsnack / calendar page / unapproved campus packet.

**Ask:** Campus for facts → Chris Davidson (Canva template) → MacKenzie signoff before mass copies → Rachel language QA → Matt/Yash host PDF + CTA when approved. Hide placeholders until then.

**Evidence:** Carrollton MacKenzie hold; Chicago Lindsay Calendar B; Raleigh Tara packet; apex evidence MacKenzie/Chris hold; agent-router `info-packet-support`.

### 6. `apply_link_admission` — confidence: medium

**When:** APPLY TODAY / application campus map wrong or `admission_link` empty.

**Ask:** Confirm HubSpot `admission_link` + admissions `email`; Matt/Yash fix WP map/CTA. Rachel for multi-campus apply policy.

**Evidence:** Houston HubSpot-vs-apply-map; observer Franklin/San Juan empty `admission_link`.

### 7. `brand_copy_voice_ux` — confidence: high

**When:** Brand/voice/UX wording undecided.

**Ask:** MacKenzie (SoT) + Haven (feedback). Matt/Yash implement via APEX/QC rules.

**Evidence:** Sep 15 Haven GDM (“MacKenzie SoT”); Website Feedback calendars; brainlift MacKenzie voice.

### 8. `n8n_overwrite_or_sync_exception` — confidence: high

**When:** Sync overwrites WP; new campus needs `wordpress_post_id`; custom Serving/IF nodes; Locations List automation.

**Ask:** Cristi / Yash / Dmitry in existing GDM. New locations: HubSpot `wordpress_post_id = -1` then run sync (Cristi).

**Evidence:** Cristi Aug 28 GDM; Greenwich Sep 15 IF exception ask; Locations List n8n announcement.

### 9. `admissions_team_leadership` — confidence: medium

**When:** Who owns admissions website / Alpha High expansion asks after Amelia Baldwin.

**Ask:** Rachel Goodlad; campus DoA for campus-local assets.

**Evidence:** Ops brief; Rachel “Use Apex”; Chris Locke escalation; Amelia historical only.

### 10. `requester_waiting_escalation` — confidence: medium

**When:** Wait/SLA/backlog risk — not missing campus facts.

**Ask:** Patrick Skinner. Do not invent answers to clear Missing Info.

**Evidence:** Ops brief; Sep 8 backlog audit vs Patrick waiting complaints; Gmail Brainlift GTM loop.

---

## Channels

| Channel | ID | Use |
|---|---|---|
| `#support-websites` | `C09GRQ8L533` | Public intake/overflow; staff, packets, copy, visual QA |
| `#admin-websites` | `C099GQ9F15X` | Private; events sync / urgent reliability |
| `#apex-daily-rundown` | `C0B6GSNCJG2` | APEX rundown context (email/events) |
| HubSpot/n8n GDM | (no ID captured) | Matt + Yash + Cristi + Dmitry sync exceptions |

---

## Coverage gaps (next pass)

1. Playbook `docs/PRD.md` / `project-overview.md` and `alpha-campus-website-requirements.md` not on box — pull into registry-sources.
2. HubSpot `doa` often empty vs sheet/Slack — build resolve helper (owner ID → name → Slack).
3. Full per-campus DoA/DoP/SAS Slack ID map not automated.
4. Patrick escalation lacks a single public playbook message (ops/log evidence only).
5. Amelia succession needs org-chart confirmation beyond ops brief + Slack behavior.
6. Haven email: Slack gmail vs calendar `haven.mass@alpha.school`.
7. Rachel packet-language QA stronger in ops brief than in live ticket samples.

---

## Operator checklist (agent)

1. Classify Missing Info (table above).
2. Prefer **requester** for one-off assets; **HubSpot Program** for campus facts; **Hailey→Garbhit/Dmitry** for events; **Cristi/Yash/Dmitry** for n8n overwrite.
3. Comment APEX with who was asked and what is still needed.
4. Slack only in the existing overflow thread or `#admin-websites` for sync — do not message new people from this draft unless the parent agent/user directs.
5. Never invent emails/IDs; leave null and ask the human.
