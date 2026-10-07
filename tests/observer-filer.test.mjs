// agent/file-observer-findings.mjs (QC loop redesign 2026-09-24, workstream 6): the playbook's filer for observer findings.
// Fixtures: tests/fixtures/observer-filer/run-2026-09-24 is the observer packet artifact of run site-full-2026-09-24T14-28-40-974Z
// (GitHub run 36012695049; findings and incidents with long `actual` arrays trimmed, no screenshots); queue-2026-09-24.json is the
// open observer queue exported before the 2026-09-24 sweep plus the decision tickets the bundle names; check-bundle.generated.json is
// a byte copy of the committed spec/check-bundle.generated.json (tests/build-checks.mjs) and the first test fails when the two drift.
// The queue also carries the 18 open agent-found tickets read from the live queue on 2026-09-24 that sit on campus pages under
// pre-redesign check ids (cta-links-resolve, campus.resources.calendar-reachable, ...): the dedupe aliases in
// spec/observer-check-map.json match the observer's findings to them instead of filing again.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_CLEAR_AFTER_RUNS,
  DEFAULT_MAX_PACKET_AGE_HOURS,
  FILER_OWNED_CODE,
  FILED_BY,
  FILER_VERSION,
  LIST_MAX_PAGES,
  OUT_OF_SCOPE_SITE,
  NOT_FILER_OWNED,
  OBSERVER_ID,
  OPEN_STATUSES,
  ObserverFilerError,
  RESOLUTION_KIND,
  STALE_PACKET,
  applyPlan,
  assessPacketFreshness,
  compareRunIds,
  packetGateOptions,
  runIdTimestamp,
  buildContract,
  buildResolvePatch,
  campusSlugFor,
  cleanText,
  ctaExceptionFor,
  ctaForRow,
  exemptionsRefsFor,
  findOpenDuplicate,
  isCampusPageRow,
  lifecycleFor,
  loadRegistry,
  MISSING_INFO_STATUS,
  RECORDED_SINCE,
  isMissingExpectation,
  missingExpectationFor,
  slotObservation,
  missingExpectationTitle,
  missingFromMapOnly,
  missingExpectationKey,
  registryFileForRow,
  resetRegistryCache,
  outOfScopeSite,
  sharedLeadershipExemption,
  consecutiveFailingRuns,
  createApexClient,
  downloadPacket,
  findingConditions,
  formatFact,
  idempotencyKeyFor,
  instructionLine,
  isCleanRunClear,
  isFilerOwnedConflict,
  isFilerOwnedTask,
  isObserverId,
  loadCheckBundle,
  loadPolicyBundle,
  renderSourceDigest,
  SOURCE_DIGEST_TICKET,
  loadQueue,
  loadRunFolder,
  normalizeHealth,
  normalizePageUrl,
  observerHoldsApply,
  observerIdsForTask,
  ownerFor,
  pageSlug,
  planObserverFindings,
  renderComparator,
  renderExpected,
  renderObserverBody,
  resolveDrift,
  resolveEligibility,
  rowForCheck,
  rowForFinding,
  rowKeyFor,
  scopeKeyFor,
  suppressingStatus,
  unhealthyDependencies,
} from '../agent/file-observer-findings.mjs'
import { isFilerOwnedConflict as sharedPredicate } from '../agent/apex-errors.mjs'
import { gate, lastAppliedRun } from '../agent/packet-freshness-gate.mjs'
import { contractCheck } from './validate-ticket.mjs'
import { assertNoteShape } from '../agent/ticket-templates.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = path.join(root, 'tests', 'fixtures', 'observer-filer')
const BUNDLE = path.join(fixtures, 'check-bundle.generated.json')
const RUN_ID = 'site-full-2026-09-24T14-28-40-974Z'
const PREVIOUS_RUN_ID = 'site-full-2026-09-24T02-00-00-000Z'
const NOW = new Date('2026-09-24T16:00:00Z')
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const bundle = () => loadCheckBundle(BUNDLE)

/** The 16 map-row tickets (C1's 14 and two of C2's) whose incidents the 2026-09-24 run shows resolved after 31 or more clean runs, but with resolutionReason superseded-evidence-version: a person's call, never check-cleared. */
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
/** Decision tickets the bundle rows name (decisionPending) that are open in the queue and cleared in the packet: the decision closes them, never the filer. */
const DECISION_TICKETS_CLEARED = ['cmtlz33vo000504ju2itpi7d9', 'cmtnxta3p000104l2mg9p9kvf']

/** Observer ids in the observer's own shape (SITE- plus ten hex characters); `tag` is hex. */
const oid = (tag) => `SITE-${String(tag).toUpperCase().padStart(10, '0')}`

function headerOverlapFinding(p, viewport, { severity = 'high' } = {}) {
  const route = `campus-program-${1000 + p}`
  const url = `https://alpha.school/campus-${p}/`
  const id = oid(`${String(p).padStart(2, '0')}${viewport === 'desktop' ? 'D' : 'A'}0000000`)
  return { loop: 'functional', check: 'campus-layout-header-overlap', entity: `${route}-${viewport}`, field: 'layout', severity, title: `Alpha Campus ${p} header overlaps page headings on ${viewport}`, summary: 'The navigation/header should not sit on top of campus headings.', actionable: true, url, expected: 'header separated from headings', actual: [{ heading: `Alpha Campus ${p} K-8 Private School`, headingBox: { top: 99.5, bottom: 249.5 }, headerBox: { top: 0, bottom: 112 } }], businessImpact: 'visual', routing: { owners: ['Matt Barge'], channel: '#support-websites' }, evidenceVersion: 2, id, evidenceImages: [{ kind: 'screenshot', path: `screenshots/${route}-${viewport}.png`, route, viewport, url }] }
}

/** A synthetic packet: header-overlap findings on `pages` campus pages across the viewports, with incidents, manifest, health and screenshots. */
function syntheticRun({ pages = 12, viewports = ['desktop', 'mobile'], occurrences = 3, firstSeenAt = '2026-09-02T00:00:00.000Z', browser = 'healthy', screenshots = true, extraFindings = [], extraIncidents = [], health = true, healthSources = {}, healthExtra = {}, manifestExtra = {} } = {}) {
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
  if (screenshots) {
    for (const image of extraFindings.flatMap((f) => f.evidenceImages || [])) {
      if (image?.kind !== 'screenshot' || !image.route) continue
      fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true })
      for (const viewport of ['desktop', 'mobile']) fs.writeFileSync(path.join(dir, 'screenshots', `${image.route}-${viewport}.png`), Buffer.concat([PNG_HEADER, Buffer.from(`${image.route}-${viewport}`)]))
    }
  }
  const manifest = { schemaVersion: 1, system: 'alpha-site-observer', runId: RUN_ID, mode: 'full', startedAt: '2026-09-24T14:28:40.974Z', completedAt: '2026-09-24T14:39:45.674Z', loopsExecuted: ['campus-truth', 'functional', 'loop-health'], loopEvidenceVersions: { functional: 2 }, providers: { browser: { status: browser, completedAt: '2026-09-24T14:38:00.000Z' }, 'campus-pages': { status: 'healthy', completedAt: '2026-09-24T14:29:09.847Z' }, 'campus-operations': { status: 'healthy', completedAt: '2026-09-24T14:28:45.844Z', extractedAt: '2026-09-24T14:28:45.844Z' } }, findingsObserved: findings.length, evidence: { kind: 'site-observation', sha256: 'f'.repeat(64) }, ...manifestExtra }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(findings))
  fs.writeFileSync(path.join(dir, 'incidents.json'), JSON.stringify(incidents))
  if (health) fs.writeFileSync(path.join(dir, 'health.json'), JSON.stringify({ runId: RUN_ID, generatedAt: manifest.completedAt, sources: { browser: { status: browser, reason: browser === 'healthy' ? null : 'screenshot budget exhausted' }, 'campus-pages': { status: 'healthy' }, 'operations-sheet': { status: 'healthy', extractedAt: '2026-09-24T14:28:45.844Z' }, ...healthSources }, ...healthExtra }))
  return { dir, findings, incidents, manifest }
}

const countBy = (items, key) => items.reduce((a, item) => ({ ...a, [key(item)]: (a[key(item)] || 0) + 1 }), {})
/** The same ticket as if this filer had created it (PR 26: provenance, not a SITE id, grants close authority). */
const asFilerOwned = (task) => ({ ...task, customFields: { ...task.customFields, source: 'agent-found', filedBy: FILED_BY, filerRunId: 'site-full-2026-09-18T06-39-38-196Z' } })

