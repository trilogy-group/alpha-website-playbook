import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { classifyOutcome, isObserverTicket, main as telemetryMain, median, precisionReport, receiptsByTicket, receiptsFrom, renderPrecisionSection, summarize } from './telemetry-report.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtures = path.join(root, 'tests', 'fixtures', 'telemetry')
const tickets = JSON.parse(fs.readFileSync(path.join(fixtures, 'observer-tickets.json'), 'utf8'))
const receipts = JSON.parse(fs.readFileSync(path.join(fixtures, 'receipts.json'), 'utf8')).receipts
const now = new Date('2026-09-25T10:00:00.000Z')
const since = new Date('2026-09-01T00:00:00.000Z')
const until = new Date('2026-09-24T23:59:59.999Z')

test('telemetry: an outcome counts one evidence-backed end per ticket and reads resolutionKind', () => {
  const byTicket = receiptsByTicket(receipts)
  const by = Object.fromEntries(tickets.map((t) => [t.id, classifyOutcome(t, byTicket, now)]))
  assert.equal(by['t-site-change'].ended, 'site-change', 'an applied apply-* receipt carrying the ticket id is a site change')
  assert.equal(by['t-source-change'].ended, 'source-change', 'a SOURCE FIX audit line is a source change')
  assert.equal(by['t-decision-blocked'].ended, 'decision', 'Blocked with DECISION NEEDED is a recorded decision')
  assert.equal(by['t-decision-kind'].ended, 'decision', 'resolutionKind blocked-decision is a recorded decision without reading the description')
  assert.equal(by['t-false-positive'].ended, null, 'a cache flush receipt is not a site change')
  assert.equal(by['t-false-positive'].kind, 'false-positive')
  assert.equal(by['t-fixed-elsewhere'].ended, null, 'a rejected mutation receipt is not a site change')
  assert.equal(by['t-fixed-elsewhere'].kind, 'fixed-elsewhere')
  assert.equal(by['t-aged-out'].kind, 'aged-out')
  assert.equal(by['t-open-unclassified'].kind, null)
  assert.equal(by['t-open-unclassified'].closed, false)
  assert.equal(by['t-open-unclassified'].daysOpen, 5, 'an open ticket counts days to the report time')
  assert.equal(by['t-site-change'].daysOpen, 4, 'a closed ticket counts days to completedAt')

  const unrelatedNote = { ...tickets.find((t) => t.id === 't-false-positive'), description: '<p>finding</p><p>SOURCE FIX 2026-09-22: unrelated coordinator note left verbatim.</p><p>RESOLUTION: under threshold.</p>' }
  assert.equal(classifyOutcome(unrelatedNote, byTicket, now).ended, null, 'a recorded false-positive wins over an unrelated audit line')
  assert.equal(classifyOutcome({ ...unrelatedNote, status: 'BLOCKED', description: '<p>DECISION NEEDED</p>' }, byTicket, now).ended, null, 'and over a DECISION NEEDED text match')
  assert.equal(classifyOutcome({ ...unrelatedNote, id: 't-site-change' }, byTicket, now).ended, 'site-change', 'but never over an applied receipt')
  assert.equal(receiptsFrom(receipts), '2026-09-14T09:58:00+00:00')
  assert.equal(receiptsFrom([]), null)
})

test('telemetry: precision, false-positive and fixed-elsewhere rates over the filed window, per run and per check', () => {
  const report = precisionReport(tickets, receipts, { since, until, now })
  const p = report.period
  assert.equal(p.filed, 8, 'observer tickets filed in the window; the August ticket and the staff request are excluded')
  assert.equal(p.ended, 4)
  assert.equal(p.siteChange, 1)
  assert.equal(p.sourceChange, 1)
  assert.equal(p.decision, 2)
  assert.equal(p.precision, 0.5)
  assert.equal(p.falsePositive, 1)
  assert.equal(p.falsePositiveRate, 0.125)
  assert.equal(p.fixedElsewhere, 1)
  assert.equal(p.fixedElsewhereRate, 0.125)
  assert.equal(p.agedOut, 1)
  assert.equal(p.unclassified, 1)
  assert.equal(p.open, 3)
  assert.equal(p.medianDaysOpen, 8.5, 'median of 4, 2, 9, 9, 8, 20, 20, 5 days (Blocked and Not Started count to the report time)')

  const runs = Object.fromEntries(report.byRun.map((r) => [r.key, r]))
  assert.deepEqual(Object.keys(runs).sort(), ['site-events-2026-09-04T10-00-00-000Z', 'site-full-2026-09-10T10-00-00-000Z', 'site-full-2026-09-16T10-00-00-000Z', 'site-full-2026-09-20T10-00-00-000Z'])
  assert.equal(runs['site-full-2026-09-10T10-00-00-000Z'].precision, 1)
  assert.equal(runs['site-full-2026-09-16T10-00-00-000Z'].filed, 3)
  assert.equal(runs['site-full-2026-09-16T10-00-00-000Z'].precision, 2 / 3)
  assert.equal(runs['site-events-2026-09-04T10-00-00-000Z'].precision, 0)
  assert.equal(runs['site-full-2026-09-20T10-00-00-000Z'].unclassified, 1)

  const checks = Object.fromEntries(report.byCheck.map((r) => [r.key, r]))
  assert.equal(checks['preannouncement-community-host'].decision, 2)
  assert.equal(checks['public-event-sync'].fixedElsewhere, 1)
  assert.equal(checks['public-event-sync'].agedOut, 1)
  assert.equal(checks['campus-layout-header-overlap'].falsePositiveRate, 1)
  assert.equal(report.byRun[0].filed, 3, 'groups sort by filed count, largest first')
})

