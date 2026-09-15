# Registry

- `sources.json`: where every fact on the site comes from, with access notes.
- `campus-pages.json`: campus slug to URL, WordPress object, map program ids, and the names tickets use.
- `campus-open-media.json`: approved open-campus intro media per campus and who produces it.
- `campus-leadership.json`: per campus, the leadership shown on the page (Head of Schools, Dean of Parents, Director of Admissions, guides), plus placeholder cards found.
- `people.json`: people and the roles they hold, each with a source and date. People change; `spec/responsibilities.json` holds the roles.
- `observer-checks.json`: the production observer's check catalog.
- `missing-info-routing.json` / `missing-info-routing.md`: Missing Info class to role routing (people never in rules; resolve via people.json or live campus resolver).
- `campus-roles-snapshot.json` / `campus-roles-overrides.json`: live campus-role cache and Hailey-confirmed overrides.
