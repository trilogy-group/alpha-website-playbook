#!/usr/bin/env node
/**
 * The clock on Blocked and Missing Info (protocol 1e; repair 6 of docs/qc-loop-repair-plan-2026-09-25.md).
 *
 *   node agent/queue-aging.mjs [--queue <export.json>] [--now <ISO>] [--report <file>] [--markdown <file>] [--slack-draft [<file>]]
 *                              [--apply] [--actor <name>] [--hydration-concurrency 8]
 *
 * Reads the open APEX queue (v1 `/tasks?status=X&page=N&pageSize=100`, `{data:[...]}`), keeps website tickets only (the
 * policy bundle's family filter, or a URL on alpha.school), hydrates the held and ownerless ones through the agent API
 * (`/api/agent/tasks/{id}`, which carries `comments` and `activityLog`), and classifies each ticket:
 *
 *   ok         not a held status, or held with movement inside the last three days
 *   nudge      Blocked or Missing Info, idle three days or more: one templated note (`agingNudge`) to the named person,
 *              the assignee on a Blocked ticket, the requester on a Missing Info ticket
 *   escalate   idle seven days or more, or held with no named person at all (protocol 1d): listed to the website agent
 *              operator (Matt Barge) in the escalation draft (`agingEscalation`)
 *   class-gap  intake outcome needs-rule or owner role internal-triage at any status: a playbook defect (a missing class
 *              or owner), listed to the operator every day grouped by check id, never nudged to the requester
 *
 * Movement is a status, assignee, comment or description change, or the ticket's creation. Intake's customFields writes,
 * hosted execution bookkeeping and the nudge itself are not movement. A ticket the agent API did not hydrate falls back
 * to `updatedAt` and says so.
 *
 * Dry run by default: the report JSON (`--report`, default out/queue-aging/report.json), the markdown (`--markdown`,
 * default report.md next to it) and, with `--slack-draft`, the #support-websites summary and the operator's escalation
 * message as one file (default slack-draft.md next to the report). Nothing is sent by this script, ever.
 *
 * `--apply` posts each planned nudge on its ticket through the v1 task API as a dated note appended to the description,
 * the requester's text first, the same path agent/notify-requester.mjs uses for a requester notice: a PATCH whose only key
 * is `description`. Never a status change, never an assignee change, never agentEligible. (The agent API's comment route
 * requires an active claim, and claiming moves the ticket to In Progress; reconcile always writes a status; v1 has no
 * comment route.) The note's last line is the idempotency marker (`Marker: queue-aging nudge <id> <date>`): a ticket
 * carrying one dated within the last seven days is reported as suppressed and not nudged again. A live ticket that moved
 * since the plan (status or updatedAt) is skipped, not written. Every write is appended to queue-aging-writes.jsonl next
 * to the report. Closing a ticket as stale is never automatic.
 *
 * Env: APEX_API_TOKEN (APEX_API_BASE, APEX_AGENT_API_BASE optional, derived as agent/intake.mjs derives them).
 */
import fs from 'node:fs'
import { operatorPool } from './operator-pool.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apexBases } from './attach-evidence.mjs'
import { renderTemplate } from './ticket-templates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

export const AGING_VERSION = '0.1'
export const NUDGE_AFTER_DAYS = 3
export const ESCALATE_AFTER_DAYS = 7
export const NUDGE_REPEAT_DAYS = 7
export const HELD_STATUSES = ['BLOCKED', 'MISSING_INFO']
export const OPEN_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'MISSING_INFO', 'BLOCKED', 'FOR_REVIEW', 'TESTING', 'APPROVED']
export const CLASSIFICATIONS = ['ok', 'nudge', 'escalate', 'class-gap']
export const OPERATOR_ROLE = 'website-agent-operator'
export const UNRESOLVED_OWNER_ROLE = 'internal-triage'
export const NEEDS_RULE_OUTCOME = 'needs-rule'
export const NUDGE_HEADING = 'QUEUE AGING NUDGE'
export const NUDGE_MARKER = 'Marker: queue-aging nudge'
export const NUDGE_MARKER_PATTERN = /Marker: queue-aging nudge (\S+) (\d{4}-\d{2}-\d{2})/g
export const MOVEMENT_FIELDS = ['Status', 'Assignees', 'Description']
export const STATUS_CHANGE_ACTIONS = ['agent_status_updated', 'agent_reconciled']
export const COMMENT_ACTIONS = ['comment_added', 'agent_comment_added', 'agent_requester_comment_added']
export const CLARIFICATION_ACTIONS = ['agent_clarification_requested']
export const DEFAULT_ACTOR = 'queue-aging 0.1'
export const WRITES_FILE = 'queue-aging-writes.jsonl'
export const LIST_PAGE_SIZE = 100
export const LIST_MAX_PAGES = 20
const DAY_MS = 86_400_000
const EM_DASH = '—'

