#!/usr/bin/env node
/**
 * File observer findings as APEX website tickets, and close the tickets whose check cleared (QC loop redesign
 * 2026-09-24, workstream 6: the playbook defines, the observer measures, the protocol files).
 *
 *   node agent/file-observer-findings.mjs --run-dir <packet dir> [--bundle spec/check-bundle.generated.json] \
 *     [--queue <apex export.json>] [--apply] [--report <file>] [--now <ISO>] [--max-packet-age-hours 6] [--after-run-id <run id>]
 *   node agent/file-observer-findings.mjs --run <github run id> [...]      # gh run download -R superbuilders/aeo -n alpha-site-packet-<run>
 *
 * Input: the observer packet artifact (`findings.json`, `incidents.json`, `manifest.json`, optional `health.json`,
 * `screenshots/<route>-<viewport>.png`) and the compiled check bundle (`spec/check-bundle.generated.json`, schema
 * `spec/schemas/check-bundle.schema.json`: one row per observer check and viewport with the requirement, channel,
 * dedupe scope, class, owner role, grace period, clear-after runs, consecutive runs, evidence profile, source health
 * dependency, suppression conditions and any pending decision). The open APEX queue comes from the v1 API or, offline,
 * from `--queue <export.json>`.
 *
 * Rules, in order, per finding:
 *   1. A check with no row (or a retired one) is telemetry: dropped and counted. An advisory row is counted and never
 *      filed. A loop-health row (`channel: loop-health`) goes to the observer owner's channel, never the website queue.
 *   1b. Sister-site guard: a campus-page row (pageFamily campus, campus-open, campus-announced) measures alpha.school campus
 *      pages only; a finding on any other host (alphahigh.school, sportsacademy.school, ...) is reported as out-of-scope-site
 *      and never filed. Group titles use the campus display name from registry/campus-pages.json, never a bare program id.
 *   1c. Named exceptions, read through the row's exemptionsRef: a campus and CTA with an unexpired entry in
 *      registry/campus-cta-exceptions.json (rule hidden, present or destination; expires an ISO date, lifecycle:Open or
 *      null) is reported as exempted; so is an other-campus or sister-brand finding whose card names a person listed as
 *      shared leadership for the page's campus group (registry/campus-leadership.json groups) and a sibling campus.
 *   2. A finding is suppressed and counted when its row depends on a source that `health.json` (else the manifest's
 *      providers) reports degraded, failed or stale (or `suppressFindings: true`; not-collected, optional and disabled
 *      never suppress), or when the finding carries a `suppressWhen` condition. Loop-health suppression is the
 *      observer's own (`suppresses` on the loop-health rows); the filer reports `health.json.suppressedByLoopHealth`.
 *   3. Holds: when the manifest says the observer ran a verified check bundle (`manifest.checkBundle.status` verified,
 *      same sha256 as the bundle in use) its grace-period and consecutive-run holds are trusted and not re-applied.
 *      Otherwise the grace period runs from the incident's first-seen time and `requireConsecutiveRuns` reads the
 *      incident's `consecutiveFailingRuns` (aeo PR 24), else the finding in this run plus the previous run id in the
 *      incident's run history; never the lifetime `occurrences`.
 *   4. One ticket per dedupe scope (page, template, program, event, site), keyed `observer:<row key>:<scopeKey>` where
 *      the row key is the row id minus its viewport suffix: the desktop and mobile rows of one requirement merge and
 *      rows of different classes or owners never do. While a ticket is open on a key, other rows on the page still file.
 *   5. A row with `decisionPending` files nothing new while that ticket is open; the group is reported against it.
 *   6. The body is rendered to the ticket contract and checked with tests/validate-ticket.mjs `contractCheck`;
 *      a ticket that fails the contract is a filer defect and is not filed. Em dashes and the ellipsis character never
 *      reach a title, body or note.
 *   7. Dedupe against the open queue the way agent/file-found-ticket.mjs does: idempotency key, exact title, then an
 *      open ticket carrying any of the group's observer ids or the same check on one of its pages, then the aliases in
 *      spec/observer-check-map.json dedupeAliases (older check ids and title shapes for the same defect on the same page).
 *   8. Class and owner come from the policy bundle; a role with no registered APEX user escalates to the website agent
 *      operator as Blocked (protocol 1d) with the role named in the body.
 *   9. Evidence: the artifact's desktop and mobile screenshot pair for the finding's route goes onto the ticket with
 *      agent/attach-evidence.mjs when both files exist.
 *  10. Auto-resolve: only a ticket this filer created, proven by the exact `customFields.filedBy` marker and a non-empty
 *      `customFields.filerRunId` (PR 26: a legacy observer ticket is never completed merely because it carries a SITE
 *      id; those are listed under unresolved), carrying an observer check id whose incidents are all resolved by clean runs (at least the
 *      row's clearAfterRuns; a resolutionReason such as superseded-evidence-version is never a clear) gets a section-7
 *      RESOLUTION note (assertNoteShape) citing the clearing run ids, `resolutionKind: check-cleared` (first class and in
 *      customFields), and status COMPLETED through one v1 PATCH built from the live ticket with `expectedUpdatedAt`:
 *      never a PATCH whose only key is agentEligible, no agentStatus (APEX clears it on completion), the existing
 *      description first (APEX PR 409). Only a ticket in NOT_STARTED, or BLOCKED by intake or the filer with no human
 *      note, closes this way; FOR_REVIEW, MISSING_INFO, IN_PROGRESS, a ticket a row's decisionPending names, and one
 *      carrying an OPERATOR INSTRUCTION, CORRECTION or DECISION NEEDED line are reported as "cleared but needs a person".
 *
 * APEX PR 409 marks a ticket filer-owned by customFields.checkId (SITE-*), filerRunId, requirementId and
 * checkBundleVersion; the filer sets them on every create and resolve, and treats 409 OBSERVER_FILER_OWNED
 * (agent/apex-errors.mjs, shared with intake) as a skip.
 *
 * Packet freshness gate (2026-09-25: the scheduled filer applied a 17-day-old packet that filed 20 tickets no current run
 * reproduces). `--apply` refuses with STALE_PACKET when `manifest.completedAt` is older than `--max-packet-age-hours`
 * (default 6) before now, when `manifest.checkBundle.status` is not `verified`, or, given `--after-run-id <id>`, when the
 * packet's run id is not newer than that id (compareRunIds: the run ids' trailing timestamps, so the same packet is never
 * applied twice and an older one never after a newer one). A dry run reports the same conditions as `packetWarnings`.
 *
 * Dry run by default: the plan goes to `<run dir>/filer-report.json` and stdout. `--apply` performs the writes against the
 * live queue (never with `--queue`) and appends every one to `<run dir>/filer-writes.jsonl`. Env: APEX_API_TOKEN
 * (APEX_API_BASE, APEX_AGENT_API_BASE optional).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { apexBases, attachEvidence, planEvidence } from './attach-evidence.mjs'
import { FILER_OWNED_CODE, isFilerOwnedConflict } from './apex-errors.mjs'
import { assertNoteShape, renderTemplate } from './ticket-templates.mjs'
import { contractCheck } from '../tests/validate-ticket.mjs'

export { FILER_OWNED_CODE, isFilerOwnedConflict }

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
export const FILER_VERSION = '0.4'
export const FILED_BY = 'agent/file-observer-findings.mjs'
export const IDEMPOTENCY_PREFIX = 'observer:'
export const RESOLUTION_KIND = 'check-cleared'
export const OBSERVER_SOURCE = 'alpha-site-qc'
export const FILER_SOURCE = 'agent-found'
export const NOT_FILER_OWNED = 'not filer-owned; auto-resolution refused'
/** Statuses the filer may close on its own (rule 10); every other status belongs to a person. */
export const RESOLVABLE_STATUSES = ['NOT_STARTED', 'BLOCKED']
/** A line a person wrote that outranks the filer (protocol 1c and 1d). */
export const INSTRUCTION_LINE = /^(?:OPERATOR INSTRUCTION|CORRECTION|DECISION NEEDED)\b/
/** Provider statuses that suppress a dependent row; not-collected, optional and disabled do not. */
export const UNHEALTHY_STATUSES = ['degraded', 'failed', 'stale']
export const DEDUPE_SCOPES = ['page', 'template', 'program', 'event', 'site']
export const CHANNELS = ['ticket', 'loop-health']
export const ROW_FIELDS = ['id', 'observerCheck', 'title', 'pageFamily', 'lifecycleStates', 'element', 'expected', 'comparator', 'severity', 'status', 'ticketClass', 'ownerRole', 'dedupeScope', 'clearAfterRuns', 'gracePeriodHours', 'evidenceProfile', 'sourceHealthDependency', 'requirementRef']
export const OPEN_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'MISSING_INFO', 'BLOCKED', 'FOR_REVIEW', 'TESTING', 'APPROVED']
export const OPERATOR_ROLE = 'website-agent-operator'
export const DEFAULT_CLEAR_AFTER_RUNS = 2
export const PUBLIC_HOSTS = ['alpha.school', 'www.alpha.school']
/** Reason on a campus-page finding whose URL is on another host (alphahigh.school, sportsacademy.school, ...): reported, never filed. */
export const OUT_OF_SCOPE_SITE = 'out-of-scope-site'
export const CTA_EXCEPTIONS_FILE = 'registry/campus-cta-exceptions.json'
export const LEADERSHIP_FILE = 'registry/campus-leadership.json'
export const LIFECYCLE_FILE = 'spec/campus-lifecycle.json'
export const CHECK_MAP_FILE = 'spec/observer-check-map.json'
/** The observer's incident id shape (aeo util siteIncidentId): SITE- plus exactly ten upper-case hex characters. */
export const OBSERVER_ID_HEX = 10
export const OBSERVER_ID = new RegExp(`\\bSITE-[0-9A-F]{${OBSERVER_ID_HEX}}\\b`, 'gi')
export const isObserverId = (value) => new RegExp(`^SITE-[0-9A-F]{${OBSERVER_ID_HEX}}$`, 'i').test(String(value || ''))
const EM_DASH = '\u2014'
const ELLIPSIS = '\u2026'

/** Text bound for a title, body or note: no em dash (protocol rule noEmDash) and no ellipsis character. */
export function cleanText(value) {
  return String(value ?? '').replace(new RegExp(`\\s*${EM_DASH}\\s*`, 'g'), '; ').replace(new RegExp(ELLIPSIS, 'g'), '...')
}

