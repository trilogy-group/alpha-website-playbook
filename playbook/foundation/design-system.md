# Design System (as observed and as declared)

Status (2026-09-22): the declared visual standard is now `spec/brand-visual.json` (the official Alpha School Brand Guidelines; prose in `playbook/site/visual-brand.md`), checked by `page-check brand-visual`. The tables below remain the observed-versus-declared record. Earlier status: the "Observed" column is what alpha.school serves today (Elementor kit 8, read from the live homepage CSS on September 17, 2026, `spec/inventory/design-tokens-observed-2026-09-17.json`). The "Declared" column is what brand documents say. Where they disagree, nobody has ruled (Q-27). There is no tokens file, component library, or written visual standard for the site; this file is the first one. Owner of the visual system: not named (Elementor owner gap, Q-12).

## 1. Color

| Role | Observed on the live site (kit 8) | Declared in brand documents | Agreement |
| --- | --- | --- | --- |
| Primary, headings H1 to H3, links, buttons | `#0000EF` (kit "primary" and "e7f879b") | Alpha Event Design Guidelines: dark navy `#110068`, medium blue `#0D4AD1`, light blue `#418BE9`, sky blue `#00BCFF`. The August 26 review confirmed the refresh uses `#0D4AD1` and that `#1C1CFF` is not approved | **Conflict.** The live site's primary blue appears in no brand document reviewed |
| Accent, link hover, button hover border | `#47C4E6` (kit "d26f039") | Sky blue `#00BCFF` is the nearest declared color | Not the same value |
| Page background | `#F8F8F8` (kit "secondary", also "accent") | Not declared | |
| Body text | `#7A7A7A` | Not declared. Note: this fails WCAG AA contrast for 16px body text on `#F8F8F8` (about 3.9:1) | Accessibility question, Q-27 |
| Dark text and surfaces | `#2D2D2D` | Not declared | |
| Light blue tints | `#C2ECFD`, `#F2FBFF`, `#9BCFE036` | The reimagining brief calls for tinted blue and sky sections | Directionally consistent |
| Page transition | `#FFBC7D` (orange) | Not declared | Legacy setting; no visible use found |
| Brainlift note | | Only dark navy `#110068` and sky blue `#00BCFF` repeat across the two written Alpha brand documents; GT School has its own palette that must not leak | |

Usage counts in the loaded CSS: primary 51 rules, secondary 46, accent cyan 31, dark 14, text 11.

## 2. Typography

Observed: one family, Montserrat, loaded from Google Fonts, for every preset. The theme's `@font-face` for Public Sans is overridden by the kit. The Brainlift's brand check ("Loop 5") already asserts Montserrat.

| Element | Observed size and weight | Line height | Notes |
| --- | --- | --- | --- |
| H1 | 5rem, 700 | 1.2 | Color primary blue |
| H2 | 4rem, 700 | 1.2 | Color primary blue |
| H3 | 3rem, 600 | 1.1 | Color hard-coded `#0000EF`, not the token |
| Display numeral preset | 14rem, 700 | 1.0 | Used for statistics |
| Section label (kit "accent") | 1rem, 600, letter-spacing 0.2em | 1.3 | Also the button preset |
| Eyebrow preset | 1rem, 700, letter-spacing 0.3em | 1.8 | |
| Body (kit "secondary") | 16px, 400 | browser default | Applied to `body` |
| Lead paragraph | 1.2rem, 400 | 1.6 | |
| Pull quote | 3rem, 700, italic | 1.1 | Plus 1.4rem italic for attributions |
| Small | 0.9rem, 400 | | |

Seventeen presets exist; several differ only by size. Declared standard: none. The reimagining brief asks for a rhythm that changes every screen, dark or high-contrast heroes, white proof sections, and one "expensive-looking" signature moment; none of that is encoded anywhere.

## 3. Components and templates

