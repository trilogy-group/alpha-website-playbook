#!/usr/bin/env node
/**
 * Scheduled APEX website intake administrator. It evaluates every new or changed website-family
 * ticket against the compiled playbook policy, requests only requester-owned missing inputs,
 * re-evaluates requester revisions, and routes the ticket to one exact owner or an explicit
 * unresolved-owner queue. It never edits WordPress, HubSpot, n8n, or any other delivery system.
 *
 *   node agent/intake.mjs --since 2026-09-17T00:00:00Z [--apply] [--report out.json] [--ticket id,id] [--page https://alpha.school/<slug>/]
 *   node agent/intake.mjs --file tickets.json --replay --report replay.json
 *
 * --ticket never drops an id silently: the summary's requestedTickets.dropped names every requested id that was not
 * administered and why (not in the queue, status outside --status, outside the family, --page, --since, --limit).
 * Protocol 1d runs here: an owner role with no registered person is Blocked on the website agent operator with a
 * note naming the role, the system, and the change. Protocol 1c: a ticket carrying an OPERATOR INSTRUCTION or
 * CORRECTION note is reported and never re-routed, re-blocked, or re-assigned. A ticket the observer filer created
 * (agent/intake-policy.mjs observerFilerOwned: customFields.filedBy is agent/file-observer-findings.mjs or filerRunId is
 * set) is never administered at any status, NOT_STARTED included: no clarification request, no owner re-route, no
 * reconcile, reported as observer_filer_owned (summary.observerFilerOwned). The same skip answers APEX PR 409's 409
 * OBSERVER_FILER_OWNED on reconcile when APEX decides it first: no error, no retry, no v1 fallback.
 *
 * Requester notices (decision 2026-09-23): for a Missing Info or blocked decision the report carries the Slack DM
 * preview from agent/notify-requester.mjs (dry run); the DM goes only with --apply --notify-send after the
 * APEX action succeeded, and then as spec/requester-notices.json says: to the reviewer first (reviewMode "all",
 * or a flagged message in "flagged" mode; the report says mode "review") or straight to the requester (mode
 * "sent"); --no-notify skips the preview.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  administrativeAction,
  applyDuplicateCandidates,
  assigneePatch,
  intakeCustomFieldsPatch,
  clarificationNote,
  clarificationRequirements,
  escalationNote,
  evaluateTicket,
  executionRevision,
  pendingClarificationReviews,
  normalizePersonName,
  observerFilerOwned,
  operatorInstruction,
  requesterNoticeItems,
  resolveDecisionOwner,
  ticketInputSha256,
} from './intake-policy.mjs'
import { NotifyRequesterError, runNotice } from './notify-requester.mjs'
import { isFilerOwnedConflict } from './apex-errors.mjs'
import { RequesterNoticeError } from './requester-notice-policy.mjs'
import { renderTemplate } from './ticket-templates.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.join(here, '..')
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const bundle = read('spec/policy-bundle.generated.json')
const args = parse(process.argv.slice(2))
const VERSION = '0.2'
const OBSERVER_FILER_OWNED = 'observer_filer_owned' // skip reason for tickets the observer filer created (intake-policy observerFilerOwned; APEX PR 409)
const isFilerOwnedResult = (result) => Boolean(result.observerFilerOwned) || result.applied?.skipped === OBSERVER_FILER_OWNED
const configuredApexBase = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
const v1Base = /\/api\/v1$/.test(configuredApexBase) ? configuredApexBase : `${configuredApexBase}/api/v1`
const agentBase = (process.env.APEX_AGENT_API_BASE || new URL('/api/agent', `${v1Base}/`).toString()).replace(/\/+$/, '')
const token = process.env.APEX_API_TOKEN
const statuses = String(args.status || 'NOT_STARTED,MISSING_INFO,BLOCKED,IN_PROGRESS').split(',').filter(Boolean)
// --ticket id[,id...] restricts administration to those tickets (sweep partitions must not administer each other's
// tickets, 2026-09-21); --page <canonical url> restricts to tickets whose derived or declared page matches.
// A requested id is never dropped silently: every id that is not administered is named in the summary with the
// reason (2026-09-24, partition E2 lost four NOT_STARTED ids to the family filter with no line in the log).
const onlyTickets = new Set(String(args.ticket || '').split(',').map((v) => v.trim()).filter(Boolean))
const requestedDrops = new Map()
const dropRequested = (id, reason) => { if (onlyTickets.has(id) && !requestedDrops.has(id)) requestedDrops.set(id, reason) }
const onlyPage = args.page ? String(args.page).replace(/\/+$/, '').toLowerCase() : null
const duplicateStatuses = [...new Set([...statuses, 'FOR_REVIEW', 'TESTING', 'APPROVED'])]
let executionReleaseCheck = null
const agentOperatorIds = new Set(['website-agent-operator', 'website-operations']
  .flatMap((role) => bundle.roleOwners[role] || [])
  .map((person) => person.apexUserId)
  .filter(Boolean))

if (args.apply) {
  if (!token) fail('APEX_API_TOKEN required for --apply')
  const check = spawnSync(process.execPath, [path.join(root, 'tests', 'build-policy.mjs'), '--check'], { cwd: root, encoding: 'utf8' })
  if (check.status !== 0) fail(`compiled policy is stale; refusing --apply\n${check.stdout || ''}${check.stderr || ''}`)
}

let tickets = []
if (args.file) {
  const raw = JSON.parse(fs.readFileSync(args.file, 'utf8'))
  tickets = Array.isArray(raw) ? raw : raw.tasks || raw.data || []
} else {
  if (!token) fail('APEX_API_TOKEN required')
  tickets = await listTickets(duplicateStatuses)
}

if (onlyTickets.size) {
  const listed = new Set(tickets.map((t) => t.id))
  for (const id of onlyTickets) {
    if (listed.has(id)) continue
    if (args.file || !token) { dropRequested(id, `not in the ${args.file ? '--file input' : 'queue listing'}`); continue }
    // Read the ticket itself so the reason is its real state, not a guess; a queue-status ticket the paged listing
    // missed is administered from that read.
    try {
      const ticket = await agent(`/tasks/${id}`)
      if (duplicateStatuses.includes(ticket.status)) tickets.push(ticket)
      else dropRequested(id, `status ${ticket.status} is outside the queue statuses (${duplicateStatuses.join(', ')})`)
    } catch (error) {
      dropRequested(id, error.status === 404 ? 'not found in APEX' : `APEX read failed: ${error.message}`)
    }
  }
  tickets = tickets.filter((t) => onlyTickets.has(t.id))
}
if (onlyPage) {
  tickets = tickets.filter((t) => {
    const keep = [t.url, (t.customFields || {}).pageUrl, (t.customFields || {}).targetPageUrl].some((u) => typeof u === 'string' && u.replace(/\/+$/, '').toLowerCase() === onlyPage)
    if (!keep) dropRequested(t.id, `page is not --page ${onlyPage}`)
    return keep
  })
}

const since = args.since ? new Date(args.since) : null
if (since && Number.isNaN(since.getTime())) fail(`invalid --since value: ${args.since}`)
const limit = Number(args.limit || 500)
const eligible = tickets.filter((ticket) => {
  if (!isWebsiteFamily(ticket)) { dropRequested(ticket.id, 'outside the website family filter (no website request family, request type, source, observer check id, or title shape)'); return false }
  if (!statuses.includes(ticket.status)) { dropRequested(ticket.id, `status ${ticket.status} is outside --status (${statuses.join(', ')})`); return false }
  if (since && new Date(ticket.updatedAt || ticket.createdAt) < since) { dropRequested(ticket.id, `updated ${ticket.updatedAt || ticket.createdAt} is before --since ${args.since}`); return false }
  return true
})
for (const ticket of eligible.slice(limit)) dropRequested(ticket.id, `beyond --limit ${limit}`)
const candidates = eligible.slice(0, limit)
for (const [id, reason] of requestedDrops) console.error(`--ticket ${id}: not administered: ${reason}`)

const hydrationErrors = new Map()
let hydrated = candidates
if (token && !args.replay) {
  const concurrency = Math.max(1, Math.min(20, Number(args['hydration-concurrency'] || 8)))
  hydrated = await mapLimit(candidates, concurrency, async (ticket) => {
    try { return await agent(`/tasks/${ticket.id}`) }
    catch (error) {
      hydrationErrors.set(ticket.id, error.message)
      return ticket
    }
  })
}

const usersByEmail = new Map()
const usersByExactName = new Map()
if (token && !args.replay) {
  try {
    const response = await v1('/users?limit=500')
    for (const user of response.users || response.data || (Array.isArray(response) ? response : [])) {
      if (user.email && user.id) usersByEmail.set(String(user.email).toLowerCase(), user)
      if (!user.name || !user.email) continue
      const key = normalizePersonName(user.name)
      usersByExactName.set(key, usersByExactName.has(key) ? null : user)
    }
  } catch (error) {
    console.error(`APEX users lookup failed: ${error.message}`)
  }
}
const evaluationContext = { usersByExactName }

let decisions = hydrated.map((ticket) => {
  try { return evaluateTicket(bundle, ticket, evaluationContext) }
  catch (error) {
    return {
      id: ticket.id,
      title: String(ticket.title || '').slice(0, 120),
      currentStatus: ticket.status || null,
      outcome: 'evaluation-error',
      class: null,
      ownerRole: 'internal-triage',
      error: error.message,
    }
  }
})
const candidateIds = new Set(candidates.map((ticket) => ticket.id))
const duplicateReferences = args.file ? [] : tickets
  .filter(isWebsiteFamily)
  .filter((ticket) => !candidateIds.has(ticket.id))
  .flatMap((ticket) => {
    try { return [evaluateTicket(bundle, ticket, evaluationContext)] } catch { return [] }
  })
decisions = applyDuplicateCandidates([...decisions, ...duplicateReferences]).filter((result) => candidateIds.has(result.id))

const byId = new Map(hydrated.map((ticket) => [ticket.id, ticket]))
for (const result of decisions) {
  const ticket = byId.get(result.id)
  if (!ticket || result.error) continue
  // A ticket the observer filer created is the filer's at every status, NOT_STARTED included: the evaluation is still
  // reported, but intake plans nothing for it (no clarification request, no owner route, no reconcile, no requester
  // notice) in dry run and apply alike. Decided client-side, before any read of the live ticket.
  if (observerFilerOwned(ticket)) {
    const fields = ticket.customFields || {}
    result.observerFilerOwned = { filedBy: fields.filedBy || null, filerRunId: fields.filerRunId || null, status: ticket.status || null }
    result.action = { kind: 'no-action', api: null, assign: null, reason: OBSERVER_FILER_OWNED }
    result.skipped = `${OBSERVER_FILER_OWNED}: the observer filer created this ticket (filedBy ${fields.filedBy || 'unset'}, filerRunId ${fields.filerRunId || 'unset'}, status ${ticket.status || 'unknown'}); it opens, holds and closes with its check, intake never administers it`
    continue
  }
  if (hydrationErrors.has(result.id)) {
    result.hydrationWarning = hydrationErrors.get(result.id)
    if (args.apply) {
      result.error = `Hydration failed; refusing to administer this ticket from a partial list response: ${result.hydrationWarning}`
      continue
    }
  }
  resolveDecisionOwner(bundle, result, ticket, usersByEmail)
  result.action = administrativeAction(result)
  if (result.action.kind === 'no-action') {
    result.skipped = 'outside the Alpha public WordPress v1 scope; no APEX mutation planned'
    continue
  }
  // Protocol 1c: an OPERATOR INSTRUCTION or CORRECTION note outranks the policy bundle; intake reports and never
  // re-routes, re-blocks, or re-assigns such a ticket.
  const instruction = operatorInstruction(ticket)
  if (instruction) {
    result.operatorInstruction = instruction
    result.action = { kind: 'no-action', api: null, assign: null, reason: instruction.kind }
    result.skipped = `carries an ${instruction.kind === 'correction' ? 'CORRECTION' : 'OPERATOR INSTRUCTION'} note ("${instruction.heading}"); intake never re-routes, re-blocks, or re-assigns it (protocol 1c)`
    continue
  }
  const previousHash = ticket.customFields?.intakeHash
  if (previousHash === result.decisionSha256 && !args.force) {
    result.skipped = 'same ticket input revision and policy decision'
    continue
  }
  // Requester notice (decision 2026-09-23): Missing Info and blocked routes tell the requester by Slack DM.
  // Preview (dry run) on every run; the DM goes only with --apply --notify-send, after the APEX action succeeded.
  const notifies = !args['no-notify'] && ['request-clarification', 'blocked-review'].includes(result.action.kind)
  if (notifies && !args.apply) result.requesterNotice = await requesterNotice(ticket, result, false)
  if (!args.apply) continue
  try { result.applied = await applyDecision(ticket, result) }
  catch (error) { result.applied = { ok: false, error: error.message, status: error.status || null, code: error.code || null } }
  if (result.applied?.skipped === OBSERVER_FILER_OWNED) {
    result.skipped = `${OBSERVER_FILER_OWNED}: the observer filer owns this ticket (${result.applied.apexCode ? `APEX answered ${result.applied.apexCode}` : `filer markers on the live ticket, status ${result.applied.status}`}); it closes when the check clears, intake leaves it alone`
    continue
  }
  if (notifies) result.requesterNotice = await requesterNotice(ticket, result, Boolean(args['notify-send'] && result.applied?.ok))
}

const summary = summarize(decisions)
const report = {
  version: VERSION,
  policySha256: bundle.policySha256,
  ranAt: new Date().toISOString(),
  mode: args.apply ? 'apply' : (args.replay ? 'replay' : 'dry-run'),
  since: args.since || null,
  summary,
  results: decisions,
}
if (args.report) fs.writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 2))

async function applyDecision(ticket, result) {
  const preflight = await agent(`/tasks/${ticket.id}`)
  if (ticketInputSha256(preflight) !== result.inputSha256) {
    throw new Error('Ticket received new requester or human input before administration; evaluate the fresh revision instead')
  }
  // The live ticket gained the filer's markers since it was listed (or the list response lacked them): the filer closes
  // it when its check clears. Skip before any write; when APEX decides it first (409 OBSERVER_FILER_OWNED on reconcile,
  // PR 409) the answer is the same skip: no error, no retry, no v1 fallback.
  if (observerFilerOwned(preflight)) return { ok: false, skipped: OBSERVER_FILER_OWNED, api: null, status: preflight.status, filerRunId: preflight.customFields?.filerRunId || null }
  if (result.action.kind === 'execution-ready') assertExecutionRelease()
  // Render and validate the complete status request before any write or claim. A local
  // template failure must never reserve the website or leave partial intake state.
  const informationRequest = result.action.kind === 'request-clarification'
    ? { note: clarificationNote(bundle, result), requirements: clarificationRequirements(bundle, result) }
    : result.action.kind === 'registry-missing-info'
      ? { note: registryMissingNote(bundle, result) }
      : null
  const pendingCustomFields = intakeCustomFieldsPatch(preflight.customFields, {
    ownerRole: result.ownerRole,
    intakePendingHash: result.decisionSha256,
    intakeVersion: VERSION,
    intakeDecision: {
      policySha256: bundle.policySha256,
      inputSha256: result.inputSha256,
      outcome: result.outcome,
      class: result.class,
      policy: result.policy,
      ownerRole: result.ownerRole,
      ownerResolution: result.ownerResolution,
      requesterMissing: result.requesterMissing || [],
      derivableMissing: result.derivableMissing || [],
      systemMissing: result.systemMissing || [],
      invalid: result.invalid || [],
      resolvedFields: result.found || {},
      relatedTicketIds: result.relatedTicketIds || [],
      evaluatedAt: new Date().toISOString(),
    },
  })
  // The ticket's own URL field is the reviewer's "go here" link in the APEX panel (decision 2026-09-22):
  // write the derived page once when the requester left it empty; never overwrite a URL a person set.
  const reviewUrl = !preflight.url && /^https:\/\//.test(result.found?.pageUrl || '') ? { url: result.found.pageUrl } : {}
  await v1(`/tasks/${ticket.id}`, 'PATCH', {
    customFields: pendingCustomFields,
    ...assigneePatch(preflight.assignees, result.ownerUser?.id),
    ...reviewUrl,
    agentStatus: 'BLOCKED',
    agentEligible: false,
  })

  let actionResult
  if (informationRequest) {
    const runId = `website-intake-${ticket.id}-${result.decisionSha256.slice(0, 12)}`
    await agent(`/tasks/${ticket.id}/claim`, 'POST', { agentRunId: runId })
    let response
    try {
      response = await agent(`/tasks/${ticket.id}/status`, 'POST', {
        status: 'MISSING_INFO', agentStatus: 'MISSING_INFO', agentRunId: runId, ...informationRequest,
      })
    } catch (error) {
      // Only clean up after our claim succeeded. APEX atomically checks this exact
      // run and actor; never force or release an unrelated/changed claim.
      try {
        const released = await agent(`/tasks/${ticket.id}/release`, 'POST', { agentRunId: runId })
        if (released.released !== true) throw new Error('APEX did not confirm release')
      } catch (cleanupError) {
        error.message += `; claim cleanup failed for ${runId}: ${cleanupError.message}`
      }
      throw error
    }
    actionResult = { api: 'agent-status', status: response.status,
      ...(result.action.kind === 'registry-missing-info'
        ? { registryOwner: result.owner || null }
        : { clarificationDelivery: response.clarificationDelivery?.status || null }) }
  } else if (result.action.kind === 'execution-ready') {
    const current = await agent(`/tasks/${ticket.id}`)
    const pending = pendingClarificationReviews(current)
    const hasRequesterResponses = (current.clarifications || []).some((item) => item.respondedAt || item.responseData)
    if (pending.length && hasRequesterResponses) {
      throw new Error('Pending clarification coexists with an earlier requester response; internal review is required before reopening')
    }
    const response = await reconcile(ticket, {
      disposition: 'still_actionable',
      note: `Intake ${VERSION}: complete for class ${result.class}; routed to ${result.ownerRole}. No website change was made by intake.`,
      expectedUpdatedAt: current.updatedAt,
      expectedRevision: executionRevision(current),
      ...(pending.length ? { requireNoPendingRequesterScope: true, retireUnansweredClarifications: pending } : {}),
      agentRunId: `website-intake-${ticket.id}-${result.decisionSha256.slice(0, 12)}`,
    })
    if (response.observerFilerOwned) return { ok: false, skipped: OBSERVER_FILER_OWNED, api: 'agent-reconcile', status: current.status, apexCode: 'OBSERVER_FILER_OWNED' }
    actionResult = { api: 'agent-reconcile', status: response.task?.status, agentStatus: response.task?.agentStatus, retiredClarifications: pending.length }
  } else if (result.action.kind === 'owner-route') {
    if (result.ownerUser?.id && !agentOperatorIds.has(result.ownerUser.id)) {
      const response = await v1(`/tasks/${ticket.id}`, 'PATCH', { status: 'NOT_STARTED', agentStatus: null, agentEligible: false })
      actionResult = { api: 'v1-owner-route', status: response.status, agentStatus: response.agentStatus, owner: result.owner || null }
    } else {
      actionResult = {
        api: 'v1-owner-route-safe-hold',
        status: preflight.status,
        agentStatus: 'BLOCKED',
        owner: result.owner || null,
        note: result.ownerUser?.id
          ? 'The named human is also an APEX agent operator; agent eligibility remains disabled to prevent unintended execution.'
          : 'No exact APEX user is registered for this role; existing assignment is preserved and agent eligibility remains disabled.',
      }
    }
  } else {
    const current = await agent(`/tasks/${ticket.id}`)
    const pending = pendingClarificationReviews(current)
    const hasRequesterResponses = (current.clarifications || []).some((item) => item.respondedAt || item.responseData)
    if (pending.length && hasRequesterResponses) throw new Error('Cannot safely retire pending clarification after a prior requester response')
    const disposition = pending.length ? 'blocked_internal' : 'blocked'
    // Protocol 1d: an unowned role's note is the `blocked` template (DECISION NEEDED, role, system, change; agent/intake-policy.mjs
    // escalationNote) so a human can name the owner in one step; every other block carries the decision's reason.
    if (result.escalation) result.escalation.note = escalationNote(bundle, result, ticket, { actor: `intake ${VERSION}` })
    const note = result.escalation?.note || result.reason || `Intake ${VERSION}: ${result.outcome}; owner role ${result.ownerRole}.`
    const response = await reconcile(ticket, {
      disposition,
      note,
      expectedUpdatedAt: current.updatedAt,
      expectedRevision: executionRevision(current),
      ...(pending.length ? { requireNoPendingRequesterScope: true, retireUnansweredClarifications: pending } : {}),
      agentRunId: `website-intake-${ticket.id}-${result.decisionSha256.slice(0, 12)}`,
    })
    if (response.observerFilerOwned) return { ok: false, skipped: OBSERVER_FILER_OWNED, api: 'agent-reconcile', status: current.status, apexCode: 'OBSERVER_FILER_OWNED' }
    if (pending.length) {
      // A PATCH whose only keys are agentEligible:false is APEX's "revoke hosted Alpha MCP authorization" shape
      // (src/app/api/v1/tasks/[id]/route.ts isAlphaMcpRevocationOnly); carry agentStatus so it is a plain field write.
      await v1(`/tasks/${ticket.id}`, 'PATCH', { agentEligible: false, agentStatus: response.task?.agentStatus ?? 'BLOCKED' })
    }
    actionResult = { api: 'agent-reconcile', disposition, status: response.task?.status, agentStatus: response.task?.agentStatus, retiredClarifications: pending.length }
  }

  const finalized = await agent(`/tasks/${ticket.id}`)
  const { intakePendingHash, ...currentCustomFields } = finalized.customFields || {}
  if (intakePendingHash !== result.decisionSha256) {
    throw new Error('Ticket input or intake state changed during administration; leaving the decision pending for a fresh evaluation')
  }
  // The URL intake wrote for the reviewer is intake's own, not requester input: compare against the value the
  // requester left (2026-09-22; L1 found finalization failing on every ticket whose requester left it empty).
  const finalizedInput = reviewUrl.url && finalized.url === reviewUrl.url ? { ...finalized, url: preflight.url } : finalized
  if (ticketInputSha256(finalizedInput) !== result.inputSha256) {
    throw new Error('Ticket received new requester or human input during administration; leaving the decision pending for a fresh evaluation')
  }
  await v1(`/tasks/${ticket.id}`, 'PATCH', {
    customFields: intakeCustomFieldsPatch(currentCustomFields, {
      intakeHash: result.decisionSha256,
      intakeVersion: VERSION,
    }),
  })
  return { ok: true, ...actionResult, finalized: true }
}

/** POST reconcile; a 409 OBSERVER_FILER_OWNED (agent/apex-errors.mjs isFilerOwnedConflict, shared with the filer) comes back as { observerFilerOwned: true } instead of throwing. */
async function reconcile(ticket, body) {
  try { return await agent(`/tasks/${ticket.id}/reconcile`, 'POST', body) }
  catch (error) {
    if (isFilerOwnedConflict(error)) return { observerFilerOwned: true }
    throw error
  }
}

