import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runValidation } from './validate-playbook.mjs'
import { composeDescription, triageCustomFields, TRIAGE_BODY_MARKER } from './triage-ticket.mjs'
import {
  administrativeAction,
  applyDuplicateCandidates,
  assigneePatch,
  clarificationRequirements,
  intakeCustomFieldsPatch,
  UNRESOLVED_OWNER_ROLE,
  evaluateTicket,
  resolveDecisionOwner,
  normalizePersonName,
  ticketInputSha256,
} from '../agent/intake-policy.mjs'
import {
  RosterDiffError,
  buildPlan,
  deckFromJson,
  exportDeckPptx,
  loadDeckRegistry,
  parseDeckPptx,
  parseLiveCards,
  parseRenderedTeam,
  personKey,
  renderMarkdown,
  resolveDeck,
} from '../agent/roster-diff.mjs'
import { buildSyntheticPptx, syntheticImage } from './fixtures/roster-diff/build-synthetic-pptx.mjs'
import { AttachEvidenceError, MAX_BYTES, MAX_SECTION_LENGTH, apexBases, attachEvidence, main as attachEvidenceMain, planEvidence } from '../agent/attach-evidence.mjs'
import { DEVICE_SCALE_FACTOR, PADDING_PX, SectionShotError, VIEWPORTS as SECTION_VIEWPORTS, clipWithPadding, outputFile, parseArgs as parseSectionArgs, planSectionShot, slugify } from './section-shot.mjs'
import { VERTICAL_MIN_COVERAGE, frameCoverage, frameForFit, judgeFraming, parseObjectPosition, scoreCards, teamPhotoFramingCheck } from './photo-framing.mjs'
import { FrameHeadshotError, cropWindow, decodePng, encodePng, main as frameMain, parseFocus, parseRatio, planFrame } from '../agent/frame-headshot.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bundle = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'policy-bundle.generated.json'), 'utf8'))

test('playbook specifications and references validate', () => {
  const result = runValidation()
  assert.deepEqual(result.errors, [])
})

test('APEX duplicate search matches canonical page and person', () => {
  const output = execFileSync(process.execPath, [
    'tests/search-apex-tickets.mjs',
    '--file', 'tests/fixtures/apex-search-tickets.json',
    '--url', 'https://alpha.school/austin/',
    '--text', 'John Doe',
  ], { cwd: root, encoding: 'utf8' })
  const result = JSON.parse(output)
  assert.equal(result.matches, 1)
  assert.equal(result.items[0].id, 'ticket-austin-placeholder')
})

// Cross-harness decision fixtures (improvement plan workstream 7): every fixture must produce the expected
// outcome, class, and owner role from the policy bundle alone. A second harness runs the same fixtures.
test('decision fixtures replay to the expected decision and administrative action', () => {
  const dir = path.join(root, 'tests', 'fixtures', 'decisions')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  assert.ok(files.length >= 20, `expected at least 20 decision fixtures, found ${files.length}`)
  const fixtures = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  const input = path.join(os.tmpdir(), `alpha-decision-fixtures-${process.pid}.json`)
  const report = path.join(os.tmpdir(), `alpha-decision-report-${process.pid}.json`)
  fs.writeFileSync(input, JSON.stringify(fixtures.map((f) => f.task)))
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'intake.mjs'), '--file', input, '--replay', '--report', report, '--force'], { encoding: 'utf8', env: { ...process.env, APEX_API_TOKEN: '' } })
  assert.equal(run.status, 0, run.stderr)
  const results = Object.fromEntries(JSON.parse(fs.readFileSync(report, 'utf8')).results.map((r) => [r.id, r]))
  const mismatches = []
  for (const f of fixtures) {
    const r = results[f.task.id]
    if (!r) { mismatches.push(`${f.task.id}: not decided`); continue }
    const got = { outcome: r.outcome, class: r.class || null, ownerRole: r.ownerRole || null, actionKind: r.action?.kind || null }
    const expectedAction = actionKindForOutcome(f.expected.outcome)
    for (const key of ['outcome', 'class', 'ownerRole']) if (got[key] !== f.expected[key]) mismatches.push(`${f.task.id} ${key}: got ${got[key]}, expected ${f.expected[key]} (${f.expected.why})`)
    if (got.actionKind !== expectedAction) mismatches.push(`${f.task.id} actionKind: got ${got.actionKind}, expected ${expectedAction} (${f.expected.why})`)
  }
  assert.deepEqual(mismatches, [])
})

test('requester clarifications are typed and never collapse staff fields into generic details', () => {
  const result = evaluateTicket(bundle, {
    id: 'typed-clarification',
    title: 'Website — Add team member — Alpha Austin',
    status: 'NOT_STARTED',
    program: ['Alpha Austin'],
    requesterEmail: 'requester@alpha.school',
    customFields: { requestFamily: 'website', websiteRequestType: 'add_team_member' },
  })
  const requirements = clarificationRequirements(bundle, result).requirements
  assert.deepEqual(requirements.map((item) => item.key), ['teamMemberName', 'teamMemberEmail', 'publicTitle', 'bio', 'headshot'])
  assert.ok(requirements.every((item) => item.responseType && item.validation))
  assert.ok(!requirements.some((item) => item.key === 'details'))
})

test('canonical campus URL is derived from the registry and never requested from staff', () => {
  const fixture = decisionFixture('intake-derivable-campus-url.json')
  fixture.task.targetUrl = 'https://alpha.school/?page_id=9850&preview=true'
  const result = evaluateTicket(bundle, fixture.task)
  assert.equal(result.found.pageUrl, 'https://alpha.school/austin/')
  assert.ok(!result.requesterMissing.includes('pageUrl'))
  assert.equal(result.outcome, 'ready-for-execution')
})

test('requester revisions and verified assets change the intake input hash', () => {
  const base = { id: 'hash-input', title: 'Website — Add team member — Alpha Austin', customFields: {} }
  const initial = ticketInputSha256(base)
  const revised = ticketInputSha256({ ...base, revisions: [{ id: 'r1', source: 'REQUESTER', responseData: { bio: 'New bio' }, createdAt: '2026-09-17T00:00:00Z' }] })
  const withAsset = ticketInputSha256({ ...base, assets: [{ id: 'a1', kind: 'headshot', checksum: 'abc', status: 'VERIFIED', source: 'CLARIFICATION' }] })
  assert.notEqual(initial, revised)
  assert.notEqual(initial, withAsset)
})

test('an unverified or invalid headshot never makes a staff ticket ready', () => {
  const fixture = decisionFixture('intake-derivable-campus-url.json')
  fixture.task.assets[0].status = 'PENDING'
  const result = evaluateTicket(bundle, fixture.task)
  assert.equal(result.outcome, 'missing-info')
  assert.deepEqual(result.requesterMissing, ['staffHeadshot'])
})

test('an unattached image is not inferred to belong to a staff member', () => {
  const fixture = decisionFixture('intake-derivable-campus-url.json')
  delete fixture.task.customFields.webTmHeadshotAssetId
  delete fixture.task.customFields.webTmHeadshotAsset
  if (fixture.task.originalSubmission) delete fixture.task.originalSubmission.webTmHeadshotAssetId
  const result = evaluateTicket(bundle, fixture.task)
  assert.equal(result.outcome, 'missing-info')
  assert.deepEqual(result.requesterMissing, ['staffHeadshot'])
})

test('present but invalid requester fields remain missing', () => {
  const fixture = decisionFixture('intake-derivable-campus-url.json')
  fixture.task.customFields.webTmEmail = 'not-an-email'
  fixture.task.customFields.webTmBio = 'Too short'
  const result = evaluateTicket(bundle, fixture.task)
  assert.equal(result.outcome, 'missing-info')
  assert.deepEqual(result.requesterMissing, ['staffEmail', 'staffBio'])
  assert.deepEqual(result.invalid, ['staffEmail', 'staffBio'])
})

test('a unique exact APEX user match supplies a known staff email without requester churn', () => {
  const fixture = decisionFixture('intake-derivable-campus-url.json')
  delete fixture.task.customFields.webTmEmail
  const usersByExactName = new Map([[normalizePersonName('Avery Example'), { name: 'Avery Example', email: 'avery.example@alpha.school' }]])
  const result = evaluateTicket(bundle, fixture.task, { usersByExactName })
  assert.equal(result.found.staffEmail, 'avery.example@alpha.school')
  assert.ok(!result.requesterMissing.includes('staffEmail'))
  assert.equal(result.outcome, 'ready-for-execution')
})

test('staff updates require the specific photo, bio, or title named by the request', () => {
  const fixture = decisionFixture('cmu4kvhy500000agm20nunige.json')
  fixture.task.customFields.requestDetail = 'Add the missing photo and bio to the existing Morgan Hatt card.'
  const usersByExactName = new Map([[normalizePersonName('Morgan Hatt'), { name: 'Morgan Hatt', email: 'morgan.hatt@alpha.school' }]])
  const result = evaluateTicket(bundle, fixture.task, { usersByExactName })
  assert.equal(result.outcome, 'missing-info')
  assert.deepEqual(result.requesterMissing, ['staffHeadshot', 'staffBio'])

  const titleOnly = decisionFixture('cmu2vht58000004l5e0f1fka2.json')
  const titleResult = evaluateTicket(bundle, titleOnly.task)
  assert.equal(titleResult.outcome, 'ready-for-execution')
  assert.ok(!titleResult.requesterMissing.includes('staffHeadshot'))
  assert.ok(!titleResult.requesterMissing.includes('staffBio'))
})

test('intake-owned fields do not create an intake loop', () => {
  const base = { id: 'hash-owned', title: 'Website — Alpha Austin', customFields: { requestFamily: 'website' } }
  const administered = {
    ...base,
    customFields: {
      ...base.customFields,
      intakeHash: 'done',
      intakePendingHash: 'pending',
      intakeVersion: '0.2',
      intakeDecision: { outcome: 'missing-info' },
      ownerRole: 'requester',
    },
  }
  assert.equal(ticketInputSha256(base), ticketInputSha256(administered))
})