export class ObserverFilerError extends Error {
  /** @param {'MISSING_ARG'|'MISSING_TOKEN'|'BAD_RUN_DIR'|'BAD_BUNDLE'|'BAD_QUEUE'|'DOWNLOAD_FAILED'|'APEX_ERROR'|'STALE_PACKET'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'ObserverFilerError'; this.code = code; Object.assign(this, extra) }
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
let policyCache = null
export function loadPolicyBundle(file = path.join(root, 'spec', 'policy-bundle.generated.json')) {
  if (!policyCache) policyCache = readJson(file)
  return policyCache
}
let campusCache = null
function campusPages() {
  if (!campusCache) campusCache = readJson(path.join(root, 'registry', 'campus-pages.json')).campuses
  return campusCache
}
const registryCache = new Map()
/** A playbook registry or spec by repository path, read once per process (tests reset with resetRegistryCache). */
export function loadRegistry(relative) {
  if (!registryCache.has(relative)) registryCache.set(relative, readJson(path.join(root, relative)))
  return registryCache.get(relative)
}
export function resetRegistryCache() { registryCache.clear(); campusCache = null }

// ---------------------------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------------------------

/** Read the packet artifact. `health.json` is optional until the observer writes it (workstream 5); the manifest's provider statuses stand in. */
export function loadRunFolder(dir) {
  const resolved = path.resolve(dir)
  const file = (name) => path.join(resolved, name)
  for (const name of ['manifest.json', 'findings.json', 'incidents.json']) {
    if (!fs.existsSync(file(name))) throw new ObserverFilerError('BAD_RUN_DIR', `${resolved} has no ${name}; expected the observer packet artifact (manifest.json, findings.json, incidents.json, optional health.json)`)
  }
  const manifest = readJson(file('manifest.json'))
  const findings = readJson(file('findings.json'))
  const incidents = readJson(file('incidents.json'))
  if (!Array.isArray(findings) || !Array.isArray(incidents)) throw new ObserverFilerError('BAD_RUN_DIR', 'findings.json and incidents.json must be arrays')
  if (!manifest.runId) throw new ObserverFilerError('BAD_RUN_DIR', 'manifest.json has no runId')
  const healthJson = fs.existsSync(file('health.json')) ? readJson(file('health.json')) : null
  return { dir: resolved, manifest, findings, incidents, incidentsById: new Map(incidents.map((i) => [i.id, i])), health: normalizeHealth(healthJson, manifest) }
}

/** The status under which a provider entry suppresses dependent rows, or null: degraded, failed, stale, or suppressFindings true. */
export function suppressingStatus(entry) {
  const status = typeof entry === 'string' ? entry : entry?.status
  if (entry && typeof entry === 'object' && entry.suppressFindings === true) return status || 'suppressed'
  return UNHEALTHY_STATUSES.includes(String(status || '').toLowerCase()) ? status : null
}

/**
 * Unhealthy sources by name, from health.json when present (keys are sourceHealth ids or provider entities), else from
 * the manifest's provider statuses. A source suppresses only when its status is degraded, failed or stale, or the observer
 * says `suppressFindings: true`; not-collected, optional and disabled sources never suppress (they measured nothing).
 * `suppressedByLoopHealth` is the observer's own count of findings it withheld under a loop-health row's `suppresses`.
 */
export function normalizeHealth(healthJson, manifest) {
  const unhealthy = {}
  const snapshots = {}
  const loopHealth = (value) => {
    if (Array.isArray(value)) return { count: value.length, items: value }
    if (Number.isFinite(value)) return { count: value, items: null }
    if (value && typeof value === 'object') return { count: Number.isFinite(value.count) ? value.count : Array.isArray(value.items) ? value.items.length : 0, items: Array.isArray(value.items) ? value.items : null }
    return { count: 0, items: null, reported: false }
  }
  if (healthJson && typeof healthJson === 'object') {
    const sources = healthJson.sources || healthJson.providers || {}
    for (const [name, entry] of Object.entries(sources)) {
      if (typeof entry === 'object' && (entry?.extractedAt || entry?.snapshotAt)) snapshots[name] = entry.extractedAt || entry.snapshotAt
      const status = suppressingStatus(entry)
      if (status) unhealthy[name] = { status, reason: (typeof entry === 'object' && (entry.reason || entry.error)) || null }
    }
    return { source: 'health.json', unhealthy, snapshots, suppressedByLoopHealth: loopHealth(healthJson.suppressedByLoopHealth) }
  }
  for (const [name, entry] of Object.entries(manifest?.providers || {})) {
    if (entry?.extractedAt || entry?.snapshotAt) snapshots[name] = entry.extractedAt || entry.snapshotAt
    const status = suppressingStatus(entry)
    if (status) unhealthy[name] = { status, reason: entry.reason || entry.error || null }
  }
  return { source: 'manifest.providers', unhealthy, snapshots, suppressedByLoopHealth: loopHealth(manifest?.suppressedByLoopHealth) }
}

/** The observer ran a verified copy of this bundle: its own grace and consecutive-run holds stand and the filer does not re-apply them. */
export function observerHoldsApply(manifest, bundle) {
  const record = manifest?.checkBundle
  if (!record || record.status !== 'verified') return false
  return !record.sha256 || !bundle?.sha256 || record.sha256 === bundle.sha256
}

/** Hours from `manifest.completedAt` to now past which --apply refuses the packet; the observer runs hourly, so six hours means today's runs. */
export const DEFAULT_MAX_PACKET_AGE_HOURS = 6
export const STALE_PACKET = 'STALE_PACKET'
/** The timestamp an observer run id ends in (site-full-2026-09-24T14-28-40-974Z, site-events-2026-09-25T13-26-58-882Z). */
const RUN_ID_TIMESTAMP = /(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/

/** The trailing timestamp of an observer run id, or null when the id carries none. */
export function runIdTimestamp(id) {
  const match = RUN_ID_TIMESTAMP.exec(String(id || ''))
  return match ? match[1] : null
}

/**
 * Order two observer run ids: by their trailing timestamps when both carry one (so site-events-2026-09-25T... is newer than
 * site-full-2026-09-24T... although "events" sorts before "full"), otherwise by the whole id. Negative when `a` is older
 * than `b`, zero when they are the same run, positive when `a` is newer.
 */
export function compareRunIds(a, b) {
  const ta = runIdTimestamp(a)
  const tb = runIdTimestamp(b)
  const [x, y] = ta && tb ? [ta, tb] : [String(a || ''), String(b || '')]
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * The packet freshness gate. Problems, one sentence each: `manifest.completedAt` missing, unparseable, or more than
 * `maxAgeHours` before `now`; `manifest.checkBundle.status` not `verified`; and, given `afterRunId` (the last applied run),
 * the packet's run id not newer than it by compareRunIds (equal: already applied; older: a newer packet was applied since).
 * `--apply` refuses on any problem (STALE_PACKET); a dry run reports them as warnings.
 */
export function assessPacketFreshness(manifest, { now = new Date(), maxAgeHours = DEFAULT_MAX_PACKET_AGE_HOURS, afterRunId = null } = {}) {
  const problems = []
  const completedAt = manifest?.completedAt || null
  const completed = completedAt ? new Date(completedAt) : null
  const ageHours = completed && !Number.isNaN(completed.getTime()) ? (now.getTime() - completed.getTime()) / 3_600_000 : null
  if (ageHours === null) problems.push(`manifest.completedAt is ${completedAt ? `not a datetime (${completedAt})` : 'missing'}`)
  else if (ageHours > maxAgeHours) problems.push(`packet completed ${completedAt}, ${ageHours.toFixed(1)} hours before ${now.toISOString()}; the limit is ${maxAgeHours} hours (--max-packet-age-hours)`)
  const bundleStatus = manifest?.checkBundle?.status || null
  if (bundleStatus !== 'verified') problems.push(`manifest.checkBundle.status is ${bundleStatus || 'missing'}, not verified`)
  const runId = manifest?.runId || null
  let order = null
  if (afterRunId) {
    order = compareRunIds(runId, afterRunId)
    if (order === 0) problems.push(`run ${runId} is the last applied run (--after-run-id ${afterRunId}); a packet is never applied twice`)
    else if (order < 0) problems.push(`run ${runId} is older than the last applied run ${afterRunId} (--after-run-id); an older packet is never applied after a newer one`)
  }
  return {
    fresh: problems.length === 0, problems, runId, completedAt, ageHours: ageHours === null ? null : Number(ageHours.toFixed(2)), maxAgeHours,
    bundleStatus, bundleSha256: manifest?.checkBundle?.sha256 || null, afterRunId: afterRunId || null, newerThanAfterRunId: order === null ? null : order > 0,
  }
}

/**
 * Consecutive failing runs the observer has seen this incident in: the incident's `consecutiveFailingRuns` (aeo PR 24)
 * when present; otherwise this run plus the previous run when the incident's run history names the manifest's previous
 * run id; otherwise one. Never the lifetime `occurrences`.
 */
export function consecutiveFailingRuns(incident, manifest) {
  if (!incident) return { runs: 1, basis: 'first seen in this run' }
  if (Number.isInteger(incident.consecutiveFailingRuns)) return { runs: incident.consecutiveFailingRuns, basis: 'incident consecutiveFailingRuns' }
  const history = [].concat(incident.runIds || incident.observedRunIds || incident.runHistory || incident.history || []).map((h) => (typeof h === 'string' ? h : h?.runId)).filter(Boolean)
  const previous = manifest?.previousRunId || manifest?.previousRun?.runId || null
  if (previous && history.includes(previous)) return { runs: 2, basis: `this run and the previous run ${previous} in the incident history` }
  return { runs: 1, basis: previous ? `previous run ${previous} not in the incident history` : 'no consecutiveFailingRuns and no previous run id in the manifest' }
}

/** Read and check the check bundle (`spec/check-bundle.generated.json`; a bare array or `{ rows }` is accepted for fixtures). Fails closed on a malformed row. */
export function loadCheckBundle(file) {
  const resolved = path.resolve(file)
  if (!fs.existsSync(resolved)) throw new ObserverFilerError('BAD_BUNDLE', `${resolved} does not exist; pass --bundle <check bundle> (spec/check-bundle.generated.json, tests/build-checks.mjs)`)
  const raw = readJson(resolved)
  const rows = Array.isArray(raw) ? raw : raw.rows || raw.checks
  if (!Array.isArray(rows)) throw new ObserverFilerError('BAD_BUNDLE', `${resolved}: expected { rows: [...] }`)
  const problems = []
  rows.forEach((row, index) => {
    for (const field of ROW_FIELDS) if (row[field] === undefined) problems.push(`row ${index} (${row.id || 'no id'}): missing ${field}`)
    if (!row.requirement && typeof row.requirementRef !== 'string') problems.push(`row ${index} (${row.id || 'no id'}): missing requirement (the requirement id)`)
    if (row.status && !['enforced', 'advisory'].includes(row.status)) problems.push(`row ${row.id}: status must be enforced or advisory, got ${row.status}`)
    if (row.channel && !CHANNELS.includes(row.channel)) problems.push(`row ${row.id}: channel must be ticket or loop-health, got ${row.channel}`)
    if (row.dedupeScope && !DEDUPE_SCOPES.includes(row.dedupeScope)) problems.push(`row ${row.id}: dedupeScope must be one of ${DEDUPE_SCOPES.join(', ')}, got ${row.dedupeScope}`)
    if (row.clearAfterRuns !== undefined && !(Number.isInteger(row.clearAfterRuns) && row.clearAfterRuns >= 1)) problems.push(`row ${row.id}: clearAfterRuns must be a positive integer`)
    if (row.gracePeriodHours !== undefined && !(Number.isFinite(row.gracePeriodHours) && row.gracePeriodHours >= 0)) problems.push(`row ${row.id}: gracePeriodHours must be a non-negative number`)
    if (row.requireConsecutiveRuns !== undefined && !(Number.isInteger(row.requireConsecutiveRuns) && row.requireConsecutiveRuns >= 1)) problems.push(`row ${row.id}: requireConsecutiveRuns must be a positive integer`)
  })
  const ids = rows.map((r) => r.id)
  for (const id of ids.filter((id, i) => ids.indexOf(id) !== i)) problems.push(`duplicate row id ${id}`)
  if (problems.length) throw new ObserverFilerError('BAD_BUNDLE', `${resolved}: ${problems.slice(0, 8).join('; ')}${problems.length > 8 ? ` (+${problems.length - 8} more)` : ''}`, { problems })
  const byCheck = new Map()
  for (const row of rows) { if (!byCheck.has(row.observerCheck)) byCheck.set(row.observerCheck, []); byCheck.get(row.observerCheck).push(row) }
  const retired = new Map((raw.retired || []).map((r) => [r.observerCheck, r]))
  return { file: resolved, version: raw.version || raw.bundleVersion || null, sha256: raw.sha256 || raw.bundleSha256 || null, rows, byCheck, sourceHealth: raw.sourceHealth || {}, retired }
}

/** Read an APEX export (array, or {tasks|items|data}) for offline dedupe and auto-resolve. */
export function loadQueue(file) {
  const raw = readJson(path.resolve(file))
  const tasks = Array.isArray(raw) ? raw : raw.tasks || raw.items || raw.data
  if (!Array.isArray(tasks)) throw new ObserverFilerError('BAD_QUEUE', `${file}: expected an array of APEX tasks or {tasks: [...]}`)
  return tasks.filter((t) => !/^(COMPLETED|CANCELLED|CANCELED)$/i.test(String(t.status || '')))
}

// ---------------------------------------------------------------------------------------------------------------
// Rows, scopes, owners
// ---------------------------------------------------------------------------------------------------------------

/** The coarse requirement a row belongs to (spec/observer-check-map.json), for the Playbook line only; never a key. */
export const requirementIdFor = (row) => row.requirement || (typeof row.requirementRef === 'string' ? row.requirementRef : row.id)
/** The row id minus its viewport suffix: the group and idempotency key, so desktop and mobile rows of one requirement merge and nothing else does. */
export const rowKeyFor = (row) => String(row.id).replace(/\.(?:desktop|mobile)$/, '')
export const channelFor = (row) => row.channel || 'ticket'

/** Conditions the finding declares (workstream 5 `conditions`), plus the ones the filer can derive from the finding itself. */
export function findingConditions(finding, now) {
  const declared = [].concat(finding.conditions || finding.suppressWhen || []).filter((c) => typeof c === 'string')
  const derived = []
  const actual = finding.actual && typeof finding.actual === 'object' && !Array.isArray(finding.actual) ? finding.actual : {}
  const end = actual.endsAt || actual.endAt || actual.end || actual.endDate || actual.end_time || finding.eventEndsAt
  if (end && !Number.isNaN(new Date(end).getTime()) && new Date(end) < now) derived.push('event-ended')
  if (actual.hiddenOnAllViewports === true || finding.hiddenOnAllViewports === true) derived.push('hidden-on-all-viewports')
  return [...new Set([...declared, ...derived])]
}

/**
 * The row a finding measures: rows for its check, narrowed by viewport when the rows name viewports, then by channel
 * (a loop-health variant of a check applies only when the finding carries that row's suppressWhen condition, e.g.
 * images-render with every-image-failed-in-run); enforced before advisory.
 */
export function rowForFinding(bundle, finding, now = new Date()) {
  let rows = bundle.byCheck.get(finding.check) || []
  if (!rows.length) return null
  const viewport = viewportFor(finding)
  const withViewport = rows.filter((r) => Array.isArray(r.viewports) && r.viewports.length)
  if (viewport && withViewport.length) rows = withViewport.filter((r) => r.viewports.includes(viewport)).concat(rows.filter((r) => !withViewport.includes(r)))
  if (rows.length > 1) {
    const conditions = findingConditions(finding, now)
    const loopHealth = rows.filter((r) => channelFor(r) === 'loop-health')
    const tickets = rows.filter((r) => channelFor(r) === 'ticket')
    if (loopHealth.length && tickets.length) {
      // The condition that turns a page finding into loop health sits on the ticket row's suppressWhen (images-render:
      // every-image-failed-in-run) or on the loop-health row itself.
      const turnsIntoLoopHealth = [...loopHealth, ...tickets].some((r) => (r.suppressWhen || []).some((c) => conditions.includes(c)))
      rows = turnsIntoLoopHealth ? loopHealth : tickets
    }
  }
  return rows.find((r) => r.status === 'enforced') || rows[0] || null
}

/** Any row for a check (for a ticket's clearAfterRuns): the enforced ticket row first. */
export function rowForCheck(bundle, check) {
  const rows = bundle.byCheck.get(check) || []
  return rows.find((r) => r.status === 'enforced' && channelFor(r) === 'ticket') || rows.find((r) => r.status === 'enforced') || rows[0] || null
}

export function isPublicPage(value) {
  try { return PUBLIC_HOSTS.includes(new URL(value).hostname.toLowerCase()) } catch { return false }
}

/** https only, no hash or query; public site pages get the canonical trailing slash, any other URL (a HubSpot record, a sheet, a workflow) keeps its path. */
export function normalizePageUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    url.hash = ''; url.search = ''; url.hostname = url.hostname.toLowerCase()
    if (PUBLIC_HOSTS.includes(url.hostname) && !url.pathname.endsWith('/')) url.pathname += '/'
    return url.toString()
  } catch { return null }
}

/** Scope slug for a page: the path on the public site (`home` for the root), host and path anywhere else (a sister site, a record). */
export function pageSlug(url) {
  const normalized = normalizePageUrl(url)
  if (!normalized) return null
  const parsed = new URL(normalized)
  const trimmed = parsed.pathname.replace(/^\/+|\/+$/g, '')
  if (PUBLIC_HOSTS.includes(parsed.hostname)) return trimmed || 'home'
  return `${parsed.hostname}${trimmed ? `/${trimmed}` : ''}`
}

export function programIdFor(finding) {
  const match = String(finding.entity || '').match(/program-(\d+)/) || String(finding.actual?.id || '').match(/program-(\d+)/)
  return match ? `program-${match[1]}` : null
}

export function viewportFor(finding) {
  const match = String(finding.entity || '').match(/-(desktop|mobile)$/)
  return match ? match[1] : (finding.evidenceImages || []).find((i) => i.viewport)?.viewport || finding.viewport || null
}

export function routeFor(finding) {
  return (finding.evidenceImages || []).find((i) => i.route)?.route || String(finding.entity || '').replace(/-(desktop|mobile)$/, '') || null
}

/** Group key per the row's dedupe scope. */
export function scopeKeyFor(row, finding) {
  switch (row.dedupeScope) {
    case 'page': return `page:${pageSlug(finding.url) || finding.entity || 'unknown'}`
    case 'template': return `template:${row.pageFamily || 'site'}`
    case 'program': return `program:${programIdFor(finding) || pageSlug(finding.url) || finding.entity || 'unknown'}`
    case 'event': return 'events'
    case 'site': return 'site'
    default: return `page:${pageSlug(finding.url) || finding.entity || 'unknown'}`
  }
}

export function idempotencyKeyFor(row, finding) { return `${IDEMPOTENCY_PREFIX}${rowKeyFor(row)}:${scopeKeyFor(row, finding)}` }

export function campusNameFor(url) {
  const normalized = normalizePageUrl(url)
  if (!normalized) return null
  const entry = Object.values(campusPages()).find((page) => normalizePageUrl(page.url) === normalized)
  return entry ? entry.names[0] : null
}

/** Registry slug for a public campus page URL, or null. */
export function campusSlugForUrl(url) {
  const normalized = normalizePageUrl(url)
  if (!normalized) return null
  return Object.entries(campusPages()).find(([, page]) => normalizePageUrl(page.url) === normalized)?.[0] || null
}

/** Registry slug for a growth-map program id (registry/campus-pages.json mapProgramIds), or null. */
export function campusSlugForProgram(programId) {
  if (!programId) return null
  return Object.entries(campusPages()).find(([, page]) => (page.mapProgramIds || []).includes(programId))?.[0] || null
}

/** Registry slug for a campus display name (any of the registry's names), or null. */
export function campusSlugForName(name) {
  const wanted = String(name || '').trim().toLowerCase()
  if (!wanted) return null
  return Object.entries(campusPages()).find(([, page]) => (page.names || []).some((n) => n.toLowerCase() === wanted))?.[0] || null
}

/** The campus a finding is about: its page in the registry, else its program id. */
export function campusSlugFor(finding) {
  return campusSlugForUrl(finding.url) || campusSlugForProgram(programIdFor(finding)) || null
}

/** The row's exemptionsRef entries (a string or an array since bundle 1.1), each `path[ key]`. */
export const exemptionsRefsFor = (row) => [].concat(row.exemptionsRef || []).filter((r) => typeof r === 'string' && r)
const readsRegistry = (row, file) => exemptionsRefsFor(row).some((ref) => ref.split(' ')[0] === file)

/** A campus-page row: pageFamily campus or one of the families it groups (campus-open, campus-announced). Such rows measure alpha.school campus pages only. */
export function isCampusPageRow(row, bundle) {
  if (row.pageFamily === 'campus') return true
  const members = bundle?.pageFamilies?.campus
  return Array.isArray(members) && members.includes(row.pageFamily)
}

/** Sister-site guard: a campus-page finding whose URL is on a host other than alpha.school is out of scope for this playbook (its own playbook files it). */
export function outOfScopeSite(row, finding, bundle) {
  if (!isCampusPageRow(row, bundle) || !finding.url) return null
  if (isPublicPage(finding.url)) return null
  let host = null
  try { host = new URL(finding.url).hostname.toLowerCase() } catch { host = String(finding.url).slice(0, 80) }
  return { reason: OUT_OF_SCOPE_SITE, host, url: finding.url }
}

/** The CTA (registry/campus-cta-exceptions.json ctas) a row belongs to, by row-key prefix, with the row's suffix (present, reachable, destination-campus, ...). */
export function ctaForRow(row, registry = loadRegistry(CTA_EXCEPTIONS_FILE)) {
  const key = rowKeyFor(row)
  for (const [cta, spec] of Object.entries(registry.ctas || {})) {
    for (const prefix of spec.rows || []) {
      if (key === prefix) return { cta, prefix, suffix: 'cta' }
      if (key.startsWith(`${prefix}.`)) return { cta, prefix, suffix: key.slice(prefix.length + 1) }
    }
  }
  return null
}

/** The campus's lifecycle state as the finding reports it (actual.programType, status, type, lifecycle; finding.lifecycle or state), else spec/campus-lifecycle.json, else null. */
export function lifecycleFor(finding, slug) {
  const actual = finding.actual && typeof finding.actual === 'object' && !Array.isArray(finding.actual) ? finding.actual : {}
  const states = ['Open', 'Announced', 'Pre-Announcement']
  for (const value of [actual.programType, actual.lifecycle, actual.type, actual.status, finding.programType, finding.lifecycle, finding.state]) {
    if (states.includes(value)) return { state: value, basis: 'finding' }
  }
  const entry = slug ? loadRegistry(LIFECYCLE_FILE).campuses?.[slug] : null
  const state = entry?.lifecycle || (entry?.mapPrograms || []).map((p) => p.programType).find((t) => states.includes(t)) || null
  return state ? { state, basis: `${LIFECYCLE_FILE} (generated ${loadRegistry(LIFECYCLE_FILE).generatedAt || 'n/a'})` } : { state: null, basis: 'unknown' }
}

/**
 * The CTA exception that applies to this finding, if any: the row reads registry/campus-cta-exceptions.json through its
 * exemptionsRef, the finding's campus and the row's CTA carry an entry, the entry's rule covers the row's suffix, and the
 * entry has not expired (ISO date: ends at the start of that UTC day; lifecycle:Open: ends when the campus is Open, read from
 * the finding, else spec/campus-lifecycle.json; unknown state keeps the exception and says so; null: standing). Returns
 * { exempt: true, ... } when it applies, { exempt: false, expired | notCovered, ... } when an entry exists but does not, null otherwise.
 */
export function ctaExceptionFor({ row, finding, now = new Date(), registry = loadRegistry(CTA_EXCEPTIONS_FILE) }) {
  if (!readsRegistry(row, CTA_EXCEPTIONS_FILE)) return null
  const cta = ctaForRow(row, registry)
  if (!cta) return null
  const slug = campusSlugFor(finding)
  const entry = slug ? registry.campuses?.[slug]?.[cta.cta] : null
  if (!entry) return null
  const base = { slug, campus: campusPages()[slug]?.names?.[0] || slug, cta: cta.cta, rule: entry.rule, reason: entry.reason, decidedBy: entry.decidedBy, source: entry.source, decidedOn: entry.decidedOn, expires: entry.expires ?? null, row: row.id, suffix: cta.suffix }
  let expired = null
  if (typeof entry.expires === 'string' && /^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(entry.expires)) {
    if (now.getTime() >= new Date(`${entry.expires}T00:00:00Z`).getTime()) expired = `expired on ${entry.expires}`
    base.expiryBasis = `ends ${entry.expires}`
  } else if (entry.expires === 'lifecycle:Open') {
    const lifecycle = lifecycleFor(finding, slug)
    if (lifecycle.state === 'Open') expired = `campus is Open (${lifecycle.basis}); the exception ended when the HubSpot Program type became Open`
    base.expiryBasis = lifecycle.state ? `ends when the Program type becomes Open; state ${lifecycle.state} per ${lifecycle.basis}` : 'ends when the Program type becomes Open; state unknown to the filer, exception kept'
  } else base.expiryBasis = 'standing until a recorded decision revokes it'
  if (expired) return { ...base, exempt: false, expired }
  const suffixes = registry.rules?.[entry.rule]?.exemptsRowSuffixes || []
  if (!suffixes.includes('*') && !suffixes.includes(cta.suffix)) return { ...base, exempt: false, notCovered: `rule ${entry.rule} exempts ${suffixes.join(', ')} rows, not ${cta.suffix}` }
  return { ...base, exempt: true }
}

/** Text a finding carries about the image or copy it flagged (alt, src, nearby text, name), for the shared-leadership exemption. */
function findingText(finding) {
  const actual = finding.actual
  if (typeof actual === 'string') return actual
  if (!actual || typeof actual !== 'object') return ''
  const values = Array.isArray(actual) ? actual : [actual]
  return values.flatMap((v) => (v && typeof v === 'object' ? [v.alt, v.src, v.nearbyText, v.name, v.text, v.title] : [v])).filter((v) => typeof v === 'string').join(' ')
}

/**
 * Shared-leadership exemption (registry/campus-leadership.json groups): the finding's page belongs to a campus group, the
 * text of the flagged image or copy names a person listed as the group's shared leadership, and the campus it references
 * (actual.campus, or a group campus named in the text) is a sibling in the same group. Rows opt in through exemptionsRef.
 */
export function sharedLeadershipExemption({ row, finding, registry = loadRegistry(LEADERSHIP_FILE) }) {
  if (!readsRegistry(row, LEADERSHIP_FILE)) return null
  const slug = campusSlugFor(finding)
  if (!slug) return null
  const text = findingText(finding)
  if (!text) return null
  // The observer aggregates every conflict on a page into one finding (aeo PR 26), so `actual` may be an array of
  // { campus, src, alt, ... } entries; the referenced campus comes from any entry's `campus`, else from the text.
  const entries = Array.isArray(finding.actual) ? finding.actual : (finding.actual && typeof finding.actual === 'object' ? [finding.actual] : [])
  const referencedFromActual = entries.map((e) => campusSlugForName(e?.campus)).find(Boolean)
  for (const [groupId, group] of Object.entries(registry.groups || {})) {
    if (groupId.startsWith('$') || !(group.campuses || []).includes(slug)) continue
    const person = (group.sharedLeadership || []).find((p) => p?.name && text.toLowerCase().includes(String(p.name).toLowerCase()))
    if (!person) continue
    const referenced = referencedFromActual || (group.campuses || []).find((sibling) => sibling !== slug && (campusPages()[sibling]?.names || []).some((n) => text.toLowerCase().includes(n.toLowerCase())))
    if (!referenced || !(group.campuses || []).includes(referenced)) continue
    return { group: groupId, groupLabel: group.label || groupId, person: person.name, role: person.role || null, campus: slug, sibling: referenced, row: row.id, reason: `${person.name} is shared leadership for ${group.label || groupId} (${(group.campuses || []).join(', ')}); a card naming ${campusPages()[referenced]?.names?.[0] || referenced} on ${campusPages()[slug]?.names?.[0] || slug} is the decided state` }
  }
  return null
}

/** Campus name for a growth-map program id through registry/campus-pages.json mapProgramIds. */
export function campusNameForProgram(programId) {
  if (!programId) return null
  const entry = Object.values(campusPages()).find((page) => (page.mapProgramIds || []).includes(programId))
  return entry ? entry.names[0] : null
}

/** Owner for a role through the policy bundle; unnamed roles escalate to the website agent operator (protocol 1d). */
export function ownerFor(policy, role) {
  const named = (r) => (policy.roleOwners?.[r] || []).find((o) => o.apexUserId)
  const direct = role ? named(role) : null
  if (direct) return { id: direct.apexUserId, name: direct.name, role, via: role, escalated: false }
  const fallbackRole = role ? policy.roleFallback?.[role] : null
  const fallback = fallbackRole ? named(fallbackRole) : null
  if (fallback) return { id: fallback.apexUserId, name: fallback.name, role: fallbackRole, via: `${role} -> ${fallbackRole}`, escalated: false }
  const operator = named(OPERATOR_ROLE)
  return { id: operator?.apexUserId || null, name: operator?.name || 'Matt Barge', role: OPERATOR_ROLE, via: `${role || 'no role'} -> ${OPERATOR_ROLE}`, escalated: true }
}

export function defectClassFor(ticketClass) {
  if (/^(hubspot-data|sheet-data|observer-fact-sync|observer-event|program-info)$/.test(ticketClass)) return 'data'
  if (/^sync-mapping$/.test(ticketClass)) return 'mapping'
  if (/^(sync-delivery|observer-health)$/.test(ticketClass)) return 'delivery'
  return 'presentation'
}

// ---------------------------------------------------------------------------------------------------------------
// Suppression: source health, loop-health findings, conditions
// ---------------------------------------------------------------------------------------------------------------

/** Names under which a sourceHealth id may be reported: the id, its provider entity (and the entity without an -api suffix), its registry key. */
function healthNames(bundle, sourceId) {
  const source = bundle.sourceHealth?.[sourceId] || {}
  const names = [sourceId, source.providerEntity, source.providerEntity ? source.providerEntity.replace(/-api$/, '') : null, source.registryKey]
  return [...new Set(names.filter(Boolean))]
}

/** Dependencies of a row that the run reports unhealthy or stale (sourceHealth[].staleAfterHours against the provider's snapshot time). */
export function unhealthyDependencies(row, bundle, health, now = new Date()) {
  const out = []
  for (const sourceId of [].concat(row.sourceHealthDependency || []).filter(Boolean)) {
    const names = healthNames(bundle, sourceId)
    const hit = names.find((n) => health.unhealthy[n])
    if (hit) { out.push({ source: sourceId, reportedAs: hit, ...health.unhealthy[hit] }); continue }
    const staleAfter = bundle.sourceHealth?.[sourceId]?.staleAfterHours
    const snapshotName = names.find((n) => health.snapshots?.[n])
    if (staleAfter && snapshotName) {
      const ageHours = (now.getTime() - new Date(health.snapshots[snapshotName]).getTime()) / 3_600_000
      if (ageHours > staleAfter) out.push({ source: sourceId, reportedAs: snapshotName, status: 'stale', reason: `snapshot ${health.snapshots[snapshotName]} is ${ageHours.toFixed(1)} h old; sourceHealth allows ${staleAfter} h` })
    }
  }
  return out
}

// Loop-health suppression (a loop-health row's `suppresses`) is the observer's: it withholds the findings itself and
// reports the count in health.json suppressedByLoopHealth. The filer no longer expects loop-health items in findings.json;
// any that arrive are counted for the observer owner (never filed) and nothing here is suppressed on their account.

// ---------------------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------------------

export function formatFact(value, depth = 0) {
  if (value === null || value === undefined) return 'n/a'
  if (typeof value === 'string') return cleanText(value).trim() || 'empty'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (!value.length) return 'none'
    const items = value.slice(0, 3).map((item) => formatFact(item, depth + 1))
    return `${items.join('; ')}${value.length > 3 ? ` (+${value.length - 3} more)` : ''}`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== '')
    // An object whose every value is null or empty (a missing CTA: { href: null }) still needs a word on the Observed line.
    if (!entries.length) return Object.keys(value).length ? `${Object.keys(value).join(', ')} empty` : 'empty'
    if (depth >= 2) return entries.map(([k]) => k).join(', ')
    return entries.slice(0, 8).map(([k, v]) => `${k} ${formatFact(v, depth + 1)}`).join(', ')
  }
  return String(value)
}

