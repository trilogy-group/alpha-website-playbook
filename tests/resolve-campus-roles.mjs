#!/usr/bin/env node
// Resolve campus roles (Director of Admissions, Dean of Parents, Senior Admissions
// Specialist) live from their source of truth and write a dated snapshot.
//
// Sources, in order:
//   1. Admissions Hub org chart (alpha-admissions-hub.vercel.app/admissions-hub.html):
//      currentDoARows, expansionRows, marketingRows, admissionsRows. The hub's "Approved Campus
//      Assignment Updates" come from a private Google Sheet fetched at page load and are not
//      readable here; corrections Hailey confirms go into the overrides file instead.
//   2. APEX mirror overrides (registry/campus-roles-overrides.json): rows Hailey confirmed
//      directly that are ahead of the chart. Never revert them to the chart's blanks.
//   3. HubSpot owners (GET /crm/v3/owners) for email addresses, when a token is set
//      (HUBSPOT_SERVICE_KEY or HUBSPOT_PRIVATE_APP_TOKEN). Emails are never derived from names.
//
// Usage: node tests/resolve-campus-roles.mjs [--campus atlanta] [--role dean-of-parents] [--write]
//   default prints the resolved roster; --write refreshes registry/campus-roles-snapshot.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HUB_URL = 'https://alpha-admissions-hub.vercel.app/admissions-hub.html';
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const write = args.includes('--write');
const wantCampus = flag('--campus');
const wantRole = flag('--role');

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function parseRows(html, constName) {
  const start = html.search(new RegExp(`const\\s+${constName}\\s*=\\s*\\[`));
  if (start < 0) return null;
  const rows = [];
  for (const line of html.slice(start).split('\n').slice(1)) {
    if (/^\s*\]/.test(line)) break;
    const cells = [...line.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function campusSlug(school) {
  let s = norm(school).replace(/^alpha\s+/, '');
  const aliases = { 'south bay': 'south-bay-la', 'south bay la': 'south-bay-la', 'lexington': 'boston-suburbs', 'jamaica plain': 'jamaica-plain', 'oklahoma city': 'oklahoma-city' };
  if (aliases[s]) return aliases[s];
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function fetchHub() {
  const res = await fetch(HUB_URL);
  if (!res.ok) throw new Error(`Admissions Hub ${res.status}`);
  return res.text();
}

async function fetchOwners(token) {
  const out = [];
  let after = null;
  while (true) {
    const url = new URL('https://api.hubapi.com/crm/v3/owners');
    url.searchParams.set('limit', '500');
    if (after) url.searchParams.set('after', after);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HubSpot owners ${res.status}`);
    const d = await res.json();
    out.push(...(d.results || []));
    after = d.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

function emailIndex(owners, aliases) {
  const byName = new Map();
  for (const o of owners) {
    const name = norm(`${o.firstName || ''} ${o.lastName || ''}`);
    if (!name.trim() || !o.email) continue;
    // prefer work domains over personal ones when a person has several owner records
    const rank = (e) => (/@(alpha\.school|2hourlearning\.com|superbuilders\.school)$/i.test(e) ? 0 : 1);
    const cur = byName.get(name);
    if (!cur || rank(o.email) < rank(cur.email)) byName.set(name, { email: o.email, ownerId: String(o.id) });
  }
  for (const [k, v] of Object.entries(aliases || {})) byName.set(norm(k), { email: v, ownerId: null, source: 'override' });
  return byName;
}

const html = await fetchHub();
const overrides = JSON.parse(readFileSync(join(root, 'registry/campus-roles-overrides.json'), 'utf8'));
const doaRows = parseRows(html, 'currentDoARows') || [];
const approved = parseRows(html, 'approvedAssignmentRows') || [];
const expansion = parseRows(html, 'expansionRows') || [];
const marketing = parseRows(html, 'marketingRows') || [];
const admissions = parseRows(html, 'admissionsRows') || [];
if (!doaRows.length) throw new Error('currentDoARows not found in the Admissions Hub page; the page layout changed');

const token = process.env.HUBSPOT_SERVICE_KEY || process.env.HUBSPOT_PRIVATE_APP_TOKEN || '';
let owners = [];
let ownersError = null;
if (token) { try { owners = await fetchOwners(token); } catch (e) { ownersError = e.message; } }
if (!owners.length) {
  // No HubSpot token: reuse the addresses the last --write run resolved, so a lookup still answers.
  try {
    const snap = JSON.parse(readFileSync(join(root, 'registry/campus-roles-snapshot.json'), 'utf8'));
    const seen = [];
    const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.name && v.email) seen.push(v); Object.values(v).forEach(walk); } };
    walk(snap);
    owners = seen.map((p) => ({ id: p.hubspotOwnerId, firstName: p.name, lastName: '', email: p.email }));
    ownersError = `snapshot ${snap.asOf}`;
  } catch { /* no snapshot yet */ }
}
const emails = emailIndex(owners, overrides.emailAliases);
if (process.env.DEBUG_NAME) console.error('lookup', process.env.DEBUG_NAME, emails.get(norm(process.env.DEBUG_NAME)), owners.filter((o) => norm(`${o.firstName} ${o.lastName}`).includes(norm(process.env.DEBUG_NAME))).map((o) => [o.id, o.firstName, o.lastName, o.email, o.archived]));

const campuses = {};
for (const [school, doa, dop] of doaRows) {
  const slug = campusSlug(school);
  campuses[slug] = { school, 'director-of-admissions': person(doa, 'admissions-hub'), 'dean-of-parents': person(dop, 'admissions-hub') };
}
for (const [school, role, name, asOf, note] of overrides.rows || []) {
  const slug = campusSlug(school);
  campuses[slug] ??= { school };
  campuses[slug][role] = person(name, `override (${note || 'confirmed'}, ${asOf})`);
}
for (const [campus, request, role, name, effective] of approved) {
  const slug = campusSlug(campus);
  campuses[slug] ??= { school: campus };
  campuses[slug].pendingUpdates ??= [];
  campuses[slug].pendingUpdates.push({ request, role, name, effective });
}
for (const [name, title, markets] of expansion) {
  if (!/Admissions Specialist/i.test(title)) continue;
  for (const m of String(markets).split(',')) {
    const slug = campusSlug(m);
    if (!campuses[slug]) continue;
    (campuses[slug]['senior-admissions-specialist-coverage'] ??= []).push(person(name, 'admissions-hub expansion table (coverage, not assignment)'));
  }
}

function person(name, source) {
  if (!name) return null;
  const hit = emails.get(norm(name));
  return { name, email: hit?.email || null, hubspotOwnerId: hit?.ownerId || null, source };
}

const snapshot = {
  $comment: 'Generated by tests/resolve-campus-roles.mjs. Do not edit by hand; re-run with --write. Source of truth for campus roles is the Admissions Hub org chart; overrides in registry/campus-roles-overrides.json; emails from HubSpot owners.',
  asOf: new Date().toISOString().slice(0, 10),
  sources: { admissionsHub: HUB_URL, overrides: 'registry/campus-roles-overrides.json', emails: token && !ownersError ? `HubSpot owners (${owners.length} records)` : `not resolved live${ownersError ? `: ${ownersError}` : ' (no HubSpot token in env)'}` },
  central: { admissions: admissions.map(([name, title]) => ({ ...person(name, 'admissions-hub'), title })), marketing: marketing.map(([name, title]) => ({ ...person(name, 'admissions-hub'), title })), expansion: expansion.map(([name, title, markets]) => ({ ...person(name, 'admissions-hub'), title, markets })) },
  campuses,
};

if (write) {
  writeFileSync(join(root, 'registry/campus-roles-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`wrote registry/campus-roles-snapshot.json (${Object.keys(campuses).length} campuses, emails: ${snapshot.sources.emails})`);
} else if (wantCampus) {
  const c = campuses[wantCampus];
  if (!c) { console.error(`unknown campus ${wantCampus}; known: ${Object.keys(campuses).join(', ')}`); process.exit(2); }
  console.log(JSON.stringify(wantRole ? { campus: wantCampus, role: wantRole, holder: c[wantRole] ?? null } : c, null, 2));
} else {
  for (const [slug, c] of Object.entries(campuses)) {
    const f = (p) => (p ? `${p.name}${p.email ? ` <${p.email}>` : ''}` : '(vacant)');
    console.log(`${slug.padEnd(20)} DoA: ${f(c['director-of-admissions']).padEnd(48)} DoP: ${f(c['dean-of-parents'])}`);
  }
  console.log(`\nemails: ${snapshot.sources.emails}`);
}
