/**
 * The one renderer for every note and body the APEX website ticket protocol prescribes. The wording and line order live
 * in spec/ticket-templates.json (schema spec/schemas/ticket-templates.schema.json); tests/render-ticket.mjs, tests/triage-ticket.mjs,
 * tests/diagnose-field.mjs, agent/intake-policy.mjs and agent/file-observer-findings.mjs render through renderTemplate, and a
 * sweep agent writing a note by hand renders the same template, so a change to the protocol's wording is made once.
 *
 * Placeholders: {name} must be supplied (arrays join with ', '); {?name|text} renders text only when the field is present and
 * {?name|text|else} renders else otherwise, nesting allowed; a line may be {text, when} (rendered when the field is present)
 * or {each, text} (rendered once per array item with {index} and the item's fields; a string item is {item}).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const TEMPLATES_FILE = path.join(root, 'spec', 'ticket-templates.json')
export const EM_DASH = '—'

export class TemplateError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'TemplateError'
    this.code = code
    Object.assign(this, details)
  }
}

let cached = null
/** The parsed spec (cached; pass a file to read another copy without caching). */
export function loadTemplates(file) {
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!cached) cached = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'))
  return cached
}

export function templateNames(spec = loadTemplates()) { return Object.keys(spec.templates) }
export function templateMarker(name, spec = loadTemplates()) {
  const marker = spec.markers?.[name]
  if (!marker) throw new TemplateError('UNKNOWN_MARKER', `no marker ${name} in spec/ticket-templates.json`, { marker: name })
  return marker
}

function template(name, spec) {
  const t = spec.templates?.[name]
  if (!t) throw new TemplateError('UNKNOWN_TEMPLATE', `no template ${name} in spec/ticket-templates.json`, { template: name })
  return t
}

export function present(value) {
  if (value === null || value === undefined || value === false) return false
  if (Array.isArray(value)) return value.length > 0
  return String(value).trim() !== ''
}

/**
 * Render a named template to its lines joined with newlines. Throws TemplateError MISSING_FIELD naming the first missing
 * required field (checked before rendering) or an unconditional placeholder the fields do not carry.
 */
export function renderTemplate(name, fields = {}, spec = loadTemplates()) {
  const t = template(name, spec)
  for (const field of t.required || []) {
    if (!present(fields[field])) throw new TemplateError('MISSING_FIELD', `template ${name} needs field ${field}`, { template: name, field })
  }
  return renderLines(t.lines, fields, name).join('\n')
}

/** Render a template's title line (templates whose body is a ticket description with a separate title). */
export function renderTitle(name, fields = {}, spec = loadTemplates()) {
  const t = template(name, spec)
  if (!t.title) throw new TemplateError('NO_TITLE', `template ${name} has no title`, { template: name })
  return renderText(t.title, fields, name)
}

export function renderLines(lines, fields, name) {
  const out = []
  for (const line of lines) {
    if (typeof line === 'string') { out.push(renderText(line, fields, name)); continue }
    if (line.when !== undefined) {
      if (present(fields[line.when])) out.push(renderText(line.text, fields, name))
      continue
    }
    if (line.each !== undefined) {
      const items = fields[line.each]
      if (!Array.isArray(items)) continue
      items.forEach((item, i) => {
        const scope = item !== null && typeof item === 'object' && !Array.isArray(item) ? { ...fields, ...item, index: i + 1 } : { ...fields, item, index: i + 1 }
        out.push(renderText(line.text, scope, name))
      })
      continue
    }
    throw new TemplateError('BAD_LINE', `template ${name}: a line must be a string, {when, text} or {each, text}`, { template: name })
  }
  return out
}

function matchingBrace(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') { depth--; if (depth === 0) return i }
  }
  throw new TemplateError('BAD_PLACEHOLDER', `unbalanced braces in "${text}"`)
}

function splitTopLevel(text, separator) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of text) {
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (ch === separator && depth === 0) { parts.push(current); current = '' } else current += ch
  }
  parts.push(current)
  return parts
}

