import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runValidation, validateTicketTemplates } from './validate-playbook.mjs'
import { composeDescription, triageCustomFields, TRIAGE_BODY_MARKER } from './triage-ticket.mjs'
import { renderBody } from './render-ticket.mjs'
import { checkDocExamples, quotedBlocks } from './render-templates-examples.mjs'
import { TemplateError, assertNoteShape, closingNoteLines, loadTemplates, renderExamples, renderTemplate, renderTitle, reviewLine, templateMarker } from '../agent/ticket-templates.mjs'
import {
  administrativeAction,
  applyDuplicateCandidates,
  assigneePatch,
  clarificationNote,
  clarificationRequirements,
  escalationNote,
  intakeCustomFieldsPatch,
  UNRESOLVED_OWNER_ROLE,
  evaluateTicket,
  resolveDecisionOwner,
  normalizePersonName,
  ticketInputSha256,
  observerCheckMatches,
  observerFilerOwned,
  OBSERVER_FILER_FILED_BY,
  operatorInstruction,
} from '../agent/intake-policy.mjs'
import { FILED_BY as FILER_FILED_BY } from '../agent/file-observer-findings.mjs'
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
import { BrandVisualError, backgroundVerdict, brandVisualCheck, contrastRatio, contrastVerdict, evaluateBrandVisual, fontVerdict, isLargeText, isNearWhite, loadBrandVisual, logoVerdict, normalizeHex, primaryFamily, relativeLuminance } from './brand-visual.mjs'
import { DESCRIPTION_HEADING, LEDGER_FIELD, MAX_WORDS as NOTICE_MAX_WORDS, RequesterNoticeError, appendNoticeToDescription, askHash, checkMessage, composeBlocked, composeMissingInfo, composeShared, firstName, noticeDecision, plainTitle, requesterNoticesPatch, screenItems, unresolvedNotices } from '../agent/requester-notice-policy.mjs'
import { NotifyRequesterError, digestRows, main as notifyMain, noticeRoute, ownerForRole, parseArgs as parseNotifyArgs, runDigest, runNotice } from '../agent/notify-requester.mjs'
import { composeChannelNote, planSharedBlocker, runSharedBlocker } from '../agent/notify-shared-blocker.mjs'
import { CHANNEL_NOTE_KIND, NoticeReviewError, REVIEW_INSTRUCTION, appendLedger, composeReviewMessage, findLiveItem, isExpired, isInternalEmail, isQuestionItem, ledgerPath, loadReviewSpec, needsReview, reactionVerdict, readLedger, reviewerTime, validateReviewSpec } from '../agent/notice-review.mjs'
import { runPoll } from '../agent/notice-review-poll.mjs'
import { requesterNoticeItems } from '../agent/intake-policy.mjs'

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

async function runMockApply({ failStatus, mode = 'clarification', skipReleaseCheck = true, releaseAttested = false, taskOverride = null, reconcileRefusal = null, apply = true }) {
  const operatorRoute = mode === 'operator-route'
  const executionReady = mode === 'execution-ready'
  const task = taskOverride ? { ...baseMockTask(operatorRoute, executionReady, failStatus), ...taskOverride } : baseMockTask(operatorRoute, executionReady, failStatus)
  const patches = []
  const reconciles = []
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
      reconciles.push(structuredClone(body))
      if (reconcileRefusal) return send(reconcileRefusal.status, reconcileRefusal.body)
      if (body.disposition === 'blocked' || body.disposition === 'blocked_internal') {
        task.status = 'BLOCKED'
        task.agentStatus = 'BLOCKED'
        task.agentEligible = false
      } else {
        task.status = 'APPROVED'
        task.agentStatus = 'READY'
        task.agentEligible = true
      }
      task.updatedAt = new Date(new Date(task.updatedAt).getTime() + 1000).toISOString()
      return send(200, { task })
    }
    return send(404, { error: `${request.method} ${request.url} not mocked` })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const input = path.join(os.tmpdir(), `alpha-mock-input-${process.pid}-${task.id}.json`)
  const reportPath = path.join(os.tmpdir(), `alpha-mock-report-${process.pid}-${task.id}.json`)
  const healthPath = path.join(os.tmpdir(), `alpha-mock-health-${process.pid}-${task.id}.json`)
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
  const childArgs = [path.join(root, 'agent', 'intake.mjs'), '--file', input, ...(apply ? ['--apply'] : []), '--report', reportPath, '--force']
  if (skipReleaseCheck) childArgs.push('--skip-release-check')
  // Real WordPress credentials in the developer's shell would let the child attest for real; the mock decides attestation.
  // A Slack token would let the requester-notice preview look the mock requester up for real; the child gets none.
  const isolated = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ALPHA_WP_') && k !== 'ALPHA_MCP_HEALTH_JSON' && k !== 'SLACK_BOT_TOKEN'))
  const run = await runChild(process.execPath, childArgs, {
    ...isolated,
    APEX_API_TOKEN: 'test-token',
    APEX_API_BASE: `http://127.0.0.1:${address.port}/api/v1`,
    APEX_AGENT_API_BASE: `http://127.0.0.1:${address.port}/api/agent`,
    ...(releaseAttested ? { ALPHA_MCP_HEALTH_JSON: healthPath } : {}),
  })
  await new Promise((resolve) => server.close(resolve))
  return { run, patches, reconciles, task, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) }
}

function baseMockTask(operatorRoute, executionReady, failStatus) {
  return {
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

test('an empty owner role routes to the unresolved-owner queue, never to an empty string, and protocol 1d names the operator', () => {
  const operator = bundle.roleOwners['website-agent-operator'][0]
  for (const emptyRole of ['', '   ', null, undefined]) {
    const result = { id: 'boston-empty-owner', outcome: 'routed', ownerRole: emptyRole, policySha256: bundle.policySha256, inputSha256: 'x' }
    resolveDecisionOwner(bundle, result, { id: 'boston-empty-owner', title: 'Website — Alpha Boston', requesterEmail: 'someone@alpha.school' })
    assert.equal(result.ownerRole, UNRESOLVED_OWNER_ROLE)
    assert.equal(result.outcome, 'owner-unresolved')
    assert.equal(result.ownerResolution, 'unresolved-owner-role')
    // Protocol 1d (2026-09-24, inside intake): the ticket is never left without a person; the queue stays internal-triage.
    assert.deepEqual(result.ownerUser, { id: operator.apexUserId, name: operator.name })
    assert.equal(result.escalation.rule, 'protocol-1d')
    assert.match(result.reason, /unresolved-owner queue/)
    assert.equal(administrativeAction(result).kind, 'blocked-review')
  }
})

// QC loop redesign workstream 3 (docs/qc-loop-redesign-plan-2026-09-24.md): intake administers every observer ticket.
test('observer sweep 2026-09-24: intake selects all 180 observer tickets and classifies each to a class', () => {
  const dir = path.join(root, 'tests', 'fixtures', 'observer-sweep-2026-09-24')
  const fixture = JSON.parse(fs.readFileSync(path.join(dir, 'tickets.json'), 'utf8'))
  const expected = JSON.parse(fs.readFileSync(path.join(dir, 'expected.json'), 'utf8')).expected
  assert.equal(fixture.tasks.length, 180)
  const ids = fixture.tasks.map((task) => task.id)
  const report = path.join(os.tmpdir(), `alpha-observer-sweep-report-${process.pid}.json`)
  const run = spawnSync(process.execPath, [
    path.join(root, 'agent', 'intake.mjs'), '--file', path.join(dir, 'tickets.json'), '--replay', '--report', report, '--force',
    '--status', 'NOT_STARTED,MISSING_INFO,BLOCKED,IN_PROGRESS,FOR_REVIEW', '--ticket', ids.join(','),
  ], { encoding: 'utf8', env: { ...process.env, APEX_API_TOKEN: '' } })
  assert.equal(run.status, 0, run.stderr)
  const { summary, results } = JSON.parse(fs.readFileSync(report, 'utf8'))
  assert.equal(summary.tickets, 180, 'every sweep ticket is selected')
  assert.deepEqual(summary.requestedTickets, { requested: 180, administered: 180, dropped: [] })
  const byId = new Map(results.map((result) => [result.id, result]))
  const problems = []
  for (const id of ids) {
    const result = byId.get(id)
    if (!result) { problems.push(`${id}: not decided`); continue }
    if (!result.class) problems.push(`${id}: no class (${result.outcome}) ${result.title}`)
    if (!result.owner) problems.push(`${id}: no person (protocol 1d) ${result.ownerRole}`)
    for (const key of ['class', 'outcome', 'ownerRole']) if (result[key] !== expected[id][key]) problems.push(`${id} ${key}: got ${result[key]}, expected ${expected[id][key]}`)
  }
  assert.deepEqual(problems, [])
  assert.equal(summary.classes.none, undefined)
  // The check-row taxonomy the sweep proved: timeouts and image renders are transient page findings, loop health is
  // the workflow or sheet URL, sheet-row and Community findings are map/community, HubSpot-URL events are events.
  const classOf = (check) => new Set(fixture.tasks.filter((task) => task.customFields.check === check).map((task) => byId.get(task.id).class))
  assert.deepEqual([...classOf('route-reachable')], ['observer-page-transient'])
  assert.deepEqual([...classOf('images-render')], ['observer-page-transient'])
  assert.deepEqual([...classOf('provider-health')], ['observer-health'])
  assert.deepEqual([...classOf('campus-operations-snapshot-fresh')], ['observer-health'])
  assert.deepEqual([...classOf('map-campus-missing-from-operations')], ['observer-map-community'])
  assert.deepEqual([...classOf('preannouncement-community-url')], ['observer-map-community'])
  assert.deepEqual([...classOf('public-event-sync')], ['observer-event'])
  assert.deepEqual([...classOf('campus-layout-header-overlap')], ['observer-layout'])
})

test('the website family accepts observer tickets whatever URL they carry, and --ticket names every id it does not administer', () => {
  const observer = (id, title, url, check, extra = {}) => ({
    id,
    title,
    status: 'NOT_STARTED',
    requestType: 'Website QC',
    program: ['Alpha School'],
    url,
    requesterEmail: 'requester@superbuilders.school',
    description: `${title}\nExpected: the finding clears\nObserved: ${title}\nObserver ID: SITE-${id.toUpperCase()}\n`,
    customFields: { source: 'alpha-site-qc', checkId: `SITE-${id.toUpperCase()}`, check, loop: 'campus-truth', ...extra },
    updatedAt: '2026-09-24T12:00:00.000Z',
  })
  const tasks = [
    observer('hub1', 'Coffee & Conversations with Alpha Malibu is public in HubSpot, but missing from the website.', 'https://app.hubspot.com/contacts/40051392/record/0-54/590672597781', 'public-event-sync', { loop: 'event-truth' }),
    observer('gh1', 'hubspot-programs source collection failed: expected healthy, found failed.', 'https://github.com/superbuilders/aeo/actions/workflows/site-observe.yml', 'provider-health', { loop: 'loop-health' }),
    observer('ev1', 'Pickleball & Pour with Alpha Charlotte registration link returns HTTP 502: https://events.alpha.school/register/abc', 'https://events.alpha.school/register/abc', 'event-registration-reachable', { loop: 'event-truth' }),
    observer('sh1', 'Edit: expected matching row in Alpha & Specialty Schools National Growth Map, found none for Alpha Charleston (SC).', 'https://docs.google.com/spreadsheets/d/1t0fhwHz5Y2FvDvj2chRJGDrdcIco1ZADmkhAtRZTduM/edit', 'map-campus-missing-from-operations'),
    observer('ss1', 'campus-program-26445615147 fails on mobile: expected rendered HTTP 2xx page, found page.goto: Timeout 20000ms exceeded.', 'https://alphahigh.school/', 'route-reachable', { loop: 'functional' }),
    observer('pg1', 'Alpha Boston: a visible image failed to render.', 'https://alpha.school/boston/', 'images-render', { loop: 'functional', pageUrl: 'https://alpha.school/boston/' }),
    { id: 'qc-no-source', title: 'Observer-shaped ticket without a source', status: 'NOT_STARTED', requestType: 'Website QC', program: ['Alpha School'], url: 'https://alpha.school/austin/', requesterEmail: 'requester@superbuilders.school', description: 'x', customFields: {}, updatedAt: '2026-09-24T12:00:00.000Z' },
    { id: 'not-family', title: 'Campus photo shoot', status: 'NOT_STARTED', requestType: 'Photography', program: ['Alpha Austin'], url: null, requesterEmail: 'requester@alpha.school', description: 'x', customFields: {}, updatedAt: '2026-09-24T12:00:00.000Z' },
    { ...observer('done1', 'Alpha Austin: the header overlaps the H1 on mobile.', 'https://alpha.school/austin/', 'campus-layout-header-overlap', { loop: 'functional' }), status: 'COMPLETED' },
  ]
  const input = path.join(os.tmpdir(), `alpha-family-input-${process.pid}.json`)
  const report = path.join(os.tmpdir(), `alpha-family-report-${process.pid}.json`)
  fs.writeFileSync(input, JSON.stringify(tasks))
  const requested = [...tasks.map((task) => task.id), 'missing-id']
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'intake.mjs'), '--file', input, '--replay', '--report', report, '--force', '--ticket', requested.join(',')], { encoding: 'utf8', env: { ...process.env, APEX_API_TOKEN: '' } })
  assert.equal(run.status, 0, run.stderr)
  const { summary, results } = JSON.parse(fs.readFileSync(report, 'utf8'))
  const byId = Object.fromEntries(results.map((result) => [result.id, result]))
  assert.deepEqual(Object.keys(byId).sort(), ['ev1', 'gh1', 'hub1', 'pg1', 'qc-no-source', 'sh1', 'ss1'])
  assert.equal(summary.requestedTickets.requested, 10)
  assert.equal(summary.requestedTickets.administered, 7)
  const dropped = Object.fromEntries(summary.requestedTickets.dropped.map((item) => [item.id, item.reason]))
  assert.equal(dropped['missing-id'], 'not in the --file input')
  assert.match(dropped['not-family'], /outside the website family filter/)
  assert.match(dropped['done1'], /status COMPLETED is outside --status/)
  assert.match(run.stderr, /--ticket done1: not administered: status COMPLETED/)
  // The derived page: customFields.pageUrl, then the program's registry page, then the ticket URL, then the title; else null.
  assert.equal(byId.pg1.found.pageUrl, 'https://alpha.school/boston/')
  assert.equal(byId.hub1.found.pageUrl, 'https://alpha.school/malibu/', 'the campus in the event name, never the HubSpot record URL')
  assert.equal(byId.gh1.found.pageUrl, undefined)
  assert.equal(byId.gh1.class, 'observer-health')
  assert.equal(byId.gh1.ownerRole, 'observer-owner')
  assert.equal(byId.gh1.outcome, 'routed')
  assert.equal(byId.hub1.class, 'observer-event')
  assert.equal(byId.hub1.ownerRole, 'hubspot-owner')
  assert.equal(byId.ev1.class, 'observer-event')
  assert.equal(byId.ev1.ownerRole, 'events-plugin-owner')
  assert.equal(byId.sh1.class, 'observer-map-community', 'an "Edit:" title leak does not hide the check name')
  assert.equal(byId.sh1.owner, 'Matt Barge', 'protocol 1d: the unnamed sheet owner does not leave the ticket without a person')
  assert.equal(byId.ss1.class, 'observer-page-transient')
  assert.equal(byId.pg1.class, 'observer-page-transient')
  assert.equal(byId.pg1.ownerRole, 'website-agent-operator')
  assert.equal(byId['qc-no-source'].currentStatus, 'NOT_STARTED', 'a Website QC request type is in the family on its own')
})

test('timeouts and image renders are transient page findings; loop health stays on the workflow or sheet URL', () => {
  const finding = (title, url, customFields, expected = 'rendered') => evaluateTicket(bundle, {
    id: `finding-${customFields.check}`,
    title,
    status: 'NOT_STARTED',
    requestType: 'Website QC',
    program: ['Alpha School'],
    url,
    requesterEmail: 'requester@superbuilders.school',
    description: `${title}\nPage: ${url}\nExpected: ${expected}\nObserved: ${title}\nObserver ID: SITE-ABC123\n`,
    customFields: { source: 'alpha-site-qc', checkId: 'SITE-ABC123', ...customFields },
  })
  const timeout = 'Atlanta: expected rendered HTTP 2xx page, found page.goto: Timeout 20000ms exceeded.'
  const onPage = finding(timeout, 'https://alpha.school/atlanta/', { check: 'route-reachable', loop: 'functional' })
  assert.equal(onPage.class, 'observer-page-transient')
  assert.equal(onPage.ownerRole, 'website-agent-operator')
  assert.equal(onPage.outcome, 'routed')
  const onWorkflow = finding(timeout, 'https://github.com/superbuilders/aeo/actions/workflows/site-observe.yml', { check: 'route-reachable', loop: 'functional' })
  assert.equal(onWorkflow.class, 'observer-health', 'a timeout the observer could only pin on its own run is loop health')
  assert.equal(onWorkflow.ownerRole, 'observer-owner')
  const images = finding('Palo Alto: a visible image failed to render.', 'https://alpha.school/palo-alto/', { check: 'images-render', loop: 'functional' })
  assert.equal(images.class, 'observer-page-transient')
  const event522 = finding('Alpha Palo Alto Open House: expected HTTP 2xx, found 522.', 'https://alpha.school/events/alpha-palo-alto-open-house/', { check: 'event-page-reachable', loop: 'event-truth' })
  assert.equal(event522.class, 'observer-page-transient')
  const overlap = finding('Alpha Oklahoma City: the header overlaps “Alpha Oklahoma City K-10 Private School” on mobile.', 'https://alpha.school/oklahoma-city/', { check: 'campus-layout-header-overlap', loop: 'functional' })
  assert.equal(overlap.class, 'observer-layout')
  const health = finding('browser source collection degraded: expected healthy, found degraded.', 'https://github.com/superbuilders/aeo/actions/workflows/site-observe.yml', { check: 'provider-health', loop: 'loop-health' })
  assert.equal(health.class, 'observer-health')
  const snapshot = finding('Edit: expected snapshot no older than 168 hours, found 2026-08-25T18:50:00.000Z.', 'https://docs.google.com/spreadsheets/d/1t0fhwHz5Y2F/edit', { check: 'campus-operations-snapshot-fresh', loop: 'loop-health' })
  assert.equal(snapshot.class, 'observer-health')
  const healthOnPage = finding('browser source collection degraded: expected healthy, found degraded.', 'https://alpha.school/atlanta/', { check: 'provider-health', loop: 'loop-health' })
  assert.equal(healthOnPage.class, null, 'loop health never enters the website queue under a page URL; it fails closed')
  const apply = finding('Alpha New York: Apply stays on the HubSpot form (HTTP 301 /application/?submission_campus=new_york) instead of Finalsite.', 'https://alpha.school/application/?submission_campus=new_york', { check: 'campus-application-finalsite-redirect', loop: 'campus-truth' }, 'redirect to https://apply.alpha.school/new-york-city/')
  assert.equal(apply.class, 'observer-link-cta')
  assert.equal(apply.ownerRole, 'hubspot-program-admin')
  const packet = finding('Alpha Highland Park is missing an info-packet CTA.', 'https://alpha.school/highland-park/', { check: 'campus-info-packet-present', loop: 'campus-truth' })
  assert.equal(packet.class, 'observer-packet')
  // The glob taxonomy: one class per observer check name, spaces mark notes rather than names.
  assert.ok(observerCheckMatches('campus-map-*', 'campus-map-pin-count'))
  assert.ok(!observerCheckMatches('campus-map-*', 'campus-mapping'))
  assert.ok(!observerCheckMatches('campus-page-status-sentence (to build)', 'campus-page-status-sentence'))
})

