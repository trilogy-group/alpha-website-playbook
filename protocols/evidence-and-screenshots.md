# Evidence and Screenshot Procedure

Version 1.0, September 17, 2026.

## Required evidence shape

Every completed website ticket records:

- APEX ticket, revision, execution and lease IDs
- Actor and execution path
- WordPress environment and authenticated actor
- Query-free canonical URL and object ID
- Source object, field, value and read time
- Before and after values
- Raw and semantic hashes when applicable
- Snapshot or restore-artifact reference
- Prepare, apply, readback, CSS, cache and verification receipts
- Desktop and mobile screenshots
- Ring-1, ring-2 and ring-3 results
- Observer run when the ticket came from an observer check
- Playbook commit

Use the APEX evidence endpoints for the ticket:

```text
POST /api/agent/tasks/{id}/evidence                 structured evidence (URL, notes, the Public page verification entry)
POST /api/agent/tasks/{id}/evidence/screenshots     the desktop and mobile PNGs themselves (multipart), via agent/attach-evidence.mjs; optional section field names the element a crop shows
```

The authenticated APEX client or worker performs the upload. `agent/attach-evidence.mjs --ticket <id> --run <runId> --page <canonical URL> --desktop <file> --mobile <file>` hashes each file, posts it with the operator key, and prints the served URLs; APEX stores the bytes on the ticket (kind `EVIDENCE_SCREENSHOT`), posts the agent comment, logs `agent_evidence_added` with viewport, page, capture time, sha256, run id, and who attached it, and shows the pair in the ticket panel's Evidence section. It is idempotent per (ticket, viewport, sha256). Run it twice per page on the same run id: once with `--section "<element>"` for the `tests/section-shot.mjs` crop of the element the Look for line names, once without for the full-page pair; APEX shows the section crops first and legible, the full page after. Do not place credentials or private source documents in the evidence body or in the captures.

## Screenshot set

Capture the canonical public URL after cache recovery.

Minimum set:

1. Desktop top of page at 1440 by 1000.
2. Desktop changed section with the changed content visible.
3. Mobile top of page at 390 by 844.
4. Mobile changed section with the changed content visible.
5. Two untouched representative pages after a global, CSS, plugin, template, or site-wide cache action.

Items 1 and 3 are the full-page desktop and mobile captures `tests/rendered-controls.mjs --screenshots <dir>` writes (`<slug>-desktop.png`, `<slug>-mobile.png`). Items 2 and 4 are the section captures `tests/section-shot.mjs --url <page> --selector <css> --name "<section>"` writes (`<slug>-desktop.png`, `<slug>-mobile.png` at deviceScaleFactor 2, the element plus a 16 px margin) after every image inside the element has decoded. `agent/attach-evidence.mjs` attaches each pair, the section pair with `--section "<section>"`. PNG or JPEG, 6 MB each at most; a larger full-page capture is re-encoded as JPEG before attaching.

For a staff change the section capture is the card itself: `tests/section-shot.mjs --selector "#team_carousel .swiper-slide" --slide-containing "<person>"` moves the carousel to that slide before capturing, and the crop must show the full head with headroom like the neighbouring cards; `tests/page-check.mjs team-photo-framing` is the mechanical form of the same criterion (protocol section 7, decision 2026-09-22).

A blank or grey lazy image is not acceptable evidence. `section-shot.mjs` forces the element's lazy images to load, awaits `img.decode()` on each with a bounded timeout, and exits 1 with the image named when one never decodes; the file is still written so the actor can see what happened, but it is not attached as the section pair until the images paint.

## Screenshot labels

Each artifact label includes:

```text
<ticket-id>__<environment>__<page-slug>__<viewport>__<section>__<UTC timestamp>
```

Example:

```text
cm-example__production__greenwich__390x844__contact-resources__20260917T170500Z
```

Record the canonical URL, viewport, time, and expected observation beside the artifact. Do not rely on a filename alone.

## Privacy and safety

- Do not capture WordPress passwords, application passwords, tokens, cookies, private keys, private APEX comments, or browser developer panels containing secrets.
- Do not use a real parent's form submission as screenshot evidence.
- Crop unrelated personal information only when the artifact still proves the required result.
- Preserve the full-page context needed to identify the page and section.
- Review links behind WordPress authentication are not production public evidence.

## Machine evidence

Attach structured receipts and check output alongside screenshots. Useful evidence includes:

- `verify_public_page` response
- `tests/page-check.mjs` JSON output
- Source readback and n8n run ID
- Final HTTP status, URL, canonical and cache headers
- Expected-present, expected-absent, media and link results
- Observer rerun ID

Screenshots prove appearance. Structured evidence proves object identity, content, source and execution.

## Failure evidence

For `verified_failure` or `unverified`, capture the same evidence available for a pass plus:

- Exact failed check
- Last known correct layer
- Attempts and timestamps
- Whether storage, CSS, origin cache, edge cache or rendering is stale
- Rollback decision and owner

Keep the ticket open.