export class QueueAgingError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'QueueAgingError'
    this.code = code
    Object.assign(this, details)
  }
}

const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
export function loadBundle() { return readJson('spec/policy-bundle.generated.json') }
export function loadPeople() { return readJson('registry/people.json') }

/** The website agent operator (protocol 1d) from the policy bundle's role owners; the people registry is the fallback. */
export function operatorFor(bundle, people) {
  const pool = operatorPool(bundle, people)
  if (!pool) throw new QueueAgingError('NO_OPERATOR', `no registered person holds ${OPERATOR_ROLE}`)
  return pool
}

/** People lookups by APEX user id and by email (primary and alternates), from registry/people.json. */
export function peopleIndex(people) {
  const byApexId = new Map()
  const byEmail = new Map()
  for (const entry of Object.values(people?.people || {})) {
    if (entry.apexUserId) byApexId.set(entry.apexUserId, entry)
    for (const email of [entry.email, ...(entry.altEmails || [])]) if (email) byEmail.set(String(email).toLowerCase(), entry)
  }
  return { byApexId, byEmail }
}

/**
 * The observer's check id and title shapes from the policy bundle's family filter, as literals (a dynamic RegExp from a
 * file is a Semgrep finding); familyFilterDrift() fails closed when the bundle's strings no longer match them.
 */
export const OBSERVER_CHECK_ID_PATTERN = /^SITE-[A-Z0-9]+$/
export const OBSERVER_TITLE_PATTERN = /^Alpha [A-Z][A-Za-z .]+: /

/** The family-filter pattern the bundle carries that this module does not implement literally, or null. */
export function familyFilterDrift(bundle) {
  const filter = bundle?.familyFilter || {}
  if (filter.observerCheckIdPattern && filter.observerCheckIdPattern !== OBSERVER_CHECK_ID_PATTERN.source) return `observerCheckIdPattern ${filter.observerCheckIdPattern}`
  if (filter.observerTitlePattern && filter.observerTitlePattern !== OBSERVER_TITLE_PATTERN.source) return `observerTitlePattern ${filter.observerTitlePattern}`
  return null
}

function hostOf(url) {
  try { return new URL(String(url)).hostname.toLowerCase() } catch { return null }
}

/**
 * Website tickets only: the policy bundle's family filter (request family, title prefix, request type, agent or observer
 * source, observer check id or title shape, as agent/intake.mjs applies it) or a ticket URL on a public alpha.school host.
 */
export function isWebsiteTicket(ticket, bundle) {
  const fields = ticket.customFields || {}
  const filter = bundle.familyFilter || {}
  const hosts = new Set((bundle.siteScope?.publicHosts || ['alpha.school', 'www.alpha.school']).map((h) => h.toLowerCase()))
  const drift = familyFilterDrift(bundle)
  if (drift) throw new QueueAgingError('FILTER_DRIFT', `the policy bundle's family filter changed (${drift}); update the literal pattern in agent/queue-aging.mjs`)
  const requestType = String(ticket.requestType || '').trim().toLowerCase()
  if (filter.requestFamily && fields.requestFamily === filter.requestFamily) return true
  if ((filter.titlePrefixes || []).some((prefix) => String(ticket.title || '').startsWith(prefix))) return true
  if ((filter.requestTypes || []).some((type) => String(type).toLowerCase() === requestType)) return true
  if ((filter.sources || []).includes(fields.source)) return true
  if (filter.observerCheckIdPattern && OBSERVER_CHECK_ID_PATTERN.test(String(fields.checkId || ''))) return true
  if (filter.observerTitlePattern && OBSERVER_TITLE_PATTERN.test(String(ticket.title || ''))) return true
  return [ticket.url, fields.pageUrl, fields.targetPageUrl].some((u) => u && hosts.has(hostOf(u)))
}

/** A playbook defect: no class matched (needs-rule) or the owner role resolved to nobody (internal-triage). */
export function isClassGap(ticket) {
  const fields = ticket.customFields || {}
  return fields.ownerRole === UNRESOLVED_OWNER_ROLE || fields.intakeDecision?.outcome === NEEDS_RULE_OUTCOME
}

export function stripHtml(text) {
  return String(text || '').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
}

/** Every nudge marker on the ticket (description and comments): ticket id and ISO date, oldest first. */
export function nudgeMarkers(ticket) {
  const texts = [ticket.description, ...(ticket.comments || []).map((c) => c?.body)]
  const found = []
  for (const text of texts) {
    for (const match of stripHtml(text).matchAll(NUDGE_MARKER_PATTERN)) found.push({ ticketId: match[1], date: match[2] })
  }
  return found.sort((a, b) => a.date.localeCompare(b.date))
}