/**
 * Compose (and with send, post) the requester notice for a missing-info or blocked decision. The preview goes
 * in the report so Matt reviews the wording before the first sends. Intake's own reasons are internal
 * wording; when the policy module refuses them (jargon, no person named) the report says so and the sweep
 * agent writes the requester-facing text by hand with agent/notify-requester.mjs.
 */
async function requesterNotice(ticket, result, send) {
  const lines = []
  const io = { log: (line) => lines.push(String(line)), error: (line) => lines.push(String(line)) }
  const options = result.action.kind === 'request-clarification'
    ? { ticket, kind: 'missing-info', items: requesterNoticeItems(bundle, result), send }
    : { ticket, kind: 'blocked', blocker: requesterBlocker(result), owner: result.owner || null, roleOwners: bundle.roleOwners, send }
  try {
    const notice = await runNotice(options, { io })
    const mode = notice.route === 'review' ? 'review' : notice.route === 'send' ? 'sent' : 'preview'
    return { mode, route: notice.route, gate: notice.gate, kind: notice.kind, decision: notice.decision.reason, recipient: notice.recipient, recipientNote: notice.recipientNote, words: notice.words, refused: notice.refused, message: notice.message, sent: notice.sent, review: notice.review, ledgerEntry: notice.ledgerEntry, output: lines }
  } catch (error) {
    if (!(error instanceof RequesterNoticeError) && !(error instanceof NotifyRequesterError)) throw error
    return { mode: send ? 'sent' : 'preview', error: error.code, message: error.message, output: lines }
  }
}

