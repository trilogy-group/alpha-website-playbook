// agent/queue-aging.mjs (protocol 1e, repair 6 of docs/qc-loop-repair-plan-2026-09-25.md): the clock on Blocked and Missing Info.
// Fixture: tests/fixtures/queue-aging/queue-2026-09-25.json, tickets as the agent API returns them (comments, activityLog),
// one of them unhydrated; now is 2026-09-25T21:40:00Z. Assignee ids are Yash Chitneni and Matt Barge from registry/people.json.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  ESCALATE_AFTER_DAYS,
  NUDGE_AFTER_DAYS,
  NUDGE_MARKER,
  NUDGE_REPEAT_DAYS,
  QueueAgingError,
  appendNudge,
  applyPlan,
  classifyTicket,
  cleanText,
  createApexClient,
  familyFilterDrift,
  groupClassGaps,
  hydrateQueue,
  isClassGap,
  isWebsiteTicket,
  loadBundle,
  loadPeople,
  loadQueue,
  main,
  movementAt,
  nudgeMarkers,
  operatorFor,
  peopleIndex,
  planQueueAging,
  renderMarkdown,
  renderSlackDraft,
} from '../agent/queue-aging.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURE = path.join(root, 'tests', 'fixtures', 'queue-aging', 'queue-2026-09-25.json')
const NOW = '2026-09-25T21:40:00Z'
const bundle = loadBundle()
const people = loadPeople()
const queue = loadQueue(FIXTURE)
const byId = Object.fromEntries(queue.map((t) => [t.id, t]))
const plan = () => planQueueAging({ queue, now: NOW, bundle, people })
const itemFor = (p, id) => p.items.find((i) => i.id === id)

test('thresholds are the protocol\'s: three days nudge, seven days escalate, a nudge repeats after seven', () => {
  assert.equal(NUDGE_AFTER_DAYS, 3)
  assert.equal(ESCALATE_AFTER_DAYS, 7)
  assert.equal(NUDGE_REPEAT_DAYS, 7)
  assert.equal(operatorFor(bundle, people).name, 'Matt Barge')
})

test('website filter: the family filter or an alpha.school URL; a videography ticket on a HubSpot URL is excluded', () => {
  assert.equal(isWebsiteTicket(byId['ok-blocked-recent'], bundle), true)
  assert.equal(isWebsiteTicket(byId['classgap-east-bay'], bundle), true, 'agent-found source is in the family')
  assert.equal(isWebsiteTicket(byId['excluded-videography'], bundle), false)
  assert.equal(isWebsiteTicket({ id: 'x', title: 'Anything', url: 'https://www.alpha.school/austin/', customFields: {} }, bundle), true)
  assert.equal(isWebsiteTicket({ id: 'x', title: 'Anything', url: 'https://alphahigh.school/', customFields: {} }, bundle), false)
  assert.equal(cleanText('Website \u2014 Alpha Southlake\u2026'), 'Website - Alpha Southlake...')
  assert.equal(familyFilterDrift(bundle), null, 'the literal observer patterns equal the bundle\'s family filter strings')
  assert.throws(() => isWebsiteTicket(byId['ok-blocked-recent'], { ...bundle, familyFilter: { ...bundle.familyFilter, observerTitlePattern: '^Beta ' } }), (e) => e instanceof QueueAgingError && e.code === 'FILTER_DRIFT')
})

test('movement ignores intake customFields writes, same-status reconciles and the nudge\'s own description change', () => {
  const nudge = movementAt(byId['nudge-blocked-4d'])
  assert.equal(nudge.at, '2026-09-21T12:00:00.000Z', 'the comment on 09-21 is the last movement; the 09-25 customFields write and the BLOCKED->BLOCKED reconcile are not')
  assert.equal(nudge.hydrated, true)
  const suppressed = movementAt(byId['suppressed-nudged-2d-ago'])
  assert.equal(suppressed.at, '2026-09-20T10:00:00.000Z', 'the description change that appended the marker does not count')
  const oldMarker = movementAt(byId['escalate-old-marker-9d'])
  assert.equal(oldMarker.at, '2026-09-16T12:00:00.000Z', 'an assignee change counts; the marker append after it does not')
  const unhydrated = movementAt(byId['escalate-not-hydrated-8d'])
  assert.equal(unhydrated.at, '2026-09-17T10:00:00.000Z')
  assert.equal(unhydrated.hydrated, false)
  assert.match(unhydrated.kind, /updatedAt/)
  assert.equal(movementAt(byId['escalate-missing-11d']).kind, 'clarification request')
})

