/**
 * Visual brand check: the pure evaluation behind the `brand-visual` row in tests/page-check.mjs, and the in-browser
 * measurement that feeds it. Values come from spec/brand-visual.json (the official Alpha School Brand Guidelines as the
 * alpha-brand-guide skill states them, 2026-09-22); word-level copy rules are MacKenzie's and are not checked here.
 *
 * What it reports, per finding with selector, value, and rule:
 *   font        a visible element with its own text whose computed font-family does not start with Montserrat. Icon
 *               fonts are skipped; an allowlist entry (HubSpot embeds, the events plugin cards, chat and consent
 *               widgets) turns the finding into an INFO "allowed" line with the entry's reason, once per family and
 *               container, so the report says what was allowed without repeating per card.
 *   contrast    a text element whose computed colour and effective solid background match a "never" row of the
 *               contrast table (#00BCFF on white or near-white, white on #00BCFF, #110068 on #0D4AD1), or a
 *               "large-only" row (white on #418BE9) at body size. The effective background is the nearest ancestor
 *               with an opaque background-color; an ancestor with a background-image (photo, gradient) ends the walk
 *               and the element is skipped, because the maths does not know what the photo looks like.
 *   background  a large solid field (>= 300x120 css px) whose background-color is not in the palette or tints,
 *               reported once per colour with a count. INFO on the first version (campus photos, tinted sections and
 *               third-party embeds are legitimate); severity is spec-configurable.
 *   headline    an H1-H3 whose colour is not in the palette or tints, once per colour. INFO.
 *   logo        every logo image on the page: file name, fetched sha256, and whether it matches a canonical asset in
 *               playbook/brand/assets by name or hash, or a known live file. INFO.
 *
 * Severity per kind and the enforcement mode are in spec.check. advisory (the first version) means fail-severity
 * findings make the row `warn` (listed, exit code untouched); enforced makes them `fail`.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const SPEC_PATH = path.join(here, '..', 'spec', 'brand-visual.json')
export const CHECK_ID = 'brand-visual'
export const VIEWPORT = { width: 1440, height: 1000 }

export class BrandVisualError extends Error {
  /** @param {'SPEC_INVALID'|'SPEC_MISSING'} code */
  constructor(code, message) { super(message); this.name = 'BrandVisualError'; this.code = code }
}

/** Read and sanity-check the spec; a malformed file is a typed error, never a silently empty rule set. */
export function loadBrandVisual(specPath = SPEC_PATH) {
  if (!fs.existsSync(specPath)) throw new BrandVisualError('SPEC_MISSING', `brand spec missing: ${specPath}`)
  let spec
  try { spec = JSON.parse(fs.readFileSync(specPath, 'utf8')) } catch (e) { throw new BrandVisualError('SPEC_INVALID', `brand spec is not JSON: ${e.message}`) }
  const problems = []
  for (const key of ['palette', 'tints', 'contrast', 'typography', 'logo', 'check']) if (!spec[key]) problems.push(`missing ${key}`)
  for (const entry of [...(spec.palette || []), ...(spec.tints || [])]) if (!/^#[0-9A-F]{6}$/.test(entry.hex || '')) problems.push(`bad hex ${entry.hex} (${entry.id})`)
  for (const row of spec.contrast?.table || []) {
    if (!/^#[0-9A-F]{6}$/.test(row.foreground || '') || !/^#[0-9A-F]{6}$/.test(row.background || '')) problems.push(`bad contrast row ${row.foreground} on ${row.background}`)
    if (!['any', 'large-only', 'never'].includes(row.verdict)) problems.push(`bad verdict ${row.verdict} for ${row.foreground} on ${row.background}`)
  }
  if (spec.typography?.family !== 'Montserrat') problems.push('typography.family must be Montserrat')
  for (const [kind, severity] of Object.entries(spec.check?.severities || {})) if (!['fail', 'warn', 'info'].includes(severity)) problems.push(`bad severity ${severity} for ${kind}`)
  if (!['advisory', 'enforced'].includes(spec.check?.enforcement?.mode)) problems.push(`bad enforcement mode ${spec.check?.enforcement?.mode}`)
  if (problems.length) throw new BrandVisualError('SPEC_INVALID', `brand spec invalid: ${problems.join('; ')}`)
  return spec
}

/** "#0D4AD1", "rgb(13, 74, 209)", "rgba(13,74,209,1)" -> { r, g, b, a } or null when it is not a colour. */
export function parseColor(value) {
  const v = String(value || '').trim()
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 }
  m = v.match(/^#([0-9a-f]{3})$/i)
  if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 }
  m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) }
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  return null
}

