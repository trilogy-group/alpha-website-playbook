#!/usr/bin/env node
/**
 * Render an APEX ticket body from a contract object (spec/ticket-contract.json). Used by triage-ticket.mjs and file-apex-ticket.mjs.
 * The body is regenerated on every class or owner change; history is one line per change; prior bodies are never appended.
 * Wording and line order: spec/ticket-templates.json template `triageBody` (agent/ticket-templates.mjs); this file only decides
 * which contract values are known enough to show.
 *
 *   node tests/render-ticket.mjs --contract contract.json
 */
import fs from 'node:fs'
import { renderTemplate } from '../agent/ticket-templates.mjs'

const known = (v) => v !== null && v !== undefined && v !== '' && v !== 'unknown' && v !== 'see request'

export function renderBody(c) {
  return renderTemplate('triageBody', {
    ownerName: c.ownerName,
    ownerRole: c.ownerRole,
    fixPath: c.fixPath,
    observed: c.observed,
    page: known(c.page) ? c.page : null,
    expected: known(c.expected) && c.expected !== 'per the class recipe' ? c.expected : null,
    source: c.source && !/^request as filed/.test(c.source) ? c.source : null,
    reason: c.reason,
    doneWhen: c.doneWhen,
    related: c.related?.length ? c.related : null,
    class: c.class,
    defectClass: c.defectClass && c.defectClass !== 'presentation' ? c.defectClass : null,
    element: c.element,
    cssId: c.cssId,
    evidence: c.evidence,
    playbook: c.playbook,
    history: c.history || [],
  })
}

if (process.argv[1] && process.argv[1].endsWith('render-ticket.mjs')) {
  const i = process.argv.indexOf('--contract')
  if (i < 0) { console.error('Usage: render-ticket.mjs --contract contract.json'); process.exit(2) }
  console.log(renderBody(JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'))))
}