test('protocol 1d inside intake: an unowned role is Blocked on the website agent operator with the role, system, and change in the note', async () => {
  const operator = bundle.roleOwners['website-agent-operator'][0]
  const layout = await runMockApply({ failStatus: false, mode: 'operator-route', taskOverride: observerLayoutTask('mock-apply-1d') })
  assert.equal(layout.run.code, 0, layout.run.stderr)
  const result = layout.report.results[0]
  assert.equal(result.class, 'observer-layout')
  assert.equal(result.ownerRole, 'elementor-owner', 'the route does not change; only the person does')
  assert.equal(result.ownerResolution, 'unregistered-role-owner')
  assert.equal(result.escalation.rule, 'protocol-1d')
  assert.equal(result.owner, operator.name)
  assert.equal(result.action.kind, 'blocked-review')
  assert.equal(result.applied.ok, true)
  assert.equal(result.applied.disposition, 'blocked')
  assert.equal(layout.task.status, 'BLOCKED')
  assert.equal(layout.task.agentEligible, false)
  assert.ok(layout.task.assignees.some((item) => item.id === operator.apexUserId), 'assigned to the operator')
  assert.equal(layout.reconciles.length, 1)
  // The note is the `blocked` template (spec/ticket-templates.json): DECISION NEEDED, role, system, change, person, decision.
  const note = layout.reconciles[0].note
  assert.match(note, /^BLOCKED \(intake [0-9.]+, \d{4}-\d{2}-\d{2}\)\n/)
  assert.match(note, /^DECISION NEEDED: elementor-owner has no registered APEX user; intake will not fall back to Matt or Yash\.$/m)
  assert.match(note, /^Role: elementor-owner$/m)
  assert.match(note, /^System: elementor-owner$/m, 'the observer adapter only finds the defect, so the system is the executing role')
  assert.match(note, /^Change: Alpha Oklahoma City: the header overlaps .* \(https:\/\/alpha\.school\/oklahoma-city\/\)$/m)
  assert.match(note, new RegExp(`^Assigned to: ${operator.name}$`, 'm'))
  assert.match(note, /^Intake decision: policy-review for class observer-layout$/m)
  assert.equal(layout.report.summary.escalated, 1)
})

test('protocol 1c: an OPERATOR INSTRUCTION or CORRECTION note stops intake from re-routing, re-blocking, or re-assigning', async () => {
  const task = observerLayoutTask('mock-apply-1c')
  task.description += '\n\nOPERATOR INSTRUCTION (Matt Barge, 2026-09-24): leave this on the template lead; fix the hero template once for every page.\n'
  const held = await runMockApply({ failStatus: false, mode: 'operator-route', taskOverride: task })
  assert.equal(held.run.code, 0, held.run.stderr)
  const result = held.report.results[0]
  assert.equal(result.class, 'observer-layout', 'the evaluation is still reported')
  assert.equal(result.operatorInstruction.kind, 'operator-instruction')
  assert.equal(result.action.kind, 'no-action')
  assert.match(result.skipped, /OPERATOR INSTRUCTION .*protocol 1c/)
  assert.equal(held.patches.length, 0)
  assert.equal(held.reconciles.length, 0)
  assert.deepEqual(held.report.summary.operatorInstructions, ['mock-apply-1c'])
  assert.equal(held.task.status, 'NOT_STARTED')
  assert.deepEqual(held.task.assignees, [])
  // The heading is matched at the start of a line, upper case, in the description, human comments, and agent instructions.
  assert.equal(operatorInstruction({ description: 'A correction was made to the bio.' }), null)
  assert.equal(operatorInstruction({ description: 'x', comments: [{ id: 'c1', body: '<p>CORRECTION: the page is Boston Suburbs, not Boston.</p>' }] }).kind, 'correction')
  assert.equal(operatorInstruction({ description: 'x', agentInstructions: [{ status: 'PENDING', body: 'OPERATOR INSTRUCTION: execute the swap.' }] }).kind, 'operator-instruction')
  assert.equal(operatorInstruction({ description: 'x', agentInstructions: [{ status: 'RETIRED', body: 'OPERATOR INSTRUCTION: old.' }] }), null)
})

test('a ticket the observer filer created is never administered at any status: no clarification, no route, no reconcile, reported as observer_filer_owned', async () => {
  // The predicate (agent/intake-policy.mjs): the filer's exact filedBy marker, or any non-blank filerRunId, at every status.
  assert.equal(OBSERVER_FILER_FILED_BY, FILER_FILED_BY, 'the marker intake tests is the one the filer writes')
  assert.equal(observerFilerOwned({ status: 'NOT_STARTED', customFields: { filedBy: FILER_FILED_BY } }), true)
  assert.equal(observerFilerOwned({ status: 'NOT_STARTED', customFields: { filerRunId: 'site-full-2026-09-24T14-28-40-974Z' } }), true)
  assert.equal(observerFilerOwned({ status: 'MISSING_INFO', customFields: { source: 'agent-found', filerRunId: 'site-events-2026-09-25T13-26-58-882Z', checkId: 'SITE-B13C863ED3' } }), true)
  assert.equal(observerFilerOwned({ status: 'BLOCKED', customFields: { source: 'alpha-site-qc', checkId: 'SITE-B13C863ED3' } }), false, 'the observer\'s own tickets are administered')
  assert.equal(observerFilerOwned({ status: 'BLOCKED', customFields: { filerRunId: '   ' } }), false, 'a blank filerRunId is no marker')
  assert.equal(observerFilerOwned({ status: 'BLOCKED', customFields: { filedBy: 'agent/file-found-ticket.mjs' } }), false, 'the exact marker, nothing looser')
  assert.equal(observerFilerOwned({}), false)

  // 2026-09-25: intake moved six NOT_STARTED filer tickets to Missing Info addressed to the observer owner. Now a filer
  // ticket at NOT_STARTED (filedBy only, no filerRunId) plans nothing: no status POST, no reconcile, no PATCH, no notice.
  const notStarted = observerLayoutTask('mock-apply-filer-not-started')
  notStarted.customFields = { ...notStarted.customFields, source: 'agent-found', filedBy: FILER_FILED_BY }
  const untouched = await runMockApply({ failStatus: false, mode: 'operator-route', taskOverride: notStarted })
  assert.equal(untouched.run.code, 0, untouched.run.stderr)
  const first = untouched.report.results[0]
  assert.equal(first.class, 'observer-layout', 'the evaluation is still reported')
  assert.equal(first.action.kind, 'no-action')
  assert.equal(first.action.reason, 'observer_filer_owned')
  assert.deepEqual(first.observerFilerOwned, { filedBy: FILER_FILED_BY, filerRunId: null, status: 'NOT_STARTED' })
  assert.match(first.skipped, /^observer_filer_owned: the observer filer created this ticket/)
  assert.equal(first.applied, undefined, 'never reaches applyDecision')
  assert.equal(first.requesterNotice, undefined, 'no requester notice preview or send')
  assert.equal(untouched.patches.length, 0)
  assert.equal(untouched.reconciles.length, 0)
  assert.equal(untouched.task.status, 'NOT_STARTED')
  assert.deepEqual(untouched.task.assignees, [])
  assert.deepEqual(untouched.task.clarifications, [])
  assert.deepEqual(untouched.report.summary.observerFilerOwned, ['mock-apply-filer-not-started'])
  assert.deepEqual(untouched.report.summary.actions, { 'no-action': 1 })
  assert.deepEqual(untouched.report.summary.errors, [])
  assert.equal(untouched.report.summary.skipped, 1)
  assert.equal(untouched.report.summary.applied, 0)
  assert.equal(untouched.report.summary.escalated, 0)

  // The same at BLOCKED with a filerRunId (APEX PR 409's own shape), and in a dry run: no write, no notice preview either way.
  const owned = observerLayoutTask('mock-apply-filer-owned')
  owned.status = 'BLOCKED'
  owned.customFields.filerRunId = 'site-full-2026-09-24T14-28-40-974Z'
  const held = await runMockApply({ failStatus: false, mode: 'operator-route', taskOverride: owned })
  assert.equal(held.run.code, 0, held.run.stderr)
  const result = held.report.results[0]
  assert.equal(result.applied, undefined)
  assert.equal(result.action.kind, 'no-action')
  assert.match(result.skipped, /^observer_filer_owned: /)
  assert.equal(held.patches.length, 0)
  assert.equal(held.reconciles.length, 0)
  assert.deepEqual(held.report.summary.observerFilerOwned, ['mock-apply-filer-owned'])
  assert.deepEqual(held.report.summary.errors, [])
  assert.equal(held.task.status, 'BLOCKED')
  assert.deepEqual(held.task.assignees, [])
  const dry = await runMockApply({ failStatus: false, mode: 'operator-route', taskOverride: { ...observerLayoutTask('mock-dry-filer-owned'), customFields: { ...observerLayoutTask('x').customFields, filerRunId: 'site-events-2026-09-25T13-26-58-882Z' } }, apply: false })
  assert.equal(dry.run.code, 0, dry.run.stderr)
  assert.equal(dry.report.mode, 'dry-run')
  assert.equal(dry.report.results[0].action.kind, 'no-action')
  assert.equal(dry.report.results[0].requesterNotice, undefined)
  assert.deepEqual(dry.report.summary.observerFilerOwned, ['mock-dry-filer-owned'])
  assert.equal(dry.patches.length + dry.reconciles.length, 0)

  // When APEX decides it first (409 OBSERVER_FILER_OWNED on reconcile for a ticket carrying no filer marker client-side)
  // the answer is the same skip: the pending marker is left as it is, nothing is retried, and no v1 PATCH stands in for
  // the refused reconcile.
  const refused = await runMockApply({
    failStatus: false,
    mode: 'operator-route',
    taskOverride: observerLayoutTask('mock-apply-filer-409'),
    reconcileRefusal: { status: 409, body: { error: 'Ticket is owned by the observer filer', code: 'OBSERVER_FILER_OWNED' } },
  })
  assert.equal(refused.run.code, 0, refused.run.stderr)
  const late = refused.report.results[0]
  assert.equal(late.applied.ok, false)
  assert.equal(late.applied.skipped, 'observer_filer_owned')
  assert.equal(late.applied.apexCode, 'OBSERVER_FILER_OWNED')
  assert.equal(late.applied.error, undefined)
  assert.match(late.skipped, /^observer_filer_owned: .*APEX answered OBSERVER_FILER_OWNED/)
  assert.equal(refused.reconciles.length, 1, 'one reconcile, no retry')
  assert.equal(refused.patches.length, 1, 'the pending-hash PATCH only; no v1 fallback and no finalization')
  assert.equal(refused.patches[0].customFields.intakePendingHash, late.decisionSha256)
  assert.equal(refused.task.customFields.intakeHash, undefined)
  assert.deepEqual(refused.report.summary.observerFilerOwned, ['mock-apply-filer-409'])
  assert.deepEqual(refused.report.summary.errors, [])
  assert.equal(refused.task.status, 'NOT_STARTED')

  // Any other 409 is still an error, as before.
  const conflict = await runMockApply({ failStatus: false, mode: 'operator-route', taskOverride: observerLayoutTask('mock-apply-other-409'), reconcileRefusal: { status: 409, body: { error: 'lease conflict', code: 'NOT_CLAIMED' } } })
  assert.equal(conflict.report.results[0].applied.ok, false)
  assert.match(conflict.report.results[0].applied.error, /NOT_CLAIMED|lease conflict/)
  assert.equal(conflict.report.summary.errors.length, 1)
})

function observerLayoutTask(id) {
  const title = 'Alpha Oklahoma City: the header overlaps “Alpha Oklahoma City K-10 Private School in Oklahoma City, Oklahoma” on mobile.'
  return {
    id,
    title,
    status: 'NOT_STARTED',
    updatedAt: '2026-09-24T12:00:00.000Z',
    requestType: 'Website QC',
    program: ['Alpha School'],
    url: 'https://alpha.school/oklahoma-city/',
    requesterEmail: 'requester@superbuilders.school',
    description: `${title}\nPage: https://alpha.school/oklahoma-city/\nExpected: header clear of the H1 on mobile\nObserved: 14 px overlap\nObserver ID: SITE-B13C863ED3\n`,
    customFields: { source: 'alpha-site-qc', checkId: 'SITE-B13C863ED3', check: 'campus-layout-header-overlap', loop: 'functional' },
    assets: [],
    revisions: [],
    clarifications: [],
    comments: [],
    activityLog: [],
    agentInstructions: [],
    assignees: [],
  }
}

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

// Ticket templates (2026-09-24): the wording of every protocol note and body lives in spec/ticket-templates.json; the
// renderers read it, the protocol quotes it, and these tests pin the shapes and the outputs the renderers produced before.
test('ticket templates render with placeholders, optional segments, per-item lines, and arrays joined', () => {
  assert.equal(renderTemplate('filedLine', { id: 'cmx1', defect: 'a broken packet link' }), 'Filed cmx1 for a broken packet link found during this work.')
  assert.equal(renderTemplate('claimed', { actor: 'website agent', date: '2026-09-24', playbookVersion: 'playbook 0.4' }), 'CLAIMED (website agent, 2026-09-24, playbook 0.4)')
  assert.equal(renderTemplate('claimed', { actor: 'a', date: 'd', playbookVersion: 'v', executionId: 'ex1', leaseExpiresAt: 'T' }), 'CLAIMED (a, d, v)\nExecution ex1; lease expires T')
  assert.equal(renderTemplate('duplicate', {}), 'Another open ticket has the same class, canonical page, and subject. Link and review them; do not auto-close either ticket.')
  assert.equal(renderTemplate('duplicate', { related: ['cma', 'cmb'] }), 'Another open ticket has the same class, canonical page, and subject (cma, cmb). Link and review them; do not auto-close either ticket.')
  assert.equal(renderTemplate('missingInfo', { actor: 'validator', date: '2026-09-24', items: ['the exact page URL', { item: 'the bio', owner: 'Dawn Adams' }], alreadyCorrect: 'nothing checked yet' }),
    'MISSING INFO (validator, 2026-09-24)\nThis ticket needs the following before it can be executed:\n1. the exact page URL\n2. the bio (owner: Dawn Adams)\nWhat is already correct on the page: nothing checked yet\nThe agent will execute and verify as soon as the items above are on the ticket.')
  assert.equal(renderTitle('hubspotData', { campus: 'Alpha Atlanta', element: 'intro.status-sentence', state: 'Open' }), 'HubSpot data: Alpha Atlanta intro.status-sentence contradicts state Open')
  assert.equal(templateMarker('triage'), '--- Website agent triage ---')
  assert.equal(TRIAGE_BODY_MARKER, templateMarker('triage'))
})

test('ticket templates fail closed: a missing required field, an unknown template, and a note without the closing shape are typed errors', () => {
  assert.throws(() => renderTemplate('filedLine', { id: 'cmx1' }), (e) => e instanceof TemplateError && e.code === 'MISSING_FIELD' && e.field === 'defect' && e.template === 'filedLine')
  assert.throws(() => renderTemplate('resolution', { actor: 'a' }), (e) => e.code === 'MISSING_FIELD' && e.field === 'date')
  assert.throws(() => renderTemplate('nope', {}), (e) => e.code === 'UNKNOWN_TEMPLATE')
  assert.throws(() => renderTitle('resolution', {}), (e) => e.code === 'NO_TITLE')
  const note = renderTemplate('resolution', { actor: 'website agent', date: '2026-09-24', playbookVersion: 'playbook 0.4', goHere: 'https://alpha.school/austin/', lookFor: 'the events strip', recommend: 'Complete', alsoOpen: 'none', page: 'https://alpha.school/austin/', objectId: 123, change: '"a" -> "b" in the strip', evidence: 'hashes; section capture attached', tests: 'ring 1 pass; ring 2 pass (desktop, mobile); ring 3 pass (Tulsa, Miami)' })
  assert.equal(note.split('\n')[5], 'Page: https://alpha.school/austin/ (object 123)')
  assert.deepEqual(assertNoteShape(note).slice(0, 4), ['RESOLUTION (website agent, 2026-09-24, playbook 0.4)', 'Go here: https://alpha.school/austin/', 'Look for: the events strip', 'Recommend: Complete'])
  assert.throws(() => assertNoteShape(note.replace('Go here:', 'Page:')), (e) => e.code === 'NOTE_SHAPE' && e.line === 2)
  assert.throws(() => assertNoteShape(note.replace(/\nPlease review\.$/, '')), (e) => e.code === 'NOTE_SHAPE')
  assert.throws(() => assertNoteShape(note.replace('the events strip', 'the events strip — top of page')), (e) => e.code === 'NOTE_SHAPE' && e.line === 3)
})

test('ticket template invariants: closing lines on every section 7 template, the review line last, no em dash, required equals the unconditional placeholders, the doc examples match', () => {
  const spec = loadTemplates()
  assert.deepEqual(closingNoteLines(), ['RESOLUTION ({actor}, {date}, {playbookVersion})', 'Go here: {goHere}', 'Look for: {lookFor}', 'Recommend: {recommend}'])
  assert.equal(reviewLine(), 'Please review.')
  assert.deepEqual(Object.keys(spec.templates), ['resolution', 'verified', 'missingInfo', 'intakeClarification', 'blocked', 'escalation', 'ownerUnregistered', 'ownerAmbiguous', 'duplicate', 'filedLine', 'claimed', 'triageBody', 'observerBody', 'hubspotData', 'syncMapping'])
  assert.deepEqual(validateTicketTemplates(spec), [])
  for (const name of ['resolution', 'verified']) assertNoteShape(renderExamples()[name])
  // A section 7 template that drops a closing line, ends elsewhere, or carries an em dash fails the validator.
  const broken = structuredClone(spec)
  broken.templates.resolution.lines.splice(1, 1)
  broken.templates.verified.lines.push('Thanks.')
  broken.templates.missingInfo.lines[0] = 'MISSING INFO — ({actor}, {date})'
  broken.templates.filedLine.required = []
  broken.templates.claimed.required.push('ghost')
  broken.templates.duplicate.example = { related: [] }
  const problems = validateTicketTemplates(broken)
  assert.ok(problems.some((p) => p.startsWith('ticket template resolution: a section 7 closing note must start with the closing lines')), problems.join('\n'))
  assert.ok(problems.some((p) => p === 'ticket template verified: a section 7 closing note must end with "Please review."'))
  assert.ok(problems.some((p) => p === 'ticket template missingInfo: carries an em dash'))
  assert.ok(problems.some((p) => p === 'ticket template filedLine: placeholder {id} is always rendered but not in required'))
  assert.ok(problems.some((p) => p === 'ticket template claimed: required field ghost appears in no line'))
  // The protocol and runbook quote every template through the generator; a hand edit to a quoted block is caught.
  assert.deepEqual(checkDocExamples(spec), [])
  const protocol = fs.readFileSync(path.join(root, 'protocols', 'apex-website-ticket-protocol.md'), 'utf8')
  const quoted = Object.fromEntries(quotedBlocks(protocol).map((b) => [b.name, b.quoted]))
  assert.equal(quoted.resolution, renderExamples()[name_('resolution')])
  const tampered = structuredClone(spec)
  tampered.templates.resolution.lines[2] = 'Look for: {lookFor} (changed)'
  assert.ok(checkDocExamples(tampered).some((p) => /quoted block for template resolution differs/.test(p)))
  function name_(n) { return n }
})

