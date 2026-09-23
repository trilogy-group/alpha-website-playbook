# Visual brand (`site.brand.visual`)

The official Alpha School Brand Guidelines (47 pages) are the visual source for alpha.school, adopted 2026-09-22 (`docs/decisions.md`). Machine form: `spec/brand-visual.json`; canonical logo files: `playbook/brand/assets/` (`playbook/brand/README.md`); the values were carried over from the `alpha-brand-guide` skill in the marketing workspace (`marketingsupport/.claude/skills/alpha-brand-guide/`, 2026-09-22), which cites the guide's pages. Word-level copy is MacKenzie's (`site-rules.md` Brand copy, `marketingsupport docs/rules/alpha-brand-copy-rules.md`) and wins on any overlap; nothing here restates a word rule.

## The four things that do not change

1. **Type is Montserrat.** Nothing else, on any element a visitor can read. Weights 400, 500, 700, 800, 900; never Thin, ExtraLight, or Light. Headlines ALL CAPS in Black, tight leading, stacked short; body never all-caps, never justified; never letterspace the Black weight; never italicize a headline. The guide's size ladder (H1 40pt Black down to Caption 8pt) is calibrated for a Letter handout: on the site it is a ratio ladder, not pixel values.
2. **The base is blue.** Dark navy `#110068`, medium blue `#0D4AD1`, light blue `#418BE9`, sky blue `#00BCFF`, plus white and black, plus two tints the guide's own layouts use: pale panel `#C8DBF4` (navy text on it) and stat cyan `#47C4E6` (big numerals only). Backgrounds, headlines, and large fields come from this set. Signature gradients run diagonally (160deg) navy to medium, medium to sky, navy to light; never vertical bands. The iconography pages' green, orange, and cream are labeled style exploration in the guide and are not a palette.
3. **Contrast is real.** Body text at least 4.5:1, large headlines at least 3:1. The guide's own table: white on navy 17.2, navy on white 17.2, navy on the pale panel 12.2, stat cyan on navy 8.4, sky on navy 7.9 (the kicker-line move), white on medium 7.2; white on light blue 3.4 is headlines only, never body; navy on medium blue (2.4), **sky blue on white (2.2)** and white on sky blue (2.2) are never.
4. **The logo is never modified.** Three colourways (navy, electric blue `#1C1CFF`, white), from `playbook/brand/assets/` only; clear space at least the cap height of the A; at least 72 px wide; top-left or top-right; white over a calm, darker region of a photo. Two lockups exist (ALPHA in the guide, ALPHA SCHOOL in the released files); the live header and footer serve the 2024 ALPHA file, and which one the site should carry is an open decision.

## Approved claims

`spec/brand-visual.json` `approvedClaims` carries the guide's market-facing statements verbatim (positioning line, support line, What is Alpha, the three commitments in order, Guides, the two statistics, the approved headlines, the calls to action) with a `copyRule` cross-reference wherever MacKenzie already has a rule on the same claim (twice as much, classes not students in the top 1%, love school, 2x lowercase, life skills plural, the love-school and vacation numbers, the word "education"). Use a claim verbatim or not at all; never invent or round a statistic; never promise an individual outcome; never compare to a named school; always replace `[City]`.

## The check

`tests/page-check.mjs` row `brand-visual` (`tests/brand-visual.mjs`, Playwright borrowed like the framing check; skipped, never passed, without a browser) reads the rendered page at 1440x1000 and reports, per finding, the selector, the value, and the rule:

- **font**: any visible text element whose computed font-family does not start with Montserrat. Icon fonts are skipped. HubSpot embeds, the Alpha HubSpot Events cards (in-house; a plugin fix, allowed so it does not repeat per card), the chat widget, and consent banners are allowlisted in the spec and still listed as INFO with the reason.
- **contrast**: any text element whose colour and effective solid background match a "never" row of the table, or the white-on-light-blue row at body size. Elements over photos or gradients are skipped.
- **background** and **headline**: large solid fields and H1-H3 colours outside the palette, once per colour with a count. INFO on the first version (campus photos, tinted sections, third-party embeds are legitimate); the severity is `spec.check.severities`.
- **logo**: every logo image with its file name, the served file's sha256, and whether it matches a canonical asset by name or hash, or a known live file. INFO.

Enforcement is `advisory` on the first version (`spec.check.enforcement.mode`): fail-severity findings make the row `warn`, listed and not counted in the exit code, so ring 2 still passes. Flip to `enforced` once the conflicts below are ruled. What the check reported on the day it landed is in the PR that added it.

## Where the live site disagrees today (for Matt to rule, design-system.md Q-27)

- Primary colour: kit 8 uses `#0000EF` for headings, links, buttons, and hero overlays; `#0000EF` is in no brand document. Headline colour on white is navy `#110068` in the guide.
- Page ground `#F8F8F8`, headline text `#F8F8F8` on the blue hero, body `#7A7A7A` / `#2D2D2D`, tints `#F2FBFF`, `#9BCFE0`, `#F1F2F6`: not in the palette. Reported as INFO.
- Fonts: the campus template's Founding Families H2 ("See How Alpha Transforms Kids") renders in Poppins, and a span pasted from Slack ("Looking for more stories to view and share?") carries `Slack-Lato`; the Alpha HubSpot Events cards use the system font stack. Montserrat everywhere else.
- Logo: the header and footer serve `logowhite-2.svg` (ALPHA lockup, white, 2024, sha256 `97413b30…`), not a file from `playbook/brand/assets/` (ALPHA SCHOOL).

Owner of the visual system: not named (Elementor owner gap, Q-12). Findings from this check file as class `observer-brand-visual`, owner website-operations (`docs/sweep-runbook.md`).
