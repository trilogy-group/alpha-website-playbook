#!/usr/bin/env node
/**
 * Generate a campus "Open and Enrolling" intro card from the template (QC loop repair plan 2026-09-25, repair 5:
 * derive the card from the source so the "no card recorded for an Open campus" class dies). The template is Yash
 * Chitneni's; only the campus name varies. Until he supplies it, registry/campus-open-media.json template.source is
 * null and the only template in the repo is the plain placeholder under tests/fixtures/open-card/, which proves the
 * pipeline and is never placed on a page.
 *
 *   node agent/generate-open-card.mjs --campus <slug> --template <file.svg | file.png> --out <card.png>
 *       [--name "<display name>"] [--layout <layout.json>] [--svg-out <composed.svg>] [--json <sidecar.json>]
 *       [--renderer auto|sharp|resvg|chromium|magick] [--playwright <dir>] [--registry-root <dir>]
 *
 * Template forms:
 *   SVG (preferred): the master exported as SVG with the campus name replaced by the literal text {{CAMPUS}}
 *       (registry template.placeholder). Every occurrence is replaced, XML-escaped. Fonts must be outlined or
 *       embedded in the SVG, or installed where the rasterizer runs.
 *   PNG + layout: a flat PNG of the card without the name, plus a JSON text-layout spec
 *       { "x": 712, "y": 520, "font": "Montserrat, Arial, sans-serif", "size": 96, "color": "#0B2A4A",
 *         "maxWidth": 1200, "align": "center", "weight": 800, "letterSpacing": 0 }
 *       (x, y in template pixels; y is the text baseline; align left|center|right; a name wider than maxWidth is
 *       fitted with textLength). The PNG is embedded in an SVG wrapper and the same rasterizer path runs.
 *
 * Rasterizer: the first available of sharp, @resvg/resvg-js (both resolved from this repo, SHARP_ROOT or
 * PLAYWRIGHT_ROOT, and the sibling aeo and marketingsupport checkouts; neither is a dependency of this repo),
 * Playwright's Chromium (borrowed the way tests/section-shot.mjs borrows it), or the ImageMagick `magick` CLI.
 * No native dependency is added here; `--renderer` pins one, and NO_RASTERIZER names what was tried.
 *
 * The campus name comes from registry/campus-pages.json names[0] without the "Alpha " prefix ("Alpha Boca Raton"
 * -> "Boca Raton"); --name overrides it (Greenwich carries two programs, say which). The sidecar JSON records the
 * template sha256, the renderer, the output sha256 and size, which the open-card recipe copies onto the ticket.
 *
 * This tool writes files on disk only. It never uploads to WordPress or APEX; production placement goes through
 * protocols/recipes/open-card.md (operator review, APEX asset, upload_media_from_apex_asset, media recipe).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadChromium, parseArgs } from '../tests/section-shot.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
export const GENERATOR_VERSION = '0.1'
export const PLACEHOLDER = '{{CAMPUS}}'
export const RENDERERS = ['sharp', 'resvg', 'chromium', 'magick']
export const LAYOUT_FIELDS = ['x', 'y', 'font', 'size', 'color', 'maxWidth', 'align']
export const ALIGN_ANCHOR = { left: 'start', center: 'middle', right: 'end' }
/** Montserrat-ish average advance per character as a fraction of the font size, for the maxWidth fit decision. */
export const GLYPH_WIDTH_RATIO = 0.64
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
export const MAX_DIMENSION = 8000

export class OpenCardError extends Error {
  /** @param {'MISSING_ARG'|'UNKNOWN_CAMPUS'|'BAD_TEMPLATE'|'NO_PLACEHOLDER'|'BAD_LAYOUT'|'NO_RASTERIZER'|'RASTER_FAILED'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'OpenCardError'; this.code = code; Object.assign(this, extra) }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

// ---------- campus name ----------

/** "Alpha Boca Raton" -> "Boca Raton"; "Alpha School Atlanta" -> "Atlanta". */
export function stripBrand(name) {
  return String(name || '').replace(/^\s*Alpha\s+(?:School\s+)?/i, '').trim()
}

export function campusNameFor(slug, pages) {
  const entry = pages?.campuses?.[slug]
  if (!entry) throw new OpenCardError('UNKNOWN_CAMPUS', `${slug} is not in registry/campus-pages.json; pass a registered slug (or --name with a registered slug)`)
  const name = stripBrand(entry.names?.[0])
  if (!name) throw new OpenCardError('UNKNOWN_CAMPUS', `${slug} has no display name in registry/campus-pages.json`)
  return name
}

// ---------- SVG composition ----------

export function escapeXml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Width and height of an SVG document from its root width/height (px or unitless), else its viewBox. */
export function svgSize(svgText) {
  const open = svgText.match(/<svg\b[^>]*>/i)?.[0]
  if (!open) throw new OpenCardError('BAD_TEMPLATE', 'no <svg> root element')
  const attr = (name) => { const m = open.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]+)"`, 'i')); return m ? m[1].trim() : null }
  const px = (value) => { if (value === null) return null; const m = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/); return m ? Math.round(Number(m[1])) : null }
  let width = px(attr('width')), height = px(attr('height'))
  const viewBox = attr('viewBox')?.split(/[\s,]+/).map(Number)
  if ((!width || !height) && viewBox?.length === 4 && viewBox.every(Number.isFinite)) { width = width || Math.round(viewBox[2]); height = height || Math.round(viewBox[3]) }
  if (!width || !height) throw new OpenCardError('BAD_TEMPLATE', 'the SVG root needs width and height in px (or a viewBox)')
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw new OpenCardError('BAD_TEMPLATE', `${width}x${height} is larger than ${MAX_DIMENSION}px`)
  return { width, height, hasWidthAttr: attr('width') !== null, hasHeightAttr: attr('height') !== null }
}

