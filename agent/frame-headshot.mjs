#!/usr/bin/env node
/**
 * Frame a headshot to the team card's rendered aspect ratio before it is bound (docs/headshot-binding.md, staff-card
 * recipe). The card image box on a campus page is a fixed-height landscape rendered with object-fit: cover, so a
 * portrait bound at its native ratio loses its head (Jason Tan, San Francisco, 2026-09-22). This tool crops the
 * reviewed file to the card ratio with the head kept, writes a side-by-side preview for the operator to look at, and
 * prints the result's dimensions and sha256, which is what `agent/bind-headshot.mjs --file` then takes unchanged.
 *
 *   node agent/frame-headshot.mjs --file <img> --ratio <w:h | 1.294 | auto> --out <file>
 *       [--page <canonical URL> [--selector <css of the card or its image>]]   (with --ratio auto: measures the box
 *                                                                              at desktop 1440x1000, read-only)
 *       [--focus top|center|bottom|<0..1>] [--preview <png>] [--json <file>] [--playwright <dir>]
 *
 * Crop geometry (no face detection): the window is as large as the ratio allows. A portrait going into a wider box
 * keeps the full width and takes its height from the top (`--focus top`, the default for portraits: head and
 * headroom stay, shoulders go); a landscape going into a narrower box keeps the full height and takes its width from
 * the centre. `--focus center|bottom|<fraction>` moves the window down when the source has a lot of air above the
 * head; the operator decides from the preview. Nothing is scaled: the crop keeps the source's pixels.
 *
 * Formats. PNG in and out is pure JavaScript (8-bit, non-interlaced, gray, RGB, with or without alpha; no palette).
 * JPEG and WebP input, and JPEG output, go through macOS `sips`, so those paths are macOS only; on another OS convert
 * to PNG first. EXIF orientation is not applied: a sideways preview means the source needs rotating before framing.
 * The preview is always a PNG: the source on the left with the crop window outlined, the result on the right.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadChromium, parseArgs } from '../tests/section-shot.mjs'
import { measureTeamCardsInPage, VIEWPORTS } from '../tests/photo-framing.mjs'

export class FrameHeadshotError extends Error {
  /** @param {'MISSING_ARG'|'BAD_RATIO'|'BAD_FOCUS'|'BAD_URL'|'UNSUPPORTED_IMAGE'|'NEEDS_MACOS_SIPS'|'SIPS_FAILED'|'MEASURE_FAILED'|'NOTHING_TO_CROP'} code */
  constructor(code, message, extra = {}) { super(message); this.name = 'FrameHeadshotError'; this.code = code; Object.assign(this, extra) }
}

// ---------- ratio and focus ----------

/** "1130:873", "4:3", "1.294" -> width/height as a number; "auto" -> 'auto'. */
export function parseRatio(value) {
  if (value === undefined || value === true) throw new FrameHeadshotError('MISSING_ARG', '--ratio is required: <w:h>, a decimal width/height, or auto (with --page)')
  const text = String(value).trim().toLowerCase()
  if (text === 'auto') return 'auto'
  const pair = text.match(/^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/)
  const ratio = pair ? Number(pair[1]) / Number(pair[2]) : Number(text)
  if (!Number.isFinite(ratio) || ratio <= 0) throw new FrameHeadshotError('BAD_RATIO', `--ratio must be <w:h> or a positive decimal, got ${value}`)
  if (ratio < 0.2 || ratio > 5) throw new FrameHeadshotError('BAD_RATIO', `--ratio ${value} is not a card ratio (expected between 1:5 and 5:1)`)
  return Math.round(ratio * 10000) / 10000
}

/** "top" -> 0, "center" -> 0.5, "bottom" -> 1, "0.25" -> 0.25; undefined -> null (choose by orientation). */
export function parseFocus(value) {
  if (value === undefined || value === true) return null
  const text = String(value).trim().toLowerCase()
  const named = { top: 0, center: 0.5, centre: 0.5, middle: 0.5, bottom: 1 }
  if (text in named) return named[text]
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new FrameHeadshotError('BAD_FOCUS', `--focus must be top, center, bottom, or a fraction 0..1, got ${value}`)
  return n
}