export function renderExpected(row) {
  const e = row.expected
  if (e && typeof e === 'object' && !Array.isArray(e)) {
    if (e.literal !== undefined) return formatFact(e.literal)
    if (e.derive) return `derived from ${e.derive.source} ${[].concat(e.derive.field || []).join(', ')} (${e.derive.transform})${e.derive.neverFields?.length ? `; never ${e.derive.neverFields.join(', ')}` : ''}`
  }
  return formatFact(e)
}

export function renderComparator(row) {
  const c = row.comparator
  if (c && typeof c === 'object') return `${c.type}${c.threshold !== undefined ? ` ${c.threshold} ${c.unit || ''}`.trimEnd() : ''}${c.orThreshold !== undefined ? ` or ${c.orThreshold} ${c.orUnit || ''}`.trimEnd() : ''}`
  return formatFact(c)
}

export function renderRequirementRef(row) {
  const r = row.requirementRef
  if (r && typeof r === 'object') return `${r.file || ''} ${r.key || ''}`.trim()
  return String(r || requirementIdFor(row))
}

function truncate(value, max) { const s = cleanText(value); return s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...` }

function sourceLine(group, run) {
  const names = [...new Set(group.findings.flatMap((f) => [f.expectedSource, f.actualSource].filter(Boolean).map(cleanText)))]
  const providers = run.manifest.providers || {}
  const reads = [...new Set(group.findings.map((f) => f.sourceReadAt).filter(Boolean))]
  const readAt = reads[0] || Object.values(providers).map((p) => p?.completedAt).filter(Boolean).sort().at(-1) || run.manifest.completedAt
  if (!names.length) return `observer run ${run.manifest.runId} (read ${readAt}); the finding names no source system`
  return `${names.join(' vs ')} (read ${readAt}, observer run ${run.manifest.runId})`
}

/** The campus display name for a finding's page or program id, else null; a bare program id is never a title. */
function campusDisplayName(finding, pages = []) {
  return campusNameFor(pages[0]) || campusNameFor(finding.url) || campusNameForProgram(programIdFor(finding)) || null
}

function scopeLabel(row, group) {
  const pages = group.pages
  const first = group.findings[0]
  switch (row.dedupeScope) {
    case 'page': return campusDisplayName(first, pages) || (pages[0] ? pageSlug(pages[0]) : (first.url ? pageSlug(first.url) : null)) || (programIdFor(first) ? `unregistered program ${programIdFor(first)}` : first.entity)
    case 'template': return `Shared ${row.pageFamily || 'site'} template (${pages.length} page${pages.length === 1 ? '' : 's'})`
    case 'program': return campusDisplayName(first, pages) || first.actual?.name || (programIdFor(first) ? `unregistered program ${programIdFor(first)}` : first.entity)
    case 'event': return `${group.findings.length} event${group.findings.length === 1 ? '' : 's'}`
    case 'site': return `Site (${group.findings.length} finding${group.findings.length === 1 ? '' : 's'})`
    default: return group.findings[0].entity
  }
}

function fixPathFor(policy, row) {
  const cls = policy.classes?.[row.ticketClass] || {}
  const executes = cls.executes || row.ownerRole
  const step = (cls.steps || [])[0]
  return `${executes} changes it${step?.adapter ? ` through the ${step.adapter} path` : ''}; evidence profile ${[].concat(row.evidenceProfile || []).join(', ') || 'none named'}; the observer rerun clears check ${row.observerCheck}`
}

function doneWhenFor(policy, row) {
  const cls = policy.classes?.[row.ticketClass] || {}
  const clearAfter = row.clearAfterRuns || DEFAULT_CLEAR_AFTER_RUNS
  return `${cls.doneWhen || 'the public page meets the requirement'}; the filer closes this ticket when observer check ${row.observerCheck} stays clear for ${clearAfter} consecutive runs`
}

/** Contract object for a group; rendered by renderObserverBody and checked with contractCheck. */
export function buildContract({ row, group, run, bundle, owner, policy, now, related = [] }) {
  const first = group.findings[0]
  const n = group.findings.length
  const observed = group.findings.slice(0, 10).map((f) => {
    const where = row.dedupeScope === 'page' ? '' : `${campusNameFor(f.url) || f.actual?.name || pageSlug(f.url) || f.entity}${viewportFor(f) ? ` (${viewportFor(f)})` : ''}: `
    return `${where}${truncate(formatFact(f.actual), 220)}`
  })
  const more = n > 10 ? ` (+${n - 10} more; every observer id is listed under Evidence)` : ''
  const date = now.toISOString().slice(0, 10)
  const rowIds = group.rows.map((r) => r.id)
  return {
    claim: truncate(`${cleanText(scopeLabel(row, group))}: fails "${cleanText(row.title)}"${n > 1 ? ` (${n} findings)` : ''}`, 180),
    page: group.pages[0] || null,
    pages: group.pages,
    events: row.dedupeScope === 'event' ? group.findings.map((f) => cleanText(f.title)) : [],
    element: cleanText(row.element),
    observed: `${observed.join(' | ')}${more}`,
    expected: `${renderExpected(row)} (${requirementIdFor(row)}; ${renderComparator(row)}; severity ${row.severity})`,
    source: sourceLine(group, run),
    class: row.ticketClass,
    defectClass: defectClassFor(row.ticketClass),
    ownerRole: row.ownerRole,
    ownerName: owner.name,
    escalation: owner.escalated ? renderTemplate('escalation', { role: row.ownerRole, escalatedTo: owner.name, operatorRole: OPERATOR_ROLE, system: policy.classes?.[row.ticketClass]?.executes || row.ownerRole }) : null,
    fixPath: fixPathFor(policy, row),
    doneWhen: doneWhenFor(policy, row),
    evidence: `observer check ${row.observerCheck} run ${run.manifest.runId} (${run.manifest.completedAt}); observer ids ${group.findings.map((f) => f.id).join(', ')}; packet evidence sha256 ${run.manifest.evidence?.sha256 || 'n/a'}; screenshot pair attached with agent/attach-evidence.mjs where the artifact carries it`,
    exemptions: exemptionsRefsFor(row).length ? `${exemptionsRefsFor(row).join(', ')}${row.exemptions?.length ? ` (${row.exemptions.join('; ')})` : ''}` : null,
    related,
    playbook: `${rowKeyFor(row)} (requirement ${requirementIdFor(row)}, ${renderRequirementRef(row)}); check bundle ${bundle.version || 'unversioned'} row${rowIds.length === 1 ? '' : 's'} ${rowIds.join(', ')}`,
    severity: row.severity,
    history: [`${date} agent/file-observer-findings.mjs ${FILER_VERSION}: filed from observer run ${run.manifest.runId} (${n} finding${n === 1 ? '' : 's'}, scope ${row.dedupeScope})`],
    reason: `${row.dedupeScope}-scoped ${row.status} check ${row.observerCheck}; ${first.summary ? truncate(first.summary, 240) : row.title}`,
  }
}

/** Ticket body with the contract's labelled lines (Page, Element, Observed, Expected, Source, Fix path, Done when, Evidence): spec/ticket-templates.json template observerBody. */
export function renderObserverBody(c) {
  return renderTemplate('observerBody', {
    ownerName: c.ownerName || c.ownerRole,
    ownerRole: c.ownerRole,
    fixPath: c.fixPath,
    claim: c.claim,
    page: c.page || null,
    pages: c.pages.length > 1 ? c.pages : null,
    pagesCount: c.pages.length,
    events: c.events.length ? c.events.join(' | ') : null,
    eventsCount: c.events.length,
    element: c.element,
    observed: c.observed,
    expected: c.expected,
    source: c.source,
    defectClass: c.defectClass,
    reason: c.reason,
    class: c.class,
    escalation: c.escalation || null,
    doneWhen: c.doneWhen,
    evidence: c.evidence,
    exemptions: c.exemptions || null,
    related: c.related?.length ? c.related : null,
    playbook: c.playbook,
    history: c.history,
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Observer ids on existing tickets
// ---------------------------------------------------------------------------------------------------------------

/** Every observer incident id an APEX ticket carries (checkId, observerIds, externalId, idempotencyKey, description, title). */
export function observerIdsForTask(task) {
  const cf = task.customFields || {}
  const values = [cf.checkId, ...(Array.isArray(cf.observerIds) ? cf.observerIds : [cf.observerIds]), cf.externalId, cf.idempotencyKey, task.description, task.title]
  const ids = new Set()
  for (const value of values) if (value) for (const m of String(value).matchAll(OBSERVER_ID)) ids.add(m[0].toUpperCase())
  return [...ids]
}

function textLines(text) {
  return String(text || '').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').split(/\r?\n/).map((l) => l.trim())
}

/**
 * Auto-resolution authority is opt-in and provenance-based (PR 26): only a ticket this filer created, proven by the exact
 * `filedBy` marker and a non-empty `filerRunId`. SITE ids identify incidents, not the actor that filed a ticket, and a
 * legacy observer ticket (customFields.source alpha-site-qc) is a person's to close.
 */
export function isFilerOwnedTask(task) {
  const cf = task?.customFields || {}
  return cf.filedBy === FILED_BY && typeof cf.filerRunId === 'string' && cf.filerRunId.trim().length > 0
}

/** The observer's own tickets (source alpha-site-qc) and the filer's: what the queue counts as observer tickets for reporting. */
export function isObserverTicket(task) {
  const cf = task?.customFields || {}
  return cf.source === OBSERVER_SOURCE || isFilerOwnedTask(task) || observerIdsForTask(task).length > 0 || String(cf.idempotencyKey || '').startsWith(IDEMPOTENCY_PREFIX)
}

/** The first OPERATOR INSTRUCTION, CORRECTION or DECISION NEEDED line on the ticket (description, comments, agent instructions), or null. */
export function instructionLine(task) {
  const texts = [task.description, ...(task.comments || []).map((c) => c?.body ?? c?.text), ...(task.agentInstructions || []).filter((i) => !i?.status || ['PENDING', 'ACKNOWLEDGED'].includes(i.status)).map((i) => i?.body)]
  for (const text of texts) {
    const line = textLines(text).find((l) => INSTRUCTION_LINE.test(l))
    if (line) return line.slice(0, 200)
  }
  return null
}

/** A BLOCKED status the filer may still close: its own protocol 1d escalation (the ticket was created BLOCKED with the escalation line in its body), or intake's block (intake's custom fields are on the ticket). A person's BLOCKED is neither. */
function blockedByIntakeOrFiler(task) {
  const cf = task.customFields || {}
  const escalatedAtCreation = /has no registered APEX user; escalated to [^\n]* per protocol 1d/.test(String(task.description || ''))
  return escalatedAtCreation || Boolean(cf.intakeHash || cf.intakePendingHash || cf.intakeDecision || cf.intakeVersion)
}

/** A note a person wrote on the ticket: any comment, or a headed note whose actor is neither intake nor an agent script. */
function humanNote(task) {
  if ((task.comments || []).length) return `${task.comments.length} comment${task.comments.length === 1 ? '' : 's'} on the ticket`
  const header = textLines(task.description).find((l) => /^(?:BLOCKED|RESOLUTION|MISSING INFO|CLAIMED|NOTE|HOLD|SOURCE FIX|AUDIT)\b[^(]*\(([^)]*)\)/.test(l) && !/\((?:intake\b|agent\/)/i.test(l))
  return header ? header.slice(0, 120) : null
}

/**
 * May the filer close this ticket on its own (rule 10)? Only a ticket this filer created (isFilerOwnedTask), in NOT_STARTED
 * or BLOCKED by the filer's own escalation or by intake with no human note, that no check row waits on (decisionPending)
 * and that carries no OPERATOR INSTRUCTION, CORRECTION or DECISION NEEDED line. Everything else is a person's to close.
 */
export function resolveEligibility(task, { decisionTickets = new Set() } = {}) {
  const filedBy = isFilerOwnedTask(task) ? 'filer' : null
  if (!filedBy) return { eligible: false, reason: NOT_FILER_OWNED }
  if (decisionTickets.has(task.id)) return { eligible: false, filedBy, reason: 'a check row waits on this ticket (decisionPending); the decision closes it' }
  const instruction = instructionLine(task)
  if (instruction) return { eligible: false, filedBy, reason: `carries an instruction line ("${instruction.slice(0, 80)}")` }
  const status = String(task.status || '')
  if (status === 'NOT_STARTED') return { eligible: true, filedBy }
  if (status === 'BLOCKED') {
    if (!blockedByIntakeOrFiler(task)) return { eligible: false, filedBy, reason: 'BLOCKED by a person, not by intake or the filer' }
    const note = humanNote(task)
    if (note) return { eligible: false, filedBy, reason: `BLOCKED with a human note (${note})` }
    return { eligible: true, filedBy }
  }
  return { eligible: false, filedBy, reason: `status ${status || 'unknown'} belongs to a person (only ${RESOLVABLE_STATUSES.join(' or ')} auto-resolves)` }
}

/** A clean-run clear: resolved by the observer after at least clearAfterRuns clean runs, with no other resolution reason (superseded-evidence-version, a hand decision). */
export function isCleanRunClear(incident, clearAfterRuns) {
  if (!incident || incident.status !== 'resolved') return false
  if (incident.resolutionReason) return false
  return (incident.cleanRuns ?? 0) >= clearAfterRuns
}

function taskPages(task) {
  const cf = task.customFields || {}
  return [task.url, cf.pageUrl, cf.targetPageUrl, ...String(task.description || '').match(/https:\/\/alpha\.school\/[^\s,)]*/g) || []].map(normalizePageUrl).filter(Boolean)
}

// ---------------------------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------------------------

/** Rows whose evidence profile names an observer screenshot: a browser-derived finding files only with its complete desktop and mobile pair (PR 26). */
function requiresObserverScreenshot(row) {
  return (row.evidenceProfile || []).some((profile) => String(profile).startsWith('observer-screenshot-'))
}

function evidencePairs(run, group) {
  const pairs = []
  const seen = new Set()
  for (const finding of group.findings) {
    for (const image of finding.evidenceImages || []) {
      if (image?.kind !== 'screenshot' || !image.path || !image.route) continue
      const route = image.route
      if (seen.has(route)) continue
      seen.add(route)
      const desktop = path.join(run.dir, 'screenshots', `${route}-desktop.png`)
      const mobile = path.join(run.dir, 'screenshots', `${route}-mobile.png`)
      const page = normalizePageUrl(image.url || finding.url)
      const both = fs.existsSync(desktop) && fs.existsSync(mobile)
      pairs.push({ route, page, desktop, mobile, complete: Boolean(both && page), reason: !page ? 'no https page url' : (both ? null : 'desktop and mobile pair not both in the artifact') })
    }
  }
  return pairs
}

/**
 * Plan what this packet files and resolves. Pure: reads the run folder and queue, writes nothing.
 * Returns files (new tickets), existing (deduped), decisionPending (rows waiting on a ticket), held (grace, consecutive
 * runs), suppressed, loopHealth, dropped, advisory, resolves (open tickets to close), and unresolved (open observer
 * tickets that cannot close yet, with the reason).
 */
export function planObserverFindings({ run, bundle, queue = [], policy = loadPolicyBundle(), now = new Date() }) {
  const holdsByObserver = observerHoldsApply(run.manifest, bundle)
  const plan = { filerVersion: FILER_VERSION, runId: run.manifest.runId, runCompletedAt: run.manifest.completedAt, evidenceSha256: run.manifest.evidence?.sha256 || null, bundleVersion: bundle.version, bundleSha256: bundle.sha256, health: run.health, now: now.toISOString(),
    holds: holdsByObserver ? 'observer (manifest.checkBundle verified; grace and consecutive-run holds not re-applied)' : 'filer (no verified check bundle in the manifest)',
    suppressedByObserver: run.health.suppressedByLoopHealth || { count: 0, items: null, reported: false },
    decisionTickets: [...new Set(bundle.rows.map((r) => r.decisionPending).filter(Boolean))],
    counts: {}, files: [], existing: [], decisionPending: [], held: [], suppressed: [], exempted: [], exceptionsNotApplied: [], outOfScope: [], loopHealth: [], dropped: [], advisory: [], invalid: [], resolves: [], needsPerson: [], unresolved: [] }

  // Pass 1: rows. A loop-health finding that still arrives is counted for the observer owner and never files; the
  // observer applies its own `suppresses` before the packet is written (health.json suppressedByLoopHealth).
  const assessed = []
  for (const finding of run.findings) {
    const row = rowForFinding(bundle, finding, now)
    if (!row) {
      const retired = bundle.retired.get(finding.check)
      plan.dropped.push({ id: finding.id, check: finding.check, reason: retired ? `retired: ${truncate(retired.reason, 160)}` : 'no row in the check bundle (telemetry)' })
      continue
    }
    if (channelFor(row) === 'loop-health') {
      plan.loopHealth.push({ id: finding.id, check: finding.check, row: row.id, entity: finding.entity, severity: finding.severity, decisionPending: row.decisionPending || null })
      continue
    }
    assessed.push({ finding, row })
  }

  // Pass 2: advisory, the sister-site guard, named exceptions (CTA decisions, shared leadership), suppression, holds (unless
  // the observer's verified bundle already applied them), then grouping by key.
  const groups = new Map()
  for (const { finding, row } of assessed) {
    if (row.status === 'advisory') { plan.advisory.push({ id: finding.id, check: finding.check, row: row.id }); continue }
    const offSite = outOfScopeSite(row, finding, bundle)
    if (offSite) { plan.outOfScope.push({ id: finding.id, check: finding.check, row: row.id, ...offSite }); continue }
    const ctaException = ctaExceptionFor({ row, finding, now })
    if (ctaException?.exempt) { plan.exempted.push({ id: finding.id, check: finding.check, row: row.id, page: normalizePageUrl(finding.url), kind: 'cta-exception', ...ctaException }); continue }
    if (ctaException) plan.exceptionsNotApplied.push({ id: finding.id, check: finding.check, row: row.id, page: normalizePageUrl(finding.url), kind: 'cta-exception', ...ctaException })
    const leadership = sharedLeadershipExemption({ row, finding })
    if (leadership) { plan.exempted.push({ id: finding.id, check: finding.check, row: row.id, page: normalizePageUrl(finding.url), kind: 'shared-leadership', ...leadership }); continue }
    const unhealthy = unhealthyDependencies(row, bundle, run.health, now)
    if (unhealthy.length) { plan.suppressed.push({ id: finding.id, check: finding.check, row: row.id, reason: 'source health', sources: unhealthy }); continue }
    if (requiresObserverScreenshot(row)) {
      const evidence = evidencePairs(run, { findings: [finding] })
      if (!evidence.some((pair) => pair.complete)) { plan.suppressed.push({ id: finding.id, check: finding.check, row: row.id, reason: 'required browser evidence missing', evidence }); continue }
    }
    const conditions = findingConditions(finding, now)
    const matched = (row.suppressWhen || []).filter((c) => conditions.includes(c))
    if (matched.length) { plan.suppressed.push({ id: finding.id, check: finding.check, row: row.id, reason: 'condition', conditions: matched }); continue }
    const incident = run.incidentsById.get(finding.id) || null
    const firstSeen = incident?.firstSeenAt || run.manifest.startedAt || run.manifest.completedAt
    const consecutive = consecutiveFailingRuns(incident, run.manifest)
    if (!holdsByObserver) {
      const ageHours = (now.getTime() - new Date(firstSeen).getTime()) / 3_600_000
      if (row.gracePeriodHours > 0 && ageHours < row.gracePeriodHours) { plan.held.push({ id: finding.id, check: finding.check, row: row.id, reason: 'grace period', firstSeenAt: firstSeen, ageHours: Number(ageHours.toFixed(2)), gracePeriodHours: row.gracePeriodHours }); continue }
      const needRuns = row.requireConsecutiveRuns || 1
      if (needRuns > 1 && consecutive.runs < needRuns) { plan.held.push({ id: finding.id, check: finding.check, row: row.id, reason: 'consecutive runs', observations: consecutive.runs, basis: consecutive.basis, requireConsecutiveRuns: needRuns }); continue }
    }
    const key = idempotencyKeyFor(row, finding)
    if (!groups.has(key)) groups.set(key, { key, row, rows: [row], scopeKey: scopeKeyFor(row, finding), findings: [], pages: [] })
    const group = groups.get(key)
    if (!group.rows.includes(row)) group.rows.push(row)
    // A packet may repeat an incident id (one finding per viewport image, say); a scope counts each incident once.
    if (!group.findings.some((current) => current.id === finding.id)) group.findings.push({ ...finding, firstSeenAt: firstSeen, consecutiveFailingRuns: consecutive.runs })
    const page = isPublicPage(finding.url) ? normalizePageUrl(finding.url) : null
    if (page && !group.pages.includes(page)) group.pages.push(page)
  }

  const observedThisRun = new Set(run.findings.map((f) => f.id))
  planResolves(plan, { run, bundle, queue, now, observedThisRun, decisionTickets: new Set(plan.decisionTickets) })
  // A ticket this run completes is not a duplicate candidate: a scope that clears and reappears in the same packet files again.
  const resolvedIds = new Set(plan.resolves.map((r) => r.id))
  const openTasks = queue.filter((t) => !resolvedIds.has(t.id))
  const openIds = new Set(queue.map((t) => t.id))

  for (const group of groups.values()) {
    const { row } = group
    const ids = new Set(group.findings.map((f) => f.id))
    // A row waiting on a decision files nothing new while that ticket is open; once it is decided (closed) the row files
    // again and names the decision ticket under Related.
    const decision = group.rows.map((r) => r.decisionPending).find(Boolean)
    if (decision && openIds.has(decision)) {
      plan.decisionPending.push({ key: group.key, rows: group.rows.map((r) => r.id), check: row.observerCheck, scope: row.dedupeScope, scopeKey: group.scopeKey, findings: group.findings.length, observerIds: [...ids], pages: group.pages, decisionTicket: decision })
      continue
    }
    const owner = ownerFor(policy, row.ownerRole)
    const contract = buildContract({ row, group, run, bundle, owner, policy, now, related: decision ? [decision] : [] })
    const body = cleanText(renderObserverBody(contract))
    const payload = {
      title: cleanText(contract.claim),
      description: body,
      url: contract.page || group.findings[0].url || null,
      requestType: 'Website QC',
      workflow: 'website-maintenance',
      program: [campusNameFor(contract.page) || 'Alpha School'],
      requesterEmail: process.env.APEX_QC_REQUESTER_EMAIL || 'matthew.barge@superbuilders.school',
      status: owner.escalated ? 'BLOCKED' : 'NOT_STARTED',
      priority: /^(critical|high)$/i.test(String(row.severity)) ? 'HIGH' : 'NORMAL',
      // APEX PR 409: checkId is the observer SITE-* id (the lead finding's; observerIds carries the whole scope), filerRunId,
      // requirementId and checkBundleVersion mark the ticket filer-owned; the class lives in triagedClass and the body's Class line.
      customFields: {
        source: FILER_SOURCE, requestFamily: 'website', filedBy: FILED_BY, filerVersion: FILER_VERSION,
        checkId: group.findings[0].id, triagedClass: row.ticketClass, defectClass: contract.defectClass, ownerRole: row.ownerRole, contractVersion: '1.0', element: row.element,
        idempotencyKey: group.key, observerCheck: row.observerCheck, observerIds: group.findings.map((f) => f.id), checkRowIds: group.rows.map((r) => r.id),
        requirementId: rowKeyFor(row), checkBundleVersion: bundle.version || '', checkBundleSha256: bundle.sha256 || '',
        filerRunId: run.manifest.runId, runId: run.manifest.runId, severity: row.severity, dedupeScope: row.dedupeScope,
        pageUrl: contract.page || '', pages: group.pages, history: contract.history,
      },
    }
    const check = contractCheck({ ...payload, id: 'planned', assignees: [{ name: owner.name }] })
    if (!check.valid) { plan.invalid.push({ key: group.key, title: payload.title, missing: check.missing }); continue }
    const dup = findOpenDuplicate(openTasks, { group, row, payload, ids })
    const entry = { key: group.key, rows: group.rows.map((r) => r.id), check: row.observerCheck, scope: row.dedupeScope, scopeKey: group.scopeKey, title: payload.title, findings: group.findings.length, observerIds: [...ids], pages: group.pages, owner, evidence: evidencePairs(run, group), payload }
    if (dup) { plan.existing.push({ ...entry, existing: { id: dup.task.id, status: dup.task.status, title: dup.task.title, via: dup.via }, payload: undefined }); continue }
    plan.files.push(entry)
  }

  plan.counts = { findings: run.findings.length, dropped: plan.dropped.length, loopHealth: plan.loopHealth.length, suppressedByObserver: plan.suppressedByObserver.count, advisory: plan.advisory.length, outOfScope: plan.outOfScope.length, exempted: plan.exempted.length, suppressed: plan.suppressed.length, held: plan.held.length, groups: groups.size, decisionPending: plan.decisionPending.length, files: plan.files.length, existing: plan.existing.length, invalid: plan.invalid.length, resolves: plan.resolves.length, needsPerson: plan.needsPerson.length, unresolved: plan.unresolved.length, evidencePairs: plan.files.reduce((n, f) => n + f.evidence.filter((e) => e.complete).length, 0) }
  return plan
}

/**
 * Dedupe against the open queue (rule 7), in order: the group's idempotency key, the exact title, any open ticket carrying
 * one of the group's observer ids, the same observer check on one of the group's pages, and then the aliases in
 * spec/observer-check-map.json dedupeAliases: an open ticket on one of the group's pages whose checkId, check or
 * observerCheck is an older id for the same defect (tests/page-check.mjs cta-links-resolve, cta-hidden-everywhere, a sweep
 * agent's campus.resources.calendar-reachable, ...) or whose title matches one of the check's title patterns. Returns
 * { task, via } or null.
 */
/** Longest title pattern the alias table may carry; tests/build-checks.mjs compiles every pattern, so a bad one fails the build, never a run. */
export const ALIAS_PATTERN_MAX_LENGTH = 120
const aliasPatternCache = new Map()
/** The alias table's title patterns as RegExp objects: committed playbook data (spec/observer-check-map.json), length-bounded, compiled once per pattern; never a value from a ticket or a packet. */
function aliasTitlePatterns(alias) {
  const out = []
  for (const source of alias?.titlePatterns || []) {
    if (typeof source !== 'string' || !source || source.length > ALIAS_PATTERN_MAX_LENGTH) continue
    if (!aliasPatternCache.has(source)) {
      // The pattern is a committed spec value (spec/observer-check-map.json), validated and compiled at build time by tests/build-checks.mjs,
      // bounded to ALIAS_PATTERN_MAX_LENGTH above, and tested against ticket titles only; never a value from a ticket or a packet.
      try { aliasPatternCache.set(source, new RegExp(source, 'i')) } catch { aliasPatternCache.set(source, null) } // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
    }
    const compiled = aliasPatternCache.get(source)
    if (compiled) out.push(compiled)
  }
  return out
}

export function findOpenDuplicate(openTasks, { group, row, payload, ids }, aliases = loadRegistry(CHECK_MAP_FILE).dedupeAliases || {}) {
  const cf = (t) => t.customFields || {}
  const onPage = (t) => taskPages(t).some((p) => group.pages.includes(p))
  const byKey = openTasks.find((t) => cf(t).idempotencyKey === group.key)
  if (byKey) return { task: byKey, via: 'idempotency-key' }
  const byTitle = openTasks.find((t) => t.title === payload.title)
  if (byTitle) return { task: byTitle, via: 'title' }
  const byId = openTasks.find((t) => observerIdsForTask(t).some((id) => ids.has(id)))
  if (byId) return { task: byId, via: 'observer-id' }
  const byCheck = openTasks.find((t) => [cf(t).check, cf(t).observerCheck].includes(row.observerCheck) && onPage(t))
  if (byCheck) return { task: byCheck, via: 'check-on-page' }
  const alias = aliases[row.observerCheck]
  if (!alias) return null
  const aliasIds = new Set((alias.checkIds || []).map((id) => String(id).toLowerCase()))
  const patterns = aliasTitlePatterns(alias)
  for (const t of openTasks) {
    if (!onPage(t)) continue
    const carried = [cf(t).checkId, cf(t).check, cf(t).observerCheck].filter(Boolean).map((v) => String(v).toLowerCase()).find((v) => aliasIds.has(v))
    if (carried) return { task: t, via: `alias:checkId ${carried}` }
    const pattern = patterns.find((re) => re.test(String(t.title || '')))
    if (pattern) return { task: t, via: `alias:title ${pattern.source}` }
  }
  return null
}

/**
 * Auto-resolve (rule 10). Every open observer ticket is assessed: one this filer did not create is refused outright
 * (PR 26; `unresolved`, never completed on a SITE id alone); a filer-created one whose incidents are all cleared by clean
 * runs goes to `resolves` when the filer may close it (resolveEligibility), to `needsPerson` when a person must (status,
 * human note, decision, instruction line, or a resolution that was not a clean-run clear), and to `unresolved` when the
 * check has not cleared (still observed, incident open or missing, check retired or without a row).
 */
function planResolves(plan, { run, bundle, queue, now, observedThisRun, decisionTickets = new Set() }) {
  for (const task of queue) {
    if (!isObserverTicket(task)) continue
    const ids = observerIdsForTask(task)
    if (!isFilerOwnedTask(task)) { plan.unresolved.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, reason: NOT_FILER_OWNED }); continue }
    if (!ids.length) { plan.unresolved.push({ id: task.id, title: task.title, status: task.status, reason: 'observer or filer ticket without an observer id' }); continue }
    const stillObserved = ids.filter((id) => observedThisRun.has(id))
    if (stillObserved.length) { plan.unresolved.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, reason: 'still observed in this run', stillObserved }); continue }
    const incidents = ids.map((id) => run.incidentsById.get(id) || null)
    if (incidents.some((i) => !i)) { plan.unresolved.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, reason: 'incident not in this packet', missing: ids.filter((id) => !run.incidentsById.get(id)) }); continue }
    const checks = [...new Set(incidents.map((i) => i.check))]
    const retired = checks.filter((c) => bundle.retired.has(c))
    if (retired.length) { plan.unresolved.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, reason: 'check retired (workstream 4: close with resolutionKind check-retired on the lead decision)', checks: retired }); continue }
    // The row per incident (its viewport picks the desktop or mobile row); the check's default row when the incident is too old to match.
    const rowPerIncident = incidents.map((i) => rowForFinding(bundle, i, now) || rowForCheck(bundle, i.check))
    if (rowPerIncident.some((r) => !r)) { plan.unresolved.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, reason: 'check has no row in the bundle (retire or correct the row; workstream 4)', checks }); continue }
    const rows = [...new Map(rowPerIncident.map((r) => [r.id, r])).values()]
    const clearAfterRuns = Math.max(...rows.map((r) => r.clearAfterRuns || DEFAULT_CLEAR_AFTER_RUNS))
    const notResolved = incidents.filter((i) => i.status !== 'resolved')
    if (notResolved.length) { plan.unresolved.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, reason: 'incident still open in the observer', statuses: Object.fromEntries(notResolved.map((i) => [i.id, i.status])) }); continue }
    const cleared = { observerIds: ids, checks, rows: rows.map((r) => r.id), clearAfterRuns, cleanRuns: Math.min(...incidents.map((i) => i.cleanRuns ?? 0)), resolvedAt: incidents.map((i) => i.resolvedAt).filter(Boolean).sort().at(-1) || null, resolvedByRunIds: [...new Set(incidents.map((i) => i.resolvedByRunId).filter(Boolean))], resolutionReasons: [...new Set(incidents.map((i) => i.resolutionReason).filter(Boolean))], clearingRunIds: [...new Set([...incidents.map((i) => i.resolvedByRunId).filter(Boolean), run.manifest.runId])], latestRunId: run.manifest.runId, latestRunCompletedAt: run.manifest.completedAt }
    // Only a clean-run clear is check-cleared: an evidence-version bump or a hand resolution is a person's call.
    const notClean = incidents.filter((i) => !isCleanRunClear(i, clearAfterRuns))
    if (notClean.length) {
      plan.needsPerson.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, checks, cleared, reason: `resolved by the observer without a clean-run clear (${notClean.map((i) => `${i.id} ${i.cleanRuns ?? 0} clean of ${clearAfterRuns}, ${i.resolutionReason || 'no reason'}`).join('; ')}); never check-cleared` })
      continue
    }
    const eligibility = resolveEligibility(task, { decisionTickets })
    if (!eligibility.eligible) { plan.needsPerson.push({ id: task.id, title: task.title, status: task.status, observerIds: ids, checks, cleared, reason: `cleared but needs a person: ${eligibility.reason}` }); continue }
    const page = taskPages(task)[0] || task.url || null
    const noteRows = rows.map((r) => ({ id: r.id, observerCheck: r.observerCheck, requirement: r.requirement, requirementRef: r.requirementRef }))
    let patch
    try {
      patch = buildResolvePatch({ task, cleared, rows: noteRows, runId: run.manifest.runId, runCompletedAt: run.manifest.completedAt, evidenceSha256: run.manifest.evidence?.sha256 || null, bundleVersion: bundle.version, now, page })
    } catch (error) {
      plan.invalid.push({ id: task.id, title: task.title, reason: `filer defect: resolution note (${error.code || error.name}: ${error.message})` })
      continue
    }
    plan.resolves.push({ id: task.id, title: task.title, status: task.status, updatedAt: task.updatedAt || null, filedBy: eligibility.filedBy, page, cleared, rows: noteRows, patch })
  }
}

/**
 * The one v1 PATCH that completes a cleared ticket (APEX PR 409), built from the ticket as it is now (the plan's snapshot
 * for the dry run, the live GET at apply time): the existing description first, then the section-7 note; status
 * COMPLETED; resolutionKind first class and in customFields; checkId (SITE-*), filerRunId, requirementId and
 * checkBundleVersion keep it filer-owned; `expectedUpdatedAt` is the ticket's updatedAt so APEX refuses a stale write
 * the way intake's reconcile does; never agentStatus (APEX clears it) and never a PATCH whose only key is agentEligible.
 * The note is checked with assertNoteShape before it is used.
 */
export function buildResolvePatch({ task, cleared, rows, runId, runCompletedAt, evidenceSha256, bundleVersion, now, page }) {
  const cf = task.customFields || {}
  const note = cleanText(renderResolutionNote({ cleared, rows, runId, runCompletedAt, evidenceSha256, now, page }))
  assertNoteShape(note)
  const date = now.toISOString().slice(0, 10)
  return {
    description: `${String(task.description || '').trimEnd()}\n\n${note}`.trim(),
    status: 'COMPLETED',
    resolutionKind: RESOLUTION_KIND,
    ...(task.updatedAt ? { expectedUpdatedAt: task.updatedAt } : {}),
    customFields: { ...cf, checkId: isObserverId(cf.checkId) ? String(cf.checkId).toUpperCase() : cleared.observerIds[0], resolutionKind: RESOLUTION_KIND, resolvedByRunId: cleared.resolvedByRunIds[0] || runId, clearingRunIds: cleared.clearingRunIds, resolvedAt: now.toISOString(), filerVersion: FILER_VERSION, filerRunId: runId, requirementId: rowKeyFor(rows[0]), checkBundleVersion: bundleVersion || '', history: [...(Array.isArray(cf.history) ? cf.history : []), `${date} ${FILED_BY} ${FILER_VERSION}: completed, check cleared on ${cleared.clearingRunIds.join(', ')}`] },
  }
}

/**
 * Section-7 closing note for a ticket the observer's runs cleared: spec/ticket-templates.json template `verified` (the filer
 * changed nothing on the site; the done condition is met on the observer's own runs). The field values are the filer's facts.
 */
export function renderResolutionNote({ cleared, rows, runId, runCompletedAt, evidenceSha256, now, page }) {
  const checks = rows.map((r) => `${r.observerCheck} (${rowKeyFor(r)})`).join(', ')
  return renderTemplate('verified', {
    actor: `${FILED_BY} ${FILER_VERSION}`,
    date: now.toISOString().slice(0, 10),
    playbookVersion: 'playbook check bundle',
    goHere: page || 'n/a (no public page on this ticket)',
    lookFor: `the condition this ticket reported no longer appears; observer check ${checks} is clear`,
    recommend: 'Complete',
    alsoOpen: 'not assessed by the filer; the open queue lists any other ticket on this URL',
    page: page || 'n/a',
    verifiedBy: 'the filer',
    alreadyMet: 'the check cleared on the observer\'s own runs (fixed elsewhere or the source corrected)',
    evidence: `observer incident${cleared.observerIds.length === 1 ? '' : 's'} ${cleared.observerIds.join(', ')} resolved ${cleared.resolvedAt || 'n/a'} by run ${cleared.resolvedByRunIds.join(', ') || 'n/a'} after ${cleared.cleanRuns} clean run${cleared.cleanRuns === 1 ? '' : 's'} (row requires ${cleared.clearAfterRuns}); latest run ${runId} (${runCompletedAt}) still clear; packet evidence sha256 ${evidenceSha256 || 'n/a'}`,
    tests: 'observer verification only; no ring run by the filer',
    observer: `${cleared.observerIds.join(', ')} cleared on run ${cleared.clearingRunIds.join(', ')}`,
    resolutionKind: RESOLUTION_KIND,
  })
}

// ---------------------------------------------------------------------------------------------------------------
// APEX client and apply
// ---------------------------------------------------------------------------------------------------------------

export const LIST_PAGE_SIZE = 100
export const LIST_MAX_PAGES = 20

export function createApexClient({ env = process.env, fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const { v1Base, agentBase } = apexBases(env)
  const token = env.APEX_API_TOKEN
  async function request(route, method = 'GET', body) {
    if (!token) throw new ObserverFilerError('MISSING_TOKEN', 'APEX_API_TOKEN required')
    const response = await fetchImpl(`${v1Base}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    let data; try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text.slice(0, 500) } }
    if (!response.ok) throw new ObserverFilerError('APEX_ERROR', `APEX ${method} ${route} ${response.status}: ${JSON.stringify(data).slice(0, 400)}`, { status: response.status, body: data, code: data?.code || data?.error?.code || null })
    return data?.task || data?.data || data
  }
  const client = {
    v1Base, agentBase, token,
    /** Statuses whose listing hit the page cap in the last listOpen (the queue may be incomplete); also logged. */
    listWarnings: [],
    async listOpen() {
      const all = []
      client.listWarnings = []
      for (const status of OPEN_STATUSES) {
        for (let page = 1; page <= LIST_MAX_PAGES; page++) {
          const data = await request(`/tasks?status=${encodeURIComponent(status)}&page=${page}&pageSize=${LIST_PAGE_SIZE}`)
          const items = Array.isArray(data) ? data : data.items || data.tasks || []
          all.push(...items)
          if (items.length < LIST_PAGE_SIZE) break
          if (page === LIST_MAX_PAGES) {
            const warning = `listOpen: status ${status} hit the ${LIST_MAX_PAGES}-page cap (${LIST_MAX_PAGES * LIST_PAGE_SIZE} tickets); the open queue may be incomplete, dedupe and auto-resolve saw only this much`
            client.listWarnings.push(warning)
            log(warning)
          }
        }
      }
      return [...new Map(all.map((t) => [t.id, t])).values()]
    },
    get: (id) => request(`/tasks/${encodeURIComponent(id)}`),
    create: (payload) => request('/tasks', 'POST', payload),
    patch: (id, body) => request(`/tasks/${encodeURIComponent(id)}`, 'PATCH', body),
  }
  return client
}