test('telemetry: an empty window renders n/a rather than dividing by zero, and the section names every rate', () => {
  const empty = precisionReport(tickets, receipts, { since: new Date('2027-01-01T00:00:00Z'), now })
  assert.equal(empty.period.filed, 0)
  assert.equal(empty.period.precision, null)
  assert.equal(median([]), null)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1]), 2.5)
  const section = renderPrecisionSection(empty, { since: new Date('2027-01-01T00:00:00Z'), label: 'shadow' })
  assert.match(section, /## Observer precision \(shadow, tickets filed 2027-01-01 to now\)/)
  assert.match(section, /\| Precision \| n\/a \(0 of 0\) \|/)
  assert.match(section, /_none_/)
  assert.match(section, /No receipts were available/)
  assert.match(renderPrecisionSection(empty, { receiptsFrom: '2026-09-21T23:07:32+00:00' }), /earliest receipt is 2026-09-21/)
  const full = renderPrecisionSection(precisionReport(tickets, receipts, { since, until, now }), { since, until, label: 'pre-redesign' })
  assert.match(full, /\| Precision \| 50\.0% \(4 of 8\) \|/)
  assert.match(full, /\| False-positive rate \| 12\.5% \(1\) \|/)
  assert.match(full, /\| Fixed-elsewhere rate \| 12\.5% \(1\) \|/)
  assert.match(full, /\| campus-layout-header-overlap \| 1 \| 0\.0% \|/)
  assert.equal(summarize([]).precision, null)
})

