#!/usr/bin/env node
/**
 * Keep the protocol document's quoted ticket templates equal to the renderer. Every fenced block that follows a line
 * "Rendered from `spec/ticket-templates.json` template `<name>` ..." in the documents below is the rendering of that
 * template's `example` fields through agent/ticket-templates.mjs; the document never carries hand-typed template wording.
 *
 *   node tests/render-templates-examples.mjs            # print every template's example rendering
 *   node tests/render-templates-examples.mjs --check    # exit 1 naming each quoted block that differs (run by npm run validate)
 *   node tests/render-templates-examples.mjs --write    # rewrite the quoted blocks in place
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTemplates, renderExamples } from '../agent/ticket-templates.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DOCUMENTS = ['protocols/apex-website-ticket-protocol.md', 'docs/sweep-runbook.md']
// The header line, a blank line, an opening fence, zero or more whole lines (none of them a fence), a closing fence.
export const BLOCK = /^(Rendered from `spec\/ticket-templates\.json` template `([a-zA-Z]+)`[^\n]*)\n\n```\n((?:(?!```)[^\n]*\n)*?)```/gm

/** Every quoted block in a document: template name and the quoted text (without the trailing newline before the fence). */
export function quotedBlocks(markdown) {
  const out = []
  for (const match of markdown.matchAll(BLOCK)) out.push({ name: match[2], quoted: match[3].replace(/\n$/, '') })
  return out
}

/** Problems with the quoted blocks: an unknown template, a block that differs from the rendering, a template never quoted. */
export function checkDocExamples(spec = loadTemplates(), documents = DOCUMENTS) {
  const examples = renderExamples(spec)
  const problems = []
  const quotedNames = new Set()
  for (const relative of documents) {
    const file = path.join(root, relative)
    if (!fs.existsSync(file)) { problems.push(`${relative}: missing`); continue }
    for (const block of quotedBlocks(fs.readFileSync(file, 'utf8'))) {
      quotedNames.add(block.name)
      if (!examples[block.name]) { problems.push(`${relative}: quotes unknown template ${block.name}`); continue }
      if (block.quoted !== examples[block.name]) problems.push(`${relative}: the quoted block for template ${block.name} differs from the renderer; run node tests/render-templates-examples.mjs --write`)
    }
  }
  for (const name of Object.keys(examples)) if (!quotedNames.has(name)) problems.push(`template ${name} is quoted in no document (${documents.join(', ')})`)
  return problems
}

/** Rewrite every quoted block from the renderer; returns the documents that changed. */
export function writeDocExamples(spec = loadTemplates(), documents = DOCUMENTS) {
  const examples = renderExamples(spec)
  const changed = []
  for (const relative of documents) {
    const file = path.join(root, relative)
    const before = fs.readFileSync(file, 'utf8')
    const after = before.replace(BLOCK, (whole, header, name) => (examples[name] ? `${header}\n\n\`\`\`\n${examples[name]}\n\`\`\`` : whole))
    if (after !== before) { fs.writeFileSync(file, after); changed.push(relative) }
  }
  return changed
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (args.includes('--write')) {
    const changed = writeDocExamples()
    console.log(changed.length ? `rewrote ${changed.join(', ')}` : 'documents already match the renderer')
  } else if (args.includes('--check')) {
    const problems = checkDocExamples()
    for (const problem of problems) console.error(problem)
    console.log(problems.length ? `${problems.length} problem(s)` : 'documents match the renderer')
    process.exit(problems.length ? 1 : 0)
  } else {
    for (const [name, text] of Object.entries(renderExamples())) console.log(`### ${name}\n${text}\n`)
  }
}
