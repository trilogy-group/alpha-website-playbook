#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateReviewSpec } from '../agent/notice-review.mjs'
import { OUTPUT as CHECK_BUNDLE, buildBundle, observerCheckNames } from './build-checks.mjs'
import { EM_DASH, analyzeTemplate, closingNoteLines, renderTemplate, renderTitle, reviewLine } from '../agent/ticket-templates.mjs'
import { checkDocExamples } from './render-templates-examples.mjs'

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

export function validateSchemaValue(value, schema, label, errors, root = schema) {
  if (!schema || typeof schema !== 'object') return
  if (schema.$ref) {
    const target = schema.$ref.startsWith('#/') ? schema.$ref.slice(2).split('/').reduce((cursor, part) => cursor?.[part], root) : null
    if (!target) { errors.push(`${label}: unresolvable $ref ${schema.$ref}`); return }
    return validateSchemaValue(value, target, label, errors, root)
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${label}: value is not in schema enum`)
  if (Array.isArray(schema.anyOf)) {
    // One alternative must validate cleanly; report the failure of the closest one (fewest errors).
    const attempts = schema.anyOf.map((alt) => { const local = []; validateSchemaValue(value, alt, label, local, root); return local })
    if (!attempts.some((local) => local.length === 0)) errors.push(...attempts.sort((a, b) => a.length - b.length)[0])
    return
  }
  if (Array.isArray(schema.type)) {
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    if (!schema.type.includes(actual)) errors.push(`${label}: expected one of ${schema.type.join('|')}`)
    return
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${label}: expected object`)
      return
    }
    for (const key of schema.required || []) if (value[key] === undefined) errors.push(`${label}: schema requires ${key}`)
    for (const [key, child] of Object.entries(schema.properties || {})) if (value[key] !== undefined) validateSchemaValue(value[key], child, `${label}.${key}`, errors, root)
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const [key, child] of Object.entries(value)) if (!schema.properties?.[key] && !key.startsWith('$')) validateSchemaValue(child, schema.additionalProperties, `${label}.${key}`, errors, root)
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${label}: expected array`)
      return
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${label}: expected at least ${schema.minItems} items`)
    value.forEach((item, index) => validateSchemaValue(item, schema.items, `${label}[${index}]`, errors, root))
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') errors.push(`${label}: expected string`)
    else if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${label}: does not match ${schema.pattern}`)
  } else if (schema.type === 'number') {
    if (typeof value !== 'number') errors.push(`${label}: expected number`)
    else if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${label}: below minimum ${schema.minimum}`)
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') errors.push(`${label}: expected boolean`)
}

/**
 * spec/ticket-templates.json beyond the schema: every unconditional placeholder is in `required` and every required field
 * appears in a line; no template carries an em dash; every example renders; a closing note (protocolSection exactly "7")
 * starts with rules.closingLines and ends with rules.reviewLine.
 */
