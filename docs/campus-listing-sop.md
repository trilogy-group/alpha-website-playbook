# Campus listing SOP

Listings reach Google Business Profile, Apple Business Connect, and Bing Places from HubSpot Programs through n8n and Rio SEO. This monitor is read-only. It exists so that work does not depend on any one person or a personal AI account: the workflow, the variables, the secrets, and the alert destination all belong to the shared repository.

The n8n Rio SEO flow has no formal owner and needs one. `registry/owners.json` records that gap as `n8n-sync-owner` (`n8nOwnershipGap.confirmedPerson` is null). Until a role is filled, do not hang the push, the hours setting, or this monitor on a named person.

## 1. Data flow

```text
HubSpot Programs
    -> n8n Rio SEO Locations Data Push (about 10 AM CT)
    -> Rio SEO
    -> Google Business Profile, Apple Business Connect, Bing Places
```

- HubSpot Programs is the source the push reads. Fix listing facts there. The next push overwrites Google Business Profile.
- Visibility `Hidden` means the record is not sent.
- Business hours are not a HubSpot field. Hours live in n8n. An hours fix is done in n8n, not in Google Business Profile.
- The homepage map and the campus page are other consumers of Programs. This SOP covers the Rio SEO listing path only. Page edits stay on the website ticket path in `playbook/00-how-to-use.md`.

The push schedule is the Rio Locations row in `playbook/integrations/n8n-workflow-map.md`: trigger hour 10, timezone inherited from the n8n instance. Confirm the instance timezone in n8n before treating 10:00 as a promise. The shared-reader duplicate guard and the Rio length gates inside n8n are unchanged; see `playbook/integrations/program-data-reliability.md` and `spec/program-data-reliability.json`.

## 2. When the monitor runs

GitHub cron is UTC and does not follow US daylight saving. The Central clock time shifts by one hour between CDT (UTC-5) and CST (UTC-6).

| Job | Cron (UTC) | Central time | What it does |
| --- | --- | --- | --- |
| HubSpot listing check | `0 14 * * *` | 9:00 AM CDT / 8:00 AM CST | Before the about 10 AM CT push, so a fix can land the same morning |
| Rio SEO rejection check | `0 20 * * *` | 3:00 PM CDT / 2:00 PM CST | Reads the daily import report for rejections when credentials exist |
| GBP compare | `30 14 * * 1` | Monday 9:30 AM CDT / 8:30 AM CST | Closed suggestions, pin moves, and hours |

`workflow_dispatch` can run one check, or `all`, with a dry run. A dry run prints counts, does not post to the alert destination, and does not upload a new state artifact.

The afternoon and weekly jobs are stubs. If `RIOSEO_API_KEY` or `RIOSEO_REPORT_URL` is absent, the afternoon job skips with a notice. If `GBP_ACCESS_TOKEN` or `GBP_ACCOUNT_ID` is absent, the weekly job skips with a notice. When those secrets are present the job still does not call the vendor; it records that the check is not implemented yet.

## 3. How an alert is delivered

There is one alert destination: the `ALERT_SLACK_WEBHOOK_URL` secret.

- A clean run posts nothing and exits 0.
- A run with issues posts one message to that destination and exits 0. The message names each campus, links to the HubSpot record, names the exact field, and gives the fix.
- If that secret is unset and the run has issues, the job fails so GitHub emails the watchers. The public log still contains only counts.
- Job logs and the GitHub step summary never include campus names, field values, record links, or portal or object identifiers. Those details are not committed.

The record link is built at runtime from the repository variable `HUBSPOT_PORTAL_ID` and the object type id returned by the HubSpot schema. Neither value is stored in this repository.

Property names are discovered at runtime. For each logical field the monitor uses the first candidate that exists on the Programs schema:

| Logical field | Candidate internal names, in order |
| --- | --- |
| name | `name`, `program_name`, `campus_name`, `hs_object_name` |
| is_open | `is_open`, `open` |
| type | `type`, `program_type`, `campus_type` |
| visibility | `visibility`, `listing_visibility` |
| address | `address_1`, `address1`, `address_line_1`, `street_address`, `address`, `school_address` |
| phone | `phone`, `phone_number`, `main_phone`, `contact_number` |
| description | `description`, `listing_description`, `google_description`, `rio_description` |

The alert's Field line is the internal name that won. If that name is not the one editors expect, the Web ops owner reorders the candidate list after checking the schema. A missing required candidate fails the job instead of skipping the check.

