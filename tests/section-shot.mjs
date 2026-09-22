#!/usr/bin/env node
/**
 * Section capture: the ring 2 evidence a reviewer can actually read. Loads the page in a real browser, scrolls the
 * named element into view, waits for every <img> inside it to load and decode (img.decode(), so a lazy image with
 * decoding=async that reports complete before it paints does not produce a grey box), and screenshots that element
 * with a small margin at deviceScaleFactor 2 on desktop and mobile. The pair goes to the ticket with
 * `agent/attach-evidence.mjs --section "<name>"` next to the full-page pair; protocol section 7.
 *
 * Why: Matt's first review with the Evidence section (Park City events, 2026-09-22) had only a full page shrunk to
 * a thumbnail, with the event cards grey because their lazy images had not painted. The reviewer must be able to
 * look at the element "Look for" names, at a legible size, with its images painted.
 *
 * Usage: node tests/section-shot.mjs --url <page> --selector <css> [--name <section name>] [--out <dir>]
 *        [--viewports desktop,mobile] [--json out.json] [--timeout <ms, default 15000>] [--playwright <dir>]
 * Writes <out>/<slug>-desktop.png and <out>/<slug>-mobile.png where <slug> is the section name slugified (default:
 * the selector). Exit 0 when every image decoded; 1 when some never decoded (the capture is still written and the
 * report names each image); 2 when the selector matched nothing, the page did not load, or Playwright is missing.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const VIEWPORTS = { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } }
export const DEVICE_SCALE_FACTOR = 2
export const PADDING_PX = 16
export const DEFAULT_DECODE_TIMEOUT_MS = 15_000

export class SectionShotError extends Error {
  /** @param {'MISSING_ARG'|'BAD_URL'|'BAD_VIEWPORT'|'PLAYWRIGHT_NOT_FOUND'|'NAV_FAILED'|'SELECTOR_NOT_FOUND'|'IMAGES_NOT_DECODED'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'SectionShotError'; this.code = code; Object.assign(this, extra) }
}

/** Same arg shape as the other playbook scripts: --key value, or --flag. */
export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2); const next = argv[i + 1]
    out[key] = next === undefined || next.startsWith('--') ? true : (i++, next)
  }
  return out
}

/** "team carousel: Isabella Cofresi card" -> "team-carousel-isabella-cofresi-card"; "#events_strip" -> "events-strip". */
export function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'section'
}

/** The output file for one viewport: <out>/<slug>-<viewport>.png. */
export function outputFile(out, name, viewport) {
  return path.join(out, `${slugify(name)}-${viewport}.png`)
}

/** Validate the arguments and name the outputs; launches nothing. */
export function planSectionShot(args) {
  for (const key of ['url', 'selector']) if (!args[key] || args[key] === true) throw new SectionShotError('MISSING_ARG', `--${key} is required`)
  let url
  try { url = new URL(args.url) } catch { throw new SectionShotError('BAD_URL', `--url must be the https URL of the public page, got ${args.url}`) }
  if (url.protocol !== 'https:') throw new SectionShotError('BAD_URL', `--url must be https, got ${args.url}`)
  const selector = String(args.selector).trim()
  const name = args.name && args.name !== true ? String(args.name).trim().slice(0, 80) : selector
  const out = args.out && args.out !== true ? path.resolve(String(args.out)) : path.resolve('evidence')
  const viewports = args.viewports && args.viewports !== true ? String(args.viewports).split(',').map((v) => v.trim()).filter(Boolean) : Object.keys(VIEWPORTS)
  for (const viewport of viewports) if (!VIEWPORTS[viewport]) throw new SectionShotError('BAD_VIEWPORT', `--viewports accepts ${Object.keys(VIEWPORTS).join(', ')}; got ${viewport}`)
  const timeoutMs = args.timeout && args.timeout !== true ? Number(args.timeout) : DEFAULT_DECODE_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new SectionShotError('MISSING_ARG', `--timeout must be a positive number of milliseconds, got ${args.timeout}`)
  const files = Object.fromEntries(viewports.map((viewport) => [viewport, outputFile(out, name, viewport)]))
  return { url: url.toString(), selector, name, out, viewports, timeoutMs, files, json: args.json && args.json !== true ? path.resolve(String(args.json)) : null }
}

/** Playwright is not a dependency of the playbook; borrow it the way rendered-controls.mjs does. */
export function loadChromium(args = {}, env = process.env) {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [args.playwright, env.PLAYWRIGHT_ROOT, path.join(here, '..'), path.join(env.HOME || '', 'DevProjects', 'aeo')].filter(Boolean)
  const loadErrors = []
  for (const dir of candidates) { try { return createRequire(path.join(dir, 'package.json'))('playwright').chromium } catch (e) { loadErrors.push(`${dir}: ${e.message.split('\n')[0]}`) } }
  throw new SectionShotError('PLAYWRIGHT_NOT_FOUND', 'playwright not found; pass --playwright <dir> or set PLAYWRIGHT_ROOT\n' + loadErrors.join('\n'))
}

/**
 * Runs inside the page. Forces every <img> in the element to load now (a lazy image below the fold never starts
 * otherwise), then awaits decode() on each with one shared deadline. Returns one row per image so the report can
 * name the ones that never painted.
 */
