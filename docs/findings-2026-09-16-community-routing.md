# Community routing findings, September 16, 2026

This is a read-only finding set for the Alpha website playbook. No Community app, HubSpot, growth map, or WordPress state was changed.

## Where the Jacksonville and Short Hills links came from

The deployed Community app reads a program registry containing `programs` and `program_summary`. Its records were joined to the public growth map by exact HubSpot program ID.

| Campus | Map ID | Community ID | Community slug | Canonical Community URL |
| --- | --- | --- | --- | --- |
| Jacksonville | `program-61873568410` | `prog-61873568410` | `alpha-jacksonville` | `https://www.community.alpha.school/?campus=alpha-jacksonville` |
| Short Hills | `program-61884164703` | `prog-61884164703` | `alpha-short-hills` | `https://www.community.alpha.school/?campus=alpha-short-hills` |

Both are `pre-announcement` and visible in the Community app. Their public map rows currently omit both `url` and `communityUrl`. The mappings are recorded in `registry/campus-identities.json`; the missing map destinations are documented, not changed.

## Useful context in the Community registry

The registry can help website triage by exposing Community ID and slug, the HubSpot program ID, Community lifecycle and visibility, open date, scheduling and admissions links, event program-interest fields, confirmed or proposed location, campus role holders, and founding, enrollment, or member counts.

Only the Community-specific identity and routing fields are authoritative for Community behavior. HubSpot remains the source of truth for campus facts and business lifecycle. Counts, deposits, staff relationships, and other operational values cannot be promoted to public website facts without explicit approval.

## Routing contract

The current app uses `campus=<slug>`. It also recognizes `invite` and `ref` for referrals. `preferred_campus` is legacy and absent from the current deployed bundle.

The production observer does not yet fully enforce this current contract. Its implementation still describes `preferred_campus` as expected and detects only the misspelled `preferref_campus`. This gap belongs in the playbook and observer backlog; it is not fixed by this repository change.

## Coverage snapshot

The public map had 77 programs: 38 Open, 8 Announced, and 31 Pre-Announcement. Twelve Pre-Announcement records lacked both `url` and `communityUrl`: Bryn Mawr, Columbus, Indianapolis, Jacksonville, London, Milwaukee, Minneapolis, Philadelphia, Richmond, Sarasota, Short Hills, and The Hamptons.

The existing page-oriented registry has 44 WordPress campus pages and represents 45 map programs. It excludes all 31 Pre-Announcement programs plus Alpha High. It remains the right page registry, but it must not be used as a complete campus identity registry.

## Open owner question

No Community app owner has been confirmed. The new `community-app-owner` role remains deliberately unassigned. App-side changes must wait for that owner rather than defaulting to website operations or Operations.
