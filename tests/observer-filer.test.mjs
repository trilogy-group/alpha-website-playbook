// agent/file-observer-findings.mjs (QC loop redesign 2026-09-24, workstream 6): the playbook's filer for observer findings.
// Fixtures: tests/fixtures/observer-filer/run-2026-09-24 is the observer packet artifact of run site-full-2026-09-24T14-28-40-974Z
// (GitHub run 36012695049; findings and incidents with long `actual` arrays trimmed, no screenshots); queue-2026-09-24.json is the
// open observer queue exported before the 2026-09-24 sweep plus the decision tickets the bundle names; check-bundle.generated.json is
// the real compiled bundle (playbook PR 23, branch qc-check-bundle) copied until the branches merge.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_CLEAR_AFTER_RUNS,
  FILER_OWNED_CODE,
  FILER_VERSION,
  ObserverFilerError,
  RESOLUTION_KIND,
  applyPlan,
  buildContract,
  downloadPacket,
  findingConditions,
  formatFact,
  idempotencyKeyFor,
  loadCheckBundle,
  loadPolicyBundle,
  loadQueue,
  loadRunFolder,
  loopHealthSuppression,
  normalizeHealth,
  normalizePageUrl,
  observerIdsForTask,
  ownerFor,
  pageSlug,
  planObserverFindings,
  renderComparator,
  renderExpected,
  renderObserverBody,
  rowForCheck,
  rowForFinding,
  scopeKeyFor,
  unhealthyDependencies,
} from '../agent/file-observer-findings.mjs'
import { contractCheck } from './validate-ticket.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = path.join(root, 'tests', 'fixtures', 'observer-filer')
const BUNDLE = path.join(fixtures, 'check-bundle.generated.json')
const RUN_ID = 'site-full-2026-09-24T14-28-40-974Z'
const NOW = new Date('2026-09-24T16:00:00Z')
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const bundle = () => loadCheckBundle(BUNDLE)

/** The 16 map-row tickets (C1's 14 and two of C2's) whose incidents the 2026-09-24 run shows resolved after 31 or more clean runs. */
const MAP_ROW_TICKETS_CLEARED = [
  'cmtmn1ras000004i2asbfpd1j', 'cmtt22yu800000agm4lvnnhfk', 'cmtt22zix00010agmy6hu0k2o', 'cmtt23080000204ldg5u546b7', 'cmtt3k8vr000104i9tz2a6hf7',
  'cmtt3k9p3000304i9zbaza7l7', 'cmtt3kaer000404i9jjrnbcyj', 'cmtt3kb42000504i9ia2t1n44', 'cmtt3kbuh000604i9qm2dbbgp', 'cmtt4bqcu000004jmkv8v0hx2',
  'cmtt4br5v000104jmp4fa157a', 'cmtt4bs7c000204jmapf1m4p6', 'cmtt4bt0z000304jmili2he8a', 'cmtt4btqq000404jm07ddyr64', 'cmtt22x4g000104ldujn5wlv9', 'cmtt22wgc000004ld0dvjplmy',
]
/** The 12 map-row tickets whose incidents are still active in that run (Richmond, Indianapolis, the Columbus lead, ...). */
const MAP_ROW_TICKETS_STILL_ACTIVE = [
  'cmu0301c8000b04lj9dgkppfi', 'cmtz44cp900010agmvoimxf84', 'cmtz44awe00010agmf8g8k9ne', 'cmtz449z400000agm5y3rhsbc', 'cmtz0g7av000k04l525uzc8ka', 'cmtz0g6h800000agm2tb4book',
  'cmtyyn8e8000104ktofm803sr', 'cmtyyn7mt000004kt3b39uayi', 'cmtyw6uk300010agmu7e8spoh', 'cmtyw6so700010agm6x3u8ih7', 'cmtyw6qpg00000agm1palhpw7', 'cmtyu32gf00000agm0vltkx4s',
]

function headerOverlapFinding(p, viewport, { severity = 'high' } = {}) {
  const route = `campus-program-${1000 + p}`
  const url = `https://alpha.school/campus-${p}/`
  const id = `SITE-HO${String(p).padStart(2, '0')}${viewport === 'desktop' ? 'D' : 'M'}000000`
  return { loop: 'functional', check: 'campus-layout-header-overlap', entity: `${route}-${viewport}`, field: 'layout', severity, title: `Alpha Campus ${p} header overlaps page headings on ${viewport}`, summary: 'The navigation/header should not sit on top of campus headings.', actionable: true, url, expected: 'header separated from headings', actual: [{ heading: `Alpha Campus ${p} K-8 Private School`, headingBox: { top: 99.5, bottom: 249.5 }, headerBox: { top: 0, bottom: 112 } }], businessImpact: 'visual', routing: { owners: ['Matt Barge'], channel: '#support-websites' }, evidenceVersion: 2, id, evidenceImages: [{ kind: 'screenshot', path: `screenshots/${route}-${viewport}.png`, route, viewport, url }] }
}

/** A synthetic packet: header-overlap findings on `pages` campus pages across the viewports, with incidents, manifest, health and screenshots. */
function syntheticRun({ pages = 12, viewports = ['desktop', 'mobile'], occurrences = 3, firstSeenAt = '2026-09-02T00:00:00.000Z', browser = 'healthy', screenshots = true, extraFindings = [], extraIncidents = [], health = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-observer-filer-'))
  const findings = []
  const incidents = []
  for (let p = 0; p < pages; p++) {
    for (const viewport of viewports) {
      const finding = headerOverlapFinding(p, viewport)
      findings.push(finding)
      incidents.push({ ...finding, status: 'active', firstSeenAt, lastSeenAt: '2026-09-24T14:39:47.125Z', lastRunId: RUN_ID, occurrences, cleanRuns: 0, reopenedCount: 0 })
      if (screenshots) {
        fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true })
        fs.writeFileSync(path.join(dir, 'screenshots', `${finding.evidenceImages[0].route}-${viewport}.png`), Buffer.concat([PNG_HEADER, Buffer.from(`${finding.evidenceImages[0].route}-${viewport}`)]))
      }
    }
  }
  findings.push(...extraFindings)
  incidents.push(...extraIncidents)
  const manifest = { schemaVersion: 1, system: 'alpha-site-observer', runId: RUN_ID, mode: 'full', startedAt: '2026-09-24T14:28:40.974Z', completedAt: '2026-09-24T14:39:45.674Z', loopsExecuted: ['campus-truth', 'functional', 'loop-health'], loopEvidenceVersions: { functional: 2 }, providers: { browser: { status: browser, completedAt: '2026-09-24T14:38:00.000Z' }, 'campus-pages': { status: 'healthy', completedAt: '2026-09-24T14:29:09.847Z' }, 'campus-operations': { status: 'healthy', completedAt: '2026-09-24T14:28:45.844Z', extractedAt: '2026-09-24T14:28:45.844Z' } }, findingsObserved: findings.length, evidence: { kind: 'site-observation', sha256: 'f'.repeat(64) } }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings))
  fs.writeFileSync(path.join(dir, 'incidents.json'), JSON.stringify(incidents))
  if (health) fs.writeFileSync(path.join(dir, 'health.json'), JSON.stringify({ runId: RUN_ID, generatedAt: manifest.completedAt, sources: { browser: { status: browser, reason: browser === 'healthy' ? null : 'screenshot budget exhausted' }, 'campus-pages': { status: 'healthy' }, 'operations-sheet': { status: 'healthy', extractedAt: '2026-09-24T14:28:45.844Z' } } }))
  return { dir, findings, incidents, manifest }
}

