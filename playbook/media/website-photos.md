# Website photos — sources, defaults, and quality (Observed / Proposed)

Status: **Observed/Proposed** from Gaby Guajardo answers in Slack group DM `C0C5K67V1FX` on **2026-10-01** (thread parent `1790882532.910329`, answers `1790893014.683949` + Miami temporary ask `1790893527.124039`). Not yet promoted to binding playbook rules. Do not treat as a green light to mutate WordPress until MacKenzie placement sign-off and an explicit ticket/change request.

Related recipes / registries (already binding where they apply):

- `registry/campus-open-media.json` — Open-and-Enrolling intro card assets
- `protocols/recipes/staff-card.md` — staff headshots
- `protocols/recipes/media-copy-links.md` — Elementor media / copy / CTA swaps (the operational “media.md” recipe)
- `drafts/photos-stories-parent-qa-structure.md` — campus photo/story → parent Q&A triage

---

## 1. Canonical pick list (web-approved)

| Item | Decision |
|---|---|
| Canonical Drive folder | [Web-approved photos](https://drive.google.com/drive/folders/1rrH57k0m42XZ4-6BaIw1XqrF6Kynkf71) (folder id `1rrH57k0m42XZ4-6BaIw1XqrF6Kynkf71`) |
| What “approved” means here | Photos MacKenzie/MP has cleared as **usable placeholders** for web. That is **not** placement approval for how they appear on a live page. |
| Prefer | New photos over archive / old site assets. Gaby’s goal: only use new. |
| Placement sign-off | **MacKenzie**. Gaby picks candidates from the library; MacKenzie signs off placement on the site. |

Older sources (Rotation Pics, Footage Finder, Frame.io, etc.) are upstream intake, not the website pick list once a shot is in the web-approved folder.

---

## 2. Event cards — national defaults, then campus swaps

### Model

1. Maintain **one national default featured image per event type**:
   - Coffee & Conversations
   - Info Session (incl. virtual)
   - Open House
2. When a campus has approved local photography, **swap that campus’s cards** to campus photos.
3. Target size / crop: **1200×761** (1024×650 also used historically; 1200×761 is the stated preference).

### Fallback-Event fleet replacement

- Replace the shared **Fallback-Event** classroom photo as the fleet default for posts still on fallback.
- Implement as **per-type featured images** (one attachment per type), not a single shared attachment reused across types.
- **Do not overwrite a single attachment** if multiple type defaults would collide on one media ID — each type gets its own featured-image attachment / mapping.

### Same library for galleries and location cards

Campus page galleries and location cards use the **same** web-approved library (not a separate gallery-only source).

---

## 3. How new shoots enter the library

| Path | Role |
|---|---|
| **Waldo** | Family delivery only (send families their kids’ photos). **Not** a website ingest path. |
| **Website path** | Photographer → campus Drive `03 - Alpha in Action > Photographer Upload` → **Gaby** picks best → **MacKenzie** approves → Gaby moves into the **website library** (web-approved folder above) → website ops places on alpha.school with placement sign-off. |

---

## 4. Quality / consent rules (lock for playbook)

- Real Alpha photography only — **no stock**.
- Only students with **media consent**.
- Show the **activity**; kids **smiling / engaged**; **group shots** when possible.
- **No students on laptops**.
- Student quotes: **first name only**. Even when media permissions cover face + first name, treat **parent courtesy** as required before publishing face + first name together.

---

## 5. Temporary Miami national defaults (Proposed)

On 2026-10-01 Gaby asked to **temporarily** use the Miami images she already sent (MacKenzie already approved the Miami page) as stand-ins while the national fleet defaults are chosen (`1790893527.124039`). Matt agreed in-thread.

Slack evidence inventory and type→asset map: §6–§7. **Coffee national temporary default locked to WP 9946** (Summer Bash `0046`) by best judgment from Slack/APEX naming; climbing stays a Miami campus Coffee variant once uploaded. **Do not apply** WordPress changes until an APEX ticket authorizes per-type featured-image updates on Fallback-Event posts only.

### Open gaps

- [x] Coffee national temporary default: **9946** Summer Bash `0046` (climbing `…_0307` = Miami/activity swap, not national).
- [ ] Upload climbing (`ASM_T2P_StudentsVsParents_2026_0307.JPG`) to WP when Miami Coffee needs it.
- [ ] Map per-type featured images onto Fallback-Event posts without collapsing types onto one attachment (APEX required).
- [ ] Prefer assets that also live in the canonical Drive web-approved folder when promoting beyond temporary Miami stand-ins.

---

## 6. Slack evidence — Miami images Gaby sent Matt (chronological)

Channels searched: DM `D0BK27UG8ES` (Gaby↔Matt), group DMs `C0C245T8E2U` (Gaby/Bianca/Yash/Matt), `C0BNDCDFFAQ` (Gaby/Hailey/Brittany/Matt), plus Oct 1 thread in `C0C5K67V1FX`. Keywords: Miami, climbing, workshop, carnival, Summer Bash, coffee, info session, photo, image, Drive links, file attachments.

| Date (PT) | Channel | message_ts | File / Drive id · name | Gaby caption / intent | Event type if stated | WP media |
|---|---|---|---|---|---|---|
| 2026-09-02 | `C0BNDCDFFAQ` | `1788384158.052929` | Slack `F0BUDLGQPU3` · `image (3).png` (current bad photo) | Swap this Miami photo; student in remediation videos | Remove from site (not a replacement) | — |
| 2026-09-02 | `C0BNDCDFFAQ` | `1788384954.449849` | Slack `F0BU4HYGYQP` · `Alpha Carnival 2026_0389.JPG` | “Do you know if we have this one on the website?” | Matt applied as **Miami Open House** card photo | **9776** (already on site; carnival / `alpha-miami-event-carnival`) |
| 2026-09-11 | APEX ticket `cmtxgdpit…` (also summarized in `/workspace/gaby-miami`) | — | Drive `1O7Da28W05OVhjwvC6PxyC4840ovUyEkc` · `Alpha Miami Summer Bash 2026_0046.JPG` | Ticket: “Replace the Coffee & Conversations photo” with this Drive link | **Coffee & Conversations** | **9946** (`coffee-summer-bash-0046-scaled.jpg`) |
| 2026-09-11 | `C0C245T8E2U` | `1789161596.076819` | Slack `F0C25BRKK5W` · annotated HEIC screenshot | Visual of slots to swap (APEX follow-up) | Context for gallery / card swaps | — |
| 2026-09-11 | `C0C245T8E2U` | `1789163379.924399` | Drive `1le-ZlQ3t5Aw9nupc8w_1M72YrxTRMr9J` · `Alpha Miami Summer Bash 2026_0262.JPG` | Batch link #1 (no per-slot caption) | Matt labeled batch “Summer Bash indoor / soccer / Carnival CPR / Padel” | not mapped as type default |
| 2026-09-11 | `C0C245T8E2U` | `1789163379.924399` | Drive `10RALjg91pDikb5yVYVKOSmFtjgbiRGLQ` · `Alpha Miami Summer Bash 2026_0225.JPG` | Batch link #2 | Summer Bash (soccer-ish per Matt) | not in WP as named type default |
| 2026-09-11 | `C0C245T8E2U` | `1789163379.924399` | Drive `1sd2-hTw-klCDUJpIyBmCileVL7xR30Gv` · `Alpha Carnival 2026_0364.JPG` | Batch link #3 | Carnival / CPR stage family | related to **9776** family |
| 2026-09-11 | `C0C245T8E2U` | `1789163379.924399` | Drive `1R0UudvQmOXl29fPf8D5iFNMmsJsMk7Ls` · `Alpha Padel X 2026_0342.JPG` (links 4–10 duplicate) | — | **Rejected** by Gaby (“don't want that padel image”) | — |
| 2026-09-11 | `C0C245T8E2U` | `1789164289.164409` | Drive `1FSmTMaKymAvWF9BfYowOhUSVesqlVY2K` · `ASM_T2P_StudentsVsParents_2026_0430.JPG` | Replacement batch after padel reject | Later used as finger-gun Coffee card (then rejected) | was WP **10031** on review snapshot; not a keeper |
| 2026-09-11 | `C0C245T8E2U` | `1789164289.164409` | Drive `1X0C7DabQ5dl6zE298wT0WUiwEnt0hBjX` · `ASM_T2P_StudentsVsParents_2026_0414.JPG` | Replacement batch | Unspecified | — |
| 2026-09-11 | `C0C245T8E2U` | `1789164289.164409` | Drive `1WUcxCuBpw3xHDQskUi3q8esXynJ3Biw1` · `Alpha High School Ribbon Cutting-0060.JPG` | Replacement batch | Unspecified | — |
| 2026-09-11 | `C0C245T8E2U` | `1789164289.164409` | Drive `1us7T6K4sQCW3DKRxNp98L-jrqocvsFHk` · `Alpha Talk 2026_0434.JPG` | Replacement batch | Unspecified | — |
| 2026-09-11 | `C0C245T8E2U` | `1789164289.164409` | Drive `1sd2-hTw-klCDUJpIyBmCileVL7xR30Gv` · Carnival `0364` (repeat) | Replacement batch | Carnival | — |
| 2026-09-11 | `C0C245T8E2U` | `1789164289.164409` | Drive `1X1FNc1t-lm9iDD4iaDmr3yxejrlaKrt2` · `Alpha Carnival 2026_0813.JPG` | Replacement batch | Carnival | — |
| 2026-09-11 | `C0C245T8E2U` | `1789164289.164409` | Drive `1GRU3m_SbO97sVPalxyKZCLrh3M9kL0P3` · `Alpha Carnival 2026_0749.JPG` | Replacement batch | Carnival | — |
| 2026-09-17 | `D0BK27UG8ES` | `1789659804.505629` | Slack `F0C2GES4CH3` · screenshot HEIC | “Did you receive the photos to swap for these?” | Points at upcoming-event cards (Coffee / Info Session dates in shot) | — |
| 2026-09-18 | `D0BK27UG8ES` | `1789759241.789959` | (Matt) Drive photos applied | Coffee Miami Beach + Coffee Miami swapped to Drive photos; Info Session next card one-off override | Confirms Drive coffee/info usage; filenames not restated in this message | — |
| 2026-09-21 | `D0BK27UG8ES` | `1790005323.237949` | Slack `F0C3GKC2PPE` · `262_bestof_student_smiling_to_camera_in_workshop.jpg` | **“info session option for photo:”** | **Info Session** | **10120** |
| 2026-09-23 | `D0BK27UG8ES` | `1790180643.955709` | Slack `F0C3WK0K7AS` · screenshot HEIC + Slack `F0C3WM1J9SS` · `ASM_T2P_StudentsVsParents_2026_0307.JPG` | Swap finger-gun Coffee card to this climbing shot (three girls in blue) | **Coffee** (Miami Beach Coffee card on review) | **climbing not in WP** |
| 2026-10-01 | `C0C5K67V1FX` | `1790893527.124039` | (refers to prior Miami set) | Temporarily use Miami images already sent; MacKenzie approved that page | National temporary defaults | see §7 |

Screenshots / HEICs that are UI proof only (Heather portrait crop, WP login, etc.) are omitted from the type-default map.

### Already in WP (from prior Miami work)

| WP ID | Asset | Typical use so far |
|---|---|---|
| **10120** | Workshop / bestof student smiling in workshop | Info Session (Gaby-named) |
| **9776** | Carnival (Alpha Carnival / CPR stage family) | Open House (and historically also appeared on some Coffee cards before Drive swaps) |
| **9946** | Summer Bash `0046` (adults conversing, Alpha Miami screen) | Coffee & Conversations (APEX-named) |
| — | Climbing `…_0307.JPG` | Coffee (Sept 23 Gaby swap) — **not uploaded to WP** |

---

## 7. Recommended temporary type → asset map

For Gaby’s 2026-10-01 “use Miami images as temporary national defaults” ask:

| Event type | Recommended asset | Confidence | Notes |
|---|---|---|---|
| **Info Session** | WP **10120** · Slack `F0C3GKC2PPE` · `262_bestof_student_smiling_to_camera_in_workshop.jpg` | **High** | Gaby caption literally “info session option for photo”. |
| **Open House** | WP **9776** · Carnival (`Alpha Carnival 2026_0389` / site `alpha-miami-event-carnival`) | **High** | Matt applied carnival to Miami Open House cards after Gaby supplied `F0BU4HYGYQP`; Gaby affirmed. |
| **Coffee & Conversations** | WP **9946** · Summer Bash `0046` (`coffee-summer-bash-0046-scaled.jpg`) | **High (judgment)** | APEX + Drive explicitly named this the Coffee & Conversations replacement. Climbing Slack `F0C3WM1J9SS` (`…_0307`) is the later Miami Beach Coffee swap — keep as **campus** Coffee once uploaded, not the national default. |

Implementation reminder: set three **distinct** featured-image attachments (per type). Do not point Coffee + Info Session + Open House at one Fallback media ID.

---

## 8. Source citations (Slack)

- Playbook Q&A: https://go-alpha.slack.com/archives/C0C5K67V1FX/p1790893014683949?thread_ts=1790882532.910329
- Miami temporary defaults ask: https://go-alpha.slack.com/archives/C0C5K67V1FX/p1790893527124039?thread_ts=1790882532.910329
- Climbing → Coffee: https://go-alpha.slack.com/archives/D0BK27UG8ES/p1790180643955709
- Workshop → Info Session: https://go-alpha.slack.com/archives/D0BK27UG8ES/p1790005323237949
- Carnival → Open House: https://go-alpha.slack.com/archives/C0BNDCDFFAQ/p1788384954449849
- Drive batch: https://go-alpha.slack.com/archives/C0C245T8E2U/p1789163379924399 and https://go-alpha.slack.com/archives/C0C245T8E2U/p1789164289164409