/** The Missing Info note for a missing registry expectation: template missingInfo, one item per registry field with the owner named. */
function registryMissingNote(bundle, result) {
  const items = (result.registryMissing || []).map((field) => ({ item: `${bundle.fields?.[field]?.missingText || field}: ${bundle.intakeFieldSources?.[field]?.missingRegistryReason || 'record it in the registry'}`, owner: result.owner || result.ownerRole }))
  return renderTemplate('missingInfo', { actor: `intake ${VERSION}`, date: new Date().toISOString().slice(0, 10), items, alreadyCorrect: Object.keys(result.found || {}).length ? `${Object.keys(result.found).join(', ')} resolved by intake` : 'nothing checked yet' })
}

/** What the requester is told the ticket waits on, per intake outcome, in their words; intake's own reason is internal. */
function requesterBlocker(result) {
  const plain = {
    'missing-registry': `${result.owner || 'the website team'} recording the approved asset for this campus`,
    'policy-review': 'an internal review of this request before any page change',
    'policy-denied': 'an internal decision on this request, which the website team cannot make on its own',
    'owner-unresolved': 'the website team naming the person who owns this change',
    'needs-rule': 'the website team deciding how requests like this one are handled',
    'needs-derivation': 'the website team working out which page and values this applies to',
    'intake-defect': 'the website team repairing how this request was recorded',
    'duplicate-candidate': 'the website team checking this against another open request for the same change',
  }
  return plain[result.outcome] || result.reason || null
}

