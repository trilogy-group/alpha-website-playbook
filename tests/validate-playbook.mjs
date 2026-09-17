#!/usr/bin/env node
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function filesUnder(directory, suffix) {
  const output = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) output.push(...filesUnder(full, suffix))
    else if (entry.name.endsWith(suffix)) output.push(full)
  }
  return output
}

function readJson(relative, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
  } catch (error) {
    errors.push(`${relative}: ${error.message}`)
    return null
  }
}

function duplicateValues(values) {
  const seen = new Set()
  const duplicates = new Set()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

function requireFields(object, fields, label, errors) {
  for (const field of fields) {
    if (object?.[field] === undefined || object?.[field] === null || object?.[field] === '') errors.push(`${label}: missing ${field}`)
  }
}

function validateSchemaValue(value, schema, label, errors) {
  if (!schema || typeof schema !== 'object') return
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${label}: value is not in schema enum`)
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${label}: expected object`)
      return
    }
    for (const key of schema.required || []) if (value[key] === undefined) errors.push(`${label}: schema requires ${key}`)
    for (const [key, child] of Object.entries(schema.properties || {})) if (value[key] !== undefined) validateSchemaValue(value[key], child, `${label}.${key}`, errors)
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${label}: expected array`)
      return
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${label}: expected at least ${schema.minItems} items`)
    value.forEach((item, index) => validateSchemaValue(item, schema.items, `${label}[${index}]`, errors))
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') errors.push(`${label}: expected string`)
    else if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${label}: does not match ${schema.pattern}`)
  } else if (schema.type === 'number' && typeof value !== 'number') errors.push(`${label}: expected number`)
  else if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${label}: expected boolean`)
}