/**
 * The largest window of the target ratio inside a width x height image. Portrait into a wider box: full width,
 * height from the top unless focus says otherwise. Landscape into a narrower box: full height, width from the
 * centre. Equal ratios: the whole image.
 */
export function cropWindow({ width, height, ratio, focus = null }) {
  const w = Number(width), h = Number(height), r = Number(ratio)
  if (!(w > 0 && h > 0 && r > 0)) throw new FrameHeadshotError('BAD_RATIO', `cannot frame ${width}x${height} to ratio ${ratio}`)
  const imageRatio = w / h
  if (Math.abs(imageRatio - r) < 1e-4) return { x: 0, y: 0, width: w, height: h, axis: 'none', focus: null }
  if (imageRatio < r) {
    // Taller than the target: keep the width, cut height. Default anchor: top (head and headroom).
    const cropH = Math.max(1, Math.round(w / r))
    const f = focus === null ? 0 : focus
    return { x: 0, y: Math.round((h - cropH) * f), width: w, height: cropH, axis: 'vertical', focus: f }
  }
  // Wider than the target: keep the height, cut width from the centre (a headshot's face is in the middle).
  const cropW = Math.max(1, Math.round(h * r))
  const f = focus === null ? 0.5 : focus
  return { x: Math.round((w - cropW) * f), y: 0, width: cropW, height: h, axis: 'horizontal', focus: f }
}

// ---------- PNG codec (pure JS) ----------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

export function sniffImage(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

/** Decode an 8-bit non-interlaced PNG (gray, gray+alpha, RGB, RGBA) into { width, height, rgba: Uint8Array }. */
export function decodePng(bytes) {
  if (sniffImage(bytes) !== 'image/png') throw new FrameHeadshotError('UNSUPPORTED_IMAGE', 'not a PNG')
  let pos = 8
  let header = null
  const idat = []
  while (pos + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(pos); const type = bytes.toString('ascii', pos + 4, pos + 8)
    const data = bytes.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + length
  }
  if (!header) throw new FrameHeadshotError('UNSUPPORTED_IMAGE', 'PNG without IHDR')
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[header.colorType]
  if (!channels) throw new FrameHeadshotError('UNSUPPORTED_IMAGE', `PNG colour type ${header.colorType} (palette) is not supported; export as RGB first`)
  if (header.bitDepth !== 8) throw new FrameHeadshotError('UNSUPPORTED_IMAGE', `PNG bit depth ${header.bitDepth} is not supported; export as 8-bit first`)
  if (header.interlace !== 0) throw new FrameHeadshotError('UNSUPPORTED_IMAGE', 'interlaced PNG is not supported; export non-interlaced first')
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const { width, height } = header
  const stride = width * channels
  const rgba = new Uint8Array(width * height * 4)
  let prev = new Uint8Array(stride)
  let offset = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++]
    const row = new Uint8Array(raw.buffer, raw.byteOffset + offset, stride)
    offset += stride
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0
      let v = row[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c) }
      else if (filter !== 0) throw new FrameHeadshotError('UNSUPPORTED_IMAGE', `PNG filter type ${filter} at row ${y}`)
      cur[i] = v & 0xff
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4
      if (channels === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = cur[s]; rgba[d + 3] = 255 }
      else if (channels === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = cur[s]; rgba[d + 3] = cur[s + 1] }
      else if (channels === 3) { rgba[d] = cur[s]; rgba[d + 1] = cur[s + 1]; rgba[d + 2] = cur[s + 2]; rgba[d + 3] = 255 }
      else { rgba[d] = cur[s]; rgba[d + 1] = cur[s + 1]; rgba[d + 2] = cur[s + 2]; rgba[d + 3] = cur[s + 3] }
    }
    prev = cur
  }
  return { width, height, rgba }
}

/** Encode { width, height, rgba } as an 8-bit RGB PNG (alpha dropped: headshots are opaque and JPEG-bound). */
export function encodePng({ width, height, rgba }, { keepAlpha = false } = {}) {
  const channels = keepAlpha ? 4 : 3
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4, d = y * (stride + 1) + 1 + x * channels
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]
      if (keepAlpha) raw[d + 3] = rgba[s + 3]
    }
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body)); return Buffer.concat([len, body, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = keepAlpha ? 6 : 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

// ---------- pixel operations ----------

export function cropImage(image, window) {
  const { x, y, width, height } = window
  if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) throw new FrameHeadshotError('NOTHING_TO_CROP', `crop ${JSON.stringify(window)} is outside ${image.width}x${image.height}`)
  const rgba = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row++) {
    const src = ((y + row) * image.width + x) * 4
    rgba.set(image.rgba.subarray(src, src + width * 4), row * width * 4)
  }
  return { width, height, rgba }
}

