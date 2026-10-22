# NY center source repair package

Initially prepared October 15, 2026. **The production workflow patch remains an offline proposal**: not deployed to n8n, not a running staging workflow, not an approved exception, and not publication verification. See [implementation-status.json](implementation-status.json) for the two HubSpot changes now applied and the real n8n test execution. This directory is outside the compiled policy inputs. It is the reviewable first source-level batch, not completion of Robbie's full audit.

## What is ready

- `line-edits.json`: all 191 decisions from the audit's Line edits tab: 119 Edit, 49 Keep, 23 Verify. Current/proposed text and locators are preserved verbatim as request evidence. Keep rows are regression expectations; Verify rows remain conditional. “Current” is the audit's observation, not independently verified for every row in this session.
- `hubspot-proposed-changes.json`: exact live source before/after values for two `website_campus_intro` fields, with source timestamps and before hashes. NYC-007 replaces the private-institution ranking sentence; ARM-08 replaces only tutoring center with homeschool center. Price, lifecycle, identity, application links and billing terms are untouched.
- `prepare-n8n.mjs`: a network-free preparer for private exports of the campus and Locations workflows. Outputs complete private preparation artifacts only under a gitignored directory. It does not update, activate or run a workflow. Full exports and prepared full definitions must remain private; they may contain credentials or personal data.
- `campus.source-fixture.json` and `locations.source-fixture.json`: reviewed, selected-node fixtures from the observed live versions, containing only relevant node parameters and no credential records, execution data or pinned inputs. Empty connections are fixture scaffolding, not deployable workflows.
- `prepare-n8n.test.mjs`: evaluates actual old and proposed expressions and card code offline, testing NY output, preservation of other campuses and existing exceptions, link/amount/waitlist preservation, and rejection of changed identity, source copy or version.
- `policy-proposal.json`: the pending NY exception, described separately from current enforced requirements.

## Current source findings

Read-only n8n API exports show saved and active version IDs match:

| Workflow | Active version | Role |
| --- | --- | --- |
| `ORgdHC71YJ5RawBy` | `8919a3f7-e061-410a-aac4-aaa37a74b0c4` | Campus publisher |
| `RqP1lPvDKvHDxTus` | `61df84bf-06a1-4929-b224-7e00156545e1` | Locations publisher |
| `6HvmvgkzPkFikc40` | `e081064d-94bc-455d-8f18-366f230cd13a` | Shared Program/event reader |

The campus publisher reads onboarding workbook `1gnqy32nKoReaoWKaipxg4UnQlqP916N4xsAsM_HzGoU`, Website Copy Fixed tab `106531266`. NYC has later hardcoded overrides. The local JSON-LD template always contains School. `Complete website data` already copies SEO titles/descriptions to OG and X; it needs no change for that propagation. These source changes do not prove that every other plugin-generated schema or media description will follow; inspect them separately.

HubSpot source readback and Alpha MCP canonical resolution agree:

| Program | Page | Current source identity |
| --- | --- | --- |
| `26463204876` | `/new-york-city/`, WordPress `6542` | Alpha New York; Open; New York; 180 Maiden Ln |
| `60804396611` | `/greenwich/`, WordPress `9213` | Alpha Greenwich Armonk; Open; NY; 20 Old Post Road |

No competing WordPress objects were reported. The HubSpot property metadata search found no dedicated model field matching model/homeschool/center/centre/program type; school_chain exists and remains Alpha School. This is a bounded property-name/label search, not a claim that no organization-wide model taxonomy exists.

Use the two exact Program IDs in the single `profiles` definition for this proposal. Do not infer model from state, city, school_chain or a name substring. The generated campus and card changes reject changed Program/page identity. A future source-owned model field needs governance, reader-contract and non-website-consumer review before it replaces this explicit mapping. Do not rename Programs or mutate the shared reader merely to implement public wording.

## First batch and remaining delivery paths

