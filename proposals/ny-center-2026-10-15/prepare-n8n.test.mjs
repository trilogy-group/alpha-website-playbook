import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareCampus, prepareLocations, profiles } from './prepare-n8n.mjs'

const load = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url), 'utf8'))
const campus = load('campus.source-fixture.json')
const locations = load('locations.source-fixture.json')
const prepared = prepareCampus(campus)
const assignment = (workflow, node, field) => workflow.nodes.find(n => n.name === node).parameters.assignments.assignments.find(a => a.name === field).value
const various = 'Prepare website data - various attributes'
const custom = 'Prepare website data - custom aspects'

test('generated n8n expressions contain no premature interpolation delimiter', () => {
  // Confirmed against the real n8n engine: compact nested JSON prematurely
  // terminates its expression, even though the same JavaScript passes node:vm.
  for (const change of prepared.changes) {
    assert.equal(change.after.slice(3, -2).includes('}}'), false, change.field)
  }
})
const example = (id = '60804396611') => ({
  id, wordpress_post_id: profiles[id]?.postId ?? '999', state: 'NY',
  website: 'https://alpha.school/' + (profiles[id]?.slug ?? 'unaffected') + '/',
  school_without_school_keyword: profiles[id]?.name ?? 'Alpha Unaffected',
  school_with_school_keyword: 'Alpha School', school: profiles[id]?.name ?? 'Alpha Unaffected',
  grade_levels: 'K-8', grade_levels_suffixed: 'K - 8th', city: 'Armonk', display_region: 'Greenwich',
  website_copy: {
    content_title: 'Welcome to the Future of Education in [DISPLAY_REGION]',
    content_body_1: 'Looking for a private school your child can’t wait to go to each morning? At [DISPLAY_NAME], our mastery-based, AI driven approach allows students to crush their academics in 2 hours. Our classes rank in <a href="/the-program/#learn"> the top 1% nationally</a>.',
    content_body_3: 'At [DISPLAY_NAME], <b><i>kids love school.</i></b> We’re not just preparing students for tests; we’re preparing them for limitless futures.',
  },
})
function evaluate(value, program, extra = {}) {
  if (!value.startsWith('={{')) return value
  return vm.runInNewContext('(' + value.slice(3, -2) + ')', {
    $json: { program, ...extra },
    $: () => ({ item: { json: { program } } }),
  }, { timeout: 500 })
}
function field(workflow, node, key, p) {
  const extra = node === custom ? {
    content_body_1_html: field(workflow, various, 'content_body_1_html', p),
    content_body_3_html: field(workflow, various, 'content_body_3_html', p),
  } : {}
  return evaluate(assignment(workflow, node, key), p, extra)
}

test('Armonk exact audit text replaces school claims and preserves links/benefits', () => {
  const p = example()
  assert.equal(field(prepared.workflow, various, 'seo_title', p), profiles[p.id].seoTitle)
  assert.equal(field(prepared.workflow, various, 'seo_description', p), profiles[p.id].description)
  assert.match(field(prepared.workflow, various, 'title', p), /A homeschool center in Armonk, NY, serving grades K–8\./)
  assert.equal(field(prepared.workflow, various, 'content_title_html', p), 'Welcome to the Future of Education in Armonk')
  const body = field(prepared.workflow, custom, 'content_body_1_html', p)
  assert.match(body, /learning experience your child can’t wait to get to/)
  assert.match(body, /href="\/the-program\/#learn">See Alpha’s nationally benchmarked learning results\./)
  assert.match(body, /crush their academics in 2 hours/)
  assert.doesNotMatch(body, /private school|top 1%/)
  assert.match(field(prepared.workflow, custom, 'content_body_3_html', p), /kids love learning\./)
  assert.match(field(prepared.workflow, custom, 'content_body_3_html', p), /limitless futures/)
})

test('NYC keeps its grade line, title and Keep paragraph while adding identity', () => {
  const p = { ...example('26463204876'), grade_levels_suffixed: 'K - 12th', city: 'New York', state: 'New York' }
  assert.equal(field(prepared.workflow, various, 'seo_title', p), field(campus, various, 'seo_title', p))
  assert.match(field(prepared.workflow, various, 'title', p), /Serving K - 12th Grade in New York City/)
  assert.match(field(prepared.workflow, various, 'title', p), /An Alpha Anywhere homeschool center\./)
  assert.equal(field(prepared.workflow, custom, 'content_body_3_html', p), field(campus, custom, 'content_body_3_html', p))
  assert.doesNotMatch(field(prepared.workflow, custom, 'content_body_1_html', p), /top 1%/)
})

