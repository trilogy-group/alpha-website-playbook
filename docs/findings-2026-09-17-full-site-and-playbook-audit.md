# Findings: Full Alpha Site and Playbook Audit

Date: September 17, 2026
Playbook baseline: `main` at `828fb37`
Mode: read-only

## Scope

The audit reviewed the live `alpha.school` site, the Alpha Website Playbook, the Alpha MCP tool contract and documentation, and the APEX scheduled-agent integration.

No WordPress, HubSpot, n8n, APEX, MCP, cache, form, or live website content was changed during the audit.

## Main conclusion

The playbook had a strong campus and pipeline foundation but did not yet provide a fresh agent with a complete path from APEX request to authoritative source, supported actor, safe execution, public verification, and evidence.

HubSpot and n8n needed deeper operator guidance, but the larger gap was full-system coverage: APEX claims and leases, actor capabilities, production and staging policy, cache truth, forms and admissions, non-campus pages, SEO and LLM publishing, infrastructure inventories, quality standards, rollback, and maintenance.

## Existing strengths at the baseline

- HubSpot Programs to n8n to Elementor mapping
- APEX Program editor and HubSpot readback
- Locations workflow and growth-map relationship
- HubSpot event import stack
- Airtable to Alpha Answers import
- Community routing and exact identity join
- Source, mapping, delivery and presentation diagnosis
- Ticket intake, prepare and apply split, snapshots, cache handling, three verification states, and evidence

## Documentation gaps found

1. `README.md` pointed to a missing `playbook/00-how-to-use.md` and still called the repository scaffolding.
2. Campus requirements covered only part of Open and one Announced row; Pre-Announcement had no requirement file.
3. The site included about 100 published pages, but page-family requirements focused mainly on 44 campus pages.
4. Ticket classes referenced `copy`, `link-cta`, `media`, `hubspot-data`, and `sync-mapping` recipes that did not exist as standalone files.
5. Claim, lease, collision, environment, rollback, screenshot, evidence, and duplicate-search procedures were incomplete.
6. The Alpha MCP exposed 20 tools, while the scheduled APEX Alpha path supported a smaller staff-focused operation set.
7. Human Alpha MCP operator mode and the earlier APEX-token-only contract disagreed on production policy.
8. HubSpot and n8n lacked a field allowlist, manual-run evidence, log-inspection, retry, partial-save, disable, recovery, version-drift, and complete worked-example runbook.
9. WP Engine and Cloudflare cache sequencing and batching were not fully present in the playbook.
10. Environment, plugin, shared-template, redirect, navigation, form, analytics, consent, and global-code inventories were missing.
11. Forms and admissions lacked HubSpot form IDs, `submission_campus`, Finalsite, confirmation, UTM, downstream routing, safe QA, and owner detail.
12. SEO and LLM publishing lacked complete sitemap, noindex, redirect, Markdown, `llms.txt`, `llms-full.txt`, and Alpha Answers governance.
13. Accessibility, performance, browser, media, and legal standards were incomplete or absent.
14. Protocol versions had drifted and no single CI validation command checked the repository.
15. Several critical owners remained unnamed.

## Live site observations

### Healthy

- All 44 registered campus URLs returned HTTP 200.
- All 44 included a header, footer, H1, canonical tag, and expected n8n CSS-ID markers.
- Checked indexable page titles and canonicals were unique.
- Header and footer links were reachable aside from expected canonical redirects.
- `robots.txt`, the sitemap index, `llms.txt`, and `llms-full.txt` were reachable.
- Markdown variants such as `/austin.md` returned `text/markdown`.

### Likely website tickets

- Fourteen Open campuses contained launch-era wording: Atlanta, Boca Raton, Boston, Chicago, Denver, Dorado, Highland Park, La Jolla, Malibu, Miami Beach, Park City, Raleigh, Santa Monica, and South Bay LA.
- Four Announced campuses did not name a month or season and year: Boston Suburbs, Franklin, Houston, and San Juan.
- Austin contained a hidden all-device John Doe campus-leader placeholder.
- Palo Alto contained a hidden `bio` placeholder.
- Careers, the Johnathan Bi landing page, and the Future of School livestream lacked meta descriptions.
- Terms, Privacy Policy, Guides, Founders, Overview, and application confirmation pages appeared to lack semantic H1 elements and require visual confirmation.
- `llms.txt` included redirected legacy application URLs and the noindex `fall-2025-academic-talk-review` page.

These observations require APEX deduplication before filing new tickets. They are not authorization to edit the live site.

## Live mechanics observed but previously underdocumented

- GTM `GTM-5W56ZLQJ`
- Google tag `GT-PJNQ32T9`
- HubSpot tracking, embeds and consent
- Meta and LinkedIn tracking markers
- Voiceflow chatbot rollout
- Founder chat controlled by an `agent` query parameter
- Global UTM propagation
- Two homepage map technologies
- Elementor and ElementsKit dynamic components
- Yoast and Redirection behavior
- Overlapping REST writers including Alpha MCP, APEX Elementor, custom Elementor replacement, MCP Adapter and WordPress Abilities

## Remediation

The strengthening plan is in:

- `docs/alpha-website-playbook-strengthening-overview.md`
- `docs/alpha-website-playbook-strengthening-prd.md`

Implementation belongs in the existing playbook, protocols, specs, registries and tests. It is not a separate website feature.
