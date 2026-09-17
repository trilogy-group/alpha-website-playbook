import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runValidation } from './validate-playbook.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('playbook specifications and references validate', () => {
  const result = runValidation()
  assert.deepEqual(result.errors, [])
})

test('APEX duplicate search matches canonical page and person', () => {
  const output = execFileSync(process.execPath, [
    'tests/search-apex-tickets.mjs',
    '--file', 'tests/fixtures/apex-search-tickets.json',
    '--url', 'https://alpha.school/austin/',
    '--text', 'John Doe',
  ], { cwd: root, encoding: 'utf8' })
  const result = JSON.parse(output)
  assert.equal(result.matches, 1)
  assert.equal(result.items[0].id, 'ticket-austin-placeholder')
})

// Cross-harness decision fixtures (improvement plan workstream 7): every fixture must produce the expected
// outcome, class, and owner role from the policy bundle alone. A second harness runs the same fixtures.
test('decision fixtures replay to the expected outcome, class, and owner role', () => {
  const dir = path.join(root, 'tests', 'fixtures', 'decisions')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  assert.ok(files.length >= 20, `expected at least 20 decision fixtures, found ${files.length}`)
  const fixtures = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
  const input = path.join(os.tmpdir(), `alpha-decision-fixtures-${process.pid}.json`)
  const report = path.join(os.tmpdir(), `alpha-decision-report-${process.pid}.json`)
  fs.writeFileSync(input, JSON.stringify(fixtures.map((f) => f.task)))
  const run = spawnSync(process.execPath, [path.join(root, 'agent', 'intake.mjs'), '--file', input, '--replay', '--report', report, '--force'], { encoding: 'utf8', env: { ...process.env, APEX_API_TOKEN: '' } })
  assert.equal(run.status, 0, run.stderr)
  const results = Object.fromEntries(JSON.parse(fs.readFileSync(report, 'utf8')).results.map((r) => [r.id, r]))
  const mismatches = []
  for (const f of fixtures) {
    const r = results[f.task.id]
    if (!r) { mismatches.push(`${f.task.id}: not decided`); continue }
    const got = { outcome: r.outcome, class: r.class || null, ownerRole: r.ownerRole || null }
    for (const key of ['outcome', 'class', 'ownerRole']) if (got[key] !== f.expected[key]) mismatches.push(`${f.task.id} ${key}: got ${got[key]}, expected ${f.expected[key]} (${f.expected.why})`)
  }
  assert.deepEqual(mismatches, [])
})