/** Give the root explicit width/height attributes so browsers lay it out at template size. */
function ensureRootSize(svgText, { width, height, hasWidthAttr, hasHeightAttr }) {
  if (hasWidthAttr && hasHeightAttr) return svgText
  return svgText.replace(/<svg\b/i, `<svg${hasWidthAttr ? '' : ` width="${width}"`}${hasHeightAttr ? '' : ` height="${height}"`}`)
}

/** Replace every placeholder in the SVG template with the escaped campus name. */
export function composeSvgFromTemplate(svgText, name, { placeholder = PLACEHOLDER } = {}) {
  if (!/<svg\b/i.test(svgText)) throw new OpenCardError('BAD_TEMPLATE', 'the template is not an SVG document')
  const count = svgText.split(placeholder).length - 1
  if (!count) throw new OpenCardError('NO_PLACEHOLDER', `the template carries no ${placeholder} placeholder; the campus name has nowhere to go`)
  const size = svgSize(svgText)
  const svg = ensureRootSize(svgText.split(placeholder).join(escapeXml(name)), size)
  return { svg, replacements: count, width: size.width, height: size.height }
}

export function pngSize(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new OpenCardError('BAD_TEMPLATE', 'the template is not a PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

export function validateLayout(layout) {
  if (!layout || typeof layout !== 'object') throw new OpenCardError('BAD_LAYOUT', 'the layout must be a JSON object')
  const missing = LAYOUT_FIELDS.filter((k) => layout[k] === undefined || layout[k] === null || layout[k] === '')
  if (missing.length) throw new OpenCardError('BAD_LAYOUT', `layout is missing ${missing.join(', ')} (fields: ${LAYOUT_FIELDS.join(', ')})`)
  for (const k of ['x', 'y', 'size', 'maxWidth']) if (!Number.isFinite(Number(layout[k])) || Number(layout[k]) < 0) throw new OpenCardError('BAD_LAYOUT', `layout.${k} must be a non-negative number, got ${layout[k]}`)
  if (!ALIGN_ANCHOR[layout.align]) throw new OpenCardError('BAD_LAYOUT', `layout.align must be left, center or right, got ${layout.align}`)
  if (!/^#[0-9a-f]{3,8}$|^[a-z]+$|^rgba?\(/i.test(String(layout.color))) throw new OpenCardError('BAD_LAYOUT', `layout.color must be a CSS colour, got ${layout.color}`)
  return { ...layout, x: Number(layout.x), y: Number(layout.y), size: Number(layout.size), maxWidth: Number(layout.maxWidth) }
}

/** Embed the PNG template and draw the name at the layout position. */
export function composeSvgFromPng(pngBytes, rawLayout, name) {
  const { width, height } = pngSize(pngBytes)
  const layout = validateLayout(rawLayout)
  const estimated = name.length * layout.size * GLYPH_WIDTH_RATIO
  const fit = estimated > layout.maxWidth ? ` textLength="${layout.maxWidth}" lengthAdjust="spacingAndGlyphs"` : ''
  const weight = layout.weight ? ` font-weight="${escapeXml(layout.weight)}"` : ''
  const spacing = layout.letterSpacing ? ` letter-spacing="${escapeXml(layout.letterSpacing)}"` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image x="0" y="0" width="${width}" height="${height}" href="data:image/png;base64,${pngBytes.toString('base64')}" xlink:href="data:image/png;base64,${pngBytes.toString('base64')}"/>
  <text x="${layout.x}" y="${layout.y}" font-family="${escapeXml(layout.font)}" font-size="${layout.size}" fill="${escapeXml(layout.color)}" text-anchor="${ALIGN_ANCHOR[layout.align]}"${weight}${spacing}${fit}>${escapeXml(name)}</text>
</svg>
`
  return { svg, width, height, fitted: Boolean(fit), estimatedWidth: Math.round(estimated) }
}

// ---------- rasterizers ----------

function moduleCandidates(args = {}, env = process.env) {
  const home = env.HOME || os.homedir()
  return [root, env.SHARP_ROOT, args.playwright, env.PLAYWRIGHT_ROOT, path.join(home, 'DevProjects', 'aeo'), path.join(home, 'DevProjects', 'marketingsupport')].filter(Boolean)
}

function loadOptional(moduleName, args, env) {
  const errors = []
  for (const dir of moduleCandidates(args, env)) {
    try { return { module: createRequire(path.join(dir, 'package.json'))(moduleName), from: dir } } catch (e) { errors.push(`${dir}: ${String(e.message).split('\n')[0]}`) }
  }
  return { module: null, errors }
}

/** Which rasterizers this machine offers, in preference order, with the reason each is or is not available. */
export function detectRenderers(args = {}, env = process.env) {
  const out = []
  const sharp = loadOptional('sharp', args, env)
  out.push({ name: 'sharp', available: Boolean(sharp.module), detail: sharp.module ? `sharp from ${sharp.from}` : 'sharp not installed in this repo or a sibling checkout' })
  const resvg = loadOptional('@resvg/resvg-js', args, env)
  out.push({ name: 'resvg', available: Boolean(resvg.module), detail: resvg.module ? `@resvg/resvg-js from ${resvg.from}` : '@resvg/resvg-js not installed in this repo or a sibling checkout' })
  let chromium = null, chromiumError = null
  try { chromium = loadChromium(args, env) } catch (e) { chromiumError = String(e.message).split('\n')[0] }
  out.push({ name: 'chromium', available: Boolean(chromium), detail: chromium ? 'playwright chromium' : chromiumError })
  const magick = spawnSync('magick', ['-version'], { encoding: 'utf8' })
  const magickOk = !magick.error && magick.status === 0
  out.push({ name: 'magick', available: magickOk, detail: magickOk ? (magick.stdout.split('\n')[0] || 'magick') : 'ImageMagick `magick` not on PATH' })
  return out
}

async function rasterizeWithSharp(svg, { width, height }, args, env) {
  const sharp = loadOptional('sharp', args, env).module
  return Buffer.from(await sharp(Buffer.from(svg), { density: 96 }).resize(width, height, { fit: 'fill' }).png().toBuffer())
}

async function rasterizeWithResvg(svg, { width }, args, env) {
  const { Resvg } = loadOptional('@resvg/resvg-js', args, env).module
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng())
}

async function rasterizeWithChromium(svg, { width, height }, args, env) {
  const chromium = loadChromium(args, env)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts?.ready)
    return Buffer.from(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height }, omitBackground: true }))
  } finally { await browser.close() }
}

async function rasterizeWithMagick(svg, { width, height }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-card-'))
  try {
    const svgFile = path.join(dir, 'card.svg'); const pngFile = path.join(dir, 'card.png')
    fs.writeFileSync(svgFile, svg)
    const run = spawnSync('magick', ['-background', 'none', '-density', '96', svgFile, '-resize', `${width}x${height}!`, '-depth', '8', `PNG32:${pngFile}`], { encoding: 'utf8' })
    if (run.error || run.status !== 0) throw new OpenCardError('RASTER_FAILED', `magick failed: ${run.error?.message || run.stderr || run.status}`)
    return fs.readFileSync(pngFile)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

/** Rasterize the composed SVG to PNG bytes with the chosen or first available renderer. */
export async function rasterize(svg, size, { renderer = 'auto', args = {}, env = process.env } = {}) {
  const available = detectRenderers(args, env)
  const order = renderer === 'auto' ? RENDERERS : [renderer]
  if (renderer !== 'auto' && !RENDERERS.includes(renderer)) throw new OpenCardError('MISSING_ARG', `--renderer must be auto or one of ${RENDERERS.join(', ')}, got ${renderer}`)
  const tried = []
  for (const name of order) {
    const entry = available.find((r) => r.name === name)
    if (!entry?.available) { tried.push(`${name}: ${entry?.detail || 'unknown'}`); continue }
    try {
      const png = await ({ sharp: rasterizeWithSharp, resvg: rasterizeWithResvg, chromium: rasterizeWithChromium, magick: rasterizeWithMagick })[name](svg, size, args, env)
      const got = pngSize(png)
      if (got.width !== size.width || got.height !== size.height) throw new OpenCardError('RASTER_FAILED', `${name} produced ${got.width}x${got.height}, template is ${size.width}x${size.height}`)
      return { png, renderer: name, detail: entry.detail }
    } catch (e) {
      if (renderer !== 'auto') throw e instanceof OpenCardError ? e : new OpenCardError('RASTER_FAILED', `${name}: ${e.message}`)
      tried.push(`${name}: ${e.message}`)
    }
  }
  throw new OpenCardError('NO_RASTERIZER', `no rasterizer produced the card. Tried ${tried.join('; ')}. Install sharp or @resvg/resvg-js in a sibling checkout, pass --playwright <dir>, or install ImageMagick.`, { tried })
}

// ---------- generate ----------

/** Validate the arguments and compose the SVG; nothing is rasterized or written. */
export function planCard(args, { registryRoot = root } = {}) {
  for (const key of ['campus', 'template', 'out']) if (!args[key] || args[key] === true) throw new OpenCardError('MISSING_ARG', `--${key} is required`)
  if (!fs.existsSync(args.template)) throw new OpenCardError('BAD_TEMPLATE', `${args.template} does not exist`)
  if (path.extname(args.out).toLowerCase() !== '.png') throw new OpenCardError('MISSING_ARG', `--out must end in .png, got ${args.out}`)
  const pages = readJson(path.join(registryRoot, 'registry', 'campus-pages.json'))
  const registered = campusNameFor(args.campus, pages)
  const name = typeof args.name === 'string' && args.name.trim() ? args.name.trim() : registered
  const bytes = fs.readFileSync(args.template)
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)
  let composed, format, layout = null
  if (isPng) {
    if (!args.layout || args.layout === true) throw new OpenCardError('BAD_LAYOUT', 'a PNG template needs --layout <layout.json> with x, y, font, size, color, maxWidth, align')
    layout = readJson(args.layout)
    composed = composeSvgFromPng(bytes, layout, name)
    format = 'png+layout'
  } else {
    composed = composeSvgFromTemplate(bytes.toString('utf8'), name)
    format = 'svg'
  }
  return {
    campus: args.campus, name, registeredName: registered,
    template: { file: path.resolve(args.template), format, sha256: sha256(bytes), bytes: bytes.length, ...(layout ? { layout: path.resolve(args.layout) } : {}) },
    width: composed.width, height: composed.height, svg: composed.svg,
    replacements: composed.replacements ?? null, fitted: composed.fitted ?? null,
    out: path.resolve(args.out), svgOut: typeof args['svg-out'] === 'string' ? path.resolve(args['svg-out']) : null, json: typeof args.json === 'string' ? path.resolve(args.json) : null,
  }
}

export async function generateOpenCard(args, { registryRoot = root, env = process.env } = {}) {
  const plan = planCard(args, { registryRoot })
  const { png, renderer, detail } = await rasterize(plan.svg, { width: plan.width, height: plan.height }, { renderer: typeof args.renderer === 'string' ? args.renderer : 'auto', args, env })
  fs.mkdirSync(path.dirname(plan.out), { recursive: true })
  fs.writeFileSync(plan.out, png)
  if (plan.svgOut) { fs.mkdirSync(path.dirname(plan.svgOut), { recursive: true }); fs.writeFileSync(plan.svgOut, plan.svg) }
  const result = {
    generator: 'agent/generate-open-card.mjs', version: GENERATOR_VERSION, generatedAt: new Date().toISOString(),
    campus: plan.campus, name: plan.name, registeredName: plan.registeredName, template: plan.template, replacements: plan.replacements, fitted: plan.fitted,
    renderer, rendererDetail: detail, width: plan.width, height: plan.height,
    out: { file: plan.out, sha256: sha256(png), bytes: png.length, mimeType: 'image/png' }, svgOut: plan.svgOut,
    production: 'not placed; production goes through protocols/recipes/open-card.md (operator review, APEX asset, upload_media_from_apex_asset, media recipe)',
  }
  if (plan.json) { fs.mkdirSync(path.dirname(plan.json), { recursive: true }); fs.writeFileSync(plan.json, JSON.stringify(result, null, 2) + '\n') }
  return result
}

export async function main(argv = process.argv.slice(2), io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  if (args['list-renderers']) { for (const r of detectRenderers(args)) io.log(`${r.available ? 'available' : 'missing  '} ${r.name}: ${r.detail}`); return null }
  const result = await generateOpenCard(args, { registryRoot: typeof args['registry-root'] === 'string' ? args['registry-root'] : root })
  io.log(`${result.campus} -> "${result.name}" ${result.width}x${result.height} via ${result.renderer}: ${result.out.file} (${result.out.bytes} bytes, sha256 ${result.out.sha256.slice(0, 12)}); template ${result.template.format} sha256 ${result.template.sha256.slice(0, 12)}${result.svgOut ? `; svg ${result.svgOut}` : ''}`)
  io.log('Not placed anywhere. Review the PNG, then follow protocols/recipes/open-card.md.')
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof OpenCardError ? `${error.code}: ${error.message}` : error); process.exit(1) })
}
