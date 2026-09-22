#!/usr/bin/env node
/**
 * Scheduled APEX website intake administrator. It evaluates every new or changed website-family
 * ticket against the compiled playbook policy, requests only requester-owned missing inputs,
 * re-evaluates requester revisions, and routes the ticket to one exact owner or an explicit
 * unresolved-owner queue. It never edits WordPress, HubSpot, n8n, or any other delivery system.
 *
 *   node agent/intake.mjs --since 2026-09-17T00:00:00Z [--apply] [--report out.json] [--ticket id,id] [--page https://alpha.school/<slug>/]
 *   node agent/intake.mjs --file tickets.json --replay --report replay.json
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
  evaluateTicket,
  executionRevision,
  pendingClarificationReviews,
  normalizePersonName,
  resolveDecisionOwner,
  ticketInputSha256,
} from './intake-policy.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.join(here, '..')
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const bundle = read('spec/policy-bundle.generated.json')
const args = parse(process.argv.slice(2))
const VERSION = '0.2'
const configuredApexBase = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
const v1Base = /\/api\/v1$/.test(configuredApexBase) ? configuredApexBase : `${configuredApexBase}/api/v1`
const agentBase = (process.env.APEX_AGENT_API_BASE || new URL('/api/agent', `${v1Base}/`).toString()).replace(/\/+$/, '')
const token = process.env.APEX_API_TOKEN
const statuses = String(args.status || 'NOT_STARTED,MISSING_INFO,BLOCKED,IN_PROGRESS').split(',').filter(Boolean)
// --ticket id[,id...] restricts administration to those tickets (sweep partitions must not administer each other's
// tickets, 2026-09-21); --page <canonical url> restricts to tickets whose derived or declared page matches.
const onlyTickets = new Set(String(args.ticket || '').split(',').map((v) => v.trim()).filter(Boolean))
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

if (onlyTickets.size) tickets = tickets.filter((t) => onlyTickets.has(t.id))
if (onlyPage) tickets = tickets.filter((t) => [t.url, (t.customFields || {}).pageUrl, (t.customFields || {}).targetPageUrl].some((u) => typeof u === 'string' && u.replace(/\/+$/, '').toLowerCase() === onlyPage))

const since = args.since ? new Date(args.since) : null
if (since && Number.isNaN(since.getTime())) fail(`invalid --since value: ${args.since}`)
const candidates = tickets
  .filter(isWebsiteFamily)
  .filter((ticket) => statuses.includes(ticket.status))
  .filter((ticket) => !since || new Date(ticket.updatedAt || ticket.createdAt) >= since)
  .slice(0, Number(args.limit || 500))

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
  const previousHash = ticket.customFields?.intakeHash
  if (previousHash === result.decisionSha256 && !args.force) {
    result.skipped = 'same ticket input revision and policy decision'
    continue
  }
  if (!args.apply) continue
  try { result.applied = await applyDecision(ticket, result) }
  catch (error) { result.applied = { ok: false, error: error.message, status: error.status || null, code: error.code || null } }
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
  if (result.action.kind === 'execution-ready') assertExecutionRelease()
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
  if (result.action.kind === 'request-clarification') {
    const runId = `website-intake-${ticket.id}-${result.decisionSha256.slice(0, 12)}`
    await agent(`/tasks/${ticket.id}/claim`, 'POST', { agentRunId: runId })
    const response = await agent(`/tasks/${ticket.id}/status`, 'POST', {
      status: 'MISSING_INFO',
      agentStatus: 'MISSING_INFO',
      agentRunId: runId,
      note: clarificationNote(bundle, result),
      requirements: clarificationRequirements(bundle, result),
    })
    actionResult = { api: 'agent-status', status: response.status, clarificationDelivery: response.clarificationDelivery?.status || null }
  } else if (result.action.kind === 'execution-ready') {
    const current = await agent(`/tasks/${ticket.id}`)
    const pending = pendingClarificationReviews(current)
    const hasRequesterResponses = (current.clarifications || []).some((item) => item.respondedAt || item.responseData)
    if (pending.length && hasRequesterResponses) {
      throw new Error('Pending clarification coexists with an earlier requester response; internal review is required before reopening')
    }
    const response = await agent(`/tasks/${ticket.id}/reconcile`, 'POST', {
      disposition: 'still_actionable',
      note: `Intake ${VERSION}: complete for class ${result.class}; routed to ${result.ownerRole}. No website change was made by intake.`,
      expectedUpdatedAt: current.updatedAt,
      expectedRevision: executionRevision(current),
      ...(pending.length ? { requireNoPendingRequesterScope: true, retireUnansweredClarifications: pending } : {}),
      agentRunId: `website-intake-${ticket.id}-${result.decisionSha256.slice(0, 12)}`,
    })
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
    const response = await agent(`/tasks/${ticket.id}/reconcile`, 'POST', {
      disposition,
      note: result.reason || `Intake ${VERSION}: ${result.outcome}; owner role ${result.ownerRole}.`,
      expectedUpdatedAt: current.updatedAt,
      expectedRevision: executionRevision(current),
      ...(pending.length ? { requireNoPendingRequesterScope: true, retireUnansweredClarifications: pending } : {}),
      agentRunId: `website-intake-${ticket.id}-${result.decisionSha256.slice(0, 12)}`,
    })
    if (pending.length) {
      await v1(`/tasks/${ticket.id}`, 'PATCH', { agentEligible: false })
    }
    actionResult = { api: 'agent-reconcile', disposition, status: response.task?.status, agentStatus: response.task?.agentStatus, retiredClarifications: pending.length }
  }

  const finalized = await agent(`/tasks/${ticket.id}`)
  const { intakePendingHash, ...currentCustomFields } = finalized.customFields || {}
  if (intakePendingHash !== result.decisionSha256) {
    throw new Error('Ticket input or intake state changed during administration; leaving the decision pending for a fresh evaluation')
  }
  if (ticketInputSha256(finalized) !== result.inputSha256) {
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

function isWebsiteFamily(ticket) {
  const fields = ticket.customFields || {}
  const filter = bundle.familyFilter
  return fields.requestFamily === filter.requestFamily
    || filter.titlePrefixes.some((prefix) => String(ticket.title || '').startsWith(prefix))
    || (filter.sources.includes(fields.source) && (fields.source !== 'alpha-site-qc' || /^https:\/\/alpha\.school\//.test(ticket.url || '')))
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
    error.code = data.code || null
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
    applied: results.filter((result) => result.applied?.ok).length,
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