test('observer filer: replay of the 2026-09-24 packet never auto-resolves legacy observer tickets, closes only the filer\'s own cleared NOT_STARTED tickets, reports the rest as needing a person, and files nothing twice', () => {
  const run = loadRunFolder(path.join(fixtures, 'run-2026-09-24'))
  const queue = loadQueue(path.join(fixtures, 'queue-2026-09-24.json'))
  assert.equal(queue.length, 199, 'the 180 open observer tickets the sweep worked, the open grade decision ticket the bundle names, and the 18 agent-found tickets under pre-redesign check ids')
  const checks = bundle()
  assert.equal(checks.version, '1.11')
  assert.match(checks.sha256, /^[0-9a-f]{64}$/)
  assert.equal(checks.sha256, loadCheckBundle(path.join(root, 'spec', 'check-bundle.generated.json')).sha256, 'the fixture bundle is a copy of the committed one; rebuild and copy after a row change')
  const plan = planObserverFindings({ run, bundle: checks, queue, now: NOW })

  // Bundle 1.2 (2026-09-25): 39 findings on source-digest rows leave the queue for source-digest.md. Grounding restore (bundle 2c8a5aeb): the image-identity and seasonal rows are enforced again on their complaints, so their 19 findings leave advisory: two Maddox cards are exempted, two match the open San Juan and Lexington tickets, and Raleigh, La Jolla and Scottsdale file beside Lexington's calendar; no group waits on a decision.
  assert.deepEqual(plan.counts, { findings: 224, dropped: 49, loopHealth: 56, sourceDigest: 39, suppressedByObserver: 0, advisory: 9, outOfScope: 3, exempted: 2, suppressed: 35, held: 0, groups: 19, decisionPending: 0, files: 4, existing: 15, invalid: 0, resolves: 0, needsPerson: 0, unresolved: 180, evidencePairs: 0, missingInfo: 0, recordedSince: 0, informational: 0 })
  assert.deepEqual(countBy(plan.sourceDigest, (x) => x.ownerRole), { 'hubspot-program-admin': 7, 'operations-sheet-owner': 21, 'community-app-owner': 11 })
  assert.deepEqual(countBy(plan.sourceDigest, (x) => x.row), { 'site.map.integrity.address-agreement': 4, 'site.community.routing.host': 11, 'site.map.integrity.operations-row': 12, 'site.map.integrity.operations-on-map': 7, 'site.map.integrity.operations-address': 5 })
  assert.ok(plan.sourceDigest.every((x) => /^.+ \| .+ \| observed: .+ \| expected: .+ \| source: .+ \(read 20[0-9-]+T.+\) \| observer SITE-[0-9A-F]{10}, row site\..+, severity .+, run site-full-2026-09-24T14-28-40-974Z/.test(x.audit)), 'every digest item carries the audit line')
  assert.match(plan.holds, /^filer \(no verified check bundle in the manifest\)/, 'this packet predates the observer\'s bundle verification, so the filer applies its own holds')

  // Every check name the packet carries is a row or a retirement (finding 3): nothing is dropped for want of a row.
  const packetChecks = new Set([...run.findings, ...run.incidents].map((f) => f.check))
  for (const name of packetChecks) assert.ok(checks.byCheck.has(name) || checks.retired.has(name), `${name} has neither a row nor a retirement in the check bundle`)
  assert.ok(plan.dropped.every((d) => d.reason.startsWith('retired: ')), 'every drop is a retirement; a check with no row would be a bundle defect')
  assert.deepEqual(countBy(plan.dropped, (d) => d.check), { 'primary-cta-count': 46, 'approved-baseline': 1, 'claim-registry': 1, 'visual-baseline': 1 })
  assert.deepEqual(countBy(plan.loopHealth, (l) => l.check), { 'provider-health': 2, 'route-screenshot-capture': 47, 'route-font-readiness': 4, 'route-browser-inspection': 1, 'campus-map-inspection-timeout': 2 }, 'the capture checks are loop-health rows now, never dropped and never filed')

  // Source health from the manifest until the observer writes health.json: only degraded, failed or stale suppresses; disabled providers do not.
  // The degraded browser suppresses every browser-derived layout and crop finding (PR 26).
  assert.equal(plan.health.source, 'manifest.providers')
  assert.deepEqual(Object.keys(plan.health.unhealthy), ['browser'])
  assert.deepEqual(countBy(plan.suppressed, (x) => `${x.check}|${x.reason}`), { 'campus-layout-header-overlap|source health': 34, 'campus-image-crop-risk|source health': 1 })
  assert.deepEqual(plan.suppressedByObserver, { count: 0, items: null, reported: false })
  // Grounding restore: only the still-ungrounded community-destination and claim-evidence rows are advisory; image identity and the seasonal window are enforced.
  assert.deepEqual(countBy(plan.advisory, (x) => x.check), { 'community-destination': 2, 'claim-evidence': 7 })
  for (const check of ['campus-layout-header-overlap', 'campus-layout-horizontal-overflow', 'campus-layout-offscreen-content', 'campus-layout-clipped-text', 'campus-image-crop-risk']) assert.ok(rowForCheck(checks, check).sourceHealthDependency.includes('browser'), `${check} declares browser health`)

  // Provenance, not a SITE id, grants close authority (PR 26): all 180 historical observer tickets predate this filer and none resolves.
  assert.deepEqual(plan.resolves, [])
  assert.deepEqual(plan.needsPerson, [])
  assert.deepEqual(countBy(plan.unresolved, (u) => u.reason), { [NOT_FILER_OWNED]: 180 })
  assert.ok(queue.filter((t) => observerIdsForTask(t).length).every((t) => !isFilerOwnedTask(t)))
  for (const id of [...MAP_ROW_TICKETS_CLEARED, ...MAP_ROW_TICKETS_STILL_ACTIVE, ...DECISION_TICKETS_CLEARED]) assert.equal(plan.unresolved.find((u) => u.id === id)?.reason, NOT_FILER_OWNED)

  // The same tickets as if this filer had created them: the guard (finding 1), the clean-run rule (finding 6) and the resolve PATCH on real data.
  // The 18 agent-found tickets under pre-redesign check ids stay as they are (they carry no observer id and are a person's); the rest replay as the filer's own.
  const preRedesign = (t) => t.customFields?.source === 'agent-found' && t.id !== 'cmu4g13kc00000agmdogkxihp'
  assert.equal(queue.filter(preRedesign).length, 18)
  const owned = queue.map((t) => (preRedesign(t) ? t : asFilerOwned(t)))
  const ownedPlan = planObserverFindings({ run, bundle: checks, queue: owned, now: NOW })
  // Bundle 1.2: the 16 cleared map-row tickets and the 12 cleared Community URL tickets sit on source-digest rows now; the filer leaves them to their owners (unresolved, never closed).
  assert.deepEqual({ resolves: ownedPlan.counts.resolves, needsPerson: ownedPlan.counts.needsPerson, unresolved: ownedPlan.counts.unresolved }, { resolves: 50, needsPerson: 16, unresolved: 115 })
  const resolved = new Set(ownedPlan.resolves.map((r) => r.id))
  assert.ok(ownedPlan.resolves.every((r) => r.status === 'NOT_STARTED' && r.filedBy === 'filer'))
  assert.ok(ownedPlan.resolves.every((r) => r.updatedAt === queue.find((t) => t.id === r.id).updatedAt), 'a resolve item remembers the updatedAt the plan read; applyPlan compares the live ticket with it')
  assert.ok(ownedPlan.resolves.every((r) => !('expectedUpdatedAt' in r.patch)), 'the v1 PATCH never carries expectedUpdatedAt (APEX answers 400 Unsupported task field, 2026-09-25)')
  assert.deepEqual(countBy(ownedPlan.resolves, (r) => r.cleared.checks.join('+')), {
    'provider-health': 3, 'public-event-sync': 23, 'event-page-reachable': 1, 'campus-layout-header-overlap': 9, 'event-registration-reachable': 2, 'route-reachable': 4,
    'campus-layout-offscreen-content': 1, 'images-render': 3, 'campus-image-identity-conflict': 2, 'campus-event-filter': 2,
  })
  for (const id of MAP_ROW_TICKETS_STILL_ACTIVE) assert.ok(!resolved.has(id), `${id} is still observed and must stay open`)
  assert.deepEqual(countBy(ownedPlan.unresolved, (u) => u.reason.split(' (')[0]), { 'still observed in this run': 24, 'incident not in this packet': 35, [SOURCE_DIGEST_TICKET]: 54, 'incident still open in the observer': 1, 'observer or filer ticket without an observer id': 1 }, 'the grade decision ticket carries no SITE id')
  const digestUnresolved = ownedPlan.unresolved.filter((u) => u.reason === SOURCE_DIGEST_TICKET)
  assert.deepEqual(countBy(digestUnresolved, (u) => u.rows.join('+')), { 'site.community.routing.host': 11, 'site.map.integrity.address-agreement': 2, 'site.community.routing.pre-announcement-url': 12, 'site.map.integrity.operations-row': 28, 'site.map.integrity.operations-on-map': 1 })
  for (const id of [...MAP_ROW_TICKETS_CLEARED, ...MAP_ROW_TICKETS_STILL_ACTIVE]) assert.ok(digestUnresolved.some((u) => u.id === id), `${id} is on a source-digest row and stays with its owner, observed or cleared`)
  // Cleared but needs a person: FOR_REVIEW and MISSING_INFO tickets, the decision tickets rows wait on, and every incident the observer
  // resolved by an evidence-version bump rather than clean runs (the 16 map rows among them: 31+ clean runs, but superseded-evidence-version).
  const needsPerson = new Map(ownedPlan.needsPerson.map((n) => [n.id, n]))
  for (const id of DECISION_TICKETS_CLEARED) assert.ok(!resolved.has(id) && needsPerson.has(id), `${id} must not auto-resolve`)
  for (const id of MAP_ROW_TICKETS_CLEARED) assert.ok(!resolved.has(id), `${id} must not auto-resolve`)
  assert.ok(queue.filter((t) => t.status === 'FOR_REVIEW').every((t) => !resolved.has(t.id)), 'a FOR_REVIEW ticket never auto-resolves')
  assert.ok(queue.filter((t) => t.status === 'MISSING_INFO').every((t) => !resolved.has(t.id)))
  assert.deepEqual(countBy(ownedPlan.needsPerson, (n) => n.reason.replace(/ \(.*$/, '')), { 'resolved by the observer without a clean-run clear': 7, 'cleared but needs a person: status FOR_REVIEW belongs to a person': 8, 'cleared but needs a person: a check row waits on this ticket': 1 })
  assert.deepEqual(countBy(ownedPlan.needsPerson, (n) => n.status), { NOT_STARTED: 3, MISSING_INFO: 2, BLOCKED: 1, FOR_REVIEW: 10 })
  assert.match(ownedPlan.unresolved.find((u) => u.id === 'cmtmn1ras000004i2asbfpd1j').reason, /^source-digest row: the ticket stays with its owner/)
  assert.match(needsPerson.get('cmtlz33vo000504ju2itpi7d9').reason, /superseded-evidence-version/)
  assert.equal(needsPerson.get('cmtnxta3p000104l2mg9p9kvf').reason, 'cleared but needs a person: a check row waits on this ticket (decisionPending); the decision closes it')
  assert.match(needsPerson.get('cmty8wm7e000004laa25df799').reason, /^resolved by the observer without a clean-run clear \(SITE-[0-9A-F]{10} 0 clean of 2, no reason\); never check-cleared$/)
  assert.ok(ownedPlan.needsPerson.every((n) => n.cleared && n.checks.length), 'a needs-a-person entry says what cleared, so the person can close it in one read')

  // A resolve: the Kirkland header-overlap ticket, one v1 PATCH (APEX PR 409) with the existing text first and the section-7 note last.
  const lead = ownedPlan.resolves.find((r) => r.id === 'cmu6lnc4800010bgmprzvga91')
  assert.deepEqual(lead.cleared.observerIds, ['SITE-4E2ADC7F5B'])
  assert.deepEqual(lead.cleared.rows, ['site.layout.header-overlap.desktop'])
  assert.equal(lead.cleared.cleanRuns, 20)
  assert.deepEqual(lead.cleared.resolutionReasons, [])
  assert.deepEqual(lead.cleared.clearingRunIds, [RUN_ID])
  assert.deepEqual(Object.keys(lead.patch).sort(), ['customFields', 'description', 'resolutionKind', 'status'], 'one v1 PATCH: no agentStatus, never agentEligible (APEX PR 409), no expectedUpdatedAt (APEX v1 rejects it with 400)')
  assert.equal(lead.updatedAt, '2026-09-18T06:50:37.976Z', 'the stale guard compares the live updatedAt with this value at apply time')
  assert.equal(lead.patch.status, 'COMPLETED')
  assert.equal(lead.patch.resolutionKind, RESOLUTION_KIND)
  assert.equal(lead.patch.customFields.resolutionKind, RESOLUTION_KIND)
  assert.equal(lead.patch.customFields.checkId, 'SITE-4E2ADC7F5B', 'the observer check id stays on the ticket')
  assert.equal(lead.patch.customFields.filerRunId, RUN_ID)
  assert.equal(lead.patch.customFields.requirementId, 'site.layout.header-overlap', 'the row key (row id minus viewport), never the coarse requirement')
  assert.equal(lead.patch.customFields.checkBundleVersion, '1.11')
  assert.deepEqual(lead.patch.customFields.clearingRunIds, [RUN_ID])
  const original = queue.find((t) => t.id === lead.id).description
  assert.ok(lead.patch.description.startsWith(original), 'the existing text stays first')
  assert.match(lead.patch.description, /\n\nRESOLUTION \(agent\/file-observer-findings\.mjs 0\.8, 2026-09-24, playbook check bundle\)\nGo here: https:\/\/alpha\.school\/kirkland\/\nLook for: [^\n]*campus-layout-header-overlap \(site\.layout\.header-overlap\) is clear\n/)
  assert.match(lead.patch.description, /\nObserver: SITE-4E2ADC7F5B cleared on run site-full-2026-09-24T14-28-40-974Z\nResolution kind: check-cleared\nPlease review\.$/)
  assertNoteShape(lead.patch.description.slice(lead.patch.description.indexOf('\n\nRESOLUTION (') + 2))
  assert.match(lead.patch.description, /after 20 clean runs \(row requires 2\)/)
  for (const r of ownedPlan.resolves) assertNoteShape(r.patch.description.slice(r.patch.description.indexOf('\n\nRESOLUTION (') + 2))

  // Decisions: the 12 active map rows and 11 community hosts used to wait on the Columbus and Short Hills leads; since bundle 1.2 they are
  // source-digest lines that name the pending decision, so nothing waits and nothing files; the 34 header overlaps are suppressed by the
  // degraded browser before any decision applies; nothing files twice.
  assert.deepEqual(plan.decisionPending, [])
  assert.deepEqual(countBy(plan.sourceDigest.filter((d) => d.decisionPending), (d) => `${d.check} -> ${d.decisionPending}`), { 'map-campus-missing-from-operations -> cmtyu32gf00000agm0vltkx4s': 12, 'preannouncement-community-host -> cmu4g45fg00020agm20nd7kc8': 11 })
  assert.ok(plan.sourceDigest.filter((d) => d.decisionPending).every((d) => d.audit.endsWith(`, decision pending ${d.decisionPending}`)))
  // Sister-site guard: the three Alpha High findings (campus rows on alphahigh.school) are out of scope for this playbook, so the grade
  // finding no longer waits on the grade decision and the application-path and schema findings no longer dedupe against Alpha High tickets.
  assert.deepEqual(plan.outOfScope.map((o) => [o.check, o.host, o.reason]).sort(), [
    ['campus-application-path', 'alphahigh.school', OUT_OF_SCOPE_SITE], ['campus-page-grade-source-sync', 'alphahigh.school', OUT_OF_SCOPE_SITE], ['campus-school-schema', 'alphahigh.school', OUT_OF_SCOPE_SITE],
  ])
  assert.ok(!plan.decisionPending.some((d) => d.check === 'campus-page-grade-source-sync'))
  assert.ok(!plan.existing.some((e) => e.scopeKey === 'page:alphahigh.school'))
  // Shared leadership (registry/campus-leadership.json groups, Greater Boston): the Brandon Maddox card ("Director of Admissions - Boston/Lexington")
  // on Jamaica Plain and Lexington names a sibling campus by decision; the Lexington Miami classroom image under the same incident id is still a conflict.
  // Grounding restore: the image-identity row is enforced again (complaint: the San Juan and Lexington tickets), so the two Maddox cards are
  // exempted by the shared-leadership decision rather than counted as advisory; the exemption is exercised on the row directly below and in the CTA test.
  assert.deepEqual(plan.exempted.map((e) => [e.check, e.row, e.reason]), [
    ['campus-image-identity-conflict', 'site.identity.other-campus.images', 'Brandon Maddox is shared leadership for Greater Boston (boston, jamaica-plain, boston-suburbs); a card naming Alpha Boston on Alpha Jamaica Plain is the decided state'],
    ['campus-image-identity-conflict', 'site.identity.other-campus.images', 'Brandon Maddox is shared leadership for Greater Boston (boston, jamaica-plain, boston-suburbs); a card naming Alpha Boston on Alpha Lexington is the decided state'],
  ])
  assert.equal(plan.advisory.filter((a) => a.check === 'campus-image-identity-conflict').length, 0)
  const maddox = run.findings.filter((f) => f.check === 'campus-image-identity-conflict' && /Brandon Maddox/.test(JSON.stringify(f.actual)) && /(jamaica-plain|boston-suburbs)/.test(f.url))
  assert.deepEqual(maddox.map((f) => [sharedLeadershipExemption({ row: rowForCheck(checks, 'campus-image-identity-conflict'), finding: f })?.person, sharedLeadershipExemption({ row: rowForCheck(checks, 'campus-image-identity-conflict'), finding: f })?.sibling]), [['Brandon Maddox', 'boston'], ['Brandon Maddox', 'boston']])
  assert.ok(!plan.files.some((f) => f.title.startsWith('Alpha Jamaica Plain')), 'nothing files for the Jamaica Plain card')
  // The two open tickets the row's complaint cites are the dedupe matches, so nothing files twice; Raleigh has no ticket and files.
  assert.deepEqual(plan.existing.filter((e) => e.check === 'campus-image-identity-conflict').map((e) => [e.scopeKey, e.existing.id, e.existing.via]).sort(), [
    ['page:boston-suburbs', 'cmtmp92li000104jv69k570o0', 'observer-id'],
    ['page:san-juan', 'cmtma2lx3000204ldfmqby6x0', 'observer-id'],
  ])
  assert.deepEqual(plan.files.filter((f) => f.check === 'campus-image-identity-conflict').map((f) => f.scopeKey), ['page:raleigh'])
  assert.deepEqual(plan.files.filter((f) => f.check === 'campus-expired-seasonal-cta').map((f) => f.scopeKey).sort(), ['page:la-jolla', 'page:scottsdale'], 'the seasonal window is enforced again on the 2026-07-29 complaint')
  // Dedupe aliases: the calendar findings on Tulsa, South Bay LA and Oklahoma City match the tickets a sweep agent filed on 2026-09-21 under
  // checkId campus.resources.calendar-reachable; Lexington's calendar has no open ticket and files.
  assert.deepEqual(plan.existing.filter((e) => e.check === 'campus-calendar-link-reachable').map((e) => [e.scopeKey, e.existing.id, e.existing.via]).sort(), [
    ['page:oklahoma-city', 'cmubrl7xl00040agm0xm9zb0t', 'alias:checkId campus.resources.calendar-reachable'],
    ['page:south-bay-la', 'cmubrl9yp00050agmpisu3z6t', 'alias:checkId campus.resources.calendar-reachable'],
    ['page:tulsa', 'cmubrlbui00060agmr24zjcx9', 'alias:checkId campus.resources.calendar-reachable'],
  ])
  assert.ok(queue.filter((t) => t.customFields?.checkId === 'campus.resources.calendar-reachable').every((t) => t.createdAt.startsWith('2026-09-21')))
  assert.deepEqual(plan.files.filter((f) => f.check === 'campus-calendar-link-reachable').map((f) => f.scopeKey), ['page:boston-suburbs'])
  assert.ok(plan.existing.every((e) => e.existing.via), 'every dedupe says how it matched')
  assert.deepEqual(countBy(plan.existing, (e) => e.existing.via.split(' ')[0]), { 'observer-id': 12, 'alias:checkId': 3 }, 'three observer-id matches sit on source-digest rows since bundle 1.2; the two image-identity matches returned with the grounding restore')
  assert.equal(plan.counts.invalid, 0, 'a filed ticket never fails the contract')
  assert.ok(plan.existing.every((e) => queue.some((t) => t.id === e.existing.id)), 'every dedupe points at an open ticket')
  assert.deepEqual(plan.existing.filter((e) => e.check === 'campus-sister-brand-leak').map((e) => e.existing.id).sort(), ['cmtmrbhxo000304joy793zilx', 'cmttaplkg00020agmjj5l6kvs', 'cmtvz6lbr000004lakyoue9dx'])
  assert.equal(plan.existing.find((e) => e.check === 'public-event-sync').existing.id, 'cmuf1dfof00000agmkubu06ia')
  assert.deepEqual(plan.existing.filter((e) => e.check === 'campus-application-finalsite-redirect').map((e) => [e.key, e.existing.id]), [
    ['observer:campus.resources.apply.finalsite-redirect:program:program-26463204876', 'cmtxaucwp000104ijvl0dexr2'],
    ['observer:campus.resources.apply.finalsite-redirect:program:program-26445615147', 'cmtxaudtn000204iju8prg65a'],
  ], 'the finalsite redirect row is enforced, program-scoped, and dedupes against the observer\'s open tickets')
  // Grounding restore: the two seasonal and the Raleigh image-identity tickets file again beside the Lexington calendar link (their rows are
  // enforced on complaints); the two address conflicts stay on a source-digest row. Files keep the packet's order.
  assert.deepEqual(plan.files.map((f) => [f.check, f.scope, f.findings, f.owner.via, f.payload.status]), [
    ['campus-image-identity-conflict', 'page', 1, 'website-agent-operator', 'NOT_STARTED'],
    ['campus-expired-seasonal-cta', 'page', 1, 'website-agent-operator', 'NOT_STARTED'],
    ['campus-calendar-link-reachable', 'page', 1, 'website-agent-operator', 'NOT_STARTED'],
    ['campus-expired-seasonal-cta', 'page', 1, 'website-agent-operator', 'NOT_STARTED'],
  ])
  assert.ok(plan.files.every((f) => !/\bprogram-\d+/.test(f.title)), 'a title carries the campus display name, never a bare program id')
  const lexington = plan.files.find((f) => f.check === 'campus-calendar-link-reachable')
  assert.equal(lexington.title, 'Alpha Lexington: fails "Visible calendar destination answers 2xx logged out"')
  assert.equal(lexington.key, 'observer:campus.resources.calendar.reachable:page:boston-suburbs')
  assert.deepEqual(lexington.rows, ['campus.resources.calendar.reachable'])
  assert.match(lexington.payload.customFields.checkId, /^SITE-[0-9A-F]{10}$/, 'checkId is the lead observer id (APEX PR 409)')
  assert.equal(lexington.payload.customFields.triagedClass, 'link-cta')
  assert.equal(lexington.payload.customFields.observerIds.length, 1)
  assert.equal(lexington.payload.customFields.observerIds[0], lexington.payload.customFields.checkId)
  assert.equal(lexington.payload.customFields.source, 'agent-found')
  assert.equal(lexington.payload.customFields.filedBy, FILED_BY)
  assert.equal(lexington.payload.customFields.idempotencyKey, lexington.key)
  assert.equal(lexington.payload.customFields.requirementId, 'campus.resources.calendar.reachable')
  assert.equal(lexington.payload.customFields.checkBundleVersion, '1.11')
  assert.equal(lexington.payload.customFields.checkBundleSha256, checks.sha256)
  assert.equal(lexington.payload.customFields.filerRunId, RUN_ID)
  assert.ok(isFilerOwnedTask({ customFields: lexington.payload.customFields }), 'what the filer files, the filer may later close')
  assert.deepEqual(lexington.evidence, [], 'the static calendar finding has no browser screenshot claim')
  assert.equal(contractCheck({ ...lexington.payload, id: 'x', assignees: [{ name: 'Matt Barge' }] }).valid, true)
  assert.match(lexington.payload.description, /^Matt Barge: /)
  assert.match(lexington.payload.description, /\nSource: [^\n]*\(read 2026-09-24T/)
  assert.match(lexington.payload.description, /\nObserved: href https:\/\/drive\.google\.com\/file\/d\/[^,]+, status 404, finalUrl /)
  assert.match(lexington.payload.description, /\nExpected: HTTP 2xx calendar destination \(campus\.resources\.calendar; http-2xx 2 status-class; severity medium\)\n/)
  assert.match(lexington.payload.description, /\nPlaybook: campus\.resources\.calendar\.reachable \(requirement campus\.resources\.calendar, spec\/observer-check-map\.json requirements\/campus\.resources\.calendar\); check bundle 1\.11 row campus\.resources\.calendar\.reachable\n/)
  // Grounding restore: the Raleigh image-identity finding (the packet repeats one incident id nine times) is enforced again, so it groups into one ticket, never nine.
  assert.equal(plan.advisory.filter((a) => a.check === 'campus-image-identity-conflict').length, 0)
  const raleigh = plan.files.filter((f) => f.title.startsWith('Alpha Raleigh'))
  assert.equal(raleigh.length, 1)
  assert.equal(raleigh[0].findings, 1, 'one incident id, one finding on the ticket')
  assert.deepEqual(raleigh[0].rows, ['site.identity.other-campus.images'])
  for (const f of plan.files) {
    assert.ok(!/[\u2014\u2026]/.test(f.payload.title) && !/[\u2014\u2026]/.test(f.payload.description), `${f.key}: no em dash or ellipsis reaches a title or body`)
  }

  // A browser row with no complete desktop and mobile evidence pair is suppressed even when the browser reports healthy (PR 26).
  const missingScreenshots = syntheticRun({ pages: 2, screenshots: false, browser: 'healthy' })
  const withoutEvidence = planObserverFindings({ run: loadRunFolder(missingScreenshots.dir), bundle: checks, queue: [], now: NOW })
  assert.equal(withoutEvidence.counts.files, 0)
  assert.equal(withoutEvidence.suppressed.filter((item) => item.reason === 'required browser evidence missing').length, 4)
})

test('observer filer: 24 header-overlap findings across 12 pages and two viewports collapse to one template-scoped ticket; rows of different classes on one scope never merge', () => {
  const synthetic = syntheticRun()
  const run = loadRunFolder(synthetic.dir)
  assert.equal(run.health.source, 'health.json')
  assert.deepEqual(run.health.unhealthy, {})
  const plan = planObserverFindings({ run, bundle: bundle(), queue: [], now: NOW })
  assert.equal(plan.counts.findings, 24)
  assert.equal(plan.counts.groups, 1)
  assert.equal(plan.counts.files, 1, 'the decision ticket the row names is not open, so the row files')
  const [ticket] = plan.files
  assert.equal(ticket.key, 'observer:site.layout.header-overlap:template:campus', 'keyed on the row id minus its viewport suffix')
  assert.deepEqual(ticket.rows, ['site.layout.header-overlap.desktop', 'site.layout.header-overlap.mobile'], 'the desktop and mobile rows share the key and scope')
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
  assert.match(ticket.payload.description, /check bundle 1\.11 rows site\.layout\.header-overlap\.desktop, site\.layout\.header-overlap\.mobile\n/)
  assert.equal(ticket.payload.customFields.triagedClass, 'observer-layout')
  assert.equal(ticket.payload.customFields.checkId, oid('00D0000000'))
  assert.equal(ticket.payload.customFields.requirementId, 'site.layout.header-overlap')
  assert.deepEqual(ticket.payload.customFields.checkRowIds, ticket.rows)
  assert.equal(ticket.payload.customFields.dedupeScope, 'template')
  assert.equal(contractCheck({ ...ticket.payload, id: 'x', assignees: [{ name: 'Matt Barge' }] }).valid, true)
  assert.equal(ticket.evidence.length, 12, 'one pair per route')
  assert.ok(ticket.evidence.every((e) => e.complete))
  assert.equal(plan.counts.evidencePairs, 12)

  // An open ticket carrying any one of the 24 observer ids makes the whole scope a duplicate; an open decision ticket holds it.
  const deduped = planObserverFindings({ run, bundle: bundle(), queue: [{ id: 'cmopen1', status: 'BLOCKED', title: 'Alpha Atlanta: the header overlaps on mobile', url: 'https://alpha.school/atlanta/', customFields: { source: 'alpha-site-qc', check: 'campus-layout-header-overlap', checkId: oid('03A0000000') } }], now: NOW })
  assert.equal(deduped.counts.files, 0)
  assert.equal(deduped.existing[0].existing.id, 'cmopen1')
  const decided = planObserverFindings({ run, bundle: bundle(), queue: [{ id: 'cmtnl00rs000404l1ihl5ucij', status: 'BLOCKED', title: 'Alpha Atlanta: header overlap lead', url: 'https://alpha.school/atlanta/', customFields: { source: 'alpha-site-qc', check: 'campus-layout-header-overlap', checkId: oid('A71A47A001') } }], now: NOW })
  assert.equal(decided.counts.files, 0)
  assert.deepEqual(decided.decisionPending.map((d) => [d.key, d.findings, d.decisionTicket]), [['observer:site.layout.header-overlap:template:campus', 24, 'cmtnl00rs000404l1ihl5ucij']])

  // Finding 2: two findings on one page from rows of different classes (phone: observer-fact-sync; email: sync-delivery) share the
  // coarse requirement campus.facts.contact and the page scope, and still become two tickets.
  const page = 'https://alpha.school/campus-0/'
  const phoneMismatch = { loop: 'campus-truth', check: 'campus-page-phone-source-sync', entity: 'program-1000', field: 'phone', severity: 'high', title: 'Alpha Campus 0: page phone differs from HubSpot', actionable: true, url: page, expected: '(512) 555-0100', actual: { page: '(512) 555-0199', hubspot: '(512) 555-0100' }, expectedSource: 'HubSpot Programs contact_number', actualSource: 'page phone', id: oid('F0E0000001') }
  const emailMismatch = { loop: 'campus-truth', check: 'campus-page-email-source-sync', entity: 'program-1000', field: 'email', severity: 'high', title: 'Alpha Campus 0: page email differs from HubSpot', actionable: true, url: page, expected: 'campus0@alpha.school', actual: { page: 'old@alpha.school', hubspot: 'campus0@alpha.school' }, expectedSource: 'HubSpot Programs email', actualSource: 'page email', id: oid('F0E0000002') }
  const twoRows = syntheticRun({ pages: 0, extraFindings: [phoneMismatch, emailMismatch] })
  const split = planObserverFindings({ run: loadRunFolder(twoRows.dir), bundle: bundle(), queue: [], now: NOW })
  assert.equal(split.counts.groups, 2)
  assert.equal(split.counts.files, 2)
  assert.deepEqual(split.files.map((f) => [f.key, f.payload.customFields.triagedClass, f.payload.customFields.ownerRole]).sort(), [
    ['observer:campus.facts.email:page:campus-0', 'sync-delivery', 'n8n-sync-owner'],
    ['observer:campus.facts.phone:page:campus-0', 'observer-fact-sync', 'website-agent-operator'],
  ])
  // October 7 ownership correction: preserve the technical route, but block execution and ask the operator
  // to resolve the missing holder. Historical Cristi/Dmitry assignments must not be used as current owners.
  const unownedSync = split.files.find((f) => f.payload.customFields.triagedClass === 'sync-delivery')
  assert.equal(unownedSync.payload.status, 'BLOCKED')
  assert.equal(unownedSync.owner.escalated, true)
  assert.equal(unownedSync.owner.via, 'n8n-sync-owner -> website-agent-operator')
  assert.match(unownedSync.payload.description, /role n8n-sync-owner has no registered APEX user/)
  assert.ok(split.files.every((f) => f.payload.customFields.requirementId === rowKeyFor(rowForCheck(bundle(), f.check))))
  // While a ticket is open on one key, the other row on the same scope still files.
  const oneOpen = planObserverFindings({ run: loadRunFolder(twoRows.dir), bundle: bundle(), queue: [{ id: 'cmphone1', status: 'NOT_STARTED', title: 'Alpha Campus 0: fails "Phone matches HubSpot"', url: page, customFields: { source: 'agent-found', filerRunId: 'earlier', idempotencyKey: 'observer:campus.facts.phone:page:campus-0', observerIds: [oid('F0E0000001')] } }], now: NOW })
  assert.deepEqual(oneOpen.existing.map((e) => [e.check, e.existing.id]), [['campus-page-phone-source-sync', 'cmphone1']])
  assert.deepEqual(oneOpen.files.map((f) => f.check), ['campus-page-email-source-sync'])
  // The same shape on two source-digest rows of different classes (address agreement: observer-map-community, duplicate program id:
  // hubspot-data) files nothing at all: both findings become digest lines for their owner roles (bundle 1.2).
  const sheet = 'https://docs.google.com/spreadsheets/d/1t0fhwHz5Y2FvDvj2chRJGDrdcIco1ZADmkhAtRZTduM/edit'
  const addressConflict = { loop: 'campus-truth', check: 'operations-map-address-conflict', entity: 'program-77000000001', field: 'address', severity: 'high', title: 'Alpha Testville: Operations and map addresses differ', actionable: true, url: sheet, expected: '1 Main St', actual: { name: 'Alpha Testville', operations: '1 Main St', map: '2 Side St' }, expectedSource: 'Alpha & Specialty Schools National Growth Map', actualSource: 'production map API', sourceReadAt: '2026-09-24T14:30:00.000Z', id: oid('ADD0000001') }
  const duplicateId = { loop: 'campus-truth', check: 'duplicate-program-id', entity: 'program-77000000001', field: 'id', severity: 'high', title: 'Alpha Testville: two map records share one program id', actionable: true, url: sheet, expected: '1 record', actual: { name: 'Alpha Testville', records: 2 }, id: oid('D0B0000001') }
  const digested = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [addressConflict, duplicateId] }).dir), bundle: bundle(), queue: [{ id: 'cmaddr1', status: 'NOT_STARTED', title: 'Alpha Testville: fails "Operations address and map address agree"', url: sheet, customFields: { source: 'agent-found', filedBy: FILED_BY, filerRunId: 'earlier', idempotencyKey: 'observer:site.map.integrity.address-agreement:program:program-77000000001', observerIds: [oid('ADD0000001')] } }], now: NOW })
  assert.deepEqual([digested.counts.groups, digested.counts.files, digested.counts.existing, digested.counts.sourceDigest], [0, 0, 0, 2])
  assert.deepEqual(digested.sourceDigest.map((d) => [d.check, d.row, d.ownerRole, d.record, d.status]), [
    ['operations-map-address-conflict', 'site.map.integrity.address-agreement', 'operations-sheet-owner', 'Alpha Testville', 'enforced'],
    ['duplicate-program-id', 'site.map.integrity.program-id-unique', 'hubspot-program-admin', 'Alpha Testville', 'enforced'],
  ])
  assert.equal(digested.sourceDigest[0].audit, 'Operations address and map address agree | Alpha Testville | observed: name Alpha Testville, operations 1 Main St, map 2 Side St | expected: derived from operations-sheet address (normalize-address; city-only before opening is intentional) (equals 0 difference) | source: Alpha & Specialty Schools National Growth Map vs production map API (read 2026-09-24T14:30:00.000Z) | observer SITE-ADD0000001, row site.map.integrity.address-agreement, severity medium, run site-full-2026-09-24T14-28-40-974Z')
  assert.deepEqual(digested.unresolved.map((u) => [u.id, u.reason.split(':')[0]]), [['cmaddr1', 'source-digest row']], 'the ticket already open on that row is neither deduped against nor closed')
  const digestMd = renderSourceDigest({ ...digested, runId: RUN_ID, runCompletedAt: '2026-09-24T14:39:45.674Z', bundleVersion: '1.4', bundleSha256: 'a'.repeat(64) }, bundle())
  assert.match(digestMd, /^# Source digest: observer run site-full-2026-09-24T14-28-40-974Z\n\nRun completed 2026-09-24T14:39:45\.674Z; check bundle 1\.4 \(a{64}\); 2 findings on source-digest rows\./)
  assert.deepEqual(digestMd.split('\n').filter((l) => l.startsWith('## ')), ['## growth-map-owner: 0 findings', '## hubspot-program-admin (Farhan Raja): 1 finding', '## operations-sheet-owner (no registered person; Matt Barge as operator): 1 finding', '## community-app-owner: 0 findings'])

  // A loop-health finding that still arrives in findings.json is counted for the observer owner and files nothing; it suppresses
  // nothing here because the observer applies `suppresses` itself and reports the count in health.json suppressedByLoopHealth.
  const inspection = { loop: 'loop-health', check: 'route-browser-inspection', entity: 'campus-program-1003-mobile', field: 'inspection', severity: 'high', title: 'campus-program-1003 mobile inspection incomplete', actionable: true, url: 'https://alpha.school/campus-3/', expected: 'complete', actual: { domInspected: false }, id: oid('0BAD000001') }
  const partial = syntheticRun({ pages: 4, extraFindings: [inspection], healthExtra: { suppressedByLoopHealth: [{ id: oid('03A0000000'), by: oid('0BAD000001'), row: 'site.layout.header-overlap.mobile' }] } })
  const reported = planObserverFindings({ run: loadRunFolder(partial.dir), bundle: bundle(), queue: [], now: NOW })
  assert.deepEqual(reported.loopHealth.map((l) => l.check), ['route-browser-inspection'])
  assert.deepEqual(reported.suppressed, [])
  assert.equal(reported.counts.suppressedByObserver, 1)
  assert.deepEqual(reported.suppressedByObserver.items.map((i) => i.id), [oid('03A0000000')])
  assert.equal(reported.files[0].findings, 8, 'the packet\'s findings all file; the observer already withheld what its loop-health rows suppress')
  const counted = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 1, healthExtra: { suppressedByLoopHealth: 3 } }).dir), bundle: bundle(), queue: [], now: NOW })
  assert.deepEqual(counted.suppressedByObserver, { count: 3, items: null })
})

