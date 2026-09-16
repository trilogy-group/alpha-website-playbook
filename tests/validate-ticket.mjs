#!/usr/bin/env node
/**
 * Validate APEX website tickets against spec/ticket-classes.json.
 *
 *   node tests/validate-ticket.mjs --file tickets.json            # array of APEX task objects, or {tasks:[...]}
 *   node tests/validate-ticket.mjs --file tickets.json --summary
 *   node tests/validate-ticket.mjs --file tickets.json --contract      # enforce spec/ticket-contract.json; report return-to-creator
 *
 * Output per ticket: class, scope, ready, missing fields, and the Missing Info note text.
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const spec = JSON.parse(fs.readFileSync(path.join(here, '../spec/ticket-classes.json'), 'utf8'))
const contract = JSON.parse(fs.readFileSync(path.join(here, '../spec/ticket-contract.json'), 'utf8'))
const media = JSON.parse(fs.readFileSync(path.join(here, '../registry/campus-open-media.json'), 'utf8'))
const campusPages = JSON.parse(fs.readFileSync(path.join(here, '../registry/campus-pages.json'), 'utf8')).campuses
function campusUrlFromText(text) {
  const t = String(text || '')
  let best = null
  for (const [slug, page] of Object.entries(campusPages)) for (const name of page.names) if (t.includes(name) && (!best || name.length > best.name.length)) best = { name, url: page.url }
  return best ? best.url : null
}
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]] : []).filter((x) => x.length))
if (!args.file) { console.error('Usage: validate-ticket.mjs --file tickets.json [--summary]'); process.exit(2) }
const raw = JSON.parse(fs.readFileSync(args.file, 'utf8'))
const tickets = Array.isArray(raw) ? raw : raw.tasks || raw.data || []
if (args.contract) {
  const rows = tickets.map((t) => ({ id: t.id, title: (t.title || '').slice(0, 90), ...contractCheck(t) }))
  const invalid = rows.filter((r) => !r.valid)
  console.log(`${rows.length} tickets; ${rows.length - invalid.length} satisfy the contract; ${invalid.length} return to creator`)
  const byCreator = {}
  for (const r of invalid) { byCreator[r.creator] ??= {}; for (const m of r.missing) byCreator[r.creator][m] = (byCreator[r.creator][m] || 0) + 1 }
  console.log(JSON.stringify(byCreator, null, 2))
  if (!args.summary) for (const r of invalid) console.log(`- ${r.id} [${r.creator}] missing ${r.missing.join(', ')} :: ${r.title}`)
  process.exit(invalid.length ? 1 : 0)
}

const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

export function classify(ticket) {
  const title = ticket.title || ''
  const wrt = ticket.originalSubmission?.websiteRequestType || ''
  for (const [name, cls] of Object.entries(spec.classes)) {
    if (cls.match.websiteRequestType && cls.match.websiteRequestType.includes(wrt)) return name
    if (cls.match.titlePattern && new RegExp(cls.match.titlePattern, 'i').test(title)) return name
    const detail = ticket.customFields?.requestDetail || ticket.originalSubmission?.requestDetail || ''
    if (cls.match.detailPattern && new RegExp(cls.match.detailPattern, 'i').test(detail)) return name
  }
  return 'unclassified'
}

function extract(ticket, fieldName) {
  const field = spec.fields[fieldName]
  const description = strip(ticket.description)
  for (const source of field.from) {
    if (source.startsWith('registry:campus-open-media')) {
      const url = extract(ticket, 'pageUrl')
      const slug = url ? new URL(url).pathname.replace(/^\/+|\/+$/g, '') : null
      const entry = slug ? media.campuses[slug] : null
      return entry && entry.status === 'placed' ? `${entry.openMedia}${entry.attachmentId ? ' #' + entry.attachmentId : ''}` : null
    }
    if (source === 'program:campus-pages') { const r = campusUrlFromText((ticket.program || []).join(' | ')); if (r) return r; continue }
    if (source === 'title:campus-pages') { const r = campusUrlFromText(ticket.title); if (r) return r; continue }
    const [pathPart, pattern] = source.split(/:(.+)/)
    let value
    if (pathPart === 'description') value = description
    else if (pathPart === 'title') value = ticket.title || ''
    else value = pathPart.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ticket)
    if (value == null || value === '') continue
    if (pattern) { const m = String(value).match(new RegExp(pattern, 'i')); if (m) return m[1].trim(); continue }
    return String(value).trim()
  }
  return null
}

// Contract check: does the ticket say what is wrong, who owns it, and how it ends, whoever filed it.
export function contractCheck(ticket) {
  const cf = ticket.customFields || {}
  const desc = String(ticket.description || '')
  const section = (label) => (desc.match(new RegExp(`^${label}:\\s*(.+)$`, 'mi')) || [])[1] || null
  const fields = {
    claim: ticket.title || null,
    page: ticket.url || section('Page'),
    element: section('Element') || cf.field || null,
    observed: section('Page shows[^:]*') || section('Observed'),
    expected: section('Expected'),
    source: section('Source') || (cf.source && cf.source !== 'alpha-site-qc' && cf.source !== 'agent-found' ? cf.source : null),
    class: cf.checkId && spec.classes[cf.checkId] ? cf.checkId : (section('Defect class') ? null : null),
    defectClass: cf.defectClass || (section('Defect class') || '').split('.')[0] || null,
    owner: (ticket.assignees && ticket.assignees.length === 1 && ticket.assignees[0].name) || (cf.ownerRole ? `${cf.ownerRole}` : null),
    fixPath: section('Fix path'),
    doneWhen: section('Done when'),
    evidence: section('Evidence') || cf.runId || null,
  }
  const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k)
  const sourceOk = fields.source && (/read \d{4}-\d{2}-\d{2}|not read/i.test(fields.source) || /\(read /.test(fields.source))
  if (fields.source && !sourceOk) missing.push('source.readAt')
  const creator = cf.source === 'alpha-site-qc' ? 'observer' : (cf.source === 'agent-found' ? 'agent' : (ticket.originalSubmission ? 'form' : 'unknown'))
  const suggestedOwners = typeof cf.owners === 'string' && cf.owners.includes(',')
  if (suggestedOwners && !(ticket.assignees && ticket.assignees.length === 1)) missing.push('owner (suggested list, not an owner)')
  return { valid: missing.length === 0, missing, creator, returnTo: missing.length ? contract.returnToCreator[creator] || 'creator' : null, fields }
}

export function validate(ticket) {
  const cls = classify(ticket)
  const def = spec.classes[cls]
  if (!def) return { id: ticket.id, title: ticket.title, class: cls, scope: 'unknown', ready: false, missing: ['classification'], note: 'Unclassified ticket: needs a website request type or a recognizable title.' }
  const missing = []
  const found = {}
  for (const f of def.required) { const v = extract(ticket, f); if (v) found[f] = v; else missing.push(f) }
  const ready = missing.length === 0
  const note = ready ? null : [`MISSING INFO (validator, ${new Date().toISOString().slice(0, 10)})`, 'This ticket needs the following before it can be executed:', ...missing.map((f, i) => `${i + 1}. ${spec.fields[f].missingText}`), 'The agent will execute and verify as soon as the items above are on the ticket.'].join('\n')
  return { id: ticket.id, title: ticket.title, status: ticket.status, class: cls, scope: def.scope, recipe: def.recipe, ready, missing, found, note }
}

const results = tickets.map(validate)
if (args.summary) {
  const by = {}
  for (const r of results) { const k = `${r.class} [${r.scope}]`; by[k] = by[k] || { total: 0, ready: 0 }; by[k].total++; if (r.ready) by[k].ready++ }
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].total - a[1].total)) console.log(`${String(v.ready).padStart(4)} ready / ${String(v.total).padStart(4)}  ${k}`)
  const missingCounts = {}
  for (const r of results) for (const m of r.missing) missingCounts[m] = (missingCounts[m] || 0) + 1
  console.log('most common missing inputs:', JSON.stringify(missingCounts))
} else {
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
}
