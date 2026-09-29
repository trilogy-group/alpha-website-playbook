// agent/generate-open-card.mjs (QC loop repair plan 2026-09-25, repair 5): the Open and Enrolling card from a template.
// The fixture template tests/fixtures/open-card/template-placeholder.svg is a plain placeholder, not the brand card;
// the real master is Yash Chitneni's and registry/campus-open-media.json template.source stays null until he supplies
// it. The end-to-end cases rasterize with whatever this machine offers (sharp, resvg, Playwright's Chromium borrowed
// from a sibling checkout, or ImageMagick) and are skipped, never passed, when none is available.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  GENERATOR_VERSION,
  LAYOUT_FIELDS,
  OpenCardError,
  PLACEHOLDER,
  RENDERERS,
  campusNameFor,
  composeSvgFromPng,
  composeSvgFromTemplate,
  detectRenderers,
  escapeXml,
  generateOpenCard,
  planCard,
  pngSize,
  stripBrand,
  svgSize,
  validateLayout,
} from '../agent/generate-open-card.mjs'
import { decodePng, encodePng } from '../agent/frame-headshot.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const TEMPLATE = path.join(here, 'fixtures', 'open-card', 'template-placeholder.svg')
const templateText = fs.readFileSync(TEMPLATE, 'utf8')
const openMedia = JSON.parse(fs.readFileSync(path.join(root, 'registry', 'campus-open-media.json'), 'utf8'))
const pages = JSON.parse(fs.readFileSync(path.join(root, 'registry', 'campus-pages.json'), 'utf8'))
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'open-card-test-'))
const available = detectRenderers().filter((r) => r.available)
// false, not null: node's test runner (26.0) runs a `skip: null` body and still reports the test as skipped
const skipReason = available.length ? false : `no rasterizer on this machine (${detectRenderers().map((r) => `${r.name}: ${r.detail}`).join('; ')})`

test('registry: the template block names the placeholder, the owner and the ask, and every campus row is untouched', () => {
  assert.equal(openMedia.template.owner, 'Yash Chitneni')
  assert.equal(openMedia.template.placeholder, PLACEHOLDER)
  assert.equal(openMedia.template.source, null, 'template.source stays null until Yash supplies the master')
  assert.equal(openMedia.template.format, null)
  assert.match(openMedia.template.ask, /\{\{CAMPUS\}\}/)
  assert.match(openMedia.template.ask, /SVG/)
  assert.equal(openMedia.template.fixture, 'tests/fixtures/open-card/template-placeholder.svg')
  assert.equal(openMedia.template.recipe, 'protocols/recipes/open-card.md')
  assert.ok(fs.existsSync(path.join(root, openMedia.template.recipe)))
  assert.equal(Object.keys(openMedia.campuses).length, 28, 'every campus row kept (27 on 2026-09-25, the-woodlands added 2026-09-29 by run open-cards-2026-09-29)')
  assert.deepEqual(openMedia.campuses['boca-raton'], { openMedia: 'card', attachmentId: 9822, status: 'placed' })
  assert.equal(openMedia.campuses.raleigh.openMedia, 'video')
  for (const [slug, row] of Object.entries(openMedia.campuses)) assert.ok(pages.campuses[slug], `${slug} is a registered campus`) && assert.ok('openMedia' in row && 'attachmentId' in row && 'status' in row, `${slug} keeps its fields`)
})

test('fixture template: a marked placeholder at the card size with the campus placeholder, never a brand asset', () => {
  assert.match(templateText, /PLACEHOLDER TEMPLATE/)
  assert.match(templateText, /Not the Alpha brand card/)
  assert.deepEqual((({ width, height }) => ({ width, height }))(svgSize(templateText)), { width: 1424, height: 979 })
  assert.equal(templateText.split(PLACEHOLDER).length - 1, 2)
})

test('campus name: registry display name without the brand prefix; unknown slug refused', () => {
  assert.equal(stripBrand('Alpha Boca Raton'), 'Boca Raton')
  assert.equal(stripBrand('Alpha School Atlanta'), 'Atlanta')
  assert.equal(campusNameFor('boca-raton', pages), 'Boca Raton')
  assert.equal(campusNameFor('east-bay', pages), 'East Bay')
  assert.equal(campusNameFor('boston-suburbs', pages), 'Lexington')
  assert.throws(() => campusNameFor('narnia', pages), (e) => e instanceof OpenCardError && e.code === 'UNKNOWN_CAMPUS')
})