test('human comments trigger re-evaluation while intake-authored comments do not', () => {
  const base = { id: 'hash-comments', title: 'Website — Alpha Austin', customFields: {} }
  const human = { ...base, comments: [{ id: 'human-1', body: 'Here is the missing title.' }] }
  const agent = {
    ...base,
    comments: [{ id: 'agent-1', body: 'Automated intake note.' }],
    activityLog: [{ meta: { commentId: 'agent-1' } }],
  }
  assert.notEqual(ticketInputSha256(base), ticketInputSha256(human))
  assert.equal(ticketInputSha256(base), ticketInputSha256(agent))
})

test('exact duplicate candidates are held for review and never auto-closed', () => {
  const fixture = decisionFixture('intake-derivable-campus-url.json')
  const second = structuredClone(fixture.task)
  second.id = 'intake-derivable-campus-url-copy'
  const results = applyDuplicateCandidates([evaluateTicket(bundle, fixture.task), evaluateTicket(bundle, second)])
  for (const result of results) {
    assert.equal(result.outcome, 'duplicate-candidate')
    assert.equal(result.ownerRole, 'internal-triage')
    assert.equal(administrativeAction(result).kind, 'blocked-review')
    assert.equal(result.relatedTicketIds.length, 1)
  }
})

test('duplicate detection never weakens a policy denial', () => {
  const fixture = decisionFixture('intake-extra-campus-button-denied.json')
  fixture.task.targetUrl = 'https://alpha.school/short-hills/'
  const second = structuredClone(fixture.task)
  second.id = 'intake-extra-campus-button-denied-copy'
  const results = applyDuplicateCandidates([evaluateTicket(bundle, fixture.task), evaluateTicket(bundle, second)])
  for (const result of results) {
    assert.equal(result.outcome, 'policy-denied')
    assert.equal(result.ownerRole, 'website-operations')
    assert.equal(administrativeAction(result).kind, 'blocked-review')
    assert.equal(result.relatedTicketIds.length, 1)
  }
})

test('intake does not request clarification when APEX has no requester', () => {
  const result = evaluateTicket(bundle, {
    id: 'missing-requester',
    title: 'Website — Add team member — Alpha Austin',
    status: 'NOT_STARTED',
    program: ['Alpha Austin'],
    customFields: { requestFamily: 'website', websiteRequestType: 'add_team_member' },
  })
  assert.equal(result.outcome, 'intake-defect')
  assert.equal(result.ownerRole, 'internal-triage')
  assert.equal(administrativeAction(result).kind, 'blocked-review')
})

test('CLI replay and pure evaluator make the same decision', () => {
  const fixture = decisionFixture('intake-derivable-campus-url.json')
  const pure = resolveDecisionOwner(bundle, evaluateTicket(bundle, fixture.task), fixture.task)
  const input = path.join(os.tmpdir(), `alpha-one-fixture-${process.pid}.json`)
  const report = path.join(os.tmpdir(), `alpha-one-report-${process.pid}.json`)
  fs.writeFileSync(input, JSON.stringify([fixture.task]))
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'intake.mjs'), '--file', input, '--replay', '--report', report, '--force'], { encoding: 'utf8', env: { ...process.env, APEX_API_TOKEN: '' } })
  assert.equal(run.status, 0, run.stderr)
  const cli = JSON.parse(fs.readFileSync(report, 'utf8')).results[0]
  assert.deepEqual(
    { outcome: cli.outcome, class: cli.class, ownerRole: cli.ownerRole, ownerResolution: cli.ownerResolution, action: cli.action, decisionSha256: cli.decisionSha256 },
    { outcome: pure.outcome, class: pure.class, ownerRole: pure.ownerRole, ownerResolution: pure.ownerResolution, action: administrativeAction(pure), decisionSha256: pure.decisionSha256 },
  )
})

test('intake finalizes its hash only after the APEX administrative action succeeds', async () => {
  const failed = await runMockApply({ failStatus: true })
  assert.equal(failed.run.code, 0, failed.run.stderr)
  assert.equal(failed.patches.length, 1)
  assert.ok(failed.patches[0].customFields.intakePendingHash)
  assert.equal(failed.patches[0].customFields.intakeHash, undefined)
  assert.equal(failed.patches[0].agentStatus, 'BLOCKED')
  assert.equal(failed.patches[0].agentEligible, false)
  assert.equal(failed.report.results[0].applied.ok, false)

  const succeeded = await runMockApply({ failStatus: false })
  assert.equal(succeeded.run.code, 0, succeeded.run.stderr)
  assert.equal(succeeded.patches.length, 2)
  assert.ok(succeeded.patches[0].customFields.intakePendingHash)
  assert.equal(succeeded.patches[1].customFields.intakePendingHash, undefined)
  assert.equal(succeeded.patches[1].customFields.intakeHash, succeeded.patches[0].customFields.intakePendingHash)
  assert.equal(succeeded.report.results[0].applied.ok, true)
  assert.equal(succeeded.report.results[0].applied.clarificationDelivery, 'sent')
})

test('a human route to an APEX agent operator stays out of the execution queue', async () => {
  const routed = await runMockApply({ failStatus: false, mode: 'operator-route' })
  assert.equal(routed.run.code, 0, routed.run.stderr)
  assert.equal(routed.report.results[0].action.kind, 'owner-route')
  assert.equal(routed.report.results[0].applied.api, 'v1-owner-route-safe-hold')
  assert.equal(routed.task.agentEligible, false)
  assert.equal(routed.task.agentStatus, 'BLOCKED')
  assert.equal(routed.task.assignees[0].id, bundle.roleOwners['website-agent-operator'][0].apexUserId)
})

test('an execution-ready ticket is untouched when Alpha MCP release attestation fails', async () => {
  const held = await runMockApply({ failStatus: false, mode: 'execution-ready', skipReleaseCheck: false })
  assert.equal(held.run.code, 0, held.run.stderr)
  assert.equal(held.report.results[0].action.kind, 'execution-ready')
  assert.equal(held.report.results[0].applied.ok, false)
  assert.match(held.report.results[0].applied.error, /release attestation failed/)
  assert.equal(held.patches.length, 0)
})

test('an attested execution-ready ticket can enter the scheduled queue', async () => {
  const released = await runMockApply({ failStatus: false, mode: 'execution-ready', skipReleaseCheck: false, releaseAttested: true })
  assert.equal(released.run.code, 0, released.run.stderr)
  assert.equal(released.report.results[0].action.kind, 'execution-ready')
  assert.equal(released.report.results[0].applied.ok, true)
  assert.equal(released.report.results[0].applied.api, 'agent-reconcile')
  assert.equal(released.patches.length, 2)
  assert.equal(released.task.agentEligible, true)
})

function decisionFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'decisions', name), 'utf8'))
}

function actionKindForOutcome(outcome) {
  if (outcome === 'out-of-scope') return 'no-action'
  if (outcome === 'missing-info') return 'request-clarification'
  if (outcome === 'ready-for-execution') return 'execution-ready'
  if (outcome === 'routed') return 'owner-route'
  return 'blocked-review'
}