/** Why a planned resolve no longer applies to the live ticket, or null: status or updatedAt moved, or the ticket is no longer the filer's to close. */
export function resolveDrift(item, live, { decisionTickets = new Set() } = {}) {
  if (!live || !live.id) return 'ticket not readable'
  if (String(live.status || '') !== String(item.status || '')) return `status is ${live.status || 'unknown'}, the plan saw ${item.status}`
  if (item.updatedAt && live.updatedAt && live.updatedAt !== item.updatedAt) return `updated ${live.updatedAt} after the plan (${item.updatedAt})`
  const eligibility = resolveEligibility(live, { decisionTickets })
  if (!eligibility.eligible) return eligibility.reason
  return null
}

/** Perform the plan's writes: create, assign, attach evidence, resolve. Every write is appended to the jsonl log before the next one. */
export async function applyPlan(plan, { apex, env = process.env, fetchImpl = globalThis.fetch, log = () => {}, writesFile, now = new Date() }) {
  const writes = []
  const record = (entry) => { const line = { at: new Date().toISOString(), runId: plan.runId, ...entry }; writes.push(line); if (writesFile) fs.appendFileSync(writesFile, `${JSON.stringify(line)}\n`) }
  const results = { filed: [], attached: [], resolved: [], skipped: [], errors: [] }
  for (const item of plan.files) {
    try {
      const body = { ...item.payload }
      delete body.assignees
      const created = await apex.create(body)
      record({ write: 'create', ticket: created.id, key: item.key, title: item.title, status: body.status, owner: item.owner.name })
      if (item.owner.id) {
        await apex.patch(created.id, { assignees: { set: [{ id: item.owner.id }] } })
        record({ write: 'assign', ticket: created.id, owner: item.owner.name, via: item.owner.via })
      }
      results.filed.push({ id: created.id, key: item.key, title: item.title })
      log(`filed ${created.id} ${item.title.slice(0, 80)} -> ${item.owner.name} (${item.owner.via})`)
      for (const pair of item.evidence.filter((e) => e.complete)) {
        try {
          const evidencePlan = planEvidence({ ticket: created.id, run: plan.runId, page: pair.page, desktop: pair.desktop, mobile: pair.mobile, section: item.payload.customFields.element.slice(0, 80) })
          const attached = await attachEvidence(evidencePlan, { token: apex.token, agentBase: apex.agentBase, fetchImpl, log })
          record({ write: 'evidence', ticket: created.id, route: pair.route, page: pair.page, shots: attached.map((a) => ({ viewport: a.viewport, sha256: a.sha256, url: a.screenshotUrl })) })
          results.attached.push({ id: created.id, route: pair.route })
        } catch (error) {
          record({ write: 'evidence', ticket: created.id, route: pair.route, error: error.message })
          results.errors.push({ id: created.id, step: 'evidence', error: error.message })
        }
      }
    } catch (error) {
      record({ write: 'create', key: item.key, title: item.title, error: error.message })
      results.errors.push({ key: item.key, step: 'create', error: error.message })
    }
  }
  const decisionTickets = new Set(plan.decisionTickets || [])
  for (const item of plan.resolves) {
    try {
      // The PATCH is built from the ticket as APEX holds it now, not from the plan's snapshot: a person may have written
      // on it since; the live description stays first and expectedUpdatedAt makes APEX refuse a write that raced another.
      const live = await apex.get(item.id)
      const drift = resolveDrift(item, live, { decisionTickets })
      if (drift) {
        record({ write: 'resolve', ticket: item.id, skipped: 'CHANGED_SINCE_PLAN', reason: drift })
        results.skipped.push({ id: item.id, step: 'resolve', reason: 'CHANGED_SINCE_PLAN', detail: drift })
        log(`skipped ${item.id}: changed since the plan (${drift})`)
        continue
      }
      const patch = buildResolvePatch({ task: live, cleared: item.cleared, rows: item.rows, runId: plan.runId, runCompletedAt: plan.runCompletedAt, evidenceSha256: plan.evidenceSha256, bundleVersion: plan.bundleVersion, now, page: item.page })
      const patched = await apex.patch(item.id, patch)
      record({ write: 'resolve', ticket: item.id, status: patched.status || 'COMPLETED', resolutionKind: RESOLUTION_KIND, expectedUpdatedAt: patch.expectedUpdatedAt || null, clearingRunIds: item.cleared.clearingRunIds, observerIds: item.cleared.observerIds })
      results.resolved.push({ id: item.id, status: patched.status || 'COMPLETED' })
      log(`completed ${item.id} ${item.title.slice(0, 80)} (cleared on ${item.cleared.clearingRunIds.join(', ')})`)
    } catch (error) {
      if (isFilerOwnedConflict(error)) {
        // APEX PR 409: a ticket the filer already owns past NOT_STARTED answers 409 OBSERVER_FILER_OWNED; that is a skip, never an error.
        record({ write: 'resolve', ticket: item.id, skipped: FILER_OWNED_CODE })
        results.skipped.push({ id: item.id, step: 'resolve', reason: FILER_OWNED_CODE })
        log(`skipped ${item.id}: ${FILER_OWNED_CODE}`)
        continue
      }
      if (error.status === 409) {
        // expectedUpdatedAt did not match: someone wrote between the GET and the PATCH. Abort this ticket; the next run re-plans it.
        record({ write: 'resolve', ticket: item.id, skipped: 'UPDATED_AT_MISMATCH', error: error.message })
        results.skipped.push({ id: item.id, step: 'resolve', reason: 'UPDATED_AT_MISMATCH', detail: error.message })
        log(`skipped ${item.id}: APEX refused the write (${error.message.slice(0, 120)})`)
        continue
      }
      record({ write: 'resolve', ticket: item.id, error: error.message })
      results.errors.push({ id: item.id, step: 'resolve', error: error.message })
    }
  }
  return { ...results, writes }
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2); const next = argv[i + 1]
    out[key] = next === undefined || next.startsWith('--') ? true : (i++, next)
  }
  return out
}

