#!/usr/bin/env python3
"""Read-only campus listing monitor.

Checks HubSpot Programs records that feed the n8n Rio SEO Locations Data Push.
Property names are discovered from the live schema. Portal id and object type
come from the environment, never from this file.

Exit codes: 0 clean, dry-run, or an optional stub skip; 1 issues with no alert
destination, Slack failure, or a read error; 2 configuration error.

Public stdout is a counts line. Campus names, record links, and field values
are written only to the alert destination, or to --alert-out outside GitHub
Actions. See docs/campus-listing-sop.md.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

HUBSPOT_BASE = "https://api.hubapi.com"
DESCRIPTION_LIMIT = 300
STATE_ARTIFACT = "campus-listing-monitor-state"

# Logical field -> HubSpot internal names. The first name present on the schema wins.
PROPERTY_CANDIDATES: dict[str, list[str]] = {
    "name": ["name", "program_name", "campus_name", "hs_object_name"],
    "is_open": ["is_open", "open"],
    "type": ["type", "program_type", "campus_type"],
    "visibility": ["visibility", "listing_visibility"],
    "address_1": ["address_1", "address1", "address_line_1", "street_address", "address", "school_address"],
    "phone": ["phone", "phone_number", "main_phone", "contact_number"],
    "description": ["description", "listing_description", "google_description", "rio_description"],
}
REQUIRED_FIELDS = ("name", "is_open", "type", "visibility", "address_1", "phone", "description")
DIFF_FIELDS = ("is_open", "type", "visibility", "name", "address_1", "phone")
SNAPSHOT_FIELDS = DIFF_FIELDS

ADDRESS_FIX = "add address_1 or set visibility Hidden"
PHONE_FIX = "add phone"
DESCRIPTION_FIX = "trim description to 300 chars"
GBP_FIX = "fix in HubSpot, not GBP; next Rio push ~10 AM CT overwrites GBP"
HOURS_FIX = "fix in n8n, hours live there"
DUPLICATE_FIX = "merge or remove the duplicate listing. " + GBP_FIX

OPEN_TRUE = {"true", "yes", "y", "1", "open"}
OPEN_FALSE = {"false", "no", "n", "0", "closed"}
COUNT_INT_KEYS = (
    "records",
    "visible",
    "issues",
    "missing_address",
    "missing_phone",
    "description_over_300",
    "visibility_is_open",
    "duplicate_ids",
    "field_changes",
    "added",
    "removed",
    "baseline",
)
ALLOWED_ALERT = {"none", "sent", "dry-run", "missing-webhook", "slack-failed", "skipped", "stub"}
ALLOWED_CHECK = {"daily", "rioseo", "gbp"}


class MonitorError(Exception):
    """Safe to print: the message must not contain secrets, ids, or record values."""

    def __init__(self, message: str, code: int = 1) -> None:
        super().__init__(message)
        self.code = code


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def normalize_value(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return ", ".join(normalize_value(item) for item in value).strip()
    return str(value).strip()


def resolve_properties(available: set[str]) -> tuple[dict[str, str], list[str]]:
    mapping: dict[str, str] = {}
    missing: list[str] = []
    for logical, candidates in PROPERTY_CANDIDATES.items():
        found = next((name for name in candidates if name in available), None)
        if found:
            mapping[logical] = found
        else:
            missing.append(logical)
    return mapping, missing


def parse_open(value: str) -> bool | None:
    token = value.strip().casefold()
    if token in OPEN_TRUE:
        return True
    if token in OPEN_FALSE:
        return False
    return None


def is_visible(value: str) -> bool:
    return value.strip().casefold() == "visible"


def is_hidden(value: str) -> bool:
    return value.strip().casefold() == "hidden"


def visibility_mismatch(visibility: str, is_open: str) -> bool:
    """Visible listings must be open. Hidden listings must not be marked open."""
    opened = parse_open(is_open)
    if is_visible(visibility):
        return opened is not True
    if is_hidden(visibility):
        return opened is True
    return True


def record_url(portal_id: str, object_type_id: str, record_id: str) -> str:
    portal = urllib.parse.quote(portal_id, safe="")
    object_type = urllib.parse.quote(object_type_id, safe="")
    record = urllib.parse.quote(record_id, safe="")
    return f"https://app.hubspot.com/contacts/{portal}/record/{object_type}/{record}"


def field_name(mapping: dict[str, str], logical: str) -> str:
    return mapping.get(logical, logical)


@dataclass(frozen=True)
class Issue:
    kind: str
    campus: str
    record_id: str
    field: str
    fix: str
    url: str
    detail: str = ""


def campus_label(fields: dict[str, str]) -> str:
    name = fields.get("name", "").strip()
    return name or "(no name)"


def _issue(kind: str, fields: dict[str, str], record_id: str, field: str, fix: str, url: str, detail: str = "") -> Issue:
    return Issue(kind, campus_label(fields), record_id, field, fix, url, detail)


def find_issues(
    records: list[tuple[str, dict[str, str]]],
    previous: dict[str, dict[str, str]] | None,
    *,
    portal_id: str,
    object_type_id: str,
    mapping: dict[str, str],
) -> list[Issue]:
    issues: list[Issue] = []
    seen: dict[str, dict[str, str]] = {}
    for record_id, fields in records:
        url = record_url(portal_id, object_type_id, record_id)
        if record_id in seen:
            issues.append(_issue("duplicate_ids", fields or seen[record_id], record_id, "id", DUPLICATE_FIX, url))
            continue
        seen[record_id] = fields
        if is_visible(fields.get("visibility", "")):
            if not fields.get("address_1", "").strip():
                issues.append(_issue(
                    "missing_address", fields, record_id, field_name(mapping, "address_1"), ADDRESS_FIX, url,
                ))
            if not fields.get("phone", "").strip():
                issues.append(_issue(
                    "missing_phone", fields, record_id, field_name(mapping, "phone"), PHONE_FIX, url,
                ))
            description = fields.get("description", "")
            if len(description) > DESCRIPTION_LIMIT:
                issues.append(_issue(
                    "description_over_300",
                    fields,
                    record_id,
                    field_name(mapping, "description"),
                    DESCRIPTION_FIX,
                    url,
                    detail=f"Length: {len(description)}",
                ))
        if visibility_mismatch(fields.get("visibility", ""), fields.get("is_open", "")):
            both = f"{field_name(mapping, 'visibility')}, {field_name(mapping, 'is_open')}"
            issues.append(_issue(
                "visibility_is_open",
                fields,
                record_id,
                both,
                "align visibility and is_open in HubSpot. " + GBP_FIX,
                url,
            ))

    if previous is None:
        return issues

    for record_id, fields in seen.items():
        url = record_url(portal_id, object_type_id, record_id)
        old = previous.get(record_id)
        if old is None:
            if is_visible(fields.get("visibility", "")):
                issues.append(_issue("added", fields, record_id, "id", "confirm the campus should be listed. " + GBP_FIX, url))
            continue
        for logical in DIFF_FIELDS:
            if logical not in old:
                continue
            before = normalize_value(old.get(logical, ""))
            after = normalize_value(fields.get(logical, ""))
            if before != after:
                issues.append(_issue(
                    "field_changes",
                    fields,
                    record_id,
                    field_name(mapping, logical),
                    GBP_FIX,
                    url,
                    detail=f"Was: {before or '(empty)'} Now: {after or '(empty)'}",
                ))
    for record_id, old in sorted(previous.items()):
        if record_id in seen:
            continue
        if not is_visible(normalize_value(old.get("visibility", ""))):
            continue
        url = record_url(portal_id, object_type_id, record_id)
        issues.append(_issue(
            "removed",
            {key: normalize_value(value) for key, value in old.items()},
            record_id,
            "id",
            "restore the record or confirm it should leave the feed. " + GBP_FIX,
            url,
        ))
    return issues


def render_alert(check: str, issues: list[Issue]) -> str:
    lines = [f"Campus listing monitor ({check}): {len(issues)} issues", ""]
    for issue in issues:
        lines.append(f"* {issue.campus}")
        lines.append(f"  Record: {issue.url}")
        lines.append(f"  Field: {issue.field}")
        if issue.detail:
            lines.append(f"  {issue.detail}")
        lines.append(f"  Fix: {issue.fix}")
        lines.append("")
    text = "\n".join(lines).rstrip() + "\n"
    if len(text) <= 35000:
        return text
    kept: list[str] = []
    size = 0
    for issue in issues:
        block = "\n".join([
            f"* {issue.campus}",
            f"  Record: {issue.url}",
            f"  Field: {issue.field}",
            *([f"  {issue.detail}"] if issue.detail else []),
            f"  Fix: {issue.fix}",
            "",
        ])
        if size + len(block) > 34000:
            break
        kept.append(block)
        size += len(block)
    omitted = len(issues) - len(kept)
    header = f"Campus listing monitor ({check}): {len(issues)} issues\n\n"
    note = f"\n{omitted} more issues omitted from this message. Fix these and the next run reports the rest.\n"
    return header + "".join(kept) + note


def public_document(check: str, alert: str, tally: dict[str, int]) -> dict[str, object]:
    if check not in ALLOWED_CHECK:
        raise MonitorError("unknown check name")
    if alert not in ALLOWED_ALERT:
        raise MonitorError("unknown alert status")
    document: dict[str, object] = {"check": check, "alert": alert}
    for key in COUNT_INT_KEYS:
        value = tally.get(key, 0)
        if not isinstance(value, int) or isinstance(value, bool):
            raise MonitorError("count was not an integer")
        document[key] = value
    return document


def format_public_line(data: dict) -> str:
    check = data.get("check")
    if check not in ALLOWED_CHECK:
        check = "unknown"
    alert = data.get("alert")
    if alert not in ALLOWED_ALERT:
        alert = "unknown"
    parts = [f"check={check}"]
    for key in COUNT_INT_KEYS:
        value = data.get(key, 0)
        if not isinstance(value, int) or isinstance(value, bool):
            value = 0
        parts.append(f"{key}={value}")
    parts.append(f"alert={alert}")
    return "campus-listing-monitor " + " ".join(parts)


def tally_issues(issues: list[Issue], *, records: int, visible: int, baseline: bool) -> dict[str, int]:
    kinds = {key: 0 for key in (
        "missing_address", "missing_phone", "description_over_300", "visibility_is_open",
        "duplicate_ids", "field_changes", "added", "removed",
    )}
    for issue in issues:
        if issue.kind not in kinds:
            raise MonitorError("unknown issue kind")
        kinds[issue.kind] += 1
    return {
        "records": records,
        "visible": visible,
        "issues": len(issues),
        "baseline": 1 if baseline else 0,
        **kinds,
    }


def snapshot_document(mapping: dict[str, str], records: dict[str, dict[str, str]], generated_at: str) -> dict:
    stored = {}
    for record_id, fields in records.items():
        stored[record_id] = {logical: normalize_value(fields.get(logical, "")) for logical in SNAPSHOT_FIELDS}
    return {
        "generated_at": generated_at,
        "property_map": {logical: mapping[logical] for logical in SNAPSHOT_FIELDS if logical in mapping},
        "records": stored,
    }


def load_snapshot(path: Path) -> dict[str, dict[str, str]]:
    parsed = json.loads(path.read_text() or "{}")
    if not isinstance(parsed, dict) or not isinstance(parsed.get("records"), dict):
        raise MonitorError("Previous snapshot could not be read. Refusing to replace the baseline.")
    records: dict[str, dict[str, str]] = {}
    for record_id, fields in parsed["records"].items():
        if not isinstance(fields, dict):
            raise MonitorError("Previous snapshot could not be read. Refusing to replace the baseline.")
        records[str(record_id)] = {str(key): normalize_value(value) for key, value in fields.items()}
    return records


def write_json(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def select_state_artifact(payload: dict, branch: str) -> str | None:
    artifacts = payload.get("artifacts")
    if not isinstance(artifacts, list):
        raise MonitorError("artifact list missing")
    rows = []
    for artifact in artifacts:
        if not isinstance(artifact, dict) or artifact.get("expired") or artifact.get("name") != STATE_ARTIFACT:
            continue
        run = artifact.get("workflow_run") or {}
        if not isinstance(run, dict) or run.get("head_branch") != branch:
            continue
        rows.append(artifact)
    if not rows:
        return None
    rows.sort(key=lambda artifact: (str(artifact.get("created_at") or ""), int(artifact.get("id") or 0)))
    return str(rows[-1]["id"])


def extract_snapshot(zip_path: Path, dest: Path) -> None:
    with zipfile.ZipFile(zip_path) as archive:
        names = []
        for name in archive.namelist():
            path = PurePosixPath(name)
            if path.name != "snapshot.json" or ".." in path.parts:
                continue
            names.append(name)
        if len(names) != 1:
            raise MonitorError("state archive did not contain one snapshot")
        raw = archive.read(names[0])
    parsed = json.loads(raw.decode())
    if not isinstance(parsed, dict) or not isinstance(parsed.get("records"), dict):
        raise MonitorError("state archive snapshot is not a records object")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw if raw.endswith(b"\n") else raw + b"\n")


def normalize_records(raw_records: list[dict], mapping: dict[str, str]) -> list[tuple[str, dict[str, str]]]:
    normalized = []
    for record in raw_records:
        properties = record.get("properties") or {}
        fields = {logical: normalize_value(properties.get(actual)) for logical, actual in mapping.items()}
        normalized.append((str(record["id"]), fields))
    return normalized


def rioseo_notice(has_key: bool, has_url: bool) -> tuple[str, str]:
    if not (has_key and has_url):
        return "skipped", "NOTICE: Rio SEO rejection check skipped; RIOSEO_API_KEY or RIOSEO_REPORT_URL is not set."
    return "stub", "NOTICE: Rio SEO rejection check is a stub. The daily import report was not read."


def gbp_notice(has_token: bool, has_account: bool) -> tuple[str, str]:
    if not (has_token and has_account):
        return "skipped", "NOTICE: GBP vs HubSpot compare skipped; GBP_ACCESS_TOKEN or GBP_ACCOUNT_ID is not set."
    return (
        "stub",
        "NOTICE: GBP vs HubSpot compare is a stub. Closed suggestions, pin moves, and hours were not checked. "
        f"When an hours issue is found, the fix is: {HOURS_FIX}.",
    )


class HubSpot:
    def __init__(self, token: str, object_type: str):
        self.token = token
        self.object_type = object_type

    def _get(self, path: str, params: dict | None = None) -> dict:
        query = ("?" + urllib.parse.urlencode(params)) if params else ""
        url = HUBSPOT_BASE + path + query
        request = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
        })
        last_status = 0
        for attempt in range(5):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    return json.loads(response.read().decode())
            except urllib.error.HTTPError as error:
                last_status = error.code
                if error.code in (401, 403):
                    raise MonitorError(
                        "HubSpot auth error. HUBSPOT_TOKEN needs crm.objects.custom.read and crm.schemas.custom.read.",
                        code=2,
                    ) from None
                if error.code == 404:
                    raise MonitorError("HubSpot object did not resolve. Check HUBSPOT_PROGRAMS_OBJECT.", code=2) from None
                if error.code == 429 or error.code >= 500:
                    time.sleep(min(2 ** attempt, 30))
                    continue
                raise MonitorError(f"HubSpot request failed with HTTP {error.code}.") from None
            except urllib.error.URLError:
                raise MonitorError("HubSpot request failed.") from None
        raise MonitorError(f"HubSpot request failed with HTTP {last_status}.")

    def schema(self) -> dict:
        quoted = urllib.parse.quote(self.object_type, safe="")
        return self._get(f"/crm/v3/schemas/{quoted}")

    def property_names(self) -> set[str]:
        quoted = urllib.parse.quote(self.object_type, safe="")
        names: set[str] = set()
        after = None
        for _page in range(50):
            params = {"limit": 100}
            if after:
                params["after"] = after
            payload = self._get(f"/crm/v3/properties/{quoted}", params)
            for prop in payload.get("results") or []:
                name = prop.get("name")
                if isinstance(name, str):
                    names.add(name)
            after = ((payload.get("paging") or {}).get("next") or {}).get("after")
            if not after:
                return names
        raise MonitorError("HubSpot property list did not end.")

    def all_records(self, properties: list[str]) -> list[dict]:
        quoted = urllib.parse.quote(self.object_type, safe="")
        records: list[dict] = []
        after = None
        seen_cursors: set[str] = set()
        for _page in range(100):
            params = {"limit": 100, "properties": ",".join(properties), "archived": "false"}
            if after:
                params["after"] = after
            payload = self._get(f"/crm/v3/objects/{quoted}", params)
            records.extend(payload.get("results") or [])
            after = ((payload.get("paging") or {}).get("next") or {}).get("after")
            if not after:
                return records
            if after in seen_cursors:
                raise MonitorError("HubSpot pagination cursor repeated.")
            seen_cursors.add(str(after))
        raise MonitorError("HubSpot record list did not end.")


def post_slack(webhook: str, text: str) -> None:
    if not webhook.startswith("https://"):
        raise MonitorError("alert destination was rejected")
    body = json.dumps({"text": text}).encode()
    request = urllib.request.Request(
        webhook,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status >= 300:
                raise MonitorError("alert destination rejected the post")
    except MonitorError:
        raise
    except urllib.error.HTTPError:
        raise MonitorError("alert destination rejected the post") from None
    except urllib.error.URLError:
        raise MonitorError("alert destination was unreachable") from None


def env_value(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return ""


def finish_daily(
    *,
    check: str,
    issues: list[Issue],
    tally: dict[str, int],
    mapping: dict[str, str],
    current: dict[str, dict[str, str]],
    dry_run: bool,
    snapshot_out: Path | None,
    counts_path: Path | None,
    alert_out: Path | None,
    generated_at: str,
) -> int:
    webhook = env_value("ALERT_SLACK_WEBHOOK_URL")
    if not issues:
        alert = "none"
        exit_code = 0
        write_snapshot = snapshot_out is not None and not dry_run
    elif dry_run:
        alert = "dry-run"
        exit_code = 0
        write_snapshot = False
    elif not webhook:
        alert = "missing-webhook"
        exit_code = 1
        write_snapshot = False
    else:
        alert = "sent"
        exit_code = 0
        write_snapshot = snapshot_out is not None

    text = render_alert(check, issues) if issues else ""
    if issues and alert == "sent":
        try:
            post_slack(webhook, text)
        except MonitorError:
            alert = "slack-failed"
            exit_code = 1
            write_snapshot = False
    if alert_out and text:
        write_json_text(alert_out, text)
    document = public_document(check, alert, tally)
    if counts_path:
        write_json(counts_path, document)
    print(format_public_line(document))
    if write_snapshot and snapshot_out is not None:
        write_json(snapshot_out, snapshot_document(mapping, current, generated_at))
    if alert == "missing-webhook":
        log("Campus listing issues detected and ALERT_SLACK_WEBHOOK_URL is not set.")
    elif alert == "slack-failed":
        log("Campus listing issues were found and the alert destination rejected the post.")
    return exit_code


def write_json_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def run_stub(check: str, alert: str, notice: str, counts_path: Path | None) -> int:
    log(notice)
    tally = tally_issues([], records=0, visible=0, baseline=False)
    document = public_document(check, alert, tally)
    if counts_path:
        write_json(counts_path, document)
    print(format_public_line(document))
    return 0


def configured_portal_and_object() -> tuple[str, str]:
    portal = env_value("HUBSPOT_PORTAL_ID", "HUBSPOT_PORTAL_ID_SECRET")
    object_type = env_value("HUBSPOT_PROGRAMS_OBJECT", "HUBSPOT_PROGRAMS_OBJECT_SECRET")
    missing = []
    if not portal:
        missing.append("HUBSPOT_PORTAL_ID")
    if not object_type:
        missing.append("HUBSPOT_PROGRAMS_OBJECT")
    if missing:
        raise MonitorError("Missing configuration: " + ", ".join(missing) + ".", code=2)
    return portal, object_type


def run_daily(args: argparse.Namespace) -> int:
    from datetime import datetime, timezone

    if args.fixture:
        payload = json.loads(Path(args.fixture).read_text())
        portal_id = str(payload["portal_id"])
        object_type_id = str(payload["object_type_id"])
        available = set(payload.get("schema_properties") or [])
        mapping, missing = resolve_properties(available)
        if any(name in missing for name in REQUIRED_FIELDS):
            raise MonitorError("Schema is missing required listing properties: " + ", ".join(missing) + ".", code=2)
        raw_records = payload.get("records") or []
        normalized = normalize_records(raw_records, mapping)
        previous = payload.get("previous", None)
        if previous is not None and not isinstance(previous, dict):
            raise MonitorError("Fixture previous snapshot is not an object.")
        if isinstance(previous, dict):
            previous = {str(key): {str(k): normalize_value(v) for k, v in value.items()} for key, value in previous.items()}
    else:
        token = env_value("HUBSPOT_TOKEN")
        if not token:
            raise MonitorError("Missing configuration: HUBSPOT_TOKEN.", code=2)
        portal_id, object_type = configured_portal_and_object()
        hubspot = HubSpot(token, object_type)
        schema = hubspot.schema()
        object_type_id = schema.get("objectTypeId")
        if not isinstance(object_type_id, str) or not object_type_id:
            raise MonitorError("HubSpot schema did not return an object type id.", code=2)
        mapping, missing = resolve_properties(hubspot.property_names())
        if any(name in missing for name in REQUIRED_FIELDS):
            raise MonitorError("Schema is missing required listing properties: " + ", ".join(missing) + ".", code=2)
        normalized = normalize_records(hubspot.all_records(sorted(set(mapping.values()))), mapping)
        previous = None
        if args.snapshot_in:
            snapshot_in = Path(args.snapshot_in)
            if snapshot_in.exists():
                previous = load_snapshot(snapshot_in)
            else:
                log("No previous snapshot file. Day-over-day diff skipped.")

    current = {}
    for record_id, fields in normalized:
        if record_id not in current:
            current[record_id] = fields
    issues = find_issues(
        normalized,
        previous,
        portal_id=portal_id,
        object_type_id=object_type_id,
        mapping=mapping,
    )
    visible = sum(1 for _record_id, fields in current.items() if is_visible(fields.get("visibility", "")))
    tally = tally_issues(issues, records=len(current), visible=visible, baseline=previous is not None)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return finish_daily(
        check="daily",
        issues=issues,
        tally=tally,
        mapping=mapping,
        current=current,
        dry_run=args.dry_run,
        snapshot_out=Path(args.snapshot_out) if args.snapshot_out else None,
        counts_path=Path(args.counts) if args.counts else None,
        alert_out=Path(args.alert_out) if args.alert_out else None,
        generated_at=generated_at,
    )


def run_rioseo(args: argparse.Namespace) -> int:
    alert, notice = rioseo_notice(bool(env_value("RIOSEO_API_KEY")), bool(env_value("RIOSEO_REPORT_URL")))
    return run_stub("rioseo", alert, notice, Path(args.counts) if args.counts else None)


def run_gbp(args: argparse.Namespace) -> int:
    alert, notice = gbp_notice(bool(env_value("GBP_ACCESS_TOKEN")), bool(env_value("GBP_ACCOUNT_ID")))
    return run_stub("gbp", alert, notice, Path(args.counts) if args.counts else None)


def summarize(path: Path) -> int:
    if not path.exists():
        print("campus-listing-monitor: no counts (the check did not finish).")
        return 0
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError:
        log("counts file was not a public summary")
        return 1
    if not isinstance(data, dict):
        log("counts file was not a public summary")
        return 1
    print(format_public_line(data))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", choices=sorted(ALLOWED_CHECK), default="daily")
    parser.add_argument("--fixture", help="Offline JSON records. Does not call HubSpot.")
    parser.add_argument("--snapshot-in")
    parser.add_argument("--snapshot-out")
    parser.add_argument("--counts")
    parser.add_argument("--alert-out", help="Write the alert body. Refused when GITHUB_ACTIONS=true.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--summarize", help="Print a counts file as a public line.")
    parser.add_argument("--select-artifact", help="Print the newest state artifact id for a branch.")
    parser.add_argument("--branch")
    parser.add_argument("--extract-snapshot")
    parser.add_argument("--extract-to")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.summarize:
            return summarize(Path(args.summarize))
        if args.select_artifact:
            if not args.branch:
                raise MonitorError("Missing configuration: branch.", code=2)
            payload = json.loads(Path(args.select_artifact).read_text())
            selected = select_state_artifact(payload, args.branch)
            if selected:
                print(selected)
            return 0
        if args.extract_snapshot:
            if not args.extract_to:
                raise MonitorError("Missing configuration: extract destination.", code=2)
            extract_snapshot(Path(args.extract_snapshot), Path(args.extract_to))
            return 0
        if os.getenv("GITHUB_ACTIONS") == "true" and args.alert_out:
            raise MonitorError("Refusing to write the alert body in GitHub Actions.", code=2)
        if args.check == "rioseo":
            return run_rioseo(args)
        if args.check == "gbp":
            return run_gbp(args)
        return run_daily(args)
    except MonitorError as error:
        log(str(error))
        return error.code


if __name__ == "__main__":
    sys.exit(main())
