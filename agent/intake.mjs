#!/usr/bin/env node
/**
 * Intake agent: runs on top of the APEX API on a schedule. For every website-family ticket created or changed since the
 * last run it validates against the contract, diagnoses the pathway when the element is known, sets class, defect class,
 * and the single owner, renders the body, and (with --apply) writes the result back. It never edits a page.
 *
 *   node agent/intake.mjs --since 2026-09-16T00:00:00Z [--status NOT_STARTED,MISSING_INFO,BLOCKED,IN_PROGRESS] [--limit 200] [--apply] [--report out.json]
 *   node agent/intake.mjs --file tickets.json --replay --report replay.json      # score the routing over a saved ticket set, no writes
 *
 * Env: APEX_API_TOKEN (APEX_API_BASE optional), HUBSPOT_SERVICE_KEY optional. Idempotent: a ticket whose customFields.intakeHash
 * equals the hash of the current decision is skipped unless --force.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { validate, classify } from '../tests/validate-ticket.mjs'
import { triageOne } from '../tests/triage-ticket.mjs'
import { renderBody } from '../tests/render-ticket.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const read = (p) => JSON.parse(fs.readFileSync(path.join(here, '..', p), 'utf8'))
// Policy comes from the compiled bundle only (tests/build-policy.mjs); the specs are its sources, never read here directly.
const bundle = read('spec/policy-bundle.generated.json')
const classes = bundle.classes
const responsibilities = { ticketRouting: Object.fromEntries(Object.entries(classes).map(([k, v]) => [k, { supplies: v.supplies, approves: v.approves, executes: v.executes }])) }
const roleOwners = bundle.roleOwners
const checkMap = bundle.observerCheckToElement || {}
const familyFilter = bundle.familyFilter
const base = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
const token = process.env.APEX_API_TOKEN
const args = parse(process.argv.slice(2))
const statuses = String(args.status || 'NOT_STARTED,MISSING_INFO,BLOCKED,IN_PROGRESS').split(',')
const VERSION = '0.1'
// Declared before the ticket loop: personFor runs inside top-level await and hit the temporal dead zone when a role needed a fallback.
const ROLE_FALLBACK = bundle.roleFallback

let tickets = []
if (args.file) { const raw = JSON.parse(fs.readFileSync(args.file, 'utf8')); tickets = Array.isArray(raw) ? raw : raw.tasks || raw.data || [] }
else {
  if (!token) { console.error('APEX_API_TOKEN required'); process.exit(2) }
  for (const st of statuses) { let page = 1; while (page <= 10) { const d = await apex(`/tasks?status=${st}&page=${page}&pageSize=100`); const items = d.items || d.tasks || d.data || []; tickets.push(...items); if (items.length < 100) break; page++ } }
}
// APEX users by email, so a Missing Info ticket can be assigned to its requester (decision, Matt Barge, 2026-09-17).
const apexUsersByEmail = new Map()
if (token && !args.replay) { try { const u = await apex('/users?limit=500'); for (const x of (u.users || u.data || (Array.isArray(u) ? u : []))) if (x.email && x.id) apexUsersByEmail.set(String(x.email).toLowerCase(), x) } catch (e) { console.error(`users lookup failed: ${e.message}`) } }
const rendered = args.rendered ? JSON.parse(fs.readFileSync(args.rendered, 'utf8')) : null
function renderedPassFor(url) { if (!rendered || !url) return false; const norm = (u) => String(u).replace(/\/+$/, '').toLowerCase(); const page = (rendered.results || []).find((p) => norm(p.url) === norm(url)); return !!page && page.checks.every((c) => c.result !== 'fail') }
const since = args.since ? new Date(args.since) : null
const website = tickets.filter(isWebsiteFamily).filter((t) => !since || new Date(t.updatedAt || t.createdAt) >= since).slice(0, Number(args.limit || 500))

// Release attestation: refuse to write when production disagrees with spec/release-manifest.json (workstream 3).
if (args.apply && !args['skip-release-check']) {
  const { spawnSync } = await import('node:child_process')
  const gate = spawnSync(process.execPath, [path.join(here, '..', 'tests', 'check-release.mjs')], { encoding: 'utf8', env: process.env })
  if (gate.status !== 0) { console.error('release check failed; refusing --apply\n' + (gate.stdout || '') + (gate.stderr || '')); process.exit(3) }
}
const results = []
for (const t of website) {
  const r = await decide(t)
  results.push(r)
  if (args.apply && r.patch && !r.skipped) {
    try { const w = await apex(`/tasks/${t.id}`, 'PATCH', r.patch); r.applied = { status: w.status, assignees: (w.assignees || []).map((a) => a.name) } }
    catch (e) { r.applied = { error: e.message } }
  }
}
const summary = summarize(results)
if (args.report) fs.writeFileSync(args.report, JSON.stringify({ version: VERSION, ranAt: new Date().toISOString(), mode: args.apply ? 'apply' : (args.replay ? 'replay' : 'dry-run'), since: args.since || null, summary, results }, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))

async function decide(t) {
  const cf = t.customFields || {}
  const v = validate(t)
  const cls = v.class === 'unclassified' ? null : v.class
  const spec = cls ? classes[cls] : null
  const scope = spec?.scope || 'unknown'
  const isObserver = cf.source === 'alpha-site-qc'
  const element = checkMap[cf.check] || (cls === 'observer-launch-copy' ? 'intro.status-sentence' : null)
  let decision = { id: t.id, title: (t.title || '').slice(0, 100), status: t.status, requester: t.requesterEmail || null, class: cls, scope, ready: v.ready, missing: v.missing, element, observer: isObserver }

  // 1. unclassifiable: stays with the website operators, reason recorded
  if (!cls) return finish(t, { ...decision, outcome: 'unclassifiable', ownerRole: 'website-agent-operator', note: 'no class matched; add a match pattern to spec/ticket-classes.json' })
  // 2. missing inputs: Missing Info, list, addressed to the requester; assignee unchanged until the requester round-trip exists
  if (!v.ready && scope === 'website') return finish(t, { ...decision, outcome: 'missing-info', ownerRole: 'website-agent-operator', newStatus: 'MISSING_INFO', note: v.note })
  // 3. automation-written or observer elements: pathway diagnosis and owner from the field map
  if (element && (t.url || '').startsWith('https://alpha.school/')) {
    const r = await triageOne(t, { element })
    if (!r.skipped) {
      // no defect on the page relative to its source: not for the source owner; the observer rerun clears it, operator reviews
      // A source-level match is not evidence a parent sees it (decision 2026-09-17). The status only moves to FOR_REVIEW when a
      // rendered-controls pass for this page is supplied via --rendered <json>; otherwise the ticket stays where it is with a note.
      if (r.defectClass === 'none') {
        const renderedPass = renderedPassFor(t.url || d.pageUrl)
        return finish(t, { ...decision, outcome: renderedPass ? 'no-defect' : 'needs-rendered-check', class: r.class, ownerRole: 'website-agent-operator', newStatus: renderedPass && t.status !== 'COMPLETED' ? 'FOR_REVIEW' : undefined, note: renderedPass ? `page already matches its source (${r.element}) and the rendered check passed; closes when the observer rerun clears the check` : `source matches (${r.element}) but no rendered check on file; run tests/rendered-controls.mjs before closing` })
      }
      if (r.defectClass === 'unknown') return finish(t, { ...decision, outcome: 'needs-rule', class: r.class, ownerRole: 'website-agent-operator', note: `no requirement rule for ${r.element} in this state yet; add it to spec/campus-page-requirements.json` })
      return { ...decision, outcome: 'diagnosed', defectClass: r.defectClass, class: r.class, ownerRole: r.ownerRole, owner: r.owner, patch: r.patch, body: r.body }
    }
  }
  // 4. source-side and other-workflow classes: owner from routing
  const ownerRole = spec.assignTo || (responsibilities.ticketRouting[cls]?.executes || '').split(/[ ;(,]/)[0] || (scope === 'website' ? 'website-agent-operator' : null)
  return finish(t, { ...decision, outcome: scope === 'website' ? 'ready-for-execution' : 'routed', ownerRole })
}

function personFor(role) { let r = role; for (let i = 0; i < 3 && r; i++) { const p = (roleOwners[r] || []).find((x) => x.apexUserId); if (p) return { person: p, role: r }; r = ROLE_FALLBACK[r] } return { person: null, role } }
function finish(t, d) {
  const resolved = personFor(d.ownerRole); const owner = resolved.person; if (owner && resolved.role !== d.ownerRole) d.ownerRoleResolved = resolved.role
  const cf = t.customFields || {}
  const hash = crypto.createHash('sha256').update(JSON.stringify([VERSION, d.class, d.outcome, d.ownerRole, d.missing, d.newStatus])).digest('hex').slice(0, 16)
  if (cf.intakeHash === hash && !args.force) return { ...d, owner: owner?.name || null, skipped: 'unchanged since last intake' }
  const history = (Array.isArray(cf.history) ? cf.history : []).concat(`${new Date().toISOString().slice(0, 10)} intake agent: ${d.outcome}; class ${d.class || 'none'}; owner ${d.ownerRole || 'none'}${owner ? ` (${owner.name})` : ''}${d.newStatus ? `; status ${d.newStatus}` : ''}`)
  const contract = {
    claim: t.title, page: t.url || d.pageUrl || 'see request', element: d.element || (classes[d.class]?.recipe || d.class || 'unclassified'), state: null,
    observed: stripHtml(cf.requestDetail || t.originalSubmission?.requestDetail || t.description || '').slice(0, 600), pageModified: null,
    source: 'request as filed' + (d.observer ? ' by the observer' : ' by the requester'), expected: d.missing?.length ? `the inputs listed under Fix path` : (classes[d.class]?.note || 'per the class recipe'), rule: d.class ? `spec/ticket-classes.json ${d.class}` : null,
    defectClass: d.outcome === 'missing-info' ? 'incomplete' : 'presentation', reason: d.note || (d.outcome === 'routed' ? `not a website page edit; owned by ${d.ownerRole}` : 'validated, inputs complete'),
    class: d.class || 'unclassified', ownerRole: d.ownerRole, ownerName: owner?.name,
    fixPath: d.outcome === 'missing-info' ? `Requester (${t.requesterEmail || 'unknown'}) supplies: ${d.missing.join(', ')}. Then the website agent executes the ${d.class} recipe.` : (d.outcome === 'routed' ? `${d.ownerRole} handles this in its own system; the website agent verifies any public result.` : `website agent executes protocols/recipes/${classes[d.class]?.recipe || d.class}.md through the Alpha WordPress MCP`),
    doneWhen: classes[d.class]?.doneWhen || 'the observer rerun clears the check', evidence: `intake agent ${VERSION} ${new Date().toISOString().slice(0, 10)}`, history, playbook: `spec/ticket-classes.json ${d.class}; protocol step 0 and 1`,
  }
  const body = renderBody(contract)
  const requesterUser = d.outcome === 'missing-info' && t.requesterEmail ? apexUsersByEmail.get(String(t.requesterEmail).toLowerCase()) : null
  const assigneeIds = [owner?.apexUserId, requesterUser?.id].filter(Boolean).filter((id, i, a) => a.indexOf(id) === i)
  if (requesterUser) d.requesterAssigned = requesterUser.name || requesterUser.email
  const patch = { description: body, customFields: { ...cf, checkId: d.class || cf.checkId, ownerRole: d.ownerRole, contractVersion: '1.0', intakeHash: hash, intakeVersion: VERSION, history }, ...(assigneeIds.length ? { assignees: { set: assigneeIds.map((id) => ({ id })) } } : {}), ...(d.newStatus && d.newStatus !== t.status ? { status: d.newStatus } : {}) }
  return { ...d, owner: owner?.name || null, patch, body }
}

function isWebsiteFamily(t) { const cf = t.customFields || {}; const f = familyFilter; return cf.requestFamily === f.requestFamily || f.titlePrefixes.some((p) => (t.title || '').startsWith(p)) || (f.sources.includes(cf.source) && (cf.source !== 'alpha-site-qc' || /^https:\/\/alpha\.school\//.test(t.url || ''))) || new RegExp(f.observerTitlePattern).test(t.title || '') }
function summarize(rs) {
  const by = (k) => rs.reduce((a, r) => { const v = r[k] || 'none'; a[v] = (a[v] || 0) + 1; return a }, {})
  return { tickets: rs.length, outcomes: by('outcome'), classes: by('class'), owners: by('owner'), skipped: rs.filter((r) => r.skipped).length, applied: rs.filter((r) => r.applied && !r.applied.error).length, errors: rs.filter((r) => r.applied?.error).map((r) => ({ id: r.id, error: r.applied.error })) }
}
function stripHtml(s) { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }
async function apex(p, method = 'GET', body) { const res = await fetch(base + p, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const text = await res.text(); if (!res.ok) throw new Error(`APEX ${method} ${p} ${res.status}: ${text.slice(0, 160)}`); const j = JSON.parse(text); return j.task || j }
function parse(argv) { const o = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const k = argv[i].slice(2); const n = argv[i + 1]; o[k] = n === undefined || n.startsWith('--') ? true : (i++, n) } return o }