Day-over-day state is the workflow artifact `campus-listing-monitor-state`, kept 30 days. It is not a git branch and it is not a file on `main`. The first run has no baseline, so it reports quality issues only. Later runs also report field changes against the newest artifact from the default branch. A dry run, a failed alert delivery, and a run that fails before the snapshot is written leave the previous artifact in place.

## 4. What each alert means and how to fix it

Quality checks apply to records whose visibility is `Visible` (comparison is case-insensitive). `Hidden` records are not sent, so a blank address or phone on a hidden record is not an alert.

| Alert | Meaning | Field | Fix |
| --- | --- | --- | --- |
| Missing address | A visible campus has an empty address property | the resolved address property | add address_1 or set visibility Hidden |
| Missing phone | A visible campus has an empty phone property | the resolved phone property | add phone |
| Description over 300 characters | The resolved description, after trimming ends, is longer than 300 characters | the resolved description property | trim description to 300 chars |
| Visibility and is_open disagree | See the rules under this table | `visibility` and `is_open` | align visibility and is_open in HubSpot. Fix in HubSpot, not GBP; next Rio push ~10 AM CT overwrites GBP |
| Duplicate id | The same HubSpot record id was returned more than once in the read | `id` | merge or remove the duplicate listing. Fix in HubSpot, not GBP; next Rio push ~10 AM CT overwrites GBP |
| Field changed | Since the previous snapshot, `is_open`, `type`, `visibility`, `name`, address, or phone changed | the property that changed | fix in HubSpot, not GBP; next Rio push ~10 AM CT overwrites GBP |
| Added | A visible record was not in the previous snapshot | `id` | confirm the campus should be listed. Fix in HubSpot, not GBP; next Rio push ~10 AM CT overwrites GBP |
| Removed | A record that was visible is gone from the read (archived or deleted) | `id` | restore the record or confirm it should leave the feed. Fix in HubSpot, not GBP; next Rio push ~10 AM CT overwrites GBP |
| Hours (weekly compare, when that check is implemented) | Business hours disagree | the n8n hours setting | fix in n8n, hours live there |

Visibility rules:

- `Visible` and `is_open` true: no mismatch.
- `Hidden` and `is_open` false or empty: no mismatch. The record is not sent.
- `Visible` and `is_open` false, empty, or unrecognized: mismatch.
- `Hidden` and `is_open` true: mismatch. An open campus is not being sent.
- Any other visibility value: mismatch. The push treats only `Visible` as sent.

`is_open` true values are `true`, `yes`, `y`, `1`, and `open`. False values are `false`, `no`, `n`, `0`, and `closed`. Matching ignores case.

The 300-character cap is the Google service description limit in `spec/program-data-reliability.json` (`rendered-rio-description-limits`, `googleServiceDescriptionEachBaseAnd01Through06`). That contract also caps a short description at 140, an Apple description at 500, and a long description at 750. This monitor flags the one description property it resolves. It does not invent property names for the other three caps. Do not turn off the n8n validators to clear an alert.

Duplicate ids here are repeats in the HubSpot read (a repeated page or cursor). They are not the HubDB join duplicates described in `playbook/integrations/program-data-reliability.md`. Keep that guard. A join duplicate still has to be fixed in the mapping, by the n8n flow owner once one exists.

Closed suggestions, pin moves, and hours are the weekly compare. That compare is a stub until the GBP secrets exist and the check is implemented. The manual cleanup below covers them in the meantime. Do not treat a quiet weekly run as evidence that GBP was compared.

## 5. One-time cleanup

Do this once, then let the morning check keep the list honest. Each item names a role, not a person.