async function runMockApply({ failStatus, mode = 'clarification', skipReleaseCheck = true, releaseAttested = false }) {
  const operatorRoute = mode === 'operator-route'
  const executionReady = mode === 'execution-ready'
  const task = {
    id: `mock-apply-${operatorRoute ? 'operator-route' : executionReady ? 'execution-ready' : failStatus ? 'failure' : 'success'}`,
    title: operatorRoute ? 'Website (Other) — Alpha Austin' : 'Website — Add team member — Alpha Austin',
    status: 'NOT_STARTED',
    updatedAt: '2026-09-17T18:00:00.000Z',
    requestType: 'Website',
    program: ['Alpha Austin'],
    requesterEmail: 'requester@alpha.school',
    customFields: operatorRoute
      ? { requestFamily: 'website', websiteRequestType: 'links', requestDetail: 'Update Book a Call to https://go.alpha.school/meetings/alpha-school/austin.' }
      : executionReady
        ? {
            requestFamily: 'website',
            websiteRequestType: 'add_team_member',
            webTmName: 'Avery Example',
            webTmEmail: 'avery.example@alpha.school',
            webTmTitle: 'Guide',
            webTmBio: 'A complete approved biography for the release-attestation test.',
            webTmHeadshotAssetId: 'asset-1',
          }
        : { requestFamily: 'website', websiteRequestType: 'add_team_member' },
    assets: executionReady ? [{ id: 'asset-1', status: 'VERIFIED', mimeType: 'image/jpeg', sizeBytes: 1024 }] : [],
    revisions: [],
    clarifications: [],
    comments: [],
    activityLog: [],
    agentInstructions: [],
    assignees: [],
  }
  const patches = []
  const server = http.createServer(async (request, response) => {
    const body = await readRequestJson(request)
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(value))
    }
    if (request.method === 'GET' && request.url === '/api/v1/users?limit=500') return send(200, { users: [{ id: 'requester-user', email: task.requesterEmail, name: 'Requester' }] })
    if (request.method === 'GET' && request.url === `/api/agent/tasks/${task.id}`) return send(200, task)
    if (request.method === 'PATCH' && request.url === `/api/v1/tasks/${task.id}`) {
      patches.push(structuredClone(body))
      if (body.customFields) task.customFields = body.customFields
      if (body.assignees?.set) task.assignees = body.assignees.set
      for (const key of ['status', 'agentStatus', 'agentEligible']) if (key in body) task[key] = body[key]
      task.updatedAt = new Date(new Date(task.updatedAt).getTime() + 1000).toISOString()
      return send(200, { task })
    }
    if (request.method === 'POST' && request.url === `/api/agent/tasks/${task.id}/claim`) {
      task.agentStatus = 'CLAIMED'
      task.agentRunId = body.agentRunId
      return send(200, { task })
    }
    if (request.method === 'POST' && request.url === `/api/agent/tasks/${task.id}/status`) {
      if (failStatus) return send(500, { error: 'simulated status failure' })
      task.status = 'MISSING_INFO'
      task.agentStatus = 'MISSING_INFO'
      task.clarifications.push({ id: 'clarification-1', kind: 'INFORMATION_REQUEST', status: 'OPEN', message: body.note })
      task.comments.push({ id: 'agent-comment-1', body: body.note })
      task.activityLog.push({ meta: { commentId: 'agent-comment-1' } })
      task.updatedAt = new Date(new Date(task.updatedAt).getTime() + 1000).toISOString()
      return send(200, { ...task, clarificationDelivery: { status: 'sent' } })
    }
    if (request.method === 'POST' && request.url === `/api/agent/tasks/${task.id}/reconcile`) {
      task.status = 'APPROVED'
      task.agentStatus = 'READY'
      task.agentEligible = true
      task.updatedAt = new Date(new Date(task.updatedAt).getTime() + 1000).toISOString()
      return send(200, { task })
    }
    return send(404, { error: `${request.method} ${request.url} not mocked` })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const input = path.join(os.tmpdir(), `alpha-mock-input-${process.pid}-${failStatus}.json`)
  const reportPath = path.join(os.tmpdir(), `alpha-mock-report-${process.pid}-${failStatus}.json`)
  const healthPath = path.join(os.tmpdir(), `alpha-mock-health-${process.pid}-${failStatus}.json`)
  fs.writeFileSync(input, JSON.stringify([task]))
  if (releaseAttested) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'release-manifest.json'), 'utf8'))
    fs.writeFileSync(healthPath, JSON.stringify({
      pluginVersion: manifest.production.pluginVersion,
      abilitySchemaSha256: manifest.production.abilitySchemaSha256,
      operatorMode: manifest.production.operatorMode,
      productionWritesEnabled: manifest.production.productionWritesEnabled,
      configuration: {
        abilities: Array.from({ length: manifest.production.abilityCount }, (_, index) => `ability-${index}`),
        syncedCssIds: bundle.syncedCssIds,
        campusTemplateId: manifest.production.campusTemplateId,
        disabledAbilities: [],
      },
    }))
  }
  const childArgs = [path.join(root, 'agent', 'intake.mjs'), '--file', input, '--apply', '--report', reportPath, '--force']
  if (skipReleaseCheck) childArgs.push('--skip-release-check')
  // Real WordPress credentials in the developer's shell would let the child attest for real; the mock decides attestation.
  const isolated = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ALPHA_WP_') && k !== 'ALPHA_MCP_HEALTH_JSON'))
  const run = await runChild(process.execPath, childArgs, {
    ...isolated,
    APEX_API_TOKEN: 'test-token',
    APEX_API_BASE: `http://127.0.0.1:${address.port}/api/v1`,
    APEX_AGENT_API_BASE: `http://127.0.0.1:${address.port}/api/agent`,
    ...(releaseAttested ? { ALPHA_MCP_HEALTH_JSON: healthPath } : {}),
  })
  await new Promise((resolve) => server.close(resolve))
  return { run, patches, task, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) }
}

function readRequestJson(request) {
  return new Promise((resolve) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => resolve(body ? JSON.parse(body) : {}))
  })
}