test('the renderers produce the same text as before through the templates: triage body, intake clarification, 1d reasons and note, observer escalation', () => {
  const body = renderBody({
    ownerName: 'Farhan Raja', ownerRole: 'hubspot-program-admin', fixPath: 'change type in HubSpot', observed: 'Coming Fall 2026 (modified 2026-09-01)',
    page: 'https://alpha.school/atlanta/', expected: 'Alpha Atlanta is open and enrolling.', source: 'HubSpot Programs type = "Open" (read 2026-09-24T10:00:00Z)',
    reason: 'source contradicts the state', doneWhen: 'the page shows the sentence after the next run', related: ['cmx2'], class: 'hubspot-data', defectClass: 'data',
    element: 'intro.status-sentence', cssId: 'campus-intro', evidence: 'diagnose-field intro.status-sentence 2026-09-24', playbook: 'spec/campus-page-field-map.json intro.status-sentence; protocol step 0 and 1b',
    history: ['2026-09-24 website agent: triaged to hubspot-data (data); owner hubspot-program-admin (Farhan Raja)'],
  })
  assert.equal(body, [
    'Farhan Raja: change type in HubSpot', '', 'What was asked: Coming Fall 2026 (modified 2026-09-01)', 'Page: https://alpha.school/atlanta/',
    'What the playbook expects: Alpha Atlanta is open and enrolling.', 'Source checked: HubSpot Programs type = "Open" (read 2026-09-24T10:00:00Z)',
    'Why it is routed here: source contradicts the state', 'Done when: the page shows the sentence after the next run', 'Related: cmx2', '',
    'Class hubspot-data (data); element intro.status-sentence (campus-intro); diagnose-field intro.status-sentence 2026-09-24; spec/campus-page-field-map.json intro.status-sentence; protocol step 0 and 1b',
    '', 'History:', '- 2026-09-24 website agent: triaged to hubspot-data (data); owner hubspot-program-admin (Farhan Raja)',
  ].join('\n'))
  // The sentinel values render-ticket.mjs treated as unknown still hide their lines; presentation hides the defect class; no owner falls back to "Owner".
  const sparse = renderBody({ fixPath: 'see class', observed: 'x', page: 'unknown', expected: 'per the class recipe', source: 'request as filed', doneWhen: 'd', class: 'copy', defectClass: 'presentation', evidence: 'e' })
  assert.equal(sparse, 'Owner: see class\n\nWhat was asked: x\nWhy it is routed here:\nDone when: d\n\nClass copy; element n/a; e; alpha-website-playbook\n\nHistory:')

  const fixture = decisionFixture('intake-derivable-campus-url.json')
  const missing = evaluateTicket(bundle, { ...fixture.task, description: 'Please add a team member.', originalSubmission: {} })
  if (missing.outcome === 'missing-info') {
    const note = clarificationNote(bundle, missing)
    const lines = note.split('\n')
    assert.equal(lines[0], 'APEX intake found requester-owned information that is still needed:')
    assert.equal(lines.at(-1), 'Reply through the APEX clarification link. The same ticket will be evaluated again after your response.')
    for (const item of clarificationRequirements(bundle, missing).requirements) assert.ok(lines.includes(`- ${item.label}: ${item.prompt}`))
    if (missing.derivableMissing.length) assert.ok(lines.includes(`APEX will resolve these itself and is not asking you for them: ${missing.derivableMissing.join(', ')}.`))
  }
  assert.equal(renderTemplate('ownerUnregistered', { role: 'elementor-owner' }), 'elementor-owner has no registered APEX user; intake will not fall back to Matt or Yash.')
  assert.equal(renderTemplate('ownerAmbiguous', { role: 'packet-owner' }), 'packet-owner has multiple registered APEX users and no primary owner; intake will not choose one arbitrarily.')
  const unresolved = resolveDecisionOwner(bundle, { outcome: 'routed', ownerRole: 'elementor-owner', class: 'observer-layout', policySha256: 'p', inputSha256: 'i' }, { title: 'Alpha Austin: header overlaps the hero on mobile' })
  assert.equal(unresolved.outcome, 'owner-unresolved')
  const note1d = escalationNote(bundle, unresolved, { title: 'Alpha Austin: header overlaps the hero on mobile' }, { actor: 'intake 0.2', date: '2026-09-24' })
  assert.equal(note1d, [
    'BLOCKED (intake 0.2, 2026-09-24)', 'DECISION NEEDED: elementor-owner has no registered APEX user; intake will not fall back to Matt or Yash.', 'Role: elementor-owner',
    'System: elementor-owner', 'Change: Alpha Austin: header overlaps the hero on mobile', `Assigned to: ${bundle.roleOwners['website-agent-operator'][0].name}`,
    'Intake decision: owner-unresolved for class observer-layout',
  ].join('\n'))
  assert.equal(bundle.classes['observer-layout'].executes, 'elementor-owner', 'the System line is the class\'s executing system from the bundle (its adapter, the observer, only finds the defect)')
  // A class whose adapter executes the work names that system; the page URL joins the change line.
  const wp = resolveDecisionOwner(bundle, { outcome: 'routed', ownerRole: 'nobody-registered', class: 'observer-brand-leak', policySha256: 'p', inputSha256: 'i' }, { title: 'Alpha Austin: brand leak', url: 'https://alpha.school/austin/' })
  assert.match(escalationNote(bundle, wp, { title: 'Alpha Austin: brand leak', url: 'https://alpha.school/austin/' }, { actor: 'intake 0.2', date: '2026-09-24' }),
    /^System: alpha\.school WordPress and Elementor\nChange: Alpha Austin: brand leak \(https:\/\/alpha\.school\/austin\/\)$/m)
  assert.equal(renderTemplate('escalation', { role: 'elementor-owner', escalatedTo: 'Matt Barge', operatorRole: 'website-agent-operator', system: 'Elementor' }), 'role elementor-owner has no registered APEX user; escalated to Matt Barge (website-agent-operator) per protocol 1d; the work lives in Elementor')
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

test('brand-visual spec loads, matches the brand guide values, and a malformed file is a typed error', () => {
  const spec = loadBrandVisual()
  assert.equal(spec.typography.family, 'Montserrat')
  assert.deepEqual(spec.palette.map((p) => p.hex), ['#110068', '#0D4AD1', '#418BE9', '#00BCFF', '#FFFFFF', '#000000'])
  assert.deepEqual(spec.tints.map((t) => t.hex), ['#C8DBF4', '#47C4E6'])
  assert.equal(spec.gradients.find((g) => g.id === 'primary').css, 'linear-gradient(160deg, #110068 0%, #0D4AD1 100%)')
  // Every ratio in the table is the computed WCAG ratio, to one decimal, and the verdict follows the thresholds.
  for (const row of spec.contrast.table) {
    assert.equal(contrastRatio(row.foreground, row.background), row.ratio, `${row.foreground} on ${row.background}`)
    const expected = row.ratio >= spec.contrast.bodyMinRatio ? 'any' : (row.ratio >= spec.contrast.largeMinRatio ? 'large-only' : 'never')
    assert.equal(row.verdict, expected, `verdict for ${row.foreground} on ${row.background}`)
  }
  assert.deepEqual(spec.contrast.table.filter((r) => r.verdict === 'never').map((r) => `${r.foreground} on ${r.background}`), ['#110068 on #0D4AD1', '#00BCFF on #FFFFFF', '#FFFFFF on #00BCFF'])
  assert.equal(spec.typography.scale[0].weight, 900); assert.equal(spec.typography.scale[0].case, 'ALL CAPS'); assert.equal(spec.typography.scale[0].sizePt, 40)
  assert.match(spec.typography.scaleCalibration, /Letter/)
  assert.deepEqual(spec.logo.colourways.map((c) => c.hex), ['#110068', '#1C1CFF', '#FFFFFF'])
  assert.match(spec.logo.inconsistency, /#1C1CFF/)
  assert.equal(spec.logo.lockups.liveSite, 'ALPHA (logowhite-2.svg)')
  // The canonical files are the ones the spec hashes.
  for (const asset of spec.logo.assets) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root, spec.logo.assetsDir, asset.file))).digest('hex'), asset.sha256, asset.file)
  // Claims are verbatim and cross-referenced, never restated as word rules.
  const claims = Object.fromEntries(spec.approvedClaims.claims.map((c) => [c.id, c]))
  assert.equal(claims.positioning.text, 'FINALLY, A SCHOOL THAT WORKS AS HARD AS YOUR KID DOES.')
  assert.equal(claims['stat-love-school'].text, '95% of Alpha students say they love school.')
  assert.match(claims['stat-love-school'].copyRule, /most recent survey number/)
  assert.match(claims['what-is-alpha'].copyRule, /Classes rank in the top 1%, never students/)
  assert.match(spec.approvedClaims.copyRulesFile, /alpha-brand-copy-rules\.md/)
  assert.ok(spec.notCanon.some((n) => /#FFC72C/.test(n.item)), 'the kid accent is listed as not canon')
  assert.equal(spec.check.enforcement.mode, 'advisory')
  assert.deepEqual(spec.check.severities, { font: 'fail', contrast: 'fail', background: 'info', headline: 'info', logo: 'info' })
  // Malformed files fail closed.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-visual-'))
  const bad = (mutate) => { const copy = JSON.parse(JSON.stringify(spec)); mutate(copy); const file = path.join(tmp, 'spec.json'); fs.writeFileSync(file, JSON.stringify(copy)); try { loadBrandVisual(file) } catch (error) { assert.ok(error instanceof BrandVisualError, error.stack); return error.code } assert.fail('expected SPEC_INVALID') }
  assert.equal(bad((c) => { c.palette[0].hex = '#11006' }), 'SPEC_INVALID')
  assert.equal(bad((c) => { c.contrast.table[0].verdict = 'fine' }), 'SPEC_INVALID')
  assert.equal(bad((c) => { c.typography.family = 'Poppins' }), 'SPEC_INVALID')
  assert.equal(bad((c) => { c.check.severities.font = 'loud' }), 'SPEC_INVALID')
  assert.equal(bad((c) => { c.check.enforcement.mode = 'maybe' }), 'SPEC_INVALID')
  fs.writeFileSync(path.join(tmp, 'broken.json'), '{ not json')
  assert.throws(() => loadBrandVisual(path.join(tmp, 'broken.json')), (e) => e instanceof BrandVisualError && e.code === 'SPEC_INVALID')
  assert.throws(() => loadBrandVisual(path.join(tmp, 'missing.json')), (e) => e instanceof BrandVisualError && e.code === 'SPEC_MISSING')
  // The validator rejects a hash that no longer matches its file.
  const validatorSource = fs.readFileSync(path.join(root, 'tests', 'validate-playbook.mjs'), 'utf8')
  assert.match(validatorSource, /spec\/schemas\/brand-visual\.schema\.json/)
  assert.match(validatorSource, /brand-visual asset .* sha256/)
})

test('brand-visual colour maths: luminance, contrast, near-white, large text, palette membership', () => {
  assert.equal(normalizeHex('rgb(13, 74, 209)'), '#0D4AD1')
  assert.equal(normalizeHex('rgba(0, 188, 255, 1)'), '#00BCFF')
  assert.equal(normalizeHex('#fff'), '#FFFFFF')
  assert.equal(normalizeHex('transparent'), '#000000', 'transparent parses to black at alpha 0; callers read the alpha')
  assert.equal(normalizeHex('inherit'), null)
  assert.equal(Math.round(relativeLuminance('#FFFFFF') * 1000) / 1000, 1)
  assert.equal(relativeLuminance('#000000'), 0)
  assert.equal(contrastRatio('#FFFFFF', '#110068'), 17.2)
  assert.equal(contrastRatio('#00BCFF', '#FFFFFF'), 2.2)
  assert.equal(contrastRatio('#FFFFFF', '#418BE9'), 3.4)
  assert.equal(contrastRatio('#110068', '#0D4AD1'), 2.4)
  assert.equal(contrastRatio('#FFC72C', '#110068'), 11.0, 'the skill extension figure, computed the same way')
  assert.equal(contrastRatio('nope', '#FFFFFF'), null)
  const spec = loadBrandVisual()
  assert.equal(isNearWhite('#F8F8F8', spec), true, 'the kit 8 page ground')
  assert.equal(isNearWhite('#F1F2F6', spec), true)
  assert.equal(isNearWhite('#C8DBF4', spec), false, 'the pale panel is a tint, not white')
  assert.equal(isNearWhite('#00BCFF', spec), false)
  assert.equal(isLargeText(24, 400, spec), true)
  assert.equal(isLargeText(23, 400, spec), false)
  assert.equal(isLargeText(19, 700, spec), true)
  assert.equal(isLargeText(19, 600, spec), false)
  assert.equal(isLargeText('x', 700, spec), false)
  assert.deepEqual(backgroundVerdict('rgb(17, 0, 104)', spec), { verdict: 'in-palette', hex: '#110068' })
  assert.deepEqual(backgroundVerdict('rgb(200, 219, 244)', spec), { verdict: 'in-palette', hex: '#C8DBF4' })
  assert.deepEqual(backgroundVerdict('rgb(0, 0, 239)', spec), { verdict: 'off-palette', hex: '#0000EF' }, 'the kit 8 primary is not in the guide')
  assert.deepEqual(backgroundVerdict('rgba(0, 0, 239, 0.5)', spec), { verdict: 'not-solid', hex: null })
  assert.equal(primaryFamily('"Montserrat", sans-serif'), 'Montserrat')
  assert.equal(primaryFamily('Poppins, sans-serif'), 'Poppins')
  assert.equal(primaryFamily('-apple-system, "system-ui", "Segoe UI"'), '-apple-system')
})

test('brand-visual verdicts: fonts, never-row contrast, logos; the allowlist is reported, not hidden', () => {
  const spec = loadBrandVisual()
  assert.equal(fontVerdict('Montserrat, sans-serif', {}, spec).verdict, 'ok')
  assert.equal(fontVerdict('"montserrat"', {}, spec).verdict, 'ok')
  assert.equal(fontVerdict('eicons', {}, spec).verdict, 'icon')
  assert.equal(fontVerdict('"Font Awesome 5 Free"', {}, spec).verdict, 'icon')
  assert.equal(fontVerdict('Poppins, sans-serif', {}, spec).verdict, 'off-brand')
  const allowed = fontVerdict('-apple-system, "system-ui", Roboto', { allowlistIds: ['alpha-hubspot-events-cards'] }, spec)
  assert.equal(allowed.verdict, 'allowed'); assert.equal(allowed.entry.thirdParty, false)
  assert.equal(fontVerdict('Poppins', { allowlistIds: ['no-such-entry'] }, spec).verdict, 'off-brand', 'an unknown allowlist id allows nothing')
  // contrast: the guide's never rows, with near-white standing in for white as a background.
  assert.equal(contrastVerdict({ color: '#00BCFF', background: '#FFFFFF', fontSizePx: 16, fontWeight: 400 }, spec).verdict, 'never')
  assert.equal(contrastVerdict({ color: '#00BCFF', background: '#F8F8F8', fontSizePx: 48, fontWeight: 900 }, spec).verdict, 'never', 'sky on the near-white page ground, any size')
  assert.equal(contrastVerdict({ color: '#FFFFFF', background: '#00BCFF', fontSizePx: 16, fontWeight: 400 }, spec).verdict, 'never')
  assert.equal(contrastVerdict({ color: '#110068', background: '#0D4AD1', fontSizePx: 40, fontWeight: 900 }, spec).verdict, 'never')
  assert.equal(contrastVerdict({ color: '#FFFFFF', background: '#418BE9', fontSizePx: 16, fontWeight: 400 }, spec).verdict, 'large-only-at-body-size')
  assert.equal(contrastVerdict({ color: '#FFFFFF', background: '#418BE9', fontSizePx: 32, fontWeight: 700 }, spec).verdict, 'ok', 'white on light blue is a headline move')
  assert.equal(contrastVerdict({ color: '#00BCFF', background: '#110068', fontSizePx: 12, fontWeight: 400 }, spec).verdict, 'ok', 'the kicker line')
  assert.equal(contrastVerdict({ color: '#0000EF', background: '#FFFFFF', fontSizePx: 16, fontWeight: 400 }, spec).verdict, 'ok', 'off-palette is not a contrast failure; the palette check reports it')
  assert.equal(contrastVerdict({ color: '#00BCFF', background: null, fontSizePx: 16, fontWeight: 400 }, spec).verdict, 'unknown-background')
  // logos: canonical by hash or name, the known live file, and strangers.
  const navy = spec.logo.assets.find((a) => a.file === 'alpha-school-logo-navy.svg')
  assert.deepEqual(logoVerdict({ src: 'https://alpha.school/wp-content/uploads/2026/09/x.svg', sha256: navy.sha256 }, spec).verdict, 'canonical')
  assert.equal(logoVerdict({ src: 'https://alpha.school/wp-content/uploads/2026/09/alpha-school-logo-navy.svg', sha256: 'ff'.repeat(32) }, spec).matchedBy, 'name (hash differs)')
  const live = logoVerdict({ src: 'https://alpha.school/wp-content/uploads/2024/03/logowhite-2.svg?v=3', sha256: '97413b301a210a17e0944869d890325b295b9e142fcfdc8e2c6ac8047f50bd13' }, spec)
  assert.equal(live.verdict, 'known-live'); assert.equal(live.file, 'logowhite-2.svg'); assert.equal(live.asset.lockup, 'ALPHA')
  assert.equal(logoVerdict({ src: 'https://alpha.school/wp-content/uploads/2025/01/logo-final-v2.png', sha256: null }, spec).verdict, 'unknown')
})

test('brand-visual check row: findings carry selector, value and rule; advisory mode warns, enforced fails, INFO never fails', () => {
  const spec = loadBrandVisual()
  const text = (over) => ({ selector: 'p in #intro', container: '#intro', region: 'main', sample: 'Join us for an info session', fontFamily: 'Montserrat, sans-serif', fontSizePx: 16, fontWeight: 400, color: '#2D2D2D', colorAlpha: 1, background: '#FFFFFF', backgroundKind: 'solid', allowlistIds: [], isHeadline: false, ...over })
  const measured = {
    url: 'https://alpha.school/austin/', viewport: { width: 1440, height: 1000 },
    text: [
      text({}),
      text({ selector: 'h2.elementor-heading-title in #FoundingFamilies', container: '#FoundingFamilies', sample: 'See How Alpha Transforms Kids', fontFamily: 'Poppins, sans-serif', isHeadline: true, color: '#0000EF' }),
      text({ selector: 'span in .elementor-element-50ceda9e', container: '.elementor-element-50ceda9e', sample: 'Looking for more stories', fontFamily: 'Slack-Lato, Slack-Fractions, appleLogo, sans-serif' }),
      text({ selector: 'div.ahse-event-type in #hubspot_events', container: '.ahse-event-card', sample: 'Info Session', fontFamily: '-apple-system, "system-ui", "Segoe UI", Roboto, sans-serif', allowlistIds: ['alpha-hubspot-events-cards'] }),
      text({ selector: 'span.ahse-time in #hubspot_events', container: '.ahse-event-card', sample: 'at 12:30 PM', fontFamily: '-apple-system, "system-ui", "Segoe UI", Roboto, sans-serif', allowlistIds: ['alpha-hubspot-events-cards'] }),
      text({ selector: 'span.kicker in #hero', container: '#hero', sample: 'IS HERE.', color: '#00BCFF', background: '#F8F8F8', fontSizePx: 48, fontWeight: 900, isHeadline: true }),
      text({ selector: 'p in .elementor-element-photo', container: '.elementor-element-photo', sample: 'over a photo', color: '#00BCFF', background: null, backgroundKind: 'image' }),
      text({ selector: 'i.eicon-chevron-right', container: '#carousel', sample: '', fontFamily: 'eicons' }),
      text({ selector: 'h1 in #title', container: '#title', sample: 'Alpha Austin', fontFamily: 'Montserrat', color: '#F8F8F8', background: '#0000EF', fontSizePx: 80, fontWeight: 700, isHeadline: true }),
    ],
    fields: [
      { selector: 'section.hero', region: 'main', backgroundColor: '#0000EF', width: 1440, height: 405 },
      { selector: 'div.overlay', region: 'main', backgroundColor: '#0000EF', width: 1440, height: 405 },
      { selector: 'footer', region: 'footer', backgroundColor: '#110068', width: 1440, height: 300 },
    ],
    logos: [
      { selector: 'img.wp-image-81 in .elementor-element-e4f7c0f', region: 'header', src: 'https://alpha.school/wp-content/uploads/2024/03/logowhite-2.svg', alt: 'Alpha School', width: 181, height: 80, visible: true, sha256: '97413b301a210a17e0944869d890325b295b9e142fcfdc8e2c6ac8047f50bd13' },
      { selector: 'img.wp-image-81 in .elementor-element-1b9d9d97', region: 'footer', src: 'https://alpha.school/wp-content/uploads/2024/03/logowhite-2.svg', alt: 'Alpha School', width: 60, height: 26, visible: true, sha256: '97413b301a210a17e0944869d890325b295b9e142fcfdc8e2c6ac8047f50bd13' },
    ],
  }
  const findings = evaluateBrandVisual(measured, spec)
  const by = (kind, sev) => findings.filter((f) => f.kind === kind && (!sev || f.severity === sev))
  assert.equal(by('font', 'fail').length, 2, 'Poppins and Slack-Lato, once each')
  assert.equal(by('font', 'info').length, 1, 'the events cards are one allowed line, not one per element')
  assert.match(by('font', 'info')[0].detail, /2 elements in -apple-system allowed by alpha-hubspot-events-cards \(in-house/)
  assert.match(by('font', 'info')[0].reason, /events plugin owner/)
  const poppins = by('font', 'fail').find((f) => f.value === 'Poppins')
  assert.equal(poppins.selector, 'h2.elementor-heading-title in #FoundingFamilies')
  assert.match(poppins.rule, /Montserrat, and only Montserrat/)
  assert.match(poppins.detail, /See How Alpha Transforms Kids/)
  assert.equal(by('contrast').length, 1, 'the kicker on the near-white ground; the element over the photo is skipped')
  assert.equal(by('contrast')[0].severity, 'fail')
  assert.match(by('contrast')[0].value, /#00BCFF on #F8F8F8 \(2\.1:1, 48px\/900\)/)
  assert.match(by('contrast')[0].rule, /#00BCFF on #FFFFFF: never/)
  assert.equal(by('background').length, 1, 'off-palette fields once per colour; navy is in the palette')
  assert.equal(by('background')[0].value, '#0000EF'); assert.match(by('background')[0].detail, /2 large fields/); assert.equal(by('background')[0].severity, 'info')
  assert.deepEqual(by('headline').map((f) => f.value).sort(), ['#0000EF', '#F8F8F8'])
  assert.equal(by('logo').length, 2, 'one per file and region')
  assert.match(by('logo')[0].detail, /known live file matched by hash \(ALPHA lockup, white\)/)
  assert.match(by('logo')[1].detail, /rendered 60px wide, below the 72px minimum/)
  // The row: advisory warns and lists everything; enforced fails; a clean page passes.
  const row = brandVisualCheck(measured, spec)
  assert.equal(row.id, 'brand-visual'); assert.equal(row.result, 'warn'); assert.equal(row.mode, 'advisory')
  assert.match(row.detail, /3 FAIL-severity findings \(advisory mode/)
  assert.match(row.detail, /font h2\.elementor-heading-title in #FoundingFamilies: Poppins \[typography\.family/)
  assert.match(row.detail, /INFO: /)
  assert.equal(row.findings.length, findings.length)
  const enforced = JSON.parse(JSON.stringify(spec)); enforced.check.enforcement.mode = 'enforced'
  assert.equal(brandVisualCheck(measured, enforced).result, 'fail')
  const softened = JSON.parse(JSON.stringify(spec)); softened.check.severities.font = 'info'; softened.check.severities.contrast = 'warn'
  const softRow = brandVisualCheck(measured, softened)
  assert.equal(softRow.result, 'warn'); assert.doesNotMatch(softRow.detail, /FAIL-severity/); assert.match(softRow.detail, /1 WARN: contrast/)
  const clean = { ...measured, text: [text({}), text({ selector: 'h1', color: '#110068', fontSizePx: 64, fontWeight: 900, isHeadline: true })], fields: [measured.fields[2]], logos: [{ ...measured.logos[0], src: 'https://alpha.school/wp-content/uploads/2026/09/alpha-school-logo-white.svg', sha256: spec.logo.assets.find((a) => a.file === 'alpha-school-logo-white.svg').sha256 }] }
  const cleanRow = brandVisualCheck(clean, spec)
  assert.equal(cleanRow.result, 'pass', cleanRow.detail)
  assert.match(cleanRow.detail, /1 INFO: logo .* canonical white svg, matched by hash/)
  assert.equal(brandVisualCheck({ error: 'net::ERR_FAILED', text: [], fields: [], logos: [] }, spec).result, 'fail', 'a page that did not load is a failure, not a pass')
  // Registration: advisory in the check map, INFO-only in the copy and launch-copy doneWhen, its own found-defect class.
  const checkMap = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'observer-check-map.json'), 'utf8'))
  assert.equal(checkMap.checks['brand-visual'].status, 'advisory'); assert.equal(checkMap.checks['brand-visual'].requirement, 'site.brand.visual')
  for (const id of ['copy', 'launch-copy-request', 'observer-launch-copy', 'observer-brand-leak']) assert.match(bundle.classes[id].doneWhen, /brand-visual .* as INFO, not blocking/, `${id} doneWhen`)
  assert.equal(bundle.classes['observer-brand-visual'].intake.ownerRole, 'website-agent-operator'); assert.equal(bundle.classes['observer-brand-visual'].approves, 'website-operations')
  assert.match(bundle.classes['observer-brand-visual'].doneWhen, /brand-visual no longer lists the finding/)
  const pageCheckSource = fs.readFileSync(path.join(root, 'tests', 'page-check.mjs'), 'utf8')
  assert.match(pageCheckSource, /checks\.push\(\{ id: BRAND_CHECK_ID, result: 'skipped', detail: renderedSkipReason \}\)/, 'without a browser the check is skipped, never passed')
  assert.match(pageCheckSource, /c\.result === 'warn'/, 'warn rows are printed and do not touch the exit code')
})

// Requester notices, 2026-09-23: APEX will not tell requesters when their ticket goes to Missing Info or Blocked, so the
// website system does, by Slack DM, once per ask, in plain words (agent/requester-notice-policy.mjs, agent/notify-requester.mjs).
function noticeError(fn, code) {
  try { fn() } catch (error) { assert.ok(error instanceof RequesterNoticeError || error instanceof NotifyRequesterError, error.stack); assert.equal(error.code, code); return error }
  assert.fail(`expected ${code}`)
}
async function noticeErrorAsync(promise, code) {
  try { await promise } catch (error) { assert.ok(error instanceof RequesterNoticeError || error instanceof NotifyRequesterError, error.stack); assert.equal(error.code, code); return error }
  assert.fail(`expected ${code}`)
}
function noticeTicket(overrides = {}) {
  return {
    id: 'cmnotice1', title: 'Website — Add team member — Alpha Austin', status: 'MISSING_INFO', requesterEmail: 'dawn.crichton-adams@alpha.school',
    description: '<p><strong>REQUEST</strong><br>Add team member</p><p><strong>DETAIL</strong><br>Please add Avery Example.</p>',
    customFields: { checkId: 'SITE-1', ownerRole: 'packet-owner', requestFamily: 'website' }, ...overrides,
  }
}
/** A fetch double for Slack and APEX together: records every call, answers by method or route. */
const REVIEWER = { id: 'U0B4W7Z23EX', real_name: 'Matt Barge', profile: { first_name: 'Matt' } }
function mockSlackApex({ slackUser = { id: 'U0B7GTFBE3C', real_name: 'Dawn Adams', profile: { first_name: 'Dawn' } }, ticket = noticeTicket(), lookupError = null, reviewer = REVIEWER } = {}) {
  const calls = []
  // Messages the mock posted, by ts, with the reactions a test adds (state.react(ts, name, userId)); history answers from them.
  const state = { ticket: structuredClone(ticket), messages: new Map(), react(ts, name, user) { const m = this.messages.get(ts); (m.reactions ||= []); let r = m.reactions.find((x) => x.name === name); if (!r) m.reactions.push(r = { name, users: [], count: 0 }); r.users.push(user); r.count++ } }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetchImpl = async (url, init = {}) => {
    const form = /x-www-form-urlencoded/.test(init.headers?.['Content-Type'] || '')
    const body = init.body ? (form ? Object.fromEntries(new URLSearchParams(init.body)) : JSON.parse(init.body)) : null
    calls.push({ url, method: init.method, authorization: init.headers?.Authorization, body, form })
    if (url.startsWith('https://slack.com/api/')) {
      const method = url.slice('https://slack.com/api/'.length)
      if (method === 'users.lookupByEmail') {
        if (lookupError) return json({ ok: false, error: lookupError })
        if (body.email === 'matthew.barge@superbuilders.school' || body.email === 'reviewer@superbuilders.school') return reviewer ? json({ ok: true, user: reviewer }) : json({ ok: false, error: 'users_not_found' })
        return slackUser ? json({ ok: true, user: slackUser }) : json({ ok: false, error: 'users_not_found' })
      }
      if (method === 'conversations.open') return json({ ok: true, channel: { id: body.users === reviewer?.id ? 'D0REVIEW' : 'D0DM1' } })
      if (method === 'chat.postMessage') { const ts = `17000.${calls.length}`; state.messages.set(ts, { ts, channel: body.channel, text: body.text, thread_ts: body.thread_ts || null, reactions: [] }); return json({ ok: true, channel: body.channel, ts }) }
      if (method === 'conversations.history') { const m = state.messages.get(body.latest); return json({ ok: true, messages: m && m.channel === body.channel ? [m] : [] }) }
      if (method === 'chat.getPermalink') return json({ ok: true, permalink: `https://alpha.slack.com/archives/${body.channel}/p${body.message_ts.replace('.', '')}` })
      return json({ ok: false, error: `not mocked ${method}` })
    }
    if (/\/api\/agent\/tasks\/[^/]+$/.test(url) && init.method === 'GET') return url.endsWith(`/${state.ticket.id}`) ? json(state.ticket) : json({ error: 'Task not found' }, 404)
    if (/\/api\/v1\/tasks\?status=/.test(url) && init.method === 'GET') return json({ items: url.includes('MISSING_INFO') ? [state.ticket] : [] })
    if (/\/api\/v1\/tasks\/[^/]+$/.test(url) && init.method === 'PATCH') {
      for (const key of Object.keys(body)) state.ticket[key] = body[key]
      return json({ task: state.ticket })
    }
    return json({ error: `not mocked ${init.method} ${url}` }, 404)
  }
  return { calls, fetchImpl, state, patches: () => calls.filter((c) => c.method === 'PATCH').map((c) => c.body), slack: (method) => calls.filter((c) => c.url === `https://slack.com/api/${method}`), posts: (channel) => calls.filter((c) => c.url === 'https://slack.com/api/chat.postMessage' && c.body.channel === channel).map((c) => c.body) }
}
/** Each notice test gets its own review ledger file; no test touches the default one under marketingsupport. */
function noticeEnvWith(extra = {}) { return { SLACK_BOT_TOKEN: 'xoxb-test', APEX_API_TOKEN: 'apex-test', APEX_API_BASE: 'http://127.0.0.1:4010/api/v1', NOTICE_REVIEW_LEDGER: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-notice-review-')), 'notice-review.jsonl'), ...extra } }
const noticeEnv = noticeEnvWith()
const reviewSpec = loadReviewSpec()
const flaggedSpec = { ...reviewSpec, reviewMode: 'flagged' }
// The direct-send path is what the poll invokes after the reviewer's reaction; these tests pass `reviewed` as the poll does.
const REVIEWED = 'reviewed-in-test'
const quiet = () => ({ lines: [], io: { log() {}, error() {} } })

test('requester notice text: first-name greeting, title, APEX link, numbered items, how to provide, signature; refuses dashes, exclamation, jargon, shouting, length', () => {
  const notice = composeMissingInfo({ name: 'Dawn', title: 'Website — Alpha Scottsdale', ticketId: 'cmsgak1mu000304ky2v3av9st', items: ['Dawn Adams: headshot and bio', 'jessica gile: whether the public title is Guide or Guide, Learning Lab'], alreadyDone: 'five cards updated on the page' })
  const lines = notice.text.split('\n')
  assert.equal(lines[0], 'Hi Dawn, this is the website team.')
  assert.equal(lines[2], 'Your request "Website: Alpha Scottsdale" is waiting on the following from you: https://apex.2hourlearning.com/intake?open=cmsgak1mu000304ky2v3av9st', 'the em dash APEX puts in the title never reaches the requester')
  assert.equal(lines[4], '1. Dawn Adams: headshot and bio')
  assert.equal(lines[5], '2. Jessica gile: whether the public title is Guide or Guide, Learning Lab', 'sentence case at the start of each item')
  assert.equal(lines[7], 'Already done: five cards updated on the page.')
  assert.match(lines[8], /^To send them: attach the files on the ticket, one file per person named for the person, or reply on the ticket\.$/)
  assert.equal(lines.at(-1), 'Website team (Matt Barge)')
  assert.ok(notice.words < NOTICE_MAX_WORDS && notice.words === notice.text.split(/\s+/).length, `${notice.words} words`)
  assert.equal(plainTitle('Website (Other) — Alpha Chicago'), 'Website: Alpha Chicago', 'the form-type parenthetical means nothing to the requester')
  assert.equal(plainTitle('Website (Update program info (address, phone, grade levels, etc.)) — Alpha High Santa Barbara, Alpha Santa Barbara'), 'Website: Alpha High Santa Barbara, Alpha Santa Barbara')
  assert.equal(plainTitle('Website — Add team member — Alpha Austin'), 'Website: Add team member: Alpha Austin')
  assert.equal(firstName({ email: 'dawn.crichton-adams@alpha.school' }), 'Dawn', 'without Slack the email gives the first name')
  assert.equal(firstName({ slackRealName: 'Michael Marino', email: 'mike@alpha.school' }), 'Michael')
  assert.equal(firstName({ slackFirstName: 'Andy', slackRealName: 'Andrew Gibson' }), 'Andy', 'the Slack profile first name wins')
  noticeError(() => composeMissingInfo({ name: '', title: 't', ticketId: 'x', items: ['a bio'] }), 'NO_REQUESTER')
  // The rules, one typed error each. The dash rule is what the brand copy rules say: an em dash never, an en dash only inside a range.
  assert.equal(noticeError(() => checkMessage('Hi Dawn — this is the website team.'), 'DASH').message, 'no em or en dash between words in a requester notice; found "—"')
  noticeError(() => checkMessage('the bio – and the photo'), 'DASH')
  noticeError(() => checkMessage('the bio–and the photo'), 'DASH')
  assert.equal(checkMessage('Grades K–12 stay as they are.').words, 6, 'an en dash inside a range is a range, not a dash between words')
  noticeError(() => checkMessage('Thanks so much!'), 'EXCLAMATION')
  for (const word of ['intake', 'class', 'ring', 'receipt', 'hash', 'n8n', 'HubSpot', 'Elementor']) assert.equal(noticeError(() => checkMessage(`The ${word} says so.`), 'JARGON').word, word.toLowerCase())
  assert.equal(checkMessage('Open https://apex.2hourlearning.com/intake?open=x and reply. Classes start Monday.').words, 7, 'the APEX link is a link, not the word; "classes" is not "class"')
  assert.equal(noticeError(() => checkMessage('PLEASE REPLY on the ticket.'), 'NOT_SENTENCE_CASE').token, 'PLEASE')
  assert.equal(checkMessage('Open the PDF in APEX; grades PREK-8 stay.').words, 8, 'known upper-case tokens are not shouting')
  const long = composeMissingInfo.bind(null, { name: 'Dawn', title: 't', ticketId: 'x', items: Array.from({ length: 12 }, (_, i) => `Item ${i}: the approved biography text and the public title for this person as it should read`) })
  assert.ok(noticeError(long, 'TOO_LONG').words >= NOTICE_MAX_WORDS)
})

test('requester notice items: what an internal source can supply is refused and logged, never asked', () => {
  const screened = screenItems([
    'Dawn Adams: headshot and bio',
    'the page URL to edit',
    'The exact public URL of the single page to edit',
    'the HubSpot grade value',
    'the exact filename if it already exists in the media library',
    'Alpha-Chicago-Info-Packet-2026-2027.pdf replacement',
    'confirm whether K-12 should remain',
    'the approved packet URL',
    '   ',
  ])
  assert.deepEqual(screened.accepted, ['Dawn Adams: headshot and bio'])
  assert.deepEqual(screened.refused.map((r) => r.reason.split(' (')[0]), ['page URL', 'page URL', 'HubSpot value', 'filename', 'filename', '"confirm" ask', 'approved packet URL'])
  const notice = composeMissingInfo({ name: 'Dawn', title: 't', ticketId: 'x', items: ['Dawn Adams: headshot and bio', 'confirm the spelling'] })
  assert.equal(notice.refused.length, 1)
  assert.doesNotMatch(notice.text, /confirm/)
  assert.deepEqual(notice.ask, ['Dawn Adams: headshot and bio'], 'the hash covers only what was asked')
  const nothing = noticeError(() => composeMissingInfo({ name: 'Dawn', title: 't', ticketId: 'x', items: ['the page URL', 'confirm the plan'] }), 'NO_ITEMS')
  assert.equal(nothing.refused.length, 2)
  // Intake's items for the notice are the requirement labels with the person named, not the system prompts.
  const decision = evaluateTicket(bundle, { id: 't1', title: 'Website — Add team member — Alpha Austin', requesterEmail: 'r@alpha.school', customFields: { requestFamily: 'website', websiteRequestType: 'add_team_member', webTmName: 'Avery Example' }, program: ['Alpha Austin'] })
  assert.equal(decision.outcome, 'missing-info')
  const items = requesterNoticeItems(bundle, decision)
  assert.ok(items.length >= 3 && items.every((item) => / for Avery Example$/.test(item)), JSON.stringify(items))
  assert.ok(items.every((item) => !screenItems([item]).refused.length), 'the labels pass the denylist')
  assert.equal(composeMissingInfo({ name: 'Rae', title: 't', ticketId: 't1', items }).refused.length, 0)
})

test('blocked notice names what it waits on and a person, never a role; shared-blocker DM is two lines at the thread', () => {
  const blocked = composeBlocked({ name: 'Lindsay', title: 'Website (Other) — Alpha Chicago', ticketId: 'cmu4hqkdg00000agmcjcawem0', waitingOn: 'the 2026-27 info packet batch, none approved yet', owner: 'Matt Barge', when: 'the day a packet is approved', alreadyDone: 'nothing on the page changes for this', roleIds: Object.keys(bundle.roleOwners) })
  const lines = blocked.text.split('\n')
  assert.equal(lines[0], 'Hi Lindsay, this is the website team.')
  assert.equal(lines[2], 'Your request "Website: Alpha Chicago" is on hold: https://apex.2hourlearning.com/intake?open=cmu4hqkdg00000agmcjcawem0')
  assert.deepEqual(lines.slice(4, 9), ['Waiting on: the 2026-27 info packet batch, none approved yet.', 'Owner: Matt Barge.', 'Expected: the day a packet is approved.', 'Already done: nothing on the page changes for this.', 'We will update you when it moves; no action needed from you.'])
  assert.equal(lines.at(-1), 'Website team (Matt Barge)')
  assert.equal(composeBlocked({ name: 'L', title: 't', ticketId: 'x', waitingOn: 'a decision', owner: 'Matt Barge' }).text.split('\n').length, 9, 'no Expected or Already done line when not given')
  assert.equal(noticeError(() => composeBlocked({ name: 'L', title: 't', ticketId: 'x', waitingOn: 'a decision', owner: 'packet-owner', roleIds: Object.keys(bundle.roleOwners) }), 'OWNER_IS_ROLE').owner, 'packet-owner')
  noticeError(() => composeBlocked({ name: 'L', title: 't', ticketId: 'x', waitingOn: 'a decision', owner: 'n8n-sync-owner' }), 'OWNER_IS_ROLE')
  noticeError(() => composeBlocked({ name: 'L', title: 't', ticketId: 'x', waitingOn: 'a decision', owner: '' }), 'NO_OWNER')
  noticeError(() => composeBlocked({ name: 'L', title: 't', ticketId: 'x', waitingOn: '', owner: 'Matt Barge' }), 'MISSING_ARG')
  assert.equal(ownerForRole('packet-owner', bundle.roleOwners), 'Matt Barge')
  assert.equal(ownerForRole('ticket-requester', bundle.roleOwners), null, 'many registered people is no answer')
  assert.equal(ownerForRole('no-such-role', bundle.roleOwners), null)
  const shared = composeShared({ name: 'Lindsay', title: 'Website (Other) — Alpha Chicago', ticketId: 'cmu4', permalink: 'https://alpha.slack.com/archives/C09GRQ8L533/p1700000000000001' })
  const sharedLines = shared.text.split('\n')
  assert.equal(sharedLines.length, 2)
  assert.equal(sharedLines[0], 'Hi Lindsay, this is the website team. Your request "Website: Alpha Chicago" (https://apex.2hourlearning.com/intake?open=cmu4) is on hold with others for the same reason; the note here says what it waits on and who owns it: https://alpha.slack.com/archives/C09GRQ8L533/p1700000000000001')
  assert.equal(sharedLines[1], 'We will update you when it moves; no action needed from you. Website team (Matt Barge)')
  noticeError(() => composeShared({ name: 'L', title: 't', ticketId: 'x', permalink: 'https://alpha.school/chicago/' }), 'BAD_PERMALINK')
  noticeError(() => composeShared({ name: 'L', title: 't', ticketId: 'x', permalink: 'not a url' }), 'BAD_PERMALINK')
})

test('requester notice ledger: same ask never twice, a changed ask once more, one blocked then blocked-update only on change', () => {
  const ask = askHash(['Dawn Adams: headshot and bio', 'Jenn Lopes: title'])
  assert.equal(ask, askHash(['dawn adams:  headshot and bio ', 'JENN LOPES: title']), 'whitespace and case do not make a new ask')
  assert.notEqual(ask, askHash(['Dawn Adams: headshot and bio']), 'a changed ask is a new ask')
  assert.equal(noticeDecision([], 'missing-info', ask).send, true)
  const sent = [{ kind: 'missing-info', askHash: ask, sentAt: '2026-09-23T10:00:00Z', slackChannel: 'D1', slackTs: '1.1', recipient: 'U1' }]
  const again = noticeDecision(sent, 'missing-info', ask)
  assert.equal(again.send, false); assert.match(again.reason, /already sent 2026-09-23T10:00:00Z for the same ask/)
  const changed = noticeDecision(sent, 'missing-info', askHash(['Dawn Adams: headshot and bio']))
  assert.equal(changed.send, true); assert.match(changed.reason, /the ask changed/)
  assert.equal(noticeDecision([{ kind: 'missing-info', askHash: ask, sentAt: null, unresolved: true }], 'missing-info', ask).send, true, 'an unresolved entry is not a sent notice')
  const blockerA = askHash(['packet batch', 'Matt Barge'])
  const blockerB = askHash(['packet approved, link swap pending', 'Matt Barge'])
  const first = noticeDecision([], 'blocked', blockerA)
  assert.deepEqual([first.send, first.kind], [true, 'blocked'])
  assert.deepEqual([noticeDecision([], 'blocked-update', blockerA).send, noticeDecision([], 'blocked-update', blockerA).kind], [true, 'blocked'], 'the first blocked notice is "blocked" whatever the caller asked')
  const afterFirst = [{ kind: 'blocked', askHash: blockerA, sentAt: '2026-09-23T10:00:00Z' }]
  assert.equal(noticeDecision(afterFirst, 'blocked', blockerA).send, false, 'the same blocker never resends')
  const update = noticeDecision(afterFirst, 'blocked', blockerB)
  assert.deepEqual([update.send, update.kind], [true, 'blocked-update'])
  const afterUpdate = [...afterFirst, { kind: 'blocked-update', askHash: blockerB, sentAt: '2026-09-24T10:00:00Z' }]
  assert.equal(noticeDecision(afterUpdate, 'blocked-update', blockerB).send, false)
  assert.equal(noticeDecision(afterUpdate, 'blocked', blockerA).send, false, 'going back to an earlier blocker text is not a change')
  noticeError(() => noticeDecision([], 'nudge', ask), 'BAD_KIND')
  // The ledger patch merges and never drops another key; the description append keeps the requester's text first.
  const patched = requesterNoticesPatch({ checkId: 'SITE-1', ownerRole: 'packet-owner', [LEDGER_FIELD]: sent }, { kind: 'blocked', askHash: blockerA, sentAt: 't' })
  assert.deepEqual(Object.keys(patched).sort(), ['checkId', 'ownerRole', LEDGER_FIELD].sort())
  assert.equal(patched[LEDGER_FIELD].length, 2)
  assert.equal(patched[LEDGER_FIELD][0], sent[0])
  assert.deepEqual(requesterNoticesPatch(undefined, { kind: 'blocked' })[LEDGER_FIELD], [{ kind: 'blocked' }])
  const html = appendNoticeToDescription('<p>Please add Avery.</p>', 'Hi Dawn, this is the website team.\n\n1. A bio <b>', '2026-09-23')
  assert.ok(html.startsWith('<p>Please add Avery.</p>'), 'original first')
  assert.equal(html, `<p>Please add Avery.</p><p><strong>${DESCRIPTION_HEADING}, 2026-09-23</strong><br>Hi Dawn, this is the website team.<br><br>1. A bio &lt;b&gt;</p>`)
  const plain = appendNoticeToDescription('Please add Avery.\n', 'Hi Dawn.', '2026-09-23')
  assert.equal(plain, `Please add Avery.\n\n${DESCRIPTION_HEADING}, 2026-09-23\nHi Dawn.\n`)
})

test('notify-requester dry run resolves the recipient, prints the message, and writes nothing; --send DMs then records with customFields-only and description-only patches', async () => {
  const dry = mockSlackApex()
  const { io, lines } = quiet(); io.log = (line) => lines.push(line)
  const preview = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio', 'the page URL'], alreadyDone: 'the title is on the page' }, { env: noticeEnv, fetchImpl: dry.fetchImpl, io })
  assert.equal(preview.dryRun, true)
  assert.deepEqual(preview.recipient, { email: 'dawn.crichton-adams@alpha.school', slackUserId: 'U0B7GTFBE3C', name: 'Dawn Adams' })
  assert.match(preview.message, /^Hi Dawn, this is the website team\./)
  assert.match(preview.message, /1\. Avery Example: headshot and bio/)
  assert.equal(preview.refused.length, 1)
  assert.deepEqual(dry.calls.map((c) => [c.method, c.url.replace(/^https?:\/\/[^/]+/, '')]), [['GET', '/api/agent/tasks/cmnotice1'], ['POST', '/api/users.lookupByEmail']], 'read the ticket, looked the requester up, nothing else')
  assert.equal(dry.patches().length, 0)
  assert.ok(lines.some((line) => /^recipient: Dawn Adams <dawn.crichton-adams@alpha.school> \(Slack U0B7GTFBE3C\)/.test(line)))
  assert.ok(lines.some((line) => /^dry run: nothing sent, nothing written/.test(line)))
  assert.ok(!lines.join('\n').includes('xoxb-test') && !lines.join('\n').includes('apex-test'), 'no secret is printed')

  const live = mockSlackApex()
  const sent = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio'], send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: live.fetchImpl, io: quiet().io, now: () => new Date('2026-09-23T15:00:00Z') })
  assert.deepEqual(sent.sent, { channel: 'D0DM1', ts: '17000.4' })
  assert.deepEqual(live.slack('conversations.open')[0].body, { users: 'U0B7GTFBE3C' })
  assert.equal(live.slack('chat.postMessage')[0].body.text, sent.message)
  assert.equal(live.slack('chat.postMessage')[0].authorization, 'Bearer xoxb-test')
  assert.ok(live.slack('users.lookupByEmail').every((c) => c.form && c.body.email === 'dawn.crichton-adams@alpha.school'), 'Slack calls are form-encoded (users.lookupByEmail refuses JSON)')
  const patches = live.patches()
  assert.equal(patches.length, 2)
  assert.deepEqual(Object.keys(patches[0]), ['customFields'], 'the ledger patch carries only customFields')
  assert.deepEqual(Object.keys(patches[0].customFields).sort(), ['checkId', 'ownerRole', 'requestFamily', LEDGER_FIELD].sort(), 'no other custom field is dropped')
  assert.deepEqual(patches[0].customFields[LEDGER_FIELD], [{ kind: 'missing-info', askHash: askHash(['Avery Example: headshot and bio']), sentAt: '2026-09-23T15:00:00.000Z', slackChannel: 'D0DM1', slackTs: '17000.4', recipient: 'U0B7GTFBE3C' }])
  assert.deepEqual(Object.keys(patches[1]), ['description'], 'the description patch carries only the description')
  assert.ok(patches[1].description.startsWith('<p><strong>REQUEST</strong><br>Add team member</p>'), 'the requester text stays first')
  assert.match(patches[1].description, /<p><strong>REQUESTER NOTICE \(Slack DM\), 2026-09-23<\/strong><br>Hi Dawn, this is the website team\./)
  assert.ok(patches.every((patch) => !('agentEligible' in patch) && !('status' in patch) && !('assignees' in patch)), 'never a status, assignee or eligibility write')
  assert.deepEqual(sent.wrote, ['customFields.requesterNotices', 'description'])

  // The once-only rule against the ledger the send just wrote: the same ask is not sent again; a changed ask is.
  const repeat = await runNotice({ ticket: live.state.ticket, kind: 'missing-info', items: ['Avery Example: headshot and bio'], send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: live.fetchImpl, io: quiet().io })
  assert.equal(repeat.decision.send, false); assert.equal(repeat.message, null)
  assert.equal(live.slack('chat.postMessage').length, 1, 'no second DM for the same ask')
  const changed = await runNotice({ ticket: live.state.ticket, kind: 'missing-info', items: ['Avery Example: headshot only, the bio arrived'], send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: live.fetchImpl, io: quiet().io })
  assert.equal(changed.decision.send, true); assert.match(changed.decision.reason, /the ask changed/)
  assert.equal(live.slack('chat.postMessage').length, 2)
  assert.equal(live.state.ticket.customFields[LEDGER_FIELD].length, 2)

  // Blocked: the owner comes from the ticket's ownerRole when one person is registered; the second send is an update only on change.
  const blocked = mockSlackApex({ ticket: noticeTicket({ status: 'BLOCKED' }) })
  const b1 = await runNotice({ ticketId: 'cmnotice1', kind: 'blocked', blocker: 'the 2026-27 packet batch, none approved yet', send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: blocked.fetchImpl, io: quiet().io })
  assert.equal(b1.kind, 'blocked'); assert.match(b1.message, /Owner: Matt Barge\./)
  const b2 = await runNotice({ ticket: blocked.state.ticket, kind: 'blocked', blocker: 'the 2026-27 packet batch, none approved yet', send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: blocked.fetchImpl, io: quiet().io })
  assert.equal(b2.decision.send, false)
  const b3 = await runNotice({ ticket: blocked.state.ticket, kind: 'blocked', blocker: 'the approved packet, link swap pending', send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: blocked.fetchImpl, io: quiet().io })
  assert.equal(b3.kind, 'blocked-update'); assert.equal(b3.decision.send, true)
  assert.equal(blocked.slack('chat.postMessage').length, 2)
  assert.deepEqual(blocked.state.ticket.customFields[LEDGER_FIELD].map((e) => e.kind), ['blocked', 'blocked-update'])
  // A role with no single registered person is refused, never guessed.
  await noticeErrorAsync(runNotice({ ticket: noticeTicket({ customFields: { ownerRole: 'ticket-requester' } }), kind: 'blocked', blocker: 'x' }, { env: noticeEnv, fetchImpl: mockSlackApex().fetchImpl, io: quiet().io }), 'NO_OWNER')
  // Typed failures: no ticket, no requester, no token for --send, a Slack error that is not "not found", the sender never reaching APEX.
  await noticeErrorAsync(runNotice({ kind: 'missing-info', items: ['x'] }, { env: noticeEnv, fetchImpl: mockSlackApex().fetchImpl, io: quiet().io }), 'MISSING_ARG')
  await noticeErrorAsync(runNotice({ ticket: noticeTicket({ requesterEmail: '' }), kind: 'missing-info', items: ['x'] }, { env: noticeEnv, fetchImpl: mockSlackApex().fetchImpl, io: quiet().io }), 'NO_REQUESTER')
  await noticeErrorAsync(runNotice({ ticket: noticeTicket(), kind: 'missing-info', items: ['a bio'], send: true }, { env: { ...noticeEnv, SLACK_BOT_TOKEN: '' }, fetchImpl: mockSlackApex().fetchImpl, io: quiet().io }), 'MISSING_TOKEN')
  await noticeErrorAsync(runNotice({ ticket: noticeTicket(), kind: 'missing-info', items: ['a bio'] }, { env: noticeEnv, fetchImpl: mockSlackApex({ lookupError: 'missing_scope' }).fetchImpl, io: quiet().io }), 'SLACK_ERROR')
  await noticeErrorAsync(runNotice({ ticket: noticeTicket(), kind: 'nudge', items: ['a bio'] }, { env: noticeEnv, fetchImpl: mockSlackApex().fetchImpl, io: quiet().io }), 'BAD_KIND')
  const untokened = await runNotice({ ticket: noticeTicket(), kind: 'missing-info', items: ['a bio'] }, { env: { APEX_API_TOKEN: 'x' }, fetchImpl: async () => { throw new Error('must not be called') }, io: quiet().io })
  assert.equal(untokened.recipient, null); assert.match(untokened.recipientNote, /SLACK_BOT_TOKEN not set/); assert.match(untokened.message, /^Hi Dawn,/, 'the email still gives the greeting')
  const source = fs.readFileSync(path.join(root, 'agent', 'notify-requester.mjs'), 'utf8')
  for (const forbidden of [/ALPHA_WP_/, /wp-json/, /\/status'/, /\/reconcile/, /agentEligible/, /assignees/]) assert.doesNotMatch(source, forbidden, `the notifier must not reach ${forbidden}`)
  assert.deepEqual(parseNotifyArgs(['--ticket', 'x', '--item', 'a', '--item', 'b', '--send']), { ticket: 'x', item: ['a', 'b'], send: true })
})

test('a requester with no Slack user gets no DM: the ledger says so, the note stays on the ticket, the digest lists the ticket', async () => {
  const none = mockSlackApex({ slackUser: null })
  const { io, lines } = quiet(); io.log = (line) => lines.push(line)
  const result = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio'], send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: none.fetchImpl, io, now: () => new Date('2026-09-23T15:00:00Z') })
  assert.equal(result.sent, null)
  assert.equal(result.recipient, null)
  assert.equal(result.recipientNote, 'no Slack user for dawn.crichton-adams@alpha.school; note on the ticket only; add to the coordinator digest')
  assert.ok(lines.some((line) => line === 'not sent: no Slack user for dawn.crichton-adams@alpha.school; note on the ticket only; add to the coordinator digest'))
  assert.equal(none.slack('chat.postMessage').length, 0)
  assert.equal(none.slack('conversations.open').length, 0)
  const patches = none.patches()
  assert.equal(patches.length, 2)
  const entry = patches[0].customFields[LEDGER_FIELD][0]
  assert.deepEqual(entry, { kind: 'missing-info', askHash: askHash(['Avery Example: headshot and bio']), sentAt: null, slackChannel: null, slackTs: null, recipient: null, unresolved: true, email: 'dawn.crichton-adams@alpha.school', at: '2026-09-23T15:00:00.000Z', reason: 'no Slack user for dawn.crichton-adams@alpha.school; note on the ticket only; add to the coordinator digest' })
  assert.match(patches[1].description, /REQUESTER NOTICE \(Slack DM\), 2026-09-23/, 'the requester still finds the ask on the ticket')
  assert.deepEqual(unresolvedNotices(none.state.ticket).map((e) => e.kind), ['missing-info'])
  const rows = digestRows([none.state.ticket, noticeTicket({ id: 'other' })])
  assert.deepEqual(rows.map((r) => [r.id, r.requesterEmail, r.kind, r.at]), [['cmnotice1', 'dawn.crichton-adams@alpha.school', 'missing-info', '2026-09-23T15:00:00.000Z']])
  const digestLines = []
  const digest = await runDigest({}, { env: noticeEnv, fetchImpl: none.fetchImpl, io: { log: (line) => digestLines.push(line), error() {} } })
  assert.equal(digest.length, 1)
  assert.match(digestLines[0], /^coordinator digest: 1 notice\(s\) with no Slack user; relay by hand/)
  assert.match(digestLines[1], /^cmnotice1 \| MISSING_INFO \| dawn.crichton-adams@alpha.school \| missing-info \| 2026-09-23T15:00:00.000Z \|/)
  // Once recorded, the same ask is still not resent when the person later joins Slack: a changed ask is.
  const joined = mockSlackApex({ ticket: none.state.ticket })
  const same = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio'], send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: joined.fetchImpl, io: quiet().io })
  assert.equal(same.decision.send, true, 'an unresolved entry never counted as sent, so the first reachable send goes')
  assert.equal(joined.slack('chat.postMessage').length, 1)
})

test('notify-shared-blocker posts one channel note and a two-line DM per ticket; dry run carries a placeholder permalink and sends nothing', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-shared-blocker-'))
  const bodyFile = path.join(tmp, 'note.md')
  fs.writeFileSync(bodyFile, 'The 2026-27 info packets are produced in one batch by MacKenzie Price\'s team; none is approved yet.\nThe website part is a link swap the day a packet is approved. Matt Barge owns the timeline.\n')
  const note = composeChannelNote({ title: 'Info packets 2026-27: what the packet tickets wait on', body: fs.readFileSync(bodyFile, 'utf8') })
  assert.match(note.text, /^Info packets 2026-27: what the packet tickets wait on\n\nThe 2026-27 info packets/)
  noticeError(() => composeChannelNote({ title: 'Packets', body: 'Approved — soon' }), 'DASH')
  noticeError(() => composeChannelNote({ title: 'Packets', body: 'The HubSpot value is wrong.' }), 'JARGON')
  noticeError(() => composeChannelNote({ title: '', body: 'x' }), 'MISSING_ARG')
  noticeError(() => planSharedBlocker({ channel: 'support-websites', title: 'x', 'body-file': bodyFile }), 'MISSING_ARG')
  noticeError(() => planSharedBlocker({ channel: 'C09GRQ8L533', title: 'x', 'body-file': path.join(tmp, 'missing.md') }), 'MISSING_ARG')
  noticeError(() => planSharedBlocker({ channel: 'C09GRQ8L533', title: 'x', 'body-file': bodyFile, send: true, 'dry-run': true }), 'MISSING_ARG')
  const plan = planSharedBlocker({ channel: 'C09GRQ8L533', title: 'Info packets 2026-27', 'body-file': bodyFile, tickets: 'cmnotice1, cmnotice1' })
  assert.deepEqual(plan.tickets, ['cmnotice1', 'cmnotice1'])
  assert.equal(plan.placeholderPermalink, 'https://slack.com/archives/C09GRQ8L533/p0')

  const dry = mockSlackApex({ slackUser: { id: 'U0BJBTXPDLG', real_name: 'Lindsay Dudley', profile: { first_name: 'Lindsay' } }, ticket: noticeTicket({ status: 'BLOCKED', title: 'Website (Other) — Alpha Chicago', requesterEmail: 'lindsay.dudley@alpha.school' }) })
  const preview = await runSharedBlocker({ ...plan, tickets: ['cmnotice1'] }, { env: noticeEnv, fetchImpl: dry.fetchImpl, io: quiet().io })
  assert.equal(preview.dryRun, true); assert.equal(preview.posted, null)
  assert.equal(dry.slack('chat.postMessage').length, 0); assert.equal(dry.patches().length, 0)
  assert.equal(preview.dms.length, 1); assert.equal(preview.dms[0].recipient.slackUserId, 'U0BJBTXPDLG')

  const live = mockSlackApex({ slackUser: { id: 'U0BJBTXPDLG', real_name: 'Lindsay Dudley', profile: { first_name: 'Lindsay' } }, ticket: noticeTicket({ status: 'BLOCKED', title: 'Website (Other) — Alpha Chicago', requesterEmail: 'lindsay.dudley@alpha.school' }) })
  const sent = await runSharedBlocker({ ...plan, tickets: ['cmnotice1'], send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: live.fetchImpl, io: quiet().io })
  const posts = live.slack('chat.postMessage')
  assert.equal(posts.length, 2, 'one channel note, one DM')
  assert.equal(posts[0].body.channel, 'C09GRQ8L533'); assert.equal(posts[0].body.text, plan.note.text)
  assert.equal(sent.permalink, `https://alpha.slack.com/archives/C09GRQ8L533/p${posts[0].body.channel === 'C09GRQ8L533' ? live.slack('chat.getPermalink')[0].body.message_ts.replace('.', '') : ''}`)
  const dm = posts[1].body.text.split('\n')
  assert.equal(dm.length, 2)
  assert.equal(dm[0], `Hi Lindsay, this is the website team. Your request "Website: Alpha Chicago" (https://apex.2hourlearning.com/intake?open=cmnotice1) is on hold with others for the same reason; the note here says what it waits on and who owns it: ${sent.permalink}`)
  assert.equal(dm[1], 'We will update you when it moves; no action needed from you. Website team (Matt Barge)')
  assert.deepEqual(live.state.ticket.customFields[LEDGER_FIELD].map((e) => [e.kind, e.askHash]), [['blocked', askHash([sent.permalink])]])
  // The same thread again sends nothing; a DM failure on one ticket is reported and does not stop the others.
  const again = await runNotice({ ticket: live.state.ticket, kind: 'blocked', shared: sent.permalink, send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: live.fetchImpl, io: quiet().io })
  assert.equal(again.decision.send, false); assert.equal(live.slack('chat.postMessage').length, 2)
  const partial = await runSharedBlocker({ ...plan, tickets: ['missing-ticket', 'cmnotice1'], send: true, reviewed: REVIEWED }, { env: noticeEnv, fetchImpl: live.fetchImpl, io: quiet().io })
  assert.equal(partial.dms[0].ok, false); assert.equal(partial.dms[0].code, 'APEX_ERROR')
  assert.equal(partial.dms[1].ok, true, 'the second ticket still got its DM')
})

test('intake carries the requester notice preview for Missing Info decisions and sends only with --apply --notify-send', async () => {
  const applied = await runMockApply({ failStatus: false })
  const notice = applied.report.results[0].requesterNotice
  assert.ok(notice, 'a request-clarification decision carries the notice')
  assert.equal(notice.mode, 'preview', 'no --notify-send, so a preview even under --apply')
  assert.equal(notice.kind, 'missing-info')
  assert.match(notice.recipientNote, /SLACK_BOT_TOKEN not set/, 'the child never had a Slack token')
  assert.match(notice.message, /^Hi Requester, this is the website team\./)
  assert.match(notice.message, /https:\/\/apex\.2hourlearning\.com\/intake\?open=mock-apply-success/)
  assert.ok(notice.words < NOTICE_MAX_WORDS)
  assert.equal(applied.report.summary.requesterNotices.previews, 1)
  assert.equal(applied.report.summary.requesterNotices.sent, 0)
  assert.ok(applied.patches.every((patch) => !patch.customFields?.[LEDGER_FIELD]), 'a preview writes no ledger')
  const source = fs.readFileSync(path.join(root, 'agent', 'intake.mjs'), 'utf8')
  assert.match(source, /Boolean\(args\['notify-send'\] && result\.applied\?\.ok\)/, 'the DM goes only after the APEX action succeeded')
})

// Review gate, 2026-09-23: before a notice reaches a requester the reviewer (Matt) sees the exact text in a DM and reacts;
// the poll sends on the send reaction, holds on the hold reaction, expires after seven days (spec/requester-notices.json,
// agent/notice-review.mjs, agent/notice-review-poll.mjs).
test('review spec: mode, reviewer, reactions, flag rules; a question item, an external recipient and a channel note are flagged; "all" reviews everything', () => {
  assert.deepEqual(validateReviewSpec(reviewSpec), [])
  assert.equal(reviewSpec.reviewMode, 'all', 'every notice goes through review now; "flagged" comes later')
  assert.deepEqual(reviewSpec.reactions, { send: 'white_check_mark', hold: 'x' })
  assert.equal(reviewSpec.reviewer.email, 'matthew.barge@superbuilders.school')
  assert.ok(validateReviewSpec({ ...reviewSpec, reviewMode: 'none' }).some((e) => /reviewMode/.test(e)))
  assert.ok(validateReviewSpec({ ...reviewSpec, reactions: { send: 'x', hold: 'x' } }).some((e) => /differ/.test(e)))
  assert.ok(validateReviewSpec({ ...reviewSpec, flagRules: reviewSpec.flagRules.slice(1) }).some((e) => /missing question/.test(e)))
  assert.ok(validateReviewSpec({ ...reviewSpec, expiryDays: 0 }).some((e) => /expiryDays/.test(e)))
  assert.ok(validateReviewSpec({ ...reviewSpec, internalDomains: [] }).some((e) => /internalDomains/.test(e)))
  // What is a question and what is an attach-a-file ask.
  assert.equal(isQuestionItem('Avery Example: headshot and bio'), false)
  assert.equal(isQuestionItem('headshot for Avery Example'), false)
  assert.equal(isQuestionItem('Dawn Adams: headshot, bio, and Dean of Parents or Assoc. Dean of Parents'), true, 'an either-or is a question')
  assert.equal(isQuestionItem('Patricio: Rosas or Rojas'), true)
  assert.equal(isQuestionItem('Tetiana Vozniuk Pierson and Alyssa Duncan: add them? Does Alyssa replace Angela Allen'), true)
  assert.equal(isQuestionItem('Remi Ho and Tasha Arnold: stay on the page, or come off and from when'), true)
  assert.equal(isQuestionItem('Title for Avery Example'), true, 'not a file: the requester has to write something')
  assert.equal(isInternalEmail('dawn@alpha.school', reviewSpec), true)
  assert.equal(isInternalEmail('someone@mail.alpha.school', reviewSpec), true)
  assert.equal(isInternalEmail('parent@gmail.com', reviewSpec), false)
  assert.equal(isInternalEmail('x@notalpha.school', reviewSpec), false)
  // Routing in both modes.
  const fileAsk = { kind: 'missing-info', items: ['Avery Example: headshot and bio'], recipientEmail: 'dawn@alpha.school' }
  assert.deepEqual(needsReview(fileAsk, reviewSpec), { needsReview: true, mode: 'all', flagged: false, reasons: ['review mode is "all"'] })
  assert.deepEqual(needsReview(fileAsk, flaggedSpec), { needsReview: false, mode: 'flagged', flagged: false, reasons: [] })
  const question = needsReview({ ...fileAsk, items: ['Patricio: Rosas or Rojas'] }, flaggedSpec)
  assert.equal(question.needsReview, true); assert.match(question.reasons[0], /question/)
  const external = needsReview({ ...fileAsk, recipientEmail: 'parent@gmail.com' }, flaggedSpec)
  assert.equal(external.needsReview, true); assert.match(external.reasons[0], /outside the internal domains/)
  assert.equal(needsReview({ kind: 'blocked', recipientEmail: 'l@alpha.school' }, flaggedSpec).needsReview, false, 'a blocked notice tells, it does not ask')
  assert.equal(needsReview({ kind: CHANNEL_NOTE_KIND }, flaggedSpec).needsReview, true, 'a channel note is always reviewed')
  assert.equal(needsReview({ kind: CHANNEL_NOTE_KIND }, reviewSpec).flagged, true)
  // The route a notice takes once composed.
  const gateOn = { needsReview: true }; const gateOff = { needsReview: false }
  assert.equal(noticeRoute({ send: false, review: false, recipient: {} }, gateOn), 'dry-run')
  assert.equal(noticeRoute({ send: false, review: true, recipient: {} }, gateOff), 'review', '--review is explicit whatever the gate says')
  assert.equal(noticeRoute({ send: false, review: true, recipient: null }, gateOn), 'nothing-to-review')
  assert.equal(noticeRoute({ send: true, recipient: {} }, gateOn), 'review')
  assert.equal(noticeRoute({ send: true, recipient: {} }, gateOff), 'send')
  assert.equal(noticeRoute({ send: true, reviewed: 'abc', recipient: {} }, gateOn), 'send', 'the poll sends what the reviewer approved')
  assert.equal(noticeRoute({ send: true, recipient: null }, gateOn), 'send', 'no Slack user: nothing to review, the note goes on the ticket')
  // Reactions: only the reviewer's, hold wins.
  const message = { reactions: [{ name: 'white_check_mark', users: ['U0OTHER'], count: 1 }] }
  assert.equal(reactionVerdict(message, 'U0B4W7Z23EX', reviewSpec), null, 'someone else\'s reaction does not count')
  assert.equal(reactionVerdict({ reactions: [{ name: 'white_check_mark', users: ['U0OTHER', 'U0B4W7Z23EX'] }] }, 'U0B4W7Z23EX', reviewSpec), 'send')
  assert.equal(reactionVerdict({ reactions: [{ name: 'x', users: ['U0B4W7Z23EX'] }, { name: 'white_check_mark', users: ['U0B4W7Z23EX'] }] }, 'U0B4W7Z23EX', reviewSpec), 'hold')
  assert.equal(reactionVerdict({}, 'U0B4W7Z23EX', reviewSpec), null)
  assert.equal(isExpired({ createdAt: '2026-09-16T00:00:00Z' }, reviewSpec, new Date('2026-09-23T00:00:01Z')), true)
  assert.equal(isExpired({ createdAt: '2026-09-20T00:00:00Z' }, reviewSpec, new Date('2026-09-23T00:00:00Z')), false)
  assert.equal(reviewerTime('2026-09-23T17:15:03Z', 'America/Los_Angeles'), '10:15 PDT on 2026-09-23')
  // The reviewer DM: header line, the exact text quoted, the instruction.
  const dm = composeReviewMessage({ kind: 'missing-info', subject: 'Dawn Adams', title: 'Website: Alpha Scottsdale', link: 'https://apex.2hourlearning.com/intake?open=cmsg', text: 'Hi Dawn, this is the website team.\n\n1. A bio' })
  assert.deepEqual(dm.split('\n'), ['Review: missing-info notice for Dawn Adams (Website: Alpha Scottsdale) https://apex.2hourlearning.com/intake?open=cmsg', '> Hi Dawn, this is the website team.', '> ', '> 1. A bio', REVIEW_INSTRUCTION])
  assert.equal(REVIEW_INSTRUCTION, 'React ✅ to send, ❌ to hold.')
  const note = composeReviewMessage({ kind: CHANNEL_NOTE_KIND, subject: '<#C09GRQ8L533>', title: 'Info packets 2026-27', text: 'x', reasons: ['a shared-blocker channel note is read by everyone in the channel'] })
  assert.match(note, /^Review: channel note for <#C09GRQ8L533> \(Info packets 2026-27\)\nWhy: a shared-blocker channel note is read by everyone in the channel\.\n> x\n/)
  assert.match(composeReviewMessage({ kind: 'blocked', subject: 'L', text: 'x', dependsOnNote: true, placeholder: 'https://slack.com/archives/C1/p0' }), /Goes after the channel note above is sent; https:\/\/slack\.com\/archives\/C1\/p0 in the text becomes the note's link\./)
  assert.throws(() => composeReviewMessage({ kind: 'blocked', subject: '', text: 'x' }), (e) => e instanceof NoticeReviewError && e.code === 'BAD_ITEM')
  // Ledger: append only, last line wins, a bad line is refused.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-review-ledger-'))
  const file = path.join(tmp, 'nested', 'notice-review.jsonl')
  assert.deepEqual(readLedger(file), [])
  appendLedger(file, { id: 'a', status: 'pending', ticketId: 't', kind: 'missing-info', askHash: 'h' })
  appendLedger(file, { id: 'b', status: 'pending', ticketId: 't2', kind: 'blocked', askHash: 'h2' })
  appendLedger(file, { id: 'a', status: 'sent', sentAt: 'now' })
  assert.deepEqual(readLedger(file).map((i) => [i.id, i.status, i.ticketId]), [['a', 'sent', 't'], ['b', 'pending', 't2']])
  assert.equal(findLiveItem(readLedger(file), { ticketId: 't', kind: 'missing-info', askHash: 'h' }).status, 'sent')
  assert.equal(findLiveItem(readLedger(file), { ticketId: 't', kind: 'missing-info', askHash: 'other' }), null)
  assert.throws(() => appendLedger(file, { id: 'c', status: 'maybe' }), (e) => e.code === 'BAD_ITEM')
  fs.appendFileSync(file, 'not json\n')
  assert.throws(() => readLedger(file), (e) => e instanceof NoticeReviewError && e.code === 'BAD_LEDGER')
  assert.equal(ledgerPath(reviewSpec, { NOTICE_REVIEW_LEDGER: file }), file)
  assert.ok(/notice-review\.jsonl$/.test(ledgerPath(reviewSpec, {})))
})

test('notify-requester --review DMs the reviewer the exact text, records a pending item, writes nothing to APEX; --send under mode "all" does the same; a live duplicate is not re-requested', async () => {
  const env = noticeEnvWith()
  const live = mockSlackApex()
  const { io, lines } = quiet(); io.log = (line) => lines.push(line)
  const items = ['Avery Example: headshot and bio', 'Avery Example: a short bio']
  const result = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items, review: true }, { env, fetchImpl: live.fetchImpl, io, now: () => new Date('2026-09-23T15:00:00Z') })
  assert.equal(result.route, 'review'); assert.equal(result.dryRun, false); assert.equal(result.sent, null)
  assert.equal(live.posts('D0DM1').length, 0, 'nothing to the requester')
  assert.equal(live.patches().length, 0, 'nothing on the ticket')
  const reviewPosts = live.posts('D0REVIEW')
  assert.equal(reviewPosts.length, 1)
  assert.deepEqual(live.slack('conversations.open').map((c) => c.body.users), ['U0B4W7Z23EX'], 'the DM is opened with the reviewer only')
  const reviewLines = reviewPosts[0].text.split('\n')
  assert.equal(reviewLines[0], 'Review: missing-info notice for Dawn Adams (Website: Add team member: Alpha Austin) https://apex.2hourlearning.com/intake?open=cmnotice1')
  assert.equal(reviewLines.at(-1), REVIEW_INSTRUCTION)
  assert.deepEqual(reviewLines.slice(1, -1), result.message.split('\n').map((l) => `> ${l}`), 'the exact message, quoted')
  assert.ok(!reviewPosts[0].text.includes('Why:'), 'mode "all" is not a flag; the unflagged file ask needs no Why line')
  assert.deepEqual(result.review, { duplicate: false, itemId: result.review.itemId, status: 'pending', channel: 'D0REVIEW', ts: [...live.state.messages.keys()][0] })
  const ledger = readLedger(env.NOTICE_REVIEW_LEDGER)
  assert.equal(ledger.length, 1)
  const item = ledger[0]
  assert.equal(item.id, result.review.itemId)
  assert.deepEqual([item.status, item.createdAt, item.mode, item.ticketId, item.kind, item.askHash, item.reviewChannel, item.reviewTs], ['pending', '2026-09-23T15:00:00.000Z', 'all', 'cmnotice1', 'missing-info', askHash(items), 'D0REVIEW', result.review.ts])
  assert.deepEqual(item.reviewer, { email: 'matthew.barge@superbuilders.school', slackUserId: 'U0B4W7Z23EX', name: 'Matt Barge' })
  assert.deepEqual(item.recipient, { email: 'dawn.crichton-adams@alpha.school', slackUserId: 'U0B7GTFBE3C', name: 'Dawn Adams' })
  assert.equal(item.text, result.message)
  assert.deepEqual(item.notice, { kind: 'missing-info', items, alreadyDone: null, blocker: null, owner: null, when: null, shared: null, title: null })
  assert.ok(lines.some((l) => /^review requested: DM to Matt Barge D0REVIEW ts /.test(l)))
  assert.ok(!lines.join('\n').includes('xoxb-test'), 'no secret is printed')
  // The same ask again while the item is pending: no second reviewer DM.
  const again = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items, review: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io })
  assert.equal(again.review.duplicate, true); assert.equal(again.review.itemId, item.id)
  assert.equal(live.posts('D0REVIEW').length, 1)
  assert.equal(readLedger(env.NOTICE_REVIEW_LEDGER).length, 1)
  // --send in mode "all" goes to review too (a changed ask is a new item); --reviewer overrides the address.
  const viaSend = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio', 'Patricio: Rosas or Rojas'], send: true, reviewer: 'reviewer@superbuilders.school' }, { env, fetchImpl: live.fetchImpl, io: quiet().io })
  assert.equal(viaSend.route, 'review'); assert.equal(viaSend.sent, null)
  assert.match(live.posts('D0REVIEW')[1].text, /\nWhy: an item is a question rather than an attach-a-file ask\.\n/, 'a flagged item says why even in mode "all"')
  assert.equal(live.posts('D0REVIEW').length, 2); assert.equal(live.posts('D0DM1').length, 0); assert.equal(live.patches().length, 0)
  assert.equal(readLedger(env.NOTICE_REVIEW_LEDGER)[1].reviewer.email, 'reviewer@superbuilders.school')
  // A dry run says which way --send would go.
  const { io: dryIo, lines: dryLines } = quiet(); dryIo.log = (l) => dryLines.push(l)
  const dry = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio'] }, { env, fetchImpl: mockSlackApex().fetchImpl, io: dryIo })
  assert.equal(dry.route, 'dry-run'); assert.equal(dry.dryRun, true)
  assert.ok(dryLines.some((l) => /^dry run: nothing sent, nothing written\. --send would go to review first \(review mode is "all"\), then DM the recipient/.test(l)), dryLines.join('\n'))
  // No Slack user: nothing to review, nothing written; with --send the note still goes on the ticket without a DM.
  const none = mockSlackApex({ slackUser: null })
  const nothing = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['a bio'], review: true }, { env, fetchImpl: none.fetchImpl, io: quiet().io })
  assert.equal(nothing.route, 'nothing-to-review'); assert.equal(none.slack('chat.postMessage').length, 0); assert.equal(none.patches().length, 0)
  const onTicket = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['a bio'], send: true }, { env, fetchImpl: none.fetchImpl, io: quiet().io })
  assert.equal(onTicket.route, 'send'); assert.equal(none.slack('chat.postMessage').length, 0); assert.equal(none.patches().length, 2)
  // Typed failures: no token, no Slack user for the reviewer, --send with --review.
  await noticeErrorAsync(runNotice({ ticket: noticeTicket(), kind: 'missing-info', items: ['a bio'], review: true }, { env: { ...env, SLACK_BOT_TOKEN: '' }, fetchImpl: mockSlackApex().fetchImpl, io: quiet().io }), 'MISSING_TOKEN')
  await noticeErrorAsync(runNotice({ ticket: noticeTicket(), kind: 'missing-info', items: ['a bio'], review: true }, { env, fetchImpl: mockSlackApex({ reviewer: null }).fetchImpl, io: quiet().io }), 'SLACK_ERROR')
  await noticeErrorAsync(runNotice({ ticket: noticeTicket(), kind: 'missing-info', items: ['a bio'], review: true, send: true }, { env, fetchImpl: mockSlackApex().fetchImpl, io: quiet().io }), 'MISSING_ARG')
  assert.deepEqual(parseNotifyArgs(['--ticket', 'x', '--item', 'a', '--review', '--reviewer', 'r@superbuilders.school']), { ticket: 'x', item: ['a'], review: true, reviewer: 'r@superbuilders.school' })
})