test('classification: ok, nudge, escalate, class-gap, repeat-suppressed', () => {
  const p = plan()
  assert.equal(itemFor(p, 'ok-blocked-recent').classification, 'ok')
  assert.equal(itemFor(p, 'ok-in-progress-old').classification, 'ok', 'In Progress is not a held status, however old')
  const nudge = itemFor(p, 'nudge-blocked-4d')
  assert.equal(nudge.classification, 'nudge')
  assert.equal(nudge.nudgeSuppressed, false)
  assert.equal(nudge.idleDays, 4)
  assert.equal(nudge.person, 'Yash Chitneni')
  const escalate = itemFor(p, 'escalate-missing-11d')
  assert.equal(escalate.classification, 'escalate')
  assert.equal(escalate.idleDays, 11)
  assert.equal(escalate.person, 'dawn.adams@alpha.school', 'a Missing Info ticket names the requester; unknown to the registry, by email')
  assert.equal(itemFor(p, 'escalate-old-marker-9d').classification, 'escalate', 'a marker older than the repeat window does not stop escalation')
  assert.equal(itemFor(p, 'escalate-not-hydrated-8d').classification, 'escalate')
  const noPerson = itemFor(p, 'escalate-no-person')
  assert.equal(noPerson.classification, 'escalate')
  assert.match(noPerson.reason, /no named person/)
  const suppressed = itemFor(p, 'suppressed-nudged-2d-ago')
  assert.equal(suppressed.classification, 'nudge')
  assert.equal(suppressed.nudgeSuppressed, true)
  assert.equal(suppressed.lastNudgeAt, '2026-09-23')
  for (const id of ['classgap-east-bay', 'classgap-new-york', 'classgap-no-check']) {
    assert.equal(itemFor(p, id).classification, 'class-gap', id)
    assert.equal(isClassGap(byId[id]), true)
  }
  assert.equal(itemFor(p, 'excluded-videography'), undefined, 'not a website ticket, not in the plan')
  assert.deepEqual(p.counts, { open: 12, website: 11, excluded: 1, held: 9, blocked: 8, missingInfo: 1, ok: 2, nudge: 1, nudgeSuppressed: 1, escalate: 4, classGap: 3, notHydrated: 1 })
})

test('class gaps are grouped by check id, largest first, and are never nudged whatever their age', () => {
  const p = plan()
  assert.deepEqual(p.classGaps, [
    { checkId: 'open-intro-media-approved', count: 2, ids: ['classgap-east-bay', 'classgap-new-york'] },
    { checkId: 'no check id', count: 1, ids: ['classgap-no-check'] },
  ])
  assert.deepEqual(groupClassGaps(p.items).map((g) => g.checkId), ['open-intro-media-approved', 'no check id'])
  const observer = planQueueAging({ queue: [
    { ...byId['classgap-no-check'], id: 'obs-1', customFields: { source: 'alpha-site-qc', check: 'public-event-sync', checkId: 'SITE-B4C2DC337D', ownerRole: 'internal-triage' } },
    { ...byId['classgap-no-check'], id: 'obs-2', customFields: { source: 'alpha-site-qc', check: 'public-event-sync', checkId: 'SITE-0443A66DE1', ownerRole: 'internal-triage' } },
    { ...byId['classgap-no-check'], id: 'obs-3', customFields: { source: 'alpha-site-qc', checkId: 'SITE-1316C237AD', ownerRole: 'internal-triage' } },
  ], now: NOW, bundle, people })
  assert.deepEqual(observer.classGaps, [
    { checkId: 'public-event-sync (observer)', count: 2, ids: ['obs-1', 'obs-2'] },
    { checkId: 'SITE-1316C237AD', count: 1, ids: ['obs-3'] },
  ], 'observer incident ids group by the check name; one without a name stays on its id')
  assert.equal(p.nudges.some((n) => n.id.startsWith('classgap')), false)
  const aged = planQueueAging({ queue: [{ ...byId['classgap-new-york'], createdAt: '2026-08-01T00:00:00Z', activityLog: [] }], now: NOW, bundle, people })
  assert.equal(aged.items[0].classification, 'class-gap')
  assert.equal(aged.nudges.length, 0)
  assert.equal(aged.escalations.length, 0)
})

