# Roster diff dry run, 2026-09-21

Evidence for `agent/roster-diff.mjs` (`docs/headshot-binding.md`). Everything here was read only: the public pptx export of the registered deck, one Alpha WordPress MCP `get_page` read of the live page, and GET requests for the page's own card images. Nothing was written to WordPress or APEX and no photo was bound. Bios are redacted (`--redact-bios` keeps hashes and lengths); no photo is stored here.

## Orange County

```
node agent/roster-diff.mjs --campus orange-county --live <get_page result for object 6551> \
  --hash-live-images --redact-bios --out docs/roster-diff-dry-run-2026-09-21
```

Files: `roster-diff-orange-county.plan.json`, `roster-diff-orange-county.md`.

Result: deck 14 slides, 12 person slides (cover and closing skipped); live page 10 cards.

- 3 adds (in the deck, not on the page); one has a photo and a proposed binding, two slides have no bio or photo yet.
- 1 remove candidate: the Head of Schools card, which `registry/campus-leadership.json` lists for the campus and the campus deck leaves out. The plan says so rather than proposing a removal.
- 2 name conflicts: two people whose spelling differs by one or two letters between the deck and the page. Reported for a person to settle, not as an add plus a remove.
- 2 name notes: one honorific on the deck only, one extra surname on the deck only; both matched.
- 5 title changes, mostly the deck carrying a level or a longer role than the page.
- 4 bio changes (one where the page contains the deck bio plus more text).
- 5 photo changes, all `bytes-differ`: no live image matched its deck image byte for byte, neither the served `-scaled` file nor the original beside it. Slides and WordPress both re-encode, so this means "compare by eye". 2 photo unknown because the slide has no photo.
- 1 unchanged.

The same run with the rendered public page as the live side (no `--live`) gave the same membership, title, and name results; photos were all `photo-unknown` without hashing, and one long bio read in full rather than as a 1000 character prefix.

Scottsdale through the rendered page also ran clean (6 adds, 2 removes, 2 title changes, 2 bio changes, 1 name conflict); that plan was not kept.

## All registered decks

`deck-survey.json`: counts only, no names. All 39 registered decks exported publicly and parsed. 29 produce person slides without an override (271 people; 45 slides have no photo yet and 42 no bio). 10 stop with `slide_without_name` because a slide still says `[ Name ]` over a real title, an open role: bethesda, boston, boston-suburbs, fort-worth, lake-travis, malibu, oklahoma-city, park-city, san-francisco, southlake. `--allow-open-roles` skips and lists those slides; the default stays fail closed.