test('observer filer: advisory rows count, only degraded, failed, stale or suppressFindings sources suppress, conditions suppress, holds are the filer\'s only without a verified bundle, missing rows drop, malformed inputs fail closed', () => {
  const checks = bundle()
  // A browser-derived finding carries its screenshot claim; syntheticRun writes the desktop and mobile pair so PR 26's evidence gate is met.
  const imagesFinding = { loop: 'functional', check: 'images-render', entity: 'campus-program-1000-desktop', field: 'images', severity: 'high', title: 'Alpha Campus 0 has images that failed to render on desktop', actionable: true, url: 'https://alpha.school/campus-0/', expected: 'images render', actual: [{ src: 'a.jpg' }], id: oid('1A6E000001'), evidenceImages: [{ kind: 'screenshot', path: 'screenshots/campus-program-1000-desktop.png', route: 'campus-program-1000', viewport: 'desktop', url: 'https://alpha.school/campus-0/' }] }
  // Grounding restore: site.layout.images.render is enforced again on the Boston and Jamaica Plain complaints; the crop-risk row (decision-grounded, browser-dependent) still carries the source-health cases.
  const cropFinding = { ...imagesFinding, check: 'campus-image-crop-risk', field: 'crop', title: 'Alpha Campus 0 team card image crops the face on desktop', actual: [{ src: 'a.jpg', coverage: 0.5 }], id: oid('1A6E000002') }
  const imagesRow = checks.rows.find((r) => r.id === 'site.layout.images.render')
  assert.equal(imagesRow.status, 'enforced')
  assert.equal(imagesRow.advisoryReason, undefined, 'a grounded row carries no promotion-rule reason')
  assert.deepEqual(imagesRow.grounding, { kind: 'complaint', ref: 'APEX cmty8wn6a00000bgmvl2vv97t 2026-09-13 (Boston: a visible image failed to render) and cmty8wknh00000agmiv9t4g2g (Jamaica Plain)' })
  const imagesPlan = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [imagesFinding] }).dir), bundle: checks, queue: [], now: NOW })
  assert.deepEqual(imagesPlan.advisory, [], 'an enforced row files instead of counting as advisory')
  assert.equal(imagesPlan.counts.files, 1)
  assert.equal(imagesPlan.files[0].check, 'images-render')
  const degraded = syntheticRun({ pages: 0, browser: 'degraded', extraFindings: [cropFinding] })
  const byHealth = planObserverFindings({ run: loadRunFolder(degraded.dir), bundle: checks, queue: [], now: NOW })
  assert.equal(byHealth.counts.files, 0)
  assert.deepEqual(byHealth.suppressed, [{ id: oid('1A6E000002'), check: 'campus-image-crop-risk', row: 'site.layout.images.crop', reason: 'source health', sources: [{ source: 'browser', reportedAs: 'browser', status: 'degraded', reason: 'screenshot budget exhausted' }] }])
  // not-collected, optional and disabled measured nothing and suppress nothing; suppressFindings true does even when the status is unfamiliar.
  for (const status of ['not-collected', 'optional', 'disabled']) {
    const lenient = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, browser: status, extraFindings: [cropFinding] }).dir), bundle: checks, queue: [], now: NOW })
    assert.equal(lenient.counts.suppressed, 0, `${status} does not suppress`)
    assert.equal(lenient.counts.files, 1)
  }
  const flagged = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [cropFinding], healthSources: { browser: { status: 'partial', suppressFindings: true, reason: 'observer says so' } } }).dir), bundle: checks, queue: [], now: NOW })
  assert.deepEqual(flagged.suppressed.map((s) => [s.id, s.sources[0].status]), [[oid('1A6E000002'), 'partial']])
  assert.equal(suppressingStatus('failed'), 'failed')
  assert.equal(suppressingStatus({ status: 'stale' }), 'stale')
  assert.equal(suppressingStatus({ status: 'not-collected' }), null)
  assert.equal(suppressingStatus('disabled'), null)
  assert.equal(suppressingStatus({ suppressFindings: true }), 'suppressed')
  assert.deepEqual(Object.keys(normalizeHealth(null, { providers: { a: { status: 'failed' }, b: { status: 'disabled' }, c: { status: 'not-collected' }, d: { status: 'stale' } } }).unhealthy), ['a', 'd'])
  const allFailed = syntheticRun({ pages: 0, extraFindings: [{ ...imagesFinding, conditions: ['every-image-failed-in-run'] }] })
  const asLoopHealth = planObserverFindings({ run: loadRunFolder(allFailed.dir), bundle: checks, queue: [], now: NOW })
  assert.deepEqual(asLoopHealth.loopHealth.map((l) => l.row), ['site.loop.health.images-all-failed'], 'every image failing in a run is loop health, not a page defect')
  // A provider-health loop-health finding in the packet no longer suppresses anything in the filer (the observer's job); it is counted.
  const providerDown = { loop: 'loop-health', check: 'provider-health', entity: 'browser', field: 'status', severity: 'high', title: 'browser source collection degraded', actionable: true, expected: 'healthy', actual: 'degraded', id: oid('0BAD000002') }
  const withProvider = syntheticRun({ pages: 0, extraFindings: [providerDown, cropFinding] })
  const byProvider = planObserverFindings({ run: loadRunFolder(withProvider.dir), bundle: checks, queue: [], now: NOW })
  assert.deepEqual(byProvider.loopHealth.map((l) => l.check), ['provider-health'])
  assert.equal(byProvider.counts.suppressed, 0)
  assert.equal(byProvider.counts.files, 1)

  const eventFinding = { loop: 'event-truth', check: 'public-event-sync', entity: 'hubspot-event-1', field: 'presence', severity: 'high', title: 'Alpha Austin Open House is public in HubSpot, but missing from the website.', actionable: true, url: 'https://app.hubspot.com/contacts/1/record/0-54/1', expected: 'event on /upcoming-events/', actual: { hubspot: 'public' }, id: oid('E0E0000001') }
  const advisoryFinding = { loop: 'functional', check: 'campus-layout-clipped-text', entity: 'campus-program-1000-mobile', field: 'layout', severity: 'advisory', title: 'clipped', actionable: false, url: 'https://alpha.school/campus-0/', expected: 'not clipped', actual: [], id: oid('AD00000001') }
  const capture = { loop: 'functional', check: 'route-screenshot-capture', entity: 'home-desktop', field: 'screenshot', severity: 'advisory', title: 'capture', actionable: false, url: 'https://alpha.school/', expected: 'captured', actual: 'page.screenshot: Timeout 10000ms exceeded', id: oid('7E10000001') }
  const unknown = { loop: 'functional', check: 'not-a-check-yet', entity: 'home-desktop', field: 'x', severity: 'advisory', title: 'new', actionable: false, url: 'https://alpha.school/', expected: 'y', actual: 'z', id: oid('7E10000002') }
  const retiredFinding = { loop: 'functional', check: 'primary-cta-count', entity: 'home-desktop', field: 'cta', severity: 'advisory', title: 'ctas', actionable: false, url: 'https://alpha.school/', expected: '1', actual: 2, id: oid('0E70000001') }
  const timeout = { loop: 'functional', check: 'route-reachable', entity: 'campus-program-1000', field: 'status', severity: 'high', title: 'Alpha Campus 0 timed out', actionable: true, url: 'https://alpha.school/campus-0/', expected: 'HTTP 2xx', actual: { status: 'timeout' }, id: oid('0770000001') }
  const timeoutTwice = { ...timeout, entity: 'campus-program-1001', url: 'https://alpha.school/campus-1/', title: 'Alpha Campus 1 timed out', id: oid('0770000002') }
  const timeoutOld = { ...timeout, entity: 'campus-program-1002', url: 'https://alpha.school/campus-2/', title: 'Alpha Campus 2 timed out', id: oid('0770000003') }
  const timeoutHistory = { ...timeout, entity: 'campus-program-1003', url: 'https://alpha.school/campus-3/', title: 'Alpha Campus 3 timed out', id: oid('0770000004') }
  const ended = { ...eventFinding, id: oid('E0E0000002'), entity: 'hubspot-event-2', title: 'Alpha Austin Past Event is public in HubSpot, but missing from the website.', actual: { hubspot: 'public', endsAt: '2026-09-20T00:00:00Z' } }
  const mixedIncidents = [
    { ...eventFinding, status: 'active', firstSeenAt: '2026-09-24T13:30:00.000Z', lastRunId: RUN_ID, occurrences: 1, cleanRuns: 0 },
    { ...ended, status: 'active', firstSeenAt: '2026-09-01T00:00:00.000Z', lastRunId: RUN_ID, occurrences: 40, cleanRuns: 0 },
    { ...timeout, status: 'active', firstSeenAt: '2026-09-24T14:39:00.000Z', lastRunId: RUN_ID, occurrences: 1, cleanRuns: 0 },
    { ...timeoutTwice, status: 'active', firstSeenAt: '2026-09-24T02:00:00.000Z', lastRunId: RUN_ID, occurrences: 2, cleanRuns: 0, consecutiveFailingRuns: 2 },
    // Seen 40 times over its life but not in the run before this one: lifetime occurrences never satisfy the hold.
    { ...timeoutOld, status: 'active', firstSeenAt: '2026-08-01T00:00:00.000Z', lastRunId: RUN_ID, occurrences: 40, cleanRuns: 0, consecutiveFailingRuns: 1 },
    // No consecutiveFailingRuns (an older observer) but the incident's run history names the manifest's previous run.
    { ...timeoutHistory, status: 'active', firstSeenAt: '2026-09-24T02:00:00.000Z', lastRunId: RUN_ID, occurrences: 2, cleanRuns: 0, runIds: [PREVIOUS_RUN_ID, RUN_ID] },
  ]
  const mixed = syntheticRun({ pages: 0, extraFindings: [eventFinding, ended, advisoryFinding, capture, unknown, retiredFinding, timeout, timeoutTwice, timeoutOld, timeoutHistory], extraIncidents: mixedIncidents, manifestExtra: { previousRunId: PREVIOUS_RUN_ID } })
  const plan = planObserverFindings({ run: loadRunFolder(mixed.dir), bundle: checks, queue: [], now: NOW })
  assert.equal(plan.counts.files, 2, 'the timeout seen in two consecutive runs and the one whose history names the previous run file')
  assert.deepEqual(plan.files.map((f) => f.observerIds).sort(), [[oid('0770000002')], [oid('0770000004')]])
  assert.deepEqual(plan.held.map((h) => [h.id, h.reason, h.gracePeriodHours ?? h.requireConsecutiveRuns, h.ageHours ?? h.observations, h.basis]), [
    [oid('E0E0000001'), 'grace period', 4, 2.5, undefined],
    [oid('0770000001'), 'consecutive runs', 2, 1, `previous run ${PREVIOUS_RUN_ID} not in the incident history`],
    [oid('0770000003'), 'consecutive runs', 2, 1, 'incident consecutiveFailingRuns'],
  ], 'an event public for 2.5 hours waits for the 4-hour import window; a first timeout waits for a second run; 40 lifetime occurrences do not count')
  assert.deepEqual(plan.suppressed.map((s) => [s.id, s.reason, s.conditions]), [[oid('E0E0000002'), 'condition', ['event-ended']]], 'a past event never files')
  assert.deepEqual(plan.advisory.map((a) => a.id), [oid('AD00000001')])
  assert.deepEqual(plan.loopHealth.map((l) => [l.id, l.row]), [[oid('7E10000001'), 'site.loop.health.route-screenshot-capture']], 'a screenshot capture failure is loop health, not telemetry to drop')
  assert.deepEqual(plan.dropped.map((d) => [d.id, d.reason.split(':')[0]]), [[oid('7E10000002'), 'no row in the check bundle (telemetry)'], [oid('0E70000001'), 'retired']])
  const later = planObserverFindings({ run: loadRunFolder(mixed.dir), bundle: checks, queue: [], now: new Date('2026-09-24T18:00:00Z') })
  assert.equal(later.counts.files, 3)
  const event = later.files.find((f) => f.key === 'observer:site.events.sync.public:events')
  assert.equal(event.owner.name, 'Garbhit Sharma')
  assert.match(event.payload.description, /\nEvents \(1\): Alpha Austin Open House is public in HubSpot, but missing from the website\./)
  assert.equal(event.payload.url, 'https://app.hubspot.com/contacts/1/record/0-54/1', 'the ticket URL is the observer\'s record when there is no public page')
  assert.equal(event.payload.customFields.pageUrl, '')

  // Coordinator (c): a packet from an observer that ran a verified copy of this bundle already applied the holds; the filer does not re-apply them.
  const verified = syntheticRun({ pages: 0, extraFindings: [eventFinding, timeout], extraIncidents: mixedIncidents.slice(0, 3), manifestExtra: { checkBundle: { status: 'verified', version: checks.version, sha256: checks.sha256 } } })
  const trusted = planObserverFindings({ run: loadRunFolder(verified.dir), bundle: checks, queue: [], now: NOW })
  assert.match(trusted.holds, /^observer \(manifest\.checkBundle verified/)
  assert.equal(trusted.counts.held, 0)
  assert.equal(trusted.counts.files, 2, 'the observer already held what its bundle says to hold; what it emits files')
  const otherBundle = syntheticRun({ pages: 0, extraFindings: [eventFinding, timeout], extraIncidents: mixedIncidents.slice(0, 3), manifestExtra: { checkBundle: { status: 'verified', version: checks.version, sha256: 'a'.repeat(64) } } })
  assert.equal(planObserverFindings({ run: loadRunFolder(otherBundle.dir), bundle: checks, queue: [], now: NOW }).counts.held, 2, 'a verified but different bundle does not stand in for this one')
  const unverified = syntheticRun({ pages: 0, extraFindings: [eventFinding, timeout], extraIncidents: mixedIncidents.slice(0, 3), manifestExtra: { checkBundle: { status: 'unverified', sha256: checks.sha256 } } })
  assert.equal(planObserverFindings({ run: loadRunFolder(unverified.dir), bundle: checks, queue: [], now: NOW }).counts.held, 2)
  assert.equal(observerHoldsApply({ checkBundle: { status: 'verified' } }, checks), true, 'a verified record without a sha is trusted')
  assert.equal(observerHoldsApply({}, checks), false)
  assert.deepEqual(consecutiveFailingRuns(null, {}), { runs: 1, basis: 'first seen in this run' })
  assert.deepEqual(consecutiveFailingRuns({ consecutiveFailingRuns: 3, occurrences: 90 }, {}), { runs: 3, basis: 'incident consecutiveFailingRuns' })
  assert.equal(consecutiveFailingRuns({ occurrences: 90 }, {}).runs, 1, 'lifetime occurrences never count')
  assert.equal(consecutiveFailingRuns({ occurrences: 90, history: [{ runId: PREVIOUS_RUN_ID }] }, { previousRunId: PREVIOUS_RUN_ID }).runs, 2)
  assert.equal(consecutiveFailingRuns({ occurrences: 90, runIds: ['site-full-old'] }, { previousRunId: PREVIOUS_RUN_ID }).runs, 1)

  // Rows, keys, owners, facts, health.
  assert.equal(rowForCheck(checks, 'campus-layout-clipped-text').status, 'advisory')
  assert.equal(rowForCheck(checks, 'nope'), null)
  assert.equal(rowForFinding(checks, headerOverlapFinding(0, 'mobile')).id, 'site.layout.header-overlap.mobile')
  assert.equal(rowForFinding(checks, headerOverlapFinding(0, 'desktop')).id, 'site.layout.header-overlap.desktop')
  assert.equal(rowForFinding(checks, imagesFinding).id, 'site.layout.images.render')
  assert.equal(rowForFinding(checks, { ...imagesFinding, conditions: ['every-image-failed-in-run'] }).id, 'site.loop.health.images-all-failed')
  assert.equal(rowKeyFor({ id: 'site.layout.header-overlap.mobile' }), 'site.layout.header-overlap')
  assert.equal(rowKeyFor({ id: 'site.layout.images.render' }), 'site.layout.images.render')
  const finalsite = rowForCheck(checks, 'campus-application-finalsite-redirect')
  assert.deepEqual([finalsite.id, finalsite.status, finalsite.ticketClass, finalsite.ownerRole, finalsite.dedupeScope], ['campus.resources.apply.finalsite-redirect', 'enforced', 'observer-link-cta', 'hubspot-program-admin', 'program'])
  assert.equal(rowForCheck(checks, 'route-screenshot-capture').channel, 'loop-health')
  assert.equal(rowForCheck(checks, 'route-font-readiness').channel, 'loop-health')
  assert.deepEqual([rowForCheck(checks, 'campus-page-email-source-sync').status, rowForCheck(checks, 'campus-page-email-source-sync').ticketClass], ['enforced', 'sync-delivery'])
  assert.equal(rowForCheck(checks, 'campus-grade-source-incomplete').status, 'advisory', 'telemetry only until the grade-source decision')
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
  // Observer ids: SITE- plus exactly ten hex characters, the observer's own shape; anything else on a ticket is not an observer id.
  assert.deepEqual(observerIdsForTask({ title: 'x', description: 'Observer ID: SITE-ABCDEF1234\nsee SITE-OBSERVER and SITE-ABCDEF12345 and SITE-ABCDEF12', customFields: { checkId: 'observer-layout', observerIds: ['SITE-00000000AA'], externalId: 'alpha-site-observer:SITE-ABCDEF1234' } }), ['SITE-00000000AA', 'SITE-ABCDEF1234'])
  assert.deepEqual(observerIdsForTask({ customFields: { checkId: 'SITE-HO00D000000' } }), [], 'eleven characters with non-hex letters is not the observer\'s id')
  assert.equal(isObserverId('SITE-7B2F6597C8'), true)
  assert.equal(isObserverId('site-7b2f6597c8'), true)
  assert.equal(isObserverId('SITE-7B2F6597C'), false)
  assert.equal(isObserverId('sync-mapping'), false)
  assert.equal(OBSERVER_ID.source, '\\bSITE-[0-9A-F]{10}\\b')
  assert.deepEqual(ownerFor({ roleOwners: { 'website-agent-operator': [{ name: 'Matt Barge', apexUserId: 'u1' }] }, roleFallback: {} }, 'nobody'), { id: 'u1', name: 'Matt Barge', role: 'website-agent-operator', via: 'nobody -> website-agent-operator', escalated: true })
  assert.deepEqual(ownerFor({ roleOwners: { a: [{ name: 'A' }], b: [{ name: 'B', apexUserId: 'u2' }] }, roleFallback: { a: 'b' } }, 'a'), { id: 'u2', name: 'B', role: 'b', via: 'a -> b', escalated: false })
  assert.equal(formatFact({ source: 'map', id: 'program-1', name: 'Alpha Richmond', empty: '' }), 'source map, id program-1, name Alpha Richmond')
  assert.equal(formatFact([1, 2, 3, 4, 5]), '1; 2; 3 (+2 more)')
  assert.equal(formatFact(null), 'n/a')
  assert.equal(formatFact({ href: null }), 'href empty', 'a missing CTA still gets an Observed line')
  // A record inside a list inside the fact keeps its values (2026-09-25: the Observed line for campus-application-source-missing printed "text, href").
  const applyFact = { applyLinks: [{ text: 'APPLY NOW', href: 'https://alpha.school/application/?submission_campus=greenwich' }], placeholderLinks: [], admissionLink: null, finalsiteBaseUrl: 'https://armonk-greenwich-alpha.fsenrollment.com/', admissionsHandledInFinalsite: true }
  assert.equal(formatFact(applyFact), 'applyLinks text APPLY NOW, href https://alpha.school/application/?submission_campus=greenwich, placeholderLinks none, finalsiteBaseUrl https://armonk-greenwich-alpha.fsenrollment.com/, admissionsHandledInFinalsite true')
  assert.equal(formatFact({ a: [{ b: { c: 1, d: 'x' }, e: 'kept' }] }), 'a b, e kept', 'a record nested a level deeper still shows only its key')
  const greenwich = loadRunFolder(path.join(fixtures, 'run-2026-09-24')).findings.find((f) => f.check === 'campus-application-source-missing' && /greenwich/.test(f.url))
  const applyRow = rowForCheck(bundle(), 'campus-application-source-missing')
  const applyContract = buildContract({ row: applyRow, group: { key: 'k', row: applyRow, rows: [applyRow], findings: [greenwich], pages: ['https://alpha.school/greenwich/'] }, run: loadRunFolder(path.join(fixtures, 'run-2026-09-24')), bundle: bundle(), owner: ownerFor(loadPolicyBundle(), applyRow.ownerRole), policy: loadPolicyBundle(), now: NOW })
  assert.equal(applyContract.observed, 'applyLinks text APPLY NOW, href https://alpha.school/application/?submission_campus=greenwich, placeholderLinks none, finalsiteBaseUrl https://armonk-greenwich-alpha.fsenrollment.com/, admissionsHandledInFinalsite true')
  assert.equal(formatFact({}), 'empty')
  assert.equal(formatFact('Alpha Austin — the header overlaps…'), 'Alpha Austin; the header overlaps...', 'an em dash or ellipsis in an observer value never reaches a body')
  assert.equal(cleanText('a—b — c…'), 'a; b; c...')
  assert.deepEqual(normalizeHealth(null, { providers: { map: { status: 'failed', error: 'timeout' }, ok: { status: 'healthy' } } }), { source: 'manifest.providers', unhealthy: { map: { status: 'failed', reason: 'timeout' } }, snapshots: {}, suppressedByLoopHealth: { count: 0, items: null, reported: false } })
  const mapRow = rowForCheck(checks, 'map-campus-missing-from-operations')
  assert.deepEqual(unhealthyDependencies(mapRow, checks, normalizeHealth(null, { providers: { map: { status: 'failed', error: 'timeout' } } })).map((u) => [u.source, u.reportedAs]), [['growth-map-api', 'map']], 'a sourceHealth id is matched through its provider entity (map-api) and the manifest name (map)')
  assert.deepEqual(unhealthyDependencies(mapRow, checks, normalizeHealth(null, { providers: { 'campus-operations': { status: 'healthy', extractedAt: '2026-09-01T00:00:00Z' } } }), NOW).map((u) => [u.source, u.status]), [['operations-sheet', 'stale']], 'a snapshot older than staleAfterHours is loop health')
  assert.equal(DEFAULT_CLEAR_AFTER_RUNS, 2)

  // Fail closed: a malformed row, a wrong scope, a packet without incidents.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-observer-filer-bad-'))
  const badBundle = path.join(tmp, 'bundle.json')
  fs.writeFileSync(badBundle, JSON.stringify({ rows: [{ id: 'r1', observerCheck: 'x', status: 'enforced', dedupeScope: 'galaxy', channel: 'slack' }] }))
  assert.throws(() => loadCheckBundle(badBundle), (e) => e instanceof ObserverFilerError && e.code === 'BAD_BUNDLE' && /missing title/.test(e.message) && e.problems.some((p) => /dedupeScope must be one of page, template, program, event, site, campus-registry, got galaxy/.test(p)) && e.problems.some((p) => /channel must be ticket, source-digest or loop-health/.test(p)))
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

test('observer filer: the auto-resolve guard closes only the filer\'s own NOT_STARTED or agent-blocked tickets, and a clear is only a clean-run clear', () => {
  const decisionTickets = new Set(['cmdecision1'])
  const escalation = 'Owner: elementor-owner (Matt Barge); role elementor-owner has no registered APEX user; escalated to Matt Barge (website-agent-operator) per protocol 1d'
  const base = { id: 'cmt1', status: 'NOT_STARTED', title: 'x', description: 'Matt Barge: fix it\nPage: https://alpha.school/x/', customFields: { source: 'agent-found', filedBy: FILED_BY, filerRunId: RUN_ID, checkId: oid('0000000001') } }
  const ok = (t) => resolveEligibility(t, { decisionTickets })
  assert.deepEqual(ok(base), { eligible: true, filedBy: 'filer' })
  // Provenance first (PR 26): a legacy observer ticket, a sweep agent's find, or a filer marker without a run id is never the filer's to close.
  assert.equal(ok({ ...base, customFields: { source: 'alpha-site-qc', checkId: oid('0000000001') } }).reason, NOT_FILER_OWNED, 'the observer\'s own tickets are a person\'s')
  assert.equal(ok({ ...base, customFields: { source: 'agent-found', checkId: oid('0000000001') } }).reason, NOT_FILER_OWNED, 'a sweep agent\'s find is not the filer\'s')
  assert.equal(ok({ ...base, customFields: { ...base.customFields, filerRunId: ' ' } }).reason, NOT_FILER_OWNED)
  assert.equal(ok({ ...base, customFields: { ...base.customFields, filedBy: 'agent/file-found-ticket.mjs' } }).reason, NOT_FILER_OWNED, 'the exact filedBy marker, nothing looser')
  assert.equal(isFilerOwnedTask(base), true)
  assert.equal(isFilerOwnedTask({ customFields: { source: 'alpha-site-qc', checkId: oid('0000000001'), filerRunId: RUN_ID } }), false)
  for (const status of ['FOR_REVIEW', 'MISSING_INFO', 'IN_PROGRESS', 'TESTING', 'APPROVED']) assert.match(ok({ ...base, status }).reason, new RegExp(`^status ${status} belongs to a person`))
  assert.match(ok({ ...base, id: 'cmdecision1' }).reason, /^a check row waits on this ticket \(decisionPending\)/)
  assert.match(ok({ ...base, description: `${base.description}\n\nOPERATOR INSTRUCTION (Matt Barge, 2026-09-20): leave this open` }).reason, /^carries an instruction line \("OPERATOR INSTRUCTION/)
  assert.match(ok({ ...base, description: `${base.description}\n<p>CORRECTION: the class is hubspot-data</p>` }).reason, /^carries an instruction line \("CORRECTION: the class is hubspot-data"\)$/)
  assert.match(ok({ ...base, description: `${base.description}\nBLOCKED (intake 0.2, 2026-09-20)\nDECISION NEEDED: who owns elementor-owner` }).reason, /^carries an instruction line \("DECISION NEEDED: who owns elementor-owner"\)$/)
  assert.match(ok({ ...base, comments: [{ body: 'DECISION NEEDED: keep or drop the pin' }] }).reason, /^carries an instruction line/, 'a comment counts')
  assert.match(ok({ ...base, agentInstructions: [{ status: 'PENDING', body: 'OPERATOR INSTRUCTION: hold' }] }).reason, /^carries an instruction line/)
  assert.equal(instructionLine({ description: 'Nothing to see: a correction was applied, decision needed later' }), null, 'only a line that starts with the heading counts')
  // BLOCKED: only the filer's own protocol 1d escalation (created BLOCKED, escalation line in the body) or intake's block, and no person wrote on it since.
  assert.match(ok({ ...base, status: 'BLOCKED' }).reason, /^BLOCKED by a person, not by intake or the filer$/)
  assert.deepEqual(ok({ ...base, status: 'BLOCKED', description: `${base.description}\n${escalation}` }), { eligible: true, filedBy: 'filer' })
  assert.deepEqual(ok({ ...base, status: 'BLOCKED', customFields: { ...base.customFields, intakeHash: 'abc' } }), { eligible: true, filedBy: 'filer' })
  assert.match(ok({ ...base, status: 'BLOCKED', description: `${base.description}\n${escalation}\n\nBLOCKED (Yash Chitneni, 2026-09-21)\nWaiting on the campus lead.` }).reason, /^BLOCKED with a human note \(BLOCKED \(Yash Chitneni, 2026-09-21\)\)$/)
  assert.match(ok({ ...base, status: 'BLOCKED', description: `${base.description}\n${escalation}`, comments: [{ body: 'holding' }] }).reason, /^BLOCKED with a human note \(1 comment on the ticket\)$/)
  assert.deepEqual(ok({ ...base, status: 'BLOCKED', customFields: { ...base.customFields, intakeHash: 'abc' }, description: `${base.description}\n\nBLOCKED (intake 0.2, 2026-09-21)\nrole elementor-owner has no registered APEX user` }), { eligible: true, filedBy: 'filer' }, 'intake\'s own note is not a human note')
  // Clean-run clears only.
  assert.equal(isCleanRunClear({ status: 'resolved', cleanRuns: 3 }, 2), true)
  assert.equal(isCleanRunClear({ status: 'resolved', cleanRuns: 1 }, 2), false)
  assert.equal(isCleanRunClear({ status: 'resolved', cleanRuns: 118, resolutionReason: 'superseded-evidence-version' }, 2), false, 'an evidence-version bump is never a clear, however many clean runs followed')
  assert.equal(isCleanRunClear({ status: 'resolved', cleanRuns: 9, resolutionReason: 'manual' }, 2), false)
  assert.equal(isCleanRunClear({ status: 'active', cleanRuns: 9 }, 2), false)
  // Shared 409 predicate (agent/apex-errors.mjs): the filer's export is the same function intake uses, in every shape APEX answers.
  assert.equal(isFilerOwnedConflict, sharedPredicate)
  const err = (extra) => Object.assign(new Error('APEX PATCH /tasks/x 409'), { status: 409 }, extra)
  assert.equal(isFilerOwnedConflict(err({ code: FILER_OWNED_CODE })), true, 'top-level code copied onto the error')
  assert.equal(isFilerOwnedConflict(err({ body: { code: FILER_OWNED_CODE } })), true)
  assert.equal(isFilerOwnedConflict(err({ body: { error: { code: FILER_OWNED_CODE, message: 'owned' } } })), true, 'nested error.code')
  assert.equal(isFilerOwnedConflict(err({ body: { error: 'OBSERVER_FILER_OWNED: the filer owns this ticket' } })), true, 'message text')
  assert.equal(isFilerOwnedConflict(Object.assign(new Error('APEX PATCH 409: {"code":"OBSERVER_FILER_OWNED"}'), { status: 409 })), true)
  assert.equal(isFilerOwnedConflict(err({ body: { code: 'VERSION_CONFLICT' } })), false)
  assert.equal(isFilerOwnedConflict(Object.assign(new Error('x'), { status: 500, code: FILER_OWNED_CODE })), false, 'never on another status')
  assert.equal(isFilerOwnedConflict(null), false)
})

test('observer filer: --apply creates, assigns, attaches the evidence pair, completes cleared tickets from the live ticket with one v1 PATCH behind a client-side stale guard, skips what moved or is filer-owned, and logs every write', async () => {
  const cleared = { loop: 'functional', check: 'campus-layout-horizontal-overflow', entity: 'campus-program-2000-mobile', field: 'layout', severity: 'high', title: 'Alpha Old overflows', url: 'https://alpha.school/old/', id: oid('01DC1EA001'), status: 'resolved', firstSeenAt: '2026-09-01T00:00:00.000Z', lastSeenAt: '2026-09-20T00:00:00.000Z', lastRunId: 'site-full-2026-09-20T00-00-00-000Z', resolvedAt: '2026-09-22T00:00:00.000Z', resolvedByRunId: 'site-full-2026-09-22T00-00-00-000Z', occurrences: 4, cleanRuns: 3, reopenedCount: 0 }
  const clearedByFiler = { ...cleared, entity: 'campus-program-2001-mobile', url: 'https://alpha.school/older/', id: oid('01DC1EA002'), cleanRuns: 2 }
  const clearedSecond = { ...cleared, entity: 'campus-program-2002-mobile', url: 'https://alpha.school/second/', id: oid('01DC1EA003') }
  const clearedForReview = { ...cleared, entity: 'campus-program-2006-mobile', url: 'https://alpha.school/review/', id: oid('01DC1EA007') }
  const clearedWithNote = { ...cleared, entity: 'campus-program-2003-mobile', url: 'https://alpha.school/noted/', id: oid('01DC1EA004') }
  const clearedInstruction = { ...cleared, entity: 'campus-program-2004-mobile', url: 'https://alpha.school/instructed/', id: oid('01DC1EA005') }
  const superseded = { ...cleared, entity: 'campus-program-2005-mobile', url: 'https://alpha.school/superseded/', id: oid('01DC1EA006'), cleanRuns: 40, resolutionReason: 'superseded-evidence-version' }
  const synthetic = syntheticRun({ pages: 2, extraIncidents: [cleared, clearedByFiler, clearedSecond, clearedForReview, clearedWithNote, clearedInstruction, superseded] })
  const filerFields = (extra) => ({ source: 'agent-found', filedBy: FILED_BY, filerRunId: 'site-full-2026-09-19T00-00-00-000Z', triagedClass: 'observer-layout', ...extra })
  const escalation = 'Owner: elementor-owner (Matt Barge); role elementor-owner has no registered APEX user; escalated to Matt Barge (website-agent-operator) per protocol 1d'
  const queue = [
    // A legacy observer ticket: cleared, but never the filer's to close (PR 26).
    { id: 'cmold1', title: 'Alpha Old: overflows on mobile', status: 'NOT_STARTED', updatedAt: '2026-09-20T10:00:00.000Z', url: 'https://alpha.school/old/', agentStatus: 'BLOCKED', description: 'Requester text first.\nPage: https://alpha.school/old/', customFields: { source: 'alpha-site-qc', check: 'campus-layout-horizontal-overflow', checkId: oid('01DC1EA001'), history: ['filed'] } },
    { id: 'cmfiler1', title: 'Alpha Older: fails "No horizontal overflow"', status: 'BLOCKED', updatedAt: '2026-09-21T10:00:00.000Z', url: 'https://alpha.school/older/', agentStatus: null, description: `Matt Barge: fix it\n${escalation}`, customFields: filerFields({ checkId: oid('01DC1EA002'), idempotencyKey: 'observer:site.layout.horizontal-overflow:page:older', observerIds: [oid('01DC1EA002')], history: ['filed'] }) },
    { id: 'cmfiler2', title: 'Alpha Second: fails "No horizontal overflow"', status: 'NOT_STARTED', updatedAt: '2026-09-21T11:00:00.000Z', url: 'https://alpha.school/second/', description: 'Matt Barge: fix it', customFields: filerFields({ checkId: oid('01DC1EA003'), idempotencyKey: 'observer:site.layout.horizontal-overflow:page:second', observerIds: [oid('01DC1EA003')] }) },
    { id: 'cmreview1', title: 'Alpha Review: overflows on mobile', status: 'FOR_REVIEW', url: 'https://alpha.school/review/', description: 'x', customFields: filerFields({ checkId: oid('01DC1EA007') }) },
    { id: 'cmnoted1', title: 'Alpha Noted: overflows on mobile', status: 'BLOCKED', url: 'https://alpha.school/noted/', description: `x\n${escalation}\n\nBLOCKED (Yash Chitneni, 2026-09-21)\nwaiting on design`, customFields: filerFields({ checkId: oid('01DC1EA004') }) },
    { id: 'cminstr1', title: 'Alpha Instructed: overflows on mobile', status: 'NOT_STARTED', url: 'https://alpha.school/instructed/', description: 'x\nCORRECTION: keep open until the template ships', customFields: filerFields({ checkId: oid('01DC1EA005') }) },
    { id: 'cmsuper1', title: 'Alpha Superseded: overflows on mobile', status: 'NOT_STARTED', url: 'https://alpha.school/superseded/', description: 'x', customFields: filerFields({ checkId: oid('01DC1EA006') }) },
  ]
  const plan = planObserverFindings({ run: loadRunFolder(synthetic.dir), bundle: bundle(), queue, now: NOW })
  assert.equal(plan.counts.files, 1)
  assert.deepEqual(plan.resolves.map((r) => [r.id, r.filedBy]), [['cmfiler1', 'filer'], ['cmfiler2', 'filer']])
  assert.equal(plan.unresolved.find((r) => r.id === 'cmold1')?.reason, NOT_FILER_OWNED)
  assert.deepEqual(plan.needsPerson.map((n) => [n.id, n.reason.replace(/ \(.*$/, '')]), [
    ['cmreview1', 'cleared but needs a person: status FOR_REVIEW belongs to a person'],
    ['cmnoted1', 'cleared but needs a person: BLOCKED with a human note'],
    ['cminstr1', 'cleared but needs a person: carries an instruction line'],
    ['cmsuper1', 'resolved by the observer without a clean-run clear'],
  ])
  for (const r of plan.resolves) assert.deepEqual(Object.keys(r.patch).sort(), ['customFields', 'description', 'resolutionKind', 'status'], 'no agentStatus, no agentEligible, no expectedUpdatedAt (APEX v1 PATCH answers 400 Unsupported task field)')
  assert.deepEqual(plan.resolves[0].cleared.clearingRunIds, ['site-full-2026-09-22T00-00-00-000Z', RUN_ID])
  assert.equal(plan.resolves[0].updatedAt, '2026-09-21T10:00:00.000Z', 'what the stale guard compares the live ticket against')
  assert.equal(plan.resolves[0].patch.customFields.requirementId, 'site.layout.horizontal-overflow')
  assert.deepEqual(plan.resolves[0].patch.customFields.history, ['filed', `2026-09-24 agent/file-observer-findings.mjs ${FILER_VERSION}: completed, check cleared on site-full-2026-09-22T00-00-00-000Z, ${RUN_ID}`])

  const calls = []
  const live = new Map(queue.map((t) => [t.id, { ...t, customFields: { ...t.customFields, assigneeNote: 'seen by the live GET' } }]))
  const apex = {
    token: 'operator-key', v1Base: 'http://127.0.0.1:4010/api/v1', agentBase: 'http://127.0.0.1:4010/api/agent',
    get: async (id) => { calls.push(['get', id]); return live.get(id) },
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
  const result = await applyPlan(plan, { apex, fetchImpl, log: (l) => logs.push(l), writesFile, now: NOW })
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.skipped, [])
  assert.deepEqual(result.filed, [{ id: 'cmnew1', key: 'observer:site.layout.header-overlap:template:campus', title: plan.files[0].title }])
  assert.deepEqual(result.resolved, [{ id: 'cmfiler1', status: 'COMPLETED' }, { id: 'cmfiler2', status: 'COMPLETED' }])
  assert.deepEqual(calls.map((c) => c[0]), ['create', 'patch', 'evidence', 'evidence', 'evidence', 'evidence', 'get', 'patch', 'get', 'patch'], 'every resolve GETs the live ticket before its PATCH')
  const [, created] = calls[0]
  assert.equal(created.status, 'BLOCKED')
  assert.ok(!('assignees' in created), 'assignment is a second write, like file-found-ticket.mjs')
  assert.equal(created.customFields.checkId, oid('00D0000000'))
  assert.equal(created.customFields.filerRunId, RUN_ID)
  assert.deepEqual(calls[1].slice(1), ['cmnew1', { assignees: { set: [{ id: 'cmq61oe6i000004lduh172vf3' }] } }])
  assert.deepEqual(calls[2].slice(1), ['http://127.0.0.1:4010/api/agent/tasks/cmnew1/evidence/screenshots', 'desktop', 'header', RUN_ID, 'https://alpha.school/campus-0/'])
  assert.deepEqual(calls[3].slice(1, 3), ['http://127.0.0.1:4010/api/agent/tasks/cmnew1/evidence/screenshots', 'mobile'])
  const [, resolvedId, resolvePatch] = calls[7]
  assert.equal(resolvedId, 'cmfiler1')
  assert.deepEqual(Object.keys(resolvePatch).sort(), ['customFields', 'description', 'resolutionKind', 'status'])
  assert.equal(resolvePatch.status, 'COMPLETED')
  assert.equal(resolvePatch.resolutionKind, 'check-cleared')
  assert.ok(!('expectedUpdatedAt' in resolvePatch), 'the live PATCH body carries no expectedUpdatedAt either')
  assert.equal(resolvePatch.customFields.resolutionKind, 'check-cleared')
  assert.equal(resolvePatch.customFields.assigneeNote, 'seen by the live GET', 'the PATCH is built from the live customFields, not the plan\'s snapshot')
  assert.ok(resolvePatch.description.startsWith(`Matt Barge: fix it\n${escalation}\n\nRESOLUTION (`))
  assertNoteShape(resolvePatch.description.slice(resolvePatch.description.indexOf('\n\nRESOLUTION (') + 2))
  for (const call of calls) if (call[0] === 'patch') { assert.ok(!('agentEligible' in call[2]), 'no PATCH ever carries agentEligible'); assert.ok(!('agentStatus' in call[2]), 'APEX clears agentStatus on completion') }

  const writes = fs.readFileSync(writesFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.deepEqual(writes.map((w) => w.write), ['create', 'assign', 'evidence', 'evidence', 'resolve', 'resolve'])
  assert.ok(writes.every((w) => w.runId === RUN_ID && /^\d{4}-\d{2}-\d{2}T/.test(w.at)))
  assert.deepEqual(writes[2].shots.map((s) => s.viewport), ['desktop', 'mobile'])
  assert.deepEqual(writes[4], { ...writes[4], write: 'resolve', ticket: 'cmfiler1', status: 'COMPLETED', resolutionKind: 'check-cleared', updatedAtSeen: '2026-09-21T10:00:00.000Z', clearingRunIds: ['site-full-2026-09-22T00-00-00-000Z', RUN_ID], observerIds: [oid('01DC1EA002')] })
  assert.equal(result.writes.length, 6)
  assert.ok(logs.some((l) => /^filed cmnew1 /.test(l)) && logs.some((l) => /^completed cmfiler1 /.test(l)))

  // The live ticket moved since the plan: a status change, a later updatedAt, or a person's line aborts that ticket, nothing is written.
  const moved = new Map(live)
  moved.set('cmfiler1', { ...live.get('cmfiler1'), status: 'FOR_REVIEW' })
  moved.set('cmfiler2', { ...live.get('cmfiler2'), updatedAt: '2026-09-24T15:59:00.000Z', description: 'Matt Barge: fix it\n\nBLOCKED (Yash Chitneni, 2026-09-24)\nhold' })
  const movedCalls = []
  const drifted = await applyPlan({ ...plan, files: [] }, { apex: { ...apex, get: async (id) => moved.get(id), patch: async (id, body) => { movedCalls.push([id, body]); return { id, status: body.status } } }, fetchImpl, writesFile: path.join(synthetic.dir, 'moved.jsonl'), now: NOW })
  assert.deepEqual(movedCalls, [], 'nothing is PATCHed')
  assert.deepEqual(drifted.skipped.map((s) => [s.id, s.reason, s.detail]), [['cmfiler1', 'CHANGED_SINCE_PLAN', 'status is FOR_REVIEW, the plan saw BLOCKED'], ['cmfiler2', 'CHANGED_SINCE_PLAN', 'updated 2026-09-24T15:59:00.000Z after the plan (2026-09-21T11:00:00.000Z)']])
  assert.equal(resolveDrift(plan.resolves[0], { ...live.get('cmfiler1'), description: `${live.get('cmfiler1').description}\nDECISION NEEDED: keep` }), 'carries an instruction line ("DECISION NEEDED: keep")')
  assert.equal(resolveDrift(plan.resolves[0], { ...live.get('cmfiler1'), customFields: { ...live.get('cmfiler1').customFields, filedBy: 'someone-else' } }), NOT_FILER_OWNED, 'provenance is re-checked on the live ticket')
  assert.equal(resolveDrift(plan.resolves[0], live.get('cmfiler1')), null)
  assert.match(fs.readFileSync(path.join(synthetic.dir, 'moved.jsonl'), 'utf8'), /"write":"resolve","ticket":"cmfiler1","skipped":"CHANGED_SINCE_PLAN"/)

  // A 409 OBSERVER_FILER_OWNED (APEX PR 409, nested error.code shape) is a logged skip; any other 409 aborts that ticket; any
  // other APEX failure is logged and does not stop the rest.
  const conflict = Object.assign(new ObserverFilerError('APEX_ERROR', 'APEX PATCH /tasks/cmfiler1 409: {"error":{"code":"OBSERVER_FILER_OWNED"}}'), { status: 409, body: { error: { code: FILER_OWNED_CODE } } })
  const stale = Object.assign(new ObserverFilerError('APEX_ERROR', 'APEX PATCH /tasks/cmfiler2 409: {"code":"EXPECTED_UPDATED_AT_MISMATCH"}'), { status: 409, body: { code: 'EXPECTED_UPDATED_AT_MISMATCH' }, code: 'EXPECTED_UPDATED_AT_MISMATCH' })
  const failing = { ...apex, patch: async (id) => { if (id === 'cmfiler1') throw conflict; if (id === 'cmfiler2') throw stale; throw new Error('unreachable') } }
  const second = await applyPlan({ ...plan, files: [] }, { apex: failing, fetchImpl, writesFile: path.join(synthetic.dir, 'second.jsonl'), now: NOW })
  assert.deepEqual(second.skipped.map((s) => [s.id, s.reason]), [['cmfiler1', FILER_OWNED_CODE], ['cmfiler2', 'UPDATED_AT_MISMATCH']])
  assert.deepEqual(second.errors, [])
  assert.deepEqual(second.resolved, [])
  const secondWrites = fs.readFileSync(path.join(synthetic.dir, 'second.jsonl'), 'utf8')
  assert.match(secondWrites, /"write":"resolve","ticket":"cmfiler1","skipped":"OBSERVER_FILER_OWNED"/)
  assert.match(secondWrites, /"write":"resolve","ticket":"cmfiler2","skipped":"UPDATED_AT_MISMATCH"/)
  const broken = { ...apex, patch: async () => { throw new Error('APEX PATCH 500') } }
  const third = await applyPlan({ ...plan, files: [] }, { apex: broken, fetchImpl, writesFile: path.join(synthetic.dir, 'third.jsonl'), now: NOW })
  assert.deepEqual(third.errors, [{ id: 'cmfiler1', step: 'resolve', error: 'APEX PATCH 500' }, { id: 'cmfiler2', step: 'resolve', error: 'APEX PATCH 500' }])

  // buildResolvePatch checks the note's shape before anything is written, and never rewrites the existing text.
  const patch = buildResolvePatch({ task: live.get('cmfiler2'), cleared: plan.resolves[1].cleared, rows: plan.resolves[1].rows, runId: RUN_ID, runCompletedAt: '2026-09-24T14:39:45.674Z', evidenceSha256: 'f'.repeat(64), bundleVersion: '1.0', now: NOW, page: 'https://alpha.school/second/' })
  assert.ok(patch.description.startsWith('Matt Barge: fix it\n\nRESOLUTION (agent/file-observer-findings.mjs 0.8, 2026-09-24, playbook check bundle)\n'))
  assert.ok(!patch.description.includes('—'))

  // listOpen logs when a status hits the page cap, so an incomplete queue is never silent.
  const capped = createApexClient({ env: { APEX_API_TOKEN: 't', APEX_API_BASE: 'http://127.0.0.1:4010/api/v1' }, log: (l) => logs.push(l), fetchImpl: async () => new Response(JSON.stringify({ items: Array.from({ length: 100 }, (_, i) => ({ id: `cm${Math.random().toString(36).slice(2)}${i}` })) }), { status: 200 }) })
  const listed = await capped.listOpen()
  assert.equal(listed.length, OPEN_STATUSES.length * LIST_MAX_PAGES * 100)
  assert.equal(capped.listWarnings.length, OPEN_STATUSES.length)
  assert.match(capped.listWarnings[0], /^listOpen: status NOT_STARTED hit the 20-page cap \(2000 tickets\); the open queue may be incomplete/)
  assert.ok(logs.some((l) => /hit the 20-page cap/.test(l)))
  const short = createApexClient({ env: { APEX_API_TOKEN: 't' }, fetchImpl: async () => new Response(JSON.stringify({ items: [{ id: 'cm1' }] }), { status: 200 }) })
  assert.equal((await short.listOpen()).length, 1)
  assert.deepEqual(short.listWarnings, [])
  // The client's errors carry status, body and code so the shared predicate can read every shape.
  const refusing = createApexClient({ env: { APEX_API_TOKEN: 't' }, fetchImpl: async () => new Response(JSON.stringify({ error: { code: FILER_OWNED_CODE, message: 'owned' } }), { status: 409 }) })
  await assert.rejects(refusing.patch('cm1', {}), (e) => e.code === FILER_OWNED_CODE && e.status === 409 && isFilerOwnedConflict(e))
})

test('observer filer: the CLI is a dry run by default, writes the report, never touches APEX without a token, and refuses --apply with --queue or without a token', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-observer-filer-cli-'))
  const report = path.join(tmp, 'report.json')
  const env = { ...process.env, APEX_API_TOKEN: '' }
  const stdout = execFileSync(process.execPath, ['agent/file-observer-findings.mjs', '--run-dir', path.join(fixtures, 'run-2026-09-24'), '--bundle', BUNDLE, '--queue', path.join(fixtures, 'queue-2026-09-24.json'), '--now', NOW.toISOString(), '--report', report], { cwd: root, encoding: 'utf8', env })
  const summary = JSON.parse(stdout)
  assert.equal(summary.mode, 'dry-run')
  assert.equal(summary.runId, RUN_ID)
  assert.equal(summary.bundleVersion, '1.11')
  assert.equal(summary.counts.resolves, 0, 'legacy observer tickets are never the filer\'s to close (PR 26)')
  assert.equal(summary.counts.needsPerson, 0)
  assert.equal(summary.counts.unresolved, 180)
  // Grounding restore: image identity and the seasonal window file again (Raleigh, La Jolla, Scottsdale beside Lexington's calendar) and the two Maddox cards are exempted.
  assert.equal(summary.counts.files, 4)
  assert.equal(summary.counts.decisionPending, 0)
  assert.equal(summary.counts.exempted, 2)
  assert.equal(summary.counts.outOfScope, 3)
  assert.equal(summary.exempted.length, 2)
  assert.equal(summary.outOfScope.length, 3)
  // Bundle 1.2: the source digest is counted in the summary and written next to the report, grouped by owner role.
  assert.equal(summary.counts.sourceDigest, 39)
  assert.deepEqual(summary.sourceDigest, { file: path.join(tmp, 'source-digest.md'), count: 39, byOwnerRole: { 'growth-map-owner': 0, 'hubspot-program-admin': 7, 'operations-sheet-owner': 21, 'community-app-owner': 11 } })
  const digest = fs.readFileSync(path.join(tmp, 'source-digest.md'), 'utf8')
  assert.match(digest, /^# Source digest: observer run site-full-2026-09-24T14-28-40-974Z\n/)
  assert.match(digest, /\n## growth-map-owner: 0 findings\n\n- none this run\n/)
  assert.match(digest, /\n## hubspot-program-admin \(Farhan Raja\): 7 findings\n\n- Every Operations sheet campus has one map record \| operations-greenwich \| observed: /)
  assert.match(digest, /\n## operations-sheet-owner \(no registered person; Matt Barge as operator\): 21 findings\n/)
  assert.match(digest, /\n## community-app-owner \(.+\): 11 findings\n/)
  assert.ok(!digest.includes('\u2014'))
  assert.ok(summary.existing.some((line) => /^campus-calendar-link-reachable page:tulsa: open ticket cmubrlbui00060agmr24zjcx9 \[NOT_STARTED\] via alias:checkId campus\.resources\.calendar-reachable$/.test(line)), summary.existing.join('\n'))
  assert.equal(summary.counts.loopHealth, 56)
  assert.equal(summary.suppressedByObserver, 0)
  assert.match(summary.holds, /^filer/)
  assert.deepEqual(summary.unhealthySources, ['browser'])
  assert.equal(summary.files.length, 4)
  assert.ok(summary.files.some((line) => /^Alpha Lexington: fails "Visible calendar destination answers 2xx logged out" -> Matt Barge \(website-agent-operator\); 1 finding\(s\), 0 evidence pair\(s\)$/.test(line)), summary.files.join('\n'))
  assert.ok(!fs.existsSync(path.join(fixtures, 'run-2026-09-24', 'source-digest.md')), 'the digest goes next to the report, never into the fixture folder')
  assert.equal(summary.decisionPending.some((line) => /^campus-layout-header-overlap /.test(line)), false, 'suppressed by the degraded browser before any decision applies')
  assert.deepEqual(summary.resolves, [])
  assert.deepEqual(summary.needsPerson, [])
  assert.ok(!('applied' in summary))
  assert.ok(!('queueWarnings' in summary))
  const written = JSON.parse(fs.readFileSync(report, 'utf8'))
  assert.equal(written.mode, 'dry-run')
  assert.equal(written.resolves.length, 0)
  assert.equal(written.unresolved.length, 180)
  assert.ok(written.unresolved.every((u) => u.reason === NOT_FILER_OWNED))
  assert.ok(!fs.existsSync(path.join(fixtures, 'run-2026-09-24', 'filer-writes.jsonl')), 'a dry run writes no jsonl')
  assert.ok(!fs.existsSync(path.join(fixtures, 'run-2026-09-24', 'filer-report.json')), '--report kept the fixture folder clean')

  const noQueue = spawnSync(process.execPath, ['agent/file-observer-findings.mjs', '--run-dir', path.join(fixtures, 'run-2026-09-24'), '--bundle', BUNDLE], { cwd: root, encoding: 'utf8', env })
  assert.equal(noQueue.status, 1)
  assert.match(noQueue.stderr, /^MISSING_TOKEN: APEX_API_TOKEN is required to read the open queue; pass --queue/)
  const applyWithQueue = spawnSync(process.execPath, ['agent/file-observer-findings.mjs', '--run-dir', path.join(fixtures, 'run-2026-09-24'), '--bundle', BUNDLE, '--queue', path.join(fixtures, 'queue-2026-09-24.json'), '--apply', '--report', report], { cwd: root, encoding: 'utf8', env: { ...env, APEX_API_TOKEN: 'would-write' } })
  assert.equal(applyWithQueue.status, 1)
  assert.match(applyWithQueue.stderr, /^MISSING_ARG: --apply writes against the live APEX queue and cannot take --queue/)
  const noApply = spawnSync(process.execPath, ['agent/file-observer-findings.mjs', '--run-dir', path.join(fixtures, 'run-2026-09-24'), '--bundle', BUNDLE, '--apply', '--report', report], { cwd: root, encoding: 'utf8', env })
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
  assert.match(body, /\nExemptions: registry\/sister-brand-exceptions\.json, registry\/campus-leadership\.json groups \(allowed phrases per campus; /)
  assert.match(body, /^Yash Chitneni: /)
})

test('observer filer: CTA exceptions, the sister-site guard, shared leadership, campus names in titles and dedupe aliases', () => {
  const checks = bundle()
  const registry = loadRegistry('registry/campus-cta-exceptions.json')
  assert.deepEqual(Object.keys(registry.ctas), ['book-a-call', 'calendar', 'packet', 'apply', 'community'])
  const lexington = registry.campuses['boston-suburbs']['book-a-call']
  assert.deepEqual([lexington.rule, lexington.decidedBy, lexington.source, lexington.decidedOn, lexington.expires], ['hidden', 'Matt Barge', 'email relayed 2026-09-24', '2026-09-24', 'lifecycle:Open'])
  assert.equal(registry.campuses.dorado['book-a-call'].rule, 'destination', 'the Dorado one-off moved out of spec/campus-page-controls.json')
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'spec', 'campus-page-controls.json'), 'utf8')).controls['hero.book-a-call'].exceptions.split(' ')[0], 'registry/campus-cta-exceptions.json', 'the controls file points at the registry')
  // Every CTA row reads the registry through exemptionsRef (a string or an array since bundle 1.1); the identity rows read the leadership groups.
  for (const check of ['campus-book-call-present', 'campus-book-call-link-reachable', 'campus-book-call-destination-campus', 'campus-calendar-present', 'campus-calendar-link-reachable', 'campus-calendar-destination-campus', 'campus-info-packet-present', 'campus-info-packet-link-reachable', 'campus-info-packet-destination-campus', 'campus-application-source-missing', 'campus-application-path', 'campus-application-finalsite-redirect', 'campus-page-application-source-sync', 'campus-application-placeholder', 'campus-application-destination', 'community-destination']) {
    const row = rowForCheck(checks, check)
    assert.ok(exemptionsRefsFor(row).includes('registry/campus-cta-exceptions.json'), `${check} reads the CTA exceptions`)
    assert.ok(ctaForRow(row), `${check} maps to a CTA`)
  }
  assert.deepEqual(exemptionsRefsFor(rowForCheck(checks, 'campus-info-packet-present')), ['registry/campus-packets.json interimPolicy', 'registry/campus-cta-exceptions.json'])
  for (const check of ['campus-image-identity-conflict', 'campus-sister-brand-leak']) assert.ok(exemptionsRefsFor(rowForCheck(checks, check)).includes('registry/campus-leadership.json groups'), `${check} reads the leadership groups`)
  assert.deepEqual(ctaForRow(rowForCheck(checks, 'campus-book-call-link-reachable')), { cta: 'book-a-call', prefix: 'campus.resources.booking', suffix: 'reachable' })
  assert.deepEqual(ctaForRow(rowForCheck(checks, 'campus-application-finalsite-redirect')), { cta: 'apply', prefix: 'campus.resources.apply', suffix: 'finalsite-redirect' })
  assert.deepEqual(ctaForRow(rowForCheck(checks, 'community-destination')), { cta: 'community', prefix: 'site.community.routing.cta', suffix: 'cta' })
  assert.equal(ctaForRow(rowForCheck(checks, 'campus-sister-brand-leak')), null)

  // Lexington: Book a Call hidden while Announced (lifecycle:Open). The present, reachable and destination rows are all exempt while the
  // campus is Announced (state from spec/campus-lifecycle.json when the finding carries none); once the finding says Open the exception has ended.
  const booking = (check, extra = {}) => ({ loop: 'campus-truth', check, entity: 'program-51223157555', field: 'booking', severity: 'high', title: 'Alpha Lexington has no visible booking CTA', actionable: true, url: 'https://alpha.school/boston-suburbs/', expected: 'visible Book a Call', actual: { href: null }, id: oid('B00C000001'), ...extra })
  const hidden = ctaExceptionFor({ row: rowForCheck(checks, 'campus-book-call-present'), finding: booking('campus-book-call-present'), now: NOW })
  assert.equal(hidden.exempt, true)
  assert.deepEqual([hidden.slug, hidden.campus, hidden.cta, hidden.rule, hidden.expires, hidden.suffix], ['boston-suburbs', 'Alpha Lexington', 'book-a-call', 'hidden', 'lifecycle:Open', 'present'])
  assert.match(hidden.expiryBasis, /^ends when the Program type becomes Open; state Announced per spec\/campus-lifecycle\.json/)
  assert.equal(ctaExceptionFor({ row: rowForCheck(checks, 'campus-book-call-link-reachable'), finding: booking('campus-book-call-link-reachable'), now: NOW }).exempt, true, 'hidden exempts every row of the CTA')
  assert.equal(ctaExceptionFor({ row: rowForCheck(checks, 'campus-book-call-destination-campus'), finding: booking('campus-book-call-destination-campus'), now: NOW }).exempt, true)
  const opened = ctaExceptionFor({ row: rowForCheck(checks, 'campus-book-call-present'), finding: booking('campus-book-call-present', { actual: { href: null, programType: 'Open' } }), now: NOW })
  assert.equal(opened.exempt, false)
  assert.match(opened.expired, /^campus is Open \(finding\); the exception ended/)
  assert.deepEqual(lifecycleFor(booking('x'), 'boston-suburbs').state, 'Announced')
  assert.deepEqual(lifecycleFor({ actual: { status: 'Open' } }, 'boston-suburbs'), { state: 'Open', basis: 'finding' })
  assert.equal(lifecycleFor({}, 'no-such-campus').state, null)
  assert.equal(ctaExceptionFor({ row: rowForCheck(checks, 'campus-calendar-link-reachable'), finding: booking('campus-calendar-link-reachable'), now: NOW }), null, 'no calendar entry for Lexington')
  assert.equal(ctaExceptionFor({ row: rowForCheck(checks, 'campus-book-call-present'), finding: booking('campus-book-call-present', { url: 'https://alpha.school/austin/', entity: 'program-26459919512' }), now: NOW }), null, 'no entry for Austin')
  // Dorado: destination rule exempts the destination comparison only; presence and reachability still apply.
  const dorado = (check) => booking(check, { url: 'https://alpha.school/dorado/', entity: 'program-29330581557', title: 'Alpha Dorado booking' })
  assert.equal(ctaExceptionFor({ row: rowForCheck(checks, 'campus-book-call-destination-campus'), finding: dorado('campus-book-call-destination-campus'), now: NOW }).exempt, true)
  const doradoReachable = ctaExceptionFor({ row: rowForCheck(checks, 'campus-book-call-link-reachable'), finding: dorado('campus-book-call-link-reachable'), now: NOW })
  assert.equal(doradoReachable.exempt, false)
  assert.match(doradoReachable.notCovered, /^rule destination exempts destination-campus, path, source, source-sync, placeholder, finalsite-redirect, cta rows, not reachable$/)
  assert.equal(doradoReachable.expiryBasis, 'standing until a recorded decision revokes it')
  // ISO expiry, evaluated from the start of that UTC day; the program id alone identifies the campus when the finding has no page URL.
  const dated = { ctas: registry.ctas, rules: registry.rules, campuses: { tulsa: { calendar: { rule: 'present', reason: 'r', decidedBy: 'p', source: 's', decidedOn: '2026-09-01', expires: '2026-09-20', note: '' } } } }
  const tulsa = booking('campus-calendar-present', { url: null, entity: 'program-51235904680' })
  assert.equal(campusSlugFor(tulsa), 'tulsa')
  assert.match(ctaExceptionFor({ row: rowForCheck(checks, 'campus-calendar-present'), finding: tulsa, now: NOW, registry: dated }).expired, /^expired on 2026-09-20$/)
  assert.equal(ctaExceptionFor({ row: rowForCheck(checks, 'campus-calendar-present'), finding: tulsa, now: new Date('2026-09-19T23:59:00Z'), registry: dated }).exempt, true)
  assert.equal(ctaExceptionFor({ row: rowForCheck(checks, 'campus-calendar-link-reachable'), finding: tulsa, now: new Date('2026-09-19T23:59:00Z'), registry: dated }).exempt, false, 'present exempts the present row only')

  // Through the plan: the Lexington booking finding is exempted and files nothing; the same finding on an Open campus files; the report says why.
  const planned = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [booking('campus-book-call-present'), booking('campus-book-call-present', { id: oid('B00C000002'), entity: 'program-26459919512', url: 'https://alpha.school/austin/', title: 'Alpha Austin has no visible booking CTA' })] }).dir), bundle: checks, queue: [], now: NOW })
  assert.equal(planned.counts.exempted, 1)
  assert.deepEqual(planned.exempted.map((e) => [e.kind, e.campus, e.cta, e.rule, e.decidedBy, e.source]), [['cta-exception', 'Alpha Lexington', 'book-a-call', 'hidden', 'Matt Barge', 'email relayed 2026-09-24']])
  assert.deepEqual(planned.files.map((f) => f.title), ['Alpha Austin: fails "Book a Call CTA present on Open campus pages"'])
  const ended = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [booking('campus-book-call-present', { actual: { href: null, programType: 'Open' } })] }).dir), bundle: checks, queue: [], now: NOW })
  assert.equal(ended.counts.exempted, 0)
  assert.equal(ended.counts.files, 1)
  assert.match(ended.exceptionsNotApplied[0].expired, /the exception ended when the HubSpot Program type became Open/)

  // Sister-site guard: campus rows on any other host are out-of-scope-site and never filed; site-family rows and public-host routes are unaffected.
  const tsa = booking('campus-book-call-present', { id: oid('0FF5170001'), entity: 'program-50888725544', url: 'https://sportsacademy.school/lake-travis/', title: 'Texas Sports Academy Lake Travis has no visible booking CTA' })
  const high = { loop: 'campus-truth', check: 'campus-school-schema', entity: 'program-26445615147', field: 'schema', severity: 'high', title: 'Alpha High has no readable School schema', actionable: true, url: 'https://alphahigh.school/', expected: 'School schema', actual: {}, id: oid('0FF5170002') }
  const route = { loop: 'functional', check: 'route-reachable', entity: 'sister-home', field: 'status', severity: 'high', title: 'sister timed out', actionable: true, url: 'https://alphahigh.school/', expected: 'HTTP 2xx', actual: { status: 'timeout' }, id: oid('0FF5170003') }
  assert.ok(isCampusPageRow(rowForCheck(checks, 'campus-book-call-present'), checks))
  assert.ok(!isCampusPageRow(rowForCheck(checks, 'route-reachable'), checks))
  assert.deepEqual(outOfScopeSite(rowForCheck(checks, 'campus-book-call-present'), tsa, checks), { reason: OUT_OF_SCOPE_SITE, host: 'sportsacademy.school', url: 'https://sportsacademy.school/lake-travis/' })
  assert.equal(outOfScopeSite(rowForCheck(checks, 'campus-book-call-present'), booking('campus-book-call-present'), checks), null)
  assert.equal(outOfScopeSite(rowForCheck(checks, 'route-reachable'), route, checks), null, 'the guard is for campus-page rows only')
  const guarded = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [tsa, high], extraIncidents: [{ ...tsa, status: 'active', firstSeenAt: '2026-09-01T00:00:00.000Z', occurrences: 3, cleanRuns: 0, consecutiveFailingRuns: 3 }] }).dir), bundle: checks, queue: [{ id: 'cmtsa1', status: 'NOT_STARTED', title: 'Texas Sports Academy Lake Travis has no visible booking CTA', url: 'https://sportsacademy.school/lake-travis/', customFields: { source: 'alpha-site-qc', check: 'campus-book-call-present', checkId: oid('0FF5170001') } }], now: NOW })
  assert.deepEqual(guarded.outOfScope.map((o) => [o.check, o.host]), [['campus-book-call-present', 'sportsacademy.school'], ['campus-school-schema', 'alphahigh.school']])
  assert.equal(guarded.counts.files, 0)
  assert.equal(guarded.counts.existing, 0, 'an out-of-scope finding is not even a duplicate candidate')

  // Titles: the campus display name from the registry for a program id, never the bare id; an unregistered program is named as such.
  const address = (entity, extra = {}) => ({ loop: 'campus-truth', check: 'operations-map-address-conflict', entity, field: 'address', severity: 'high', title: 'address', actionable: true, url: 'https://docs.google.com/spreadsheets/d/1t0fhwHz5Y2FvDvj2chRJGDrdcIco1ZADmkhAtRZTduM/edit', expected: '1 Main St', actual: { operations: '1 Main St', map: '2 Side St' }, id: oid('ADD0000009'), ...extra })
  const titled = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [address('program-51223157555'), address('program-99999999999', { id: oid('ADD0000010') })] }).dir), bundle: checks, queue: [], now: NOW })
  // Since bundle 1.2 the address row is source-digest: nothing files, and the digest names the campus the same way (registry display name, never a bare id).
  assert.deepEqual(titled.files, [])
  assert.deepEqual(titled.sourceDigest.map((d) => [d.record, d.ownerRole, d.owner, d.ownerRegistered]).sort(), [['Alpha Lexington', 'operations-sheet-owner', 'Matt Barge', false], ['unregistered program program-99999999999', 'operations-sheet-owner', 'Matt Barge', false]])
  assert.match(titled.sourceDigest[0].audit, /^Operations address and map address agree \| Alpha Lexington \| observed: operations 1 Main St, map 2 Side St \| expected: derived from operations-sheet address \(normalize-address; city-only before opening is intentional\) \(equals 0 difference\) \| source: the finding names no source system \(read 2026-09-24T14:39:45\.674Z\) \| observer SITE-ADD0000009, row site\.map\.integrity\.address-agreement, severity medium, run site-full-2026-09-24T14-28-40-974Z$/)

  // Shared leadership: a shared leader naming a sibling campus is exempt; another person, or a non-sibling campus, is not.
  const image = (alt, campus, extra = {}) => ({ loop: 'campus-truth', check: 'campus-image-identity-conflict', entity: 'program-57622127456', field: 'images', severity: 'high', title: `Alpha Jamaica Plain image metadata appears to reference ${campus}`, actionable: true, url: 'https://alpha.school/jamaica-plain/', expected: 'no other campus', actual: { campus, src: 'https://alpha.school/wp-content/uploads/2026/09/x.jpg', alt, nearbyText: '' }, id: oid('1DE0000001'), ...extra })
  const identity = rowForCheck(checks, 'campus-image-identity-conflict')
  const shared = sharedLeadershipExemption({ row: identity, finding: image('Brandon Maddox, Director of Admissions - Boston/Lexington', 'Alpha Boston') })
  assert.deepEqual([shared.group, shared.person, shared.campus, shared.sibling], ['greater-boston', 'Brandon Maddox', 'jamaica-plain', 'boston'])
  assert.equal(sharedLeadershipExemption({ row: identity, finding: image('Samantha Kravitz, Director of Admissions - Lexington', 'Alpha Lexington') }).person, 'Samantha Kravitz')
  assert.equal(sharedLeadershipExemption({ row: identity, finding: image('Kathy Robinson, Dean of Parents - Boston', 'Alpha Boston') }), null, 'not listed as shared leadership')
  assert.equal(sharedLeadershipExemption({ row: identity, finding: image('Brandon Maddox, Director of Admissions', 'Alpha Miami') }), null, 'Miami is not a sibling')
  assert.equal(sharedLeadershipExemption({ row: identity, finding: image('Brandon Maddox, Director of Admissions - Boston/Lexington', 'Alpha Boston', { url: 'https://alpha.school/austin/', entity: 'program-26459919512' }) }), null, 'Austin is in no group')
  assert.equal(sharedLeadershipExemption({ row: rowForCheck(checks, 'campus-expired-seasonal-cta'), finding: image('Brandon Maddox', 'Alpha Boston') }), null, 'a row without the exemptionsRef never reads the groups')
  assert.equal(sharedLeadershipExemption({ row: rowForCheck(checks, 'campus-sister-brand-leak'), finding: { ...image('Nova', 'Alpha Boston'), check: 'campus-sister-brand-leak', actual: 'Nova' } }), null, 'the sister-brand row reads the groups but a brand word names no shared leader')

  // Dedupe aliases: older check ids and title shapes on the same page match; a different page or an unrelated title does not; order is key, title, observer id, check, alias.
  const row = rowForCheck(checks, 'campus-calendar-link-reachable')
  const group = { key: 'observer:campus.resources.calendar.reachable:page:tulsa', pages: ['https://alpha.school/tulsa/'] }
  const payload = { title: 'Alpha Tulsa: fails "Visible calendar destination answers 2xx logged out"' }
  const ids = new Set([oid('CA1E000001')])
  const byAliasId = { id: 'cmalias1', status: 'NOT_STARTED', title: 'Alpha Tulsa: the visible 2026/27 calendar button opens a Google sign-in wall', url: 'https://alpha.school/tulsa/', customFields: { source: 'agent-found', checkId: 'campus.resources.calendar-reachable' } }
  const byAliasTitle = { id: 'cmalias2', status: 'BLOCKED', title: 'Alpha Tulsa: calendar link broken', customFields: { source: 'agent-found', pageUrl: 'https://alpha.school/tulsa/' } }
  const otherPage = { id: 'cmother1', status: 'NOT_STARTED', title: 'Alpha Malibu: the 2026/27 calendar button is hidden on every breakpoint', url: 'https://alpha.school/malibu/', customFields: { source: 'agent-found', checkId: 'cta-hidden-everywhere' } }
  const unrelated = { id: 'cmother2', status: 'NOT_STARTED', title: 'Alpha Tulsa: header overlaps', url: 'https://alpha.school/tulsa/', customFields: { source: 'agent-found', checkId: 'campus-layout-header-overlap' } }
  assert.deepEqual(findOpenDuplicate([otherPage, unrelated, byAliasId], { group, row, payload, ids }), { task: byAliasId, via: 'alias:checkId campus.resources.calendar-reachable' })
  assert.deepEqual(findOpenDuplicate([otherPage, unrelated, byAliasTitle], { group, row, payload, ids }), { task: byAliasTitle, via: 'alias:title \\bcalendar\\b' })
  assert.equal(findOpenDuplicate([otherPage, unrelated], { group, row, payload, ids }), null)
  const byKey = { id: 'cmkey1', status: 'NOT_STARTED', title: 'x', customFields: { idempotencyKey: group.key } }
  const byObserverId = { id: 'cmoid1', status: 'NOT_STARTED', title: 'y', customFields: { checkId: oid('CA1E000001') } }
  assert.equal(findOpenDuplicate([byAliasId, byObserverId, byKey], { group, row, payload, ids }).via, 'idempotency-key')
  assert.equal(findOpenDuplicate([byAliasId, byObserverId], { group, row, payload, ids }).via, 'observer-id')
  assert.equal(findOpenDuplicate([byAliasId, { ...byObserverId, customFields: { check: 'campus-calendar-link-reachable' }, url: 'https://alpha.school/tulsa/' }], { group, row, payload, ids }).via, 'check-on-page')
  assert.equal(findOpenDuplicate([byAliasId], { group, row: rowForCheck(checks, 'campus-expired-seasonal-cta'), payload, ids }), null, 'a check without aliases matches nothing by alias')
  const mediaRow = rowForCheck(checks, 'campus-page-stale-launch-media')
  const mediaGroup = { key: 'observer:campus.intro.media.current:page:east-bay', pages: ['https://alpha.school/east-bay/'] }
  const mediaPayload = { title: 'Alpha East Bay: fails "Open campus intro slot shows the approved open-state media, never launch-era media"' }
  const legacyMedia = { id: 'cmubrkkm800000agmvukxsioc', status: 'BLOCKED', title: 'Alpha East Bay: Open campus intro still shows the "Coming Fall 2026 To Piedmont" launch card', url: 'https://alpha.school/east-bay/', customFields: { source: 'agent-found', checkId: 'open-intro-media-approved' } }
  assert.deepEqual(findOpenDuplicate([legacyMedia], { group: mediaGroup, row: mediaRow, payload: mediaPayload, ids: new Set([oid('EA57BAY001')]) }), { task: legacyMedia, via: 'alias:checkId open-intro-media-approved' })
  const aliases = loadRegistry('spec/observer-check-map.json').dedupeAliases
  for (const check of ['campus-calendar-link-reachable', 'campus-info-packet-link-reachable', 'campus-book-call-present', 'campus-sister-brand-leak', 'campus-image-identity-conflict', 'campus-application-path', 'campus-page-stale-launch-media']) assert.ok(aliases[check]?.checkIds?.length && aliases[check]?.titlePatterns?.length, `${check} has aliases`)
  assert.ok(aliases['campus-calendar-link-reachable'].checkIds.includes('cta-links-resolve') && aliases['campus-calendar-link-reachable'].checkIds.includes('cta-hidden-everywhere'))
})

