import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
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