/** `--max-packet-age-hours` (a positive number, default DEFAULT_MAX_PACKET_AGE_HOURS) and `--after-run-id` (the last applied observer run id) as assessPacketFreshness options. */
export function packetGateOptions(args) {
  const raw = args['max-packet-age-hours']
  const maxAgeHours = raw === undefined ? DEFAULT_MAX_PACKET_AGE_HOURS : Number(raw)
  if (raw === true || !(Number.isFinite(maxAgeHours) && maxAgeHours > 0)) throw new ObserverFilerError('MISSING_ARG', `--max-packet-age-hours must be a positive number of hours, got ${raw}`)
  if (args['after-run-id'] === true) throw new ObserverFilerError('MISSING_ARG', '--after-run-id needs the last applied observer run id (manifest.runId of that packet)')
  const afterRunId = args['after-run-id'] ? String(args['after-run-id']).trim() : null
  return { maxAgeHours, afterRunId: afterRunId || null }
}

/** `gh run download -R superbuilders/aeo -n alpha-site-packet-<run> -D <dir>`; the packet lands in tmp/observer-packets/<run> unless --run-dir says where. */
export function downloadPacket(runId, dest, { repository = 'superbuilders/aeo', spawn = spawnSync } = {}) {
  if (!/^\d+$/.test(String(runId))) throw new ObserverFilerError('MISSING_ARG', `--run must be the numeric GitHub run id, got ${runId}`)
  fs.mkdirSync(dest, { recursive: true })
  const result = spawn('gh', ['run', 'download', String(runId), '-R', repository, '-n', `alpha-site-packet-${runId}`, '-D', dest], { encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new ObserverFilerError('DOWNLOAD_FAILED', `gh run download ${runId} failed: ${result.error?.message || result.stderr || result.stdout}`.trim())
  return dest
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  if (!args['run-dir'] && !args.run) throw new ObserverFilerError('MISSING_ARG', 'Usage: file-observer-findings.mjs --run-dir <packet dir> | --run <github run id> [--bundle <check bundle>] [--queue <export.json>] [--apply] [--report <file>] [--now <ISO>] [--max-packet-age-hours 6] [--after-run-id <run id>]')
  let runDir = args['run-dir'] && args['run-dir'] !== true ? path.resolve(args['run-dir']) : null
  if (args.run && args.run !== true) runDir = downloadPacket(args.run, runDir || path.join(root, 'tmp', 'observer-packets', String(args.run)))
  const run = loadRunFolder(runDir)
  const bundle = loadCheckBundle(args.bundle && args.bundle !== true ? args.bundle : path.join(root, 'spec', 'check-bundle.generated.json'))
  const now = args.now && args.now !== true ? new Date(args.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new ObserverFilerError('MISSING_ARG', `--now must be an ISO datetime, got ${args.now}`)
  const offlineQueue = args.queue && args.queue !== true
  // --apply writes against the queue it read; a saved export is a dry-run input, never something to write from.
  if (args.apply && offlineQueue) throw new ObserverFilerError('MISSING_ARG', '--apply writes against the live APEX queue and cannot take --queue <export.json>; drop --queue to apply, or drop --apply for an offline dry run')
  if (args.apply && !env.APEX_API_TOKEN) throw new ObserverFilerError('MISSING_TOKEN', 'APEX_API_TOKEN required for --apply')
  // Packet freshness gate: before the queue is read and before any write. --apply refuses a stale, unverified, already
  // applied or superseded packet with STALE_PACKET; a dry run carries the same findings as packetWarnings.
  const packet = assessPacketFreshness(run.manifest, { now, ...packetGateOptions(args) })
  if (args.apply && !packet.fresh) throw new ObserverFilerError(STALE_PACKET, `--apply refused: ${packet.problems.join('; ')}`, { packet })
  const apex = createApexClient({ env, log: io.error })
  if (!offlineQueue && !env.APEX_API_TOKEN) throw new ObserverFilerError('MISSING_TOKEN', 'APEX_API_TOKEN is required to read the open queue; pass --queue <export.json> for an offline run')
  for (const problem of packet.problems) io.error(`packet warning: ${problem}`)
  const queue = offlineQueue ? loadQueue(args.queue) : await apex.listOpen()
  const plan = planObserverFindings({ run, bundle, queue, now })
  plan.mode = args.apply ? 'apply' : 'dry-run'
  plan.runDir = run.dir
  plan.packet = packet
  plan.packetWarnings = packet.problems
  plan.queueSource = offlineQueue ? path.resolve(args.queue) : apex.v1Base
  plan.queueWarnings = apex.listWarnings
  const reportFile = args.report && args.report !== true ? path.resolve(args.report) : path.join(run.dir, 'filer-report.json')
  let applied = null
  if (args.apply) {
    applied = await applyPlan(plan, { apex, env, log: io.log, writesFile: path.join(run.dir, 'filer-writes.jsonl') })
    plan.applied = { filed: applied.filed, attached: applied.attached, resolved: applied.resolved, skipped: applied.skipped, errors: applied.errors, writes: applied.writes.length, writesFile: path.join(run.dir, 'filer-writes.jsonl') }
  }
  fs.writeFileSync(reportFile, `${JSON.stringify(plan, null, 2)}\n`)
  const summary = { mode: plan.mode, runId: plan.runId, bundleVersion: plan.bundleVersion, bundleSha256: plan.bundleSha256, healthSource: plan.health.source, unhealthySources: Object.keys(plan.health.unhealthy), holds: plan.holds, suppressedByObserver: plan.suppressedByObserver.count, counts: plan.counts, report: reportFile,
    packet: { completedAt: packet.completedAt, ageHours: packet.ageHours, maxAgeHours: packet.maxAgeHours, bundleStatus: packet.bundleStatus, afterRunId: packet.afterRunId },
    ...(plan.packetWarnings.length ? { packetWarnings: plan.packetWarnings } : {}),
    ...(plan.queueWarnings.length ? { queueWarnings: plan.queueWarnings } : {}),
    files: plan.files.map((f) => `${f.title} -> ${f.owner.name} (${f.owner.via})${f.owner.escalated ? ' [BLOCKED, protocol 1d]' : ''}; ${f.findings} finding(s), ${f.evidence.filter((e) => e.complete).length} evidence pair(s)`),
    existing: plan.existing.map((e) => `${e.check} ${e.scopeKey}: open ticket ${e.existing.id} [${e.existing.status}] via ${e.existing.via}`),
    exempted: plan.exempted.map((e) => `${e.check} ${e.page || e.id}: ${e.kind === 'cta-exception' ? `${e.cta} ${e.rule} (${e.decidedBy}, ${e.source}; ${e.expiryBasis})` : e.reason}`),
    outOfScope: plan.outOfScope.map((o) => `${o.check} ${o.url}: ${o.reason} (${o.host})`),
    decisionPending: plan.decisionPending.map((d) => `${d.check} ${d.scopeKey}: ${d.findings} finding(s) wait on ${d.decisionTicket}`),
    resolves: plan.resolves.map((r) => `${r.id} ${r.title.slice(0, 70)} (cleared on ${r.cleared.clearingRunIds.join(', ')})`),
    needsPerson: plan.needsPerson.map((n) => `${n.id} [${n.status}] ${n.title.slice(0, 60)}: ${n.reason}`),
    ...(applied ? { applied: plan.applied } : {}) }
  io.log(JSON.stringify(summary, null, 2))
  return { plan, applied }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof ObserverFilerError) { console.error(`${error.code}: ${error.message}`); process.exit(error.code === 'APEX_ERROR' ? 2 : 1) }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
