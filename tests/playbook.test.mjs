import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