function runChild(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

// Small-batch defects, 2026-09-17 (six live tickets): observer id overwritten, assignees replaced, empty owner role.
test('intake never overwrites foreign custom fields such as the observer checkId', () => {
  const existing = { checkId: 'SITE-31323DE752', source: 'alpha-site-qc', requestFamily: 'website', ownerRole: 'stale' }
  const patched = intakeCustomFieldsPatch(existing, { ownerRole: 'website-operations', intakePendingHash: 'abc', intakeVersion: '0.2' })
  assert.equal(patched.checkId, 'SITE-31323DE752')
  assert.equal(patched.source, 'alpha-site-qc')
  assert.equal(patched.ownerRole, 'website-operations')
  assert.throws(() => intakeCustomFieldsPatch(existing, { checkId: 'media' }), /refused: checkId/)
})

test('intake adds the resolved owner to assignees without removing existing assignees', () => {
  const existing = [{ id: 'user-farhan' }, { id: 'user-yash' }]
  const patch = assigneePatch(existing, 'user-owner')
  assert.deepEqual(patch.assignees.set.map((item) => item.id), ['user-farhan', 'user-yash', 'user-owner'])
  assert.deepEqual(assigneePatch(existing, 'user-yash'), {}, 'owner already assigned: no patch')
  assert.deepEqual(assigneePatch(existing, null), {}, 'no owner: existing assignment preserved')
  assert.deepEqual(assigneePatch(undefined, 'user-owner').assignees.set, [{ id: 'user-owner' }])
})

test('an empty owner role routes to the unresolved-owner queue, never to an empty string', () => {
  for (const emptyRole of ['', '   ', null, undefined]) {
    const result = { id: 'boston-empty-owner', outcome: 'routed', ownerRole: emptyRole, policySha256: bundle.policySha256, inputSha256: 'x' }
    resolveDecisionOwner(bundle, result, { id: 'boston-empty-owner', requesterEmail: 'someone@alpha.school' })
    assert.equal(result.ownerRole, UNRESOLVED_OWNER_ROLE)
    assert.equal(result.outcome, 'owner-unresolved')
    assert.equal(result.ownerResolution, 'unresolved-owner-role')
    assert.equal(result.ownerUser, null)
    assert.match(result.reason, /unresolved-owner queue/)
    assert.equal(administrativeAction(result).kind, 'blocked-review')
  }
})

test('triage keeps the requester description first and regenerates only the rendered body', () => {
  const original = 'Please update the Santa Barbara page.\nPage: https://alpha.school/santa-barbara/'
  const first = composeDescription(original, 'Owner: fix path\n\nWhat was asked: v1')
  assert.ok(first.startsWith(original), 'original words come first')
  assert.ok(first.includes(`${TRIAGE_BODY_MARKER}\nOwner: fix path`))
  const second = composeDescription(first, 'Owner: fix path\n\nWhat was asked: v2')
  assert.ok(second.startsWith(original))
  assert.equal(second.split(TRIAGE_BODY_MARKER).length, 2, 'exactly one rendered body')
  assert.ok(second.includes('v2') && !second.includes('v1'), 'rendered body regenerated in place')
  assert.equal(composeDescription('', 'body'), `${TRIAGE_BODY_MARKER}\nbody`)
})

test('triage keeps an existing checkId and records the class separately', () => {
  const cf = triageCustomFields({ checkId: 'SITE-31323DE752', source: 'alpha-site-qc' }, { checkId: 'media', ownerRole: 'website-operations' })
  assert.equal(cf.checkId, 'SITE-31323DE752')
  assert.equal(cf.triagedClass, 'media')
  assert.equal(triageCustomFields({}, { checkId: 'media' }).checkId, 'media')
})

// Roster diff (agent/roster-diff.mjs): a read-only planning tool. Fixtures are synthetic; nobody in them exists.
const rosterDir = path.join(root, 'tests', 'fixtures', 'roster-diff')
const rosterJson = (name) => JSON.parse(fs.readFileSync(path.join(rosterDir, name), 'utf8'))
const rosterDeckEntry = () => resolveDeck(rosterJson('decks-registry.json'), { campus: 'example-campus' })
const rosterPlan = (live = parseLiveCards(rosterJson('live-cards.json')), spec = rosterJson('synthetic-deck.json')) =>
  buildPlan({ deckEntry: rosterDeckEntry(), deck: parseDeckPptx(buildSyntheticPptx(spec)), live, now: new Date('2026-09-21T00:00:00Z') })
const rosterError = (fn, code) => assert.throws(fn, (e) => e instanceof RosterDiffError && e.code === code, `expected ${code}`)

test('roster diff parses the exported deck into person slides in export order', () => {
  const deck = parseDeckPptx(buildSyntheticPptx(rosterJson('synthetic-deck.json')))
  assert.equal(deck.slideCount, 8)
  assert.deepEqual(deck.skipped.map((s) => s.slide), [1, 8], 'cover and closing slides are skipped, not guessed at')
  assert.deepEqual(deck.slides.map((s) => [s.slide, s.name, s.title]).slice(0, 2), [[2, 'Dr. Avery Example', 'HEAD GUIDE'], [3, 'Jordan Lee Sample', 'GUIDE · LEVEL 1']])
  assert.deepEqual(deck.slides[1].warnings, [], 'stray text in the tall portrait frame is neither the name nor the title')
  const avery = deck.slides[0]
  assert.equal(avery.bio, 'Avery has guided invented students for ten invented years.')
  assert.equal(avery.image.sha256, crypto.createHash('sha256').update(syntheticImage('avery')).digest('hex'))
  assert.deepEqual([avery.image.slideId, avery.image.imageObjectId, avery.image.idBasis], ['pptx-slide-2', 'pptx-slide-2-image-1', 'pptx-export-order'])
  const devon = deck.slides.find((s) => s.name === 'Devon Unfilled')
  assert.deepEqual([devon.bio, devon.image], [null, null], 'template placeholders are not a bio or a photo')
})

test('roster diff plans adds, removes, and title, bio, and photo changes for review', () => {
  const plan = rosterPlan()
  assert.equal(plan.status, 'for-review')
  assert.equal(plan.readOnly, true)
  assert.deepEqual(plan.adds.map((a) => a.name), ['Riley Placeholder'])
  assert.deepEqual(plan.removes.map((r) => r.name), ['Quinn Departed'])
  assert.deepEqual(plan.titleChanges.map((t) => [t.name, t.liveTitle, t.deckTitle]), [['Jordan Sample', 'Lead Guide', 'GUIDE · LEVEL 1']])
  assert.deepEqual(plan.bioChanges.map((b) => b.name), ['Casey Morgan-Fixture'])
  assert.deepEqual(plan.photoChanges.map((p) => [p.name, p.status]), [['Casey Morgan-Fixture', 'bytes-differ']])
  assert.deepEqual(plan.photoUnknown.map((p) => [p.name, p.status]), [['Jordan Sample', 'photo-unknown'], ['Devon Unfilled', 'deck-photo-missing']])
  assert.deepEqual(plan.unchanged.map((u) => [u.name, u.photo]), [['Avery Example', 'same-bytes'], ['Devon Unfilled', 'deck-photo-missing']], 'all-caps deck titles equal to the page title are not a change')
  assert.ok(!('order' in plan) && !JSON.stringify(plan).includes('placement":'), 'membership only: no order or placement')
  const md = renderMarkdown(plan)
  assert.match(md, /Read only\. The deck is source material/)
  assert.match(md, /Riley Placeholder, CAMPUS COORDINATOR \(slide 4\)/)
})

test('roster diff proposes a binding for each add and photo change and binds nothing', () => {
  const plan = rosterPlan()
  const binding = plan.adds[0].proposedBinding
  assert.equal(binding.status, 'proposed-not-bound')
  assert.equal(binding.ticket, null, 'the operator names the ticket')
  assert.equal(binding.requesterReference, null, 'the operator quotes the ticket text')
  assert.deepEqual(Object.keys(binding.source).sort(), ['imageObjectId', 'kind', 'mimeType', 'presentationId', 'sha256', 'sizeBytes', 'slideId', 'sourceRevisionId', 'url'], 'same source fields bind-headshot.mjs sends')
  assert.equal(binding.source.kind, 'slides-image')
  assert.equal(binding.source.sha256, crypto.createHash('sha256').update(syntheticImage('riley')).digest('hex'))
  assert.match(binding.source.sourceRevisionId, /^pptx-content-sha256:[0-9a-f]{64}$/)
  assert.match(binding.command, /^node agent\/bind-headshot\.mjs --ticket '<ticket id>' --person 'Riley Placeholder' .* --dry-run$/)
  assert.ok(plan.photoChanges[0].proposedBinding, 'a photo change carries a proposed binding too')
  const source = fs.readFileSync(path.join(root, 'agent', 'roster-diff.mjs'), 'utf8')
  for (const forbidden of [/APEX_API_TOKEN/, /ALPHA_WP_/, /method:\s*'(POST|PUT|PATCH|DELETE)'/, /staff-asset-binding/, /request-assets/]) assert.doesNotMatch(source, forbidden, `read-only tool must not contain ${forbidden}`)
})

test('roster diff normalizes honorifics, case, credentials, middle names, and whitespace', () => {
  assert.equal(personKey('Dr.  Avery   EXAMPLE').full, personKey('avery example').full)
  assert.equal(personKey('<b>Ms. Avery Example</b>, PhD').full, 'avery example')
  assert.equal(personKey('Avery Example Jr.').full, 'avery example')
  assert.equal(personKey('Avéry Example\u200b').full, 'avery example')
  assert.equal(personKey('Jordan Lee Sample').firstLast, personKey('Jordan Sample').firstLast)
  const plan = rosterPlan()
  assert.deepEqual(plan.nameNotes.map((n) => [n.kind, n.deckName, n.liveName]), [['honorific', 'Dr. Avery Example', 'Avery Example'], ['middle-or-extra-name', 'Jordan Lee Sample', 'Jordan Sample']])
  assert.deepEqual(plan.nameConflicts.map((c) => [c.deckName, c.liveName]), [['Taylor Specimen', 'Tayler Specimen']], 'a near spelling is a conflict for a person, never an add plus a remove')
})

test('roster diff fails closed on an ambiguous name match', () => {
  const live = rosterJson('live-cards.json')
  live.cards.push({ name: 'Jordan Q. Sample', title: 'Guide' })
  rosterError(() => rosterPlan(parseLiveCards(live)), 'ambiguous_name_match')
  const twice = rosterJson('live-cards.json')
  twice.cards.push({ name: 'Dr. Avery Example', title: 'Dean' })
  rosterError(() => rosterPlan(parseLiveCards(twice)), 'ambiguous_name_match')
  const spec = rosterJson('synthetic-deck.json')
  spec.slides.splice(2, 0, { name: 'Avery Example', title: 'GUIDE' })
  rosterError(() => rosterPlan(undefined, spec), 'ambiguous_name_match')
})

test('roster diff fails closed on an unregistered deck, an unexportable deck, and a slide without a name', async () => {
  rosterError(() => resolveDeck(loadDeckRegistry(), { campus: 'atlantis' }), 'deck_not_registered')
  rosterError(() => resolveDeck(loadDeckRegistry(), { deck: 'not-a-registered-presentation' }), 'deck_not_registered')
  rosterError(() => resolveDeck(rosterJson('decks-registry.json'), { deck: 'synthetic-unmatched-id' }), 'deck_not_registered')
  rosterError(() => resolveDeck(rosterJson('decks-registry.json'), { campus: 'example-campus', deck: 'some-other-deck' }), 'deck_not_registered')
  assert.equal(resolveDeck(rosterJson('decks-registry.json'), { deck: 'synthetic-presentation-id' }).campus, 'example-campus')

  const signIn = async () => new Response('<html>Sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } })
  await assert.rejects(exportDeckPptx('synthetic-presentation-id', { fetchImpl: signIn }), (e) => e.code === 'deck_not_exportable')
  await assert.rejects(exportDeckPptx('synthetic-presentation-id', { fetchImpl: async () => new Response('', { status: 404 }) }), (e) => e.code === 'deck_not_exportable')
  await assert.rejects(exportDeckPptx('synthetic-presentation-id', { fetchImpl: async () => { throw new Error('offline') } }), (e) => e.code === 'deck_not_exportable')
  rosterError(() => parseDeckPptx(Buffer.from('not a zip at all, just text')), 'deck_not_exportable')

  const spec = rosterJson('synthetic-deck.json')
  spec.slides[3] = { name: '[ Name ]', title: '[ROLE]' }
  assert.deepEqual(parseDeckPptx(buildSyntheticPptx(spec)).skipped.map((s) => s.slide), [1, 4, 8], 'an untouched template slide names no one: skipped and listed')
  spec.slides[3] = { name: '[ Name ]', title: 'LEAD GUIDE' }
  rosterError(() => parseDeckPptx(buildSyntheticPptx(spec)), 'slide_without_name')
  assert.equal(parseDeckPptx(buildSyntheticPptx(spec), { allowOpenRoles: true }).skipped.find((s) => s.slide === 4).openRoleTitle, 'LEAD GUIDE', 'an open role is skipped only when the operator allows it')
  spec.slides[3] = { name: '[ Name ]', title: 'GUIDE', bio: 'A real bio on a slide nobody named.', image: 'nameless' }
  rosterError(() => parseDeckPptx(buildSyntheticPptx(spec), { allowOpenRoles: true }), 'slide_without_name')
  rosterError(() => deckFromJson({ slides: [{ slide: 2, name: '  ', title: 'GUIDE' }] }), 'slide_without_name')
})

test('roster diff reads live cards from get_page, a staff cards list, and the rendered page alike', () => {
  const fromPage = parseLiveCards(rosterJson('live-get-page.json'))
  assert.equal(fromPage.source, 'mcp-get-page')
  assert.deepEqual(fromPage.cards.map((c) => [c.name, c.title, c.attachmentId]), [['Avery Example', 'Head Guide', 9002], ['Quinn Departed', 'Head of Schools', 9001]])
  assert.equal(fromPage.cards[0].bio, 'Avery has guided invented students for ten invented years.')
  const rendered = parseRenderedTeam(fs.readFileSync(path.join(rosterDir, 'live-page.html'), 'utf8'))
  assert.deepEqual(rendered.cards.map((c) => [c.name, c.title, c.attachmentId, c.bio]), fromPage.cards.map((c) => [c.name, c.title, c.attachmentId, c.bio]))
  rosterError(() => parseLiveCards({ objectId: 1, widgets: [], images: [] }), 'live_cards_unreadable')
  rosterError(() => parseLiveCards({ match: { id: 'abc' } }), 'live_cards_unreadable')
})

test('roster diff CLI writes the plan and summary, and exits 2 with a typed error', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-roster-diff-'))
  const pptx = path.join(tmp, 'deck.pptx')
  fs.writeFileSync(pptx, buildSyntheticPptx(rosterJson('synthetic-deck.json')))
  const base = [path.join(root, 'agent', 'roster-diff.mjs'), '--registry', path.join(rosterDir, 'decks-registry.json'), '--deck-file', pptx, '--live', path.join(rosterDir, 'live-cards.json')]
  const ok = spawnSync(process.execPath, [...base, '--campus', 'example-campus', '--redact-bios', '--out', tmp, '--images-dir', path.join(tmp, 'images')], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)
  const plan = JSON.parse(fs.readFileSync(path.join(tmp, 'roster-diff-example-campus.plan.json'), 'utf8'))
  assert.deepEqual(plan.summary, { adds: 1, removes: 1, titleChanges: 1, bioChanges: 1, photoChanges: 1, photoUnknown: 2, nameNotes: 2, nameConflicts: 1, unchanged: 2, warnings: 0 })
  assert.ok(!JSON.stringify(plan).includes('Casey wrote a new bio'), '--redact-bios keeps hashes and lengths only')
  assert.ok(fs.existsSync(path.join(tmp, 'roster-diff-example-campus.md')))
  const extracted = plan.adds[0].proposedBinding.extractedFile
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(extracted)).digest('hex'), plan.adds[0].proposedBinding.source.sha256, 'the extracted review file is the hashed deck image')
  const bad = spawnSync(process.execPath, [...base, '--campus', 'atlantis'], { encoding: 'utf8' })
  assert.equal(bad.status, 2)
  assert.equal(JSON.parse(bad.stderr).error.code, 'deck_not_registered')
})