test('the nudge note is the agingNudge template: person first, what it waits on, the marker last; no em dash', () => {
  const p = plan()
  assert.equal(p.nudges.length, 1)
  const note = p.nudges[0].note
  const lines = note.split('\n')
  assert.equal(lines[0], 'QUEUE AGING NUDGE (queue-aging 0.1, 2026-09-25)')
  assert.equal(lines[1], 'Yash Chitneni: this ticket has been Blocked for 4 days with no movement since 2026-09-21.')
  assert.equal(lines[2], 'Waiting on: DECISION NEEDED: does the Dean of Parents card go before the guides?')
  assert.match(lines[3], /^Next step: answer the question/)
  assert.match(lines[4], /escalates to Matt Barge after 7 days idle \(protocol 1e\)/)
  assert.equal(lines.at(-1), `${NUDGE_MARKER} nudge-blocked-4d 2026-09-25`)
  assert.equal(note.includes('—'), false)
  assert.deepEqual(nudgeMarkers({ description: appendNudge('Requester text.', note) }), [{ ticketId: 'nudge-blocked-4d', date: '2026-09-25' }])
  assert.equal(appendNudge('Requester text.  \n', note), `Requester text.\n\n${note}\n`, 'the requester text stays first')
  const missing = classifyTicket({ ...byId['escalate-missing-11d'], activityLog: [{ action: 'agent_clarification_requested', createdAt: '2026-09-21T09:00:00Z', meta: {} }] }, { now: NOW, index: peopleIndex(people), operator: operatorFor(bundle, people) })
  assert.equal(missing.classification, 'nudge')
  const missingPlan = planQueueAging({ queue: [{ ...byId['escalate-missing-11d'], activityLog: [{ action: 'agent_clarification_requested', createdAt: '2026-09-21T09:00:00Z', meta: {} }] }], now: NOW, bundle, people })
  assert.match(missingPlan.nudges[0].note, /^dawn\.adams@alpha\.school: this ticket has been in Missing Info for 4 days/m)
  assert.match(missingPlan.nudges[0].note, /^Waiting on: items 1\. Dawn Adams: headshot for Jane Roe \(owner: Dawn Adams\); 2\./m)
  assert.match(missingPlan.nudges[0].note, /^Next step: add the items to the ticket/m)
})

