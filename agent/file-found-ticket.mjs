#!/usr/bin/env node
/**
 * File an agent-found defect as an APEX Request (protocol step 8; decision 2026-09-19: the agent files these itself).
 *
 *   node agent/file-found-ticket.mjs evidence/found-*.json [--dry-run]
 *
 * Each file holds either the payload itself or { idempotencyKey, payload }. Deduplicates against open tickets by
 * customFields.idempotencyKey, then by exact title, then by page URL plus checkId; existing matches are reported and
 * skipped. The owner comes from the payload's customFields.ownerRole through the policy bundle's roleOwners, else
 * the website agent operator (Matt Barge). Env: APEX_API_TOKEN (APEX_API_BASE optional).
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const bundle = JSON.parse(fs.readFileSync(path.join(here, '..', 'spec', 'policy-bundle.generated.json'), 'utf8'))
const base = (process.env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
const token = process.env.APEX_API_TOKEN
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const files = args.filter((a) => !a.startsWith('--'))
if (!token) { console.error('APEX_API_TOKEN required'); process.exit(2) }
if (!files.length) { console.error('Usage: file-found-ticket.mjs <payload.json> [...] [--dry-run]'); process.exit(2) }

async function apex(pathname, init = {}) {
  const res = await fetch(base + pathname, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { data = text }
  if (!res.ok) throw new Error(`APEX ${res.status} ${pathname}: ${JSON.stringify(data).slice(0, 300)}`)
  return data?.data ?? data
}

const open = []
for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'MISSING_INFO', 'BLOCKED', 'FOR_REVIEW']) {
  for (let page = 1; page <= 20; page++) {
    const d = await apex(`/tasks?status=${status}&page=${page}&pageSize=100`)
    const items = Array.isArray(d) ? d : (d.items || [])
    open.push(...items); if (items.length < 100) break
  }
}
const users = await apex('/users')
const userByName = new Map((Array.isArray(users) ? users : users.items || []).map((u) => [u.name, u.id]))
const fallbackOwner = userByName.get('Matt Barge') || userByName.get('Matthew Barge')

function ownerFor(role) {
  const owners = bundle.roleOwners?.[role] || []
  const withId = owners.find((o) => o.apexUserId)
  if (withId) return { id: withId.apexUserId, name: withId.name, via: role }
  const fallbackRole = bundle.roleFallback?.[role]
  if (fallbackRole) { const f = (bundle.roleOwners?.[fallbackRole] || []).find((o) => o.apexUserId); if (f) return { id: f.apexUserId, name: f.name, via: `${role} -> ${fallbackRole}` } }
  return { id: fallbackOwner, name: 'Matt Barge', via: `${role || 'no role'} -> website-agent-operator` }
}

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const payload = raw.payload || raw
  const key = raw.idempotencyKey || payload.customFields?.idempotencyKey || null
  payload.customFields = { ...(payload.customFields || {}), source: payload.customFields?.source || 'agent-found', ...(key ? { idempotencyKey: key } : {}) }
  const checkId = payload.customFields.checkId || null
  const dup = open.find((t) => (key && (t.customFields || {}).idempotencyKey === key))
    || open.find((t) => t.title === payload.title)
    || open.find((t) => checkId && payload.url && (t.customFields || {}).checkId === checkId && ((t.customFields || {}).pageUrl === payload.url || t.url === payload.url))
  if (dup) { console.log(`skip  ${path.basename(file)} -> existing ${dup.id} (${dup.status}) ${dup.title.slice(0, 60)}`); continue }
  const owner = ownerFor(payload.customFields.ownerRole)
  const body = { ...payload, status: payload.status || 'NOT_STARTED', priority: payload.priority || 'NORMAL' }
  delete body.assignees
  if (dryRun) { console.log(`would file ${path.basename(file)}: ${payload.title.slice(0, 70)} -> ${owner.name} (${owner.via})`); continue }
  const created = await apex('/tasks', { method: 'POST', body: JSON.stringify(body) })
  if (owner.id) await apex(`/tasks/${created.id}`, { method: 'PATCH', body: JSON.stringify({ assignees: { set: [{ id: owner.id }] } }) })
  console.log(`filed ${created.id} ${payload.title.slice(0, 70)} -> ${owner.name} (${owner.via})`)
}