test('notice-review-poll: only the reviewer\'s reaction counts; send reaction sends once through the notifier and replies in the thread; hold holds; expiry expires; without --send it only reports', async () => {
  const env = noticeEnvWith()
  const live = mockSlackApex()
  const now = () => new Date('2026-09-23T17:15:03Z')
  const requested = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio'], review: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now: () => new Date('2026-09-23T15:00:00Z') })
  const reviewTs = requested.review.ts
  const poll = (opts = {}, clock = now) => runPoll({ send: true, ...opts }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now: clock })
  const replies = () => live.posts('D0REVIEW').filter((p) => p.thread_ts === reviewTs).map((p) => p.text)

  // No reaction: pending stays; nothing written.
  let report = await poll()
  assert.deepEqual(report.actions.map((a) => [a.verdict, a.did]), [['wait', 'no reaction from the reviewer yet']])
  assert.equal(live.slack('conversations.history')[0].body.channel, 'D0REVIEW')
  assert.deepEqual([live.slack('conversations.history')[0].body.latest, live.slack('conversations.history')[0].body.oldest, live.slack('conversations.history')[0].body.inclusive, live.slack('conversations.history')[0].body.limit], [reviewTs, reviewTs, 'true', '1'], 'the message is read by ts through conversations.history (im:history), not reactions.get')
  assert.equal(readLedger(env.NOTICE_REVIEW_LEDGER)[0].status, 'pending')
  // Someone else's send reaction, and the bot's own, do not count.
  live.state.react(reviewTs, 'white_check_mark', 'U0OTHER')
  live.state.react(reviewTs, 'white_check_mark', 'U0BDYJ6341Y')
  report = await poll()
  assert.equal(report.actions[0].verdict, 'wait')
  assert.equal(live.posts('D0DM1').length, 0)
  // The reviewer's send reaction, without --send: reports only.
  live.state.react(reviewTs, 'white_check_mark', 'U0B4W7Z23EX')
  report = await poll({ send: false })
  assert.deepEqual(report.actions.map((a) => [a.verdict, a.did]), [['send', 'would send']])
  assert.equal(live.posts('D0DM1').length, 0); assert.equal(live.patches().length, 0); assert.equal(replies().length, 0)
  assert.equal(readLedger(env.NOTICE_REVIEW_LEDGER)[0].status, 'pending')
  // With --send: the requester DM goes through the notifier path, the ticket is written, the item is sent, the thread says so.
  report = await poll()
  assert.deepEqual(report.actions.map((a) => [a.verdict, a.did]), [['send', 'sent']])
  const dms = live.posts('D0DM1')
  assert.equal(dms.length, 1); assert.equal(dms[0].text, requested.message)
  const patches = live.patches()
  assert.equal(patches.length, 2)
  assert.deepEqual(Object.keys(patches[0]), ['customFields']); assert.deepEqual(Object.keys(patches[1]), ['description'])
  const ticketLedger = live.state.ticket.customFields[LEDGER_FIELD]
  assert.equal(ticketLedger.length, 1); assert.equal(ticketLedger[0].askHash, askHash(['Avery Example: headshot and bio']))
  const item = readLedger(env.NOTICE_REVIEW_LEDGER)[0]
  assert.equal(item.status, 'sent'); assert.equal(item.sentAt, '2026-09-23T17:15:03.000Z')
  assert.deepEqual(item.sent, { channel: 'D0DM1', ts: ticketLedger[0].slackTs })
  assert.deepEqual(item.wrote, ['customFields.requesterNotices', 'description'])
  assert.deepEqual(replies(), ['Sent to Dawn Adams at 10:15 PDT on 2026-09-23'])
  assert.deepEqual(readLedger(env.NOTICE_REVIEW_LEDGER).length, 1, 'the ledger folds to one item')
  // Never twice: the next pass has nothing pending; the reaction is still there.
  report = await poll()
  assert.deepEqual(report.actions, [])
  assert.equal(live.posts('D0DM1').length, 1); assert.equal(live.patches().length, 2); assert.equal(replies().length, 1)

  // Hold: the hold reaction marks held and replies; hold wins over send.
  const held = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: the bio only'], review: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now })
  live.state.react(held.review.ts, 'white_check_mark', 'U0B4W7Z23EX')
  live.state.react(held.review.ts, 'x', 'U0B4W7Z23EX')
  report = await poll()
  assert.deepEqual(report.actions.map((a) => [a.verdict, a.did]), [['hold', 'held']])
  assert.equal(readLedger(env.NOTICE_REVIEW_LEDGER)[1].status, 'held')
  assert.deepEqual(live.posts('D0REVIEW').filter((p) => p.thread_ts === held.review.ts).map((p) => p.text), ['Held. Nothing sent.'])
  assert.equal(live.posts('D0DM1').length, 1)
  // A held ask may be requested again (a new item), a sent one may not.
  const reHeld = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: the bio only'], review: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now })
  assert.equal(reHeld.review.duplicate, false)
  // Expiry: no reaction in seven days.
  report = await poll({}, () => new Date('2026-10-01T00:00:00Z'))
  assert.deepEqual(report.actions.map((a) => [a.verdict, a.did]), [['expire', 'expired']])
  const expired = readLedger(env.NOTICE_REVIEW_LEDGER).find((i) => i.id === reHeld.review.itemId)
  assert.equal(expired.status, 'expired')
  assert.deepEqual(live.posts('D0REVIEW').filter((p) => p.thread_ts === reHeld.review.ts).map((p) => p.text), ['Expired: no reaction from the reviewer in 7 days; nothing sent. Run the notice again to request review.'])
  // Stale: the ticket changed between review and reaction, so the recomposed text differs; held, not sent.
  const stale = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: a photo'], review: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now })
  live.state.ticket.title = 'Website — Add team member — Alpha Austin (renamed)'
  live.state.react(stale.review.ts, 'white_check_mark', 'U0B4W7Z23EX')
  report = await poll()
  assert.deepEqual(report.actions.map((a) => [a.verdict, a.did]), [['send', 'stale']])
  assert.equal(live.posts('D0DM1').length, 1, 'nothing sent')
  assert.match(live.posts('D0REVIEW').filter((p) => p.thread_ts === stale.review.ts)[0].text, /^Held: the text no longer reads as reviewed/)
  live.state.ticket.title = 'Website — Add team member — Alpha Austin'
  // Superseded: the ticket already records the ask (sent by another route); nothing goes twice.
  const dup = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: a logo'], review: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now })
  live.state.ticket.customFields[LEDGER_FIELD].push({ kind: 'missing-info', askHash: askHash(['Avery Example: a logo']), sentAt: '2026-09-23T18:00:00Z', slackChannel: 'D0DM1', slackTs: '1.1', recipient: 'U0B7GTFBE3C' })
  live.state.react(dup.review.ts, 'white_check_mark', 'U0B4W7Z23EX')
  report = await poll()
  assert.deepEqual(report.actions.map((a) => [a.verdict, a.did]), [['send', 'superseded']])
  assert.equal(live.posts('D0DM1').length, 1)
  assert.match(live.posts('D0REVIEW').filter((p) => p.thread_ts === dup.review.ts)[0].text, /^Not sent: the ticket already records this notice/)
  // Missing tokens are typed.
  await noticeErrorAsync(runPoll({ send: true }, { env: { ...env, SLACK_BOT_TOKEN: '' }, fetchImpl: live.fetchImpl, io: quiet().io }), 'MISSING_TOKEN')
  const source = fs.readFileSync(path.join(root, 'agent', 'notice-review-poll.mjs'), 'utf8')
  assert.doesNotMatch(source, /reactions\.get/, 'the bot has no reactions:read; reactions come from conversations.history')
  for (const forbidden of [/ALPHA_WP_/, /wp-json/, /\/status'/, /agentEligible/, /assignees/]) assert.doesNotMatch(source, forbidden)
})

test('shared blocker under review: one reviewer DM for the note and one per requester DM; the DM waits for the note, then carries its real permalink', async () => {
  const env = noticeEnvWith()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-shared-review-'))
  const bodyFile = path.join(tmp, 'note.md')
  fs.writeFileSync(bodyFile, 'The 2026-27 info packets are produced in one batch; none is approved yet.\nMatt Barge owns the timeline.\n')
  const lindsay = { id: 'U0BJBTXPDLG', real_name: 'Lindsay Dudley', profile: { first_name: 'Lindsay' } }
  const live = mockSlackApex({ slackUser: lindsay, ticket: noticeTicket({ status: 'BLOCKED', title: 'Website (Other) — Alpha Chicago', requesterEmail: 'lindsay.dudley@alpha.school' }) })
  const now = () => new Date('2026-09-23T17:15:03Z')
  noticeError(() => planSharedBlocker({ channel: 'C09GRQ8L533', title: 'x', 'body-file': bodyFile, send: true, review: true }), 'MISSING_ARG')
  const plan = planSharedBlocker({ channel: 'C09GRQ8L533', title: 'Info packets 2026-27', 'body-file': bodyFile, tickets: 'cmnotice1', review: true })
  assert.equal(plan.review, true)
  const result = await runSharedBlocker(plan, { env, fetchImpl: live.fetchImpl, io: quiet().io, now })
  assert.equal(result.route, 'review'); assert.equal(result.posted, null)
  assert.equal(live.posts('C09GRQ8L533').length, 0, 'nothing in the channel'); assert.equal(live.posts('D0DM1').length, 0, 'nothing to the requester'); assert.equal(live.patches().length, 0)
  const reviewPosts = live.posts('D0REVIEW')
  assert.equal(reviewPosts.length, 2)
  assert.match(reviewPosts[0].text, /^Review: channel note for <#C09GRQ8L533> \(Info packets 2026-27\) tickets cmnotice1\nWhy: a shared-blocker channel note is read by everyone in the channel\.\n> Info packets 2026-27\n> \n> The 2026-27 info packets/)
  assert.match(reviewPosts[1].text, /^Review: blocked notice for Lindsay Dudley \(Website: Alpha Chicago\) https:\/\/apex\.2hourlearning\.com\/intake\?open=cmnotice1\nGoes after the channel note above is sent; https:\/\/slack\.com\/archives\/C09GRQ8L533\/p0 in the text becomes the note's link\.\n> Hi Lindsay/)
  const [noteItem, dmItem] = readLedger(env.NOTICE_REVIEW_LEDGER)
  assert.deepEqual([noteItem.kind, noteItem.channel, noteItem.tickets, noteItem.status], [CHANNEL_NOTE_KIND, 'C09GRQ8L533', ['cmnotice1'], 'pending'])
  assert.deepEqual([dmItem.kind, dmItem.dependsOn, dmItem.placeholder, dmItem.notice.shared], ['blocked', noteItem.id, 'https://slack.com/archives/C09GRQ8L533/p0', 'https://slack.com/archives/C09GRQ8L533/p0'])
  // --send is the same as --review for a channel note (always flagged), and the same items are not re-requested.
  const viaSend = await runSharedBlocker({ ...plan, review: false, send: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now })
  assert.equal(viaSend.route, 'review'); assert.equal(viaSend.review.duplicate, true); assert.equal(live.posts('D0REVIEW').length, 2)

  const poll = () => runPoll({ send: true }, { env, fetchImpl: live.fetchImpl, io: quiet().io, now })
  // The DM approved before the note: it waits.
  live.state.react(dmItem.reviewTs, 'white_check_mark', 'U0B4W7Z23EX')
  let report = await poll()
  assert.deepEqual(report.actions.map((a) => [a.kind, a.verdict, a.did]), [[CHANNEL_NOTE_KIND, 'wait', 'no reaction from the reviewer yet'], ['blocked', 'wait', 'approved, waiting for the channel note (pending)']])
  assert.equal(live.posts('C09GRQ8L533').length, 0); assert.equal(live.posts('D0DM1').length, 0)
  // The note approved: posted to the channel, then the DM goes in the same pass with the real permalink.
  live.state.react(noteItem.reviewTs, 'white_check_mark', 'U0B4W7Z23EX')
  report = await poll()
  assert.deepEqual(report.actions.map((a) => [a.kind, a.verdict, a.did]), [[CHANNEL_NOTE_KIND, 'send', 'sent'], ['blocked', 'send', 'sent']])
  const channelPosts = live.posts('C09GRQ8L533')
  assert.equal(channelPosts.length, 1); assert.equal(channelPosts[0].text, plan.note.text)
  const [sentNote, sentDm] = readLedger(env.NOTICE_REVIEW_LEDGER)
  assert.equal(sentNote.status, 'sent'); assert.match(sentNote.sent.permalink, /^https:\/\/alpha\.slack\.com\/archives\/C09GRQ8L533\/p/)
  const dms = live.posts('D0DM1')
  assert.equal(dms.length, 1)
  assert.ok(dms[0].text.includes(sentNote.sent.permalink) && !dms[0].text.includes('/p0'), 'the placeholder became the note link')
  assert.equal(dms[0].text, dmItem.text.split('https://slack.com/archives/C09GRQ8L533/p0').join(sentNote.sent.permalink))
  assert.equal(sentDm.status, 'sent')
  assert.deepEqual(live.state.ticket.customFields[LEDGER_FIELD].map((e) => [e.kind, e.askHash]), [['blocked', askHash([sentNote.sent.permalink])]])
  const threadReplies = live.posts('D0REVIEW').filter((p) => p.thread_ts).map((p) => p.text)
  assert.match(threadReplies[0], /^Sent to <#C09GRQ8L533> at 10:15 PDT on 2026-09-23: https:\/\/alpha\.slack\.com/)
  assert.equal(threadReplies[1], 'Sent to Lindsay Dudley at 10:15 PDT on 2026-09-23')
  assert.deepEqual((await poll()).actions, [], 'nothing pending afterwards')
  // A DM whose note was held is held too.
  const live2 = mockSlackApex({ slackUser: lindsay, ticket: noticeTicket({ id: 'cmnotice2', status: 'BLOCKED', requesterEmail: 'lindsay.dudley@alpha.school' }) })
  const env2 = noticeEnvWith()
  await runSharedBlocker({ ...plan, tickets: ['cmnotice2'] }, { env: env2, fetchImpl: live2.fetchImpl, io: quiet().io, now })
  const [note2, dm2] = readLedger(env2.NOTICE_REVIEW_LEDGER)
  live2.state.react(note2.reviewTs, 'x', 'U0B4W7Z23EX'); live2.state.react(dm2.reviewTs, 'white_check_mark', 'U0B4W7Z23EX')
  const held = await runPoll({ send: true }, { env: env2, fetchImpl: live2.fetchImpl, io: quiet().io, now })
  assert.deepEqual(held.actions.map((a) => a.did), ['held', 'held'])
  assert.equal(live2.posts('C09GRQ8L533').length, 0); assert.equal(live2.posts('D0DM1').length, 0)
})

test('flagged mode: an unflagged file ask sends directly with --send, a question or an external recipient goes to review; intake --notify-send takes the same route', async () => {
  const env = noticeEnvWith()
  const direct = mockSlackApex()
  const sent = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio'], send: true, reviewSpec: flaggedSpec }, { env, fetchImpl: direct.fetchImpl, io: quiet().io })
  assert.equal(sent.route, 'send'); assert.deepEqual(sent.gate, { needsReview: false, mode: 'flagged', flagged: false, reasons: [] })
  assert.equal(direct.posts('D0DM1').length, 1); assert.equal(direct.posts('D0REVIEW').length, 0); assert.equal(direct.patches().length, 2)
  assert.deepEqual(readLedger(env.NOTICE_REVIEW_LEDGER), [], 'a direct send leaves no review item')
  const question = mockSlackApex()
  const reviewed = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio', 'Patricio: Rosas or Rojas'], send: true, reviewSpec: flaggedSpec }, { env, fetchImpl: question.fetchImpl, io: quiet().io })
  assert.equal(reviewed.route, 'review'); assert.match(reviewed.gate.reasons[0], /question/)
  assert.equal(question.posts('D0DM1').length, 0); assert.equal(question.posts('D0REVIEW').length, 1); assert.equal(question.patches().length, 0)
  assert.match(question.posts('D0REVIEW')[0].text, /\nWhy: an item is a question rather than an attach-a-file ask\.\n/, 'a flagged item says why')
  const external = mockSlackApex({ ticket: noticeTicket({ requesterEmail: 'parent@gmail.com' }) })
  const ext = await runNotice({ ticketId: 'cmnotice1', kind: 'missing-info', items: ['Avery Example: headshot and bio'], send: true, reviewSpec: flaggedSpec }, { env, fetchImpl: external.fetchImpl, io: quiet().io })
  assert.equal(ext.route, 'review'); assert.match(ext.gate.reasons[0], /outside the internal domains/)
  assert.equal(external.posts('D0DM1').length, 0); assert.equal(external.posts('D0REVIEW').length, 1)
  const blocked = mockSlackApex({ ticket: noticeTicket({ status: 'BLOCKED' }) })
  const b = await runNotice({ ticketId: 'cmnotice1', kind: 'blocked', blocker: 'the packet batch', send: true, reviewSpec: flaggedSpec }, { env, fetchImpl: blocked.fetchImpl, io: quiet().io })
  assert.equal(b.route, 'send'); assert.equal(blocked.posts('D0DM1').length, 1)
  // Intake sends through runNotice with send: true and nothing else, so the spec decides there too; the report carries the route.
  const source = fs.readFileSync(path.join(root, 'agent', 'intake.mjs'), 'utf8')
  assert.match(source, /const mode = notice\.route === 'review' \? 'review' : notice\.route === 'send' \? 'sent' : 'preview'/)
  assert.doesNotMatch(source, /reviewed:/, 'intake never bypasses the gate')
  assert.match(source, /reviewRequested:/)
})

test('notice-review-poll CLI: an empty ledger is a clean no-op; a missing token is a typed exit 1', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-poll-cli-'))
  const ledger = path.join(tmp, 'notice-review.jsonl')
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'notice-review-poll.mjs'), '--once', '--send', '--ledger', ledger], { encoding: 'utf8', env: { ...process.env, SLACK_BOT_TOKEN: 'xoxb-never', APEX_API_TOKEN: 'never-used', APEX_API_BASE: 'http://127.0.0.1:1', NOTICE_REVIEW_LEDGER: '' } })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /^no pending review item in /)
  assert.ok(!run.stdout.includes('never') && !run.stderr.includes('never'), 'no token is printed')
  const untokened = spawnSync(process.execPath, [path.join(root, 'agent', 'notice-review-poll.mjs'), '--once', '--ledger', ledger], { encoding: 'utf8', env: { ...process.env, SLACK_BOT_TOKEN: '', APEX_API_TOKEN: '' } })
  assert.equal(untokened.status, 1)
  assert.match(untokened.stderr, /^MISSING_TOKEN: SLACK_BOT_TOKEN required to read the reviewer reactions/)
  assert.ok(!fs.existsSync(ledger), 'nothing written')
})