function waitForImagesInPage({ selector, timeoutMs }) {
  const root = document.querySelector(selector)
  if (!root) return { found: false, images: [] }
  const imgs = [...root.querySelectorAll('img')]
  for (const img of imgs) { if (img.loading === 'lazy') img.loading = 'eager' }
  const deadline = Date.now() + timeoutMs
  const describe = (img, decoded, reason) => ({
    src: (img.currentSrc || img.src || '').slice(0, 300), alt: (img.alt || '').slice(0, 120), complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
    renderedWidth: Math.round(img.getBoundingClientRect().width), renderedHeight: Math.round(img.getBoundingClientRect().height), decoded, ...(reason ? { reason } : {}),
  })
  return Promise.all(imgs.map(async (img) => {
    const remaining = Math.max(0, deadline - Date.now())
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`decode timed out after ${timeoutMs}ms`)), remaining) })
    try {
      if (!img.currentSrc && !img.src) throw new Error('no src (lazy placeholder never swapped in)')
      await Promise.race([img.decode(), timeout])
      return describe(img, true)
    } catch (error) {
      return describe(img, false, error.message || String(error))
    } finally { clearTimeout(timer) }
  })).then((images) => ({ found: true, images }))
}

/**
 * Capture one viewport: navigate, scroll the element in, wait for its images, screenshot the element with a margin.
 * Throws SELECTOR_NOT_FOUND and NAV_FAILED; an image that never decoded is reported, not thrown, and the file is
 * still written so the reviewer sees what the agent saw.
 */
export async function captureSection(browser, plan, viewport, { log = () => {} } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], deviceScaleFactor: DEVICE_SCALE_FACTOR, userAgent: 'alpha-website-playbook section-shot' })
  const page = await context.newPage()
  try {
    try { await page.goto(plan.url + (plan.url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { waitUntil: 'load', timeout: 90_000 }) } catch (error) {
      throw new SectionShotError('NAV_FAILED', `${viewport}: ${plan.url} did not load: ${error.message.split('\n')[0]}`, { viewport })
    }
    const locator = page.locator(plan.selector)
    const matches = await locator.count()
    if (matches === 0) throw new SectionShotError('SELECTOR_NOT_FOUND', `${viewport}: nothing on ${plan.url} matches ${plan.selector}`, { viewport, selector: plan.selector })
    const element = locator.first()
    await element.scrollIntoViewIfNeeded({ timeout: 10_000 })
    await page.waitForTimeout(500)
    const waited = await page.evaluate(waitForImagesInPage, { selector: plan.selector, timeoutMs: plan.timeoutMs })
    // A settle so a just-decoded image has painted before the capture.
    await page.waitForTimeout(300)
    const box = await element.boundingBox()
    if (!box || box.width === 0 || box.height === 0) throw new SectionShotError('SELECTOR_NOT_FOUND', `${viewport}: ${plan.selector} matches but has no rendered box on ${plan.url}`, { viewport, selector: plan.selector, matches })
    const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    const clip = clipWithPadding(box, scroll, PADDING_PX)
    fs.mkdirSync(plan.out, { recursive: true })
    const file = plan.files[viewport]
    await page.screenshot({ path: file, fullPage: true, clip })
    const images = waited.images
    const undecoded = images.filter((img) => !img.decoded)
    const result = { viewport, file, matches, box: { x: Math.round(box.x + scroll.x), y: Math.round(box.y + scroll.y), width: Math.round(box.width), height: Math.round(box.height) }, clip, deviceScaleFactor: DEVICE_SCALE_FACTOR, images, undecoded: undecoded.length, capturedAt: new Date().toISOString() }
    log(`${viewport}: ${file} (${result.box.width}x${result.box.height} css px, ${images.length} images, ${undecoded.length} not decoded${matches > 1 ? `, first of ${matches} matches` : ''})`)
    return result
  } finally {
    await context.close()
  }
}

/** The screenshot clip in page coordinates: the element's box plus a margin, kept inside the document. */
export function clipWithPadding(box, scroll, padding) {
  const x = Math.max(0, box.x + scroll.x - padding)
  const y = Math.max(0, box.y + scroll.y - padding)
  const right = Math.min(scroll.width, box.x + scroll.x + box.width + padding)
  const bottom = Math.min(scroll.height, box.y + scroll.y + box.height + padding)
  return { x: Math.round(x), y: Math.round(y), width: Math.max(1, Math.round(right - x)), height: Math.max(1, Math.round(bottom - y)) }
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const plan = planSectionShot(args)
  const chromium = loadChromium(args, env)
  const browser = await chromium.launch()
  const report = { url: plan.url, selector: plan.selector, name: plan.name, ranAt: new Date().toISOString(), viewports: {} }
  try {
    for (const viewport of plan.viewports) report.viewports[viewport] = await captureSection(browser, plan, viewport, { log: io.log })
  } finally {
    await browser.close()
  }
  if (plan.json) fs.writeFileSync(plan.json, JSON.stringify(report, null, 2) + '\n')
  const undecoded = Object.values(report.viewports).flatMap((v) => v.images.filter((img) => !img.decoded).map((img) => `${v.viewport} ${img.src || '(no src)'}: ${img.reason}`))
  if (undecoded.length) {
    throw new SectionShotError('IMAGES_NOT_DECODED', `${undecoded.length} image(s) in ${plan.selector} never decoded; the captures were written but may show grey boxes:\n${undecoded.join('\n')}`, { report })
  }
  return report
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().then((report) => { console.log(JSON.stringify(report, null, 2)) }).catch((error) => {
    if (error instanceof SectionShotError) {
      console.error(`${error.code}: ${error.message}`)
      if (error.report) console.log(JSON.stringify(error.report, null, 2))
      process.exit(error.code === 'IMAGES_NOT_DECODED' ? 1 : 2)
    }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