// Screenshot evidence on the ticket, 2026-09-22: ring 2's desktop and mobile PNGs go to APEX so the reviewer sees them in the panel.
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
function evidenceFixture({ desktopBytes = Buffer.concat([PNG_HEADER, Buffer.from('desktop')]), mobileBytes = Buffer.concat([PNG_HEADER, Buffer.from('mobile')]) } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-attach-evidence-'))
  const desktop = path.join(tmp, 'austin-desktop.png'); fs.writeFileSync(desktop, desktopBytes)
  const mobile = path.join(tmp, 'austin-mobile.png'); fs.writeFileSync(mobile, mobileBytes)
  return { tmp, desktop, mobile, args: { ticket: 'cmticket1', run: 'sweep-2026-09-22-a', page: 'https://alpha.school/austin/', desktop, mobile } }
}
function attachError(fn, code) {
  try { fn() } catch (error) { assert.ok(error instanceof AttachEvidenceError, error.stack); assert.equal(error.code, code); return error }
  assert.fail(`expected ${code}`)
}
async function attachErrorAsync(promise, code) {
  try { await promise } catch (error) { assert.ok(error instanceof AttachEvidenceError, error.stack); assert.equal(error.code, code); return error }
  assert.fail(`expected ${code}`)
}
/** A fetch double that records each multipart post the way the APEX route would read it. */
function mockApex(respond) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const form = init.body
    const file = form.get('file')
    const fields = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file'))
    const bytes = Buffer.from(await file.arrayBuffer())
    const call = { url, method: init.method, authorization: init.headers.Authorization, fields, file: { name: file.name, type: file.type, size: file.size, sha256: crypto.createHash('sha256').update(bytes).digest('hex') } }
    calls.push(call)
    const reply = respond(call, calls.length)
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } })
  }
  return { calls, fetchImpl }
}

test('attach-evidence hashes both screenshots, derives the APEX bases like intake, and writes nothing on --dry-run', async () => {
  const fixture = evidenceFixture()
  const plan = planEvidence({ ...fixture.args, label: ' After staff update ', 'captured-at': '2026-09-22T09:58:00Z' })
  assert.deepEqual(plan.screenshots.map((s) => [s.viewport, s.mimeType, s.sizeBytes, s.capturedAt]), [['desktop', 'image/png', 15, '2026-09-22T09:58:00.000Z'], ['mobile', 'image/png', 14, '2026-09-22T09:58:00.000Z']])
  assert.equal(plan.screenshots[0].sha256, crypto.createHash('sha256').update(fs.readFileSync(fixture.desktop)).digest('hex'))
  assert.equal(plan.label, 'After staff update')
  assert.match(planEvidence(fixture.args).screenshots[1].capturedAt, /^\d{4}-\d{2}-\d{2}T/, 'defaults to the file mtime')
  assert.deepEqual(apexBases({}), { v1Base: 'https://apex.2hourlearning.com/api/v1', agentBase: 'https://apex.2hourlearning.com/api/agent', origin: 'https://apex.2hourlearning.com' })
  assert.equal(apexBases({ APEX_API_BASE: 'http://127.0.0.1:4010' }).agentBase, 'http://127.0.0.1:4010/api/agent')
  assert.equal(apexBases({ APEX_API_BASE: 'http://127.0.0.1:4010/api/v1/', APEX_AGENT_API_BASE: 'http://127.0.0.1:4011/api/agent/' }).agentBase, 'http://127.0.0.1:4011/api/agent')
  const logs = []
  const dry = await attachEvidenceMain(['--ticket', 'cmticket1', '--run', 'r', '--page', 'https://alpha.school/austin/', '--desktop', fixture.desktop, '--mobile', fixture.mobile, '--dry-run'], { APEX_API_TOKEN: '' }, { log: (line) => logs.push(line), error: () => {} })
  assert.equal(dry.dryRun, true)
  assert.equal(JSON.parse(logs[0]).dryRun, true)
  assert.ok(!JSON.stringify(dry).includes('"bytes"'), 'the plan shown never carries the bytes')
})

test('attach-evidence fails closed with typed errors: missing args, non-https or query page, missing file, not an image, over 6 MB, no token', async () => {
  const fixture = evidenceFixture()
  assert.equal(attachError(() => planEvidence({ ...fixture.args, ticket: undefined }), 'MISSING_ARG').message, '--ticket is required')
  attachError(() => planEvidence({ ...fixture.args, run: true }), 'MISSING_ARG')
  attachError(() => planEvidence({ ...fixture.args, mobile: undefined }), 'MISSING_ARG')
  attachError(() => planEvidence({ ...fixture.args, page: 'http://alpha.school/austin/' }), 'BAD_PAGE_URL')
  attachError(() => planEvidence({ ...fixture.args, page: 'https://alpha.school/austin/?nocache=1' }), 'BAD_PAGE_URL')
  attachError(() => planEvidence({ ...fixture.args, page: 'alpha.school/austin' }), 'BAD_PAGE_URL')
  attachError(() => planEvidence({ ...fixture.args, 'captured-at': 'yesterday' }), 'MISSING_ARG')
  const missing = attachError(() => planEvidence({ ...fixture.args, desktop: path.join(fixture.tmp, 'nope.png') }), 'MISSING_FILE')
  assert.match(missing.message, /ENOENT/)
  const svg = path.join(fixture.tmp, 'fake.png'); fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>')
  attachError(() => planEvidence({ ...fixture.args, desktop: svg }), 'NOT_IMAGE')
  const big = path.join(fixture.tmp, 'big.png'); fs.writeFileSync(big, Buffer.concat([PNG_HEADER, Buffer.alloc(MAX_BYTES - PNG_HEADER.length + 1)]))
  const tooLarge = attachError(() => planEvidence({ ...fixture.args, mobile: big }), 'TOO_LARGE')
  assert.equal(tooLarge.bytes, MAX_BYTES + 1)
  const jpeg = path.join(fixture.tmp, 'photo.jpg'); fs.writeFileSync(jpeg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]))
  assert.equal(planEvidence({ ...fixture.args, mobile: jpeg }).screenshots[1].mimeType, 'image/jpeg')
  const { calls, fetchImpl } = mockApex(() => ({ status: 201, body: {} }))
  await attachErrorAsync(attachEvidence(planEvidence(fixture.args), { token: '', agentBase: 'http://127.0.0.1:1/api/agent', fetchImpl }), 'MISSING_TOKEN')
  assert.equal(calls.length, 0, 'nothing is posted without the operator key')
})

test('attach-evidence posts exactly the route fields for desktop then mobile and prints the returned URLs', async () => {
  const fixture = evidenceFixture()
  const { calls, fetchImpl } = mockApex((call, n) => ({ status: n === 1 ? 201 : 200, body: { existing: n !== 1, claimPath: 'operator', commentId: `c${n}`, activityId: `a${n}`, screenshotUrl: `https://cdn.example/${call.fields.viewport}.png`, asset: { id: `asset${n}`, url: `https://cdn.example/${call.fields.viewport}.png`, sha256: call.file.sha256 } } }))
  const plan = planEvidence({ ...fixture.args, label: 'After staff update', 'captured-at': '2026-09-22T09:58:00Z' })
  const logs = []
  const results = await attachEvidence(plan, { token: 'test-operator-key', agentBase: 'http://127.0.0.1:4010/api/agent', fetchImpl, log: (line) => logs.push(line) })
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.url, 'http://127.0.0.1:4010/api/agent/tasks/cmticket1/evidence/screenshots')
    assert.equal(call.method, 'POST')
    assert.equal(call.authorization, 'Bearer test-operator-key')
    assert.deepEqual(Object.keys(call.fields).sort(), ['agentRunId', 'capturedAt', 'label', 'pageUrl', 'sha256', 'viewport'], 'nothing else is sent; no section means the full page')
    assert.equal(call.fields.pageUrl, 'https://alpha.school/austin/')
    assert.equal(call.fields.agentRunId, 'sweep-2026-09-22-a')
    assert.equal(call.fields.capturedAt, '2026-09-22T09:58:00.000Z')
    assert.equal(call.fields.label, 'After staff update')
    assert.equal(call.file.type, 'image/png')
    assert.equal(call.fields.sha256, call.file.sha256, 'the posted hash is the hash of the posted bytes')
  }
  assert.deepEqual(calls.map((c) => [c.fields.viewport, c.file.name]), [['desktop', 'austin-desktop.png'], ['mobile', 'austin-mobile.png']])
  assert.deepEqual(results.map((r) => [r.viewport, r.status, r.existing, r.screenshotUrl, r.assetId, r.claimPath]), [['desktop', 201, false, 'https://cdn.example/desktop.png', 'asset1', 'operator'], ['mobile', 200, true, 'https://cdn.example/mobile.png', 'asset2', 'operator']])
  assert.match(logs[0], /^desktop: attached https:\/\/cdn\.example\/desktop\.png/)
  assert.match(logs[1], /^mobile: already attached https:\/\/cdn\.example\/mobile\.png/)
  const source = fs.readFileSync(path.join(root, 'agent', 'attach-evidence.mjs'), 'utf8')
  for (const forbidden of [/ALPHA_WP_/, /staff-asset-binding/, /\/status/, /\/comment'/, /wp-json/]) assert.doesNotMatch(source, forbidden, `the tool must not reach ${forbidden}`)
})

