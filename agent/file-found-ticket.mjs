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
 *
 * One id everywhere (QC loop repair plan 2026-09-25, repair 7): a payload's customFields.checkId (a tests/page-check.mjs id
 * such as open-intro-media-approved) is kept, and customFields.requirementId is written from the check bundle's
 * aliases.pageCheck (the row id, campus.intro.media.current; when one page-check id spans several rows the first is
 * requirementId and all of them are requirementIds). The class comes from the policy bundle the same way intake decides
 * it (agent/intake-policy.mjs classifyTicket: matchRequirementIds and matchCheckIds before the observer check name and
 * before any title pattern) and is recorded as customFields.triagedClass; the owner role, when the payload names none,
 * is the class's intake owner with the class's owner rules applied (an approved-media finding goes to website operations).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyTicket, ownerRuleMatches } from './intake-policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

export const FOUND_SOURCE = 'agent-found'

/** The check bundle's page-check aliases: page-check id -> row id or row ids (spec/check-bundle.generated.json aliases.pageCheck). */
export function loadPageCheckAliases(file = path.join(root, 'spec', 'check-bundle.generated.json')) {
  return readJson(file).aliases?.pageCheck || {}
}

/**
 * The requirement id (and ids) for a page-check or agent-found check id, from the bundle aliases; null when the id maps to
 * no row (the PR that adds the alias is the fix, never a guess here).
 */
export function requirementIdsForCheck(checkId, aliases) {
  const target = checkId ? aliases?.[checkId] : null
  if (!target) return null
  const ids = [].concat(target).filter((v) => typeof v === 'string' && v)
  return ids.length ? { requirementId: ids[0], requirementIds: ids } : null
}

/**
 * Prepare a found payload for filing: source, idempotency key, requirementId from the aliases (checkId kept), the class the
 * policy bundle decides (triagedClass; an existing triagedClass or ticketClass is kept) and, when the payload names no owner
 * role, the class's intake owner with its owner rules applied. Pure; returns a new payload and what it decided.
 */
export function prepareFoundPayload(raw, { policy, aliases = {} }) {
  const payload = { ...(raw.payload || raw) }
  const key = raw.idempotencyKey || payload.customFields?.idempotencyKey || null
  const customFields = { ...(payload.customFields || {}), source: payload.customFields?.source || FOUND_SOURCE, ...(key ? { idempotencyKey: key } : {}) }
  const checkId = customFields.checkId || null
  const mapped = requirementIdsForCheck(checkId, aliases)
  if (mapped && !customFields.requirementId) {
    customFields.requirementId = mapped.requirementId
    if (mapped.requirementIds.length > 1) customFields.requirementIds = mapped.requirementIds
  }
  const ticket = { ...payload, customFields, requestType: payload.requestType || 'Website QC' }
  const existingClass = customFields.triagedClass || customFields.ticketClass || null
  const classId = existingClass && policy.classes?.[existingClass] ? existingClass : classifyTicket(policy, ticket)
  if (classId && !customFields.triagedClass) customFields.triagedClass = classId
  let ownerVia = customFields.ownerRole ? 'payload' : null
  if (!customFields.ownerRole && classId) {
    const spec = policy.classes[classId]
    const rule = (spec.intake?.ownerRules || []).find((item) => ownerRuleMatches(item, ticket))
    const role = rule?.ownerRole || spec.intake?.ownerRole || null
    if (role) { customFields.ownerRole = role; ownerVia = rule ? `class ${classId} owner rule` : `class ${classId} intake owner` }
  }
  return { payload: { ...payload, customFields }, key, checkId, requirementId: customFields.requirementId || null, classId, ownerRole: customFields.ownerRole || null, ownerVia }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const policy = readJson(path.join(root, 'spec', 'policy-bundle.generated.json'))
  const aliases = loadPageCheckAliases()
  const base = (env.APEX_API_BASE || 'https://apex.2hourlearning.com/api/v1').replace(/\/+$/, '')
  const token = env.APEX_API_TOKEN
  const dryRun = argv.includes('--dry-run')
  const files = argv.filter((a) => !a.startsWith('--'))
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
    const owners = policy.roleOwners?.[role] || []
    const withId = owners.find((o) => o.apexUserId)
    if (withId) return { id: withId.apexUserId, name: withId.name, via: role }
    const fallbackRole = policy.roleFallback?.[role]
    if (fallbackRole) { const f = (policy.roleOwners?.[fallbackRole] || []).find((o) => o.apexUserId); if (f) return { id: f.apexUserId, name: f.name, via: `${role} -> ${fallbackRole}` } }
    return { id: fallbackOwner, name: 'Matt Barge', via: `${role || 'no role'} -> website-agent-operator` }
  }

  for (const file of files) {
    const prepared = prepareFoundPayload(readJson(file), { policy, aliases })
    const { payload, key, checkId } = prepared
    const dup = open.find((t) => (key && (t.customFields || {}).idempotencyKey === key))
      || open.find((t) => t.title === payload.title)
      || open.find((t) => checkId && payload.url && (t.customFields || {}).checkId === checkId && ((t.customFields || {}).pageUrl === payload.url || t.url === payload.url))
    if (dup) { console.log(`skip  ${path.basename(file)} -> existing ${dup.id} (${dup.status}) ${dup.title.slice(0, 60)}`); continue }
    const owner = ownerFor(payload.customFields.ownerRole)
    const body = { ...payload, status: payload.status || 'NOT_STARTED', priority: payload.priority || 'NORMAL' }
    delete body.assignees
    const ids = `${checkId ? `checkId ${checkId}` : 'no checkId'}${prepared.requirementId ? `, requirementId ${prepared.requirementId}` : ', no requirementId (add the alias to spec/check-rows.json aliases.pageCheck)'}; class ${prepared.classId || 'none'}${prepared.ownerVia ? ` (owner role via ${prepared.ownerVia})` : ''}`
    if (dryRun) { console.log(`would file ${path.basename(file)}: ${payload.title.slice(0, 70)} -> ${owner.name} (${owner.via}); ${ids}`); continue }
    const created = await apex('/tasks', { method: 'POST', body: JSON.stringify(body) })
    if (owner.id) await apex(`/tasks/${created.id}`, { method: 'PATCH', body: JSON.stringify({ assignees: { set: [{ id: owner.id }] } }) })
    console.log(`filed ${created.id} ${payload.title.slice(0, 70)} -> ${owner.name} (${owner.via}); ${ids}`)
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) main().catch((error) => { console.error(error.stack || error.message); process.exit(1) })