test('observer filer: replay of the 2026-09-24 packet auto-resolves the map-row tickets whose check ids cleared and files nothing twice', () => {
  const run = loadRunFolder(path.join(fixtures, 'run-2026-09-24'))
  const queue = loadQueue(path.join(fixtures, 'queue-2026-09-24.json'))
  assert.equal(queue.length, 181, 'the 180 open observer tickets the sweep worked, plus the open grade decision ticket the bundle names')
  const checks = bundle()
  assert.equal(checks.version, '1.0')
  assert.match(checks.sha256, /^[0-9a-f]{64}$/)
  const plan = planObserverFindings({ run, bundle: checks, queue, now: NOW })

  assert.deepEqual(plan.counts, { findings: 224, dropped: 102, loopHealth: 5, advisory: 14, suppressed: 0, held: 0, groups: 51, decisionPending: 25, files: 11, existing: 15, invalid: 0, resolves: 93, unresolved: 87, evidencePairs: 0 })

  // Loop health from the manifest until the observer writes health.json; loop-health rows never file.
  assert.equal(plan.health.source, 'manifest.providers')
  assert.deepEqual(Object.keys(plan.health.unhealthy).sort(), ['browser', 'campus-staff', 'google-search-console'])
  assert.deepEqual(plan.loopHealth.map((l) => [l.check, l.entity]), [['provider-health', 'campus-staff'], ['provider-health', 'browser'], ['route-browser-inspection', 'admission-mobile'], ['campus-map-inspection-timeout', 'locations-campus-map'], ['campus-map-inspection-timeout', 'home-campus-map']])
  assert.ok(plan.dropped.filter((d) => d.check === 'primary-cta-count').every((d) => d.reason.startsWith('retired: ')), 'a retired check is dropped with the retirement reason')
  assert.ok(plan.dropped.filter((d) => d.check === 'route-screenshot-capture').every((d) => d.reason === 'no row in the check bundle (telemetry)'))
  assert.deepEqual(plan.advisory.reduce((a, s) => ({ ...a, [s.check]: (a[s.check] || 0) + 1 }), {}), { 'operations-campus-missing-facts': 5, 'community-destination': 2, 'claim-evidence': 7 })

  // Auto-resolve: the 16 map-row tickets whose incidents resolved after 31+ clean runs, none of the 12 still-active ones.
  const resolved = new Set(plan.resolves.map((r) => r.id))
  for (const id of MAP_ROW_TICKETS_CLEARED) assert.ok(resolved.has(id), `${id} should auto-resolve`)
  for (const id of MAP_ROW_TICKETS_STILL_ACTIVE) assert.ok(!resolved.has(id), `${id} is still observed and must stay open`)
  const stillObserved = plan.unresolved.filter((u) => u.reason === 'still observed in this run').map((u) => u.id)
  for (const id of MAP_ROW_TICKETS_STILL_ACTIVE) assert.ok(stillObserved.includes(id))
  assert.deepEqual(plan.resolves.reduce((a, r) => ({ ...a, [r.cleared.checks.join('+')]: (a[r.cleared.checks.join('+')] || 0) + 1 }), {}), {
    'provider-health': 3, 'public-event-sync': 23, 'event-page-reachable': 4, 'campus-layout-header-overlap': 9, 'event-registration-reachable': 2, 'route-reachable': 9, 'preannouncement-community-url': 12,
    'campus-layout-offscreen-content': 1, 'images-render': 3, 'map-campus-missing-from-operations': 16, 'campus-operations-snapshot-fresh': 1, 'campus-info-packet-present': 2, 'campus-image-identity-conflict': 4, 'campus-event-filter': 2, 'campus-info-packet-link-reachable': 2,
  })
  const lead = plan.resolves.find((r) => r.id === 'cmtmn1ras000004i2asbfpd1j')
  assert.deepEqual(lead.cleared.observerIds, ['SITE-7B2F6597C8'])
  assert.deepEqual(lead.cleared.rows, ['site.map.integrity.operations-row'])
  assert.equal(lead.cleared.cleanRuns, 118)
  assert.deepEqual(lead.cleared.clearingRunIds, [RUN_ID])
  assert.deepEqual(Object.keys(lead.patch).sort(), ['customFields', 'description', 'resolutionKind', 'status'], 'one v1 PATCH: no agentStatus, never agentEligible (APEX PR 409)')
  assert.equal(lead.patch.status, 'COMPLETED')
  assert.equal(lead.patch.resolutionKind, RESOLUTION_KIND)
  assert.equal(lead.patch.customFields.resolutionKind, RESOLUTION_KIND)
  assert.equal(lead.patch.customFields.checkId, 'SITE-7B2F6597C8', 'the observer check id stays on the ticket')
  assert.equal(lead.patch.customFields.filerRunId, RUN_ID)
  assert.equal(lead.patch.customFields.requirementId, 'site.map.integrity')
  assert.equal(lead.patch.customFields.checkBundleVersion, '1.0')
  assert.deepEqual(lead.patch.customFields.clearingRunIds, [RUN_ID])
  const original = queue.find((t) => t.id === lead.id).description
  assert.ok(lead.patch.description.startsWith(original), 'the existing text stays first')
  assert.match(lead.patch.description, /\n\nRESOLUTION \(agent\/file-observer-findings\.mjs 0\.2, 2026-09-24, playbook check bundle\)\nGo here: https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\n]+\/edit\nLook for: [^\n]*map-campus-missing-from-operations \(site\.map\.integrity\) is clear\n/)
  assert.match(lead.patch.description, /\nObserver: SITE-7B2F6597C8 cleared on run site-full-2026-09-24T14-28-40-974Z\nResolution kind: check-cleared$/)
  assert.match(lead.patch.description, /after 118 clean runs \(row requires 2\)/)

  // A ticket the observer resolved without clean runs (a decision or an evidence-version bump) is not closed by the filer; a person decides.
  const overflow = plan.unresolved.find((u) => u.id === 'cmty8wm7e000004laa25df799')
  assert.match(overflow.reason, /^resolved by the observer without 2 clean runs \(SITE-[A-Z0-9]+ 0 clean, (no reason|superseded-evidence-version)\); needs a person$/)
  assert.deepEqual(plan.unresolved.reduce((a, u) => ({ ...a, [u.reason.split(' (')[0]]: (a[u.reason.split(' (')[0]] || 0) + 1 }), {}), { 'still observed in this run': 50, 'incident not in this packet': 35, 'incident still open in the observer': 1, 'resolved by the observer without 2 clean runs': 1 })

  // Decisions: the 12 active map rows and 11 community hosts wait on the Columbus and Short Hills leads, the 34 header overlaps
  // (34 mobile findings, one template scope) on the Atlanta lead, the Alpha High grade finding on the grade decision; nothing files twice.
  const decisions = plan.decisionPending.reduce((a, d) => ({ ...a, [`${d.check} -> ${d.decisionTicket}`]: (a[`${d.check} -> ${d.decisionTicket}`] || 0) + 1 }), {})
  assert.deepEqual(decisions, { 'map-campus-missing-from-operations -> cmtyu32gf00000agm0vltkx4s': 12, 'preannouncement-community-host -> cmu4g45fg00020agm20nd7kc8': 11, 'campus-layout-header-overlap -> cmtnl00rs000404l1ihl5ucij': 1, 'campus-page-grade-source-sync -> cmu4g13kc00000agmdogkxihp': 1 })
  const overlap = plan.decisionPending.find((d) => d.check === 'campus-layout-header-overlap')
  assert.equal(overlap.key, 'observer:site.layout.viewport:template:campus')
  assert.equal(overlap.findings, 34)
  assert.deepEqual(overlap.rows, ['site.layout.header-overlap.mobile'])
  assert.equal(plan.decisionPending.find((d) => d.check === 'campus-page-grade-source-sync').scopeKey, 'page:alphahigh.school', 'a sister-site page never collapses onto the public home slug')
  assert.equal(plan.counts.invalid, 0, 'a filed ticket never fails the contract')
  assert.ok(plan.existing.every((e) => queue.some((t) => t.id === e.existing.id)), 'every dedupe points at an open ticket')
  assert.deepEqual(plan.existing.filter((e) => e.check === 'campus-sister-brand-leak').map((e) => e.existing.id).sort(), ['cmtmrbhxo000304joy793zilx', 'cmttaplkg00020agmjj5l6kvs', 'cmtvz6lbr000004lakyoue9dx'])
  assert.equal(plan.existing.find((e) => e.check === 'public-event-sync').existing.id, 'cmuf1dfof00000agmkubu06ia')
  assert.deepEqual(plan.files.map((f) => [f.check, f.scope, f.findings, f.owner.via, f.payload.status]).sort(), [
    ['campus-calendar-link-reachable', 'page', 1, 'website-agent-operator', 'NOT_STARTED'], ['campus-calendar-link-reachable', 'page', 1, 'website-agent-operator', 'NOT_STARTED'], ['campus-calendar-link-reachable', 'page', 1, 'website-agent-operator', 'NOT_STARTED'], ['campus-calendar-link-reachable', 'page', 1, 'website-agent-operator', 'NOT_STARTED'],
    ['campus-expired-seasonal-cta', 'page', 1, 'website-agent-operator', 'NOT_STARTED'], ['campus-expired-seasonal-cta', 'page', 1, 'website-agent-operator', 'NOT_STARTED'],
    ['campus-image-crop-risk', 'page', 1, 'website-agent-operator', 'NOT_STARTED'],
    ['campus-image-identity-conflict', 'page', 1, 'website-agent-operator', 'NOT_STARTED'], ['campus-image-identity-conflict', 'page', 9, 'website-agent-operator', 'NOT_STARTED'],
    ['operations-map-address-conflict', 'program', 1, 'internal-triage -> website-agent-operator', 'BLOCKED'], ['operations-map-address-conflict', 'program', 1, 'internal-triage -> website-agent-operator', 'BLOCKED'],
  ])
  const raleigh = plan.files.find((f) => f.title.startsWith('Alpha Raleigh'))
  assert.equal(raleigh.title, 'Alpha Raleigh: fails "No other campus in image file names, alt text or nearby text" (9 findings)')
  assert.equal(raleigh.key, 'observer:site.identity.other-campus:page:raleigh')
  assert.deepEqual(raleigh.rows, ['site.identity.other-campus.images'])
  assert.match(raleigh.payload.customFields.checkId, /^SITE-[A-Z0-9]{10}$/, 'checkId is the lead observer id (APEX PR 409)')
  assert.equal(raleigh.payload.customFields.triagedClass, 'observer-media-identity')
  assert.equal(raleigh.payload.customFields.observerIds.length, 9)
  assert.equal(raleigh.payload.customFields.observerIds[0], raleigh.payload.customFields.checkId)
  assert.equal(raleigh.payload.customFields.source, 'agent-found')
  assert.equal(raleigh.payload.customFields.idempotencyKey, raleigh.key)
  assert.equal(raleigh.payload.customFields.requirementId, 'site.identity.other-campus')
  assert.equal(raleigh.payload.customFields.checkBundleVersion, '1.0')
  assert.equal(raleigh.payload.customFields.checkBundleSha256, checks.sha256)
  assert.equal(raleigh.payload.customFields.filerRunId, RUN_ID)
  assert.deepEqual(raleigh.evidence.map((e) => e.complete), [false], 'the trimmed fixture carries no screenshots, so the pair is planned but incomplete')
  assert.equal(contractCheck({ ...raleigh.payload, id: 'x', assignees: [{ name: 'Matt Barge' }] }).valid, true)
  assert.match(raleigh.payload.description, /^Matt Barge: /)
  assert.match(raleigh.payload.description, /\nSource: [^\n]*\(read 2026-09-24T/)
  assert.match(raleigh.payload.description, /\nExpected: no other known Alpha campus named in src, alt or nearby text of a visible image \(site\.identity\.other-campus; not-contains 0 matches; severity high\)\n/)
  assert.match(raleigh.payload.description, /\nPlaybook: site\.identity\.other-campus \(spec\/site-rules\.json rules\/site\.identity\.other-campus\); check bundle 1\.0 row site\.identity\.other-campus\.images\n/)
  const address = plan.files.find((f) => f.check === 'operations-map-address-conflict')
  assert.match(address.title, /^Alpha [A-Za-z .()]+: fails "Operations address and map address agree"$/, 'a program scope names the campus through registry mapProgramIds')
  assert.match(address.payload.description, /\nOwner: internal-triage \(Matt Barge\); role internal-triage has no registered APEX user; escalated to Matt Barge \(website-agent-operator\) per protocol 1d/)
})

