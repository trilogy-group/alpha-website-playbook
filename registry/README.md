# Registry

- `sources.json`: where every fact and cross-system identity comes from, with access notes and authority boundaries.
- `campus-pages.json`: campus slug to URL, WordPress object, map program ids, and the names tickets use.
- `campus-identities.json`: partial, verified HubSpot program ID crosswalk to Community IDs, slugs, visibility, and canonical Community destinations. A missing row must not be inferred.
- `campus-open-media.json`: approved open-campus intro media per campus and who produces it.
- `campus-leadership.json`: per campus, the leadership shown on the page (Head of Schools, Dean of Parents, Director of Admissions, guides), plus placeholder cards found.
  `groups` (1.1, 2026-09-24): campus groups with shared leadership (first: Greater Boston, boston, jamaica-plain, boston-suburbs); the identity check rows read it through `exemptionsRef`, so a shared leader's card naming a sibling campus is not an other-campus conflict.
- `campus-cta-exceptions.json`: named, dated, expiring exceptions to the campus CTA check rows, keyed by campus slug and CTA (`book-a-call`, `calendar`, `packet`, `apply`, `community`), each with rule (`hidden`, `present`, `destination`), reason, decidedBy, source (channel and date), decidedOn, expires (ISO date, `lifecycle:Open`, or null) and note. Schema `spec/schemas/campus-cta-exceptions.schema.json`; the filer reads it through the rows' `exemptionsRef` and reports a matching finding as `exempted`; entries are written by `agent/record-decision.mjs` together with the `docs/decisions.md` row (first entries: Lexington Book a Call hidden while Announced; Dorado Book a Call destination, moved from `spec/campus-page-controls.json`).
- `people.json`: people and the roles they hold, each with a source and date. People change; `spec/responsibilities.json` holds the roles.
- `observer-checks.json`: the production observer's check catalog.
- `missing-info-routing.json` / `missing-info-routing.md`: Missing Info class to role routing (people never in rules; resolve via people.json or live campus resolver).
- `campus-roles-snapshot.json` / `campus-roles-overrides.json`: live campus-role cache and Hailey-confirmed overrides.