test('shared-leadership exemption reads the aggregated conflict array the observer emits since aeo PR 26', () => {
  const bundle = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'check-bundle.generated.json'), 'utf8'))
  const row = bundle.rows.find((r) => r.id === 'site.identity.other-campus.images')
  const finding = { id: 'SITE-172A936ED4', url: 'https://alpha.school/jamaica-plain/', entity: 'program-57622127456', actual: [{ campus: 'Alpha Boston', src: 'https://alpha.school/wp-content/uploads/2026/09/brandon-maddox-headshot.jpg', alt: 'Brandon Maddox, Director of Admissions - Boston/Lexington', nearbyText: '', source: 'page-html', hiddenOnAllViewports: false }] }
  const exemption = sharedLeadershipExemption({ row, finding })
  assert.ok(exemption, 'array-shaped actual must still resolve the sibling campus')
  assert.equal(exemption.person, 'Brandon Maddox')
  assert.equal(exemption.sibling, 'boston')
  const stranger = { ...finding, actual: [{ ...finding.actual[0], alt: 'Someone Else, Guide - Boston' }] }
  assert.equal(sharedLeadershipExemption({ row, finding: stranger }), null)
})

// Packet freshness gate (2026-09-25): the scheduled filer applied the 17-day-old packet of run site-events-2026-09-08T03-27-24-684Z.
test('packet freshness: run ids order by their trailing timestamp, and assessPacketFreshness names every reason a packet may not be applied', () => {
  const STALE_RUN = 'site-events-2026-09-08T03-27-24-684Z'
  const EVENTS_TODAY = 'site-events-2026-09-25T13-26-58-882Z'
  assert.equal(runIdTimestamp(RUN_ID), '2026-09-24T14-28-40-974Z')
  assert.equal(runIdTimestamp('36012695049'), null)
  assert.ok(compareRunIds(EVENTS_TODAY, RUN_ID) > 0, 'site-events of the 25th is newer than site-full of the 24th although "events" sorts before "full"')
  assert.ok(compareRunIds(STALE_RUN, RUN_ID) < 0)
  assert.equal(compareRunIds(RUN_ID, RUN_ID), 0)
  assert.ok(compareRunIds('b', 'a') > 0 && compareRunIds('a', 'b') < 0, 'ids without a timestamp compare as strings')
  assert.ok(compareRunIds(RUN_ID, 'no-timestamp') > 0, 'mixed ids compare as strings too')
  assert.equal(DEFAULT_MAX_PACKET_AGE_HOURS, 6)

  const verified = { runId: RUN_ID, completedAt: '2026-09-24T14:39:45.674Z', checkBundle: { status: 'verified', sha256: 'a'.repeat(64) } }
  const fresh = assessPacketFreshness(verified, { now: NOW })
  assert.deepEqual(fresh, { fresh: true, problems: [], runId: RUN_ID, completedAt: '2026-09-24T14:39:45.674Z', ageHours: 1.34, maxAgeHours: 6, bundleStatus: 'verified', bundleSha256: 'a'.repeat(64), afterRunId: null, newerThanAfterRunId: null })
  assert.equal(assessPacketFreshness(verified, { now: new Date('2026-09-24T20:39:45.674Z') }).fresh, true, 'exactly six hours is still fresh')
  const stale = assessPacketFreshness(verified, { now: new Date('2026-09-24T20:39:46.000Z') })
  assert.equal(stale.fresh, false)
  assert.match(stale.problems[0], /^packet completed 2026-09-24T14:39:45\.674Z, 6\.0 hours before 2026-09-24T20:39:46\.000Z; the limit is 6 hours \(--max-packet-age-hours\)$/)
  assert.equal(assessPacketFreshness(verified, { now: new Date('2026-09-25T14:52:00Z'), maxAgeHours: 48 }).fresh, true, 'the limit is an option')
  const seventeenDays = assessPacketFreshness({ runId: STALE_RUN, completedAt: '2026-09-08T03:40:00.000Z', checkBundle: { status: 'verified' } }, { now: new Date('2026-09-25T14:52:00Z') })
  assert.equal(seventeenDays.fresh, false)
  assert.equal(seventeenDays.ageHours, 419.2)
  const unverified = assessPacketFreshness({ ...verified, checkBundle: { status: 'mismatch', sha256: 'b' } }, { now: NOW })
  assert.deepEqual(unverified.problems, ['manifest.checkBundle.status is mismatch, not verified'])
  assert.deepEqual(assessPacketFreshness({ runId: RUN_ID, completedAt: verified.completedAt }, { now: NOW }).problems, ['manifest.checkBundle.status is missing, not verified'])
  assert.deepEqual(assessPacketFreshness({ runId: RUN_ID, checkBundle: { status: 'verified' } }, { now: NOW }).problems, ['manifest.completedAt is missing'])
  assert.match(assessPacketFreshness({ runId: RUN_ID, completedAt: 'yesterday', checkBundle: { status: 'verified' } }, { now: NOW }).problems[0], /^manifest\.completedAt is not a datetime \(yesterday\)$/)
  const twice = assessPacketFreshness(verified, { now: NOW, afterRunId: RUN_ID })
  assert.equal(twice.fresh, false)
  assert.equal(twice.newerThanAfterRunId, false)
  assert.match(twice.problems[0], /^run site-full-2026-09-24T14-28-40-974Z is the last applied run \(--after-run-id site-full-2026-09-24T14-28-40-974Z\); a packet is never applied twice$/)
  const superseded = assessPacketFreshness(verified, { now: NOW, afterRunId: EVENTS_TODAY })
  assert.match(superseded.problems[0], /is older than the last applied run site-events-2026-09-25T13-26-58-882Z \(--after-run-id\); an older packet is never applied after a newer one$/)
  const newer = assessPacketFreshness(verified, { now: NOW, afterRunId: STALE_RUN })
  assert.deepEqual([newer.fresh, newer.afterRunId, newer.newerThanAfterRunId], [true, STALE_RUN, true])
  const everything = assessPacketFreshness({ runId: STALE_RUN, completedAt: '2026-09-08T03:40:00.000Z', checkBundle: { status: 'unverified' } }, { now: new Date('2026-09-25T14:52:00Z'), afterRunId: RUN_ID })
  assert.equal(everything.problems.length, 3, 'every reason is reported, not just the first')

  // Option parsing: a positive number of hours, an id for --after-run-id.
  assert.deepEqual(packetGateOptions({}), { maxAgeHours: 6, afterRunId: null })
  assert.deepEqual(packetGateOptions({ 'max-packet-age-hours': '0.5', 'after-run-id': ` ${RUN_ID} ` }), { maxAgeHours: 0.5, afterRunId: RUN_ID })
  for (const bad of ['0', '-1', 'six', true]) assert.throws(() => packetGateOptions({ 'max-packet-age-hours': bad }), (e) => e instanceof ObserverFilerError && e.code === 'MISSING_ARG' && /--max-packet-age-hours must be a positive number of hours/.test(e.message), `rejects ${bad}`)
  assert.throws(() => packetGateOptions({ 'after-run-id': true }), (e) => e.code === 'MISSING_ARG' && /--after-run-id needs/.test(e.message))
})

