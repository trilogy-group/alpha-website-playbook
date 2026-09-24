#!/usr/bin/env node
/**
 * Telemetry report (improvement plan workstream 11; QC loop redesign plan workstreams 4 and 8): what the website
 * agent did and how precise the observer was, from data that already exists: receipts stored in WordPress
 * (list_receipts) and APEX website-family Requests. Writes a markdown report; nothing is mutated.
 *
 * Usage: node tests/telemetry-report.mjs --since 2026-09-15 [--until 2026-09-24T23:59:59Z] [--label pre-redesign]
 *          [--receipts-file receipts.json] [--tickets-file tickets.json] [--out docs/telemetry/<date>.md]
 * Env: ALPHA_WP_BASE_URL, ALPHA_WP_USERNAME, ALPHA_WP_APPLICATION_PASSWORD (receipts); APEX_API_TOKEN (queue).
 *
 * Precision section (read only): observer tickets filed in [since, until]: customFields.source alpha-site-qc (the observer's
 * own tickets) or agent-found with a filerRunId (tickets agent/file-observer-findings.mjs filed from a packet).
 *   precision            = tickets that ended in a site change (an applied mutation receipt carrying the ticket id),
 *                          a source change (an audit line on the ticket), or a recorded decision (Blocked with
 *                          DECISION NEEDED, or customFields.resolutionKind blocked-decision), divided by tickets filed
 *   false-positive rate  = resolutionKind false-positive / filed
 *   fixed-elsewhere rate = resolutionKind fixed-elsewhere / filed
 *   median days open     = closed tickets to completedAt, open tickets to the report time
 * per observer run (customFields.runId), per observer check (customFields.check, else the filer's customFields.observerCheck),
 * and for the whole period.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const OBSERVER_SOURCE = 'alpha-site-qc'
export const FILER_SOURCE = 'agent-found'
export const RESOLUTION_KINDS = ['fixed-elsewhere', 'false-positive', 'aged-out', 'blocked-decision', 'check-retired', 'check-cleared']
export const CLOSED_STATUSES = new Set(['COMPLETED', 'CANCELLED'])
/** Mutation receipts: a write to the site. Prepare, regenerate, flush and purge are not changes on their own. */
export const SITE_CHANGE_OPERATION = /^(apply-|upload-|replace-|set-|create-|delete-|restore-|update-)/
export const AUDIT_LINE = /\b(SOURCE FIX|SOURCE CHANGE|AUDIT LINE|AUDIT:|HUBSPOT WRITE)\b/i
export const DECISION_LINE = /\bDECISION NEEDED\b/

export function stripHtml(text) { return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }

export function isWebsiteTicket(t) {
  const cf = t.customFields || {}
  return t.requestType === 'website' || cf.requestFamily === 'website' || /^Website/.test(t.title || '') || ['website-agent', 'agent-found', OBSERVER_SOURCE].includes(cf.source)
}
/** The observer's own tickets, and the filer's (agent-found with a non-empty filerRunId; agent-found without one is a sweep agent's find). */
export function isObserverTicket(t) {
  const cf = t.customFields || {}
  if (cf.source === OBSERVER_SOURCE) return true
  return cf.source === FILER_SOURCE && typeof cf.filerRunId === 'string' && cf.filerRunId.trim() !== ''
}

export function receiptsByTicket(receipts) {
  const out = new Map()
  for (const r of receipts || []) {
    if (!r || !r.apexTicketId) continue
    if (!out.has(r.apexTicketId)) out.set(r.apexTicketId, [])
    out.get(r.apexTicketId).push(r)
  }
  return out
}

/**
 * One outcome per ticket. `ended` is the evidence-backed end the precision numerator counts (site-change,
 * source-change, decision) or null; `kind` is the recorded resolutionKind (or null).
 */