test('telemetry CLI: writes the report from files without a token or a network call', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-telemetry-'))
  const out = path.join(dir, 'report.md')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('network must not be called') }
  try {
    const result = await telemetryMain(['--since', '2026-09-01', '--until', '2026-09-24T23:59:59Z', '--label', 'fixture', '--tickets-file', path.join(fixtures, 'observer-tickets.json'), '--receipts-file', path.join(fixtures, 'receipts.json'), '--out', out], { APEX_API_TOKEN: '' })
    assert.equal(result.precision.period.filed, 8)
    const md = fs.readFileSync(out, 'utf8')
    assert.match(md, /## Observer precision \(fixture, tickets filed 2026-09-01 to 2026-09-24\)/)
    assert.match(md, /\| Receipts stored \| 4 \|/)
    assert.match(md, /\| Open or completed website Requests seen \| 10 \|/)
  } finally {
    globalThis.fetch = originalFetch
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('telemetry: the filer\'s tickets (agent-found with a filerRunId) are observer tickets and group by observerCheck when check is absent', () => {
  const filerTicket = { id: 't-filer', title: 'Alpha Raleigh: fails "No other campus in image file names"', status: 'COMPLETED', createdAt: '2026-09-24T15:00:00.000Z', completedAt: '2026-09-25T09:00:00.000Z', description: 'Matt Barge: fix it\n\nRESOLUTION (agent/file-observer-findings.mjs 0.3, 2026-09-25, playbook check bundle)', customFields: { source: 'agent-found', filerRunId: 'site-full-2026-09-24T14-28-40-974Z', observerCheck: 'campus-image-identity-conflict', resolutionKind: 'check-cleared' } }
  const sweepFind = { id: 't-sweep', title: 'Sync mapping: grade title derivation', status: 'NOT_STARTED', createdAt: '2026-09-24T15:00:00.000Z', description: 'Element: hero.title', customFields: { source: 'agent-found', checkId: 'sync-mapping' } }
  assert.equal(isObserverTicket(filerTicket), true, 'agent-found with a filerRunId is the filer\'s')
  assert.equal(isObserverTicket(sweepFind), false, 'agent-found without a filerRunId is a sweep agent\'s find, not an observer ticket')
  assert.equal(isObserverTicket({ ...filerTicket, customFields: { ...filerTicket.customFields, filerRunId: '  ' } }), false, 'a blank filerRunId does not count')
  assert.equal(isObserverTicket(tickets.find((t) => t.id === 't-site-change')), true, 'the observer\'s own tickets still count')
  const report = precisionReport([...tickets, filerTicket, sweepFind], receipts, { since, until, now })
  assert.equal(report.period.filed, 9, 'the fixture\'s 8 plus the filer ticket; the sweep find is excluded')
  const outcome = report.outcomes.find((o) => o.id === 't-filer')
  assert.equal(outcome.check, 'campus-image-identity-conflict', 'observerCheck stands in for check')
  assert.equal(outcome.runId, 'site-full-2026-09-24T14-28-40-974Z', 'filerRunId stands in for runId')
  assert.equal(outcome.kind, 'check-cleared')
  assert.equal(report.byCheck.find((c) => c.key === 'campus-image-identity-conflict').filed, 2, 'grouped with the observer\'s own ticket on the same check')
  assert.ok(report.byRun.some((r) => r.key === 'site-full-2026-09-24T14-28-40-974Z'))
  assert.equal(classifyOutcome({ ...filerTicket, customFields: { ...filerTicket.customFields, check: 'explicit-check' } }, receiptsByTicket(receipts), now).check, 'explicit-check', 'check wins when both are present')
})

test('precision reads APEX first-class upper-case resolutionKind; EXECUTED counts as a change; closes with no kind are counted', async () => {
  const { classifyOutcome, precisionReport, resolutionKindOf } = await import('./telemetry-report.mjs')
  const t = (id, extra) => ({ id, status: 'COMPLETED', createdAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-03T00:00:00Z', customFields: { source: 'agent-found', filerRunId: 'run-1', observerCheck: 'images-render' }, ...extra })
  assert.equal(resolutionKindOf(t('a', { resolutionKind: 'CHECK_CLEARED' })), 'check-cleared')
  assert.equal(resolutionKindOf(t('b', { customFields: { resolutionKind: 'false-positive' } })), 'false-positive')
  const byTicket = new Map()
  assert.equal(classifyOutcome(t('c', { resolutionKind: 'EXECUTED' }), byTicket).ended, 'site-change')
  assert.equal(classifyOutcome(t('d', { resolutionKind: 'FALSE_POSITIVE' }), byTicket).kind, 'false-positive')
  assert.equal(classifyOutcome(t('e', { resolutionKind: 'BLOCKED_DECISION' }), byTicket).ended, 'decision')
  const report = precisionReport([t('f', { resolutionKind: 'EXECUTED' }), t('g', {}), t('h', { resolutionKind: 'FALSE_POSITIVE' })], [], { since: new Date('2026-09-01'), now: new Date('2026-10-15') })
  assert.equal(report.period.ended, 1)
  assert.equal(report.period.falsePositive, 1)
  assert.equal(report.period.closedWithoutKind, 1)
})

test('precision gate lists checks over minFiled and under minPrecision in the trailing window, from spec/filing-policy.json', async () => {
  const { pauseCandidates, renderPauseSection, readFilingPolicy } = await import('./telemetry-report.mjs')
  const policy = readFilingPolicy()
  assert.deepEqual([policy.precision.windowDays, policy.precision.minFiled, policy.precision.minPrecision], [28, 10, 0.5])
  const now = new Date('2026-10-15T00:00:00Z')
  const mk = (check, i, kind) => ({ id: `${check}-${i}`, status: kind ? 'COMPLETED' : 'BLOCKED', createdAt: '2026-10-10T00:00:00Z', resolutionKind: kind, customFields: { source: 'agent-found', filerRunId: 'run-1', observerCheck: check } })
  const tickets = [
    ...Array.from({ length: 12 }, (_, i) => mk('images-render', i, i < 2 ? 'EXECUTED' : null)),
    ...Array.from({ length: 12 }, (_, i) => mk('campus-source-status-sentence', i, 'EXECUTED')),
    ...Array.from({ length: 4 }, (_, i) => mk('rare-check', i, null)),
    { ...mk('images-render', 99, null), createdAt: '2026-08-01T00:00:00Z' },
  ]
  const gate = pauseCandidates(tickets, [], policy, now)
  assert.deepEqual(gate.candidates.map((c) => [c.key, c.filed]), [['images-render', 12]], 'precise checks, small samples and tickets outside the window are not candidates')
  assert.match(renderPauseSection(gate), /\| images-render \| 12 \| 16\.7% \|/)
})