test('packet freshness: --apply refuses a stale, unverified, already applied or superseded packet with STALE_PACKET before reading the queue; a dry run reports the same as warnings', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-observer-filer-stale-'))
  const report = path.join(tmp, 'report.json')
  // The APEX base points at a closed port: had the gate not fired first, --apply would have failed reading the queue (APEX_ERROR, exit 2), not STALE_PACKET (exit 1).
  const env = { ...process.env, APEX_API_TOKEN: 'would-write', APEX_API_BASE: 'http://127.0.0.1:9/api/v1', APEX_AGENT_API_BASE: 'http://127.0.0.1:9/api/agent' }
  const filer = (args, extraEnv = {}) => spawnSync(process.execPath, ['agent/file-observer-findings.mjs', '--bundle', BUNDLE, '--report', report, ...args], { cwd: root, encoding: 'utf8', env: { ...env, ...extraEnv } })
  // The gate passed: the run got as far as the queue and died on the closed port (a raw fetch failure, exit 3, or a typed APEX_ERROR, exit 2), never STALE_PACKET (exit 1).
  const passedGate = (result) => { assert.notEqual(result.status, 1, result.stderr); assert.doesNotMatch(result.stderr, /STALE_PACKET/); assert.match(result.stderr, /fetch failed|APEX_ERROR|ECONNREFUSED/) }
  const fixture = path.join(fixtures, 'run-2026-09-24')

  // The saved packet has no checkBundle record and, at the real clock, is days old: both reasons are named.
  const stale = filer(['--run-dir', fixture, '--apply'])
  assert.equal(stale.status, 1, stale.stderr)
  assert.match(stale.stderr, /^STALE_PACKET: --apply refused: packet completed 2026-09-24T14:39:45\.674Z, [\d.]+ hours before .*; the limit is 6 hours \(--max-packet-age-hours\); manifest\.checkBundle\.status is missing, not verified$/m)
  assert.ok(!fs.existsSync(report), 'nothing planned, nothing reported')
  assert.ok(!fs.existsSync(path.join(fixture, 'filer-writes.jsonl')))

  // Verified and within the limit: the gate passes and --apply goes on to the queue (and fails there, on the closed port).
  const verified = syntheticRun({ pages: 1, manifestExtra: { checkBundle: { status: 'verified', sha256: 'c'.repeat(64) } } })
  passedGate(filer(['--run-dir', verified.dir, '--apply', '--now', NOW.toISOString()]))
  // A wider limit is an option; a verified packet older than it is refused on age alone.
  assert.match(filer(['--run-dir', verified.dir, '--apply', '--now', '2026-09-25T14:52:00Z']).stderr, /^STALE_PACKET: --apply refused: packet completed 2026-09-24T14:39:45\.674Z, 24\.2 hours before 2026-09-25T14:52:00\.000Z; the limit is 6 hours \(--max-packet-age-hours\)$/m)
  passedGate(filer(['--run-dir', verified.dir, '--apply', '--now', '2026-09-25T14:52:00Z', '--max-packet-age-hours', '48']))
  // The apply ledger: the same run id, or a newer one, refuses; an older one lets the packet through.
  assert.match(filer(['--run-dir', verified.dir, '--apply', '--now', NOW.toISOString(), '--after-run-id', RUN_ID]).stderr, /^STALE_PACKET: --apply refused: run site-full-2026-09-24T14-28-40-974Z is the last applied run \(--after-run-id site-full-2026-09-24T14-28-40-974Z\); a packet is never applied twice$/m)
  assert.match(filer(['--run-dir', verified.dir, '--apply', '--now', NOW.toISOString(), '--after-run-id', 'site-events-2026-09-25T13-26-58-882Z']).stderr, /^STALE_PACKET: --apply refused: run site-full-2026-09-24T14-28-40-974Z is older than the last applied run site-events-2026-09-25T13-26-58-882Z/m)
  passedGate(filer(['--run-dir', verified.dir, '--apply', '--now', NOW.toISOString(), '--after-run-id', 'site-events-2026-09-08T03-27-24-684Z']))
  // Unverified alone refuses too, whatever the age.
  const unverified = syntheticRun({ pages: 1, manifestExtra: { checkBundle: { status: 'mismatch', sha256: 'd'.repeat(64) } } })
  assert.match(filer(['--run-dir', unverified.dir, '--apply', '--now', NOW.toISOString()]).stderr, /^STALE_PACKET: --apply refused: manifest\.checkBundle\.status is mismatch, not verified$/m)
  // Bad option values are argument errors, before the gate.
  assert.match(filer(['--run-dir', verified.dir, '--apply', '--max-packet-age-hours', 'six']).stderr, /^MISSING_ARG: --max-packet-age-hours must be a positive number of hours, got six$/m)

  // A dry run of the stale packet goes ahead and carries the same conditions as packetWarnings, on stderr and in the summary and report.
  const dry = filer(['--run-dir', fixture, '--queue', path.join(fixtures, 'queue-2026-09-24.json'), '--now', '2026-09-25T14:52:00Z', '--after-run-id', 'site-events-2026-09-25T13-26-58-882Z'], { APEX_API_TOKEN: '' })
  assert.equal(dry.status, 0, dry.stderr)
  const summary = JSON.parse(dry.stdout)
  assert.equal(summary.mode, 'dry-run')
  assert.deepEqual(summary.packet, { completedAt: '2026-09-24T14:39:45.674Z', ageHours: 24.2, maxAgeHours: 6, bundleStatus: null, afterRunId: 'site-events-2026-09-25T13-26-58-882Z' })
  assert.equal(summary.packetWarnings.length, 3)
  assert.match(summary.packetWarnings[0], /^packet completed 2026-09-24T14:39:45\.674Z, 24\.2 hours before/)
  assert.equal(summary.packetWarnings[1], 'manifest.checkBundle.status is missing, not verified')
  assert.match(summary.packetWarnings[2], /is older than the last applied run/)
  assert.equal(dry.stderr.match(/^packet warning: /gm).length, 3)
  assert.equal(summary.counts.files, 4, 'the dry run itself is unchanged (4 since the grounding restore: image identity and the seasonal window file again)')
  const written = JSON.parse(fs.readFileSync(report, 'utf8'))
  assert.deepEqual(written.packetWarnings, summary.packetWarnings)
  assert.equal(written.packet.fresh, false)
  const freshDry = filer(['--run-dir', verified.dir, '--queue', path.join(fixtures, 'queue-2026-09-24.json'), '--now', NOW.toISOString()], { APEX_API_TOKEN: '' })
  assert.equal(freshDry.status, 0, freshDry.stderr)
  assert.ok(!('packetWarnings' in JSON.parse(freshDry.stdout)), 'a fresh verified packet carries no warning')
})