| Target | Proposed batch | Still separate |
| --- | --- | --- |
| Hero | NYC adds the exact identity line while keeping its grade line; Armonk uses ARM-03 subtitle | Desktop/mobile layout and approved template exception |
| Search/social | Armonk ARM-01 title; NYC-063 and ARM-02 descriptions; existing OG/X propagation | Other generated WebPage, breadcrumb, FAQ and video fields |
| Intro | Armonk ARM-04 headline, ARM-05 opener/results link, ARM-07 Love Learning; NYC-003 results link | NYC-005 is Keep: its current experience paragraph is retained. Shared navigation commitments are a separate edit, not a global search/replace |
| Local schema | Remove School only from the two local branch entities | Page-owned FAQ, national entity, media and plugin schema review |
| HubSpot intro | NYC-007 exact sentence; ARM-08 exact noun replacement | Fresh read, approved field change, write/readback, then normal sync |
| Locations cards | Homeschool center descriptor; Program fees label; preserve amount, links and waitlist/inquiry behavior | Header geography, independently rendered map, Founders identity and other shared card consumers |
| Campus price headings | No amount changes | Elementor icon-box label: Annual program fee for NYC; Program fees for Armonk. n8n currently maps the amount, not these headings |
| Badges and other widgets | No speculative provider or accreditation facts | Correct/remove unsupported NY badge widgets and generated captions with a supported scoped patch; n8n badge mapping also needs reviewed handling |
| Forms, events, PDFs/packets, media, map and Community | Full audit rows retained | Each owner/system needs its own preparation, authorization and verification; none is claimed implemented by this n8n batch |

## Existing APEX work

Read-only deduplication scanned 709 returned tasks across all workflows with seven active/review statuses (NOT_STARTED, IN_PROGRESS, MISSING_INFO, BLOCKED, FOR_REVIEW, TESTING, APPROVED), paginating each status. This is not a search of completed/cancelled history, comments-only matches or tickets outside the credential's visibility. Text matches did not locate a dedicated Robbie homeschool-center request in that scope.

- [Existing mapping task](https://apex.2hourlearning.com/intake?taskId=cmubr971i00060agmwsyff79e): BLOCKED; overlaps Greenwich but also includes Boston, Lexington and Jamaica Plain.
- [Its parent request](https://apex.2hourlearning.com/intake?taskId=cmt0llf4c000004jxc7btyfcs): BLOCKED; older instruction to remove the word school everywhere. Robbie's scoped audit preserves valid national/historical school language. Do not silently replace the older request or mark it complete with a NY-only batch.
- [Greenwich identity/address task](https://apex.2hourlearning.com/intake?taskId=cmtxide9a000104l6sw9ja81y): BLOCKED; includes 355 Main Street versus the current source's 20 Old Post Road. This wording batch does not change the address or settle that separate conflict.

These older records were read with comments/activity and left unchanged. Subsequent implementation created and claimed NY-only source cases cmv9p8dxp000506lbroul0zp7 and cmv9paf0q000h06lbpi94reit, applied their exact HubSpot field changes, attached evidence, and left them in TESTING pending public delivery. No requester notices were sent. Yash confirmed he is one of the n8n owners in this chat; historical Cristi assignments are not current ownership evidence. The broader workflow route stays sync-mapping.

## Run and review

```sh
node --test proposals/ny-center-2026-10-15/prepare-n8n.test.mjs
node proposals/ny-center-2026-10-15/prepare-n8n.mjs \
  tmp/ny-centers/ORgdHC71YJ5RawBy.private.json \
  tmp/ny-centers/RqP1lPvDKvHDxTus.private.json \
  tmp/ny-centers/prepared
```

Preparation rejects an active/saved mismatch, missing or duplicated target assignments and changed Locations code anchors. It preserves other nodes and connections in the private export. The selected fixtures are not used to deploy. Re-export and review the current full definition before staging; never upload a full GET response with stale activeVersion or other server-managed properties.

Next execution steps: approve the exact proposed diff and NY policy exception; use Yash’s confirmed workflow ownership and establish the remaining eligible APEX execution contracts; test in an isolated workflow/test copy with an explicit bounded Program selection and no production writers; verify both NY outputs and two untouched campus controls; then apply the approved source changes and reviewed live definitions under their authorized paths. The live campus publisher has no verified bounded run selection, so do not dispatch its full batch as a canary.

After production release, capture stored/public readback, desktop/mobile pages, source/schema/aliases and conversion checks, then the next normal scheduled sync. Offline test success cannot close APEX tickets. No delivery date is established by this package.
