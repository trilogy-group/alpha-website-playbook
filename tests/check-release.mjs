#!/usr/bin/env node
/**
 * Release attestation (improvement plan workstream 3). Compares spec/release-manifest.json with what
 * production actually reports (Alpha MCP health: plugin version, ability count, abilitySchemaSha256,
 * operator mode, production writes, synced CSS ids, campus template) and with the committed policy
 * bundle hash and the check bundle hash (spec/check-bundle.generated.json). Any mismatch exits 1 with a typed reason; the intake agent refuses to release an
 * execution-ready ticket while allowing unrelated clarification and human routing to continue.
 *
 * Usage: node tests/check-release.mjs [--json out.json] [--allow-stale-bundle]
 * Env: ALPHA_WP_BASE_URL, ALPHA_WP_USERNAME, ALPHA_WP_APPLICATION_PASSWORD (same as the bridge), or
 *      ALPHA_MCP_HEALTH_JSON=<path> to check against a saved health document.
 */
import fs from 'node:fs'
import path from 'node:path'

const here = path.dirname(new URL(import.meta.url).pathname)
const root = path.join(here, '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))
const args = parse(process.argv.slice(2))
const manifest = read('spec/release-manifest.json')
const bundle = read('spec/policy-bundle.generated.json')
const checkBundle = read('spec/check-bundle.generated.json')

const failures = []
const notes = []

if (manifest.policySha256 !== bundle.policySha256) failures.push({ type: 'policy_bundle_mismatch', manifest: manifest.policySha256, actual: bundle.policySha256, fix: 'rebuild the bundle (node tests/build-policy.mjs) and update spec/release-manifest.json policySha256' })
if (manifest.checkBundleSha256 !== checkBundle.sha256) failures.push({ type: 'check_bundle_mismatch', manifest: manifest.checkBundleSha256, actual: checkBundle.sha256, fix: 'rebuild the check bundle (node tests/build-checks.mjs) and update spec/release-manifest.json checkBundleSha256' })

let health = null
if (process.env.ALPHA_MCP_HEALTH_JSON) {
  health = JSON.parse(fs.readFileSync(process.env.ALPHA_MCP_HEALTH_JSON, 'utf8'))
} else if (process.env.ALPHA_WP_BASE_URL && process.env.ALPHA_WP_USERNAME && process.env.ALPHA_WP_APPLICATION_PASSWORD) {
  const url = new URL('/wp-json/alpha-mcp/v1/health', process.env.ALPHA_WP_BASE_URL)
  const auth = Buffer.from(`${process.env.ALPHA_WP_USERNAME}:${process.env.ALPHA_WP_APPLICATION_PASSWORD}`).toString('base64')
  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) failures.push({ type: 'health_unreachable', status: res.status })
    else health = await res.json()
  } catch (e) { failures.push({ type: 'health_unreachable', error: e.message }) }
} else {
  failures.push({ type: 'health_not_checked', fix: 'set ALPHA_WP_* env or ALPHA_MCP_HEALTH_JSON' })
}

if (health) {
  const p = manifest.production
  if (health.pluginVersion !== p.pluginVersion) failures.push({ type: 'plugin_version_mismatch', manifest: p.pluginVersion, actual: health.pluginVersion })
  if (p.abilitySchemaSha256 && health.abilitySchemaSha256 && health.abilitySchemaSha256 !== p.abilitySchemaSha256) failures.push({ type: 'ability_schema_mismatch', manifest: p.abilitySchemaSha256, actual: health.abilitySchemaSha256 })
  if (p.abilitySchemaSha256 && !health.abilitySchemaSha256) notes.push('production health does not report abilitySchemaSha256 (plugin older than 0.5.1); schema not attested')
  const abilities = health.configuration?.abilities || []
  if (p.abilityCount && abilities.length !== p.abilityCount) failures.push({ type: 'ability_count_mismatch', manifest: p.abilityCount, actual: abilities.length })
  if (health.operatorMode !== p.operatorMode) failures.push({ type: 'operator_mode_mismatch', manifest: p.operatorMode, actual: health.operatorMode })
  if (health.productionWritesEnabled !== p.productionWritesEnabled) failures.push({ type: 'production_writes_mismatch', manifest: p.productionWritesEnabled, actual: health.productionWritesEnabled })
  const synced = (health.configuration?.syncedCssIds || []).slice().sort()
  const expected = (bundle.syncedCssIds || []).slice().sort()
  if (JSON.stringify(synced) !== JSON.stringify(expected)) failures.push({ type: 'synced_css_ids_mismatch', missingOnSite: expected.filter((x) => !synced.includes(x)), extraOnSite: synced.filter((x) => !expected.includes(x)), fix: 'POST /configuration/synced-css-ids with the bundle list' })
  if (p.campusTemplateId && health.configuration?.campusTemplateId !== p.campusTemplateId) failures.push({ type: 'campus_template_mismatch', manifest: p.campusTemplateId, actual: health.configuration?.campusTemplateId })
  const disabled = health.configuration?.disabledAbilities || []
  if (disabled.length) notes.push(`abilities disabled on site: ${disabled.join(', ')}`)
}

const result = { checkedAt: new Date().toISOString(), manifestVersion: manifest.version, ok: failures.length === 0, failures, notes, health: health ? { pluginVersion: health.pluginVersion, abilitySchemaSha256: health.abilitySchemaSha256 || null, abilities: (health.configuration?.abilities || []).length } : null }
if (args.json) fs.writeFileSync(args.json, JSON.stringify(result, null, 2) + '\n')
console.log(result.ok ? `release attested: plugin ${health?.pluginVersion}, policy ${bundle.policySha256.slice(0, 12)}` : `release mismatch: ${failures.map((f) => f.type).join(', ')}`)
for (const f of failures) console.log('  ' + JSON.stringify(f))
for (const n of notes) console.log('  note: ' + n)
process.exit(failures.length ? 1 : 0)

function parse(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { if (!argv[i].startsWith('--')) continue; const key = argv[i].slice(2); const next = argv[i + 1]; out[key] = next === undefined || next.startsWith('--') ? true : (i++, next) } return out }