test('observer filer: 24 header-overlap findings across 12 pages and two viewports collapse to one template-scoped ticket', () => {
  const synthetic = syntheticRun()
  const run = loadRunFolder(synthetic.dir)
  assert.equal(run.health.source, 'health.json')
  assert.deepEqual(run.health.unhealthy, {})
  const plan = planObserverFindings({ run, bundle: bundle(), queue: [], now: NOW })
  assert.equal(plan.counts.findings, 24)
  assert.equal(plan.counts.groups, 1)
  assert.equal(plan.counts.files, 1, 'the decision ticket the row names is not open, so the row files')
  const [ticket] = plan.files
  assert.equal(ticket.key, 'observer:site.layout.viewport:template:campus')
  assert.deepEqual(ticket.rows, ['site.layout.header-overlap.desktop', 'site.layout.header-overlap.mobile'], 'the desktop and mobile rows share the requirement and scope')
  assert.equal(ticket.scope, 'template')
  assert.equal(ticket.findings, 24)
  assert.equal(ticket.pages.length, 12)
  assert.equal(ticket.observerIds.length, 24)
  assert.equal(ticket.title, 'Shared campus template (12 pages): fails "Header does not overlap the H1 or hero copy on desktop" (24 findings)')
  // elementor-owner has no registered APEX user: Blocked on the website agent operator, role named in the body (protocol 1d).
  assert.equal(ticket.owner.escalated, true)
  assert.equal(ticket.owner.name, 'Matt Barge')
  assert.equal(ticket.owner.via, 'elementor-owner -> website-agent-operator')
  assert.equal(ticket.payload.status, 'BLOCKED')
  assert.equal(ticket.payload.priority, 'HIGH')
  assert.match(ticket.payload.description, /\nOwner: elementor-owner \(Matt Barge\); role elementor-owner has no registered APEX user; escalated to Matt Barge \(website-agent-operator\) per protocol 1d/)
  assert.match(ticket.payload.description, /\nPages \(12\): https:\/\/alpha\.school\/campus-0\/, https:\/\/alpha\.school\/campus-1\/, /)
  assert.match(ticket.payload.description, /\nObserved: campus-0 \(desktop\): heading Alpha Campus 0 K-8 Private School, [^|]+ \| campus-0 \(mobile\): /)
  assert.match(ticket.payload.description, /\(\+14 more; every observer id is listed under Evidence\)/)
  assert.match(ticket.payload.description, /\nExpected: header separated from headings on desktop 1440x1000 \(site\.layout\.viewport; box-overlap-max 48 px or 0\.25 ratio-of-heading-box; severity high\)\n/)
  assert.match(ticket.payload.description, /\nRelated: cmtnl00rs000404l1ihl5ucij \(decision recorded; this row files again\)\n/)
  assert.match(ticket.payload.description, /check bundle 1\.0 rows site\.layout\.header-overlap\.desktop, site\.layout\.header-overlap\.mobile\n/)
  assert.equal(ticket.payload.customFields.triagedClass, 'observer-layout')
  assert.equal(ticket.payload.customFields.checkId, 'SITE-HO00D000000')
  assert.deepEqual(ticket.payload.customFields.checkRowIds, ticket.rows)
  assert.equal(ticket.payload.customFields.dedupeScope, 'template')
  assert.equal(contractCheck({ ...ticket.payload, id: 'x', assignees: [{ name: 'Matt Barge' }] }).valid, true)
  assert.equal(ticket.evidence.length, 12, 'one pair per route')
  assert.ok(ticket.evidence.every((e) => e.complete))
  assert.equal(plan.counts.evidencePairs, 12)

  // An open ticket carrying any one of the 24 observer ids makes the whole scope a duplicate; an open decision ticket holds it.
  const deduped = planObserverFindings({ run, bundle: bundle(), queue: [{ id: 'cmopen1', status: 'BLOCKED', title: 'Alpha Atlanta: the header overlaps on mobile', url: 'https://alpha.school/atlanta/', customFields: { source: 'alpha-site-qc', check: 'campus-layout-header-overlap', checkId: 'SITE-HO03M000000' } }], now: NOW })
  assert.equal(deduped.counts.files, 0)
  assert.equal(deduped.existing[0].existing.id, 'cmopen1')
  const decided = planObserverFindings({ run, bundle: bundle(), queue: [{ id: 'cmtnl00rs000404l1ihl5ucij', status: 'BLOCKED', title: 'Alpha Atlanta: header overlap lead', url: 'https://alpha.school/atlanta/', customFields: { source: 'alpha-site-qc', check: 'campus-layout-header-overlap', checkId: 'SITE-ATLANTA001' } }], now: NOW })
  assert.equal(decided.counts.files, 0)
  assert.deepEqual(decided.decisionPending.map((d) => [d.key, d.findings, d.decisionTicket]), [['observer:site.layout.viewport:template:campus', 24, 'cmtnl00rs000404l1ihl5ucij']])

  // A route-browser-inspection loop-health finding suppresses site.layout.* rows on the same route and viewport only.
  const inspection = { loop: 'loop-health', check: 'route-browser-inspection', entity: 'campus-program-1003-mobile', field: 'inspection', severity: 'high', title: 'campus-program-1003 mobile inspection incomplete', actionable: true, url: 'https://alpha.school/campus-3/', expected: 'complete', actual: { domInspected: false }, id: 'SITE-LH0000001' }
  const partial = syntheticRun({ pages: 4, extraFindings: [inspection] })
  const suppressed = planObserverFindings({ run: loadRunFolder(partial.dir), bundle: bundle(), queue: [], now: NOW })
  assert.deepEqual(suppressed.loopHealth.map((l) => l.check), ['route-browser-inspection'])
  assert.deepEqual(suppressed.suppressed.map((s) => [s.id, s.reason, s.loopHealth[0].check]), [['SITE-HO03M000000', 'loop-health finding', 'route-browser-inspection']])
  assert.equal(suppressed.files[0].findings, 7)
})