const countMarkers = (text) => (stripHtml(text).match(new RegExp(NUDGE_MARKER, 'g')) || []).length
const hasText = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * When the ticket last moved: the latest of its creation, a comment (never one carrying the nudge marker), and the
 * activity log's status, assignee and description changes (never intake's customFields writes, never the description
 * change that appended the nudge itself). A ticket with neither comments nor an activity log was not hydrated: its
 * updatedAt stands in and the kind says so.
 */
export function movementAt(ticket) {
  const candidates = []
  const push = (at, kind) => { if (hasText(at) && !Number.isNaN(new Date(at).getTime())) candidates.push({ at: new Date(at).toISOString(), kind }) }
  push(ticket.createdAt, 'created')
  const comments = Array.isArray(ticket.comments) ? ticket.comments : null
  const activity = Array.isArray(ticket.activityLog) ? ticket.activityLog : null
  for (const comment of comments || []) if (countMarkers(comment?.body) === 0) push(comment?.createdAt, 'comment')
  for (const entry of activity || []) {
    const meta = entry?.meta && typeof entry.meta === 'object' ? entry.meta : {}
    const action = String(entry?.action || '')
    if (action === 'created') push(entry.createdAt, 'created')
    else if (action === 'field_changed' && MOVEMENT_FIELDS.includes(meta.field)) {
      if (meta.field === 'Description' && countMarkers(meta.to) > countMarkers(meta.from)) continue
      push(entry.createdAt, `${meta.field.toLowerCase()} change`)
    } else if (STATUS_CHANGE_ACTIONS.includes(action) && hasText(meta.toStatus) && meta.fromStatus !== meta.toStatus) push(entry.createdAt, 'status change')
    else if (COMMENT_ACTIONS.includes(action)) push(entry.createdAt, 'comment')
    else if (CLARIFICATION_ACTIONS.includes(action)) push(entry.createdAt, 'clarification request')
  }
  if (!comments && !activity) {
    push(ticket.updatedAt, 'updatedAt (not hydrated)')
    return { ...(candidates.sort((a, b) => b.at.localeCompare(a.at))[0] || { at: null, kind: 'unknown' }), hydrated: false }
  }
  return { ...(candidates.sort((a, b) => b.at.localeCompare(a.at))[0] || { at: null, kind: 'unknown' }), hydrated: true }
}

export function idleDays(now, at) {
  if (!at) return null
  return Math.max(0, Math.floor((new Date(now).getTime() - new Date(at).getTime()) / DAY_MS))
}

const isoDate = (value) => new Date(value).toISOString().slice(0, 10)

/** The person the nudge names: the assignees on a Blocked ticket, the requester on a Missing Info ticket; never a role. */
export function personFor(ticket, index) {
  if (ticket.status === 'MISSING_INFO') {
    const email = String(ticket.requesterEmail || '').toLowerCase()
    if (!email) return { name: null, source: 'requester', note: 'no requester email on the ticket' }
    const entry = index.byEmail.get(email)
    return { name: entry?.name || email, source: 'requester', note: entry ? null : 'requester not in registry/people.json; named by email' }
  }
  const names = (ticket.assignees || []).map((a) => index.byApexId.get(a?.id)?.name || a?.name || a?.email || null).filter(Boolean)
  if (!names.length) return { name: null, source: 'assignees', note: 'no assignee on the ticket' }
  return { name: [...new Set(names)].join(', '), source: 'assignees', note: null }
}

