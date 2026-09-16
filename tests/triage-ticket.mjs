#!/usr/bin/env node
/**
 * Bring an existing APEX ticket up to the contract: diagnose the pathway, set class, defect class, and owner, regenerate the body,
 * and assign the owner's APEX user. Dry-run by default; --apply writes to APEX.
 *
 *   node tests/triage-ticket.mjs --id <apexTaskId> [--id ...] [--element <field-map key>] [--status BLOCKED] [--related <id>] [--note "..."] [--apply]
 *   node tests/triage-ticket.mjs --file tickets.json [--apply]
 *
 * Element resolution: --element, else spec/observer-check-map.json checkToElement[customFields.check], else intro.status-sentence for
 * launch-copy titles. Requires APEX_API_TOKEN (and APEX_API_BASE) for --id and --apply; HUBSPOT_SERVICE_KEY optional for a direct source read.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { renderBody } from './render-ticket.mjs'

const here = path.dirname(new URL(import.meta.url).pathname)
const read = (p) => JSON.parse(fs.readFileSync(path.join(here, '..', p), 'utf8'))
const classes = read('spec/ticket-classes.json').classes
const checkMap = read('spec/observer-check-map.json').checkToElement || {}
const people = read('registry/people.json').people
const responsibilities = read('spec/responsibilities.json')
const campusPages = read('registry/campus-pages.json').campuses
function campusUrlFromText(text) { let best = null; for (const [slug, page] of Object.entries(campusPages)) for (const name of page.names) if (String(text || '').includes(name) && (!best || name.length > best.name.length)) best = { name, url: page.url }; return best ? best.url : null }
const base = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
const token = process.env.APEX_API_TOKEN

const isMain = process.argv[1] && process.argv[1].endsWith('triage-ticket.mjs')
const args = isMain ? parse(process.argv.slice(2)) : {}
const ids = [].concat(args.id || [])
let tickets = []
if (args.file) { const raw = JSON.parse(fs.readFileSync(args.file, 'utf8')); tickets = Array.isArray(raw) ? raw : raw.tasks || raw.data || [] }
for (const id of ids) tickets.push(await apex(`/tasks/${id}`))
if (isMain && !tickets.length) { console.error('Usage: triage-ticket.mjs --id <id> | --file tickets.json [--element key] [--status S] [--related id] [--note text] [--apply]'); process.exit(2) }

export async function triageOne(t, args = {}) {
  const cf = t.customFields || {}
  let url = t.url || (t.description || '').match(/Page: (https?:\/\/[^\s]+)/)?.[1]
  if (!url || !/^https:\/\/alpha\.school\//.test(url)) url = campusUrlFromText(t.title) || url
  const element = args.element || checkMap[cf.check] || (/launch copy|launching|coming soon/i.test(t.title || '') ? 'intro.status-sentence' : null)
  if (!url || !/^https:\/\/alpha\.school\//.test(url) || !element) { return { id: t.id, skipped: `no alpha.school url or element (url=${url}, check=${cf.check})` } }
  const dxFile = path.join(process.env.TMPDIR || '/tmp', `dx-${t.id}.json`)
  let dx
  const expectedFromTitle = (t.title || '').match(/HubSpot (?:email|phone|tuition) is ([^,]+),/)?.[1]
  const extra = expectedFromTitle ? ['--expected', expectedFromTitle.trim()] : []
  try { execFileSync('node', [path.join(here, 'diagnose-field.mjs'), '--url', url, '--element', element, '--json', dxFile, ...extra], { stdio: 'ignore' }); dx = JSON.parse(fs.readFileSync(dxFile, 'utf8')) }
  catch (e) { return { id: t.id, skipped: `diagnosis failed: ${e.message}` } }

  const ticketClass = args.class || dx.ticketClass || classify(t)
  const cls = classes[ticketClass] || {}
  const ownerRole = args['owner-role'] || dx.ownerRole || (responsibilities.ticketRouting[ticketClass]?.executes || '').split(/[ ;(]/)[0]
  const owner = Object.values(people).find((p) => p.roles.some((r) => r.role === ownerRole) && p.apexUserId) || (dx.owner ? Object.values(people).find((p) => p.email === dx.owner.email) : null)
  const history = Array.isArray(cf.history) ? cf.history.slice() : historyFromBody(t.description || '')
  history.push(`${new Date().toISOString().slice(0, 10)} website agent: triaged to ${ticketClass} (${dx.defectClass}); owner ${ownerRole}${owner ? ` (${owner.name})` : ''}${args.status ? `; status ${args.status}` : ''}${args.note ? `; ${args.note}` : ''}`)
  const contract = {
    claim: t.title, page: url, element, cssId: dx.cssId, writer: dx.writer, state: dx.state, stateSource: dx.stateSource,
    observed: dx.page.value, pageModified: dx.page.modified,
    source: dx.source.value !== null ? `${dx.source.system} ${[].concat(dx.source.fields).join(', ')} = "${dx.source.value}" (read ${dx.source.readAt})` : `${dx.source.system} ${[].concat(dx.source.fields || []).join(', ')} not read: ${dx.source.note}${dx.page.rewrittenByNightlyRun ? '; page value is the source value after the nightly run' : ''}`,
    expected: dx.expected.value || dx.expected.rule, rule: dx.expected.value ? dx.expected.rule : null, derivation: dx.derivation,
    defectClass: dx.defectClass, reason: dx.reason, class: ticketClass, ownerRole, ownerName: owner?.name,
    fixPath: dx.ticket?.description.match(/Fix path: (.+)/)?.[1] || responsibilities.ticketRouting[ticketClass]?.executes || 'see class',
    doneWhen: cls.doneWhen || 'the observer rerun clears the check', evidence: `diagnose-field ${element} ${new Date().toISOString().slice(0, 10)}${(cf.externalId || '').replace('alpha-site-observer:', '') ? `; observer ${(cf.externalId || '').replace('alpha-site-observer:', '')}` : ''}${cf.runId ? ` run ${cf.runId}` : ''}`,
    related: [].concat(args.related || []), playbook: `spec/campus-page-field-map.json ${element}; protocol step 0 and 1b`, history,
  }
  const body = renderBody(contract)
  const patch = { description: body, customFields: { ...cf, checkId: ticketClass, defectClass: dx.defectClass, ownerRole, contractVersion: '1.0', history, element }, ...(owner ? { assignees: { set: [{ id: owner.apexUserId }] } } : {}), ...(args.status ? { status: args.status } : {}) }
  let applied = null
  if (args.apply) { try { const r = await apex(`/tasks/${t.id}`, 'PATCH', patch); applied = { status: r.status, assignees: (r.assignees || []).map((a) => a.name) } } catch (e) { applied = { error: e.message } } }
  return { id: t.id, url, element, defectClass: dx.defectClass, class: ticketClass, ownerRole, owner: owner?.name || null, status: args.status || t.status, applied, body: args.apply ? undefined : body, contract, patch }
}

if (isMain) {
  const results = []
  for (const t of tickets) results.push(await triageOne(t, args))
  console.log(JSON.stringify(results, null, 2))
}

function classify(t) { const title = t.title || ''; for (const [name, c] of Object.entries(classes)) if (c.match?.titlePattern && new RegExp(c.match.titlePattern, 'i').test(title)) return name; return 'observer-fact-sync' }
function historyFromBody(desc) {
  const out = []
  for (const m of desc.matchAll(/^--- ([A-Z][A-Z ]*?)\s*(?:\(([^)]*)\))?\s*(\d{4}-\d{2}-\d{2})?\s*(?:\(([^)]*)\))?\s*---\n([^\n]+)/gm)) {
    const date = m[3] || (m[2] || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || ''
    const actor = (m[4] || m[2] || '').replace(/,?\s*\d{4}-\d{2}-\d{2}/, '').trim()
    out.push(`${date} ${m[1].toLowerCase()}${actor ? ` (${actor})` : ''}: ${m[5].slice(0, 140)}`.trim())
  }
  if (!out.length && desc.trim()) out.push(`filed: ${desc.split('\n')[0].slice(0, 140)}`)
  return out
}
async function apex(p, method = 'GET', body) {
  if (!token) throw new Error('APEX_API_TOKEN required')
  const res = await fetch(base + p, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  if (!res.ok) throw new Error(`APEX ${method} ${p} ${res.status}: ${text.slice(0, 200)}`)
  const j = JSON.parse(text); return j.task || j
}
function parse(argv) { const o = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const k = argv[i].slice(2); const n = argv[i + 1]; const v = n === undefined || n.startsWith('--') ? true : (i++, n); if (k === 'id' || k === 'related') o[k] = [].concat(o[k] || [], v); else o[k] = v } return o }