test('packet freshness gate script: refuses before any filer call, takes the newer of the ledger artifact and the variable, and writes the job outputs and summary', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-packet-gate-'))
  const outputs = path.join(tmp, 'outputs.txt')
  const stepSummary = path.join(tmp, 'summary.md')
  const ledgerFile = path.join(tmp, 'filer-apply-ledger.json')
  const STALE_RUN = 'site-events-2026-09-08T03-27-24-684Z'
  const EVENTS_TODAY = 'site-events-2026-09-25T13-26-58-882Z'
  const verified = syntheticRun({ pages: 1, manifestExtra: { checkBundle: { status: 'verified', sha256: 'e'.repeat(64) } } })
  const run = (args, extraEnv = {}) => spawnSync(process.execPath, ['agent/packet-freshness-gate.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: outputs, GITHUB_STEP_SUMMARY: stepSummary, ...extraEnv } })
  const readOutputs = () => Object.fromEntries(fs.readFileSync(outputs, 'utf8').trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)))

  // The 17-day-old packet of 2026-09-25: refused with every reason, exit 2, the summary says so.
  const stale = run(['--run-dir', path.join(fixtures, 'run-2026-09-24'), '--now', '2026-09-25T14:52:00Z', '--github-run-id', '36012695049', '--apply', '--after-run-id', EVENTS_TODAY])
  assert.equal(stale.status, 2, stale.stderr)
  assert.match(stale.stderr, /^STALE_PACKET: refusing the packet: packet completed 2026-09-24T14:39:45\.674Z, 24\.2 hours before 2026-09-25T14:52:00\.000Z; the limit is 6 hours \(--max-packet-age-hours\); manifest\.checkBundle\.status is missing, not verified; run site-full-2026-09-24T14-28-40-974Z is older than the last applied run site-events-2026-09-25T13-26-58-882Z/m)
  const printed = JSON.parse(stale.stdout)
  assert.equal(printed.fresh, false)
  assert.equal(printed.githubRunId, '36012695049')
  assert.deepEqual(printed.lastApplied, { runId: EVENTS_TODAY, source: 'OBSERVER_FILER_LAST_APPLIED_RUN' })
  const staleOutputs = readOutputs()
  assert.deepEqual(staleOutputs, { manifest_run_id: RUN_ID, completed_at: '2026-09-24T14:39:45.674Z', bundle_status: '', bundle_sha256: '', age_hours: '24.2', last_applied: EVENTS_TODAY, last_applied_source: 'OBSERVER_FILER_LAST_APPLIED_RUN', fresh: 'false' })
  const staleSummary = fs.readFileSync(stepSummary, 'utf8')
  assert.match(staleSummary, /^## Observer packet freshness gate$/m)
  assert.match(staleSummary, /^- Observer GitHub run: `36012695049`$/m)
  assert.match(staleSummary, /^- Run id \(manifest\): `site-full-2026-09-24T14-28-40-974Z`$/m)
  assert.match(staleSummary, /^- Bundle: `missing` \(`no sha256`\)$/m)
  assert.match(staleSummary, /^- Completed at: `2026-09-24T14:39:45\.674Z` \(24\.2 h old; limit 6 h\)$/m)
  assert.match(staleSummary, /^- Last applied run: `site-events-2026-09-25T13-26-58-882Z` \(OBSERVER_FILER_LAST_APPLIED_RUN\); this packet is not newer$/m)
  assert.match(staleSummary, /^- Result: \*\*refused\*\* \(packet completed/m)

  // Fresh, verified, newer than both ledger sources: proceed. The ledger file (artifact) and the variable are compared and the newer one wins.
  fs.rmSync(outputs); fs.rmSync(stepSummary)
  fs.writeFileSync(ledgerFile, JSON.stringify({ runId: STALE_RUN, appliedAt: '2026-09-25T14:52:30Z' }))
  const ok = run(['--run-dir', verified.dir, '--now', NOW.toISOString(), '--github-run-id', '36140698223', '--apply', '--after-run-id', 'site-full-2026-09-23T02-00-00-000Z', '--ledger-file', ledgerFile])
  assert.equal(ok.status, 0, ok.stderr)
  const okPrinted = JSON.parse(ok.stdout)
  assert.equal(okPrinted.fresh, true)
  assert.equal(okPrinted.mode, 'apply')
  assert.deepEqual(okPrinted.lastApplied, { runId: 'site-full-2026-09-23T02-00-00-000Z', source: 'OBSERVER_FILER_LAST_APPLIED_RUN' }, 'the variable is newer than the artifact here')
  assert.equal(okPrinted.newerThanLastApplied, true)
  assert.deepEqual(readOutputs(), { manifest_run_id: RUN_ID, completed_at: '2026-09-24T14:39:45.674Z', bundle_status: 'verified', bundle_sha256: 'e'.repeat(64), age_hours: '1.34', last_applied: 'site-full-2026-09-23T02-00-00-000Z', last_applied_source: 'OBSERVER_FILER_LAST_APPLIED_RUN', fresh: 'true' })
  assert.match(fs.readFileSync(stepSummary, 'utf8'), /^- Result: \*\*proceed\*\*$/m)
  // The artifact newer than the variable: it wins, and equal to the packet it refuses (never twice).
  fs.writeFileSync(ledgerFile, JSON.stringify({ runId: RUN_ID }))
  const twice = run(['--run-dir', verified.dir, '--now', NOW.toISOString(), '--apply', '--after-run-id', STALE_RUN, '--ledger-file', ledgerFile])
  assert.equal(twice.status, 2)
  assert.match(twice.stderr, /is the last applied run \(--after-run-id site-full-2026-09-24T14-28-40-974Z\); a packet is never applied twice/)
  assert.match(JSON.parse(twice.stdout).lastApplied.source, /^ledger artifact /)
  // Without --apply the ledger is reported, not enforced; age and bundle status still are.
  const dry = run(['--run-dir', verified.dir, '--now', NOW.toISOString(), '--ledger-file', ledgerFile])
  assert.equal(dry.status, 0, dry.stderr)
  assert.deepEqual([JSON.parse(dry.stdout).mode, JSON.parse(dry.stdout).newerThanLastApplied, JSON.parse(dry.stdout).afterRunId], ['dry-run', false, null])
  assert.equal(run(['--run-dir', verified.dir, '--now', '2026-09-25T14:52:00Z']).status, 2, 'a dry run still refuses a stale packet')
  assert.equal(run(['--run-dir', path.join(fixtures, 'run-2026-09-24'), '--now', NOW.toISOString()]).status, 2, 'and an unverified one')
  assert.match(run([]).stderr, /^MISSING_ARG: Usage: packet-freshness-gate\.mjs --run-dir/)
  assert.match(run(['--run-dir', tmp]).stderr, /^BAD_RUN_DIR: /)
  // Library shape: lastAppliedRun picks by compareRunIds and ignores blanks; gate returns the assessment plus the ledger view.
  assert.deepEqual(lastAppliedRun([{ runId: '', source: 'a' }, { runId: STALE_RUN, source: 'b' }, null, { runId: EVENTS_TODAY, source: 'c' }, { runId: RUN_ID, source: 'd' }]), { runId: EVENTS_TODAY, source: 'c' })
  assert.equal(lastAppliedRun([{ runId: ' ', source: 'a' }]), null)
  const result = gate({ runDir: verified.dir, apply: true, maxAgeHours: 6, afterRunId: STALE_RUN, now: NOW })
  assert.deepEqual([result.fresh, result.afterRunId, result.lastApplied.runId, result.newerThanLastApplied, result.mode], [true, STALE_RUN, STALE_RUN, true, 'apply'])
})

// Presence, not absence (bundle 1.3, QC loop repair plan 2026-09-25 repairs 1 and 4): the East Bay page fixture and the coverage fixture.
test('observer filer: East Bay with no registry row files one Missing Info to website operations; a row naming attachment 8550 with openMedia null files Missing Info; an approved attachment in the slot files nothing', () => {
  const checks = bundle()
  const run = loadRunFolder(path.join(fixtures, 'east-bay-2026-09-25'))
  const row = rowForCheck(checks, 'campus-page-stale-launch-media')
  assert.equal(row.id, 'campus.intro.media.current')
  assert.deepEqual([row.entitySource, row.ownerRole, row.ticketClass, row.expected.derive.onMissing, row.comparator.type], ['hubspot-programs', 'website-operations', 'observer-media-identity', 'finding', 'equals-approved-media'])
  assert.equal(registryFileForRow(row), 'registry/campus-open-media.json')
  assert.ok(row.literals.launchWords.includes('Coming Fall') && row.literals.launchWords.includes('Now Enrolling Fall'))
  assert.ok(isMissingExpectation(run.findings[0]))
  const withRegistry = (campuses) => ({ 'registry/campus-open-media.json': { campuses } })
  const now = new Date('2026-09-25T15:00:00Z')

  // (a) no registry row: one Missing Info to the registry owner (website operations, Yash), titled per the contract, deduped on campus and row.
  const none = planObserverFindings({ run, bundle: checks, queue: [], now, registries: withRegistry({}) })
  assert.deepEqual([none.counts.files, none.counts.missingInfo, none.counts.recordedSince, none.counts.invalid], [1, 1, 0, 0])
  const ticket = none.files[0]
  assert.equal(ticket.title, 'no approved intro media recorded for Open campus Alpha East Bay')
  assert.equal(ticket.key, 'observer:campus.intro.media.current:page:east-bay')
  assert.equal(ticket.payload.status, MISSING_INFO_STATUS)
  assert.deepEqual([ticket.owner.name, ticket.owner.role, ticket.owner.escalated], ['Yash Chitneni', 'website-operations', false])
  assert.deepEqual([ticket.payload.customFields.triagedClass, ticket.payload.customFields.ownerRole, ticket.payload.customFields.requirementId, ticket.payload.customFields.missingExpectation, ticket.payload.customFields.registry, ticket.payload.customFields.campusSlug, ticket.payload.customFields.lifecycleState], ['observer-media-identity', 'website-operations', 'campus.intro.media.current', true, 'registry/campus-open-media.json', 'east-bay', 'Open'])
  assert.equal(ticket.payload.customFields.missingAsk, row.literals.missingAsk)
  assert.equal(contractCheck({ ...ticket.payload, id: 'x', assignees: [{ name: 'Yash Chitneni' }] }).valid, true)
  // 2026-09-28: the Observed line and the first numbered item say what is in the slot now (graded launch, unapproved or
  // unaccounted from the finding's own actual) and ask the owner to approve or replace it; title, class and status stay.
  assert.match(ticket.payload.description, /\nObserved: registry\/campus-open-media\.json has no entry for east-bay; the intro slot shows launch-era media: attachment 8550 \(Piedmont-1024x704\.webp, alt empty\) \(known launch-era asset\)\n/)
  assert.match(ticket.payload.description, /\n1\. the intro slot shows launch-era media: attachment 8550 \(Piedmont-1024x704\.webp, alt empty\) \(known launch-era asset\)\. Replace it with the Open and Enrolling card \(or the campus video Matt or Yash approves\) and record the approval in registry\/campus-open-media\.json; a launch card is never approved for an Open campus \(owner: Yash Chitneni\)\n2\. Record the approved open-state intro media/)
  assert.deepEqual([none.missingInfo[0].slot.level, ticket.missingExpectation.slug], ['launch', 'east-bay'])
  const withVision = { ...run.findings[0], actual: [{ kind: 'image-metadata', src: run.findings[0].actual.src, alt: '', classes: 'attachment-large size-large wp-image-8550', containerId: 'content_image' }, { kind: 'vision-text', source: 'vision', slot: 'intro-card', launchWord: 'Coming Fall', visionText: 'Coming Fall 2026\nTo Piedmont', confidence: 95 }] }
  const vision = slotObservation(withVision, row)
  assert.deepEqual([vision.level, vision.attachmentId, vision.reading, vision.launch], ['launch', 8550, 'Coming Fall 2026 To Piedmont', ['Coming Fall', 'known launch-era asset']])
  assert.match(vision.what, /^the intro slot shows launch-era media: attachment 8550 \(Piedmont-1024x704\.webp, alt empty\) reads "Coming Fall 2026 To Piedmont" \(Coming Fall, known launch-era asset\)$/)
  const skyline = slotObservation({ actual: [{ kind: 'image-metadata', src: 'https://alpha.school/wp-content/uploads/2026/03/Best-things-to-do-in-Atlanta-Header-1024x576.webp', alt: '', classes: 'attachment-large size-large wp-image-8790', containerId: 'content_image' }, { kind: 'media-governance', src: 'https://alpha.school/wp-content/uploads/2026/03/Best-things-to-do-in-Atlanta-Header-1024x576.webp', reason: 'no-approved-open-state-media', registryStatus: 'missing' }], observed: 'https://alpha.school/wp-content/uploads/2026/03/Best-things-to-do-in-Atlanta-Header-1024x576.webp' }, row)
  assert.deepEqual([skyline.level, skyline.attachmentId], ['unapproved', 8790])
  assert.equal(skyline.what, 'the intro slot holds attachment 8790 (Best-things-to-do-in-Atlanta-Header-1024x576.webp, alt empty), which no registry row approves')
  assert.match(skyline.ask, /^Approve what is there \(record openMedia card with attachmentId 8790 in registry\/campus-open-media\.json\) or replace it with the Open and Enrolling card$/)
  const badge = slotObservation({ actual: [{ kind: 'media-governance', src: 'https://alpha.school/wp-content/uploads/2025/07/Cognia-removebg.webp', reason: 'no-approved-open-state-media', registryStatus: 'missing', registryCurrent: null }], observed: 'https://alpha.school/wp-content/uploads/2025/07/Cognia-removebg.webp' }, row)
  assert.equal(badge.level, 'unaccounted')
  assert.match(badge.what, /^the observer exposes no intro slot image for this page \(its primary visual is Cognia-removebg\.webp\); a campus video in the slot is not visible to the observer$/)
  assert.match(badge.ask, /^Approve the campus video in the slot \(record openMedia video/)
  const altLaunch = slotObservation({ actual: { attachmentId: 9833, src: 'https://alpha.school/wp-content/uploads/2026/09/alpha-franklin-coming-soon-1024x704.webp', alt: 'Aerial view with Coming Soon to Franklin text', widget: 'content_image' } }, row)
  assert.deepEqual([altLaunch.level, altLaunch.launch], ['launch', ['Coming Soon']])
  assert.match(ticket.payload.description, /\nExpected: an approved intro media recorded in registry\/campus-open-media\.json campuses\.east-bay \(campus\.intro\.media; equals-approved-media 0 mismatches; severity high\)\n/)
  assert.match(ticket.payload.description, /\n\nMISSING INFO \(agent\/file-observer-findings\.mjs 0\.8, 2026-09-25\)\nThis ticket needs the following before it can be executed:\n1\. the intro slot shows launch-era media[^\n]* \(owner: Yash Chitneni\)\n2\. Record the approved open-state intro media for this campus in registry\/campus-open-media\.json[^\n]* \(owner: Yash Chitneni\)\nWhat is already correct on the page: the campus is Open in HubSpot Programs; nothing on the page is changed until the intro media is recorded\n/)
  assert.ok(!/[—…]/.test(ticket.payload.description))
  assert.deepEqual(none.missingInfo.map((m) => [m.campus, m.state, m.file, m.owner, m.ticketClass]), [['Alpha East Bay', 'Open', 'registry/campus-open-media.json', 'Yash Chitneni', 'observer-media-identity']])
  // The same finding again dedupes against the ticket it filed (campus and row).
  const filed = { id: 'cmeastbay1', status: 'MISSING_INFO', title: ticket.title, url: 'https://alpha.school/east-bay/', customFields: { ...ticket.payload.customFields } }
  const again = planObserverFindings({ run, bundle: checks, queue: [filed], now, registries: withRegistry({}) })
  assert.deepEqual([again.counts.files, again.counts.existing, again.existing[0].existing.via], [0, 1, 'idempotency-key'])

  // (b) a row that names attachment 8550 as current with openMedia null is still no approved media: Missing Info.
  const nullRow = { 'east-bay': { openMedia: null, attachmentId: 8550, status: 'missing', current: "attachment 8550 (Piedmont.webp) visibly says 'Coming Fall 2026 To Piedmont'" } }
  const assessment = missingExpectationFor({ row, finding: run.findings[0], registries: withRegistry(nullRow) })
  assert.equal(assessment.kind, 'missing')
  assert.match(assessment.reason, /^registry\/campus-open-media\.json campuses\.east-bay is recorded but names no approved intro media \(attachmentId 8550, status missing/)
  assert.equal(missingExpectationTitle(assessment), 'no approved intro media recorded for Open campus Alpha East Bay')
  const recordedNull = planObserverFindings({ run, bundle: checks, queue: [], now, registries: withRegistry(nullRow) })
  assert.deepEqual([recordedNull.counts.files, recordedNull.counts.missingInfo, recordedNull.files[0].payload.status], [1, 1, MISSING_INFO_STATUS])
  assert.match(recordedNull.files[0].payload.description, /\nObserved: registry\/campus-open-media\.json campuses\.east-bay is recorded but names no approved intro media/)
  // The committed registry records the card placed on 2026-09-28 (attachment 12142, run open-cards-2026-09-28), so the 2026-09-25 fixture
  // is an expectation recorded since the observer read the registry: nothing files, the report says why.
  resetRegistryCache()
  const committed = planObserverFindings({ run, bundle: checks, queue: [], now })
  assert.deepEqual([committed.counts.files, committed.counts.missingInfo, committed.counts.recordedSince, committed.recordedSince[0].entry.attachmentId], [0, 0, 1, 12142])

  // (c) an approved attachment recorded for the slot: the expectation exists now, nothing files, the report says why.
  const approved = planObserverFindings({ run, bundle: checks, queue: [], now, registries: withRegistry({ 'east-bay': { openMedia: 'card', attachmentId: 8550, status: 'placed' } }) })
  assert.deepEqual([approved.counts.files, approved.counts.missingInfo, approved.counts.recordedSince], [0, 0, 1])
  assert.deepEqual([approved.recordedSince[0].campus, approved.recordedSince[0].file, approved.recordedSince[0].reason, approved.recordedSince[0].entry.attachmentId], ['Alpha East Bay', 'registry/campus-open-media.json', RECORDED_SINCE, 8550])
  const video = planObserverFindings({ run, bundle: checks, queue: [], now, registries: withRegistry({ 'east-bay': { openMedia: 'video', attachmentId: null, status: 'placed' } }) })
  assert.equal(video.counts.recordedSince, 1, 'an approved video is a recorded expectation too')

  // A missingExpectation on a row whose onMissing is skip is telemetry, never a ticket.
  const skipRow = { ...run.findings[0], id: oid('EA57BA0002'), check: 'campus-page-phone-source-sync', field: 'contact.phone' }
  const skipped = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [skipRow] }).dir), bundle: checks, queue: [], now })
  assert.deepEqual([skipped.counts.files, skipped.counts.dropped], [0, 1])
  assert.match(skipped.dropped[0].reason, /^missingExpectation on a row whose expected\.derive\.onMissing is skip/)
})