test('the escalation is the agingEscalation template with one line per ticket and the class gaps by check id', () => {
  const p = plan()
  const lines = p.escalationText.split('\n')
  assert.equal(lines[0], 'QUEUE AGING ESCALATION (2026-09-25)')
  assert.equal(lines[1], 'Matt Barge: 4 website tickets have been Blocked or in Missing Info for 7 days or more with no movement.')
  assert.ok(lines.includes('- escalate-missing-11d [MISSING_INFO, 11 days idle, dawn.adams@alpha.school]: Website: Alpha Raleigh staff headshots'))
  assert.ok(lines.includes('- escalate-no-person [BLOCKED, 0 days idle, no named person]: Website: Alpha Scottsdale Book a Call widget'))
  assert.ok(lines.includes('Class gaps (3 tickets in needs-rule or internal-triage): playbook defects, a missing class or owner; add the class, never nudge the requester.'))
  assert.ok(lines.includes('- open-intro-media-approved (2): classgap-east-bay, classgap-new-york'))
  assert.equal(lines.at(-1), 'Nothing closes automatically; a stale ticket is closed only by a person.')
  assert.equal(p.escalationText.includes('—'), false)
  const draft = renderSlackDraft(p)
  assert.match(draft, /^## #support-websites summary$/m)
  assert.match(draft, /11 open website tickets, 9 held \(Blocked 8, Missing Info 1\)/)
  assert.match(draft, /Nudged today: 1 \(idle 3 days or more; 1 already nudged this week\)\. Escalated to Matt Barge: 4/)
  assert.match(draft, /^## Escalation to Matt Barge \(website-agent-operator\), sent by a person$/m)
  assert.match(draft, /nothing is sent by the script/)
  const md = renderMarkdown(p)
  assert.match(md, /^## Escalate \(4\)$/m)
  assert.match(md, /^- open-intro-media-approved \(2\): classgap-east-bay, classgap-new-york$/m)
  assert.match(md, /^### nudge-blocked-4d$/m)
})

test('main writes the report, the markdown and the slack draft from an offline queue and posts nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-aging-'))
  const logs = []
  const { plan: p } = await main(['--queue', FIXTURE, '--now', NOW, '--report', path.join(dir, 'report.json'), '--markdown', path.join(dir, 'report.md'), '--slack-draft', path.join(dir, 'slack-draft.md')], {}, { log: (l) => logs.push(l), error: () => {} })
  assert.equal(p.mode, 'dry-run')
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'))
  assert.equal(report.counts.nudge, 1)
  assert.equal(report.counts.escalate, 4)
  assert.equal(report.counts.classGap, 3)
  assert.equal(report.applied, undefined)
  assert.ok(fs.existsSync(path.join(dir, 'report.md')))
  assert.match(fs.readFileSync(path.join(dir, 'slack-draft.md'), 'utf8'), /QUEUE AGING ESCALATION/)
  const summary = JSON.parse(logs.at(-1))
  assert.deepEqual(summary.classGapsByCheckId, { 'open-intro-media-approved': 2, 'no check id': 1 })
  await assert.rejects(main(['--queue', FIXTURE, '--apply'], { APEX_API_TOKEN: 't' }, { log: () => {}, error: () => {} }), (e) => e instanceof QueueAgingError && e.code === 'MISSING_ARG')
  await assert.rejects(main([], {}, { log: () => {}, error: () => {} }), (e) => e instanceof QueueAgingError && e.code === 'MISSING_TOKEN')
})

function mockApex(live, { onPatch } = {}) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ url: String(url), method, body })
    const id = String(url).split('/tasks/')[1]
    if (method === 'GET' && live[id]) return new Response(JSON.stringify(live[id]), { status: 200, headers: { 'content-type': 'application/json' } })
    if (method === 'PATCH' && live[id]) { onPatch?.(id, body); return new Response(JSON.stringify({ ...live[id], ...body }), { status: 200, headers: { 'content-type': 'application/json' } }) }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'content-type': 'application/json' } })
  }
  return { calls, apex: createApexClient({ env: { APEX_API_TOKEN: 'token', APEX_API_BASE: 'https://apex.example/api/v1' }, fetchImpl }) }
}

