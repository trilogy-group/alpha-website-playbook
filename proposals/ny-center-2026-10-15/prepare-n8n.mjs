#!/usr/bin/env node
// Offline preparation only. No network, credentials, activation or execution.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

export const profiles = {
  '26463204876': {
    postId: '6542', slug: 'new-york-city', name: 'Alpha New York',
    description: 'Discover personalized learning and hands-on life skills at Alpha New York, a homeschool center for K–12 learners.',
    identity: 'An Alpha Anywhere homeschool center.',
  },
  '60804396611': {
    postId: '9213', slug: 'greenwich', name: 'Alpha Greenwich Armonk',
    description: 'Discover personalized learning and real-world skills at Alpha Greenwich Armonk, a homeschool center for K–8 learners in Armonk, NY.',
    seoTitle: 'Alpha Greenwich Armonk | Homeschool Center in Armonk, NY',
    subtitle: 'A homeschool center in Armonk, NY, serving grades K–8.',
  },
}

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const serialize = value => JSON.stringify(value)
const VARIOUS = 'Prepare website data - various attributes'
const CUSTOM = 'Prepare website data - custom aspects'

function nodeFor(workflow, name) {
  const nodes = workflow.nodes.filter(node => node.name === name && !node.disabled)
  if (nodes.length !== 1) throw new Error(`Expected one enabled node: ${name}`)
  return nodes[0]
}

function wrap(original, programExpression, body) {
  if (!original.startsWith('={{') || !original.endsWith('}}')) throw new Error('Expected n8n expression')
  const baseline = original.slice(3, -2)
  // Do not evaluate the fallback until necessary; preserve existing non-NY exceptions.
  return `={{ (() => {
const program = ${programExpression};
const profile = (${serialize(profiles)})[String(program.id)];
const previous = () => (${baseline});
if (!profile) return previous();
if (String(program.wordpress_post_id) !== profile.postId ||
    !['NY', 'New York'].includes(program.state) ||
    program.school_without_school_keyword !== profile.name ||
    String(program.website || '').replace(/[/]$/, '') !== 'https://alpha.school/' + profile.slug)
  throw new Error('NY center identity changed; review the approved Program mapping');
${body}
})() }}`
}

export function prepareCampus(input) {
  if (input.id !== 'ORgdHC71YJ5RawBy') throw new Error('Wrong campus workflow')
  if (!input.activeVersionId || input.activeVersionId !== input.versionId)
    throw new Error('Saved and active versions differ; export active version separately before preparing')
  if (input.activeVersion && (hash(input.activeVersion.nodes) !== hash(input.nodes) ||
      hash(input.activeVersion.connections) !== hash(input.connections)))
    throw new Error('Saved definition differs from active definition')
  const workflow = structuredClone(input)
  const changes = []
  function change(nodeName, field, body) {
    const node = nodeFor(workflow, nodeName)
    const fields = node.parameters.assignments.assignments
    const matches = fields.filter(a => a.name === field)
    if (matches.length !== 1) throw new Error(`Expected one assignment: ${field}`)
    const assignment = matches[0]
    const before = assignment.value
    assignment.value = wrap(before, nodeName === CUSTOM
      ? "$('Prepare website data JSON-LD').item.json.program" : '$json.program', body)
    changes.push({ node: nodeName, field, before, after: assignment.value })
  }
  change(VARIOUS, 'seo_title', 'return profile.seoTitle ?? previous();')
  change(VARIOUS, 'seo_description', 'return profile.description;')
  change(VARIOUS, 'title', `const existing = previous();
if (profile.subtitle) return profile.name + '<br>\\n<span style="font-size:0.8em">' + profile.subtitle + '</span>';
return existing + '<br>\\n<span style="font-size:0.8em">' + profile.identity + '</span>';`)
  change(VARIOUS, 'content_title_html', "return String(program.id) === '60804396611' ? 'Welcome to the Future of Education in Armonk' : previous();")
  change(CUSTOM, 'content_body_1_html', `let value = previous();
if (String(program.id) === '60804396611') {
  const opener = 'Looking for a private school your child can’t wait to go to each morning?';
  if (value.split(opener).length !== 2) throw new Error('Armonk opener drifted');
  value = value.replace(opener, 'Looking for a learning experience your child can’t wait to get to each morning?');
}
const ranking = /Our classes rank in\\s*<a\\b([^>]*)>\\s*the top 1% nationally<\\/a>\\./g;
if ([...value.matchAll(ranking)].length !== 1) throw new Error('NY ranking locator drifted');
return value.replace(ranking, '<a$1>See Alpha’s nationally benchmarked learning results.</a>');`)
  change(CUSTOM, 'content_body_3_html', `const value = previous();
if (String(program.id) !== '60804396611') return value; // NYC-005 is Keep.
if (value.split('kids love school.').length !== 2) throw new Error('Armonk love-learning locator drifted');
return value.replace('kids love school.', 'kids love learning.');`)
  const schemaNode = nodeFor(workflow, 'Prepare website data JSON-LD')
  const schemas = schemaNode.parameters.assignments.assignments.filter(a => a.name === 'json_ld')
  if (schemas.length !== 1) throw new Error('Expected one local schema template')
  const assignment = schemas[0]
  const schema = JSON.parse(assignment.value)
  if (JSON.stringify(schema['@graph'][0]['@type']) !== '["Organization","Place","School"]')
    throw new Error('Local schema template drifted')
  const before = assignment.value
  // Only the local branch changes; parent Organization and all facts stay intact.
  assignment.value = `={{ (() => { const schema = ${serialize(schema)};
if ((${serialize(profiles)})[String($json.program.id)]) schema['@graph'][0]['@type'] = ['Organization', 'Place'];
return schema; })() }}`
  changes.push({ node: schemaNode.name, field: 'json_ld', before, after: assignment.value })
  return { workflow, changes, inputVersion: input.versionId, inputHash: hash(input), proposedHash: hash(workflow) }
}