// Section captures, 2026-09-22: the crop of the element "Look for" names goes up as its own pair with --section, so the
// reviewer sees it first and legible instead of hunting inside a full-page thumbnail (Park City events review).
test('attach-evidence --section posts the section name with both files and refuses an empty or over-long one', async () => {
  const fixture = evidenceFixture()
  const plan = planEvidence({ ...fixture.args, section: '  team carousel: Isabella Cofresi card  ' })
  assert.equal(plan.section, 'team carousel: Isabella Cofresi card', 'trimmed')
  assert.equal(planEvidence(fixture.args).section, null, 'omitted means the full-page pair')
  assert.equal(attachError(() => planEvidence({ ...fixture.args, section: true }), 'MISSING_ARG').message.startsWith('--section needs the name'), true)
  attachError(() => planEvidence({ ...fixture.args, section: '   ' }), 'MISSING_ARG')
  attachError(() => planEvidence({ ...fixture.args, section: 's'.repeat(MAX_SECTION_LENGTH + 1) }), 'MISSING_ARG')
  assert.equal(planEvidence({ ...fixture.args, section: 's'.repeat(MAX_SECTION_LENGTH) }).section.length, MAX_SECTION_LENGTH)
  const { calls, fetchImpl } = mockApex((call, n) => ({ status: 201, body: { existing: false, claimPath: 'operator', screenshotUrl: `https://cdn.example/events-${call.fields.viewport}.png`, section: call.fields.section, asset: { id: `asset${n}`, url: `https://cdn.example/events-${call.fields.viewport}.png`, sha256: call.file.sha256 } } }))
  const logs = []
  await attachEvidence(planEvidence({ ...fixture.args, section: 'events strip' }), { token: 'test-operator-key', agentBase: 'http://127.0.0.1:4010/api/agent', fetchImpl, log: (line) => logs.push(line) })
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.deepEqual(Object.keys(call.fields).sort(), ['agentRunId', 'capturedAt', 'pageUrl', 'section', 'sha256', 'viewport'], 'the section rides with the same fields, nothing else')
    assert.equal(call.fields.section, 'events strip')
    assert.equal(call.fields.sha256, call.file.sha256)
  }
  assert.deepEqual(calls.map((c) => c.fields.viewport), ['desktop', 'mobile'])
  assert.match(logs[0], /^desktop \[events strip\]: attached https:\/\/cdn\.example\/events-desktop\.png/)
  // A second invocation for the full-page pair on the same run posts without the field; the route keys on the bytes, so the two pairs never collide.
  const full = mockApex(() => ({ status: 201, body: {} }))
  await attachEvidence(planEvidence(fixture.args), { token: 't', agentBase: 'http://127.0.0.1:4010/api/agent', fetchImpl: full.fetchImpl })
  assert.ok(full.calls.every((c) => !('section' in c.fields)))
  const dryLogs = []
  const dry = await attachEvidenceMain(['--ticket', 'cmticket1', '--run', 'r', '--page', 'https://alpha.school/austin/', '--desktop', fixture.desktop, '--mobile', fixture.mobile, '--section', 'events strip', '--dry-run'], { APEX_API_TOKEN: '' }, { log: (line) => dryLogs.push(line), error: () => {} })
  assert.equal(dry.plan.section, 'events strip')
  assert.equal(JSON.parse(dryLogs[0]).section, 'events strip')
})

test('section-shot plans the two crops from the arguments without launching a browser', () => {
  const args = parseSectionArgs(['--url', 'https://alpha.school/park-city/', '--selector', '#hubspot_events', '--name', 'events strip', '--out', '/tmp/ev', '--json', '/tmp/ev/shot.json'])
  const plan = planSectionShot(args)
  assert.equal(plan.url, 'https://alpha.school/park-city/')
  assert.equal(plan.selector, '#hubspot_events')
  assert.equal(plan.name, 'events strip')
  assert.deepEqual(plan.viewports, ['desktop', 'mobile'], 'both by default, in the order attach-evidence posts them')
  assert.deepEqual(plan.files, { desktop: '/tmp/ev/events-strip-desktop.png', mobile: '/tmp/ev/events-strip-mobile.png' }, 'named like the rendered-controls pair so attach-evidence takes them unchanged')
  assert.equal(plan.json, '/tmp/ev/shot.json')
  assert.equal(plan.timeoutMs, 15000)
  assert.deepEqual(SECTION_VIEWPORTS, { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } }, 'the rendered-controls viewports')
  assert.equal(DEVICE_SCALE_FACTOR, 2)
  // The name defaults to the selector; either way the file slug is filesystem-safe and the section name keeps its spelling for --section.
  const bySelector = planSectionShot({ url: 'https://alpha.school/miami/', selector: '#team_carousel .swiper-slide:nth-child(4)', viewports: 'desktop', timeout: '5000' })
  assert.equal(bySelector.name, '#team_carousel .swiper-slide:nth-child(4)')
  assert.deepEqual(Object.keys(bySelector.files), ['desktop'])
  assert.match(bySelector.files.desktop, /\/evidence\/team-carousel-swiper-slide-nth-child-4-desktop\.png$/)
  assert.equal(bySelector.timeoutMs, 5000)
  assert.equal(slugify('team carousel: Isabella Cofresi card'), 'team-carousel-isabella-cofresi-card')
  assert.equal(slugify('!!!'), 'section')
  assert.equal(outputFile('/x', 'Events Strip', 'mobile'), '/x/events-strip-mobile.png')
  // Typed failures before any browser work.
  const shotError = (fn, code) => { try { fn() } catch (error) { assert.ok(error instanceof SectionShotError, error.stack); assert.equal(error.code, code); return error } assert.fail(`expected ${code}`) }
  shotError(() => planSectionShot({ selector: '#x' }), 'MISSING_ARG')
  shotError(() => planSectionShot({ url: 'https://alpha.school/', selector: true }), 'MISSING_ARG')
  shotError(() => planSectionShot({ url: 'http://alpha.school/', selector: '#x' }), 'BAD_URL')
  shotError(() => planSectionShot({ url: 'alpha.school', selector: '#x' }), 'BAD_URL')
  shotError(() => planSectionShot({ url: 'https://alpha.school/', selector: '#x', viewports: 'desktop,tablet' }), 'BAD_VIEWPORT')
  shotError(() => planSectionShot({ url: 'https://alpha.school/', selector: '#x', timeout: 'soon' }), 'MISSING_ARG')
  // The clip is the element's page-coordinate box plus the margin, never outside the document.
  assert.deepEqual(clipWithPadding({ x: 20, y: 300, width: 1400, height: 483 }, { x: 0, y: 1869, width: 1440, height: 6000 }, PADDING_PX), { x: 4, y: 2153, width: 1432, height: 515 })
  assert.deepEqual(clipWithPadding({ x: 0, y: 0, width: 1440, height: 100 }, { x: 0, y: 0, width: 1440, height: 5000 }, PADDING_PX), { x: 0, y: 0, width: 1440, height: 116 }, 'clamped at the top-left')
  assert.deepEqual(clipWithPadding({ x: 10, y: 4950, width: 1420, height: 60 }, { x: 0, y: 0, width: 1440, height: 5000 }, PADDING_PX), { x: 0, y: 4934, width: 1440, height: 66 }, 'clamped at the bottom-right')
  const source = fs.readFileSync(path.join(root, 'tests', 'section-shot.mjs'), 'utf8')
  assert.match(source, /img\.decode\(\)/, 'waits on decode, not only complete/naturalWidth (San Francisco 2026-09-22: decoding=async reported complete before painting)')
  assert.match(source, /deviceScaleFactor: DEVICE_SCALE_FACTOR/)
  for (const forbidden of [/ALPHA_WP_/, /APEX_API_TOKEN/, /wp-json/]) assert.doesNotMatch(source, forbidden, `the capture tool must not reach ${forbidden}`)
})

test('section-shot CLI exits 2 on a typed input error without launching a browser', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'tests', 'section-shot.mjs'), '--url', 'http://alpha.school/park-city/', '--selector', '#hubspot_events'], { encoding: 'utf8' })
  assert.equal(run.status, 2, run.stderr)
  assert.match(run.stderr, /^BAD_URL: --url must be https/)
})

test('attach-evidence surfaces an APEX 4xx with its body, stops before the next file, and reports a hash disagreement', async () => {
  const fixture = evidenceFixture()
  const refused = mockApex(() => ({ status: 409, body: { error: 'Task is not actively claimed by this agent', code: 'NOT_CLAIMED' } }))
  const error = await attachErrorAsync(attachEvidence(planEvidence(fixture.args), { token: 't', agentBase: 'http://127.0.0.1:4010/api/agent', fetchImpl: refused.fetchImpl }), 'APEX_ERROR')
  assert.equal(error.status, 409)
  assert.equal(error.body.code, 'NOT_CLAIMED')
  assert.equal(error.viewport, 'desktop')
  assert.match(error.message, /APEX 409 on the desktop screenshot: .*NOT_CLAIMED/)
  assert.equal(refused.calls.length, 1, 'mobile is not posted after desktop fails')
  const mismatch = mockApex((call) => ({ status: 201, body: { asset: { id: 'x', url: 'https://cdn.example/x.png', sha256: 'f'.repeat(64) }, screenshotUrl: 'https://cdn.example/x.png' } }))
  const bad = await attachErrorAsync(attachEvidence(planEvidence(fixture.args), { token: 't', agentBase: 'http://127.0.0.1:4010/api/agent', fetchImpl: mismatch.fetchImpl }), 'APEX_ERROR')
  assert.match(bad.message, /stored sha256 ffffffffffff/)
  const partial = mockApex((call, n) => n === 1 ? { status: 201, body: { screenshotUrl: 'https://cdn.example/d.png', asset: { id: 'a1', url: 'https://cdn.example/d.png' } } } : { status: 413, body: { error: 'too large', code: 'FILE_TOO_LARGE' } })
  const second = await attachErrorAsync(attachEvidence(planEvidence(fixture.args), { token: 't', agentBase: 'http://127.0.0.1:4010/api/agent', fetchImpl: partial.fetchImpl }), 'APEX_ERROR')
  assert.deepEqual(second.results.map((r) => r.viewport), ['desktop'], 'what was attached before the failure is reported')
  const down = async () => { throw new Error('ECONNREFUSED') }
  await attachErrorAsync(attachEvidence(planEvidence(fixture.args), { token: 't', agentBase: 'http://127.0.0.1:4010/api/agent', fetchImpl: down }), 'NETWORK')
})