export function runValidation() {
  const errors = []
  const warnings = []

  const requiredFiles = [
    'playbook/00-how-to-use.md',
    'docs/website-architecture.md',
    'docs/environments-and-identities.md',
    'docs/actor-capability-matrix.md',
    'protocols/production-and-staging.md',
    'protocols/rollback-and-incidents.md',
    'protocols/evidence-and-screenshots.md',
    'spec/source-authority.json',
    'spec/actor-capabilities.json',
    'spec/page-family-requirements.json',
    'registry/environments.json',
    'registry/plugins.json',
    'registry/templates.json',
    'registry/forms.json',
    'registry/redirects.json',
  ]
  for (const relative of requiredFiles) if (!fs.existsSync(path.join(root, relative))) errors.push(`required file missing: ${relative}`)

  const jsonFiles = filesUnder(root, '.json')
  for (const full of jsonFiles) {
    try { JSON.parse(fs.readFileSync(full, 'utf8')) } catch (error) { errors.push(`${path.relative(root, full)}: ${error.message}`) }
  }

  const ticketSpec = readJson('spec/ticket-classes.json', errors)
  const responsibilities = readJson('spec/responsibilities.json', errors)
  if (ticketSpec) {
    requireFields(ticketSpec, ['version', 'classes', 'fields'], 'spec/ticket-classes.json', errors)
    for (const [id, ticketClass] of Object.entries(ticketSpec.classes || {})) {
      requireFields(ticketClass, ['match', 'required', 'scope', 'doneWhen'], `ticket class ${id}`, errors)
      if (ticketClass.recipe) {
        const recipe = `protocols/recipes/${ticketClass.recipe}.md`
        if (!fs.existsSync(path.join(root, recipe))) errors.push(`ticket class ${id}: recipe missing ${recipe}`)
      }
      if (!responsibilities?.ticketRouting?.[id]) warnings.push(`ticket class ${id}: no responsibility route`)
      if (!responsibilities?.registryByTicketClass?.[id] && ticketClass.scope !== 'other-workflow') warnings.push(`ticket class ${id}: no input registry route`)
    }
  }

  const authority = readJson('spec/source-authority.json', errors)
  if (authority) {
    requireFields(authority, ['version', 'asOf', 'scope', 'fields'], 'spec/source-authority.json', errors)
    const ids = authority.fields?.map((row) => row.id) || []
    for (const id of duplicateValues(ids)) errors.push(`source-authority duplicate id: ${id}`)
    for (const row of authority.fields || []) requireFields(row,
      ['id', 'surface', 'authority', 'sourceLocator', 'delivery', 'destination', 'allowedEditors', 'refresh', 'conflictRule', 'ownerRole', 'verify', 'status'],
      `source authority ${row.id || '<unknown>'}`, errors)
  }

  const capabilities = readJson('spec/actor-capabilities.json', errors)
  if (capabilities) {
    requireFields(capabilities, ['version', 'asOf', 'scope', 'statuses', 'actors', 'alphaMcpToolInventory'], 'spec/actor-capabilities.json', errors)
    const actorIds = capabilities.actors?.map((actor) => actor.id) || []
    for (const id of duplicateValues(actorIds)) errors.push(`actor-capabilities duplicate actor id: ${id}`)
    const allowed = new Set(capabilities.statuses || [])
    for (const actor of capabilities.actors || []) {
      requireFields(actor, ['id', 'label', 'environment', 'operations', 'source', 'notes'], `actor ${actor.id || '<unknown>'}`, errors)
      for (const [operation, status] of Object.entries(actor.operations || {})) if (!allowed.has(status)) errors.push(`actor ${actor.id} operation ${operation}: unknown status ${status}`)
    }
    const tools = capabilities.alphaMcpToolInventory?.tools || []
    for (const id of duplicateValues(tools)) errors.push(`Alpha MCP duplicate tool: ${id}`)
  }

  const families = readJson('spec/page-family-requirements.json', errors)
  if (families) {
    requireFields(families, ['version', 'asOf', 'scope', 'families'], 'spec/page-family-requirements.json', errors)
    const ids = families.families?.map((family) => family.id) || []
    for (const id of duplicateValues(ids)) errors.push(`page-family duplicate id: ${id}`)
    for (const family of families.families || []) {
      requireFields(family, ['id', 'humanFile', 'knownObjectIds', 'required', 'sources', 'ownerRole', 'status'], `page family ${family.id || '<unknown>'}`, errors)
      if (family.humanFile && !fs.existsSync(path.join(root, family.humanFile))) errors.push(`page family ${family.id}: missing ${family.humanFile}`)
    }
  }

  const protocol = fs.readFileSync(path.join(root, 'protocols/apex-website-ticket-protocol.md'), 'utf8')
  const protocolIndex = fs.readFileSync(path.join(root, 'protocols/README.md'), 'utf8')
  const protocolVersion = protocol.match(/^Version ([0-9.]+)/m)?.[1]
  if (!protocolVersion) errors.push('protocol: version not found')
  else if (!protocolIndex.includes(`v${protocolVersion}`)) errors.push(`protocol README does not reference v${protocolVersion}`)

  const registryFiles = ['registry/environments.json', 'registry/plugins.json', 'registry/templates.json', 'registry/forms.json', 'registry/redirects.json', 'registry/owners.json', 'registry/global-runtime.json', 'registry/navigation.json']
  for (const relative of registryFiles) {
    const data = readJson(relative, errors)
    if (data) requireFields(data, ['version', 'asOf'], relative, errors)
  }

  const schemaTargets = [
    ['spec/source-authority.json', 'spec/schemas/source-authority.schema.json'],
    ['spec/actor-capabilities.json', 'spec/schemas/actor-capabilities.schema.json'],
    ['spec/page-family-requirements.json', 'spec/schemas/page-family-requirements.schema.json'],
  ]
  for (const [targetFile, schemaFile] of schemaTargets) {
    const target = readJson(targetFile, errors)
    const schema = readJson(schemaFile, errors)
    if (target && schema) validateSchemaValue(target, schema, targetFile, errors)
  }

  const staleMarkers = [
    ['README.md', 'Status: scaffolding'],
    ['spec/README.md', 'not written yet'],
    ['protocols/README.md', '(v0.2)'],
  ]
  for (const [relative, marker] of staleMarkers) if (fs.readFileSync(path.join(root, relative), 'utf8').includes(marker)) errors.push(`${relative}: stale marker ${marker}`)

  const unresolved = [
    ...(readJson('registry/owners.json', errors)?.gaps || []),
    ...(readJson('registry/templates.json', errors)?.gaps || []),
  ]
  if (unresolved.length) warnings.push(`${unresolved.length} explicit owner or inventory gaps remain and must stay fail-closed`)

  // Policy bundle, adapters, and release manifest (improvement plan workstreams 3, 5, 10).
  const bundle = readJson('spec/policy-bundle.generated.json', errors)
  const adapters = readJson('spec/adapters.json', errors)
  const manifest = readJson('spec/release-manifest.json', errors)
  const classes = readJson('spec/ticket-classes.json', errors)
  if (bundle && adapters && classes) {
    const built = spawnSync(process.execPath, [path.join(root, 'tests', 'build-policy.mjs'), '--check'], { encoding: 'utf8' })
    if (built.status !== 0) errors.push('policy bundle is stale: run node tests/build-policy.mjs')
    const mapped = new Set(Object.values(adapters.adapters || {}).flatMap((a) => a.ticketClasses || []))
    for (const id of Object.keys(classes.classes || {})) if (!id.startsWith('$') && !mapped.has(id)) errors.push(`ticket class ${id} maps to no adapter in spec/adapters.json`)
    for (const [id, a] of Object.entries(adapters.adapters || {})) for (const cls of a.ticketClasses || []) if (!classes.classes?.[cls]) errors.push(`adapter ${id} names unknown ticket class ${cls}`)
    if (manifest && manifest.policySha256 !== bundle.policySha256) errors.push('spec/release-manifest.json policySha256 does not match the policy bundle')
  }

  return { errors, warnings, jsonFiles: jsonFiles.length, requiredFiles: requiredFiles.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runValidation()
  process.stdout.write(`${JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2)}\n`)
  if (result.errors.length) process.exit(1)
}