test('observer filer: coverage findings file one Missing Info per campus and registry gap to the registry owner, informational registries never file, a map-only program-page finding is a source-digest line, an unrendered Open campus is loop health', () => {
  const checks = bundle()
  const run = loadRunFolder(path.join(fixtures, 'coverage-2026-09-25'))
  const now = new Date('2026-09-25T15:00:00Z')
  const coverage = rowForCheck(checks, 'campus-registry-coverage')
  assert.deepEqual([coverage.id, coverage.entitySource, coverage.dedupeScope, coverage.comparator.type, coverage.lifecycleStates, coverage.channel], ['site.coverage.open-campus-registries', 'hubspot-programs', 'campus-registry', 'count-equals', ['Open', 'Announced'], 'ticket'])
  assert.deepEqual(coverage.literals.registries.map((r) => [r.file, r.requiredWhen.type.join('+') || 'informational', r.ownerRole, r.ticketClass]), [
    ['registry/campus-open-media.json', 'Open', 'website-operations', 'observer-media-identity'],
    ['registry/campus-leadership.json', 'Open+Announced', 'campus-roles-confirmer', 'staff-bulk'],
    ['registry/campus-packets.json', 'Open', 'packet-owner', 'observer-packet'],
    ['registry/campus-cta-exceptions.json', 'informational', 'website-agent-operator', 'link-cta'],
  ])
  const page = rowForCheck(checks, 'program-page-present')
  assert.deepEqual([page.id, page.severity, page.ticketClass, page.dedupeScope, page.requireConsecutiveRuns, page.depth], ['site.coverage.program-page', 'critical', 'page-status', 'program', 2, 'http'])
  const rendered = rowForCheck(checks, 'campus-page-rendered')
  assert.deepEqual([rendered.id, rendered.channel, rendered.ticketClass, rendered.ownerRole, rendered.lifecycleStates], ['site.coverage.open-campus-rendered', 'loop-health', 'observer-health', 'observer-owner', ['Open']])
  assert.ok(missingFromMapOnly(run.findings.find((f) => f.id === 'SITE-C0FE000007')))
  assert.ok(!missingFromMapOnly(run.findings.find((f) => f.id === 'SITE-C0FE000006')), 'a 404 page is a page defect even when the map lacks it too')

  // Open-media registry as of the fixture: East Bay and Scottsdale have no approved row; leadership and packets have East Bay and Lexington.
  const registries = { 'registry/campus-open-media.json': { campuses: {} } }
  const plan = planObserverFindings({ run, bundle: checks, queue: [], now, registries })
  assert.deepEqual(plan.counts, { ...plan.counts, files: 3, missingInfo: 2, recordedSince: 1, informational: 2, sourceDigest: 1, loopHealth: 1, invalid: 0, dropped: 0 })
  const byKey = Object.fromEntries(plan.files.map((f) => [f.key, f]))
  assert.deepEqual(Object.keys(byKey).sort(), ['observer:site.coverage.open-campus-registries:campus:east-bay:registry:registry/campus-open-media.json', 'observer:site.coverage.open-campus-registries:campus:scottsdale:registry:registry/campus-open-media.json', 'observer:site.coverage.program-page:program:program-99999999901'])
  const eastBay = byKey['observer:site.coverage.open-campus-registries:campus:east-bay:registry:registry/campus-open-media.json']
  assert.deepEqual([eastBay.title, eastBay.payload.status, eastBay.owner.name, eastBay.payload.customFields.triagedClass, eastBay.payload.customFields.ownerRole, eastBay.payload.customFields.registry], ['no approved intro media recorded for Open campus Alpha East Bay', MISSING_INFO_STATUS, 'Yash Chitneni', 'observer-media-identity', 'website-operations', 'registry/campus-open-media.json'])
  assert.match(eastBay.payload.description, /\n1\. Record the approved open-state intro media for this Open campus in registry\/campus-open-media\.json campuses\.<slug>[^\n]* \(owner: Yash Chitneni\)\n/)
  assert.equal(contractCheck({ ...eastBay.payload, id: 'x', assignees: [{ name: 'Yash Chitneni' }] }).valid, true)
  assert.equal(byKey['observer:site.coverage.open-campus-registries:campus:scottsdale:registry:registry/campus-open-media.json'].title, 'no approved intro media recorded for Open campus Alpha Scottsdale')
  // Leadership: East Bay is recorded, so the coverage finding is recorded-since; the CTA registry is informational; Lexington's packets row exists.
  assert.deepEqual(plan.recordedSince.map((r) => [r.campus, r.file]), [['Alpha East Bay', 'registry/campus-leadership.json']])
  // The CTA registry is informational; a packets row is required for Open campuses only, so Announced Lexington is not-required.
  assert.deepEqual(plan.informational.map((r) => [r.campus, r.file, r.kind]), [['Alpha East Bay', 'registry/campus-cta-exceptions.json', 'informational'], ['Alpha Lexington', 'registry/campus-packets.json', 'not-required']])
  // A leadership gap files to the campus roles confirmer (Hailey) as staff-bulk; a packets gap to the packet owner (Matt) as observer-packet.
  const gaps = planObserverFindings({ run, bundle: checks, queue: [], now, registries: { ...registries, 'registry/campus-leadership.json': { campuses: {} }, 'registry/campus-packets.json': { campuses: {} } } })
  assert.deepEqual(gaps.missingInfo.map((m) => [m.campus, m.state, m.file, m.owner, m.ownerRole, m.ticketClass]).sort(), [
    ['Alpha East Bay', 'Open', 'registry/campus-leadership.json', 'Hailey McSpadden', 'campus-roles-confirmer', 'staff-bulk'],
    ['Alpha East Bay', 'Open', 'registry/campus-open-media.json', 'Yash Chitneni', 'website-operations', 'observer-media-identity'],
    ['Alpha Scottsdale', 'Open', 'registry/campus-open-media.json', 'Yash Chitneni', 'website-operations', 'observer-media-identity'],
  ].sort())
  assert.equal(gaps.missingInfo.find((m) => m.file === 'registry/campus-leadership.json').title, 'no approved campus leadership recorded for Open campus Alpha East Bay')
  // A packets gap on an Open campus files to the packet owner (Yash Chitneni since 2026-10-07) as observer-packet.
  const openPackets = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [{ ...run.findings.find((f) => f.id === 'SITE-C0FE000005'), url: 'https://alpha.school/east-bay/', entity: 'program-42698614786', actual: { ...run.findings.find((f) => f.id === 'SITE-C0FE000005').actual, slug: 'east-bay', campus: 'Alpha East Bay', state: 'Open', programType: 'Open', programId: 'program-42698614786' } }] }).dir), bundle: checks, queue: [], now, registries: { 'registry/campus-packets.json': { campuses: {} } } })
  assert.deepEqual(openPackets.missingInfo.map((m) => [m.campus, m.file, m.owner, m.ticketClass, m.ownerRole]), [['Alpha East Bay', 'registry/campus-packets.json', 'Yash Chitneni', 'observer-packet', 'packet-owner']])
  // The missing page is critical and files to page-status (website operations); the map-only finding is a digest line under hubspot-map-sync.
  const missingPage = byKey['observer:site.coverage.program-page:program:program-99999999901']
  assert.deepEqual([missingPage.payload.status, missingPage.payload.priority, missingPage.payload.customFields.triagedClass, missingPage.owner.role], ['NOT_STARTED', 'HIGH', 'page-status', 'website-operations'])
  assert.deepEqual(plan.sourceDigest.map((d) => [d.check, d.row, d.ownerRole, d.record, d.via]), [['program-page-present', 'site.map.integrity.hubspot-map-sync', 'growth-map-owner', 'Alpha East Bay', 'program-page-present missingFromMap -> site.map.integrity.hubspot-map-sync']])
  // Loop health: the unrendered Open campuses go to the observer owner, never the queue.
  assert.deepEqual(plan.loopHealth.map((l) => [l.check, l.row]), [['campus-page-rendered', 'site.coverage.open-campus-rendered']])
})

