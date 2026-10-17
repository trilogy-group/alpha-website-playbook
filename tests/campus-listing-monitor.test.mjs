// Offline campus listing monitor. Python unittest, no HubSpot calls.
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('campus listing monitor offline checks', () => {
  execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'tools/campus-listing-monitor', '-p', 'test_*.py'], {
    cwd: root,
    stdio: 'inherit',
  })
})