export function prepareLocations(input) {
  if (input.id !== 'RqP1lPvDKvHDxTus' || !input.activeVersionId || input.versionId !== input.activeVersionId)
    throw new Error('Wrong Locations workflow or active-version mismatch')
  if (input.activeVersion && (hash(input.activeVersion.nodes) !== hash(input.nodes) ||
      hash(input.activeVersion.connections) !== hash(input.connections)))
    throw new Error('Saved Locations definition differs from active definition')
  const workflow = structuredClone(input)
  const node = nodeFor(workflow, 'Update Elementor page content')
  const before = node.parameters.jsCode
  let code = before
  function replaceOnce(from, to) {
    if (code.split(from).length !== 2) throw new Error('Locations source locator drifted')
    code = code.replace(from, to)
  }
  replaceOnce('function buildCard(program) {', `const NY_CENTER_PROFILES = ${serialize(profiles)};
function buildCard(program) {
  const profile = NY_CENTER_PROFILES[String(program.id)];
  if (profile && (String(program.wordpress_post_id) !== profile.postId ||
      !['NY', 'New York'].includes(program.state) ||
      String(program.website || '').replace(/[/]$/, '') !== 'https://alpha.school/' + profile.slug))
    throw new Error('NY Locations identity changed; review mapping');`)
  replaceOnce('`<p>${schoolName}</p>` + (isWaitlist', '`<p>${schoolName}</p>` + (profile ? "<p>Homeschool center</p>" : "") + (isWaitlist')
  replaceOnce('`<strong>Tuition:</strong> ${tuition}`', '`<strong>${profile ? "Program fees" : "Tuition"}:</strong> ${tuition}`')
  node.parameters.jsCode = code
  return { workflow, changes: [{ node: node.name, field: 'jsCode', before, after: code }], inputVersion: input.versionId, inputHash: hash(input), proposedHash: hash(workflow) }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [campusPath, locationsPath, outDir] = process.argv.slice(2)
  if (!campusPath || !locationsPath || !outDir) throw new Error('Usage: prepare-n8n.mjs <private-campus-export> <private-locations-export> <ignored-output-dir>')
  const check = (await import('node:child_process')).spawnSync('git', ['check-ignore', '--quiet', '--', outDir])
  if (check.status !== 0) throw new Error('Output directory must be gitignored: exports may contain secrets')
  fs.mkdirSync(outDir, { recursive: true })
  for (const [name, path, prepare] of [['campus', campusPath, prepareCampus], ['locations', locationsPath, prepareLocations]]) {
    const result = prepare(JSON.parse(fs.readFileSync(path, 'utf8')))
    fs.writeFileSync(`${outDir}/${name}.prepared.private.json`, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
    process.stdout.write(JSON.stringify({ name, inputVersion: result.inputVersion, inputHash: result.inputHash, proposedHash: result.proposedHash, fields: result.changes.map(c => `${c.node}: ${c.field}`) }) + '\n')
  }
}