export function validateTicketTemplates(templates) {
  const errors = []
  const closing = closingNoteLines(templates)
  for (const [name, t] of Object.entries(templates.templates || {})) {
    const label = `ticket template ${name}`
    const { unconditional, optional } = analyzeTemplate(t)
    const required = new Set(t.required || [])
    for (const field of unconditional) if (!required.has(field)) errors.push(`${label}: placeholder {${field}} is always rendered but not in required`)
    for (const field of required) if (!unconditional.includes(field) && !optional.includes(field)) errors.push(`${label}: required field ${field} appears in no line`)
    const texts = [t.title, ...(t.lines || []).map((line) => (typeof line === 'string' ? line : line.text))].filter((s) => typeof s === 'string')
    if (texts.some((s) => s.includes(EM_DASH))) errors.push(`${label}: carries an em dash`)
    try {
      renderTemplate(name, t.example, templates)
      if (t.title) renderTitle(name, t.example, templates)
    } catch (error) { errors.push(`${label}: example does not render (${error.message})`) }
    if (t.protocolSection === '7') {
      const first = (t.lines || []).slice(0, closing.length)
      if (JSON.stringify(first) !== JSON.stringify(closing)) errors.push(`${label}: a section 7 closing note must start with the closing lines ${JSON.stringify(closing)}`)
      if ((t.lines || []).at(-1) !== reviewLine(templates)) errors.push(`${label}: a section 7 closing note must end with "${reviewLine(templates)}"`)
    }
  }
  return errors
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
  const intakePolicy = readJson('spec/intake-policy.json', errors)
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

  if (ticketSpec && intakePolicy) {
    requireFields(intakePolicy, ['version', 'asOf', 'siteScope', 'statuses', 'fieldSources', 'classes', 'duplicates'], 'spec/intake-policy.json', errors)
    requireFields(intakePolicy.siteScope, ['publicHosts', 'excludedPattern', 'action', 'reason'], 'spec/intake-policy.json siteScope', errors)
    try { new RegExp(intakePolicy.siteScope?.excludedPattern, 'i') } catch (error) { errors.push(`spec/intake-policy.json siteScope: invalid excludedPattern (${error.message})`) }
    const classIds = Object.keys(ticketSpec.classes || {}).filter((id) => !id.startsWith('$')).sort()
    const intakeClassIds = Object.keys(intakePolicy.classes || {}).sort()
    for (const id of classIds.filter((id) => !intakeClassIds.includes(id))) errors.push(`intake policy missing ticket class ${id}`)
    for (const id of intakeClassIds.filter((id) => !classIds.includes(id))) errors.push(`intake policy names unknown ticket class ${id}`)

    const allowedPolicies = new Set(['allowed', 'internal-review', 'disallowed'])
    const allowedQueues = new Set(['execution', 'owner'])
    const allowedKinds = new Set(['requester', 'derivable', 'system'])
    const allowedResponseTypes = new Set(['short_text', 'long_text', 'email', 'url', 'date', 'file', 'choice'])
    for (const [id, policy] of Object.entries(intakePolicy.classes || {})) {
      requireFields(policy, ['policy', 'ownerRole', 'queue'], `intake policy ${id}`, errors)
      if (!allowedPolicies.has(policy.policy)) errors.push(`intake policy ${id}: unknown policy ${policy.policy}`)
      if (!allowedQueues.has(policy.queue)) errors.push(`intake policy ${id}: unknown queue ${policy.queue}`)
      for (const [kind, rules] of [['guard', policy.guards], ['owner rule', policy.ownerRules]]) {
        for (const [index, rule] of (rules || []).entries()) {
          requireFields(rule, ['pattern', 'ownerRole', 'reason'], `intake policy ${id} ${kind} ${index}`, errors)
          try { new RegExp(rule.pattern, 'i') } catch (error) { errors.push(`intake policy ${id} ${kind} ${index}: invalid pattern (${error.message})`) }
          if (rule.policy && !allowedPolicies.has(rule.policy)) errors.push(`intake policy ${id} ${kind} ${index}: unknown policy ${rule.policy}`)
        }
      }
      for (const [index, rule] of (policy.conditionalRequired || []).entries()) {
        requireFields(rule, ['pattern', 'fields', 'reason'], `intake policy ${id} conditional requirement ${index}`, errors)
        try { new RegExp(rule.pattern, 'i') } catch (error) { errors.push(`intake policy ${id} conditional requirement ${index}: invalid pattern (${error.message})`) }
        if (!Array.isArray(rule.fields) || !rule.fields.length) errors.push(`intake policy ${id} conditional requirement ${index}: fields must be a non-empty array`)
        for (const field of rule.fields || []) if (!intakePolicy.fieldSources?.[field]) errors.push(`intake policy ${id} conditional requirement ${index}: unknown field ${field}`)
      }
    }

    const requirementKeys = new Map()
    for (const [field, source] of Object.entries(intakePolicy.fieldSources || {})) {
      requireFields(source, ['kind'], `intake field ${field}`, errors)
      if (!allowedKinds.has(source.kind)) errors.push(`intake field ${field}: unknown kind ${source.kind}`)
      if (source.kind !== 'requester') continue
      requireFields(source, ['requirement'], `intake requester field ${field}`, errors)
      requireFields(source.requirement, ['key', 'label', 'prompt', 'responseType', 'required', 'validation'], `intake requester field ${field} requirement`, errors)
      if (!allowedResponseTypes.has(source.requirement?.responseType)) errors.push(`intake requester field ${field}: unsupported response type ${source.requirement?.responseType}`)
      if (source.requirement?.responseType === 'file' && source.requirement?.key !== 'headshot') errors.push(`intake requester field ${field}: APEX only accepts file clarification for the headshot key`)
      const key = source.requirement?.key
      if (key && requirementKeys.has(key)) errors.push(`intake requester fields ${requirementKeys.get(key)} and ${field} reuse requirement key ${key}`)
      else if (key) requirementKeys.set(key, field)
    }
    for (const [id, ticketClass] of Object.entries(ticketSpec.classes || {})) {
      if (id.startsWith('$')) continue
      for (const field of ticketClass.required || []) {
        if (!intakePolicy.fieldSources?.[field]) errors.push(`ticket class ${id}: required field ${field} has no intake source`)
      }
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

  const registryFiles = ['registry/environments.json', 'registry/plugins.json', 'registry/templates.json', 'registry/forms.json', 'registry/redirects.json', 'registry/owners.json', 'registry/global-runtime.json', 'registry/navigation.json', 'registry/observer-checks.json']
  for (const relative of registryFiles) {
    const data = readJson(relative, errors)
    if (data) requireFields(data, ['version', 'asOf'], relative, errors)
  }

  const schemaTargets = [
    ['spec/source-authority.json', 'spec/schemas/source-authority.schema.json'],
    ['spec/actor-capabilities.json', 'spec/schemas/actor-capabilities.schema.json'],
    ['spec/page-family-requirements.json', 'spec/schemas/page-family-requirements.schema.json'],
    ['spec/brand-visual.json', 'spec/schemas/brand-visual.schema.json'],
    ['spec/check-bundle.generated.json', 'spec/schemas/check-bundle.schema.json'],
    ['spec/ticket-templates.json', 'spec/schemas/ticket-templates.schema.json'],
  ]
  for (const [targetFile, schemaFile] of schemaTargets) {
    const target = readJson(targetFile, errors)
    const schema = readJson(schemaFile, errors)
    if (target && schema) validateSchemaValue(target, schema, targetFile, errors)
  }

  // Ticket templates: the wording of every protocol note and body lives in spec/ticket-templates.json. Each template's
  // `required` list names every unconditional placeholder (and only fields the lines use), its example renders, no line
  // carries an em dash, and a closing note (protocolSection exactly "7") starts with the four closing lines and ends with
  // the review line. The protocol and runbook quote the templates; a quoted block that differs from the renderer fails here.
  const templates = readJson('spec/ticket-templates.json', errors)
  if (templates?.templates) {
    errors.push(...validateTicketTemplates(templates))
    for (const problem of checkDocExamples(templates)) errors.push(problem)
  }

  // Visual brand: the canonical logo files must be the ones the spec hashes, every colourway file must be listed, and
  // the palette must carry the four blues the guide names (a typo in a hex would silently loosen the check).
  const brand = readJson('spec/brand-visual.json', errors)
  if (brand) {
    const assetsDir = path.join(root, brand.logo?.assetsDir || 'playbook/brand/assets')
    for (const asset of brand.logo?.assets || []) {
      const file = path.join(assetsDir, asset.file)
      if (!fs.existsSync(file)) { errors.push(`brand-visual asset missing: ${asset.file}`); continue }
      const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      if (actual !== asset.sha256) errors.push(`brand-visual asset ${asset.file}: sha256 ${actual.slice(0, 12)} does not match the spec (${String(asset.sha256).slice(0, 12)})`)
    }
    const listed = new Set((brand.logo?.assets || []).map((a) => a.file))
    for (const colourway of brand.logo?.colourways || []) for (const file of colourway.files || []) if (!listed.has(file)) errors.push(`brand-visual colourway ${colourway.id} names unlisted file ${file}`)
    for (const hex of ['#110068', '#0D4AD1', '#418BE9', '#00BCFF', '#FFFFFF', '#000000']) if (!(brand.palette || []).some((p) => p.hex === hex)) errors.push(`brand-visual palette is missing ${hex}`)
    for (const id of ['positioning', 'commitment-1', 'commitment-2', 'commitment-3', 'stat-love-school', 'stat-vacation']) if (!(brand.approvedClaims?.claims || []).some((c) => c.id === id)) errors.push(`brand-visual approved claims missing ${id}`)
    if (!fs.existsSync(path.join(root, 'playbook/brand/README.md'))) errors.push('required file missing: playbook/brand/README.md')
    if (!fs.existsSync(path.join(root, 'playbook/site/visual-brand.md'))) errors.push('required file missing: playbook/site/visual-brand.md')
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

  // Requester notice review gate (decision 2026-09-23): mode, reviewer, reactions, flag rules, ledger location.
  const reviewSpec = readJson('spec/requester-notices.json', errors)
  if (reviewSpec) for (const problem of validateReviewSpec(reviewSpec)) errors.push(`spec/requester-notices.json: ${problem}`)

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
    if (manifest && intakePolicy) {
      const scheduled = new Set(manifest.supportedOperations?.['scheduled-apex-alpha-mcp'] || [])
      for (const [id, policy] of Object.entries(intakePolicy.classes || {})) {
        if (policy.queue === 'execution' && !scheduled.has(id)) errors.push(`intake policy ${id}: execution queue is not in the scheduled Alpha MCP release allowlist`)
      }
      for (const id of scheduled) if (intakePolicy.classes?.[id]?.queue !== 'execution') errors.push(`scheduled Alpha MCP operation ${id}: intake policy does not route it to execution`)
    }
  }

  // Check bundle (QC loop redesign 2026-09-24, workstream 1): every observer check has a row or a retirement, the
  // committed bundle matches the rows, and the release manifest carries its hash.
  const checkBundle = readJson(CHECK_BUNDLE, errors)
  if (checkBundle) {
    const built = buildBundle()
    for (const problem of built.errors) errors.push(`check bundle: ${problem}`)
    if (!built.errors.length && built.bundle.sha256 !== checkBundle.sha256) errors.push('check bundle is stale: run node tests/build-checks.mjs')
    if (bundle && checkBundle.policySha256 !== bundle.policySha256) errors.push('check bundle was compiled against a different policy bundle: run node tests/build-checks.mjs')
    const covered = new Set([...(checkBundle.rows || []).map((r) => r.observerCheck), ...(checkBundle.retired || []).map((r) => r.observerCheck)])
    for (const name of observerCheckNames()) if (!covered.has(name)) errors.push(`observer check ${name} has no row and no retirement in ${CHECK_BUNDLE}`)
    if (manifest && manifest.checkBundleSha256 !== checkBundle.sha256) errors.push('spec/release-manifest.json checkBundleSha256 does not match the check bundle')
  }

  return { errors, warnings, jsonFiles: jsonFiles.length, requiredFiles: requiredFiles.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = runValidation()
  process.stdout.write(`${JSON.stringify({ ok: result.errors.length === 0, ...result }, null, 2)}\n`)
  if (result.errors.length) process.exit(1)
}