/** { r, g, b } -> "#RRGGBB" (upper case, the spec's spelling). */
export function toHex(color) {
  if (!color) return null
  return '#' + [color.r, color.g, color.b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Any colour string -> "#RRGGBB" or null. */
export function normalizeHex(value) { return toHex(parseColor(value)) }

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance(color) {
  const c = typeof color === 'string' ? parseColor(color) : color
  if (!c) return null
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

/** WCAG 2 contrast ratio between two colours, rounded to one decimal (17.2, 2.2). */
export function contrastRatio(foreground, background) {
  const lf = relativeLuminance(foreground), lb = relativeLuminance(background)
  if (lf === null || lb === null) return null
  const [hi, lo] = lf >= lb ? [lf, lb] : [lb, lf]
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10
}

/** The palette plus tints as a Set of upper-case hex. */
export function paletteSet(spec) {
  return new Set([...(spec.palette || []), ...(spec.tints || [])].map((p) => p.hex.toUpperCase()))
}

/** A background counts as white when its contrast against #FFFFFF is within the spec's near-white tolerance. */
export function isNearWhite(hex, spec) {
  const ratio = contrastRatio(hex, '#FFFFFF')
  return ratio !== null && ratio <= (spec.contrast?.nearWhite?.maxContrastToWhite ?? 1.25)
}

/** WCAG large text: >= minPx, or >= minPxBold at boldWeight or heavier. */
export function isLargeText(fontSizePx, fontWeight, spec) {
  const large = spec.contrast?.largeText || { minPx: 24, minPxBold: 18.66, boldWeight: 700 }
  const size = Number(fontSizePx), weight = Number(fontWeight)
  if (!Number.isFinite(size)) return false
  return size >= large.minPx || (size >= large.minPxBold && Number.isFinite(weight) && weight >= large.boldWeight)
}

/** The first family in a computed font-family list, unquoted: '"Montserrat", sans-serif' -> 'Montserrat'. */
export function primaryFamily(fontFamily) {
  return String(fontFamily || '').split(',')[0].trim().replace(/^["']|["']$/g, '')
}

/**
 * Font verdict for one measured text element: { verdict: 'ok' | 'icon' | 'allowed' | 'off-brand', family, entry }.
 * `allowlistIds` is the list of allowlist entry ids whose selector matched the element or an ancestor (matched in the
 * browser; this function only reads the result).
 */
export function fontVerdict(fontFamily, { allowlistIds = [] } = {}, spec) {
  const family = primaryFamily(fontFamily)
  const brand = spec.typography?.family || 'Montserrat'
  if (family.toLowerCase().startsWith(brand.toLowerCase())) return { verdict: 'ok', family }
  const icons = (spec.check?.font?.iconFamilies || []).map((f) => f.toLowerCase())
  if (icons.some((f) => family.toLowerCase().includes(f))) return { verdict: 'icon', family }
  const entry = (spec.check?.font?.allowlist || []).find((e) => allowlistIds.includes(e.id))
  if (entry) return { verdict: 'allowed', family, entry }
  return { verdict: 'off-brand', family }
}

/**
 * Contrast verdict for one text element against its effective solid background:
 * { verdict: 'ok' | 'never' | 'large-only-at-body-size' | 'unknown-background', ratio, row }.
 * A "never" row matches on exact hex; a white background in a row also matches a near-white page ground.
 */
export function contrastVerdict({ color, background, fontSizePx, fontWeight }, spec) {
  const fg = normalizeHex(color), bg = normalizeHex(background)
  if (!fg || !bg) return { verdict: 'unknown-background', ratio: null, row: null }
  const ratio = contrastRatio(fg, bg)
  const bgMatches = (rowBg) => rowBg === bg || (rowBg === '#FFFFFF' && isNearWhite(bg, spec))
  const row = (spec.contrast?.table || []).find((r) => r.foreground.toUpperCase() === fg && bgMatches(r.background.toUpperCase()))
  if (!row) return { verdict: 'ok', ratio, row: null }
  if (row.verdict === 'never') return { verdict: 'never', ratio, row }
  if (row.verdict === 'large-only' && !isLargeText(fontSizePx, fontWeight, spec)) return { verdict: 'large-only-at-body-size', ratio, row }
  return { verdict: 'ok', ratio, row }
}

/** Is a colour in the palette or tints? Alpha < 1 and non-colours are "not solid" rather than off-palette. */
export function backgroundVerdict(backgroundColor, spec) {
  const c = parseColor(backgroundColor)
  if (!c || c.a < 1) return { verdict: 'not-solid', hex: null }
  const hex = toHex(c)
  return { verdict: paletteSet(spec).has(hex) ? 'in-palette' : 'off-palette', hex }
}

/** sha256 of a Buffer, hex. */
export function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex') }

/**
 * Logo verdict for one image: matches a canonical asset by name or hash, a known live file by name or hash, or nothing.
 * { verdict: 'canonical' | 'known-live' | 'unknown', file, matchedBy, asset }
 */
export function logoVerdict({ src, sha256: hash = null }, spec) {
  const file = String(src || '').split('?')[0].split('#')[0].split('/').pop() || ''
  const assets = spec.logo?.assets || []
  const byHash = hash ? assets.find((a) => a.sha256 === hash) : null
  if (byHash) return { verdict: 'canonical', file, matchedBy: 'hash', asset: byHash }
  const byName = assets.find((a) => a.file.toLowerCase() === file.toLowerCase())
  if (byName) return { verdict: 'canonical', file, matchedBy: hash ? 'name (hash differs)' : 'name', asset: byName }
  const known = spec.logo?.knownLiveFiles || []
  const knownByHash = hash ? known.find((k) => k.sha256 === hash) : null
  if (knownByHash) return { verdict: 'known-live', file, matchedBy: 'hash', asset: knownByHash }
  const knownByName = known.find((k) => k.file.toLowerCase() === file.toLowerCase())
  if (knownByName) return { verdict: 'known-live', file, matchedBy: hash ? 'name (hash differs)' : 'name', asset: knownByName }
  return { verdict: 'unknown', file, matchedBy: null, asset: null }
}

/**
 * Runs inside the page (page.evaluate). Walks every visible element that owns a text node and records its computed
 * font-family, colour, size, weight, the effective solid background (nearest opaque ancestor background-color; a
 * background-image on the way means "image"), which allowlist entries match, and a selector a reviewer can find.
 * Also collects large solid fields, headline colours, and logo images. No verdicts here: the maths stays in Node.
 */
export function measureBrandVisualInPage(config) {
  const { allowlist = [], background = {}, logoSelector = '' } = config
  const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH', 'IFRAME', 'IMG', 'VIDEO', 'BR', 'LINK', 'META', 'HEAD', 'TITLE'])
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim()
  const describe = (el) => {
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const cls = [...el.classList].filter((c) => !/^elementor-element-[a-z0-9]+$/.test(c)).slice(0, 3).map((c) => `.${c}`).join('')
    const widget = el.closest('.elementor-widget')
    const wid = widget ? (widget.id ? `#${widget.id}` : `.${(widget.className.match(/elementor-element-[a-z0-9]+/) || ['elementor-widget'])[0]}`) : null
    return `${tag}${id}${cls}${wid && !(widget === el) ? ` in ${wid}` : ''}`
  }
  const container = (el) => {
    const widget = el.closest('.elementor-widget, [class*="ahse-event"], form, header, footer')
    return widget ? (widget.id ? `#${widget.id}` : `.${(widget.className.match(/elementor-element-[a-z0-9]+|ahse-event[a-z-]*/) || [widget.tagName.toLowerCase()])[0]}`) : 'body'
  }
  const region = (el) => (el.closest('.elementor-location-header, header') ? 'header' : (el.closest('.elementor-location-footer, footer') ? 'footer' : 'main'))
  const parse = (c) => { const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null }
  const hex = (c) => { const p = parse(c); return p ? '#' + [p.r, p.g, p.b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase() : null }
  const effectiveBackground = (el) => {
    let node = el
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node)
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { kind: 'image', value: cs.backgroundImage.slice(0, 60) }
      const p = parse(cs.backgroundColor)
      if (p && p.a >= 1) return { kind: 'solid', value: hex(cs.backgroundColor) }
      if (p && p.a > 0) return { kind: 'translucent', value: cs.backgroundColor }
      node = node.parentElement
    }
    const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor)
    return { kind: 'solid', value: rootBg && rootBg.a >= 1 ? hex(getComputedStyle(document.documentElement).backgroundColor) : '#FFFFFF' }
  }
  const matchedAllowlist = (el) => allowlist.filter((entry) => { try { return Boolean(el.closest(entry.selector)) } catch { return false } }).map((e) => e.id)
  const text = []
  for (const el of document.querySelectorAll('body *')) {
    if (skipTags.has(el.tagName)) continue
    if (!el.childNodes || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const bg = effectiveBackground(el)
    text.push({
      selector: describe(el), container: container(el), region: region(el), sample: clean(el.textContent).slice(0, 60),
      fontFamily: cs.fontFamily, fontSizePx: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight) || cs.fontWeight,
      color: hex(cs.color), colorAlpha: parse(cs.color)?.a ?? 1, background: bg.kind === 'solid' ? bg.value : null, backgroundKind: bg.kind,
      allowlistIds: matchedAllowlist(el), isHeadline: /^H[1-3]$/.test(el.tagName) || Boolean(el.closest('h1, h2, h3')),
    })
  }
  const fields = []
  const minW = background.minWidthPx || 300, minH = background.minHeightPx || 120
  for (const el of document.querySelectorAll('body *')) {
    if (skipTags.has(el.tagName)) continue
    const r = el.getBoundingClientRect()
    if (r.width < minW || r.height < minH) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (cs.backgroundImage && cs.backgroundImage !== 'none') continue
    const p = parse(cs.backgroundColor)
    if (!p || p.a < 1) continue
    fields.push({ selector: describe(el), region: region(el), backgroundColor: hex(cs.backgroundColor), width: Math.round(r.width), height: Math.round(r.height) })
  }
  const logos = []
  if (logoSelector) {
    const seen = new Set()
    let matches = []
    try { matches = [...document.querySelectorAll(logoSelector)] } catch { matches = [] }
    for (const img of matches) {
      if (seen.has(img)) continue
      seen.add(img)
      const r = img.getBoundingClientRect()
      const cs = getComputedStyle(img)
      logos.push({ selector: describe(img), region: region(img), src: (img.currentSrc || img.src || '').slice(0, 300), alt: (img.alt || '').slice(0, 80), width: Math.round(r.width), height: Math.round(r.height), visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' })
    }
  }
  return { text, fields, logos }
}

/**
 * Measure one page in a real browser on the desktop viewport. `chromium` is the Playwright export borrowed the way
 * section-shot.mjs borrows it. Logo bytes are fetched from Node (read-only, visitor UA) so the hash is of the file the
 * page serves. Returns { url, viewport, error?, text, fields, logos }.
 */
export async function measureBrandVisual(chromium, url, spec, { userAgent = 'alpha-website-playbook page-check (read-only)', browser: existing = null, fetchImpl = fetch } = {}) {
  const viewport = spec.check?.viewports?.desktop || VIEWPORT
  const browser = existing || await chromium.launch()
  const out = { url, viewport, text: [], fields: [], logos: [] }
  try {
    const context = await browser.newContext({ viewport, userAgent })
    const page = await context.newPage()
    try {
      await page.goto(url + (url.includes('?') ? '&' : '?') + 'nocache=' + Date.now(), { waitUntil: 'load', timeout: 90_000 })
      await page.waitForTimeout(1200)
      const measured = await page.evaluate(measureBrandVisualInPage, { allowlist: spec.check?.font?.allowlist || [], background: spec.check?.background || {}, logoSelector: spec.check?.logo?.selector || '' })
      Object.assign(out, measured)
    } catch (error) {
      out.error = error.message.split('\n')[0]
    } finally {
      await context.close()
    }
  } finally {
    if (!existing) await browser.close()
  }
  const hashes = new Map()
  for (const logo of out.logos) {
    if (!logo.src || hashes.has(logo.src)) { logo.sha256 = hashes.get(logo.src) || null; continue }
    try {
      const res = await fetchImpl(logo.src, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(15_000) })
      logo.sha256 = res.ok ? sha256(Buffer.from(await res.arrayBuffer())) : null
    } catch { logo.sha256 = null }
    hashes.set(logo.src, logo.sha256)
  }
  return out
}

/**
 * Turn a measurement into findings: [{ kind, severity, selector, value, rule, detail }]. Pure; the browser output is
 * plain data, and the tests feed it synthetic rows.
 */
export function evaluateBrandVisual(measured, spec) {
  const sev = spec.check?.severities || {}
  const findings = []
  const palette = paletteSet(spec)
  // fonts: off-brand once per family and container; allowed once per family and allowlist entry.
  const offBrand = new Map(), allowed = new Map()
  for (const t of measured.text || []) {
    const v = fontVerdict(t.fontFamily, { allowlistIds: t.allowlistIds || [] }, spec)
    if (v.verdict === 'ok' || v.verdict === 'icon') continue
    if (v.verdict === 'allowed') {
      const key = `${v.family}|${v.entry.id}`
      const row = allowed.get(key) || { kind: 'font', severity: 'info', selector: t.selector, value: v.family, rule: 'typography.family Montserrat (allowed: ' + v.entry.id + ')', detail: '', count: 0, sample: t.sample, entry: v.entry }
      row.count++
      allowed.set(key, row)
      continue
    }
    const key = `${v.family}|${t.container}`
    const row = offBrand.get(key) || { kind: 'font', severity: sev.font || 'fail', selector: t.selector, value: v.family, rule: 'typography.family Montserrat, and only Montserrat', detail: '', count: 0, sample: t.sample, container: t.container, region: t.region }
    row.count++
    offBrand.set(key, row)
  }
  for (const row of offBrand.values()) findings.push({ ...row, detail: `${row.count} element${row.count === 1 ? '' : 's'} in ${row.container} (${row.region}) render in ${row.value}; first: "${row.sample}"` })
  for (const row of allowed.values()) findings.push({ ...row, reason: row.entry.reason, detail: `${row.count} element${row.count === 1 ? '' : 's'} in ${row.value} allowed by ${row.entry.id}${row.entry.thirdParty ? ' (third-party)' : ' (in-house, plugin owner fix, not a page edit)'}` })
  // contrast: never rows and large-only rows at body size.
  for (const t of measured.text || []) {
    if (t.backgroundKind !== 'solid' || !t.background || (t.colorAlpha ?? 1) < 1) continue
    const v = contrastVerdict({ color: t.color, background: t.background, fontSizePx: t.fontSizePx, fontWeight: t.fontWeight }, spec)
    if (v.verdict === 'ok' || v.verdict === 'unknown-background') continue
    findings.push({ kind: 'contrast', severity: sev.contrast || 'fail', selector: t.selector, value: `${t.color} on ${t.background} (${v.ratio}:1, ${Math.round(t.fontSizePx)}px/${t.fontWeight})`, rule: `contrast.table ${v.row.foreground} on ${v.row.background}: ${v.row.verdict}${v.row.note ? ' (' + v.row.note + ')' : ''}`, detail: v.verdict === 'never' ? `never: "${t.sample}"` : `large-only at body size: "${t.sample}"` })
  }
  // backgrounds: off-palette solid fields once per colour.
  const offPalette = new Map()
  for (const f of measured.fields || []) {
    const v = backgroundVerdict(f.backgroundColor, spec)
    if (v.verdict !== 'off-palette') continue
    const row = offPalette.get(v.hex) || { kind: 'background', severity: sev.background || 'info', selector: f.selector, value: v.hex, rule: 'palette: backgrounds, headlines and large fields come from the four blues, white, black, or the two tints', count: 0, region: f.region, size: `${f.width}x${f.height}` }
    row.count++
    offPalette.set(v.hex, row)
  }
  for (const row of offPalette.values()) findings.push({ ...row, detail: `${row.count} large field${row.count === 1 ? '' : 's'} in ${row.value}; first ${row.selector} (${row.region}, ${row.size} css px)` })
  // headlines: off-palette H1-H3 colours once per colour.
  const offHeadline = new Map()
  for (const t of measured.text || []) {
    if (!t.isHeadline || !t.color || palette.has(t.color)) continue
    const row = offHeadline.get(t.color) || { kind: 'headline', severity: sev.headline || 'info', selector: t.selector, value: t.color, rule: 'palette: headline colour from the palette (navy on white, white on navy, sky kicker on navy)', count: 0, sample: t.sample }
    row.count++
    offHeadline.set(t.color, row)
  }
  for (const row of offHeadline.values()) findings.push({ ...row, detail: `${row.count} headline${row.count === 1 ? '' : 's'} in ${row.value}; first: "${row.sample}"` })
  // logos: every logo image, classified.
  const seenLogo = new Set()
  for (const l of measured.logos || []) {
    const v = logoVerdict({ src: l.src, sha256: l.sha256 }, spec)
    const key = `${v.file}|${l.region}`
    if (seenLogo.has(key)) continue
    seenLogo.add(key)
    const minW = spec.logo?.minWidthPx || 72
    const small = l.visible && l.width > 0 && l.width < minW ? `; rendered ${l.width}px wide, below the ${minW}px minimum` : ''
    findings.push({ kind: 'logo', severity: sev.logo || 'info', selector: l.selector, value: `${v.file}${l.sha256 ? ' sha256 ' + l.sha256.slice(0, 12) : ' (not fetched)'}`, rule: 'logo: one of the three unmodified colourway files in playbook/brand/assets', detail: (v.verdict === 'canonical' ? `canonical ${v.asset.colourway} ${v.asset.format}, matched by ${v.matchedBy}` : (v.verdict === 'known-live' ? `known live file matched by ${v.matchedBy} (${v.asset.lockup} lockup, ${v.asset.colourway}): ${v.asset.status}` : 'not a canonical asset and not a known live file')) + `; ${l.region}${l.visible ? '' : ', hidden'}, ${l.width}x${l.height} css px${small}` })
  }
  return findings
}

/** The page-check row: result from the fail-severity findings and the enforcement mode; every finding listed. */
export function brandVisualCheck(measured, spec) {
  if (measured.error) return { id: CHECK_ID, result: 'fail', detail: `browser measurement failed: ${measured.error}`, findings: [] }
  const findings = evaluateBrandVisual(measured, spec)
  const fails = findings.filter((f) => f.severity === 'fail')
  const warns = findings.filter((f) => f.severity === 'warn')
  const infos = findings.filter((f) => f.severity === 'info')
  const mode = spec.check?.enforcement?.mode || 'advisory'
  const result = fails.length ? (mode === 'enforced' ? 'fail' : 'warn') : (warns.length ? 'warn' : 'pass')
  const line = (f) => `${f.kind} ${f.selector}: ${f.value} [${f.rule}] ${f.detail}`
  const parts = []
  if (fails.length) parts.push(`${fails.length} FAIL-severity finding${fails.length === 1 ? '' : 's'}${mode === 'advisory' ? ' (advisory mode: listed, not blocking ring 2 until spec check.enforcement.mode is enforced)' : ''}: ` + fails.map(line).join('; '))
  if (warns.length) parts.push(`${warns.length} WARN: ` + warns.map(line).join('; '))
  if (infos.length) parts.push(`${infos.length} INFO: ` + infos.map(line).join('; '))
  const counted = `${(measured.text || []).length} text elements, ${(measured.fields || []).length} large fields, ${(measured.logos || []).length} logo images measured at ${measured.viewport?.width || VIEWPORT.width}x${measured.viewport?.height || VIEWPORT.height}`
  return { id: CHECK_ID, result, mode, detail: parts.length ? `${counted}. ${parts.join('. ')}` : `${counted}: Montserrat throughout, no never-row contrast pairs, backgrounds and headlines in the palette`, findings }
}