test('notify-requester CLI exits 1 on a typed input error without contacting Slack or APEX', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'notify-requester.mjs'), '--ticket', 'cmnotice1', '--kind', 'nudge', '--item', 'a bio'], { encoding: 'utf8', env: { ...process.env, SLACK_BOT_TOKEN: 'xoxb-never', APEX_API_TOKEN: 'never-used', APEX_API_BASE: 'http://127.0.0.1:1' } })
  assert.equal(run.status, 1, run.stderr)
  assert.match(run.stderr, /^BAD_KIND: --kind must be one of missing-info, blocked, blocked-update, got nudge/)
  assert.ok(!run.stderr.includes('never') && !run.stdout.includes('never'), 'no token is printed')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-notify-cli-'))
  const file = path.join(tmp, 'ticket.json'); fs.writeFileSync(file, JSON.stringify(noticeTicket()))
  const dry = spawnSync(process.execPath, [path.join(root, 'agent', 'notify-requester.mjs'), '--file', file, '--kind', 'missing-info', '--item', 'Avery Example: headshot and bio', '--item', 'the page URL'], { encoding: 'utf8', env: { ...process.env, SLACK_BOT_TOKEN: '', APEX_API_TOKEN: '', APEX_API_BASE: 'http://127.0.0.1:1' } })
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /recipient: SLACK_BOT_TOKEN not set/)
  assert.match(dry.stdout, /--- message \(\d+ words\) ---\nHi Dawn, this is the website team\./)
  assert.match(dry.stderr, /^refused item \(page URL/)
  assert.match(dry.stdout, /dry run: nothing sent, nothing written/)
})