/** Area-average downscale to the target width (never upscales). */
export function scaleImage(image, targetWidth) {
  if (targetWidth >= image.width) return image
  const scale = image.width / targetWidth
  const width = targetWidth, height = Math.max(1, Math.round(image.height / scale))
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * scale), y1 = Math.min(image.height, Math.max(y0 + 1, Math.floor((y + 1) * scale)))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * scale), x1 = Math.min(image.width, Math.max(x0 + 1, Math.floor((x + 1) * scale)))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * image.width + xx) * 4; r += image.rgba[i]; g += image.rgba[i + 1]; b += image.rgba[i + 2]; a += image.rgba[i + 3]; n++ }
      const d = (y * width + x) * 4
      rgba[d] = r / n; rgba[d + 1] = g / n; rgba[d + 2] = b / n; rgba[d + 3] = a / n
    }
  }
  return { width, height, rgba }
}

function fillRect(image, x, y, w, h, [r, g, b]) {
  for (let yy = Math.max(0, y); yy < Math.min(image.height, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(image.width, x + w); xx++) { const i = (yy * image.width + xx) * 4; image.rgba[i] = r; image.rgba[i + 1] = g; image.rgba[i + 2] = b; image.rgba[i + 3] = 255 }
}

function blit(target, source, dx, dy) {
  for (let y = 0; y < source.height; y++) {
    if (dy + y < 0 || dy + y >= target.height) continue
    const w = Math.min(source.width, target.width - dx)
    if (w <= 0) continue
    target.rgba.set(source.rgba.subarray(y * source.width * 4, (y * source.width + w) * 4), ((dy + y) * target.width + dx) * 4)
  }
}

/**
 * Side by side: the source (scaled to PREVIEW_HEIGHT) with the crop window outlined in red, a gap, then the framed
 * result at the same scale. The operator looks for the full head and headroom like the neighbouring cards.
 */
export const PREVIEW_HEIGHT = 480
export const PREVIEW_GAP = 24
export function buildPreview(source, window, framed) {
  const scale = Math.min(1, PREVIEW_HEIGHT / source.height)
  const left = scaleImage(source, Math.max(1, Math.round(source.width * scale)))
  const right = scaleImage(framed, Math.max(1, Math.round(framed.width * scale)))
  const width = left.width + PREVIEW_GAP + right.width + 2 * PREVIEW_GAP
  const height = Math.max(left.height, right.height) + 2 * PREVIEW_GAP
  const canvas = { width, height, rgba: new Uint8Array(width * height * 4) }
  fillRect(canvas, 0, 0, width, height, [255, 255, 255])
  blit(canvas, left, PREVIEW_GAP, PREVIEW_GAP)
  blit(canvas, right, PREVIEW_GAP + left.width + PREVIEW_GAP, PREVIEW_GAP)
  // Outline of the crop window on the source, 3 px red, drawn just inside the window.
  const s = left.width / source.width
  const wx = PREVIEW_GAP + Math.round(window.x * s), wy = PREVIEW_GAP + Math.round(window.y * s), ww = Math.max(1, Math.round(window.width * s)), wh = Math.max(1, Math.round(window.height * s))
  const red = [220, 30, 30], t = 3
  fillRect(canvas, wx, wy, ww, t, red); fillRect(canvas, wx, wy + wh - t, ww, t, red); fillRect(canvas, wx, wy, t, wh, red); fillRect(canvas, wx + ww - t, wy, t, wh, red)
  return canvas
}

// ---------- files and sips ----------

function sips(argsList, what) {
  if (process.platform !== 'darwin') throw new FrameHeadshotError('NEEDS_MACOS_SIPS', `${what} needs macOS sips; convert to PNG first on another OS`)
  const run = spawnSync('sips', argsList, { encoding: 'utf8' })
  if (run.status !== 0) throw new FrameHeadshotError('SIPS_FAILED', `sips ${what} failed: ${(run.stderr || run.stdout || '').trim().split('\n')[0]}`)
}

/** Read any supported image into RGBA: PNG directly, JPEG and WebP through sips to a temporary PNG. */
export function readImage(file) {
  const bytes = fs.readFileSync(file)
  const mime = sniffImage(bytes)
  if (!mime) throw new FrameHeadshotError('UNSUPPORTED_IMAGE', `${file} is not a JPEG, PNG, or WebP image`)
  if (mime === 'image/png') return { ...decodePng(bytes), mimeType: mime, sha256: sha256(bytes), bytes: bytes.length }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-headshot-')), 'source.png')
  try {
    sips(['-s', 'format', 'png', file, '--out', tmp], `reading ${mime}`)
    return { ...decodePng(fs.readFileSync(tmp)), mimeType: mime, sha256: sha256(bytes), bytes: bytes.length }
  } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }) }
}