test('unaffected schools and existing Lexington/Raleigh exceptions retain exact output', () => {
  for (const id of ['111', '51223157555', '29735717555', '49011192959', '42820568924']) {
    const p = example(id)
    for (const [node, keys] of [[various, ['title', 'seo_title', 'seo_description', 'content_title_html']], [custom, ['content_body_1_html', 'content_body_3_html']]]) {
      for (const key of keys) assert.equal(field(prepared.workflow, node, key, p), field(campus, node, key, p), `${id} ${key}`)
    }
  }
})

test('only local NY schema type changes; national identity and other campuses remain', () => {
  const expr = assignment(prepared.workflow, 'Prepare website data JSON-LD', 'json_ld')
  for (const id of ['26463204876', '60804396611', '111']) {
    const result = JSON.parse(JSON.stringify(evaluate(expr, example(id))))
    assert.deepEqual(result['@graph'][0]['@type'], id === '111' ? ['Organization', 'Place', 'School'] : ['Organization', 'Place'])
    assert.equal(result['@graph'][0].parentOrganization['@id'], 'https://alpha.school/#Organization')
  }
})

test('identity, source copy and active-version drift reject preparation or evaluation', () => {
  assert.throws(() => prepareCampus({ ...campus, activeVersionId: 'changed' }), /versions differ/)
  assert.throws(() => prepareLocations({ ...locations, activeVersionId: 'changed' }), /mismatch/)
  for (const override of [{ wordpress_post_id: '999' }, { state: 'CT' }, { website: 'https://alpha.school/elsewhere/' }, { school_without_school_keyword: 'Renamed' }]) {
    assert.throws(() => field(prepared.workflow, various, 'title', { ...example(), ...override }), /identity changed/)
  }
  const p = example(); p.website_copy.content_body_1 = 'new unreviewed content'
  assert.throws(() => field(prepared.workflow, custom, 'content_body_1_html', p), /opener drifted/)
})

function renderCards(workflow, programs) {
  const widget = { settings: { image: {}, link: {} } }
  const template = Object.fromEntries(['image', 'schoolName', 'address', 'tuition', 'viewButton', 'applyButton', 'spacer'].map(k => [k, structuredClone(widget)]))
  template.container = { elements: [] }
  const sources = {
    'Set Card Template': { cardTemplate: template }, 'Set School Order': { schoolOrder: [] },
    'Set Images': { imageMap: { _default: 'unchanged.jpg' } },
    Aggregate: { schools: programs.map(program => ({ program })) },
    'Get a page': { meta: { _elementor_data: JSON.stringify([{ id: '86afe30', elements: [] }]) } },
  }
  const code = workflow.nodes[0].parameters.jsCode
  const result = vm.runInNewContext('(function(){' + code + '})()', {
    $: name => ({ first: () => ({ json: sources[name] }) }),
  }, { timeout: 500 })
  return JSON.parse(JSON.stringify(result[0].json.elementor_data[0].elements))
}

test('Locations descriptors and fee labels preserve amounts, waitlist and destination URLs', () => {
  const p = { ...example(), school_address: '20 Old Post Road', tuition_usd_yearly: '65000', admission_link: 'https://apply.alpha.school/test', website_campus_intro: 'accepting applications for our 2026–27 waitlist' }
  const after = renderCards(prepareLocations(locations).workflow, [p])[0]
  assert.match(after.elements[1].settings.editor, /Homeschool center/)
  assert.match(after.elements[1].settings.editor, /2026–27 Waitlist/)
  assert.equal(after.elements[3].settings.editor, '<strong>Program fees:</strong> $65,000')
  assert.equal(after.elements[4].settings.link.url, p.website)
  assert.equal(after.elements[5].settings.link.url, p.admission_link)
  assert.equal(after.elements[5].settings.text, 'Apply for waitlist')
  const unrelated = { ...p, ...example('111') }
  const before = renderCards(locations, [unrelated])[0]
  const unchanged = renderCards(prepareLocations(locations).workflow, [unrelated])[0]
  // IDs are time-generated; compare settings and content, not generated IDs.
  assert.deepEqual(unchanged.elements.map(e => e.settings), before.elements.map(e => e.settings))
})

test('preparation preserves original exports, connections and every unticketed assignment', () => {
  assert.equal(prepareCampus(campus).inputHash, prepared.inputHash)
  assert.deepEqual(prepared.workflow.connections, campus.connections)
  for (const node of campus.nodes) {
    for (const a of node.parameters.assignments?.assignments ?? []) {
      if (!prepared.changes.some(c => c.node === node.name && c.field === a.name))
        assert.equal(assignment(prepared.workflow, node.name, a.name), a.value)
    }
  }
  assert.deepEqual(prepareLocations(locations).workflow.connections, locations.connections)
})