/** What the ticket waits on, from its own notes: the DECISION NEEDED line, the Missing Info items, or the hold as recorded. */
export function waitingOn(ticket) {
  const text = [stripHtml(ticket.description), ...(ticket.comments || []).map((c) => stripHtml(c?.body))].join('\n')
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const decision = [...lines].reverse().find((l) => /^DECISION NEEDED:/.test(l))
  if (decision) return cleanText(decision).slice(0, 300)
  const missingHeading = lines.findIndex((l) => /^MISSING INFO \(/.test(l))
  if (missingHeading >= 0) {
    const items = lines.slice(missingHeading + 1).filter((l) => /^\d+\. /.test(l)).slice(0, 3)
    if (items.length) return cleanText(`items ${items.join('; ')}`).slice(0, 300)
  }
  const clarification = (ticket.clarifications || []).find((c) => c && !c.respondedAt && hasText(c.message))
  if (clarification) return cleanText(`the clarification asked on the ticket: ${stripHtml(clarification.message)}`).slice(0, 300)
  return `the ${ticket.status === 'MISSING_INFO' ? 'Missing Info' : 'Blocked'} hold recorded on this ticket (no DECISION NEEDED line)`
}

export function nextStepFor(ticket) {
  return ticket.status === 'MISSING_INFO'
    ? 'add the items to the ticket (attach the files or reply on the ticket); or say on the ticket why it stays held'
    : 'answer the question on the ticket or move the status; or say on the ticket why it stays held'
}

export const statusLabel = (status) => (status === 'MISSING_INFO' ? 'in Missing Info' : 'Blocked')

/** Classify one ticket. Pure; `now` is an ISO string or Date. */
export function classifyTicket(ticket, { now, index, operator }) {
  const fields = ticket.customFields || {}
  const movement = movementAt(ticket)
  const idle = idleDays(now, movement.at)
  const person = personFor(ticket, index)
  const markers = nudgeMarkers(ticket).filter((m) => m.ticketId === ticket.id)
  const lastNudge = markers.length ? markers.at(-1).date : null
  const nudgeAge = lastNudge ? idleDays(now, `${lastNudge}T00:00:00Z`) : null
  const item = {
    id: ticket.id,
    title: cleanText(ticket.title).slice(0, 160),
    status: ticket.status || null,
    url: ticket.url || fields.pageUrl || null,
    createdAt: ticket.createdAt || null,
    updatedAt: ticket.updatedAt || null,
    lastMovementAt: movement.at,
    lastMovementKind: movement.kind,
    hydrated: movement.hydrated,
    idleDays: idle,
    checkId: fields.checkId || null,
    observerCheck: fields.check || fields.observerCheck || null,
    ownerRole: fields.ownerRole || null,
    intakeOutcome: fields.intakeDecision?.outcome || null,
    requesterEmail: ticket.requesterEmail || null,
    assignees: (ticket.assignees || []).map((a) => a?.name || a?.email || a?.id).filter(Boolean),
    person: person.name,
    personSource: person.source,
    personNote: person.note,
    lastNudgeAt: lastNudge,
    classification: 'ok',
    reason: null,
    nudgeSuppressed: false,
  }
  if (isClassGap(ticket)) {
    item.classification = 'class-gap'
    item.reason = `${fields.intakeDecision?.outcome === NEEDS_RULE_OUTCOME ? 'intake outcome needs-rule' : `owner role ${UNRESOLVED_OWNER_ROLE}`}: no ticket class or owner in the playbook; listed to ${operator.name}, never nudged`
    return item
  }
  if (!HELD_STATUSES.includes(item.status)) { item.reason = `${item.status || 'unknown status'} is not a held status`; return item }
  if (!person.name) {
    item.classification = 'escalate'
    item.reason = `held with no named person (${person.note}); protocol 1d says a held ticket always has one`
    return item
  }
  if (idle === null) { item.classification = 'escalate'; item.reason = 'no movement time could be read from the ticket'; return item }
  if (idle >= ESCALATE_AFTER_DAYS) {
    item.classification = 'escalate'
    item.reason = `idle ${idle} days (${ESCALATE_AFTER_DAYS} or more) since ${movement.kind} on ${isoDate(movement.at)}; waits on ${person.name}`
    return item
  }
  if (idle >= NUDGE_AFTER_DAYS) {
    item.classification = 'nudge'
    if (nudgeAge !== null && nudgeAge < NUDGE_REPEAT_DAYS) {
      item.nudgeSuppressed = true
      item.reason = `idle ${idle} days; already nudged on ${lastNudge} (${nudgeAge} days ago), not repeated within ${NUDGE_REPEAT_DAYS} days`
    } else {
      item.reason = `idle ${idle} days (${NUDGE_AFTER_DAYS} or more) since ${movement.kind} on ${isoDate(movement.at)}; nudge ${person.name}`
    }
    return item
  }
  item.reason = `idle ${idle} days since ${movement.kind} on ${isoDate(movement.at)}`
  return item
}

/** The nudge note for a planned item (template agingNudge); the marker is its last line. */
export function renderNudge(item, ticket, { actor, date, operator }) {
  return renderTemplate('agingNudge', {
    actor,
    date,
    person: cleanText(item.person),
    statusLabel: statusLabel(item.status),
    idleDays: String(item.idleDays),
    lastMovementAt: isoDate(item.lastMovementAt),
    waitingOn: waitingOn(ticket),
    nextStep: nextStepFor(ticket),
    operator: operator.name,
    escalateAfterDays: String(ESCALATE_AFTER_DAYS),
    ticketId: item.id,
  })
}

/** Append the nudge after the existing description, the requester's text first; never rewrites what is there. */
export function appendNudge(description, note) {
  const existing = String(description || '').replace(/\s+$/, '')
  return existing ? `${existing}\n\n${note}\n` : `${note}\n`
}

/** The observer's incident id shape (SITE- plus hex): per finding, not per check, so a class gap groups by the check name instead. */
export const OBSERVER_INCIDENT_ID = /^SITE-[0-9A-F]+$/i

/** The key a class gap groups under: the check id, or for an observer incident id the observer check name (customFields.check). */
export function classGapKey(item) {
  if (item.checkId && OBSERVER_INCIDENT_ID.test(item.checkId)) return item.observerCheck ? `${item.observerCheck} (observer)` : item.checkId
  return item.checkId || 'no check id'
}

export function groupClassGaps(items) {
  const groups = new Map()
  for (const item of items.filter((i) => i.classification === 'class-gap')) {
    const key = classGapKey(item)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item.id)
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([checkId, ids]) => ({ checkId, count: ids.length, ids: [...ids].sort() }))
}

