# Page-Family Requirements

Last verified: September 17, 2026  
Machine form: `spec/page-family-requirements.json`

Every WordPress page must belong to one documented family or an explicit exception registry. A family defines the page's purpose, authoritative content sources, required structure, global dependencies, indexability, publishing checks, and owner.

## Families

| Family | Human requirements | Current coverage |
| --- | --- | --- |
| Homepage and Locations | `homepage-and-locations.md` | Baseline documented; component inventory remains incomplete |
| Campus | `playbook/campus-page/` | Detailed model; lifecycle matrix still contains approval gaps |
| Admissions, forms, applications, confirmation | `admissions-forms-and-confirmations.md` | Safety and routing baseline documented; form IDs remain incomplete |
| Alpha Answers | `alpha-answers.md` | Source and canonical model documented; schema inventory remains incomplete |
| Articles, press, podcasts, and events | `editorial-and-events.md` | Family baseline documented |
| Global templates and navigation | `global-templates.md` | IDs and change controls documented; owner gap remains |
| Legal, campaigns, reviews, and sandboxes | `legal-campaign-review.md` | Publication and ownership baseline documented |
| Program, reference, careers, authors | `program-reference-and-careers.md` | Requirements proposed 2026-09-17; inventory observed; owners partly missing |
| Video resources and media library | `video-and-media-library.md` | Requirements proposed 2026-09-17; rights owner missing |

## Rule

A family with `inventory_incomplete`, `owner_gap`, or `approval_needed` can still be diagnosed. It cannot be changed by an unattended actor unless the exact ticket class, source, recipe, owner, and actor capability are complete.

## Inventory procedure

For each published or intentionally unpublished page, record:

- Canonical URL and WordPress object ID
- Family
- Status and indexability
- Primary owner
- Authoritative source or editor
- Elementor or block structure
- Forms, popups, shortcodes, and global templates used
- Redirects
- Sitemap, Markdown, and LLM export behavior
- Last verified date

Foundation (purpose, audience, control, origin, design, information architecture): `playbook/foundation/`. Full URL inventory by family: `spec/inventory/site-url-inventory-2026-09-17.json` (347 sitemap URLs plus reachable non-sitemap pages).

The September 17 audit counted about 100 published pages, including 44 registered campus pages and 56 non-campus pages. The remaining page-to-family inventory must be generated and reviewed before the family coverage can be called complete.