test('attach-evidence CLI exits 1 on a typed input error without contacting APEX', () => {
  const fixture = evidenceFixture()
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'attach-evidence.mjs'), '--ticket', 'cmticket1', '--run', 'r', '--page', 'https://alpha.school/austin/', '--desktop', fixture.desktop, '--mobile', path.join(fixture.tmp, 'missing.png')], { encoding: 'utf8', env: { ...process.env, APEX_API_TOKEN: 'never-used', APEX_API_BASE: 'http://127.0.0.1:1' } })
  assert.equal(run.status, 1, run.stderr)
  assert.match(run.stderr, /^MISSING_FILE: mobile screenshot .*missing\.png cannot be read: ENOENT/)
  assert.ok(!run.stderr.includes('never-used'), 'the token is never printed')
})

test('team-photo-framing math: coverage and cropped edges for cover-fit boxes', () => {
  // Jason Tan's 1130x1533 portrait in the San Francisco carousel box measured 2026-09-22 (284.66x220, object-position 50% 50%).
  const jason = frameCoverage({ naturalWidth: 1130, naturalHeight: 1533, boxWidth: 284.66, boxHeight: 220 })
  assert.equal(jason.croppedAxis, 'vertical')
  assert.ok(jason.coverage > 0.56 && jason.coverage < 0.58, `57% of the height is visible, got ${jason.coverage}`)
  assert.deepEqual(jason.croppedEdges, ['top', 'bottom'], 'centred object-position cuts both edges')
  assert.equal(judgeFraming(jason).result, 'fail')
  // The same file top-anchored keeps the head and loses the shoulders; still a framing failure, the coverage is the same.
  const anchored = frameCoverage({ naturalWidth: 1130, naturalHeight: 1533, boxWidth: 284.66, boxHeight: 220, objectPosition: '50% 0%' })
  assert.equal(anchored.coverage, jason.coverage)
  assert.deepEqual(anchored.croppedEdges, ['bottom'])
  // The reframed 1130x873 file is the box ratio: nothing cut.
  const reframed = frameCoverage({ naturalWidth: 1130, naturalHeight: 873, boxWidth: 284.66, boxHeight: 220 })
  assert.ok(reframed.coverage > 0.999, String(reframed.coverage))
  assert.equal(judgeFraming(reframed).result, 'pass')
  // Landscape into a portrait box: the sides go. Symmetric within 30% per edge passes (mobile shows the desktop frame's middle).
  const sides = frameCoverage({ naturalWidth: 1600, naturalHeight: 1000, boxWidth: 256, boxHeight: 280 })
  assert.equal(sides.croppedAxis, 'horizontal')
  assert.ok(Math.abs(sides.coverage - 0.5714) < 0.001, String(sides.coverage))
  assert.deepEqual(sides.croppedEdges, ['left', 'right'])
  assert.equal(judgeFraming(sides).result, 'pass', 'a framed headshot keeps its head band inside a 21% side cut')
  const wide = frameCoverage({ naturalWidth: 3000, naturalHeight: 1000, boxWidth: 256, boxHeight: 280 })
  assert.equal(judgeFraming(wide).result, 'fail', 'a 3:1 group photo loses its middle 40%')
  // Equal ratios: coverage 1, no axis.
  const same = frameCoverage({ naturalWidth: 1280, naturalHeight: 1920, boxWidth: 303.47, boxHeight: 455.2 })
  assert.equal(same.croppedAxis, 'none')
  assert.equal(same.coverage, 1)
  // Thresholds: 95% vertical is the line; 94% fails.
  assert.equal(judgeFraming(frameCoverage({ naturalWidth: 1000, naturalHeight: 1000, boxWidth: 1000, boxHeight: 950 })).result, 'pass')
  assert.equal(judgeFraming(frameCoverage({ naturalWidth: 1000, naturalHeight: 1000, boxWidth: 1000, boxHeight: 940 })).result, 'fail')
  assert.equal(VERTICAL_MIN_COVERAGE, 0.95)
  // object-position keywords and asymmetric cuts.
  assert.deepEqual(parseObjectPosition('center top'), { x: 0.5, y: 0 })
  assert.deepEqual(parseObjectPosition('top left'), { x: 0, y: 0 })
  assert.deepEqual(parseObjectPosition('right 25%'), { x: 1, y: 0.25 })
  assert.deepEqual(parseObjectPosition(undefined), { x: 0.5, y: 0.5 })
  const leftAnchored = frameCoverage({ naturalWidth: 3000, naturalHeight: 1000, boxWidth: 256, boxHeight: 280, objectPosition: '0% 50%' })
  assert.deepEqual(leftAnchored.croppedEdges, ['right'])
  // object-fit: contain never crops, fill stretches.
  assert.equal(frameForFit({ naturalWidth: 1439, naturalHeight: 1919, boxWidth: 450, boxHeight: 280, objectFit: 'contain' }).coverage, 1)
  assert.equal(judgeFraming(frameForFit({ naturalWidth: 1000, naturalHeight: 1000, boxWidth: 450, boxHeight: 280, objectFit: 'fill' })).result, 'fail')
  assert.equal(judgeFraming(frameForFit({ naturalWidth: 1000, naturalHeight: 1000, boxWidth: 300, boxHeight: 290, objectFit: 'fill' })).result, 'pass')
  // No box or no natural size is unmeasured, never a pass.
  assert.equal(judgeFraming(frameCoverage({ naturalWidth: 1024, naturalHeight: 768, boxWidth: 0, boxHeight: 0 })).result, 'unmeasured')
  assert.equal(judgeFraming(frameCoverage({ naturalWidth: 0, naturalHeight: 0, boxWidth: 300, boxHeight: 220 })).result, 'unmeasured')
})

test('team-photo-framing check row names each failing card with coverage, sizes, and edges', () => {
  const card = (name, naturalWidth, naturalHeight, boxWidth, boxHeight, objectPosition = '50% 50%', extra = {}) => ({ name, kind: 'carousel', decoded: true, naturalWidth, naturalHeight, boxWidth, boxHeight, objectFit: 'cover', objectPosition, selector: '#team_carousel .swiper-slide:nth-child(1)', src: 'https://alpha.school/x.jpg', ...extra })
  const desktop = [card('Dr. Tasha Arnold', 1280, 1920, 303.47, 455.2), card('Jason Tan', 1130, 1533, 284.66, 220), card('Ruby Holman', 1439, 1800, 284.66, 220, '50% 0%'), card('Michael Dillow', 1024, 768, 0, 0)]
  const mobile = [card('Jason Tan', 389, 528, 240, 220)]
  const measured = { url: 'https://alpha.school/san-francisco/', viewports: { desktop: { cards: desktop, failing: scoreCards(desktop) }, mobile: { cards: mobile, failing: scoreCards(mobile) } } }
  const row = teamPhotoFramingCheck(measured)
  assert.equal(row.id, 'team-photo-framing')
  assert.equal(row.result, 'fail')
  assert.match(row.detail, /desktop Jason Tan: 57% visible, natural 1130x1533, box 285x220 css px, top and bottom cropped/)
  assert.match(row.detail, /desktop Ruby Holman: 62% visible, natural 1439x1800, box 285x220 css px, bottom cropped/)
  assert.match(row.detail, /mobile Jason Tan: 68% visible/)
  assert.doesNotMatch(row.detail, /Tasha Arnold: \d+% visible/, 'a matching ratio is not listed')
  assert.match(row.detail, /unmeasured: desktop Michael Dillow \(no rendered box/, 'a hidden slide is reported, not judged')
  assert.equal(row.viewports.desktop.cards.find((c) => c.name === 'Jason Tan').result, 'fail')
  assert.equal(row.viewports.desktop.cards.find((c) => c.name === 'Michael Dillow').result, 'unmeasured')
  const clean = [card('Jason Tan', 1130, 873, 284.66, 220)]
  const pass = teamPhotoFramingCheck({ url: 'x', viewports: { desktop: { cards: clean, failing: scoreCards(clean) } } })
  assert.equal(pass.result, 'pass')
  assert.match(pass.detail, /desktop 1 card: every card image is inside its frame/)
  assert.equal(teamPhotoFramingCheck({ url: 'x', viewports: { desktop: { cards: [], failing: [] } } }).detail, 'no team cards on this page')
  assert.equal(teamPhotoFramingCheck({ url: 'x', viewports: { desktop: { error: 'net::ERR_FAILED', cards: [], failing: [] } } }).result, 'fail', 'a viewport that did not load is a failure, not a pass')
  // The check is registered where staff closures read their evidence.
  for (const id of ['staff-add', 'staff-update', 'staff-photo', 'staff-bulk']) {
    assert.ok(bundle.classes[id].evidenceProfile.includes('team-photo-framing-json'), `${id} evidence profile`)
    assert.match(bundle.classes[id].doneWhen, /team-photo-framing/)
  }
  const pageCheckSource = fs.readFileSync(path.join(root, 'tests', 'page-check.mjs'), 'utf8')
  assert.match(pageCheckSource, /result: 'skipped', detail: renderedSkipReason/, 'without a browser the check is skipped, never passed')
  const frameSpec = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'team-card-frame.json'), 'utf8'))
  assert.equal(frameSpec.measured['san-francisco'].carousel.desktop.ratio, 1.2939)
  assert.equal(frameSpec.rule.verticalMinCoverage, VERTICAL_MIN_COVERAGE)
})