/** The plan: every website ticket classified, the nudge notes, the escalation text. Pure apart from the clock passed in. */
export function planQueueAging({ queue, now = new Date(), bundle = loadBundle(), people = loadPeople(), actor = DEFAULT_ACTOR }) {
  const nowIso = new Date(now).toISOString()
  if (Number.isNaN(new Date(now).getTime())) throw new QueueAgingError('BAD_NOW', `--now must be an ISO datetime, got ${now}`)
  const date = nowIso.slice(0, 10)
  const operator = operatorFor(bundle, people)
  const index = peopleIndex(people)
  const tickets = [...new Map((queue || []).map((t) => [t.id, t])).values()].filter((t) => t && t.id && OPEN_STATUSES.includes(t.status))
  const website = tickets.filter((t) => isWebsiteTicket(t, bundle))
  const byId = new Map(website.map((t) => [t.id, t]))
  const items = website.map((t) => classifyTicket(t, { now: nowIso, index, operator })).sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1) || a.id.localeCompare(b.id))
  const nudges = items.filter((i) => i.classification === 'nudge' && !i.nudgeSuppressed)
  const suppressed = items.filter((i) => i.classification === 'nudge' && i.nudgeSuppressed)
  const escalations = items.filter((i) => i.classification === 'escalate')
  const classGaps = items.filter((i) => i.classification === 'class-gap')
  const gaps = groupClassGaps(items)
  const notes = Object.fromEntries(nudges.map((item) => [item.id, renderNudge(item, byId.get(item.id), { actor, date, operator })]))
  const escalation = renderTemplate('agingEscalation', {
    date,
    operator: operator.name,
    escalations: String(escalations.length),
    escalateAfterDays: String(ESCALATE_AFTER_DAYS),
    tickets: escalations.map((i) => ({ id: i.id, status: i.status, idleDays: String(i.idleDays ?? 'unknown'), person: i.person || 'no named person', title: cleanText(i.title) })),
    classGaps: String(classGaps.length),
    gaps: gaps.map((g) => ({ checkId: g.checkId, count: String(g.count), ids: g.ids.join(', ') })),
  })
  const heldCounts = { BLOCKED: items.filter((i) => i.status === 'BLOCKED').length, MISSING_INFO: items.filter((i) => i.status === 'MISSING_INFO').length }
  const plan = {
    version: AGING_VERSION,
    ranAt: new Date().toISOString(),
    now: nowIso,
    mode: 'dry-run',
    actor,
    operator,
    thresholds: { nudgeAfterDays: NUDGE_AFTER_DAYS, escalateAfterDays: ESCALATE_AFTER_DAYS, nudgeRepeatDays: NUDGE_REPEAT_DAYS },
    counts: {
      open: tickets.length,
      website: website.length,
      excluded: tickets.length - website.length,
      held: heldCounts.BLOCKED + heldCounts.MISSING_INFO,
      blocked: heldCounts.BLOCKED,
      missingInfo: heldCounts.MISSING_INFO,
      ok: items.filter((i) => i.classification === 'ok').length,
      nudge: nudges.length,
      nudgeSuppressed: suppressed.length,
      escalate: escalations.length,
      classGap: classGaps.length,
      notHydrated: items.filter((i) => !i.hydrated && (HELD_STATUSES.includes(i.status) || i.classification === 'class-gap')).length,
    },
    items,
    nudges: nudges.map((i) => ({ id: i.id, person: i.person, idleDays: i.idleDays, note: notes[i.id] })),
    suppressed: suppressed.map((i) => ({ id: i.id, person: i.person, idleDays: i.idleDays, lastNudgeAt: i.lastNudgeAt })),
    escalations: escalations.map((i) => ({ id: i.id, status: i.status, person: i.person, idleDays: i.idleDays, title: i.title, reason: i.reason })),
    classGaps: gaps,
    escalationText: escalation,
    summaryText: summaryText({ date, counts: null, heldCounts, website: website.length, nudges: nudges.length, suppressed: suppressed.length, escalations: escalations.length, classGaps: classGaps.length, operator }),
  }
  for (const text of [plan.escalationText, plan.summaryText, ...Object.values(notes)]) {
    if (text.includes(EM_DASH)) throw new QueueAgingError('EM_DASH', 'a rendered note carries an em dash')
  }
  return plan
}