// Check bundle (QC loop redesign 2026-09-24, workstreams 1 and 2).
import { buildBundle, extractObserverCheckNames, observerCheckNames } from './build-checks.mjs'
import { validateSchemaValue } from './validate-playbook.mjs'

const checkBundle = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'check-bundle.generated.json'), 'utf8'))
const checkRow = (id) => { const row = checkBundle.rows.find((r) => r.id === id); assert.ok(row, `row ${id} missing`); return row }

test('check bundle builds without errors, is current, validates against its schema, and covers every observer check', () => {
  const built = buildBundle()
  assert.deepEqual(built.errors, [])
  assert.equal(built.bundle.sha256, checkBundle.sha256, 'committed bundle is stale: run node tests/build-checks.mjs')
  assert.equal(built.bundle.rowsSha256, crypto.createHash('sha256').update(JSON.stringify(built.bundle.rows)).digest('hex'))
  assert.equal(checkBundle.policySha256, bundle.policySha256)
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'schemas', 'check-bundle.schema.json'), 'utf8'))
  const errors = []
  validateSchemaValue(checkBundle, schema, 'check-bundle', errors)
  assert.deepEqual(errors, [])
  const names = observerCheckNames()
  const rows = new Set(checkBundle.rows.map((r) => r.observerCheck))
  const retired = new Set(checkBundle.retired.map((r) => r.observerCheck))
  for (const name of names) assert.ok(rows.has(name) || retired.has(name), `${name} has no row and no retirement`)
  for (const name of [...rows, ...retired]) assert.ok(names.includes(name), `${name} is not an observer check`)
  for (const name of retired) assert.ok(!rows.has(name), `${name} is both a row and retired`)
  assert.ok(names.length >= 109)
  // the release manifest carries the hash
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'release-manifest.json'), 'utf8'))
  assert.equal(manifest.checkBundleSha256, checkBundle.sha256)
  assert.equal(manifest.checkBundleVersion, checkBundle.version)
  // every row carries the shared contract fields with the exact names
  for (const row of checkBundle.rows) {
    for (const field of ['id', 'observerCheck', 'title', 'pageFamily', 'lifecycleStates', 'element', 'expected', 'comparator', 'severity', 'status', 'ticketClass', 'ownerRole', 'dedupeScope', 'clearAfterRuns', 'gracePeriodHours', 'evidenceProfile', 'sourceHealthDependency', 'requirementRef']) assert.ok(field in row, `${row.id} lacks ${field}`)
    assert.ok(('literal' in row.expected) !== ('derive' in row.expected), `${row.id} expected must be literal xor derive`)
    assert.ok(checkBundle.pageFamilies[row.pageFamily], `${row.id} pageFamily ${row.pageFamily}`)
  }
  for (const entry of checkBundle.retired) for (const field of ['observerCheck', 'reason', 'replacedBy', 'decidedBy', 'date']) assert.ok(field in entry, `retired ${entry.observerCheck} lacks ${field}`)
})