test('observer filer 0.7: one Missing Info per campus and registry when the media row and the coverage row both find the campus unrecorded; the observer\'s program-page-present findings are page tickets, never digest lines', () => {
  const checks = bundle()
  const eastBay = loadRunFolder(path.join(fixtures, 'east-bay-2026-09-25'))
  const [media] = eastBay.findings
  const now = new Date('2026-09-25T15:00:00Z')
  // The coverage finding as aeo #37 checkCampusRegistryCoverage emits it: expected {file, keyPath}, actual null, registry the short name, ownerRole from the entry.
  const coverage = { ...media, id: oid('C0FE000011'), check: 'campus-registry-coverage', observerCheck: 'campus-registry-coverage', requirementId: 'site.coverage.open-campus-registries', field: 'campus-open-media', title: 'no campus open media entry recorded for Open campus Alpha East Bay', summary: 'Record the approved open-state intro media for this Open campus.', expected: { file: 'registry/campus-open-media.json', keyPath: 'campuses.east-bay' }, actual: null, observed: null, missingExpectation: true, ownerRole: 'website-operations', registry: 'campus-open-media', entitySource: 'hubspot-programs', dedupeScope: 'campus-registry', ticketClass: 'observer-media-identity', severity: 'high' }
  // program-page-present as aeo #37 checkProgramPagePresent emits it for a Program that is on HubSpot but not on the map: onMap false on the finding, actual the page facts.
  const notNamed = { ...media, id: oid('C0FE000012'), check: 'program-page-present', observerCheck: 'program-page-present', requirementId: 'site.coverage.program-page', field: 'page', title: 'Alpha East Bay campus page does not name the campus', summary: 'https://alpha.school/east-bay/ answers 200 but neither its title nor its H1 names Alpha East Bay.', expected: 'Alpha East Bay', actual: { status: 200, title: 'Alpha Piedmont', h1: ['Alpha Piedmont'] }, observed: undefined, missingExpectation: false, onMap: false, entitySource: 'hubspot-programs', sourceKey: 'hubspot-programs', sourceField: 'website', ticketClass: 'page-status', ownerRole: 'website-operations', severity: 'critical', dedupeScope: 'program' }
  const notFetched = { ...notNamed, id: oid('C0FE000013'), title: 'Alpha East Bay campus page does not answer 200', summary: 'Open Program Alpha East Bay lists https://alpha.school/east-bay/ as its website, but the page was not fetched in this run.', actual: null }
  assert.equal(missingFromMapOnly(notNamed), false, 'a page that does not name the campus is a page defect even when the Program is not on the map')
  assert.equal(missingFromMapOnly(notFetched), false, 'a page the run did not fetch is not a map-only case')
  assert.equal(missingFromMapOnly({ ...notNamed, actual: { status: 200, namesCampus: true, inMap: false, missingFromMap: true } }), true, 'the explicit map-only verdict still goes to the digest')
  assert.equal(missingExpectationKey({ slug: 'east-bay', file: 'registry/campus-open-media.json' }), 'east-bay|registry/campus-open-media.json')

  // A verified bundle in the manifest: the observer applied requireConsecutiveRuns (2 on the page row) already.
  const verified = { checkBundle: { status: 'verified', sha256: checks.sha256 } }
  const run = loadRunFolder(syntheticRun({ pages: 0, extraFindings: [media, coverage, notNamed], manifestExtra: verified }).dir)
  const plan = planObserverFindings({ run, bundle: checks, queue: [], now, registries: { 'registry/campus-open-media.json': { campuses: {} } } })
  assert.deepEqual([plan.counts.files, plan.counts.missingInfo, plan.counts.existing, plan.counts.sourceDigest, plan.counts.invalid], [2, 1, 1, 0, 0])
  const titles = plan.files.map((f) => f.title)
  assert.equal(titles.filter((t) => t === 'no approved intro media recorded for Open campus Alpha East Bay').length, 1, 'exactly one Missing Info for the campus and registry')
  const mediaTicket = plan.files.find((f) => f.title === 'no approved intro media recorded for Open campus Alpha East Bay')
  assert.deepEqual([mediaTicket.key, mediaTicket.payload.status, mediaTicket.owner.name], ['observer:campus.intro.media.current:page:east-bay', MISSING_INFO_STATUS, 'Yash Chitneni'])
  const merged = plan.existing.find((e) => e.check === 'campus-registry-coverage')
  assert.ok(merged, 'the coverage group is reported against the media ticket planned this run')
  assert.deepEqual([merged.existing.id, merged.existing.status], ['observer:campus.intro.media.current:page:east-bay', 'planned this run'])
  assert.match(merged.existing.via, /^same-run missing expectation for Alpha East Bay in registry\/campus-open-media\.json \(campus\.intro\.media\.current\)$/)
  const pageTicket = plan.files.find((f) => f.check === 'program-page-present')
  assert.ok(pageTicket, 'the page that does not name the campus files as a page ticket')
  assert.deepEqual([pageTicket.payload.status, pageTicket.payload.priority, pageTicket.payload.customFields.triagedClass, pageTicket.owner.role], ['NOT_STARTED', 'HIGH', 'page-status', 'website-operations'])
  // Order does not decide which row files: the coverage finding first still leaves one Missing Info.
  const reversed = planObserverFindings({ run: loadRunFolder(syntheticRun({ pages: 0, extraFindings: [coverage, media], manifestExtra: verified }).dir), bundle: checks, queue: [], now, registries: { 'registry/campus-open-media.json': { campuses: {} } } })
  assert.deepEqual([reversed.counts.files, reversed.counts.missingInfo, reversed.counts.existing], [1, 1, 1])
  assert.equal(reversed.files[0].check, 'campus-registry-coverage')
})
