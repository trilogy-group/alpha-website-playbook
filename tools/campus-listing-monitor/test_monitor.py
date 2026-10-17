"""Offline checks for the campus listing monitor. No network and no real records."""
from __future__ import annotations

import io
import json
import os
import py_compile
import sys
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import campus_monitor as monitor  # noqa: E402

PORTAL = "test-portal"
OBJECT_TYPE = "test-object"
SCHEMA = ["name", "is_open", "type", "visibility", "address_1", "phone", "description"]
SECRET_CANARY = "super-secret-canary-value"


def record(record_id, **fields):
    properties = {name: "" for name in SCHEMA}
    properties.update(fields)
    return {"id": record_id, "properties": properties}


def mapping_identity():
    return {logical: logical for logical in monitor.PROPERTY_CANDIDATES}


def fields_of(**fields):
    properties = {name: "" for name in SCHEMA}
    properties.update(fields)
    return properties


class MonitorTests(unittest.TestCase):
    def test_module_compiles(self):
        py_compile.compile(Path(monitor.__file__), doraise=True)

    def test_visible_missing_address_phone_and_long_description(self):
        long_copy = "x" * 301
        issues = self.evaluate([
            record("rec-north", name="North Campus", visibility="Visible", is_open="true", type="Open",
                   address_1="", phone="", description=long_copy),
        ])
        kinds = {issue.kind: issue for issue in issues}
        self.assertEqual(set(kinds), {"missing_address", "missing_phone", "description_over_300"})
        self.assertEqual(kinds["missing_address"].campus, "North Campus")
        self.assertEqual(kinds["missing_address"].field, "address_1")
        self.assertEqual(kinds["missing_address"].fix, monitor.ADDRESS_FIX)
        self.assertEqual(kinds["missing_address"].url, f"https://app.hubspot.com/contacts/{PORTAL}/record/{OBJECT_TYPE}/rec-north")
        self.assertEqual(kinds["missing_phone"].fix, monitor.PHONE_FIX)
        self.assertEqual(kinds["missing_phone"].field, "phone")
        self.assertEqual(kinds["description_over_300"].fix, monitor.DESCRIPTION_FIX)
        self.assertIn("Length: 301", kinds["description_over_300"].detail)

    def test_description_of_300_is_clean_and_hidden_gaps_are_not_flagged(self):
        issues = self.evaluate([
            record("rec-exact", name="Exact Campus", visibility="Visible", is_open="true", type="Open",
                   address_1="1 Example Street", phone="555-0100", description="x" * 300),
            record("rec-hidden", name="Hidden Campus", visibility="Hidden", is_open="false", type="Open",
                   address_1="", phone="", description="y" * 500),
        ])
        self.assertEqual(issues, [])

    def test_visibility_rules(self):
        rows = [
            ("rec-closed", {"visibility": "Visible", "is_open": "false"}, True),
            ("rec-blank", {"visibility": "VISIBLE", "is_open": ""}, True),
            ("rec-open-hidden", {"visibility": "hidden", "is_open": "true"}, True),
            ("rec-hidden-blank", {"visibility": "Hidden", "is_open": ""}, False),
            ("rec-ok", {"visibility": "Visible", "is_open": "yes"}, False),
            ("rec-other", {"visibility": "internal", "is_open": "true"}, True),
        ]
        for record_id, overrides, expect in rows:
            body = dict(name="Sample Campus", type="Open", address_1="1 Example Street", phone="555-0100", description="ok")
            body.update(overrides)
            issues = self.evaluate([record(record_id, **body)])
            kinds = [issue.kind for issue in issues]
            self.assertEqual("visibility_is_open" in kinds, expect, record_id)
            if expect:
                issue = next(issue for issue in issues if issue.kind == "visibility_is_open")
                self.assertIn("visibility", issue.field)
                self.assertIn("is_open", issue.field)
                self.assertIn(monitor.GBP_FIX, issue.fix)
                self.assertIn(issue.campus, "Sample Campus")

    def test_duplicate_id_is_one_alert_and_quality_runs_once(self):
        issues = self.evaluate([
            record("rec-same", name="Twin Campus", visibility="Visible", is_open="true", type="Open",
                   address_1="", phone="555-0100", description="ok"),
            record("rec-same", name="Twin Campus", visibility="Visible", is_open="true", type="Open",
                   address_1="", phone="555-0100", description="ok"),
        ])
        self.assertEqual([issue.kind for issue in issues], ["missing_address", "duplicate_ids"])
        duplicate = issues[1]
        self.assertEqual(duplicate.field, "id")
        self.assertIn("merge or remove the duplicate listing", duplicate.fix)
        self.assertIn(monitor.GBP_FIX, duplicate.fix)
        self.assertIn("rec-same", duplicate.url)

    def test_day_over_day_diffs_and_not_the_description(self):
        previous = {
            "rec-north": fields_of(name="North Campus", visibility="Visible", is_open="true", type="Open",
                                   address_1="1 Example Street", phone="555-0100", description="short"),
            "rec-gone": fields_of(name="Gone Campus", visibility="Visible", is_open="true", type="Open",
                                  address_1="2 Example Street", phone="555-0101", description="short"),
            "rec-hidden-gone": fields_of(name="Quiet Campus", visibility="Hidden", is_open="false", type="Open",
                                         address_1="", phone="", description=""),
        }
        issues = self.evaluate([
            record("rec-north", name="North Campus", visibility="Visible", is_open="false", type="Open",
                   address_1="9 Example Street", phone="555-0100", description="x" * 50),
            record("rec-new", name="New Campus", visibility="Visible", is_open="true", type="Open",
                   address_1="3 Example Street", phone="555-0102", description="ok"),
        ], previous=previous)
        by_kind = {}
        for issue in issues:
            by_kind.setdefault(issue.kind, []).append(issue)
        changed = {issue.field: issue for issue in by_kind["field_changes"]}
        self.assertEqual(set(changed), {"is_open", "address_1"})
        self.assertEqual(changed["address_1"].fix, monitor.GBP_FIX)
        self.assertIn("Was: 1 Example Street", changed["address_1"].detail)
        self.assertIn("Now: 9 Example Street", changed["address_1"].detail)
        self.assertEqual(changed["is_open"].campus, "North Campus")
        self.assertEqual([issue.campus for issue in by_kind["added"]], ["New Campus"])
        self.assertEqual([issue.campus for issue in by_kind["removed"]], ["Gone Campus"])
        self.assertNotIn("description", changed)
        self.assertTrue(any(issue.kind == "visibility_is_open" and issue.campus == "North Campus" for issue in issues))

    def test_first_run_has_no_added_alert(self):
        issues = self.evaluate([
            record("rec-new", name="New Campus", visibility="Visible", is_open="true", type="Open",
                   address_1="3 Example Street", phone="555-0102", description="ok"),
        ], previous=None)
        self.assertEqual(issues, [])

    def test_resolved_property_name_is_the_field(self):
        found, missing = monitor.resolve_properties(set(SCHEMA) - {"address_1", "phone", "description"} | {
            "school_address", "contact_number", "listing_description",
        })
        self.assertEqual(missing, [])
        self.assertEqual(found["address_1"], "school_address")
        self.assertEqual(found["phone"], "contact_number")
        self.assertEqual(found["description"], "listing_description")

    def test_snapshot_keeps_diff_fields_only(self):
        document = monitor.snapshot_document(
            mapping_identity(),
            {"rec-north": fields_of(name="North Campus", visibility="Visible", is_open="true", type="Open",
                                    address_1="1 Example Street", phone="555-0100", description="x" * 400)},
            "2026-10-17T14:00:00+00:00",
        )
        self.assertNotIn("portal", document)
        self.assertNotIn("object_type_id", document)
        self.assertNotIn("description", document["records"]["rec-north"])
        self.assertEqual(document["records"]["rec-north"]["phone"], "555-0100")

    def test_public_line_drops_anything_that_is_not_a_count(self):
        line = monitor.format_public_line({
            "check": "daily",
            "alert": "sent",
            "records": 2,
            "issues": 1,
            "campus": "North Campus",
            "phone": "555-0100",
            "note": SECRET_CANARY,
        })
        self.assertNotIn("North", line)
        self.assertNotIn("555", line)
        self.assertNotIn(SECRET_CANARY, line)
        self.assertIn("check=daily", line)
        self.assertIn("issues=1", line)
        self.assertIn("alert=sent", line)

    def test_fixture_cli_is_offline_and_stdout_is_counts_only(self):
        payload = {
            "portal_id": PORTAL,
            "object_type_id": OBJECT_TYPE,
            "schema_properties": SCHEMA,
            "previous": None,
            "records": [record("rec-north", name="North Campus", visibility="Visible", is_open="true", type="Open",
                               address_1="", phone="555-0100", description="ok")],
        }
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "records.json"
            alert = Path(directory) / "alert.txt"
            counts = Path(directory) / "counts.json"
            snapshot = Path(directory) / "snapshot.json"
            fixture.write_text(json.dumps(payload))
            with mock.patch("campus_monitor.urllib.request.urlopen", side_effect=AssertionError("network")):
                code, stdout, stderr = self.cli([
                    "--check", "daily", "--fixture", str(fixture), "--dry-run",
                    "--alert-out", str(alert), "--counts", str(counts), "--snapshot-out", str(snapshot),
                ])
            self.assertEqual(code, 0, stderr)
            self.assertNotIn("North Campus", stdout)
            self.assertNotIn("rec-north", stdout)
            self.assertNotIn(PORTAL, stdout)
            self.assertIn("missing_address=1", stdout)
            self.assertIn("alert=dry-run", stdout)
            self.assertFalse(snapshot.exists())
            body = alert.read_text()
            self.assertIn("North Campus", body)
            self.assertIn(f"https://app.hubspot.com/contacts/{PORTAL}/record/{OBJECT_TYPE}/rec-north", body)
            self.assertIn("Field: address_1", body)
            self.assertIn(monitor.ADDRESS_FIX, body)
            self.assertNotIn(SECRET_CANARY, body)

    def test_missing_webhook_fails_without_writing_the_snapshot(self):
        payload = {
            "portal_id": PORTAL,
            "object_type_id": OBJECT_TYPE,
            "schema_properties": SCHEMA,
            "records": [record("rec-north", name="North Campus", visibility="Visible", is_open="true", type="Open",
                               address_1="", phone="555-0100", description="ok")],
        }
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "records.json"
            snapshot = Path(directory) / "snapshot.json"
            fixture.write_text(json.dumps(payload))
            code, stdout, stderr = self.cli([
                "--check", "daily", "--fixture", str(fixture), "--snapshot-out", str(snapshot),
            ], env={"ALERT_SLACK_WEBHOOK_URL": ""})
            self.assertEqual(code, 1, stderr)
            self.assertFalse(snapshot.exists())
            self.assertIn("alert=missing-webhook", stdout)
            self.assertNotIn("North Campus", stdout + stderr)
            self.assertIn("ALERT_SLACK_WEBHOOK_URL is not set", stderr)

    def test_clean_run_is_quiet_and_writes_a_snapshot(self):
        payload = {
            "portal_id": PORTAL,
            "object_type_id": OBJECT_TYPE,
            "schema_properties": SCHEMA,
            "previous": {"rec-north": fields_of(name="North Campus", visibility="Visible", is_open="true", type="Open",
                                                address_1="1 Example Street", phone="555-0100", description="ok")},
            "records": [record("rec-north", name="North Campus", visibility="Visible", is_open="true", type="Open",
                               address_1="1 Example Street", phone="555-0100", description="ok")],
        }
        posted = []
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "records.json"
            snapshot = Path(directory) / "snapshot.json"
            fixture.write_text(json.dumps(payload))
            with mock.patch("campus_monitor.post_slack", side_effect=lambda *_args: posted.append(True)):
                code, stdout, stderr = self.cli([
                    "--check", "daily", "--fixture", str(fixture), "--snapshot-out", str(snapshot),
                ], env={"ALERT_SLACK_WEBHOOK_URL": "https://example.invalid/hook"})
            self.assertEqual(code, 0, stderr)
            self.assertEqual(posted, [])
            self.assertIn("issues=0", stdout)
            self.assertIn("alert=none", stdout)
            saved = json.loads(snapshot.read_text())
            self.assertEqual(saved["records"]["rec-north"]["name"], "North Campus")
            self.assertNotIn("description", saved["records"]["rec-north"])

    def test_slack_post_does_not_echo_the_destination(self):
        payload = {
            "portal_id": PORTAL,
            "object_type_id": OBJECT_TYPE,
            "schema_properties": SCHEMA,
            "records": [record("rec-north", name="North Campus", visibility="Visible", is_open="true", type="Open",
                               address_1="", phone="555-0100", description="ok")],
        }
        captured = {}

        def capture(webhook, text):
            captured["webhook"] = webhook
            captured["text"] = text

        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "records.json"
            snapshot = Path(directory) / "snapshot.json"
            fixture.write_text(json.dumps(payload))
            with mock.patch("campus_monitor.post_slack", side_effect=capture):
                code, stdout, stderr = self.cli([
                    "--check", "daily", "--fixture", str(fixture), "--snapshot-out", str(snapshot),
                ], env={"ALERT_SLACK_WEBHOOK_URL": "https://example.invalid/hook/" + SECRET_CANARY})
            self.assertEqual(code, 0, stderr)
            self.assertIn("North Campus", captured["text"])
            self.assertNotIn(SECRET_CANARY, stdout + stderr)
            self.assertTrue(snapshot.exists())

    def test_missing_token_does_not_call_hubspot(self):
        with mock.patch("campus_monitor.urllib.request.urlopen", side_effect=AssertionError("network")):
            code, _stdout, stderr = self.cli(["--check", "daily"], env={
                "HUBSPOT_TOKEN": "", "HUBSPOT_PORTAL_ID": "", "HUBSPOT_PROGRAMS_OBJECT": "",
            })
        self.assertEqual(code, 2)
        self.assertIn("HUBSPOT_TOKEN", stderr)
        self.assertNotIn("http", stderr.lower())

    def test_github_actions_refuses_alert_file(self):
        code, _stdout, stderr = self.cli(
            ["--check", "gbp", "--alert-out", "tmp/alert.txt"],
            env={"GITHUB_ACTIONS": "true"},
        )
        self.assertEqual(code, 2)
        self.assertIn("Refusing", stderr)

    def test_rioseo_and_gbp_stubs_skip_and_do_not_leak(self):
        code, stdout, stderr = self.cli(["--check", "rioseo"], env={
            "RIOSEO_API_KEY": "", "RIOSEO_REPORT_URL": "",
        })
        self.assertEqual(code, 0)
        self.assertIn("alert=skipped", stdout)
        self.assertIn("RIOSEO_API_KEY", stderr)
        code, stdout, stderr = self.cli(["--check", "rioseo"], env={
            "RIOSEO_API_KEY": SECRET_CANARY, "RIOSEO_REPORT_URL": "https://example.invalid/report",
        })
        self.assertEqual(code, 0)
        self.assertIn("alert=stub", stdout)
        self.assertIn("not read", stderr)
        self.assertNotIn(SECRET_CANARY, stdout + stderr)
        code, stdout, stderr = self.cli(["--check", "gbp"], env={
            "GBP_ACCESS_TOKEN": "", "GBP_ACCOUNT_ID": "",
        })
        self.assertEqual(code, 0)
        self.assertIn("alert=skipped", stdout)
        self.assertIn("GBP_ACCESS_TOKEN", stderr)
        code, stdout, stderr = self.cli(["--check", "gbp"], env={
            "GBP_ACCESS_TOKEN": SECRET_CANARY, "GBP_ACCOUNT_ID": SECRET_CANARY,
        })
        self.assertEqual(code, 0)
        self.assertIn("alert=stub", stdout)
        self.assertIn(monitor.HOURS_FIX, stderr)
        self.assertNotIn(SECRET_CANARY, stdout + stderr)

    def test_artifact_selection_stays_on_the_default_branch(self):
        payload = {"artifacts": [
            {"id": 1, "name": "campus-listing-monitor-state", "expired": False, "created_at": "2026-10-15T00:00:00Z",
             "workflow_run": {"head_branch": "main"}},
            {"id": 9, "name": "campus-listing-monitor-state", "expired": False, "created_at": "2026-10-16T00:00:00Z",
             "workflow_run": {"head_branch": "feature"}},
            {"id": 4, "name": "campus-listing-monitor-state", "expired": True, "created_at": "2026-10-17T00:00:00Z",
             "workflow_run": {"head_branch": "main"}},
            {"id": 3, "name": "other", "expired": False, "created_at": "2026-10-17T00:00:00Z",
             "workflow_run": {"head_branch": "main"}},
        ]}
        self.assertEqual(monitor.select_state_artifact(payload, "main"), "1")
        self.assertIsNone(monitor.select_state_artifact({"artifacts": []}, "main"))

    def test_extract_snapshot_reads_only_the_snapshot_entry(self):
        document = {"generated_at": "2026-10-17T14:00:00+00:00", "records": {"rec-north": {"name": "North Campus"}}}
        with tempfile.TemporaryDirectory() as directory:
            archive_path = Path(directory) / "state.zip"
            dest = Path(directory) / "previous.json"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("out/campus-listing-monitor/snapshot.json", json.dumps(document))
                archive.writestr("notes.txt", "North Campus should not be required")
            monitor.extract_snapshot(archive_path, dest)
            self.assertEqual(json.loads(dest.read_text())["records"]["rec-north"]["name"], "North Campus")

    def test_sources_carry_no_identifiers_or_names(self):
        paths = [
            ROOT / "tools/campus-listing-monitor/campus_monitor.py",
            ROOT / ".github/workflows/campus-listing-monitor.yml",
            ROOT / "docs/campus-listing-sop.md",
        ]
        for path in paths:
            text = path.read_text()
            self.assertNotRegex(text, r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
            self.assertNotRegex(text, r"\b\d{8,}\b", f"{path.name} has a long numeric id")
            self.assertNotRegex(text, r"\b2-\d{5,}\b", f"{path.name} has an object type id")
            self.assertNotRegex(text, r"\bp\d{5,}_", f"{path.name} has a portal-scoped object name")
            self.assertNotRegex(text, r"(?<![\w-])monitor-state(?![\w-])")
        workflow = (ROOT / ".github/workflows/campus-listing-monitor.yml").read_text()
        self.assertNotIn("contents: write", workflow)
        self.assertNotRegex(workflow, r"(?<!ALERT_)SLACK_WEBHOOK_URL")

    def test_workflow_yaml_has_the_three_schedules_and_a_30_day_artifact(self):
        document = parse_yaml((ROOT / ".github/workflows/campus-listing-monitor.yml").read_text())
        crons = [item["cron"] for item in document["on"]["schedule"]]
        self.assertEqual(crons, ["0 14 * * *", "0 20 * * *", "30 14 * * 1"])
        self.assertEqual(document["permissions"]["contents"], "read")
        self.assertEqual(document["permissions"]["actions"], "write")
        self.assertIn("dry_run", document["on"]["workflow_dispatch"]["inputs"])
        upload = document["jobs"]["daily"]["steps"][-1]
        self.assertEqual(upload["with"]["name"], "campus-listing-monitor-state")
        self.assertEqual(upload["with"]["retention-days"], 30)
        daily_run = next(step["run"] for step in document["jobs"]["daily"]["steps"] if step.get("name") == "Check HubSpot Programs")
        self.assertIn("--check daily", daily_run)
        self.assertIn("--dry-run", daily_run)
        self.assertNotIn("--alert-out", daily_run)

    def test_sop_states_the_flow_the_fixes_and_the_unowned_n8n_role(self):
        text = (ROOT / "docs/campus-listing-sop.md").read_text()
        for phrase in (
            "HubSpot Programs",
            "Rio SEO",
            "Google Business Profile",
            "Apple Business Connect",
            "Bing Places",
            "Visibility `Hidden` means the record is not sent",
            "Hours live in n8n",
            monitor.ADDRESS_FIX,
            monitor.PHONE_FIX,
            monitor.DESCRIPTION_FIX,
            monitor.GBP_FIX,
            monitor.HOURS_FIX,
            "n8n flow owner: UNASSIGNED",
            "Web ops owner",
            "no formal owner and needs one",
            "any one person or a personal AI account",
            "Fill missing addresses",
            "Fill missing phones",
            "Trim every listing description",
            "Clear closed suggestions",
            "Verify pins",
            "Verify hours",
            "Merge or remove duplicate listings",
            "Work the Rio SEO rejection report",
            "next day's report",
            "rendered-rio-description-limits",
        ):
            self.assertIn(phrase, text, phrase)

    def evaluate(self, records, previous=None):
        found, missing = monitor.resolve_properties(set(SCHEMA))
        self.assertEqual(missing, [])
        normalized = monitor.normalize_records(records, found)
        return monitor.find_issues(normalized, previous, portal_id=PORTAL, object_type_id=OBJECT_TYPE, mapping=found)

    def cli(self, argv, env=None):
        cleared = {
            "ALERT_SLACK_WEBHOOK_URL": "",
            "HUBSPOT_TOKEN": "",
            "HUBSPOT_PORTAL_ID": "",
            "HUBSPOT_PORTAL_ID_SECRET": "",
            "HUBSPOT_PROGRAMS_OBJECT": "",
            "HUBSPOT_PROGRAMS_OBJECT_SECRET": "",
            "RIOSEO_API_KEY": "",
            "RIOSEO_REPORT_URL": "",
            "GBP_ACCESS_TOKEN": "",
            "GBP_ACCOUNT_ID": "",
            "GITHUB_ACTIONS": "",
        }
        if env:
            cleared.update(env)
        stdout, stderr = io.StringIO(), io.StringIO()
        with mock.patch.dict(os.environ, cleared, clear=False):
            for key, value in cleared.items():
                if value == "":
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            with redirect_stdout(stdout), redirect_stderr(stderr):
                code = monitor.main(argv)
        return code, stdout.getvalue(), stderr.getvalue()


def parse_yaml(text):
    lines = []
    for number, raw in enumerate(text.splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            lines.append((number, None, ""))
            continue
        stripped = _strip_comment(raw).rstrip()
        indent = len(stripped) - len(stripped.lstrip(" "))
        lines.append((number, indent, stripped.strip()))
    value, index = _parse_map(lines, 0, 0)
    return value


def _strip_comment(line):
    in_single = False
    in_double = False
    for index, char in enumerate(line):
        if char == "'" and not in_double:
            in_single = not in_single
        elif char == '"' and not in_single:
            in_double = not in_double
        elif char == "#" and not in_single and not in_double and (index == 0 or line[index - 1] in " \t"):
            return line[:index]
    return line


def _skip_blank(lines, index):
    while index < len(lines) and lines[index][1] is None:
        index += 1
    return index


def _parse_scalar(text):
    if text in ("", "~", "null", "Null", "NULL"):
        return None
    if text in ("true", "True", "TRUE"):
        return True
    if text in ("false", "False", "FALSE"):
        return False
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "'\"":
        inner = text[1:-1]
        return inner.replace("''", "'") if text[0] == "'" else inner.replace('\\"', '"')
    if text.isdigit() or (text.startswith("-") and text[1:].isdigit()):
        return int(text)
    return text


def _split_key(text, number):
    if ":" not in text:
        raise ValueError(f"line {number}: expected a key")
    key, _, rest = text.partition(":")
    return key.strip(), rest.strip()


def _parse_map(lines, index, indent):
    result = {}
    while True:
        index = _skip_blank(lines, index)
        if index >= len(lines):
            break
        number, line_indent, text = lines[index]
        if line_indent is None or line_indent < indent or text.startswith("- "):
            break
        if line_indent > indent:
            raise ValueError(f"line {number}: unexpected indent")
        key, rest = _split_key(text, number)
        index += 1
        value, index = _parse_value(lines, index, indent, rest)
        result[key] = value
    return result, index


def _parse_value(lines, index, key_indent, rest):
    if rest in ("|", "|-", ">", ">-"):
        return _read_block(lines, index, key_indent)
    if rest == "":
        peek = _skip_blank(lines, index)
        if peek < len(lines) and lines[peek][1] is not None and lines[peek][1] > key_indent:
            return _parse_block(lines, peek)
        return None, index
    return _parse_scalar(rest), index


def _parse_block(lines, index):
    index = _skip_blank(lines, index)
    _number, indent, text = lines[index]
    if text.startswith("- "):
        return _parse_list(lines, index, indent)
    return _parse_map(lines, index, indent)


def _parse_list(lines, index, indent):
    items = []
    while True:
        index = _skip_blank(lines, index)
        if index >= len(lines):
            break
        number, line_indent, text = lines[index]
        if line_indent != indent or not text.startswith("- "):
            break
        item = text[2:].strip()
        index += 1
        if item == "":
            value, index = _parse_block(lines, index)
        elif ":" in item and not item.startswith(("'", '"')):
            key, rest = _split_key(item, number)
            key_indent = indent + 2
            value, index = _parse_value(lines, index, key_indent, rest)
            mapping = {key: value}
            while True:
                peek = _skip_blank(lines, index)
                if peek >= len(lines):
                    break
                next_number, next_indent, next_text = lines[peek]
                if next_indent != key_indent or next_text.startswith("- "):
                    break
                next_key, next_rest = _split_key(next_text, next_number)
                index = peek + 1
                mapping[next_key], index = _parse_value(lines, index, key_indent, next_rest)
            value = mapping
        else:
            value = _parse_scalar(item)
        items.append(value)
    return items, index


def _read_block(lines, index, key_indent):
    probe = index
    while probe < len(lines) and lines[probe][1] is None:
        probe += 1
    if probe >= len(lines) or lines[probe][1] is None or lines[probe][1] <= key_indent:
        return "", index
    content_indent = lines[probe][1]
    collected = []
    while index < len(lines):
        _number, indent, text = lines[index]
        if indent is None:
            collected.append("")
            index += 1
            continue
        if indent < content_indent:
            break
        collected.append(text)
        index += 1
    return "\n".join(collected).rstrip("\n"), index


if __name__ == "__main__":
    unittest.main()