export function classifyOutcome(ticket, byTicket, now = new Date()) {
  const cf = ticket.customFields || {}
  const kind = RESOLUTION_KINDS.includes(cf.resolutionKind) ? cf.resolutionKind : (cf.resolutionKind ? `other:${cf.resolutionKind}` : null)
  const text = stripHtml(ticket.description)
  const siteChange = (byTicket.get(ticket.id) || []).some((r) => r.result === 'applied' && SITE_CHANGE_OPERATION.test(r.operation || ''))
  // A recorded false-positive or aged-out says no change happened; it wins over a text match on the description
  // (an unrelated SOURCE FIX note, say) but never over an applied receipt.
  const kindDeniesTextMatch = kind === 'false-positive' || kind === 'aged-out'
  const sourceChange = !kindDeniesTextMatch && (AUDIT_LINE.test(text) || cf.resolutionKind === 'source-changed')
  const decision = kind === 'blocked-decision' || (!kindDeniesTextMatch && ticket.status === 'BLOCKED' && DECISION_LINE.test(text))
  const ended = siteChange ? 'site-change' : sourceChange ? 'source-change' : decision ? 'decision' : null
  const created = new Date(ticket.originalCreatedAt || ticket.createdAt)
  const closed = CLOSED_STATUSES.has(ticket.status)
  const end = closed ? new Date(ticket.completedAt || ticket.updatedAt || now) : now
  const daysOpen = Number.isFinite(created.getTime()) ? Math.max(0, (end - created) / 86400e3) : null
  return { id: ticket.id, status: ticket.status, closed, kind, ended, siteChange, sourceChange, decision, daysOpen, runId: cf.runId || cf.filerRunId || null, check: cf.check || cf.observerCheck || null }
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

export function summarize(outcomes) {
  const filed = outcomes.length
  const count = (fn) => outcomes.filter(fn).length
  const ended = count((o) => o.ended)
  const s = {
    filed,
    ended,
    siteChange: count((o) => o.ended === 'site-change'),
    sourceChange: count((o) => o.ended === 'source-change'),
    decision: count((o) => o.ended === 'decision'),
    falsePositive: count((o) => o.kind === 'false-positive'),
    fixedElsewhere: count((o) => o.kind === 'fixed-elsewhere'),
    agedOut: count((o) => o.kind === 'aged-out'),
    checkRetired: count((o) => o.kind === 'check-retired' || o.kind === 'check-cleared'),
    unclassified: count((o) => !o.kind && !o.ended),
    open: count((o) => !o.closed),
    medianDaysOpen: median(outcomes.map((o) => o.daysOpen)),
  }
  s.precision = filed ? s.ended / filed : null
  s.falsePositiveRate = filed ? s.falsePositive / filed : null
  s.fixedElsewhereRate = filed ? s.fixedElsewhere / filed : null
  return s
}

export function groupSummaries(outcomes, keyOf) {
  const groups = new Map()
  for (const o of outcomes) { const k = keyOf(o) || 'unknown'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o) }
  return [...groups.entries()].map(([key, items]) => ({ key, ...summarize(items) })).sort((a, b) => b.filed - a.filed || String(a.key).localeCompare(String(b.key)))
}

export function precisionReport(tickets, receipts, { since, until, now = new Date() } = {}) {
  const byTicket = receiptsByTicket(receipts)
  const inWindow = tickets.filter(isObserverTicket).filter((t) => {
    const created = new Date(t.originalCreatedAt || t.createdAt)
    return (!since || created >= since) && (!until || created <= until)
  })
  const outcomes = inWindow.map((t) => classifyOutcome(t, byTicket, now))
  return { period: summarize(outcomes), byRun: groupSummaries(outcomes, (o) => o.runId), byCheck: groupSummaries(outcomes, (o) => o.check), outcomes }
}