function assertExecutionRelease() {
  if (args['skip-release-check']) return
  if (!executionReleaseCheck) {
    executionReleaseCheck = spawnSync(process.execPath, [path.join(root, 'tests', 'check-release.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
    })
  }
  if (executionReleaseCheck.status !== 0) {
    throw new Error(`Alpha MCP release attestation failed; refusing to release this ticket to scheduled execution\n${executionReleaseCheck.stdout || ''}${executionReleaseCheck.stderr || ''}`)
  }
}

/**
 * The website family (bundle.familyFilter): the APEX website request family, the "Website" title prefix, the Website
 * and Website QC request types, a ticket filed by the observer or an agent (customFields.source), an observer check id,
 * or the observer's title shape. The ticket URL is not a family test: an observer finding's URL is its surface (a
 * HubSpot event record, the observer workflow, events.alpha.school, the Operations sheet, a sister site) and the page,
 * when there is one, is derived by the policy (customFields.pageUrl, the program's registry page, the ticket URL, the
 * title). Before 2026-09-24 an alpha-site-qc ticket was in the family only with an alpha.school URL, and the sweep
 * hand-administered 40 of its 180 observer tickets.
 */
function isWebsiteFamily(ticket) {
  const fields = ticket.customFields || {}
  const filter = bundle.familyFilter
  const requestType = String(ticket.requestType || '').trim().toLowerCase()
  return fields.requestFamily === filter.requestFamily
    || filter.titlePrefixes.some((prefix) => String(ticket.title || '').startsWith(prefix))
    || (filter.requestTypes || []).some((type) => String(type).toLowerCase() === requestType)
    || filter.sources.includes(fields.source)
    || (Boolean(filter.observerCheckIdPattern) && new RegExp(filter.observerCheckIdPattern).test(String(fields.checkId || '')))
    || new RegExp(filter.observerTitlePattern).test(ticket.title || '')
}

async function listTickets(wantedStatuses) {
  const all = []
  for (const status of wantedStatuses) {
    for (let page = 1; page <= 20; page++) {
      const response = await v1(`/tasks?status=${encodeURIComponent(status)}&page=${page}&pageSize=100`)
      const items = response.items || response.tasks || response.data || []
      all.push(...items)
      if (items.length < 100) break
    }
  }
  return [...new Map(all.map((ticket) => [ticket.id, ticket])).values()]
}

async function mapLimit(items, limit, operation) {
  const results = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await operation(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function v1(route, method = 'GET', body) {
  const data = await request(v1Base, route, method, body)
  return data.task || data
}
async function agent(route, method = 'GET', body) { return request(agentBase, route, method, body) }
async function request(base, route, method, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text.slice(0, 500) } }
  if (!response.ok) {
    const error = new Error(`APEX ${method} ${route} ${response.status}: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error || data).slice(0, 500)}`)
    error.status = response.status
    error.code = data.code || data.error?.code || null
    error.body = data
    throw error
  }
  return data
}

function summarize(results) {
  const countBy = (key) => results.reduce((counts, result) => {
    const value = result[key] || 'none'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
  const countItems = (items) => items.reduce((counts, item) => {
    counts[item] = (counts[item] || 0) + 1
    return counts
  }, {})
  return {
    tickets: results.length,
    ...(onlyTickets.size ? {
      requestedTickets: {
        requested: onlyTickets.size,
        administered: results.length,
        dropped: [...requestedDrops].map(([id, reason]) => ({ id, reason })),
      },
    } : {}),
    outcomes: countBy('outcome'),
    actions: results.reduce((counts, result) => {
      const kind = result.action?.kind || 'none'
      counts[kind] = (counts[kind] || 0) + 1
      return counts
    }, {}),
    classes: countBy('class'),
    ownerRoles: countBy('ownerRole'),
    ownerResolution: countBy('ownerResolution'),
    requesterMissingFields: countItems(results.flatMap((result) => result.requesterMissing || [])),
    derivableFieldsResolved: countItems(results.flatMap((result) => Object.keys(result.found || {})
      .filter((field) => bundle.intakeFieldSources?.[field]?.kind === 'derivable'))),
    skipped: results.filter((result) => result.skipped).length,
    operatorInstructions: results.filter((result) => result.operatorInstruction).map((result) => result.id),
    observerFilerOwned: results.filter(isFilerOwnedResult).map((result) => result.id),
    escalated: results.filter((result) => result.escalation?.assignedTo && !result.skipped).length,
    applied: results.filter((result) => result.applied?.ok).length,
    requesterNotices: {
      previews: results.filter((result) => result.requesterNotice?.mode === 'preview' && result.requesterNotice.message && !result.requesterNotice.error).length,
      sent: results.filter((result) => result.requesterNotice?.sent).length,
      reviewRequested: results.filter((result) => result.requesterNotice?.mode === 'review' && result.requesterNotice.review && !result.requesterNotice.review.duplicate).length,
      unreachable: results.filter((result) => result.requesterNotice?.recipientNote && !result.requesterNotice.error).length,
      refused: results.filter((result) => result.requesterNotice?.error).map((result) => ({ id: result.id, error: result.requesterNotice.error, message: result.requesterNotice.message })),
    },
    errors: results.filter((result) => result.error || result.applied?.error).map((result) => ({ id: result.id, error: result.error || result.applied.error })),
  }
}

function parse(argv) {
  const output = {}
  for (let index = 0; index < argv.length; index++) {
    if (!argv[index].startsWith('--')) continue
    const key = argv[index].slice(2)
    const next = argv[index + 1]
    output[key] = next === undefined || next.startsWith('--') ? true : (index++, next)
  }
  return output
}

function fail(message) { console.error(message); process.exit(2) }
