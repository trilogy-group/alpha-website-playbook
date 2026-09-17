#!/usr/bin/env node
/**
 * Telemetry report (improvement plan workstream 11): what the website agent did, from two data sources
 * that already exist: receipts stored in WordPress (list_receipts) and APEX website-family Requests.
 * Writes a markdown report; nothing is mutated.
 *
 * Usage: node tests/telemetry-report.mjs --since 2026-09-15 [--out docs/telemetry/2026-09-17.md]
 * Env: ALPHA_WP_BASE_URL, ALPHA_WP_USERNAME, ALPHA_WP_APPLICATION_PASSWORD (receipts); APEX_API_TOKEN (queue).
 */
import fs from 'node:fs'
import path from 'node:path'

const args = parse(process.argv.slice(2))
const since = args.since ? new Date(args.since) : new Date(Date.now() - 7 * 86400e3)
const out = args.out || path.join('docs', 'telemetry', `${new Date().toISOString().slice(0, 10)}.md`)

// Receipts
let receipts = []
if (process.env.ALPHA_WP_BASE_URL && process.env.ALPHA_WP_USERNAME && process.env.ALPHA_WP_APPLICATION_PASSWORD) {
  const url = new URL('/wp-json/alpha-mcp/v1/list-receipts', process.env.ALPHA_WP_BASE_URL)
  const auth = Buffer.from(`${process.env.ALPHA_WP_USERNAME}:${process.env.ALPHA_WP_APPLICATION_PASSWORD}`).toString('base64')
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ since: since.toISOString(), limit: 200 }) })
  if (res.ok) receipts = (await res.json()).receipts || []
  else console.error(`receipts: HTTP ${res.status}`)
}
const byOperation = count(receipts, (r) => r.operation)
const byResult = count(receipts, (r) => r.result)
const byTicket = count(receipts.filter((r) => r.apexTicketId), (r) => r.apexTicketId)
const byRun = count(receipts.filter((r) => r.runId), (r) => r.runId)

// APEX queue
let tickets = []
const base = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
if (process.env.APEX_API_TOKEN) {
  for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'MISSING_INFO', 'BLOCKED', 'FOR_REVIEW', 'COMPLETED']) {
    for (let page = 1; page <= 40; page++) {
      const res = await fetch(`${base}/tasks?status=${status}&page=${page}&pageSize=100`, { headers: { Authorization: `Bearer ${process.env.APEX_API_TOKEN}` } })
      if (!res.ok) break
      const d = await res.json(); const items = d.items || d.tasks || d.data || []
      tickets.push(...items); if (items.length < 100) break
    }
  }
}
const website = tickets.filter((t) => { const cf = t.customFields || {}; return t.requestType === 'website' || cf.requestFamily === 'website' || /^Website/.test(t.title || '') || ['website-agent', 'agent-found', 'alpha-site-qc'].includes(cf.source) })
const recent = website.filter((t) => new Date(t.updatedAt || t.createdAt) >= since)
const byStatus = count(website, (t) => t.status)
const recentByStatus = count(recent, (t) => t.status)
const completedRecent = recent.filter((t) => t.status === 'COMPLETED')
const completionTimes = completedRecent.map((t) => (new Date(t.completedAt || t.updatedAt) - new Date(t.originalCreatedAt || t.createdAt)) / 86400e3).filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b)
const median = completionTimes.length ? completionTimes[Math.floor(completionTimes.length / 2)] : null
const p95 = completionTimes.length ? completionTimes[Math.min(completionTimes.length - 1, Math.floor(completionTimes.length * 0.95))] : null
const withIntake = website.filter((t) => (t.customFields || {}).intakeHash)
const missingInfo = website.filter((t) => t.status === 'MISSING_INFO')

const md = `# Website agent telemetry (since ${since.toISOString().slice(0, 10)})

Generated ${new Date().toISOString()} by tests/telemetry-report.mjs from WordPress receipts and APEX website-family Requests. Read only.

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
| Median days request to completion (window) | ${median === null ? 'n/a' : median.toFixed(1)} |
| p95 days request to completion (window) | ${p95 === null ? 'n/a' : p95.toFixed(1)} |
| Carrying an intake contract (intakeHash) | ${withIntake.length} |
| Missing Info (waiting on a requester) | ${missingInfo.length} |

All by status:

${table(byStatus)}

Touched in the window by status:

${table(recentByStatus)}

## What is not measured yet

Refusal reasons per decision (needs the intake agent to attach its outcome as a structured field), complete-evidence rate (needs the APEX evidence gate to record evidence profiles), and recovery time from transient failures (needs the retry taxonomy). Each is an APEX-side item in the improvement plan.
`
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, md)
console.log(`wrote ${out}: ${receipts.length} receipts, ${website.length} website requests (${recent.length} in window)`)

function count(items, key) { const out = {}; for (const i of items) { const k = key(i) || 'unknown'; out[k] = (out[k] || 0) + 1 } return out }
function table(obj) { const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]); return rows.length ? ['| Key | Count |', '| --- | ---: |', ...rows.map(([k, v]) => `| ${k} | ${v} |`)].join('\n') : '_none_' }
function parse(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const key = argv[i].slice(2); const next = argv[i + 1]; out[key] = next === undefined || next.startsWith('--') ? true : (i++, next) } return out }
