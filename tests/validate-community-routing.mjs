#!/usr/bin/env node
/**
 * Validate the committed Alpha Community routing contract and identity crosswalk.
 * Offline by default. --live-map adds a read-only comparison with the public map.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const spec = readJson('spec/community-routing.json')
const identities = readJson('registry/campus-identities.json')
const snapshot = readJson('spec/inventory/campus-community-routing-2026-09-16.json')
const sources = readJson('registry/sources.json')
const errors = []
const check = (condition, message) => { if (!condition) errors.push(message) }

check(spec.identityJoin?.key === 'hubspotProgramId', 'identity join key must be hubspotProgramId')
check(spec.identityJoin?.onFailure === 'fail-closed', 'identity resolution must fail closed')
check(spec.urlContract?.requiredCampusParameter === 'campus', 'current campus parameter must be campus')
check(spec.urlContract?.canonicalTemplate === 'https://www.community.alpha.school/?campus={communitySlug}', 'canonical URL template changed')
check(spec.lifecycleMapping?.['Pre-Announcement'] === 'pre-announcement', 'Pre-Announcement lifecycle mapping is wrong')
check(spec.lifecycleMapping?.Announced === 'announcement', 'Announced lifecycle mapping is wrong')
check(spec.lifecycleMapping?.Open === 'opened', 'Open lifecycle mapping is wrong')
check(identities.complete === false, 'identity registry must remain explicitly partial until every campus is verified')
check(identities.joinKey === spec.identityJoin.key, 'spec and registry identity keys disagree')
check(Boolean(sources.communityApp), 'registry/sources.json must declare the Community app source')

const seenHubSpot = new Set()
const seenCommunityId = new Set()
const seenSlug = new Set()
for (const [campus, row] of Object.entries(identities.campuses || {})) {
  const expectedMapId = `program-${row.hubspotProgramId}`
  const expectedCommunityId = `prog-${row.hubspotProgramId}`
  const expectedUrl = spec.urlContract.canonicalTemplate.replace('{communitySlug}', row.communitySlug)
  check(row.mapProgramId === expectedMapId, `${campus}: mapProgramId does not match hubspotProgramId`)
  check(row.communityProgramId === expectedCommunityId, `${campus}: communityProgramId does not match hubspotProgramId`)
  check(row.canonicalCommunityUrl === expectedUrl, `${campus}: canonical Community URL is wrong`)
  check(row.visibleInCommunityApp === true, `${campus}: mapping is not visible in the Community app`)
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.communitySlug || ''), `${campus}: invalid Community slug`)
  check(!seenHubSpot.has(row.hubspotProgramId), `${campus}: duplicate HubSpot program id`)
  check(!seenCommunityId.has(row.communityProgramId), `${campus}: duplicate Community program id`)
  check(!seenSlug.has(row.communitySlug), `${campus}: duplicate Community slug`)
  seenHubSpot.add(row.hubspotProgramId)
  seenCommunityId.add(row.communityProgramId)
  seenSlug.add(row.communitySlug)
}

const lifecycleTotal = Object.values(snapshot.growthMap?.lifecycleCounts || {}).reduce((sum, value) => sum + value, 0)
check(lifecycleTotal === snapshot.growthMap?.programCount, 'inventory lifecycle counts do not equal program count')
check(snapshot.growthMap?.preAnnouncementMissingBothUrlAndCommunityUrl?.count === snapshot.growthMap?.preAnnouncementMissingBothUrlAndCommunityUrl?.campuses?.length, 'inventory missing-destination count does not match its campus list')
check(snapshot.verifiedCommunityCrosswalks?.count === Object.keys(identities.campuses || {}).length, 'inventory crosswalk count does not match the identity registry')

if (process.argv.includes('--live-map')) {
  const mapUrl = sources.growthMapApi?.url
  check(Boolean(mapUrl), 'growth map API URL is missing from registry/sources.json')
  if (mapUrl) {
    const response = await fetch(mapUrl)
    check(response.ok, `growth map API returned ${response.status}`)
    if (response.ok) {
      const payload = await response.json()
      const rows = Array.isArray(payload) ? payload : payload.locations || payload.programs || payload.data || []
      for (const [campus, identity] of Object.entries(identities.campuses || {})) {
        const row = rows.find((candidate) => String(candidate.id) === identity.mapProgramId || String(candidate.id) === identity.hubspotProgramId)
        check(Boolean(row), `${campus}: verified map program is missing from the live map`)
        if (row) {
          check(String(row.programType) === 'Pre-Announcement', `${campus}: live lifecycle changed from Pre-Announcement`)
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`Community routing validation failed (${errors.length})`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Community routing validation passed (${Object.keys(identities.campuses || {}).length} verified mappings${process.argv.includes('--live-map') ? ', live map compared' : ''})`)