1. Fill missing addresses on every visible campus, or set visibility to Hidden if the campus must not be listed. Owner: HubSpot Program owner. Fix: add address_1 or set visibility Hidden.
2. Fill missing phones on every visible campus. Owner: HubSpot Program owner. Fix: add phone.
3. Trim every listing description to 300 characters or fewer, keeping the approved meaning (proposed, enrolling, or waitlist). Owner: HubSpot Program owner. Fix: trim description to 300 chars.
4. Clear closed suggestions and other edit suggestions on Google Business Profile. If the suggestion is wrong because HubSpot is wrong, fix HubSpot and let the next push overwrite the profile. Owner: Marketing listings owner. Fix: fix in HubSpot, not GBP; next Rio push ~10 AM CT overwrites GBP.
5. Verify pins. If the pin is wrong because the address is wrong, fix the address in HubSpot. If a suggestion moved a correct pin, clear the suggestion. Owner: Marketing listings owner for the profile, HubSpot Program owner for the address.
6. Verify hours against the n8n hours setting. Owner: n8n flow owner: UNASSIGNED. Fix: fix in n8n, hours live there.
7. Merge or remove duplicate listings. If the monitor reports a duplicate HubSpot id, merge or remove the extra Program record. If a profile has two listings for one campus, merge them after the HubSpot id is unique. Owner: HubSpot Program owner for the record, Marketing listings owner for the profile.
8. Work the Rio SEO rejection report. Fix the rejected rows at the source (HubSpot, or n8n when the failure is hours or the rendered description), then confirm those rows were accepted on the next day's report. Owner: n8n flow owner: UNASSIGNED for the push and the report; HubSpot Program owner for source fields. The afternoon job will do this read when it is no longer a stub.

## 6. Owners

| Work | Role |
| --- | --- |
| This monitor: workflow, variables, secrets, alert destination | Web ops owner |
| Programs fields: name, type, is_open, visibility, address, phone, description | HubSpot Program owner |
| Rio SEO Locations Data Push, the hours setting, and the import rejection report | n8n flow owner: UNASSIGNED |
| Rio SEO, Google Business Profile, Apple Business Connect, and Bing Places access | Marketing listings owner |

The n8n Rio SEO flow has no formal owner and needs one. Do not assign that flow, the hours setting, or a listing fix to a personal login or a personal AI account. Web ops owner asks the website agent operator to resolve the `n8n-sync-owner` gap (protocol 1d in `protocols/apex-website-ticket-protocol.md`). Resolving the gap names an owner. It does not by itself change the workflow.

## 7. Credentials and repository settings

This change does not add secrets or variables. Add these in the repository settings before the first scheduled run.

Required:

| Name | Kind | Purpose |
| --- | --- | --- |
| `HUBSPOT_TOKEN` | Secret | HubSpot service key. Scopes: `crm.objects.custom.read`, `crm.schemas.custom.read`. No write scope. Not a personal token and not the n8n credential. |
| `HUBSPOT_PORTAL_ID` | Variable, or secret of the same name | Portal id used only to build the record link at runtime |
| `HUBSPOT_PROGRAMS_OBJECT` | Variable, or secret of the same name | Programs custom object API name used to read the schema and the records |

Optional:

| Name | Kind | Purpose |
| --- | --- | --- |
| `ALERT_SLACK_WEBHOOK_URL` | Secret | The only alert destination. Without it, a run that finds issues fails and GitHub emails watchers. |
| `RIOSEO_API_KEY` | Secret | Afternoon rejection check. Both this and the report URL must be set or the job skips. |
| `RIOSEO_REPORT_URL` | Secret | Address of the Rio SEO daily import report. |
| `GBP_ACCESS_TOKEN` | Secret | Weekly compare. Both this and the account id must be set or the job skips. |
| `GBP_ACCOUNT_ID` | Secret | Google Business Profile account the weekly compare will read. |

Store values only in GitHub Actions secrets and variables. Do not commit a snapshot, a token, a portal id, an object type id, a record id, or an alert body.

## 8. What this monitor does not do

- It does not edit HubSpot, n8n, Rio SEO, Google Business Profile, Apple, or Bing.
- It does not call HubSpot from the offline test.
- It does not implement the follow-up automation in `spec/program-data-reliability.json`.
- It does not check short, Apple, or long description caps until those properties are added to the candidate list from the schema.
- A stub skip is not a clean bill of health for Rio SEO rejections or for GBP.

## 9. Local check

Offline, from the repository root:

```bash
python3 -m py_compile tools/campus-listing-monitor/campus_monitor.py
python3 -m unittest discover -s tools/campus-listing-monitor -p 'test_*.py'
```

A live dry run uses the same environment variables as the workflow. It prints a counts line and does not post:

```bash
python3 tools/campus-listing-monitor/campus_monitor.py --check daily --dry-run \
  --snapshot-in tmp/previous.json \
  --snapshot-out tmp/snapshot.json \
  --counts tmp/counts.json
```

Set the variables in the environment before that command. Do not put a token on the command line in a shared transcript.