/** Write the framed image: PNG directly; .jpg/.jpeg through sips (quality 90). Returns { file, sha256, bytes, mimeType }. */
export function writeImage(image, out) {
  const ext = path.extname(out).toLowerCase()
  const png = encodePng(image)
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  if (ext === '.png') { fs.writeFileSync(out, png); return { file: path.resolve(out), sha256: sha256(png), bytes: png.length, mimeType: 'image/png' } }
  if (ext === '.jpg' || ext === '.jpeg') {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-headshot-')), 'framed.png')
    try {
      fs.writeFileSync(tmp, png)
      sips(['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', tmp, '--out', out], 'writing JPEG')
      const bytes = fs.readFileSync(out)
      return { file: path.resolve(out), sha256: sha256(bytes), bytes: bytes.length, mimeType: 'image/jpeg' }
    } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }) }
  }
  throw new FrameHeadshotError('UNSUPPORTED_IMAGE', `--out must end in .png, .jpg, or .jpeg, got ${out}`)
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }

// ---------- ratio from the page ----------

/**
 * Measure the card image box on the public page at the desktop viewport, read-only. With --selector, the box of that
 * element's <img> (or the element when it is one); without, the first carousel card the framing check finds, else
 * the first leadership card. Returns { ratio, boxWidth, boxHeight, name, selector }.
 */
export async function measureCardRatio(chromium, url, { selector = null, viewport = 'desktop' } = {}) {
  let parsed
  try { parsed = new URL(url) } catch { throw new FrameHeadshotError('BAD_URL', `--page must be the https URL of the public page, got ${url}`) }
  if (parsed.protocol !== 'https:') throw new FrameHeadshotError('BAD_URL', `--page must be https, got ${url}`)
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: VIEWPORTS[viewport], userAgent: 'alpha-website-playbook frame-headshot (read-only)' })
    const page = await context.newPage()
    await page.goto(url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { waitUntil: 'load', timeout: 90_000 })
    await page.waitForTimeout(800)
    if (selector) {
      const box = await page.evaluate((sel) => {
        const el = document.querySelector(sel); if (!el) return null
        const img = el.tagName === 'IMG' ? el : el.querySelector('img'); if (!img) return { noImage: true }
        const r = img.getBoundingClientRect(); return { width: r.width, height: r.height, name: (el.closest('.swiper-slide, .e-con')?.querySelector('.elementor-heading-title')?.textContent || '').replace(/\s+/g, ' ').trim() }
      }, selector)
      if (!box) throw new FrameHeadshotError('MEASURE_FAILED', `nothing on ${url} matches ${selector}`)
      if (box.noImage) throw new FrameHeadshotError('MEASURE_FAILED', `${selector} on ${url} holds no <img>`)
      if (!(box.width > 0 && box.height > 0)) throw new FrameHeadshotError('MEASURE_FAILED', `${selector} on ${url} has no rendered image box`)
      return { ratio: Math.round((box.width / box.height) * 10000) / 10000, boxWidth: Math.round(box.width * 100) / 100, boxHeight: Math.round(box.height * 100) / 100, name: box.name || null, selector, viewport }
    }
    const team = page.locator('#team')
    if (await team.count()) await team.first().scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {})
    const cards = (await page.evaluate(measureTeamCardsInPage, { timeoutMs: 15_000 })).filter((c) => c.boxWidth > 0 && c.boxHeight > 0)
    const card = cards.find((c) => c.kind === 'carousel') || cards.find((c) => c.kind === 'row') || cards[0]
    if (!card) throw new FrameHeadshotError('MEASURE_FAILED', `no team card with a rendered image box on ${url}; pass --selector`)
    return { ratio: Math.round((card.boxWidth / card.boxHeight) * 10000) / 10000, boxWidth: card.boxWidth, boxHeight: card.boxHeight, name: card.name, selector: card.selector, kind: card.kind, viewport }
  } finally { await browser.close() }
}