test('check bundle: a missing row or a check that is both a row and retired fails the build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-bundle-'))
  const source = fs.readFileSync(path.join(root, 'tests', 'build-checks.mjs'), 'utf8')
  // The builder reads relative to its own location; copy the repo files it needs into a scratch tree and drop one row.
  for (const rel of ['spec', 'registry', 'tests']) fs.cpSync(path.join(root, rel), path.join(dir, rel), { recursive: true })
  const rows = JSON.parse(fs.readFileSync(path.join(dir, 'spec', 'check-rows.json'), 'utf8'))
  rows.rows = rows.rows.filter((r) => r.id !== 'site.layout.header-overlap.desktop' && r.id !== 'site.layout.header-overlap.mobile')
  rows.retired.push({ observerCheck: 'campus-sister-brand-leak', reason: 'x', replacedBy: null, decidedBy: 'test', date: '2026-09-24' })
  fs.writeFileSync(path.join(dir, 'spec', 'check-rows.json'), JSON.stringify(rows))
  const result = spawnSync(process.execPath, [path.join(dir, 'tests', 'build-checks.mjs'), '--check'], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /campus-layout-header-overlap has neither a row nor a retirement/)
  assert.match(result.stderr, /campus-sister-brand-leak: also has a row/)
  assert.ok(source.includes('has neither a row nor a retirement'))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('check bundle: the observer inventory extractor reads finding literals and the resource tables', () => {
  const names = extractObserverCheckNames(`
    findings.push(finding("campus-truth", "campus-heading-identity", entity, "heading", "medium", "t", "d", {}));
    findings.push(finding(
      "event-truth",
      "hubspot-event-required-facts",
      id, "startTime", "high", "t", "d", {}));
    { presentCheck: "campus-info-packet-present", destinationCheck: "campus-info-packet-destination-campus" }
    { links: x, label: "calendar", check: "campus-calendar-link-reachable" }
  `)
  assert.deepEqual(names, ['campus-calendar-link-reachable', 'campus-heading-identity', 'campus-info-packet-destination-campus', 'campus-info-packet-present', 'hubspot-event-required-facts'])
})

