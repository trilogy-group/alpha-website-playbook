# Video Resources and Media Library

Last verified: September 17, 2026 (live-site survey). Status: requirements Proposed; inventory Observed.

## Observed inventory (2026-09-17)

| Surface | Count | Notes |
| --- | ---: | --- |
| `alpha_video_resource` custom post type at `/resources/<slug>/` | 89 | Sitemap `video-resource`; transcript-plus-FAQ format aligned with the LLM content template |
| `/video-library/` | 1 | Reference page built on the Airtable video gallery plugin |
| YouTube embeds per campus page | 35 to 42 | Heavy embed load; several campus pages carry hidden template video containers |
| media.alpha.school | separate host | 86-video library inventoried in the marketing workspace `docs/Media Alpha School Site Inventory.md`; out of scope for this repo |

## Sources

- Video files: YouTube (public), with source metadata in Airtable for the gallery and in WordPress for `alpha_video_resource` posts.
- Transcripts and FAQ blocks: the LLM content program (`docs/LLM Ready Alpha Content Template Requirements.md`, marketing workspace).
- Rights and approvals: not recorded. Q-10 covers permission records for quotes; the same question applies to footage of children.

## Requirements

- Every video resource page has one canonical, a readable title that states the takeaway, a summary, a transcript or structured excerpts, speaker and source, a publication date, VideoObject schema, and links to related Alpha Answers.
- Footage of identifiable students or families has a recorded release. No release, no publication (Q-10).
- Campus pages embed only media approved for that campus in `registry/campus-open-media.json`. Unrelated footage is never substituted for a missing campus video.
- Autoplay is muted or off; embeds are lazy-loaded so the campus page still passes the mobile performance check in `playbook/quality/accessibility-performance-browser-media.md`.
- Removed or replaced videos leave one redirect, not a dead page.
- Video resource posts follow the same claim and brand rules as editorial.

## Owners

| Role | Holder | Status |
| --- | --- | --- |
| Videography and video editing | Named in `registry/people.json` | Confirmed |
| Airtable gallery and `alpha_video_resource` publishing | Not recorded | Q-18 |
| LLM content program | Matt Barge and Yash Chitneni | Confirmed (marketing workspace) |
| Media rights | Not recorded | Q-10 |

## Completion

Page renders with transcript visible, schema validates, embed plays logged out, canonical and sitemap correct, related links resolve, desktop and mobile.
