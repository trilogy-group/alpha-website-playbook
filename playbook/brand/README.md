# Brand assets

`assets/` holds the canonical website logo files: the Alpha School mark in its three colourways, outlined and font-independent. These are the only logo files a page edit may bind. Never redraw, recolour, stretch, rotate, outline, shadow, or split them; never shrink the mark below 72 px wide; keep clear space on all sides at least the cap height of the A in ALPHA.

| File | Colourway | Use on |
| --- | --- | --- |
| `alpha-school-logo-navy.svg` / `.png` | navy `#110068` | White or pale-blue backgrounds (the default on white) |
| `alpha-school-logo-blue.svg` / `.png` | electric blue `#1C1CFF` | White backgrounds when a brighter mark is wanted |
| `alpha-school-logo-white.svg` / `.png` | white | Navy, blue, gradient, or photo backgrounds |

SVG for the site; PNG (2398x875, transparent) for decks, documents, and print. The sha256 of each file is recorded in `spec/brand-visual.json` (`logo.assets`) and `npm run validate` fails if a file is changed or missing.

## Where the values come from

Every value in `spec/brand-visual.json` (palette, gradients, contrast verdicts, Montserrat type scale, logo rules, approved claims) is canon from the **Alpha School Brand Guidelines** (47 pages, the official deck), as the `alpha-brand-guide` skill in the marketing workspace states them (`marketingsupport/.claude/skills/alpha-brand-guide/`, version 2026-09-22). The skill's kid-facing house rules (a warm accent, sentence-case headlines for pre-readers) are extensions, not canon, and are not adopted for the website.

Word-level copy rules are MacKenzie's (`marketingsupport docs/rules/alpha-brand-copy-rules.md`, `playbook/site/site-rules.md` Brand copy) and win over this folder and over the guide on any overlap.

## Two honest notes

- The released files are the **ALPHA SCHOOL** lockup. The guide itself shows the corporate **ALPHA** lockup, and the live site header and footer serve that one (`wp-content/uploads/2024/03/logowhite-2.svg`, white, 2024). Which lockup the website carries is not yet ruled (`docs/decisions.md` 2026-09-22); the `brand-visual` check reports the live file as a known live file, not as canonical, until it is.
- The blue files are `#1C1CFF`, which is not one of the four palette blues. That inconsistency is in the source material, not here. Navy is the default on white.

Prose rules for the site: `playbook/site/visual-brand.md`. Mechanical check: `tests/page-check.mjs` row `brand-visual` (`tests/brand-visual.mjs`).
