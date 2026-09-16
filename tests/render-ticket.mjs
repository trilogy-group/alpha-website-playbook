#!/usr/bin/env node
/**
 * Render an APEX ticket body from a contract object (spec/ticket-contract.json). Used by triage-ticket.mjs and file-apex-ticket.mjs.
 * The body is regenerated on every class or owner change; history is one line per change; prior bodies are never appended.
 *
 *   node tests/render-ticket.mjs --contract contract.json
 */
import fs from 'node:fs'

export function renderBody(c) {
  const lines = [
    c.claim,
    `Page: ${c.page}`,
    `Element: ${c.element}${c.cssId ? ` (CSS ID ${c.cssId})` : ''}${c.writer ? `; writer ${c.writer}` : ''}`,
    `Campus state: ${c.state || 'unknown'}${c.stateSource ? ` (${c.stateSource})` : ''}`,
    `Page shows${c.pageModified ? ` (modified ${c.pageModified})` : ''}: "${c.observed}"`,
    `Source: ${c.source}`,
    `Expected: "${c.expected}"${c.rule ? ` (${c.rule})` : ''}`,
    c.derivation ? `Derivation today: ${c.derivation}` : null,
    `Defect class: ${c.defectClass}. ${c.reason || ''}`.trim(),
    `Class: ${c.class}`,
    `Owner: ${c.ownerRole}${c.ownerName ? ` (${c.ownerName})` : ''}`,
    `Fix path: ${c.fixPath}`,
    `Done when: ${c.doneWhen}`,
    `Evidence: ${c.evidence}`,
    c.related?.length ? `Related: ${c.related.join(', ')}` : null,
    `Playbook: ${c.playbook || 'trilogy-group/alpha-website-playbook protocols/apex-website-ticket-protocol.md'}`,
    '',
    'History:',
    ...(c.history || []).map((h) => `- ${h}`),
  ].filter((l) => l !== null && l !== undefined)
  return lines.join('\n')
}

if (process.argv[1] && process.argv[1].endsWith('render-ticket.mjs')) {
  const i = process.argv.indexOf('--contract')
  if (i < 0) { console.error('Usage: render-ticket.mjs --contract contract.json'); process.exit(2) }
  console.log(renderBody(JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'))))
}