/** Text bound for a note or a Slack line: no em dash (protocol rule noEmDash), single-spaced. */
export function cleanText(text) {
  return String(text || '').replace(/\s*\u2014\s*/g, ' - ').replace(/\u2026/g, '...').replace(/\s+/g, ' ').trim()
}

function summaryText({ date, heldCounts, website, nudges, suppressed, escalations, classGaps, operator }) {
  return [
    `Website queue aging ${date}: ${website} open website tickets, ${heldCounts.BLOCKED + heldCounts.MISSING_INFO} held (Blocked ${heldCounts.BLOCKED}, Missing Info ${heldCounts.MISSING_INFO}).`,
    `Nudged today: ${nudges} (idle 3 days or more; ${suppressed} already nudged this week). Escalated to ${operator.name}: ${escalations} (idle 7 days or more, or no named person). Class gaps for the playbook: ${classGaps} (no ticket class or owner; never nudged).`,
    'Nothing was closed; a stale ticket is closed only by a person. The full list is in the queue-aging report.',
  ].join('\n')
}

/** The markdown report for a person: counts, then one table per classification. */
export function renderMarkdown(plan) {
  const lines = [`# Website queue aging ${plan.now.slice(0, 10)}`, '', `Mode: ${plan.mode}. Now: ${plan.now}. Thresholds: nudge after ${plan.thresholds.nudgeAfterDays} idle days, escalate after ${plan.thresholds.escalateAfterDays}, a nudge repeats after ${plan.thresholds.nudgeRepeatDays}. Operator: ${plan.operator.name}.`, '']
  const c = plan.counts
  lines.push('## Counts', '', `- Open tickets read: ${c.open}; website tickets: ${c.website} (excluded as not website: ${c.excluded})`, `- Held: ${c.held} (Blocked ${c.blocked}, Missing Info ${c.missingInfo})`, `- ok: ${c.ok}`, `- nudge: ${c.nudge} (suppressed as already nudged this week: ${c.nudgeSuppressed})`, `- escalate: ${c.escalate}`, `- class-gap: ${c.classGap}`, `- held or class-gap tickets not hydrated (idle age from updatedAt): ${c.notHydrated}`, '')
  const table = (title, rows, extra = () => '') => {
    lines.push(`## ${title} (${rows.length})`, '')
    if (!rows.length) { lines.push('none', ''); return }
    lines.push('| ticket | status | idle days | last movement | person | check id | reason |', '| --- | --- | --- | --- | --- | --- | --- |')
    for (const i of rows) lines.push(`| ${i.id} | ${i.status} | ${i.idleDays ?? 'n/a'} | ${i.lastMovementAt ? `${i.lastMovementAt.slice(0, 10)} (${i.lastMovementKind})` : 'unknown'} | ${cleanText(i.person || 'no named person')} | ${i.checkId || ''} | ${cleanText(`${i.title}. ${i.reason || ''}${extra(i)}`)} |`)
    lines.push('')
  }
  table('Escalate', plan.items.filter((i) => i.classification === 'escalate'))
  table('Nudge', plan.items.filter((i) => i.classification === 'nudge' && !i.nudgeSuppressed))
  table('Nudge suppressed (already nudged this week)', plan.items.filter((i) => i.classification === 'nudge' && i.nudgeSuppressed))
  lines.push(`## Class gaps by check id (${plan.counts.classGap})`, '')
  if (!plan.classGaps.length) lines.push('none', '')
  for (const g of plan.classGaps) lines.push(`- ${g.checkId} (${g.count}): ${g.ids.join(', ')}`)
  if (plan.classGaps.length) lines.push('')
  table('Class gap tickets', plan.items.filter((i) => i.classification === 'class-gap'))
  table('Ok', plan.items.filter((i) => i.classification === 'ok'))
  if (plan.nudges.length) {
    lines.push('## Nudge notes', '')
    for (const n of plan.nudges) lines.push(`### ${n.id}`, '', '```', n.note, '```', '')
  }
  if (plan.applied) {
    lines.push('## Applied', '', `- posted: ${plan.applied.posted.length}; skipped: ${plan.applied.skipped.length}; errors: ${plan.applied.errors.length}`, '')
    for (const s of plan.applied.skipped) lines.push(`- skipped ${s.id}: ${s.reason}`)
    for (const e of plan.applied.errors) lines.push(`- error ${e.id}: ${e.error}`)
    lines.push('')
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

/** The Slack drafts as one file: the channel summary, then the operator's escalation. Written, never sent. */
export function renderSlackDraft(plan) {
  return [
    `# Slack drafts ${plan.now.slice(0, 10)} (written by agent/queue-aging.mjs; nothing is sent by the script)`,
    '',
    '## #support-websites summary',
    '',
    plan.summaryText,
    '',
    `## Escalation to ${plan.operator.name} (website-agent-operator), sent by a person`,
    '',
    plan.escalationText,
    '',
  ].join('\n')
}

/** APEX client: v1 for the listing and the description PATCH, the agent API for the hydrating read. */
export function createApexClient({ env = process.env, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const { v1Base, agentBase } = apexBases(env)
  const token = env.APEX_API_TOKEN
  async function request(base, route, method = 'GET', body) {
    if (!token) throw new QueueAgingError('MISSING_TOKEN', 'APEX_API_TOKEN required')
    const response = await fetchImpl(`${base}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    let data; try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text.slice(0, 500) } }
    if (!response.ok) throw new QueueAgingError('APEX_ERROR', `APEX ${method} ${route} ${response.status}: ${JSON.stringify(data).slice(0, 400)}`, { status: response.status, body: data })
    return data?.task || data
  }
  const client = {
    v1Base, agentBase, token, listWarnings: [],
    async listOpen(statuses = OPEN_STATUSES) {
      const all = []
      client.listWarnings = []
      for (const status of statuses) {
        for (let page = 1; page <= LIST_MAX_PAGES; page++) {
          const data = await request(v1Base, `/tasks?status=${encodeURIComponent(status)}&page=${page}&pageSize=${LIST_PAGE_SIZE}`)
          const items = Array.isArray(data) ? data : data.data || data.items || data.tasks || []
          all.push(...items)
          if (items.length < LIST_PAGE_SIZE) break
          if (page === LIST_MAX_PAGES) { const warning = `listOpen: status ${status} hit the ${LIST_MAX_PAGES}-page cap; the queue may be incomplete`; client.listWarnings.push(warning); log(warning) }
        }
      }
      return [...new Map(all.map((t) => [t.id, t])).values()]
    },
    hydrate: (id) => request(agentBase, `/tasks/${encodeURIComponent(id)}`),
    get: (id) => request(v1Base, `/tasks/${encodeURIComponent(id)}`),
    patch: (id, body) => request(v1Base, `/tasks/${encodeURIComponent(id)}`, 'PATCH', body),
  }
  return client
}

async function mapLimit(items, limit, operation) {
  const results = new Array(items.length)
  let next = 0
  async function worker() { while (next < items.length) { const i = next++; results[i] = await operation(items[i], i) } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Hydrate the tickets whose classification depends on comments and the activity log: held ones and class gaps. */
export async function hydrateQueue(queue, { apex, bundle, concurrency = 8, log = () => {} }) {
  const warnings = []
  const hydrated = await mapLimit(queue, concurrency, async (ticket) => {
    if (!isWebsiteTicket(ticket, bundle) || !(HELD_STATUSES.includes(ticket.status) || isClassGap(ticket))) return ticket
    try {
      const full = await apex.hydrate(ticket.id)
      return full && full.id ? full : ticket
    } catch (error) {
      warnings.push({ id: ticket.id, error: error.message })
      log(`hydrate ${ticket.id} failed: ${error.message}`)
      return ticket
    }
  })
  return { queue: hydrated, warnings }
}

/**
 * Post each planned nudge: read the live ticket, refuse when it moved since the plan (status or updatedAt) or already
 * carries a fresh marker, then PATCH the description only. The body never carries status, assignees or agentEligible.
 */
export async function applyPlan(plan, { apex, log = () => {}, writesFile = null, now = new Date() }) {
  const results = { posted: [], skipped: [], errors: [], writes: [] }
  const record = (entry) => { const line = { at: new Date().toISOString(), ...entry }; results.writes.push(line); if (writesFile) fs.appendFileSync(writesFile, `${JSON.stringify(line)}\n`) }
  for (const nudge of plan.nudges) {
    const item = plan.items.find((i) => i.id === nudge.id)
    try {
      const live = await apex.get(nudge.id)
      if (!live || !live.id) { results.skipped.push({ id: nudge.id, reason: 'ticket not readable' }); continue }
      if (live.status !== item.status) { results.skipped.push({ id: nudge.id, reason: `status is ${live.status}, the plan saw ${item.status}` }); continue }
      if (item.updatedAt && live.updatedAt && live.updatedAt !== item.updatedAt) { results.skipped.push({ id: nudge.id, reason: `updated ${live.updatedAt} after the plan (${item.updatedAt})` }); continue }
      const fresh = nudgeMarkers(live).filter((m) => m.ticketId === live.id && idleDays(now, `${m.date}T00:00:00Z`) < NUDGE_REPEAT_DAYS)
      if (fresh.length) { results.skipped.push({ id: nudge.id, reason: `already nudged on ${fresh.at(-1).date}` }); continue }
      const body = { description: appendNudge(live.description, nudge.note) }
      const keys = Object.keys(body)
      if (keys.length !== 1 || keys[0] !== 'description') throw new QueueAgingError('BAD_PATCH', 'a nudge PATCH carries the description and nothing else')
      const response = await apex.patch(nudge.id, body)
      record({ write: 'nudge', ticket: nudge.id, person: nudge.person, idleDays: nudge.idleDays, status: response?.status || live.status })
      results.posted.push({ id: nudge.id, person: nudge.person })
      log(`nudged ${nudge.id} (${nudge.person}, idle ${nudge.idleDays} days)`)
    } catch (error) {
      results.errors.push({ id: nudge.id, error: error.message })
      record({ write: 'nudge', ticket: nudge.id, error: error.message })
    }
  }
  return results
}

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    out[key] = next === undefined || next.startsWith('--') ? true : (i++, next)
  }
  return out
}

export function loadQueue(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Array.isArray(raw) ? raw : raw.data || raw.items || raw.tasks || []
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const now = args.now && args.now !== true ? new Date(args.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new QueueAgingError('BAD_NOW', `--now must be an ISO datetime, got ${args.now}`)
  const offline = args.queue && args.queue !== true ? path.resolve(args.queue) : null
  if (args.apply && offline) throw new QueueAgingError('MISSING_ARG', '--apply writes against the live APEX queue and cannot take --queue <export.json>')
  if (!offline && !env.APEX_API_TOKEN) throw new QueueAgingError('MISSING_TOKEN', 'APEX_API_TOKEN is required to read the open queue; pass --queue <export.json> for an offline run')
  const bundle = loadBundle()
  const people = loadPeople()
  const reportFile = path.resolve(args.report && args.report !== true ? args.report : path.join('out', 'queue-aging', 'report.json'))
  const markdownFile = path.resolve(args.markdown && args.markdown !== true ? args.markdown : path.join(path.dirname(reportFile), 'report.md'))
  const slackFile = args['slack-draft'] ? path.resolve(args['slack-draft'] !== true ? args['slack-draft'] : path.join(path.dirname(reportFile), 'slack-draft.md')) : null
  const apex = offline ? null : createApexClient({ env, log: io.error })
  let queue = offline ? loadQueue(offline) : await apex.listOpen()
  let hydrationWarnings = []
  if (!offline) {
    const result = await hydrateQueue(queue, { apex, bundle, concurrency: Number(args['hydration-concurrency'] || 8), log: io.error })
    queue = result.queue
    hydrationWarnings = result.warnings
  }
  const plan = planQueueAging({ queue, now, bundle, people, actor: args.actor && args.actor !== true ? args.actor : DEFAULT_ACTOR })
  plan.mode = args.apply ? 'apply' : 'dry-run'
  plan.queueSource = offline || apex.v1Base
  plan.queueWarnings = apex ? apex.listWarnings : []
  plan.hydrationWarnings = hydrationWarnings
  if (args.apply) {
    if (!env.APEX_API_TOKEN) throw new QueueAgingError('MISSING_TOKEN', 'APEX_API_TOKEN required for --apply')
    fs.mkdirSync(path.dirname(reportFile), { recursive: true })
    const applied = await applyPlan(plan, { apex, log: io.log, writesFile: path.join(path.dirname(reportFile), WRITES_FILE), now })
    plan.applied = { posted: applied.posted, skipped: applied.skipped, errors: applied.errors, writes: applied.writes.length, writesFile: path.join(path.dirname(reportFile), WRITES_FILE) }
  }
  for (const file of [reportFile, markdownFile, slackFile].filter(Boolean)) fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(reportFile, `${JSON.stringify(plan, null, 2)}\n`)
  fs.writeFileSync(markdownFile, renderMarkdown(plan))
  if (slackFile) fs.writeFileSync(slackFile, renderSlackDraft(plan))
  const summary = {
    mode: plan.mode, now: plan.now, counts: plan.counts, report: reportFile, markdown: markdownFile, slackDraft: slackFile,
    classGapsByCheckId: Object.fromEntries(plan.classGaps.map((g) => [g.checkId, g.count])),
    ...(plan.queueWarnings.length ? { queueWarnings: plan.queueWarnings } : {}),
    ...(hydrationWarnings.length ? { hydrationWarnings: hydrationWarnings.length } : {}),
    ...(plan.applied ? { applied: { posted: plan.applied.posted.length, skipped: plan.applied.skipped.length, errors: plan.applied.errors.length } } : {}),
  }
  io.log(JSON.stringify(summary, null, 2))
  return { plan }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof QueueAgingError) { console.error(`${error.code}: ${error.message}`); process.exit(error.code === 'APEX_ERROR' ? 2 : 1) }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