test('observer filer: advisory rows count, unhealthy sources suppress, conditions suppress, grace periods and consecutive runs hold, missing rows drop, malformed inputs fail closed', () => {
  const checks = bundle()
  const imagesFinding = { loop: 'functional', check: 'images-render', entity: 'campus-program-1000-desktop', field: 'images', severity: 'high', title: 'Alpha Campus 0 has images that failed to render on desktop', actionable: true, url: 'https://alpha.school/campus-0/', expected: 'images render', actual: [{ src: 'a.jpg' }], id: 'SITE-IMG0000001' }
  const degraded = syntheticRun({ pages: 0, browser: 'degraded', extraFindings: [imagesFinding] })
  const byHealth = planObserverFindings({ run: loadRunFolder(degraded.dir), bundle: checks, queue: [], now: NOW })
  assert.equal(byHealth.counts.files, 0)
  assert.deepEqual(byHealth.suppressed, [{ id: 'SITE-IMG0000001', check: 'images-render', row: 'site.layout.images.render', reason: 'source health', sources: [{ source: 'browser', reportedAs: 'browser', status: 'degraded', reason: 'screenshot budget exhausted' }] }])
  const allFailed = syntheticRun({ pages: 0, extraFindings: [{ ...imagesFinding, conditions: ['every-image-failed-in-run'] }] })
  const asLoopHealth = planObserverFindings({ run: loadRunFolder(allFailed.dir), bundle: checks, queue: [], now: NOW })
  assert.deepEqual(asLoopHealth.loopHealth.map((l) => l.row), ['site.loop.health.images-all-failed'], 'every image failing in a run is loop health, not a page defect')
  // A provider-health loop-health finding suppresses every row depending on that provider (sourceHealth providerEntity).
  const providerDown = { loop: 'loop-health', check: 'provider-health', entity: 'browser', field: 'status', severity: 'high', title: 'browser source collection degraded', actionable: true, expected: 'healthy', actual: 'degraded', id: 'SITE-PH00000001' }
  const withProvider = syntheticRun({ pages: 0, extraFindings: [providerDown, imagesFinding] })
  const byProvider = planObserverFindings({ run: loadRunFolder(withProvider.dir), bundle: checks, queue: [], now: NOW })
  assert.deepEqual(byProvider.suppressed.map((s) => [s.id, s.reason, s.loopHealth[0].provider]), [['SITE-IMG0000001', 'loop-health finding', 'browser']])

  const eventFinding = { loop: 'event-truth', check: 'public-event-sync', entity: 'hubspot-event-1', field: 'presence', severity: 'high', title: 'Alpha Austin Open House is public in HubSpot, but missing from the website.', actionable: true, url: 'https://app.hubspot.com/contacts/1/record/0-54/1', expected: 'event on /upcoming-events/', actual: { hubspot: 'public' }, id: 'SITE-EV00000001' }
  const advisoryFinding = { loop: 'functional', check: 'campus-layout-clipped-text', entity: 'campus-program-1000-mobile', field: 'layout', severity: 'advisory', title: 'clipped', actionable: false, url: 'https://alpha.school/campus-0/', expected: 'not clipped', actual: [], id: 'SITE-ADV0000001' }
  const telemetry = { loop: 'functional', check: 'route-screenshot-capture', entity: 'home-desktop', field: 'screenshot', severity: 'advisory', title: 'capture', actionable: false, url: 'https://alpha.school/', expected: 'captured', actual: false, id: 'SITE-TEL0000001' }
  const retiredFinding = { loop: 'functional', check: 'primary-cta-count', entity: 'home-desktop', field: 'cta', severity: 'advisory', title: 'ctas', actionable: false, url: 'https://alpha.school/', expected: '1', actual: 2, id: 'SITE-RET0000001' }
  const timeout = { loop: 'functional', check: 'route-reachable', entity: 'campus-program-1000', field: 'status', severity: 'high', title: 'Alpha Campus 0 timed out', actionable: true, url: 'https://alpha.school/campus-0/', expected: 'HTTP 2xx', actual: { status: 'timeout' }, id: 'SITE-RR00000001' }
  const ended = { ...eventFinding, id: 'SITE-EV00000002', entity: 'hubspot-event-2', title: 'Alpha Austin Past Event is public in HubSpot, but missing from the website.', actual: { hubspot: 'public', endsAt: '2026-09-20T00:00:00Z' } }
  const mixed = syntheticRun({ pages: 0, extraFindings: [eventFinding, ended, advisoryFinding, telemetry, retiredFinding, timeout], extraIncidents: [
    { ...eventFinding, status: 'active', firstSeenAt: '2026-09-24T13:30:00.000Z', lastRunId: RUN_ID, occurrences: 1, cleanRuns: 0 },
    { ...ended, status: 'active', firstSeenAt: '2026-09-01T00:00:00.000Z', lastRunId: RUN_ID, occurrences: 40, cleanRuns: 0 },
    { ...timeout, status: 'active', firstSeenAt: '2026-09-24T14:39:00.000Z', lastRunId: RUN_ID, occurrences: 1, cleanRuns: 0 },
  ] })
  const plan = planObserverFindings({ run: loadRunFolder(mixed.dir), bundle: checks, queue: [], now: NOW })
  assert.equal(plan.counts.files, 0)
  assert.deepEqual(plan.held.map((h) => [h.id, h.reason, h.gracePeriodHours ?? h.requireConsecutiveRuns, h.ageHours ?? h.observations]), [['SITE-EV00000001', 'grace period', 4, 2.5], ['SITE-RR00000001', 'consecutive runs', 2, 1]], 'an event public for 2.5 hours waits for the 4-hour import window; a first timeout waits for a second run')
  assert.deepEqual(plan.suppressed.map((s) => [s.id, s.reason, s.conditions]), [['SITE-EV00000002', 'condition', ['event-ended']]], 'a past event never files')
  assert.deepEqual(plan.advisory.map((a) => a.id), ['SITE-ADV0000001'])
  assert.deepEqual(plan.dropped.map((d) => [d.id, d.reason.split(':')[0]]), [['SITE-TEL0000001', 'no row in the check bundle (telemetry)'], ['SITE-RET0000001', 'retired']])
  const later = planObserverFindings({ run: loadRunFolder(mixed.dir), bundle: checks, queue: [], now: new Date('2026-09-24T18:00:00Z') })
  assert.equal(later.counts.files, 1)
  assert.equal(later.files[0].key, 'observer:site.events.sync:events')
  assert.equal(later.files[0].owner.name, 'Garbhit Sharma')
  assert.match(later.files[0].payload.description, /\nEvents \(1\): Alpha Austin Open House is public in HubSpot, but missing from the website\./)
  assert.equal(later.files[0].payload.url, 'https://app.hubspot.com/contacts/1/record/0-54/1', 'the ticket URL is the observer\'s record when there is no public page')
  assert.equal(later.files[0].payload.customFields.pageUrl, '')

  // Rows, keys, owners, facts, health.
  assert.equal(rowForCheck(checks, 'campus-layout-clipped-text').status, 'advisory')
  assert.equal(rowForCheck(checks, 'nope'), null)
  assert.equal(rowForFinding(checks, headerOverlapFinding(0, 'mobile')).id, 'site.layout.header-overlap.mobile')
  assert.equal(rowForFinding(checks, headerOverlapFinding(0, 'desktop')).id, 'site.layout.header-overlap.desktop')
  assert.equal(rowForFinding(checks, imagesFinding).id, 'site.layout.images.render')
  assert.equal(rowForFinding(checks, { ...imagesFinding, conditions: ['every-image-failed-in-run'] }).id, 'site.loop.health.images-all-failed')
  const grades = rowForCheck(checks, 'campus-page-grade-source-sync')
  assert.equal(scopeKeyFor(grades, { entity: 'program-29735717555', url: 'https://alpha.school/raleigh/' }), 'page:raleigh')
  assert.equal(scopeKeyFor(rowForCheck(checks, 'map-campus-missing-from-operations'), { entity: 'program-29735717555', url: 'https://docs.google.com/spreadsheets/d/x/edit' }), 'program:program-29735717555')
  assert.equal(idempotencyKeyFor(rowForCheck(checks, 'campus-sister-brand-leak'), { url: 'https://alpha.school/Brownsville?x=1#y' }), 'observer:site.identity.sister-brand:page:Brownsville')
  assert.equal(renderExpected(grades), 'derived from hubspot-programs start_grade_level, end_grade_level (grade-range (start-end, PreK and K spelled as the page spells them)); never grade_levels, grades_served, grades, school_grades')
  assert.equal(renderComparator(grades), 'intersects 1 normalized-range')
  assert.equal(pageSlug('https://alpha.school/'), 'home')
  assert.equal(pageSlug('https://alphahigh.school/'), 'alphahigh.school')
  assert.equal(normalizePageUrl('https://alpha.school/atlanta'), 'https://alpha.school/atlanta/')
  assert.equal(normalizePageUrl('https://github.com/superbuilders/aeo/actions/workflows/site-observe.yml'), 'https://github.com/superbuilders/aeo/actions/workflows/site-observe.yml')
  assert.equal(normalizePageUrl('http://alpha.school/atlanta/'), null)
  assert.deepEqual(findingConditions({ actual: { endsAt: '2026-09-01T00:00:00Z' }, conditions: ['hidden-on-all-viewports'] }, NOW), ['hidden-on-all-viewports', 'event-ended'])
  assert.deepEqual(observerIdsForTask({ title: 'x', description: 'Observer ID: SITE-ABCDEF1234\nsee SITE-OBSERVER', customFields: { checkId: 'observer-layout', observerIds: ['SITE-00000000AA'], externalId: 'alpha-site-observer:SITE-ABCDEF1234' } }), ['SITE-00000000AA', 'SITE-ABCDEF1234'])
  assert.deepEqual(ownerFor({ roleOwners: { 'website-agent-operator': [{ name: 'Matt Barge', apexUserId: 'u1' }] }, roleFallback: {} }, 'nobody'), { id: 'u1', name: 'Matt Barge', role: 'website-agent-operator', via: 'nobody -> website-agent-operator', escalated: true })
  assert.deepEqual(ownerFor({ roleOwners: { a: [{ name: 'A' }], b: [{ name: 'B', apexUserId: 'u2' }] }, roleFallback: { a: 'b' } }, 'a'), { id: 'u2', name: 'B', role: 'b', via: 'a -> b', escalated: false })
  assert.equal(formatFact({ source: 'map', id: 'program-1', name: 'Alpha Richmond', empty: '' }), 'source map, id program-1, name Alpha Richmond')
  assert.equal(formatFact([1, 2, 3, 4, 5]), '1; 2; 3 (+2 more)')
  assert.equal(formatFact(null), 'n/a')
  assert.deepEqual(normalizeHealth(null, { providers: { map: { status: 'failed', error: 'timeout' }, ok: { status: 'healthy' } } }), { source: 'manifest.providers', unhealthy: { map: { status: 'failed', reason: 'timeout' } }, snapshots: {} })
  const mapRow = rowForCheck(checks, 'map-campus-missing-from-operations')
  assert.deepEqual(unhealthyDependencies(mapRow, checks, normalizeHealth(null, { providers: { map: { status: 'failed', error: 'timeout' } } })).map((u) => [u.source, u.reportedAs]), [['growth-map-api', 'map']], 'a sourceHealth id is matched through its provider entity (map-api) and the manifest name (map)')
  assert.deepEqual(unhealthyDependencies(mapRow, checks, normalizeHealth(null, { providers: { 'campus-operations': { status: 'healthy', extractedAt: '2026-09-01T00:00:00Z' } } }), NOW).map((u) => [u.source, u.status]), [['operations-sheet', 'stale']], 'a snapshot older than staleAfterHours is loop health')
  assert.deepEqual(loopHealthSuppression(mapRow, { url: 'https://alpha.school/locations/' }, [{ row: rowForCheck(checks, 'campus-operations-snapshot-fresh'), finding: { id: 'SITE-SNAP000001' } }], checks).map((h) => h.check), ['campus-operations-snapshot-fresh'])
  assert.equal(DEFAULT_CLEAR_AFTER_RUNS, 2)

  // Fail closed: a malformed row, a wrong scope, a packet without incidents.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-observer-filer-bad-'))
  const badBundle = path.join(tmp, 'bundle.json')
  fs.writeFileSync(badBundle, JSON.stringify({ rows: [{ id: 'r1', observerCheck: 'x', status: 'enforced', dedupeScope: 'galaxy', channel: 'slack' }] }))
  assert.throws(() => loadCheckBundle(badBundle), (e) => e instanceof ObserverFilerError && e.code === 'BAD_BUNDLE' && /missing title/.test(e.message) && e.problems.some((p) => /dedupeScope must be one of page, template, program, event, site, got galaxy/.test(p)) && e.problems.some((p) => /channel must be ticket or loop-health/.test(p)))
  assert.throws(() => loadCheckBundle(path.join(tmp, 'missing.json')), (e) => e.code === 'BAD_BUNDLE' && /--bundle/.test(e.message))
  assert.throws(() => loadRunFolder(tmp), (e) => e.code === 'BAD_RUN_DIR' && /manifest\.json/.test(e.message))
  fs.writeFileSync(path.join(tmp, 'queue.json'), JSON.stringify({ nope: true }))
  assert.throws(() => loadQueue(path.join(tmp, 'queue.json')), (e) => e.code === 'BAD_QUEUE')
  assert.throws(() => downloadPacket('abc', tmp), (e) => e.code === 'MISSING_ARG')
  const spawned = []
  assert.equal(downloadPacket('36012695049', path.join(tmp, 'packet'), { spawn: (cmd, args) => { spawned.push([cmd, args]); return { status: 0 } } }), path.join(tmp, 'packet'))
  assert.deepEqual(spawned, [['gh', ['run', 'download', '36012695049', '-R', 'superbuilders/aeo', '-n', 'alpha-site-packet-36012695049', '-D', path.join(tmp, 'packet')]]])
  assert.throws(() => downloadPacket('36012695049', path.join(tmp, 'packet'), { spawn: () => ({ status: 1, stderr: 'no artifact' }) }), (e) => e.code === 'DOWNLOAD_FAILED' && /no artifact/.test(e.message))
})