export function renderText(text, fields, name = '<inline>') {
  let out = ''
  let i = 0
  while (i < text.length) {
    if (text[i] !== '{') { out += text[i]; i++; continue }
    const end = matchingBrace(text, i)
    const inner = text.slice(i + 1, end)
    if (inner.startsWith('?')) {
      const [field, thenText = '', elseText = ''] = splitTopLevel(inner.slice(1), '|')
      out += renderText(present(fields[field]) ? thenText : elseText, fields, name)
    } else {
      const value = fields[inner]
      if (!present(value)) throw new TemplateError('MISSING_FIELD', `template ${name} needs field ${inner}`, { template: name, field: inner })
      out += Array.isArray(value) ? value.join(', ') : String(value)
    }
    i = end + 1
  }
  return out
}

/** Placeholder analysis for the validator: which fields a template always needs and which are conditional. */
export function analyzeTemplate(t) {
  const unconditional = new Set()
  const optional = new Set()
  const collect = (text, conditional) => {
    let i = 0
    while (i < text.length) {
      if (text[i] !== '{') { i++; continue }
      const end = matchingBrace(text, i)
      const inner = text.slice(i + 1, end)
      if (inner.startsWith('?')) {
        const [field, thenText = '', elseText = ''] = splitTopLevel(inner.slice(1), '|')
        optional.add(field)
        collect(thenText, true)
        collect(elseText, true)
      } else (conditional ? optional : unconditional).add(inner)
      i = end + 1
    }
  }
  if (t.title) collect(t.title, false)
  for (const line of t.lines || []) {
    if (typeof line === 'string') collect(line, false)
    else if (line.when !== undefined) { optional.add(line.when); collect(line.text, true) }
    else if (line.each !== undefined) { optional.add(line.each); collect(line.text, true) }
  }
  for (const field of unconditional) optional.delete(field)
  return { unconditional: [...unconditional].sort(), optional: [...optional].sort() }
}

/** The four lines every closing note starts with (rules.closingLines), as template strings. */
export function closingNoteLines(spec = loadTemplates()) { return [...spec.rules.closingLines] }
export function reviewLine(spec = loadTemplates()) { return spec.rules.reviewLine }

function lineRegex(templateLine) {
  const escaped = templateLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-zA-Z0-9]+\\\}/g, '(.+)')
  return new RegExp(`^${escaped}$`)
}

/**
 * Assert a rendered closing note has the protocol's shape: the four closing lines first, the review line last, no em dash.
 * Throws TemplateError NOTE_SHAPE with the first problem; returns the note's lines otherwise.
 */
export function assertNoteShape(text, spec = loadTemplates()) {
  const lines = String(text || '').split('\n')
  const closing = closingNoteLines(spec)
  closing.forEach((templateLine, i) => {
    if (!lineRegex(templateLine).test(lines[i] || '')) throw new TemplateError('NOTE_SHAPE', `line ${i + 1} must be "${templateLine}"; got "${lines[i] || ''}"`, { line: i + 1 })
  })
  if (lines.at(-1) !== reviewLine(spec)) throw new TemplateError('NOTE_SHAPE', `the note must end with "${reviewLine(spec)}"; got "${lines.at(-1)}"`, { line: lines.length })
  const dash = lines.findIndex((l) => l.includes(EM_DASH))
  if (dash >= 0) throw new TemplateError('NOTE_SHAPE', `line ${dash + 1} carries an em dash`, { line: dash + 1 })
  return lines
}

/** Render every template's example (title first when the template has one), for the protocol document and its drift test. */
export function renderExamples(spec = loadTemplates()) {
  const out = {}
  for (const name of templateNames(spec)) {
    const t = spec.templates[name]
    const body = renderTemplate(name, t.example, spec)
    out[name] = t.title ? `${renderTitle(name, t.example, spec)}\n${body}` : body
  }
  return out
}