test('SVG template: every placeholder is replaced with the escaped name; a template without one is refused', () => {
  const { svg, replacements, width, height } = composeSvgFromTemplate(templateText, 'Greenwich & Armonk <Port Chester>')
  assert.equal(replacements, 2)
  assert.equal(width, 1424); assert.equal(height, 979)
  assert.ok(!svg.includes(PLACEHOLDER))
  assert.equal(svg.split('Greenwich &amp; Armonk &lt;Port Chester&gt;').length - 1, 2)
  assert.equal(escapeXml(`a"b'c`), 'a&quot;b&apos;c')
  assert.throws(() => composeSvgFromTemplate(templateText.split(PLACEHOLDER).join('Austin'), 'East Bay'), (e) => e.code === 'NO_PLACEHOLDER')
  assert.throws(() => composeSvgFromTemplate('<html>no</html>', 'East Bay'), (e) => e.code === 'BAD_TEMPLATE')
  const viewBoxOnly = composeSvgFromTemplate('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 440"><text>{{CAMPUS}}</text></svg>', 'Tulsa')
  assert.equal(viewBoxOnly.width, 640); assert.equal(viewBoxOnly.height, 440)
  assert.match(viewBoxOnly.svg, /<svg width="640" height="440"/)
})

test('PNG template plus layout: the wrapper embeds the PNG and places the name; bad layouts are refused', () => {
  const png = encodePng({ width: 300, height: 200, rgba: new Uint8Array(300 * 200 * 4).fill(255) })
  assert.deepEqual(pngSize(png), { width: 300, height: 200 })
  const layout = { x: 150, y: 120, font: 'Montserrat, Arial, sans-serif', size: 40, color: '#102030', maxWidth: 260, align: 'center', weight: 800 }
  const short = composeSvgFromPng(png, layout, 'Tulsa')
  assert.equal(short.width, 300); assert.equal(short.height, 200); assert.equal(short.fitted, false)
  assert.match(short.svg, /<image [^>]*href="data:image\/png;base64,/)
  assert.match(short.svg, /<text x="150" y="120" font-family="Montserrat, Arial, sans-serif" font-size="40" fill="#102030" text-anchor="middle" font-weight="800">Tulsa<\/text>/)
  const long = composeSvgFromPng(png, layout, 'Greenwich Port Chester and Armonk')
  assert.equal(long.fitted, true)
  assert.match(long.svg, /textLength="260" lengthAdjust="spacingAndGlyphs"/)
  assert.deepEqual(LAYOUT_FIELDS, ['x', 'y', 'font', 'size', 'color', 'maxWidth', 'align'])
  assert.throws(() => validateLayout({ ...layout, align: 'justify' }), (e) => e.code === 'BAD_LAYOUT')
  assert.throws(() => validateLayout({ ...layout, size: -1 }), (e) => e.code === 'BAD_LAYOUT')
  assert.throws(() => validateLayout({ x: 1, y: 2 }), (e) => e.code === 'BAD_LAYOUT' && /font, size, color, maxWidth, align/.test(e.message))
  assert.throws(() => composeSvgFromPng(Buffer.from('not a png'), layout, 'Tulsa'), (e) => e.code === 'BAD_TEMPLATE')
})

test('planCard: required arguments, template existence, registry slug, output extension; nothing written', () => {
  const dir = tmpDir()
  assert.throws(() => planCard({ template: TEMPLATE, out: path.join(dir, 'x.png') }), (e) => e.code === 'MISSING_ARG' && /--campus/.test(e.message))
  assert.throws(() => planCard({ campus: 'east-bay', template: path.join(dir, 'missing.svg'), out: path.join(dir, 'x.png') }), (e) => e.code === 'BAD_TEMPLATE')
  assert.throws(() => planCard({ campus: 'east-bay', template: TEMPLATE, out: path.join(dir, 'x.jpg') }), (e) => e.code === 'MISSING_ARG' && /\.png/.test(e.message))
  assert.throws(() => planCard({ campus: 'narnia', template: TEMPLATE, out: path.join(dir, 'x.png') }), (e) => e.code === 'UNKNOWN_CAMPUS')
  const plan = planCard({ campus: 'east-bay', template: TEMPLATE, out: path.join(dir, 'east-bay.png'), name: 'East Bay (Piedmont)' })
  assert.equal(plan.name, 'East Bay (Piedmont)'); assert.equal(plan.registeredName, 'East Bay')
  assert.equal(plan.template.format, 'svg'); assert.equal(plan.replacements, 2)
  assert.equal(fs.readdirSync(dir).length, 0, 'planCard writes nothing')
  const png = encodePng({ width: 120, height: 80, rgba: new Uint8Array(120 * 80 * 4).fill(200) })
  fs.writeFileSync(path.join(dir, 'flat.png'), png)
  assert.throws(() => planCard({ campus: 'tulsa', template: path.join(dir, 'flat.png'), out: path.join(dir, 'x.png') }), (e) => e.code === 'BAD_LAYOUT' && /--layout/.test(e.message))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('renderers: the preference order is sharp, resvg, chromium, magick and detection names each one', () => {
  assert.deepEqual(RENDERERS, ['sharp', 'resvg', 'chromium', 'magick'])
  const found = detectRenderers()
  assert.deepEqual(found.map((r) => r.name), RENDERERS)
  for (const r of found) assert.equal(typeof r.detail, 'string')
})

test('end to end (SVG template): the placeholder card renders at template size with the campus name drawn', { skip: skipReason }, async () => {
  const dir = tmpDir()
  const a = await generateOpenCard({ campus: 'east-bay', template: TEMPLATE, out: path.join(dir, 'east-bay.png'), json: path.join(dir, 'east-bay.json'), 'svg-out': path.join(dir, 'east-bay.svg') })
  const b = await generateOpenCard({ campus: 'tulsa', template: TEMPLATE, out: path.join(dir, 'tulsa.png') })
  assert.equal(a.version, GENERATOR_VERSION)
  assert.equal(a.name, 'East Bay'); assert.equal(b.name, 'Tulsa')
  assert.ok(RENDERERS.includes(a.renderer), `rendered with ${a.renderer}`)
  const east = decodePng(fs.readFileSync(a.out.file)); const tulsa = decodePng(fs.readFileSync(b.out.file))
  assert.equal(east.width, 1424); assert.equal(east.height, 979)
  assert.equal(tulsa.width, 1424); assert.equal(tulsa.height, 979)
  assert.notEqual(Buffer.from(east.rgba).compare(Buffer.from(tulsa.rgba)), 0, 'two campus names give two different pictures')
  // the name band (y 330..490) carries dark ink on the light ground
  let ink = 0
  for (let y = 330; y < 490; y += 2) for (let x = 200; x < 1224; x += 2) { const i = (y * 1424 + x) * 4; if (east.rgba[i] < 90 && east.rgba[i + 1] < 90 && east.rgba[i + 2] < 110) ink++ }
  assert.ok(ink > 500, `campus name pixels drawn in the name band (${ink})`)
  const sidecar = JSON.parse(fs.readFileSync(path.join(dir, 'east-bay.json'), 'utf8'))
  assert.equal(sidecar.out.sha256, a.out.sha256); assert.equal(sidecar.template.sha256, a.template.sha256); assert.match(sidecar.production, /open-card\.md/)
  assert.ok(!fs.readFileSync(path.join(dir, 'east-bay.svg'), 'utf8').includes(PLACEHOLDER))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('end to end (PNG template plus layout): the name is drawn onto the flat template', { skip: skipReason }, async () => {
  const dir = tmpDir()
  const width = 600, height = 400
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) { rgba[i * 4] = 230; rgba[i * 4 + 1] = 236; rgba[i * 4 + 2] = 242; rgba[i * 4 + 3] = 255 }
  fs.writeFileSync(path.join(dir, 'flat.png'), encodePng({ width, height, rgba }))
  fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify({ x: 300, y: 230, font: 'Montserrat, Helvetica, Arial, sans-serif', size: 72, color: '#10203a', maxWidth: 560, align: 'center', weight: 800 }))
  const result = await generateOpenCard({ campus: 'boca-raton', template: path.join(dir, 'flat.png'), layout: path.join(dir, 'layout.json'), out: path.join(dir, 'boca-raton.png') })
  assert.equal(result.template.format, 'png+layout'); assert.equal(result.name, 'Boca Raton')
  const image = decodePng(fs.readFileSync(result.out.file))
  assert.equal(image.width, width); assert.equal(image.height, height)
  let ink = 0, ground = 0
  for (let y = 160; y < 250; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; if (image.rgba[i] < 90) ink++; else if (image.rgba[i] > 200) ground++ }
  assert.ok(ink > 300, `name pixels drawn (${ink})`); assert.ok(ground > 10000, 'the flat template shows around the name')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('CLI: --list-renderers prints the roster; a generate run writes the PNG and the sidecar', { skip: skipReason }, () => {
  const script = path.join(root, 'agent', 'generate-open-card.mjs')
  const roster = execFileSync(process.execPath, [script, '--list-renderers'], { encoding: 'utf8' })
  for (const name of RENDERERS) assert.match(roster, new RegExp(`(available|missing)\\s+${name}:`))
  const dir = tmpDir()
  const out = execFileSync(process.execPath, [script, '--campus', 'east-bay', '--template', TEMPLATE, '--out', path.join(dir, 'card.png'), '--json', path.join(dir, 'card.json')], { encoding: 'utf8' })
  assert.match(out, /east-bay -> "East Bay" 1424x979 via (sharp|resvg|chromium|magick)/)
  assert.match(out, /Not placed anywhere/)
  assert.ok(fs.existsSync(path.join(dir, 'card.png'))); assert.ok(fs.existsSync(path.join(dir, 'card.json')))
  fs.rmSync(dir, { recursive: true, force: true })
})
