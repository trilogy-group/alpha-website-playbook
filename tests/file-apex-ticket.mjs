#!/usr/bin/env node
/**
 * Build (and optionally file) an APEX website ticket for a defect found while working another ticket.
 * Protocol step 8. Dry-run by default: prints the payload and exits. Pass --create to POST it.
 *
 *   node tests/file-apex-ticket.mjs --parent cmtm... --url https://alpha.school/tulsa/ --campus "Alpha Tulsa" \
 *     --title "Alpha Tulsa: info packet link returns 401" --expected "public, reachable packet" --observed "Google Drive link returns 401" \
 *     --evidence "page-check cta-links-resolve 2026-09-15" --requirement campus.resources.packet-reachable --path "packet owner (Yash/Dmitry)" \
 *     --done "packet link returns 200 logged out" [--priority HIGH] [--requester you@alpha.school] [--create]
 *
 * Env for --create: APEX_API_TOKEN (and optionally APEX_API_BASE, default https://apex.2hourlearning.com/api/v1).
 */
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] === undefined || arr[i + 1].startsWith('--') ? true : arr[i + 1]] : []).filter((x) => x.length))
import fs from 'node:fs'
import path from 'node:path'
const here = path.dirname(new URL(import.meta.url).pathname)
const people = JSON.parse(fs.readFileSync(path.join(here, '../registry/people.json'), 'utf8')).people
// --from-diagnosis <json from tests/diagnose-field.mjs>: fill the fields from the diagnosis; --assign <email[,email]> connects APEX users
if (args['from-diagnosis']) {
  const dx = JSON.parse(fs.readFileSync(args['from-diagnosis'], 'utf8'))
  if (!dx.ticket) { console.error('diagnosis has no ticket (defect class ' + dx.defectClass + ')'); process.exit(2) }
  Object.assign(args, { url: dx.url, title: dx.ticket.title, expected: dx.expected.value || dx.expected.rule, observed: dx.page.value, evidence: `tests/diagnose-field.mjs ${dx.element} ${new Date().toISOString().slice(0, 10)}; page modified ${dx.page.modified}`, requirement: `field-map ${dx.element}`, path: dx.ticket.description.split('Fix path: ')[1]?.split('\n')[0] || dx.ticketClass, done: 'the public page shows the expected value after the next n8n run', description: dx.ticket.description, checkId: dx.ticketClass, parent: args.parent || 'loop', campus: args.campus || dx.ticket.title.match(/: (Alpha [A-Za-z .]+?) /)?.[1] }, args.assign ? {} : { assign: dx.ticket.assignTo || '' })
}
const required = ['parent', 'url', 'title', 'expected', 'observed', 'evidence', 'requirement', 'path', 'done']
const missing = required.filter((k) => !args[k])
if (missing.length) { console.error(`Missing: ${missing.join(', ')}`); process.exit(2) }
if (!/^https:\/\/alpha\.school\//.test(args.url)) { console.error('url must be an alpha.school page'); process.exit(2) }
const slug = new URL(args.url).pathname.replace(/^\/+|\/+$/g, '') || 'home'
const requirement = String(args.requirement)
const idempotencyKey = `agent-found:${args.parent}:${slug}:${requirement}`
const payload = {
  title: args.title,
  description: [args.title, `Page: ${args.url}`, '', `Expected: ${args.expected}`, `Observed: ${args.observed}`, `Evidence: ${args.evidence}`, `Found while working: ${args.parent}`, `Playbook: ${requirement}`, `Recommended path: ${args.path}`, `Done when: ${args.done}`].join('\n'),
  url: args.url,
  requestType: args.requestType || 'Website QC',
  workflow: 'website-maintenance',
  program: [args.campus || 'Alpha School'],
  requesterEmail: args.requester || process.env.APEX_QC_REQUESTER_EMAIL || 'matthew.barge@superbuilders.school',
  status: 'NOT_STARTED',
  priority: args.priority || 'NORMAL',
  customFields: { source: 'agent-found', foundWhileWorking: args.parent, checkId: args.checkId || requirement, severity: args.priority === 'HIGH' ? 'high' : 'medium', owners: args.owners || '', idempotencyKey },
}
if (args.description) payload.description = args.description + `\n\nFound while working: ${args.parent}\nIdempotency: ${idempotencyKey}`
const assignEmails = String(args.assign || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
if (assignEmails.length) {
  const ids = assignEmails.map((e) => Object.values(people).find((p) => [p.email, ...(p.altEmails || [])].map((x) => String(x || '').toLowerCase()).includes(e))?.apexUserId).filter(Boolean)
  if (ids.length !== assignEmails.length) { console.error(`no apexUserId in registry/people.json for: ${assignEmails.filter((e) => !Object.values(people).find((p) => String(p.email || '').toLowerCase() === e && p.apexUserId)).join(', ')}`); process.exit(2) }
  payload.assignees = { connect: ids.map((id) => ({ id })) }
}
if (!args.create) { console.log(JSON.stringify({ dryRun: true, idempotencyKey, payload }, null, 2)); process.exit(0) }
const base = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
const token = process.env.APEX_API_TOKEN
if (!token) { console.error('APEX_API_TOKEN is required for --create'); process.exit(2) }
const res = await fetch(`${base}/tasks`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload) })
const text = await res.text()
if (!res.ok) { console.error(`APEX create failed (${res.status}): ${text.slice(0, 300)}`); process.exit(1) }
const body = JSON.parse(text)
console.log(JSON.stringify({ created: true, id: body.id || body.taskId || null, status: body.status || null, url: body.id ? `https://apex.2hourlearning.com/tasks/${body.id}` : null }, null, 2))