test('check bundle: workstream 2 corrections are rows, not prose', () => {
  // Header overlap: template scope, mobile and desktop separate, thresholds stated, mobile decision pending on the Atlanta lead.
  const desktop = checkRow('site.layout.header-overlap.desktop')
  const mobile = checkRow('site.layout.header-overlap.mobile')
  for (const row of [desktop, mobile]) {
    assert.equal(row.observerCheck, 'campus-layout-header-overlap')
    assert.equal(row.dedupeScope, 'template')
    assert.equal(row.ticketClass, 'observer-layout')
    assert.equal(row.ownerRole, 'elementor-owner')
    assert.deepEqual([row.comparator.threshold, row.comparator.unit, row.comparator.orThreshold, row.comparator.detectAbove], [48, 'px', 0.25, 0.08])
  }
  assert.deepEqual(desktop.viewports, ['desktop'])
  assert.deepEqual(mobile.viewports, ['mobile'])
  assert.equal(mobile.decisionPending, 'cmtnl00rs000404l1ihl5ucij')
  assert.match(mobile.comparator.note, /12\.5 to 16\.4 px/)

  // Community host: canonical www host, apex redirect, URL form left as a decision flag.
  const routing = JSON.parse(fs.readFileSync(path.join(root, 'spec', 'community-routing.json'), 'utf8'))
  assert.equal(routing.communityHosts.canonical, 'www.community.alpha.school')
  assert.deepEqual(routing.communityHosts.redirects, ['community.alpha.school'])
  assert.equal(routing.urlContract.urlForm.decided, false)
  assert.equal(routing.urlContract.urlForm.decisionTicket, 'cmu4g45fg00020agm20nd7kc8')
  assert.equal(checkRow('site.community.routing.host').decisionPending, 'cmu4g45fg00020agm20nd7kc8')
  assert.equal(checkRow('site.community.routing.pre-announcement-url').decisionPending, 'cmu4g45fg00020agm20nd7kc8')
  assert.ok(checkBundle.retired.some((r) => r.observerCheck === 'community-campus-parameter' && r.replacedBy === 'site.community.routing.pre-announcement-url'))

  // Grades: start and end grade only; grade_levels never.
  const grades = checkRow('campus.facts.grades')
  assert.deepEqual(grades.expected.derive.field, ['start_grade_level', 'end_grade_level'])
  assert.ok(grades.expected.derive.neverFields.includes('grade_levels'))
  assert.match(grades.expected.derive.neverFieldsReason, /HubSpot no longer defines/)

  // Brand leak reads the exceptions registry, which now also carries the word list.
  const leak = checkRow('site.identity.sister-brand')
  assert.deepEqual(leak.exemptionsRef, ['registry/sister-brand-exceptions.json', 'registry/campus-leadership.json groups'], 'the brand-leak row also reads the shared-leadership groups (2026-09-24)')
  const exceptions = JSON.parse(fs.readFileSync(path.join(root, 'registry', 'sister-brand-exceptions.json'), 'utf8'))
  assert.ok(exceptions.brands.some((b) => b.label === 'Nova') && exceptions.campuses.brownsville)

  // Events: four-hour grace after public, past events never file.
  for (const id of ['site.events.sync.public', 'campus.events.strip.filter']) {
    const row = checkRow(id)
    assert.equal(row.gracePeriodHours, 4)
    assert.ok(row.suppressWhen.includes('event-ended'))
  }
  for (const row of checkBundle.rows.filter((r) => r.observerCheck.startsWith('event-'))) assert.ok(row.suppressWhen?.includes('event-ended'), `${row.id} must never file a past event`)
  assert.equal(checkRow('site.events.sync.public').dedupeScope, 'event')

  // Packets: hidden 2026-27 button is the approved interim state.
  const packets = JSON.parse(fs.readFileSync(path.join(root, 'registry', 'campus-packets.json'), 'utf8'))
  assert.equal(packets.interimPolicy.hidden2026_27Button, 'approved-interim')
  const packet = checkRow('campus.resources.packet.present')
  assert.equal(packet.decisionPending, 'cmtlz33vo000504ju2itpi7d9')
  assert.ok(packet.exemptions.some((x) => x.startsWith('hidden-2026-27-packet-button')))

  // Operations sheet: 168 h snapshot is loop health; the observer packet artifact is the sweep read path.
  const snapshot = checkRow('site.loop.health.operations-snapshot')
  assert.equal(snapshot.channel, 'loop-health')
  assert.deepEqual([snapshot.comparator.type, snapshot.comparator.threshold, snapshot.comparator.unit], ['age-max', 168, 'hours'])
  assert.equal(snapshot.decisionPending, 'cmtnxta3p000104l2mg9p9kvf')
  const sources = JSON.parse(fs.readFileSync(path.join(root, 'registry', 'sources.json'), 'utf8'))
  assert.equal(sources.operationsSheet.observerPacketArtifact.command, 'gh run download -R superbuilders/aeo -n alpha-site-packet-<run>')
  assert.equal(checkRow('site.map.integrity.operations-row').decisionPending, 'cmtyu32gf00000agm0vltkx4s')
  assert.deepEqual(checkRow('site.map.integrity.operations-row').lifecycleStates, ['Open', 'Announced'])

  // Images: every image failing in one run is loop health, and the ticket row is suppressed by it.
  assert.equal(checkRow('site.loop.health.images-all-failed').channel, 'loop-health')
  assert.ok(checkRow('site.layout.images.render').suppressWhen.includes('every-image-failed-in-run'))

  // Timeouts: rendered 2xx needs two consecutive runs.
  const route = checkRow('site.header.rendered.route-reachable')
  assert.equal(route.expected.literal, 'rendered HTTP 2xx page')
  assert.equal(route.requireConsecutiveRuns, 2)
  assert.equal(route.clearAfterRuns, 2)
  assert.equal(checkRow('campus.page.reachable.program-page').requireConsecutiveRuns, 2)

  // Health lead: loop health never enters the website queue.
  for (const row of checkBundle.rows.filter((r) => r.channel === 'loop-health')) {
    assert.equal(row.ticketClass, 'observer-health')
    assert.equal(row.ownerRole, 'observer-owner')
    assert.ok(row.suppresses)
  }
  assert.equal(checkRow('site.loop.health.provider').decisionPending, 'cmtneqjw4000404jslko6zim1')
})