test('observer filer: --apply creates, assigns, attaches the evidence pair, completes cleared tickets with one v1 PATCH, skips filer-owned conflicts, and logs every write', async () => {
  const cleared = { loop: 'functional', check: 'campus-layout-horizontal-overflow', entity: 'campus-program-2000-mobile', field: 'layout', severity: 'high', title: 'Alpha Old overflows', url: 'https://alpha.school/old/', id: 'SITE-OLDCLEAR01', status: 'resolved', firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-09-20T00:00:00.000Z', lastRunId: 'site-full-2026-09-20T00-00-00-000Z', resolvedAt: '2026-09-22T00:00:00.000Z', resolvedByRunId: 'site-full-2026-09-22T00-00-00-000Z', occurrences: 4, cleanRuns: 3, reopenedCount: 0 }
  const clearedByFiler = { ...cleared, entity: 'campus-program-2001-mobile', url: 'https://alpha.school/older/', id: 'SITE-OLDCLEAR02', cleanRuns: 2 }
  const synthetic = syntheticRun({ pages: 2, extraIncidents: [cleared, clearedByFiler] })
  const queue = [
    { id: 'cmold1', title: 'Alpha Old: overflows on mobile', status: 'NOT_STARTED', url: 'https://alpha.school/old/', agentStatus: 'BLOCKED', description: 'Requester text first.\nPage: https://alpha.school/old/', customFields: { source: 'alpha-site-qc', check: 'campus-layout-horizontal-overflow', checkId: 'SITE-OLDCLEAR01', history: ['filed'] } },
    { id: 'cmfiler1', title: 'Alpha Older: fails "No horizontal overflow"', status: 'BLOCKED', url: 'https://alpha.school/older/', agentStatus: null, description: 'Matt Barge: fix it', customFields: { source: 'agent-found', checkId: 'SITE-OLDCLEAR02', triagedClass: 'observer-layout', idempotencyKey: 'observer:site.layout.viewport:page:older', observerIds: ['SITE-OLDCLEAR02'] } },
  ]
  const plan = planObserverFindings({ run: loadRunFolder(synthetic.dir), bundle: bundle(), queue, now: NOW })
  assert.equal(plan.counts.files, 1)
  assert.deepEqual(plan.resolves.map((r) => r.id), ['cmold1', 'cmfiler1'])
  for (const r of plan.resolves) assert.deepEqual(Object.keys(r.patch).sort(), ['customFields', 'description', 'resolutionKind', 'status'], 'no agentStatus, no agentEligible')
  assert.deepEqual(plan.resolves[0].cleared.clearingRunIds, ['site-full-2026-09-22T00-00-00-000Z', RUN_ID])
  assert.equal(plan.resolves[0].patch.customFields.requirementId, 'site.layout.viewport')
  assert.deepEqual(plan.resolves[0].patch.customFields.history, ['filed', `2026-09-24 agent/file-observer-findings.mjs ${FILER_VERSION}: completed, check cleared on site-full-2026-09-22T00-00-00-000Z, ${RUN_ID}`])

  const calls = []
  const apex = {
    token: 'operator-key', v1Base: 'http://127.0.0.1:4010/api/v1', agentBase: 'http://127.0.0.1:4010/api/agent',
    create: async (body) => { calls.push(['create', body]); return { id: 'cmnew1', status: body.status } },
    patch: async (id, body) => { calls.push(['patch', id, body]); return { id, status: body.status || 'BLOCKED' } },
  }
  const fetchImpl = async (url, init) => {
    const form = init.body
    calls.push(['evidence', url, form.get('viewport'), form.get('section'), form.get('agentRunId'), form.get('pageUrl')])
    return new Response(JSON.stringify({ screenshotUrl: `https://cdn.example/${form.get('viewport')}.png`, asset: { sha256: form.get('sha256') } }), { status: 201, headers: { 'content-type': 'application/json' } })
  }
  const writesFile = path.join(synthetic.dir, 'filer-writes.jsonl')
  const logs = []
  const result = await applyPlan(plan, { apex, fetchImpl, log: (l) => logs.push(l), writesFile })
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.skipped, [])
  assert.deepEqual(result.filed, [{ id: 'cmnew1', key: 'observer:site.layout.viewport:template:campus', title: plan.files[0].title }])
  assert.deepEqual(result.resolved, [{ id: 'cmold1', status: 'COMPLETED' }, { id: 'cmfiler1', status: 'COMPLETED' }])
  assert.deepEqual(calls.map((c) => c[0]), ['create', 'patch', 'evidence', 'evidence', 'evidence', 'evidence', 'patch', 'patch'])
  const [, created] = calls[0]
  assert.equal(created.status, 'BLOCKED')
  assert.ok(!('assignees' in created), 'assignment is a second write, like file-found-ticket.mjs')
  assert.equal(created.customFields.checkId, 'SITE-HO00D000000')
  assert.equal(created.customFields.filerRunId, RUN_ID)
  assert.deepEqual(calls[1].slice(1), ['cmnew1', { assignees: { set: [{ id: 'cmq61oe6i000004lduh172vf3' }] } }])
  assert.deepEqual(calls[2].slice(1), ['http://127.0.0.1:4010/api/agent/tasks/cmnew1/evidence/screenshots', 'desktop', 'header', RUN_ID, 'https://alpha.school/campus-0/'])
  assert.deepEqual(calls[3].slice(1, 3), ['http://127.0.0.1:4010/api/agent/tasks/cmnew1/evidence/screenshots', 'mobile'])
  const [, resolvedId, resolvePatch] = calls[6]
  assert.equal(resolvedId, 'cmold1')
  assert.deepEqual(Object.keys(resolvePatch).sort(), ['customFields', 'description', 'resolutionKind', 'status'])
  assert.equal(resolvePatch.status, 'COMPLETED')
  assert.equal(resolvePatch.resolutionKind, 'check-cleared')
  assert.equal(resolvePatch.customFields.resolutionKind, 'check-cleared')
  assert.ok(resolvePatch.description.startsWith('Requester text first.\nPage: https://alpha.school/old/\n\nRESOLUTION ('))
  for (const call of calls) if (call[0] === 'patch') { assert.ok(!('agentEligible' in call[2]), 'no PATCH ever carries agentEligible'); assert.ok(!('agentStatus' in call[2]), 'APEX clears agentStatus on completion') }

  const writes = fs.readFileSync(writesFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(writes.map((w) => w.write), ['create', 'assign', 'evidence', 'evidence', 'resolve', 'resolve'])
  assert.ok(writes.every((w) => w.runId === RUN_ID && /^\d{4}-\d{2}-\d{2}T/.test(w.at)))
  assert.deepEqual(writes[2].shots.map((s) => s.viewport), ['desktop', 'mobile'])
  assert.deepEqual(writes[4], { ...writes[4], write: 'resolve', ticket: 'cmold1', status: 'COMPLETED', resolutionKind: 'check-cleared', clearingRunIds: ['site-full-2026-09-22T00-00-00-000Z', RUN_ID], observerIds: ['SITE-OLDCLEAR01'] })
  assert.equal(result.writes.length, 6)
  assert.ok(logs.some((l) => /^filed cmnew1 /.test(l)) && logs.some((l) => /^completed cmold1 /.test(l)))

  // A 409 OBSERVER_FILER_OWNED (APEX PR 409) is a logged skip; any other APEX failure is logged and does not stop the rest.
  const conflict = Object.assign(new ObserverFilerError('APEX_ERROR', 'APEX PATCH /tasks/cmold1 409: {"code":"OBSERVER_FILER_OWNED"}'), { status: 409, body: { code: FILER_OWNED_CODE } })
  const failing = { ...apex, patch: async (id, body) => { if (id === 'cmold1') throw conflict; if (id === 'cmfiler1') throw new Error('APEX PATCH 500'); calls.push(['patch', id, body]); return { id, status: body.status } } }
  const second = await applyPlan(plan, { apex: failing, fetchImpl, writesFile: path.join(synthetic.dir, 'second.jsonl') })
  assert.deepEqual(second.skipped, [{ id: 'cmold1', step: 'resolve', reason: FILER_OWNED_CODE }])
  assert.deepEqual(second.errors, [{ id: 'cmfiler1', step: 'resolve', error: 'APEX PATCH 500' }])
  assert.deepEqual(second.resolved, [])
  const secondWrites = fs.readFileSync(path.join(synthetic.dir, 'second.jsonl'), 'utf8')
  assert.match(secondWrites, /"write":"resolve","ticket":"cmold1","skipped":"OBSERVER_FILER_OWNED"/)
  assert.match(secondWrites, /"write":"resolve","ticket":"cmfiler1","error":"APEX PATCH 500"/)
})

test('observer filer: the CLI is a dry run by default, writes the report, never touches APEX without a token, and refuses --apply without one', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-observer-filer-cli-'))
  const report = path.join(tmp, 'report.json')
  const env = { ...process.env, APEX_API_TOKEN: '' }
  const stdout = execFileSync(process.execPath, ['agent/file-observer-findings.mjs', '--run-dir', path.join(fixtures, 'run-2026-09-24'), '--bundle', BUNDLE, '--queue', path.join(fixtures, 'queue-2026-09-24.json'), '--now', NOW.toISOString(), '--report', report], { cwd: root, encoding: 'utf8', env })
  const summary = JSON.parse(stdout)
  assert.equal(summary.mode, 'dry-run')
  assert.equal(summary.runId, RUN_ID)
  assert.equal(summary.bundleVersion, '1.0')
  assert.equal(summary.counts.resolves, 93)
  assert.equal(summary.counts.files, 11)
  assert.equal(summary.counts.decisionPending, 25)
  assert.equal(summary.counts.loopHealth, 5)
  assert.deepEqual(summary.unhealthySources, ['campus-staff', 'google-search-console', 'browser'])
  assert.equal(summary.files.length, 11)
  assert.ok(summary.files.some((line) => /^Alpha Raleigh: fails "No other campus in image file names, alt text or nearby text" \(9 findings\) -> Matt Barge \(website-agent-operator\); 9 finding\(s\), 0 evidence pair\(s\)$/.test(line)), summary.files.join('\n'))
  assert.ok(summary.decisionPending.some((line) => /^campus-layout-header-overlap template:campus: 34 finding\(s\) wait on cmtnl00rs000404l1ihl5ucij$/.test(line)))
  assert.equal(summary.resolves.length, 93)
  assert.ok(!('applied' in summary))
  const written = JSON.parse(fs.readFileSync(report, 'utf8'))
  assert.equal(written.mode, 'dry-run')
  assert.equal(written.resolves.length, 93)
  assert.ok(!fs.existsSync(path.join(fixtures, 'run-2026-09-24', 'filer-writes.jsonl')), 'a dry run writes no jsonl')
  assert.ok(!fs.existsSync(path.join(fixtures, 'run-2026-09-24', 'filer-report.json')), '--report kept the fixture folder clean')

  const noQueue = spawnSync(process.execPath, ['agent/file-observer-findings.mjs', '--run-dir', path.join(fixtures, 'run-2026-09-24'), '--bundle', BUNDLE], { cwd: root, encoding: 'utf8', env })
  assert.equal(noQueue.status, 1)
  assert.match(noQueue.stderr, /^MISSING_TOKEN: APEX_API_TOKEN is required to read the open queue; pass --queue/)
  const noApply = spawnSync(process.execPath, ['agent/file-observer-findings.mjs', '--run-dir', path.join(fixtures, 'run-2026-09-24'), '--bundle', BUNDLE, '--queue', path.join(fixtures, 'queue-2026-09-24.json'), '--apply', '--report', report], { cwd: root, encoding: 'utf8', env })
  assert.equal(noApply.status, 1)
  assert.match(noApply.stderr, /^MISSING_TOKEN: APEX_API_TOKEN required for --apply/)
  const usage = spawnSync(process.execPath, ['agent/file-observer-findings.mjs'], { cwd: root, encoding: 'utf8', env })
  assert.equal(usage.status, 1)
  assert.match(usage.stderr, /^MISSING_ARG: Usage: file-observer-findings\.mjs --run-dir/)
  const badRun = spawnSync(process.execPath, ['agent/file-observer-findings.mjs', '--run', 'latest', '--queue', path.join(fixtures, 'queue-2026-09-24.json')], { cwd: root, encoding: 'utf8', env })
  assert.equal(badRun.status, 1)
  assert.match(badRun.stderr, /^MISSING_ARG: --run must be the numeric GitHub run id/)

  // The contract object and body are the reviewer's view; a hand-built one renders every labelled line the checker reads.
  const run = loadRunFolder(path.join(fixtures, 'run-2026-09-24'))
  const checks = bundle()
  const row = rowForCheck(checks, 'campus-sister-brand-leak')
  const finding = run.findings.find((f) => f.check === 'campus-sister-brand-leak')
  const policy = loadPolicyBundle()
  const contract = buildContract({ row, group: { key: 'k', row, rows: [row], findings: [finding], pages: [normalizePageUrl(finding.url)] }, run, bundle: checks, owner: ownerFor(policy, row.ownerRole), policy, now: NOW })
  const body = renderObserverBody(contract)
  for (const label of ['Claim:', 'Page:', 'Element:', 'Observed:', 'Expected:', 'Source:', 'Defect class:', 'Class:', 'Owner:', 'Fix path:', 'Done when:', 'Evidence:', 'Exemptions:', 'Playbook:', 'History:']) assert.ok(body.includes(`\n${label} `) || body.includes(`\n${label}\n`), `body carries ${label}`)
  assert.match(body, /\nExemptions: registry\/sister-brand-exceptions\.json \(allowed phrases per campus; /)
  assert.match(body, /^Matt Barge: /)
})
