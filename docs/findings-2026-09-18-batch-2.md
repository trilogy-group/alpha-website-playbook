# Batch 2 findings (2026-09-18): the write path under the new gates

Second fresh-agent run, one day after the first. Plugin 0.5.2, policy bundle 7469f86bfba6, APEX control plane (PR 330) merged the same morning. Six tickets: one real write, five observer tickets. Brief and scored sheet live in the marketingsupport workspace under `work-assets/apex-website-tickets/batch-2-2026-09-18/`.

## Result

| Measure | Value |
| --- | ---: |
| Decisions correct | 6 of 6 (two better than the reviewer's sheet) |
| Evidence complete | 6 of 6 |
| WordPress writes | 1 change, 5 receipts, 6 fields on 2 widgets, one page |
| Writes on other pages or tickets | 0 |
| Wall time | 33 minutes |

The write (Houston Book a Call, under an operator instruction) went prepare, apply, CSS, cache, verify, rendered on desktop and mobile with screenshots, plus a ring 3 check on two unrelated pages; every receipt carries the ticket id and the run id. The ticket stayed open for the HubSpot follow-up and the post-nightly-run recheck, which is the right closure discipline.

All five observer tickets were refused with every occurrence attributed: a university name and shared navigation (Kirkland), the documented Brownsville/Nova path, a HubSpot event venue (Lake Travis), a stale finding already fixed (Franklin), and a real defect whose page the observer misnamed (Lexington is `boston-suburbs`; the Miami alt text lives on a shared attachment used by six objects, so the fix is an approved replacement image, requested from Yash).

## Fixed in this commit

- `tests/page-check.mjs` `no-sister-brand-words` now checks page-owned copy only: HubSpot-fed event cards and the In the News gallery are excluded, proper nouns that contain a brand word are excluded, and a campus may carry a named exception. Three of the six tickets traced to this one check.
- `registry/sister-brand-exceptions.json` records the Brownsville/Nova path as named phrases with the decision, instead of a clause in two files.

## Decisions needed (owners)

1. **Observer parity.** The observer's `site.identity.sister-brand` check should read the same exceptions registry and exclusions, or it keeps filing the same three ticket shapes. Observer owner.
2. **Where staff bios live.** The Kirkland bio that carries the only page-visible "Nova" is not in the page object; `find_text_occurrences` and `search_site` both miss it. The staff carousel's storage needs a row in `spec/campus-page-field-map.json` and a read path in the recipe. Website agent operator, with the Elementor owner.
3. **Event card fields.** The events plugin renders HubSpot Marketing Event fields (venue, time) inside the page; `spec/campus-page-field-map.json` and `spec/synced-targets.json` cover only the wrapper. Add rows naming the writer (HubSpot event) and owner (event owner) so step 1b does not dead-end. Website agent operator.
4. **Campus name to slug.** Lexington is `boston-suburbs`; only a title in `registry/campus-pages.json` says so. A crosswalk field (`aliases`) on campus-pages entries. Website agent operator.
5. **Approved media for Announced campuses.** `registry/campus-open-media.json` covers open campuses; `playbook/campus-page/announced.md` requires approved launch media but no registry holds it. Yash owns intro cards. Yash and Matt.
6. **Link-cta destination check.** `go.alpha.school` answers 200 with a soft not-found page for an invented meetings slug; the recipe must say the check is rendered and name that body. Website agent operator.
7. **Intake behaviors** (for the intake administrator's owner): the page URL is derived from a campus name in the title over the ticket's own `url` field; `observer-media-identity` is blocked on `approvedMedia` even when the recipe allows an alt-text-only fix; `--apply` moved two tickets to BLOCKED under `internal-triage` with no assignee; a standing operator instruction on a ticket is not read. The first three are defects; the fourth is a rule to write: an operator instruction is authoritative for scope and intake must not re-route a ticket that carries one.
8. **Ticket creation authority.** Protocol step 8 asks the agent to file tickets for defects found while working; the batch briefs authorized only notes and status. Two found defects (Franklin and Brownsville Book a Call widgets hidden and relabelled) sit as validated dry-run payloads in the evidence folder. Decide whether a fresh agent may file tickets on its own; if yes, the brief template says so.

## Small gaps to fold into the integration doc

- There is no `health` MCP tool; plugin version and operator mode come from `access_report.alphaMcp` (the bridge's `health()` is a client method).
- `executionToken` is required by every write schema and optional in operator mode; the bridge sends it as a header only when present.
- APEX assignee writes take `{ assignees: { set: [{ id }] } }`; a bare array or `connect` is rejected.