const pct = (x) => (x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(1)}%`)
const days = (x) => (x === null || x === undefined ? 'n/a' : x.toFixed(1))

export function receiptsFrom(receipts) {
  const stamps = (receipts || []).map((r) => r && r.timestamp).filter(Boolean).sort()
  return stamps.length ? stamps[0] : null
}

export function renderPrecisionSection(report, { since, until, label, receiptsFrom: earliest } = {}) {
  const p = report.period
  const window = `${since ? since.toISOString().slice(0, 10) : 'start'} to ${until ? until.toISOString().slice(0, 10) : 'now'}`
  const receiptNote = earliest ? ` The receipt store's earliest receipt is ${String(earliest).slice(0, 10)}; a site change before that date leaves no receipt and is not counted.` : ' No receipts were available, so no site change is counted.'
  const groupTable = (rows, header) => rows.length
    ? [`| ${header} | Filed | Precision | Site change | Source change | Decision | False positive | Fixed elsewhere | Aged out | Retired or cleared | Unclassified | Open | Median days open |`,
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...rows.map((r) => `| ${r.key} | ${r.filed} | ${pct(r.precision)} | ${r.siteChange} | ${r.sourceChange} | ${r.decision} | ${r.falsePositive} | ${r.fixedElsewhere} | ${r.agedOut} | ${r.checkRetired} | ${r.unclassified} | ${r.open} | ${days(r.medianDaysOpen)} |`)].join('\n')
    : '_none_'
  return `## Observer precision (${label ? `${label}, ` : ''}tickets filed ${window})

Precision is the share of observer tickets that ended in a site change (an applied mutation receipt carrying the ticket id), a source change (an audit line on the ticket), or a recorded decision (Blocked with DECISION NEEDED, or \`customFields.resolutionKind\` blocked-decision). False-positive and fixed-elsewhere rates read \`customFields.resolutionKind\`. Median days open counts closed tickets to completion and open tickets to the report time.${receiptNote}

| Measure | Value |
| --- | ---: |
| Observer tickets filed | ${p.filed} |
| Precision | ${pct(p.precision)} (${p.ended} of ${p.filed}) |
| Ended in a site change | ${p.siteChange} |
| Ended in a source change | ${p.sourceChange} |
| Ended in a recorded decision | ${p.decision} |
| False-positive rate | ${pct(p.falsePositiveRate)} (${p.falsePositive}) |
| Fixed-elsewhere rate | ${pct(p.fixedElsewhereRate)} (${p.fixedElsewhere}) |
| Aged out | ${p.agedOut} |
| Check retired or cleared | ${p.checkRetired} |
| Unclassified (no resolutionKind, no evidence-backed end) | ${p.unclassified} |
| Still open | ${p.open} |
| Median days open | ${days(p.medianDaysOpen)} |

Per observer run (\`customFields.runId\`):

${groupTable(report.byRun, 'Observer run')}

Per observer check (\`customFields.check\`, or the filer's \`customFields.observerCheck\`):

${groupTable(report.byCheck, 'Check')}
`
}

export function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const key = argv[i].slice(2); const next = argv[i + 1]; out[key] = next === undefined || next.startsWith('--') ? true : (i++, next) } return out }

export function count(items, key) { const out = {}; for (const i of items) { const k = key(i) || 'unknown'; out[k] = (out[k] || 0) + 1 } return out }
export function table(obj) { const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]); return rows.length ? ['| Key | Count |', '| --- | ---: |', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n') : '_none_' }

export async function loadReceipts(args, since, env = process.env) {
  if (args['receipts-file']) { const d = JSON.parse(fs.readFileSync(args['receipts-file'], 'utf8')); return Array.isArray(d) ? d : d.receipts || [] }
  if (env.ALPHA_WP_BASE_URL && env.ALPHA_WP_USERNAME && env.ALPHA_WP_APPLICATION_PASSWORD) {
    const url = new URL('/wp-json/alpha-mcp/v1/list-receipts', env.ALPHA_WP_BASE_URL)
    const auth = Buffer.from(`${env.ALPHA_WP_USERNAME}:${env.ALPHA_WP_APPLICATION_PASSWORD}`).toString('base64')
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ since: since.toISOString(), limit: 200 }) })
    if (res.ok) return (await res.json()).receipts || []
    console.error(`receipts: HTTP ${res.status}`)
  }
  return []
}