test('apply posts the nudge as a description-only v1 PATCH, requester text first; never status, assignees or agentEligible', async () => {
  const p = plan()
  const live = { 'nudge-blocked-4d': { ...byId['nudge-blocked-4d'], comments: undefined, activityLog: undefined } }
  const { calls, apex } = mockApex(live)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'queue-aging-apply-'))
  const results = await applyPlan(p, { apex, writesFile: path.join(dir, 'writes.jsonl'), now: NOW })
  assert.deepEqual(results.posted, [{ id: 'nudge-blocked-4d', person: 'Yash Chitneni' }])
  assert.deepEqual(results.skipped, [])
  assert.deepEqual(results.errors, [])
  const patch = calls.find((c) => c.method === 'PATCH')
  assert.equal(patch.url, 'https://apex.example/api/v1/tasks/nudge-blocked-4d')
  assert.deepEqual(Object.keys(patch.body), ['description'])
  assert.ok(patch.body.description.startsWith('Requester text.\n\nBLOCKED (sweep, 2026-09-21)'), 'the existing description is kept first')
  assert.ok(patch.body.description.trimEnd().endsWith(`${NUDGE_MARKER} nudge-blocked-4d 2026-09-25`))
  for (const forbidden of ['status', 'agentStatus', 'agentEligible', 'assignees', 'customFields']) assert.equal(forbidden in patch.body, false, forbidden)
  assert.equal(calls.filter((c) => c.method === 'PATCH').length, 1, 'escalations, class gaps and suppressed nudges are never written')
  const writes = fs.readFileSync(path.join(dir, 'writes.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(writes.length, 1)
  assert.equal(writes[0].write, 'nudge')
  assert.equal(writes[0].ticket, 'nudge-blocked-4d')
})

test('apply refuses a ticket that moved since the plan or already carries a marker inside the repeat window', async () => {
  const p = plan()
  const moved = mockApex({ 'nudge-blocked-4d': { ...byId['nudge-blocked-4d'], status: 'IN_PROGRESS' } })
  const r1 = await applyPlan(p, { apex: moved.apex, now: NOW })
  assert.equal(r1.posted.length, 0)
  assert.match(r1.skipped[0].reason, /status is IN_PROGRESS/)
  assert.equal(moved.calls.some((c) => c.method === 'PATCH'), false)
  const updated = mockApex({ 'nudge-blocked-4d': { ...byId['nudge-blocked-4d'], updatedAt: '2026-09-25T21:41:00.000Z' } })
  const r2 = await applyPlan(p, { apex: updated.apex, now: NOW })
  assert.match(r2.skipped[0].reason, /updated 2026-09-25T21:41:00.000Z after the plan/)
  const marked = mockApex({ 'nudge-blocked-4d': { ...byId['nudge-blocked-4d'], description: `${byId['nudge-blocked-4d'].description}\n\n${NUDGE_MARKER} nudge-blocked-4d 2026-09-24\n` } })
  const r3 = await applyPlan(p, { apex: marked.apex, now: NOW })
  assert.match(r3.skipped[0].reason, /already nudged on 2026-09-24/)
  assert.equal(marked.calls.some((c) => c.method === 'PATCH'), false)
  const gone = mockApex({})
  const r4 = await applyPlan(p, { apex: gone.apex, now: NOW })
  assert.equal(r4.errors.length, 1)
  assert.match(r4.errors[0].error, /404/)
})

test('hydration reads held and class-gap website tickets through the agent API and keeps the rest as listed', async () => {
  const listed = queue.map((t) => ({ ...t, comments: undefined, activityLog: undefined }))
  const reads = []
  const apex = { hydrate: async (id) => { reads.push(id); if (id === 'escalate-not-hydrated-8d') throw new Error('boom'); return byId[id] } }
  const { queue: hydrated, warnings } = await hydrateQueue(listed, { apex, bundle })
  assert.equal(reads.includes('excluded-videography'), false, 'not a website ticket')
  assert.equal(reads.includes('ok-in-progress-old'), false, 'not held, not a class gap')
  assert.equal(reads.includes('classgap-no-check'), true, 'a NOT_STARTED class gap is read')
  assert.equal(reads.includes('nudge-blocked-4d'), true)
  assert.deepEqual(warnings, [{ id: 'escalate-not-hydrated-8d', error: 'boom' }])
  assert.equal(Array.isArray(hydrated.find((t) => t.id === 'nudge-blocked-4d').activityLog), true)
  assert.equal(hydrated.find((t) => t.id === 'escalate-not-hydrated-8d').activityLog, undefined)
})
