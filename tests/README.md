# Tests and checkers

Agent-independent scripts. Plain Node 20+, no dependencies, read-only against the live site.

- `validate-ticket.mjs --file <apex tasks json> [--summary]`: protocol step 1. Classifies APEX website tickets against `spec/ticket-classes.json`, reports which inputs are missing, and writes the Missing Info text.
- `page-check.mjs --url <canonical url> [--url ...] [--state Open|Announced] [--json out.json]`: protocol step 5, ring 2 (text and structure). Header template and its stylesheet, footer, H1, hero CTAs, intro section, canonical tag, state rules (no launch-era words on Open pages; a named month or season and year on Announced pages), sister-brand words, other-campus image names, approved intro media, and CTA link resolution. Scans page-owned content only, so shared navigation and footer do not count against a page. Exit code 1 on any failure. Screenshots are still required by the protocol and are not produced by this script.
- `validate-community-routing.mjs [--live-map]`: validates the Community routing spec, the partial campus identity crosswalk, canonical URLs, lifecycle mapping, and dated inventory. It is offline by default. `--live-map` adds a read-only comparison with the public growth map and never changes the map or Community app.
- Ring 3 (shared templates): run `page-check.mjs` on two untouched campus pages after any site-wide action and confirm `header-stylesheet-linked` and `footer-template-present` pass.

Planned: spec schema validation in CI, a renderer that fails when prose and spec disagree, and observer-check mapping tests.

## page-check.mjs: synced elements

On Open and Announced pages the checker now verifies that every CSS ID in `spec/synced-targets.json` `expectedOnCampusPages` is present (`n8n-synced-elements-present`) and flags any `-disabled` override so the ticket and restore condition can be confirmed (`n8n-override-recorded`). The same file drives the Alpha MCP batch runner's `--synced-targets` guard, which refuses edits to those elements.

## diagnose-field.mjs

Pathway diagnosis (protocol step 1b). Given a campus URL and an element from `spec/campus-page-field-map.json`, it reads the rendered page, the growth map API (HubSpot mirror), HubSpot Programs directly when the token has the scopes, and the requirement for the campus state; then prints the defect class (data, mapping, delivery, presentation, none), the owner role and person, and a ready ticket.

```bash
node tests/diagnose-field.mjs --url https://alpha.school/atlanta/ --element intro.status-sentence --json dx.json
node tests/file-apex-ticket.mjs --from-diagnosis dx.json --parent <ticket or loop> [--assign farhan.raja@trilogy.com] [--create]
```

`file-apex-ticket.mjs --assign <email>` connects the APEX user from `registry/people.json` (`apexUserId`).

## resolve-campus-roles.mjs

Resolves Director of Admissions, Dean of Parents, and Senior Admissions Specialist coverage per campus, live from the Admissions Hub org chart, with `registry/campus-roles-overrides.json` applied and emails attached from HubSpot owners.

```bash
node tests/resolve-campus-roles.mjs                                  # print the roster
node tests/resolve-campus-roles.mjs --campus atlanta --role dean-of-parents
HUBSPOT_SERVICE_KEY=... node tests/resolve-campus-roles.mjs --write  # refresh registry/campus-roles-snapshot.json
```

Without a HubSpot token the emails come from the last snapshot. The hub page is parsed from its embedded script tables; if the page layout changes the script stops with an error rather than guessing.