// ---------- main ----------

export function planFrame(args) {
  for (const key of ['file', 'out']) if (!args[key] || args[key] === true) throw new FrameHeadshotError('MISSING_ARG', `--${key} is required`)
  const ratio = parseRatio(args.ratio)
  if (ratio === 'auto' && (!args.page || args.page === true)) throw new FrameHeadshotError('MISSING_ARG', '--ratio auto needs --page <canonical URL> (and optionally --selector)')
  const focus = parseFocus(args.focus)
  return { file: path.resolve(String(args.file)), out: path.resolve(String(args.out)), ratio, page: args.page && args.page !== true ? String(args.page) : null, selector: args.selector && args.selector !== true ? String(args.selector) : null, focus, preview: args.preview && args.preview !== true ? path.resolve(String(args.preview)) : null, json: args.json && args.json !== true ? path.resolve(String(args.json)) : null }
}

export async function main(argv = process.argv.slice(2), env = process.env, io = { log: console.log, error: console.error }) {
  const args = parseArgs(argv)
  const plan = planFrame(args)
  let measured = null
  let ratio = plan.ratio
  if (ratio === 'auto') {
    const chromium = loadChromium(args, env)
    measured = await measureCardRatio(chromium, plan.page, { selector: plan.selector })
    ratio = measured.ratio
    io.log(`measured ${measured.boxWidth}x${measured.boxHeight} css px (${ratio}:1) on ${plan.page} ${measured.selector || ''}${measured.name ? ` (${measured.name})` : ''}`)
  }
  const source = readImage(plan.file)
  const window = cropWindow({ width: source.width, height: source.height, ratio, focus: plan.focus })
  const framed = cropImage(source, window)
  const written = writeImage(framed, plan.out)
  let preview = null
  if (plan.preview) {
    const canvas = buildPreview(source, window, framed)
    fs.mkdirSync(path.dirname(plan.preview), { recursive: true })
    fs.writeFileSync(plan.preview, encodePng(canvas))
    preview = plan.preview
  }
  const report = {
    source: { file: plan.file, width: source.width, height: source.height, mimeType: source.mimeType, bytes: source.bytes, sha256: source.sha256 },
    ratio, ratioLabel: `${ratio}:1`, measured, focus: window.focus, axis: window.axis,
    crop: { x: window.x, y: window.y, width: window.width, height: window.height },
    out: { ...written, width: framed.width, height: framed.height },
    preview,
    reviewNote: `framed to ${ratio}:1${measured ? ` (card box ${Math.round(measured.boxWidth)}x${Math.round(measured.boxHeight)} css px on ${plan.page} at ${measured.viewport} ${VIEWPORTS[measured.viewport].width}px)` : ''}; crop ${window.width}x${window.height} at ${window.x},${window.y} of ${source.width}x${source.height}, focus ${window.axis === 'none' ? 'none' : window.focus}`,
  }
  if (plan.json) fs.writeFileSync(plan.json, JSON.stringify(report, null, 2) + '\n')
  io.log(`${window.axis === 'none' ? 'no crop needed' : `cropped ${window.axis}`}: ${source.width}x${source.height} -> ${framed.width}x${framed.height} (${ratio}:1), ${written.file}, sha256 ${written.sha256}${preview ? `, preview ${preview}` : ''}`)
  return report
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  main().then((report) => { console.log(JSON.stringify(report, null, 2)) }).catch((error) => {
    if (error instanceof FrameHeadshotError) { console.error(`${error.code}: ${error.message}`); process.exit(2) }
    if (error?.name === 'SectionShotError') { console.error(`${error.code}: ${error.message}`); process.exit(2) }
    console.error(error.stack || error.message)
    process.exit(3)
  })
}
