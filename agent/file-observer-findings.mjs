#!/usr/bin/env node
/**
 * File observer findings as APEX website tickets, and close the tickets whose check cleared (QC loop redesign
 * 2026-09-24, workstream 6: the playbook defines, the observer measures, the protocol files).
 *
 *   node agent/file-observer-findings.mjs --run-dir <packet dir> [--bundle spec/check-bundle.generated.json] \
 *     [--queue <apex export.json>] [--apply] [--report <file>] [--now <ISO>]
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
 *   2. A finding is suppressed and counted when its row depends on a source that `health.json` (else the manifest's
 *      providers) reports unhealthy or stale, when an open loop-health finding of this run `suppresses` the row (same
 *      route and viewport where the loop-health row says so), or when the finding carries a `suppressWhen` condition.
 *   3. The grace period runs from the incident's first-seen time; `requireConsecutiveRuns` needs that many observations.
 *   4. One ticket per dedupe scope (page, template, program, event, site), keyed `observer:<requirement>:<scopeKey>`,
 *      with the page or event list in the body; rows sharing a requirement and scope (desktop and mobile) merge.
 *   5. A row with `decisionPending` files nothing new while that ticket is open; the group is reported against it.
 *   6. The body is rendered to the ticket contract and checked with tests/validate-ticket.mjs `contractCheck`;
 *      a ticket that fails the contract is a filer defect and is not filed.
 *   7. Dedupe against the open queue the way agent/file-found-ticket.mjs does: idempotency key, exact title, then an
 *      open ticket carrying any of the group's observer ids or the same check on one of its pages.
 *   8. Class and owner come from the policy bundle; a role with no registered APEX user escalates to the website agent
 *      operator as Blocked (protocol 1d) with the role named in the body.
 *   9. Evidence: the artifact's desktop and mobile screenshot pair for the finding's route goes onto the ticket with
 *      agent/attach-evidence.mjs when both files exist.
 *  10. Auto-resolve: every open ticket carrying an observer check id (customFields.checkId `SITE-*`, observerIds,
 *      externalId, or the filer's idempotency key) whose incidents are all resolved for at least the row's clearAfterRuns
 *      clean runs gets a section-7 RESOLUTION note citing the clearing run ids, `resolutionKind: check-cleared` (first
 *      class and in customFields), and status COMPLETED through one v1 PATCH: never a PATCH whose only key is
 *      agentEligible, no agentStatus (APEX clears it on completion), the existing description first (APEX PR 409).
 *
 * APEX PR 409 marks a ticket filer-owned by customFields.checkId (SITE-*), filerRunId, requirementId and
 * checkBundleVersion; the filer sets them on every create and resolve, and treats 409 OBSERVER_FILER_OWNED as a skip.
 *
 * Dry run by default: the plan goes to `<run dir>/filer-report.json` and stdout. `--apply` performs the writes and
 * appends every one to `<run dir>/filer-writes.jsonl`. Env: APEX_API_TOKEN (APEX_API_BASE, APEX_AGENT_API_BASE optional).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { apexBases, attachEvidence, planEvidence } from './attach-evidence.mjs'
import { contractCheck } from '../tests/validate-ticket.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
export const FILER_VERSION = '0.2'
export const IDEMPOTENCY_PREFIX = 'observer:'
export const RESOLUTION_KIND = 'check-cleared'
export const FILER_OWNED_CODE = 'OBSERVER_FILER_OWNED'
export const DEDUPE_SCOPES = ['page', 'template', 'program', 'event', 'site']
export const CHANNELS = ['ticket', 'loop-health']
export const ROW_FIELDS = ['id', 'observerCheck', 'title', 'pageFamily', 'lifecycleStates', 'element', 'expected', 'comparator', 'severity', 'status', 'ticketClass', 'ownerRole', 'dedupeScope', 'clearAfterRuns', 'gracePeriodHours', 'evidenceProfile', 'sourceHealthDependency', 'requirementRef']
export const OPEN_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'MISSING_INFO', 'BLOCKED', 'FOR_REVIEW', 'TESTING', 'APPROVED']
export const OPERATOR_ROLE = 'website-agent-operator'
export const DEFAULT_CLEAR_AFTER_RUNS = 2
export const PUBLIC_HOSTS = ['alpha.school', 'www.alpha.school']
const OBSERVER_ID = /\bSITE-[A-Z0-9]{8,}\b/gi
const ROW_ID_PREFIX = /\b(?:site|campus)\.[a-z0-9-]+(?:\.[a-z0-9-]+)*(?:\.\*|\*)?/g

export class ObserverFilerError extends Error {
  /** @param {'MISSING_ARG'|'MISSING_TOKEN'|'BAD_RUN_DIR'|'BAD_BUNDLE'|'BAD_QUEUE'|'DOWNLOAD_FAILED'|'APEX_ERROR'} code */
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