export async function loadTickets(args, env = process.env) {
  if (args['tickets-file']) { const d = JSON.parse(fs.readFileSync(args['tickets-file'], 'utf8')); return Array.isArray(d) ? d : d.items || d.tasks || d.data || [] }
  const tickets = []
  const base = (env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
  if (!env.APEX_API_TOKEN) return tickets
  for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'MISSING_INFO', 'BLOCKED', 'FOR_REVIEW', 'COMPLETED', 'CANCELLED']) {
    for (let page = 1; page <= 40; page++) {
      const res = await fetch(`${base}/tasks?status=${status}&page=${page}&pageSize=100`, { headers: { Authorization: `Bearer ${env.APEX_API_TOKEN}` } })
      if (!res.ok) break
      const d = await res.json(); const items = d.items || d.tasks || d.data || []
      tickets.push(...items); if (items.length < 100) break
    }
  }
  return [...new Map(tickets.map((t) => [t.id, t])).values()]
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv)
  const now = new Date()
  const since = args.since ? new Date(args.since) : new Date(Date.now() - 7 * 86400e3)
  const until = args.until ? new Date(args.until) : null
  const out = args.out || path.join('docs', 'telemetry', `${now.toISOString().slice(0, 10)}.md`)

  const receipts = await loadReceipts(args, since, env)
  const byOperation = count(receipts, (r) => r.operation)
  const byResult = count(receipts, (r) => r.result)
  const byTicket = count(receipts.filter((r) => r.apexTicketId), (r) => r.apexTicketId)
  const byRun = count(receipts.filter((r) => r.runId), (r) => r.runId)

  const tickets = await loadTickets(args, env)
  const website = tickets.filter(isWebsiteTicket)
  const recent = website.filter((t) => new Date(t.updatedAt || t.createdAt) >= since && (!until || new Date(t.updatedAt || t.createdAt) <= until))
  const byStatus = count(website, (t) => t.status)
  const recentByStatus = count(recent, (t) => t.status)
  const completedRecent = recent.filter((t) => t.status === 'COMPLETED')
  const completionTimes = completedRecent.map((t) => (new Date(t.completedAt || t.updatedAt) - new Date(t.originalCreatedAt || t.createdAt)) / 86400e3).filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b)
  const medianCompletion = completionTimes.length ? completionTimes[Math.floor(completionTimes.length / 2)] : null
  const p95 = completionTimes.length ? completionTimes[Math.min(completionTimes.length - 1, Math.floor(completionTimes.length * 0.95))] : null
  const withIntake = website.filter((t) => (t.customFields || {}).intakeHash)
  const missingInfo = website.filter((t) => t.status === 'MISSING_INFO')
  const precision = precisionReport(website, receipts, { since, until, now })

  const md = `# Website agent telemetry (since ${since.toISOString().slice(0, 10)}${until ? ` until ${until.toISOString().slice(0, 10)}` : ''})

Generated ${now.toISOString()} by tests/telemetry-report.mjs from WordPress receipts and APEX website-family Requests. Read only.

## Writes to alpha.school (WordPress receipts)

| Measure | Value |
| --- | ---: |
| Receipts stored | ${receipts.length} |
| Applied | ${byResult.applied || 0} |
| Idempotent replays (noop) | ${byResult.noop || 0} |
| Distinct tickets written | ${Object.keys(byTicket).length} |
| Distinct runs | ${Object.keys(byRun).length} |

By operation:

${table(byOperation)}

## Queue (APEX website-family Requests)

| Measure | Value |
| --- | ---: |
| Open or completed website Requests seen | ${website.length} |
| Touched since ${since.toISOString().slice(0, 10)} | ${recent.length} |
| Completed in the window | ${completedRecent.length} |
| Median days request to completion (window) | ${medianCompletion === null ? 'n/a' : medianCompletion.toFixed(1)} |
| p95 days request to completion (window) | ${p95 === null ? 'n/a' : p95.toFixed(1)} |
| Carrying an intake contract (intakeHash) | ${withIntake.length} |
| Missing Info (waiting on a requester) | ${missingInfo.length} |

All by status:

${table(byStatus)}

Touched in the window by status:

${table(recentByStatus)}

${renderPrecisionSection(precision, { since, until, label: args.label, receiptsFrom: receiptsFrom(receipts) })}
## What is not measured yet

Refusal reasons per decision (needs the intake agent to attach its outcome as a structured field), complete-evidence rate (needs the APEX evidence gate to record evidence profiles), and recovery time from transient failures (needs the retry taxonomy). Each is an APEX-side item in the improvement plan. Precision per shadow run (redesign workstream 8) needs the filer to write \`resolutionKind: check-cleared\` and the run id on auto-resolved tickets.
`
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, md)
  console.log(`wrote ${out}: ${receipts.length} receipts, ${website.length} website requests (${recent.length} in window), observer precision ${pct(precision.period.precision)} over ${precision.period.filed} filed`)
  return { out, precision }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1) })
}
