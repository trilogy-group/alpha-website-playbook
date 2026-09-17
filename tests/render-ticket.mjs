#!/usr/bin/env node
/**
 * Render an APEX ticket body from a contract object (spec/ticket-contract.json). Used by triage-ticket.mjs and file-apex-ticket.mjs.
 * The body is regenerated on every class or owner change; history is one line per change; prior bodies are never appended.
 *
 *   node tests/render-ticket.mjs --contract contract.json
 */
import fs from 'node:fs'

export function renderBody(c) {
  const known = (v) => v !== null && v !== undefined && v !== '' && v !== 'unknown' && v !== 'see request'
  const lines = [
    `${c.ownerName || c.ownerRole || 'Owner'}: ${c.fixPath}`,
    '',
    `What was asked: ${c.observed}`,
    known(c.page) ? `Page: ${c.page}` : null,
    known(c.expected) && c.expected !== 'per the class recipe' ? `What the playbook expects: ${c.expected}` : null,
    c.source && !/^request as filed/.test(c.source) ? `Source checked: ${c.source}` : null,
    `Why it is routed here: ${c.reason || ''}`.trim(),
    `Done when: ${c.doneWhen}`,
    c.related?.length ? `Related: ${c.related.join(', ')}` : null,
    '',
    `Class ${c.class}${c.defectClass && c.defectClass !== 'presentation' ? ` (${c.defectClass})` : ''}; element ${c.element || 'n/a'}${c.cssId ? ` (${c.cssId})` : ''}; ${c.evidence}; ${c.playbook || 'alpha-website-playbook'}`,
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