/**
 * Unhealthy sources by name, from health.json when present (keys are sourceHealth ids or provider entities), else from
 * the manifest's provider statuses. Each entry: { status, reason, at } where `at` is the snapshot time when the provider reports one.
 */
export function normalizeHealth(healthJson, manifest) {
  const unhealthy = {}
  const snapshots = {}
  if (healthJson && typeof healthJson === 'object') {
    const sources = healthJson.sources || healthJson.providers || {}
    for (const [name, entry] of Object.entries(sources)) {
      const status = typeof entry === 'string' ? entry : entry?.status
      if (typeof entry === 'object' && (entry?.extractedAt || entry?.snapshotAt)) snapshots[name] = entry.extractedAt || entry.snapshotAt
      if (status && status !== 'healthy') unhealthy[name] = { status, reason: (typeof entry === 'object' && (entry.reason || entry.error)) || null }
    }
    return { source: 'health.json', unhealthy, snapshots }
  }
  for (const [name, entry] of Object.entries(manifest?.providers || {})) {
    if (entry?.extractedAt || entry?.snapshotAt) snapshots[name] = entry.extractedAt || entry.snapshotAt
    if (entry?.status && entry.status !== 'healthy') unhealthy[name] = { status: entry.status, reason: entry.reason || entry.error || null }
  }
  return { source: 'manifest.providers', unhealthy, snapshots }
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

export const requirementIdFor = (row) => row.requirement || (typeof row.requirementRef === 'string' ? row.requirementRef : row.id)
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

export function idempotencyKeyFor(row, finding) { return `${IDEMPOTENCY_PREFIX}${requirementIdFor(row)}:${scopeKeyFor(row, finding)}` }

export function campusNameFor(url) {
  const normalized = normalizePageUrl(url)
  if (!normalized) return null
  const entry = Object.values(campusPages()).find((page) => normalizePageUrl(page.url) === normalized)
  return entry ? entry.names[0] : null
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

/** Row id prefixes a loop-health row's `suppresses` sentence names (site.layout.*, site.header.rendered.route-reachable, ...). */
function suppressedPrefixes(row) {
  return [...String(row.suppresses || '').matchAll(ROW_ID_PREFIX)].map((m) => m[0].replace(/\.?\*$/, ''))
}

/**
 * Open loop-health findings of this run that suppress the row for this finding: a provider-health finding suppresses
 * every row depending on that provider; an operations snapshot finding suppresses operations-sheet rows; the
 * inspection rows suppress the row ids they name on the same route (and viewport when the finding has one).
 */
export function loopHealthSuppression(row, finding, loopHealth, bundle) {
  const hits = []
  const deps = [].concat(row.sourceHealthDependency || [])
  const url = normalizePageUrl(finding.url)
  const viewport = viewportFor(finding)
  const route = routeFor(finding)
  for (const lh of loopHealth) {
    if (lh.row.observerCheck === 'provider-health') {
      const provider = String(lh.finding.entity || '')
      if (deps.some((d) => healthNames(bundle, d).includes(provider))) hits.push({ by: lh.finding.id, check: lh.row.observerCheck, provider })
      continue
    }
    if (lh.row.observerCheck === 'campus-operations-snapshot-fresh') {
      if (deps.includes('operations-sheet')) hits.push({ by: lh.finding.id, check: lh.row.observerCheck })
      continue
    }
    const prefixes = suppressedPrefixes(lh.row)
    if (!prefixes.some((p) => row.id === p || row.id.startsWith(`${p}.`))) continue
    const sameRoute = !lh.url || !url || lh.url === url || (lh.route && route && lh.route === route)
    const sameViewport = !/viewport/.test(String(lh.row.suppresses)) || !lh.viewport || !viewport || lh.viewport === viewport
    if (sameRoute && sameViewport) hits.push({ by: lh.finding.id, check: lh.row.observerCheck, url: lh.url, viewport: lh.viewport })
  }
  return hits
}

// ---------------------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------------------

export function formatFact(value, depth = 0) {
  if (value === null || value === undefined) return 'n/a'
  if (typeof value === 'string') return value.trim() || 'empty'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (!value.length) return 'none'
    const items = value.slice(0, 3).map((item) => formatFact(item, depth + 1))
    return `${items.join('; ')}${value.length > 3 ? ` (+${value.length - 3} more)` : ''}`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== '')
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

function truncate(value, max) { const s = String(value); return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…` }

function sourceLine(group, run) {
  const names = [...new Set(group.findings.flatMap((f) => [f.expectedSource, f.actualSource].filter(Boolean)))]
  const providers = run.manifest.providers || {}
  const reads = [...new Set(group.findings.map((f) => f.sourceReadAt).filter(Boolean))]
  const readAt = reads[0] || Object.values(providers).map((p) => p?.completedAt).filter(Boolean).sort().at(-1) || run.manifest.completedAt
  if (!names.length) return `observer run ${run.manifest.runId} (read ${readAt}); the finding names no source system`
  return `${names.join(' vs ')} (read ${readAt}, observer run ${run.manifest.runId})`
}

function scopeLabel(row, group) {
  const pages = group.pages
  switch (row.dedupeScope) {
    case 'page': return campusNameFor(pages[0]) || (pages[0] ? pageSlug(pages[0]) : group.findings[0].entity)
    case 'template': return `Shared ${row.pageFamily || 'site'} template (${pages.length} page${pages.length === 1 ? '' : 's'})`
    case 'program': return group.findings[0].actual?.name || campusNameFor(pages[0]) || campusNameForProgram(programIdFor(group.findings[0])) || programIdFor(group.findings[0]) || group.findings[0].entity
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
    claim: truncate(`${scopeLabel(row, group)}: fails "${row.title}"${n > 1 ? ` (${n} findings)` : ''}`, 180),
    page: group.pages[0] || null,
    pages: group.pages,
    events: row.dedupeScope === 'event' ? group.findings.map((f) => f.title) : [],
    element: row.element,
    observed: `${observed.join(' | ')}${more}`,
    expected: `${renderExpected(row)} (${requirementIdFor(row)}; ${renderComparator(row)}; severity ${row.severity})`,
    source: sourceLine(group, run),
    class: row.ticketClass,
    defectClass: defectClassFor(row.ticketClass),
    ownerRole: row.ownerRole,
    ownerName: owner.name,
    escalation: owner.escalated ? `role ${row.ownerRole} has no registered APEX user; escalated to ${owner.name} (${OPERATOR_ROLE}) per protocol 1d; the work lives in ${policy.classes?.[row.ticketClass]?.executes || row.ownerRole}` : null,
    fixPath: fixPathFor(policy, row),
    doneWhen: doneWhenFor(policy, row),
    evidence: `observer check ${row.observerCheck} run ${run.manifest.runId} (${run.manifest.completedAt}); observer ids ${group.findings.map((f) => f.id).join(', ')}; packet evidence sha256 ${run.manifest.evidence?.sha256 || 'n/a'}; screenshot pair attached with agent/attach-evidence.mjs where the artifact carries it`,
    exemptions: row.exemptionsRef ? `${row.exemptionsRef}${row.exemptions?.length ? ` (${row.exemptions.join('; ')})` : ''}` : null,
    related,
    playbook: `${requirementIdFor(row)} (${renderRequirementRef(row)}); check bundle ${bundle.version || 'unversioned'} row${rowIds.length === 1 ? '' : 's'} ${rowIds.join(', ')}`,
    severity: row.severity,
    history: [`${date} agent/file-observer-findings.mjs ${FILER_VERSION}: filed from observer run ${run.manifest.runId} (${n} finding${n === 1 ? '' : 's'}, scope ${row.dedupeScope})`],
    reason: `${row.dedupeScope}-scoped ${row.status} check ${row.observerCheck}; ${first.summary ? truncate(first.summary, 240) : row.title}`,
  }
}

/** Ticket body in the render-ticket.mjs style with the contract's labelled lines (Page, Element, Observed, Expected, Source, Fix path, Done when, Evidence). */
export function renderObserverBody(c) {
  const lines = [
    `${c.ownerName || c.ownerRole}: ${c.fixPath}`,
    '',
    `Claim: ${c.claim}`,
    c.page ? `Page: ${c.page}` : 'Page: n/a (no public page; see the list below)',
    c.pages.length > 1 ? `Pages (${c.pages.length}): ${c.pages.join(', ')}` : null,
    c.events.length ? `Events (${c.events.length}): ${c.events.join(' | ')}` : null,
    `Element: ${c.element}`,
    `Observed: ${c.observed}`,
    `Expected: ${c.expected}`,
    `Source: ${c.source}`,
    `Defect class: ${c.defectClass}. ${c.reason}`,
    `Class: ${c.class}`,
    `Owner: ${c.ownerRole} (${c.ownerName})${c.escalation ? `; ${c.escalation}` : ''}`,
    `Fix path: ${c.fixPath}`,
    `Done when: ${c.doneWhen}`,
    `Evidence: ${c.evidence}`,
    c.exemptions ? `Exemptions: ${c.exemptions}` : null,
    c.related?.length ? `Related: ${c.related.join(', ')} (decision recorded; this row files again)` : null,
    `Playbook: ${c.playbook}`,
    '',
    'History:',
    ...c.history.map((h) => `- ${h}`),
  ].filter((l) => l !== null && l !== undefined)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// Observer ids on existing tickets
// ---------------------------------------------------------------------------------------------------------------

/** Every observer incident id an APEX ticket carries (checkId, observerIds, externalId, idempotencyKey, description, title). */
export function observerIdsForTask(task) {
  const cf = task.customFields || {}
  const values = [cf.checkId, ...(Array.isArray(cf.observerIds) ? cf.observerIds : [cf.observerIds]), cf.externalId, cf.idempotencyKey, task.description, task.title]
  const ids = new Set()
  for (const value of values) if (value) for (const m of String(value).matchAll(OBSERVER_ID)) { const id = m[0].toUpperCase(); if (id !== 'SITE-OBSERVER') ids.add(id) }
  return [...ids]
}

function taskPages(task) {
  const cf = task.customFields || {}
  return [task.url, cf.pageUrl, cf.targetPageUrl, ...String(task.description || '').match(/https:\/\/alpha\.school\/[^\s,)]*/g) || []].map(normalizePageUrl).filter(Boolean)
}

// ---------------------------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------------------------

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
  const plan = { filerVersion: FILER_VERSION, runId: run.manifest.runId, runCompletedAt: run.manifest.completedAt, bundleVersion: bundle.version, bundleSha256: bundle.sha256, health: run.health, now: now.toISOString(),
    counts: {}, files: [], existing: [], decisionPending: [], held: [], suppressed: [], loopHealth: [], dropped: [], advisory: [], invalid: [], resolves: [], unresolved: [] }

  // Pass 1: rows, and the run's open loop-health findings (they suppress; they never file).
  const assessed = []
  const loopHealth = []
  for (const finding of run.findings) {
    const row = rowForFinding(bundle, finding, now)
    if (!row) {
      const retired = bundle.retired.get(finding.check)
      plan.dropped.push({ id: finding.id, check: finding.check, reason: retired ? `retired: ${truncate(retired.reason, 160)}` : 'no row in the check bundle (telemetry)' })
      continue
    }
    if (channelFor(row) === 'loop-health') {
      loopHealth.push({ row, finding, url: normalizePageUrl(finding.url), viewport: viewportFor(finding), route: routeFor(finding) })
      plan.loopHealth.push({ id: finding.id, check: finding.check, row: row.id, entity: finding.entity, severity: finding.severity, decisionPending: row.decisionPending || null })
      continue
    }
    assessed.push({ finding, row })
  }

  // Pass 2: advisory, suppression, grace, consecutive runs, then grouping by idempotency key.
  const groups = new Map()
  for (const { finding, row } of assessed) {
    if (row.status === 'advisory') { plan.advisory.push({ id: finding.id, check: finding.check, row: row.id }); continue }
    const unhealthy = unhealthyDependencies(row, bundle, run.health, now)
    if (unhealthy.length) { plan.suppressed.push({ id: finding.id, check: finding.check, row: row.id, reason: 'source health', sources: unhealthy }); continue }
    const byLoopHealth = loopHealthSuppression(row, finding, loopHealth, bundle)
    if (byLoopHealth.length) { plan.suppressed.push({ id: finding.id, check: finding.check, row: row.id, reason: 'loop-health finding', loopHealth: byLoopHealth }); continue }
    const conditions = findingConditions(finding, now)
    const matched = (row.suppressWhen || []).filter((c) => conditions.includes(c))
    if (matched.length) { plan.suppressed.push({ id: finding.id, check: finding.check, row: row.id, reason: 'condition', conditions: matched }); continue }
    const incident = run.incidentsById.get(finding.id) || null
    const firstSeen = incident?.firstSeenAt || run.manifest.startedAt || run.manifest.completedAt
    const ageHours = (now.getTime() - new Date(firstSeen).getTime()) / 3_600_000
    if (row.gracePeriodHours > 0 && ageHours < row.gracePeriodHours) { plan.held.push({ id: finding.id, check: finding.check, row: row.id, reason: 'grace period', firstSeenAt: firstSeen, ageHours: Number(ageHours.toFixed(2)), gracePeriodHours: row.gracePeriodHours }); continue }
    const needRuns = row.requireConsecutiveRuns || 1
    const observations = incident?.occurrences ?? 1
    if (needRuns > 1 && observations < needRuns) { plan.held.push({ id: finding.id, check: finding.check, row: row.id, reason: 'consecutive runs', observations, requireConsecutiveRuns: needRuns }); continue }
    const key = idempotencyKeyFor(row, finding)
    if (!groups.has(key)) groups.set(key, { key, row, rows: [row], scopeKey: scopeKeyFor(row, finding), findings: [], pages: [] })
    const group = groups.get(key)
    if (!group.rows.includes(row)) group.rows.push(row)
    group.findings.push({ ...finding, firstSeenAt: firstSeen, occurrences: observations })
    const page = isPublicPage(finding.url) ? normalizePageUrl(finding.url) : null
    if (page && !group.pages.includes(page)) group.pages.push(page)
  }

  const observedThisRun = new Set(run.findings.map((f) => f.id))
  planResolves(plan, { run, bundle, queue, now, observedThisRun })
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
    const body = renderObserverBody(contract)
    const payload = {
      title: contract.claim,
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
        source: 'agent-found', requestFamily: 'website', filedBy: 'agent/file-observer-findings.mjs', filerVersion: FILER_VERSION,
        checkId: group.findings[0].id, triagedClass: row.ticketClass, defectClass: contract.defectClass, ownerRole: row.ownerRole, contractVersion: '1.0', element: row.element,
        idempotencyKey: group.key, observerCheck: row.observerCheck, observerIds: group.findings.map((f) => f.id), checkRowIds: group.rows.map((r) => r.id),
        requirementId: requirementIdFor(row), checkBundleVersion: bundle.version || '', checkBundleSha256: bundle.sha256 || '',
        filerRunId: run.manifest.runId, runId: run.manifest.runId, severity: row.severity, dedupeScope: row.dedupeScope,
        pageUrl: contract.page || '', pages: group.pages, history: contract.history,
      },
    }
    const check = contractCheck({ ...payload, id: 'planned', assignees: [{ name: owner.name }] })
    if (!check.valid) { plan.invalid.push({ key: group.key, title: payload.title, missing: check.missing }); continue }
    const dup = openTasks.find((t) => (t.customFields || {}).idempotencyKey === group.key)
      || openTasks.find((t) => t.title === payload.title)
      || openTasks.find((t) => observerIdsForTask(t).some((id) => ids.has(id)))
      || openTasks.find((t) => [(t.customFields || {}).check, (t.customFields || {}).observerCheck].includes(row.observerCheck) && taskPages(t).some((p) => group.pages.includes(p)))
    const entry = { key: group.key, rows: group.rows.map((r) => r.id), check: row.observerCheck, scope: row.dedupeScope, scopeKey: group.scopeKey, title: payload.title, findings: group.findings.length, observerIds: [...ids], pages: group.pages, owner, evidence: evidencePairs(run, group), payload }
    if (dup) { plan.existing.push({ ...entry, existing: { id: dup.id, status: dup.status, title: dup.title }, payload: undefined }); continue }
    plan.files.push(entry)
  }

  plan.counts = { findings: run.findings.length, dropped: plan.dropped.length, loopHealth: plan.loopHealth.length, advisory: plan.advisory.length, suppressed: plan.suppressed.length, held: plan.held.length, groups: groups.size, decisionPending: plan.decisionPending.length, files: plan.files.length, existing: plan.existing.length, invalid: plan.invalid.length, resolves: plan.resolves.length, unresolved: plan.unresolved.length, evidencePairs: plan.files.reduce((n, f) => n + f.evidence.filter((e) => e.complete).length, 0) }
  return plan
}

/** Auto-resolve: open tickets whose observer incidents are all resolved for at least the row's clearAfterRuns clean runs. */
function planResolves(plan, { run, bundle, queue, now, observedThisRun }) {
  for (const task of queue) {
    const ids = observerIdsForTask(task)
    const cf = task.customFields || {}
    const isObserverTicket = ids.length > 0 || String(cf.idempotencyKey || '').startsWith(IDEMPOTENCY_PREFIX)
    if (!isObserverTicket) continue
    if (!ids.length) { plan.unresolved.push({ id: task.id, title: task.title, reason: 'filer ticket without observer ids' }); continue }
    const stillObserved = ids.filter((id) => observedThisRun.has(id))
    if (stillObserved.length) { plan.unresolved.push({ id: task.id, title: task.title, observerIds: ids, reason: 'still observed in this run', stillObserved }); continue }
    const incidents = ids.map((id) => run.incidentsById.get(id) || null)
    if (incidents.some((i) => !i)) { plan.unresolved.push({ id: task.id, title: task.title, observerIds: ids, reason: 'incident not in this packet', missing: ids.filter((id) => !run.incidentsById.get(id)) }); continue }
    const checks = [...new Set(incidents.map((i) => i.check))]
    const retired = checks.filter((c) => bundle.retired.has(c))
    if (retired.length) { plan.unresolved.push({ id: task.id, title: task.title, observerIds: ids, reason: 'check retired (workstream 4: close with resolutionKind check-retired on the lead decision)', checks: retired }); continue }
    // The row per incident (its viewport picks the desktop or mobile row); the check's default row when the incident is too old to match.
    const rowPerIncident = incidents.map((i) => rowForFinding(bundle, i, now) || rowForCheck(bundle, i.check))
    if (rowPerIncident.some((r) => !r)) { plan.unresolved.push({ id: task.id, title: task.title, observerIds: ids, reason: 'check has no row in the bundle (retire or correct the row; workstream 4)', checks }); continue }
    const rows = [...new Map(rowPerIncident.map((r) => [r.id, r])).values()]
    const clearAfterRuns = Math.max(...rows.map((r) => r.clearAfterRuns || DEFAULT_CLEAR_AFTER_RUNS))
    const notResolved = incidents.filter((i) => i.status !== 'resolved')
    if (notResolved.length) { plan.unresolved.push({ id: task.id, title: task.title, observerIds: ids, reason: 'incident still open in the observer', statuses: Object.fromEntries(notResolved.map((i) => [i.id, i.status])) }); continue }
    const short = incidents.filter((i) => (i.cleanRuns ?? 0) < clearAfterRuns)
    if (short.length) { plan.unresolved.push({ id: task.id, title: task.title, observerIds: ids, reason: `resolved by the observer without ${clearAfterRuns} clean runs (${short.map((i) => `${i.id} ${i.cleanRuns ?? 0} clean, ${i.resolutionReason || 'no reason'}`).join('; ')}); needs a person`, clearAfterRuns }); continue }
    const clearingRunIds = [...new Set([...incidents.map((i) => i.resolvedByRunId).filter(Boolean), run.manifest.runId])]
    const cleared = { observerIds: ids, checks, rows: rows.map((r) => r.id), clearAfterRuns, cleanRuns: Math.min(...incidents.map((i) => i.cleanRuns)), resolvedAt: incidents.map((i) => i.resolvedAt).sort().at(-1), resolvedByRunIds: [...new Set(incidents.map((i) => i.resolvedByRunId).filter(Boolean))], clearingRunIds, latestRunId: run.manifest.runId, latestRunCompletedAt: run.manifest.completedAt }
    const page = taskPages(task)[0] || task.url || null
    const note = renderResolutionNote({ task, cleared, rows, run, now, page })
    // One v1 PATCH (APEX PR 409): resolutionKind is a first-class field, completion clears agentStatus in APEX itself, and
    // checkId (SITE-*), filerRunId, requirementId and checkBundleVersion mark the ticket filer-owned; never agentEligible.
    const patch = {
      description: `${String(task.description || '').trimEnd()}\n\n${note}`.trim(),
      status: 'COMPLETED',
      resolutionKind: RESOLUTION_KIND,
      customFields: { ...cf, checkId: /^SITE-/i.test(String(cf.checkId || '')) ? cf.checkId : ids[0], resolutionKind: RESOLUTION_KIND, resolvedByRunId: cleared.resolvedByRunIds[0] || run.manifest.runId, clearingRunIds, resolvedAt: now.toISOString(), filerVersion: FILER_VERSION, filerRunId: run.manifest.runId, requirementId: requirementIdFor(rows[0]), checkBundleVersion: bundle.version || '', history: [...(Array.isArray(cf.history) ? cf.history : []), `${now.toISOString().slice(0, 10)} agent/file-observer-findings.mjs ${FILER_VERSION}: completed, check cleared on ${clearingRunIds.join(', ')}`] },
    }
    plan.resolves.push({ id: task.id, title: task.title, status: task.status, page, cleared, patch })
  }
}

/** Section-7 RESOLUTION note for a ticket the observer's runs cleared. The filer changed nothing on the site. */
export function renderResolutionNote({ task, cleared, rows, run, now, page }) {
  const checks = rows.map((r) => `${r.observerCheck} (${requirementIdFor(r)})`).join(', ')
  return [
    `RESOLUTION (agent/file-observer-findings.mjs ${FILER_VERSION}, ${now.toISOString().slice(0, 10)}, playbook check bundle)`,
    `Go here: ${page || 'n/a (no public page on this ticket)'}`,
    `Look for: the condition this ticket reported no longer appears; observer check ${checks} is clear`,
    'Recommend: Complete',
    'Also open on this page: not assessed by the filer; the open queue lists any other ticket on this URL',
    `Page: ${page || 'n/a'}`,
    'Change: none by the filer; the check cleared on the observer\'s own runs (fixed elsewhere or the source corrected)',
    `Evidence: observer incident${cleared.observerIds.length === 1 ? '' : 's'} ${cleared.observerIds.join(', ')} resolved ${cleared.resolvedAt} by run ${cleared.resolvedByRunIds.join(', ') || 'n/a'} after ${cleared.cleanRuns} clean run${cleared.cleanRuns === 1 ? '' : 's'} (row requires ${cleared.clearAfterRuns}); latest run ${run.manifest.runId} (${run.manifest.completedAt}) still clear; packet evidence sha256 ${run.manifest.evidence?.sha256 || 'n/a'}`,
    'Tests: observer verification only; no ring run by the filer',
    `Observer: ${cleared.observerIds.join(', ')} cleared on run ${cleared.clearingRunIds.join(', ')}`,
    `Resolution kind: ${RESOLUTION_KIND}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------------------------
// APEX client and apply
// ---------------------------------------------------------------------------------------------------------------

export function isFilerOwnedConflict(error) {
  if (!error) return false
  const body = error.body || {}
  return error.status === 409 && (body.code === FILER_OWNED_CODE || body.error?.code === FILER_OWNED_CODE || String(body.error || body.message || error.message || '').includes(FILER_OWNED_CODE))
}

export function createApexClient({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const { v1Base, agentBase } = apexBases(env)
  const token = env.APEX_API_TOKEN
  async function request(route, method = 'GET', body) {
    if (!token) throw new ObserverFilerError('MISSING_TOKEN', 'APEX_API_TOKEN required')
    const response = await fetchImpl(`${v1Base}${route}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const text = await response.text()
    let data; try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text.slice(0, 500) } }
    if (!response.ok) throw new ObserverFilerError('APEX_ERROR', `APEX ${method} ${route} ${response.status}: ${JSON.stringify(data).slice(0, 400)}`, { status: response.status, body: data })
    return data?.task || data?.data || data
  }
  return {
    v1Base, agentBase, token,
    async listOpen() {
      const all = []
      for (const status of OPEN_STATUSES) {
        for (let page = 1; page <= 20; page++) {
          const data = await request(`/tasks?status=${encodeURIComponent(status)}&page=${page}&pageSize=100`)
          const items = Array.isArray(data) ? data : data.items || data.tasks || []
          all.push(...items)
          if (items.length < 100) break
        }
      }
      return [...new Map(all.map((t) => [t.id, t])).values()]
    },
    create: (payload) => request('/tasks', 'POST', payload),
    patch: (id, body) => request(`/tasks/${encodeURIComponent(id)}`, 'PATCH', body),
  }
}

/** Perform the plan's writes: create, assign, attach evidence, resolve. Every write is appended to the jsonl log before the next one. */
export async function applyPlan(plan, { apex, env = process.env, fetchImpl = globalThis.fetch, log = () => {}, writesFile }) {
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
  for (const item of plan.resolves) {
    try {
      const patched = await apex.patch(item.id, item.patch)
      record({ write: 'resolve', ticket: item.id, status: patched.status || 'COMPLETED', resolutionKind: RESOLUTION_KIND, clearingRunIds: item.cleared.clearingRunIds, observerIds: item.cleared.observerIds })
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
  if (!args['run-dir'] && !args.run) throw new ObserverFilerError('MISSING_ARG', 'Usage: file-observer-findings.mjs --run-dir <packet dir> | --run <github run id> [--bundle <check bundle>] [--queue <export.json>] [--apply] [--report <file>] [--now <ISO>]')
  let runDir = args['run-dir'] && args['run-dir'] !== true ? path.resolve(args['run-dir']) : null
  if (args.run && args.run !== true) runDir = downloadPacket(args.run, runDir || path.join(root, 'tmp', 'observer-packets', String(args.run)))
  const run = loadRunFolder(runDir)
  const bundle = loadCheckBundle(args.bundle && args.bundle !== true ? args.bundle : path.join(root, 'spec', 'check-bundle.generated.json'))
  const now = args.now && args.now !== true ? new Date(args.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new ObserverFilerError('MISSING_ARG', `--now must be an ISO datetime, got ${args.now}`)
  const apex = createApexClient({ env })
  let queue
  if (args.queue && args.queue !== true) queue = loadQueue(args.queue)
  else if (env.APEX_API_TOKEN) queue = await apex.listOpen()
  else throw new ObserverFilerError('MISSING_TOKEN', 'APEX_API_TOKEN is required to read the open queue; pass --queue <export.json> for an offline run')
  const plan = planObserverFindings({ run, bundle, queue, now })
  plan.mode = args.apply ? 'apply' : 'dry-run'
  plan.runDir = run.dir
  plan.queueSource = args.queue && args.queue !== true ? path.resolve(args.queue) : apex.v1Base
  const reportFile = args.report && args.report !== true ? path.resolve(args.report) : path.join(run.dir, 'filer-report.json')
  let applied = null
  if (args.apply) {
    if (!env.APEX_API_TOKEN) throw new ObserverFilerError('MISSING_TOKEN', 'APEX_API_TOKEN required for --apply')
    applied = await applyPlan(plan, { apex, env, log: io.log, writesFile: path.join(run.dir, 'filer-writes.jsonl') })
    plan.applied = { filed: applied.filed, attached: applied.attached, resolved: applied.resolved, skipped: applied.skipped, errors: applied.errors, writes: applied.writes.length, writesFile: path.join(run.dir, 'filer-writes.jsonl') }
  }
  fs.writeFileSync(reportFile, `${JSON.stringify(plan, null, 2)}\n`)
  const summary = { mode: plan.mode, runId: plan.runId, bundleVersion: plan.bundleVersion, bundleSha256: plan.bundleSha256, healthSource: plan.health.source, unhealthySources: Object.keys(plan.health.unhealthy), counts: plan.counts, report: reportFile,
    files: plan.files.map((f) => `${f.title} -> ${f.owner.name} (${f.owner.via})${f.owner.escalated ? ' [BLOCKED, protocol 1d]' : ''}; ${f.findings} finding(s), ${f.evidence.filter((e) => e.complete).length} evidence pair(s)`),
    decisionPending: plan.decisionPending.map((d) => `${d.check} ${d.scopeKey}: ${d.findings} finding(s) wait on ${d.decisionTicket}`),
    resolves: plan.resolves.map((r) => `${r.id} ${r.title.slice(0, 70)} (cleared on ${r.cleared.clearingRunIds.join(', ')})`),
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
