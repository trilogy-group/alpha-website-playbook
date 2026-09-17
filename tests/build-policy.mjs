#!/usr/bin/env node
/**
 * Compile the playbook's machine-readable rules into one versioned policy bundle:
 * spec/policy-bundle.generated.json. The intake agent, the release check, and any runner read the
 * bundle only, so a playbook change is a policy change and two harnesses cannot decide differently.
 *
 * Sources: spec/ticket-classes.json, spec/responsibilities.json, spec/source-authority.json,
 * spec/actor-capabilities.json, spec/campus-page-field-map.json, spec/synced-targets.json,
 * spec/adapters.json, spec/observer-check-map.json, registry/people.json (roles and APEX ids only,
 * no emails), registry/missing-info-routing.json.
 *
 * Usage: node tests/build-policy.mjs [--check]   (--check exits 1 when the committed bundle is stale)
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.join(here, '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const check = process.argv.includes('--check')

const classesSpec = read('spec/ticket-classes.json')
const responsibilities = read('spec/responsibilities.json')
const sourceAuthority = read('spec/source-authority.json')
const actors = read('spec/actor-capabilities.json')
const fieldMap = read('spec/campus-page-field-map.json')
const synced = read('spec/synced-targets.json')
const adapters = read('spec/adapters.json')
const checkMap = read('spec/observer-check-map.json')
const people = read('registry/people.json').people
const missingInfoRouting = fs.existsSync(path.join(root, 'registry/missing-info-routing.json')) ? read('registry/missing-info-routing.json') : {}

// Evidence profiles: what a closure must attach, by class scope. Rendered evidence is mandatory for any
// closure that touches a public page (decision 2026-09-17).
const EVIDENCE = {
  website: ['mcp-receipt', 'rendered-controls-json-or-screenshots-desktop-mobile', 'page-check-json', 'verify-public-page'],
  'human-reviewed-website': ['mcp-receipt-or-operator-note', 'rendered-controls-json-or-screenshots-desktop-mobile', 'page-check-json', 'redirect-or-sitemap-evidence-when-status-changes'],
  hubspot: ['hubspot-property-history-or-apex-editor-record', 'nightly-run-reference', 'page-check-json-after-run'],
  sheet: ['sheet-row-reference', 'nightly-run-reference', 'page-check-json-after-run'],
  n8n: ['workflow-version-or-run-reference', 'page-check-json-after-run'],
  'packet-owner': ['approved-packet-link-logged-out-200', 'rendered-controls-json'],
  'event-owner': ['hubspot-event-reference', 'public-event-listing-check'],
  'elementor-owner': ['operator-note', 'rendered-controls-json-or-screenshots-desktop-mobile'],
  'observer-owner': ['observer-rerun-reference'],
  'multi-system-routing': ['owner-handoff-record'],
  'web-platform': ['owner-handoff-record'],
  'other-workflow': ['owner-handoff-record'],
  'human-reviewed-multi-system': ['owner-handoff-record', 'safe-qa-record'],
}

const STEPS = {
  website: (id, adapter) => [
    { id: 'diagnose', adapter: adapter || 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'immediate', evidence: 'get_element or page inventory read' },
    { id: 'prepare', adapter: adapter || 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'inputs complete', evidence: 'prepared diff limited to the declared scope' },
    { id: 'apply', adapter: adapter || 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'approved proposed hash', evidence: 'mcp-receipt' },
    { id: 'verify', adapter: adapter || 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'cache flushed', evidence: 'rendered-controls-json-or-screenshots-desktop-mobile, page-check-json' },
    { id: 'survive', adapter: 'n8n-sync', owner: 'website-agent-operator', wake: 'next nightly run (00:15 CT)', evidence: 'page-check-json-after-run' },
  ],
  hubspot: () => [
    { id: 'source-change', adapter: 'hubspot-programs', owner: 'hubspot-program-admin', wake: 'immediate', evidence: 'hubspot-property-history-or-apex-editor-record' },
    { id: 'publish', adapter: 'n8n-sync', owner: 'n8n-sync-owner', wake: 'next nightly run (00:15 CT)', evidence: 'nightly-run-reference' },
    { id: 'verify', adapter: 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'after the run', evidence: 'page-check-json-after-run, rendered-controls-json' },
  ],
  sheet: () => [
    { id: 'source-change', adapter: 'n8n-sync', owner: 'operations-sheet-owner', wake: 'immediate', evidence: 'sheet-row-reference' },
    { id: 'publish', adapter: 'n8n-sync', owner: 'n8n-sync-owner', wake: 'next nightly run (00:15 CT)', evidence: 'nightly-run-reference' },
    { id: 'verify', adapter: 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'after the run', evidence: 'page-check-json-after-run' },
  ],
  n8n: () => [
    { id: 'mapping-change', adapter: 'n8n-sync', owner: 'n8n-sync-owner', wake: 'immediate', evidence: 'workflow-version-or-run-reference' },
    { id: 'verify', adapter: 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'after the run', evidence: 'page-check-json-after-run' },
  ],
  'human-reviewed-website': (id, adapter) => [
    { id: 'approve', adapter: 'human-handoff', owner: 'website-operations', wake: 'immediate', evidence: 'approval note' },
    { id: 'apply', adapter: adapter || 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'approved', evidence: 'mcp-receipt-or-operator-note' },
    { id: 'verify', adapter: adapter || 'wordpress-alpha-mcp', owner: 'website-agent-operator', wake: 'cache flushed', evidence: 'rendered-controls-json-or-screenshots-desktop-mobile, redirect-or-sitemap-evidence-when-status-changes' },
  ],
}

const classes = {}
for (const [id, spec] of Object.entries(classesSpec.classes)) {
  if (id.startsWith('$')) continue
  const routing = responsibilities.ticketRouting?.[id] || {}
  const registry = responsibilities.registryByTicketClass?.[id] || null
  const adapter = Object.entries(adapters.adapters || {}).find(([, a]) => (a.ticketClasses || []).includes(id))?.[0] || null
  classes[id] = {
    match: spec.match || null,
    required: spec.required || [],
    recipe: spec.recipe || null,
    scope: spec.scope || 'unknown',
    note: spec.note || null,
    observerChecks: spec.observerChecks || [],
    routingLabel: spec.routingLabel || null,
    doneWhen: spec.doneWhen || null,
    supplies: routing.supplies || null,
    approves: routing.approves || null,
    executes: routing.executes || null,
    missingInfoGoesTo: registry?.missingInfoGoesTo || missingInfoRouting?.ticketClassMap?.[id] || null,
    adapter,
    evidenceProfile: EVIDENCE[spec.scope] || ['owner-handoff-record'],
    stopConditions: [
      'contract fails (tests/validate-ticket.mjs --contract)',
      'required inputs missing',
      ...(spec.scope === 'website' ? ['element not found exactly once', 'element is n8n-synced without a recorded override', 'requested value changes an admissions promise without the named approver'] : []),
      ...(adapter ? [] : ['no adapter: typed owner handoff only']),
    ],
    retryPolicy: spec.scope === 'website' ? { transient: 'retry up to 3 with fresh hash', stale: 'reprepare', conflict: 'stop and reread', unsupported: 'route', unauthorized: 'stop' } : { any: 'route to owner' },
    // Typed step graph per class (workstream 9): each step names its adapter, owner, wake condition, and evidence.
    steps: STEPS[spec.scope] ? STEPS[spec.scope](id, adapter) : [{ id: 'handoff', adapter: 'human-handoff', owner: routing.executes || 'owner', wake: 'owner reports completion', evidence: 'owner-handoff-record' }],
  }
}

const roleOwners = {}
for (const person of Object.values(people)) {
  for (const r of person.roles || []) {
    if (!roleOwners[r.role]) roleOwners[r.role] = []
    roleOwners[r.role].push({ name: person.name, apexUserId: person.apexUserId || null, hubspotOwnerId: person.hubspotOwnerId || null })
  }
}

const bundle = {
  $comment: 'Generated by tests/build-policy.mjs from the playbook specs and registries; do not edit by hand. Consumers: agent/intake.mjs, tests/check-release.mjs, the hosted worker.',
  bundleVersion: '1.0',
  generatedAt: new Date().toISOString(),
  playbookCommit: gitCommit(),
  sources: {
    ticketClasses: classesSpec.version, responsibilities: responsibilities.version, sourceAuthority: sourceAuthority.version, actorCapabilities: actors.version,
    fieldMap: fieldMap.version || null, syncedTargets: synced.version, adapters: adapters.version, people: read('registry/people.json').version || null,
  },
  classes,
  familyFilter: { requestFamily: 'website', titlePrefixes: ['Website'], sources: ['website-agent', 'agent-found', 'alpha-site-qc'], observerTitlePattern: '^Alpha [A-Z][A-Za-z .]+: ' },
  sourceAuthority: { precedence: sourceAuthority.precedence, fields: sourceAuthority.fields },
  actors: actors.actors,
  toolInventory: actors.alphaMcpToolInventory,
  fieldMap: fieldMap.elements,
  syncedCssIds: [...new Set([...Object.keys(synced.synced || {}), ...(synced.requiredIds || []), ...(synced.optionalIds || []), ...(synced.expectedOnCampusPages || [])].filter((id) => !id.includes('*')))].sort(),
  syncedOverrideSuffix: synced.overrideSuffix,
  adapters: adapters.adapters,
  observerCheckToElement: checkMap.checkToElement || {},
  roleOwners,
  roleFallback: { 'elementor-owner': 'website-operations', 'wordpress-admin': 'website-operations', 'growth-map-owner': 'expansion-new-programs', 'operations-sheet-owner': 'expansion-new-programs', 'community-app-owner': 'expansion-new-programs', 'marketing-collateral': 'website-operations', 'sister-site-owner': 'website-operations' },
  evidenceProfiles: EVIDENCE,
}
// Deterministic hash over everything except the timestamp and commit, so a rebuild without changes is a no-op.
const { generatedAt, playbookCommit, ...stable } = bundle
bundle.policySha256 = crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')

const out = path.join(root, 'spec/policy-bundle.generated.json')
const existing = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null
if (check) {
  if (!existing || existing.policySha256 !== bundle.policySha256) { console.error('policy bundle is stale; run node tests/build-policy.mjs'); process.exit(1) }
  console.log(`policy bundle current (${bundle.policySha256.slice(0, 12)}, ${Object.keys(classes).length} classes)`)
  process.exit(0)
}
if (existing && existing.policySha256 === bundle.policySha256) { bundle.generatedAt = existing.generatedAt; bundle.playbookCommit = existing.playbookCommit }
fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n')
console.log(`wrote spec/policy-bundle.generated.json: ${Object.keys(classes).length} classes, ${Object.keys(bundle.adapters || {}).length} adapters, policySha256 ${bundle.policySha256.slice(0, 12)}`)

function gitCommit() { try { return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim() } catch { return null } }
