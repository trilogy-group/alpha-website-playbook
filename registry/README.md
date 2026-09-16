# Registry

- `sources.json`: where every fact and cross-system identity comes from, with access notes and authority boundaries.
- `campus-pages.json`: campus slug to URL, WordPress object, map program ids, and the names tickets use.
- `campus-identities.json`: partial, verified HubSpot program ID crosswalk to Community IDs, slugs, visibility, and canonical Community destinations. A missing row must not be inferred.
- `campus-open-media.json`: approved open-campus intro media per campus and who produces it.
- `campus-leadership.json`: per campus, the leadership shown on the page (Head of Schools, Dean of Parents, Director of Admissions, guides), plus placeholder cards found.
- `people.json`: people and the roles they hold, each with a source and date. People change; `spec/responsibilities.json` holds the roles.
- `observer-checks.json`: the production observer's check catalog.
- `missing-info-routing.json` / `missing-info-routing.md`: Missing Info class to role routing (people never in rules; resolve via people.json or live campus resolver).
- `campus-roles-snapshot.json` / `campus-roles-overrides.json`: live campus-role cache and Hailey-confirmed overrides.