/** A tiny RGB PNG with a distinct colour per quadrant so a crop can be checked pixel by pixel. */
function syntheticPng(width, height) {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    const top = y < height / 2, left = x < width / 2
    rgba[i] = top ? 200 : 20; rgba[i + 1] = left ? 200 : 20; rgba[i + 2] = y; rgba[i + 3] = 255
  }
  return { width, height, rgba }
}

test('frame-headshot crop geometry keeps the head: top-anchored portraits, centred landscapes, no crop on a match', () => {
  // The Jason numbers: 1130x1533 into the San Francisco desktop box ratio.
  const jason = cropWindow({ width: 1130, height: 1533, ratio: 1.2939 })
  assert.deepEqual(jason, { x: 0, y: 0, width: 1130, height: 873, axis: 'vertical', focus: 0 }, 'full width, height from the top: 873 px, the file the site now serves')
  assert.deepEqual(cropWindow({ width: 1130, height: 1533, ratio: 1.2939, focus: 0.5 }), { x: 0, y: 330, width: 1130, height: 873, axis: 'vertical', focus: 0.5 })
  assert.deepEqual(cropWindow({ width: 1130, height: 1533, ratio: 1.2939, focus: 1 }), { x: 0, y: 660, width: 1130, height: 873, axis: 'vertical', focus: 1 })
  // Landscape into a narrower ratio: full height, width from the centre.
  assert.deepEqual(cropWindow({ width: 1600, height: 1000, ratio: 1.0909 }), { x: 255, y: 0, width: 1091, height: 1000, axis: 'horizontal', focus: 0.5 })
  // Equal ratios: the whole image.
  assert.deepEqual(cropWindow({ width: 1280, height: 1920, ratio: 2 / 3 }), { x: 0, y: 0, width: 1280, height: 1920, axis: 'none', focus: null })
  assert.equal(parseRatio('4:3'), 1.3333)
  assert.equal(parseRatio('284.66/220'), 1.2939)
  assert.equal(parseRatio('1.2939'), 1.2939)
  assert.equal(parseRatio('auto'), 'auto')
  assert.equal(parseFocus('top'), 0); assert.equal(parseFocus('center'), 0.5); assert.equal(parseFocus('0.25'), 0.25); assert.equal(parseFocus(undefined), null)
  const frameError = (fn, code) => { try { fn() } catch (error) { assert.ok(error instanceof FrameHeadshotError, error.stack); assert.equal(error.code, code); return error } assert.fail(`expected ${code}`) }
  frameError(() => parseRatio('wide'), 'BAD_RATIO')
  frameError(() => parseRatio('0'), 'BAD_RATIO')
  frameError(() => parseRatio('10:1'), 'BAD_RATIO')
  frameError(() => parseRatio(undefined), 'MISSING_ARG')
  frameError(() => parseFocus('left'), 'BAD_FOCUS')
  frameError(() => planFrame({ file: 'a.jpg', ratio: 'auto', out: 'b.jpg' }), 'MISSING_ARG')
  frameError(() => planFrame({ file: 'a.jpg', ratio: '4:3' }), 'MISSING_ARG')
  assert.equal(planFrame({ file: 'a.jpg', ratio: '4:3', out: 'b.jpg', focus: 'center' }).focus, 0.5)
})

test('frame-headshot crops a synthetic PNG to the ratio, round-trips through the PNG codec, and writes the preview', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-headshot-test-'))
  const source = syntheticPng(40, 60)
  const sourceFile = path.join(tmp, 'source.png')
  fs.writeFileSync(sourceFile, encodePng(source))
  // Codec round trip is lossless.
  const decoded = decodePng(fs.readFileSync(sourceFile))
  assert.equal(decoded.width, 40); assert.equal(decoded.height, 60)
  assert.deepEqual([...decoded.rgba], [...source.rgba])
  // Crop to 4:3 from the top: 40x30, the top half of the image (all "top" colours).
  const logs = []
  const report = await frameMain(['--file', sourceFile, '--ratio', '4:3', '--out', path.join(tmp, 'framed.png'), '--preview', path.join(tmp, 'preview.png'), '--json', path.join(tmp, 'frame.json')], {}, { log: (m) => logs.push(m), error: () => {} })
  assert.deepEqual(report.crop, { x: 0, y: 0, width: 40, height: 30 })
  assert.equal(report.axis, 'vertical'); assert.equal(report.focus, 0)
  assert.equal(report.out.width, 40); assert.equal(report.out.height, 30)
  assert.equal(report.out.mimeType, 'image/png')
  const framedBytes = fs.readFileSync(path.join(tmp, 'framed.png'))
  assert.equal(report.out.sha256, crypto.createHash('sha256').update(framedBytes).digest('hex'), 'the printed sha256 is the file bind-headshot will hash')
  const framed = decodePng(framedBytes)
  assert.equal(framed.height, 30)
  for (let x = 0; x < 40; x++) for (let y = 0; y < 30; y++) { const i = (y * 40 + x) * 4; assert.equal(framed.rgba[i], 200, 'every kept pixel is from the top half'); assert.equal(framed.rgba[i + 2], y) }
  assert.match(logs.at(-1), /cropped vertical: 40x60 -> 40x30 \(1\.3333:1\)/)
  assert.match(report.reviewNote, /^framed to 1\.3333:1; crop 40x30 at 0,0 of 40x60, focus 0$/)
  assert.equal(report.source.sha256, crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'))
  assert.ok(fs.existsSync(path.join(tmp, 'frame.json')))
  // Preview: source and result side by side on white, wider than the source alone.
  const preview = decodePng(fs.readFileSync(path.join(tmp, 'preview.png')))
  assert.ok(preview.width > 40 * 2, `preview width ${preview.width}`)
  assert.equal(preview.rgba[0], 255, 'white margin')
  // Centre focus moves the window down; a landscape target from the middle of the width.
  const centred = await frameMain(['--file', sourceFile, '--ratio', '4:3', '--focus', 'center', '--out', path.join(tmp, 'centred.png')], {}, { log: () => {}, error: () => {} })
  assert.deepEqual(centred.crop, { x: 0, y: 15, width: 40, height: 30 })
  const centredPixels = decodePng(fs.readFileSync(path.join(tmp, 'centred.png')))
  assert.equal(centredPixels.rgba[2], 15, 'first row of the crop is source row 15')
  const narrow = await frameMain(['--file', sourceFile, '--ratio', '1:3', '--out', path.join(tmp, 'narrow.png')], {}, { log: () => {}, error: () => {} })
  assert.deepEqual(narrow.crop, { x: 10, y: 0, width: 20, height: 60 })
  // Wrong file types are typed errors before any write.
  fs.writeFileSync(path.join(tmp, 'text.png'), 'not a png')
  await assert.rejects(frameMain(['--file', path.join(tmp, 'text.png'), '--ratio', '4:3', '--out', path.join(tmp, 'x.png')], {}, { log: () => {}, error: () => {} }), (e) => e instanceof FrameHeadshotError && e.code === 'UNSUPPORTED_IMAGE')
  await assert.rejects(frameMain(['--file', sourceFile, '--ratio', '4:3', '--out', path.join(tmp, 'x.gif')], {}, { log: () => {}, error: () => {} }), (e) => e instanceof FrameHeadshotError && e.code === 'UNSUPPORTED_IMAGE')
  const toolSource = fs.readFileSync(path.join(root, 'agent', 'frame-headshot.mjs'), 'utf8')
  for (const forbidden of [/ALPHA_WP_/, /APEX_API_TOKEN/, /wp-json/, /staff-asset-binding/]) assert.doesNotMatch(toolSource, forbidden, `framing never reaches ${forbidden}`)
  assert.match(toolSource, /macOS only/, 'the header says the JPEG and WebP path needs sips')
})

test('frame-headshot CLI exits 2 on a typed input error without touching the browser or the file system', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'frame-headshot.mjs'), '--file', 'nope.jpg', '--ratio', 'auto', '--out', 'x.png'], { encoding: 'utf8', env: { ...process.env, PLAYWRIGHT_ROOT: '/nonexistent' } })
  assert.equal(run.status, 2, run.stderr)
  assert.match(run.stderr, /^MISSING_ARG: --ratio auto needs --page/)
})

test('section-shot --slide-containing picks the card by its text and is planned without a browser', () => {
  const plan = planSectionShot(parseSectionArgs(['--url', 'https://alpha.school/san-francisco/', '--selector', '#team_carousel .swiper-slide', '--slide-containing', 'Jason Tan', '--name', 'team carousel: Jason Tan card']))
  assert.equal(plan.slideContaining, 'Jason Tan')
  assert.equal(plan.selector, '#team_carousel .swiper-slide')
  assert.match(plan.files.desktop, /team-carousel-jason-tan-card-desktop\.png$/)
  assert.equal(planSectionShot({ url: 'https://alpha.school/', selector: '#x', 'scroll-to-text': 'Ruby Holman' }).slideContaining, 'Ruby Holman', 'alias')
  assert.equal(planSectionShot({ url: 'https://alpha.school/', selector: '#x' }).slideContaining, null)
  const shotError = (fn, code) => { try { fn() } catch (error) { assert.ok(error instanceof SectionShotError, error.stack); assert.equal(error.code, code); return error } assert.fail(`expected ${code}`) }
  shotError(() => planSectionShot({ url: 'https://alpha.school/', selector: '#x', 'slide-containing': true }), 'MISSING_ARG')
  shotError(() => planSectionShot({ url: 'https://alpha.school/', selector: '#x', 'slide-containing': '  ' }), 'MISSING_ARG')
  const source = fs.readFileSync(path.join(root, 'tests', 'section-shot.mjs'), 'utf8')
  assert.match(source, /filter\(\{ hasText: plan\.slideContaining \}\)/, 'the match is chosen by its text')
  assert.match(source, /instance\.slideTo\(index, 0\)/, 'a Swiper slide is brought into view before the capture')
})