| Component | Observed implementation | Owner | Notes |
| --- | --- | --- | --- |
| Header | Elementor theme-builder template 76; logo `logowhite-2.svg` (2024); six top-level items; one CTA button "Contact Us" to `/learn-more/` | Elementor owner (gap) | Same menu on desktop and mobile |
| Footer | Template 77; Cognia badge linking to the Cognia registry; four link groups; legal row; copyright | Elementor owner (gap) | `/founders/` uses a different footer, template 4107 |
| Popup | Template 3713, loads only on the homepage and `/jb/`; "Stay in the know" trigger | Not recorded | Purpose and owner unrecorded (Q-30) |
| Buttons | Kit default: primary blue fill, off-white text, 1px transparent border, uppercase tracking; hover inverts to transparent fill, blue text, cyan border | Kit 8 | Applies to every Elementor button unless overridden |
| Campus page template | Object 6140 for new campuses; Austin and Miami on an older variant | Elementor owner (gap) | Section model in `playbook/campus-page/page-model.md` |
| Single post template | 4476 for blog, `/ai/`, and local-SEO posts; 8919 for news posts | Elementor owner (gap) | Two templates for one content type family |
| Author archive | Template 9123 | | |
| 404 | Template 3427 | | |
| Video resource single | No Elementor document; theme render with VideoObject schema | | |
| Staff card | Elementor container with image, `Name | Title` heading, optional bio; cloned per person | Alpha MCP staff patch | Placeholder "John Doe" cards exist hidden on Austin |
| Map | `map.app.alpha.school/map` iframe plus a MapHub embed on the homepage; Google Maps Embed API on campus pages | Growth-map owner (gap) | |
| Event strip | `ahse-events` widget rendering Goldcast registration links | Events plugin owner | |
| Info packet button | Flipsnack link | Packet owner | Legacy and 2026-27 packets both linked on many pages |
| Chat | Voiceflow widget on every page | Not recorded | |
| News ticker | `news-ticker-for-elementor-pro` loaded on every page; not rendered on the homepage | Not recorded | |

## 4. Imagery and media

- Real students and families in motion are the strongest declared asset (reimagining brief). Open campuses should show their approved "Open and Enrolling" media; three campuses lack it (`registry/campus-open-media.json`).
- Logo: `logowhite-2.svg`; favicons are 2 Hour Learning webp files; `og:image` is set site-wide. Whether a dark-background logo is the only approved mark is Q-27.
- YouTube is the video host; campus pages carry 35 to 42 embeds each.
- Press logos and the Cognia badge are the visible third-party proof.

## 5. Motion and interaction

Observed: Elementor nav underline and fade animations; a page-transition color; hover inversion on buttons. No scroll-driven narrative, no signature moment. Declared (reimagining brief): motion should communicate momentum, work on touch and keyboard, and never slow comprehension. Nothing bridges the two.

## 6. Accessibility and performance baseline

- Body text contrast fails AA on the observed tokens (Q-27).
- No `noindex` anywhere, including confirmation and application pages; utility pages are in the sitemap (`information-architecture.md`).
- Heavy embed load on campus pages; `llms-full.txt` timed out at 20 seconds on September 17.
- Two pages have no H1 (`/founders/`, `/privacy-policy/`); `/jb/` has three.
- Standards: `playbook/quality/accessibility-performance-browser-media.md`.

## 7. What a real design system needs (Proposed deliverables)

1. A ruling on the palette: adopt the Event Design Guidelines blues and migrate kit 8, or declare `#0000EF` and `#47C4E6` the web palette and update the brand documents (Q-27, MacKenzie with the Elementor owner).
2. A tokens file committed to `alpha-branding-skill` (colors, type scale, spacing, radii) that kit 8 is checked against by the observer.
3. A component inventory with one owner: header, footer, popup, buttons, staff card, event strip, map, packet button, video block, FAQ accordion, CTA band.
4. One post template, or a written reason for two.
5. A motion and imagery standard derived from the reimagining brief once the refresh decision (Q-20) is made.

## Sources

- `spec/inventory/design-tokens-observed-2026-09-17.json`, `spec/inventory/navigation-2026-09-17.json`, `docs/page-family-signals-2026-09-17.md`.
- Alpha Event Design Guidelines as quoted in `docs/migration/refresh-icp-messaging-form-factor-review-2026-08-26.md` (marketing workspace); `docs/migration/alpha-website-reimagining-criteria-2026-08-28.md`; Matt Barge's Alpha Website Brainlift (brand palette note, Loop 5).
- `registry/templates.json`, `registry/campus-open-media.json`, `docs/findings-2026-09-15.md`.
