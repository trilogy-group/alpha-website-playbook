import crypto from 'node:crypto'
import { operatorPool, assignOperatorPool, OPERATOR_ROLE } from './operator-pool.mjs'
import { renderTemplate } from './ticket-templates.mjs'

const INTAKE_OWNED_FIELDS = new Set(['intakeHash', 'intakePendingHash', 'intakeVersion', 'intakeDecision', 'ownerRole', 'intakeReviewUrl'])
export const UNRESOLVED_OWNER_ROLE = 'internal-triage'

/**
 * Merge intake-owned custom fields into a ticket's existing custom fields. Every field intake writes
 * must be in INTAKE_OWNED_FIELDS; anything else (checkId, source, requestFamily, observer ids) is
 * preserved untouched. Cause: 2026-09-17, intake overwrote customFields.checkId SITE-31323DE752
 * with the ticket class and broke the link back to the observer check.
 */
export function intakeCustomFieldsPatch(existing, fields) {
  const foreign = Object.keys(fields || {}).filter((key) => !INTAKE_OWNED_FIELDS.has(key))
  if (foreign.length) throw new Error(`intake may only write its own custom fields; refused: ${foreign.join(', ')}`)
  return { ...(existing || {}), ...fields }
}

/**
 * Assignee patch that adds the resolved owner without removing anyone already assigned.
 * Returns {} when there is nothing to add. Cause: 2026-09-17, applying intake replaced the assignee
 * list on Houston cmu4g7ozk00000agmwlkwsdsf and dropped Farhan Raja and Yash Chitneni.
 */
export function assigneePatch(existingAssignees, ownerUserId) {
  const owners = [].concat(ownerUserId || []).filter(Boolean)
  if (!owners.length) return {}
  const existing = (existingAssignees || []).map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean)
  if (owners.every(id => existing.includes(id))) return {}
  return { assignees: { set: [...new Set([...existing, ...owners])].map((id) => ({ id })) } }
}

export function evaluateTicket(bundle, ticket, context = {}) {
  const scopeReason = outOfScopeReason(bundle, ticket)
  if (scopeReason) return decision(ticket, {
    // The class is recorded for telemetry and the sweep partitions even though nothing is administered (2026-09-24).
    class: classifyTicket(bundle, ticket),
    scope: 'outside-alpha-public-wordpress',
    policy: 'internal-review',
    outcome: 'out-of-scope',
    ownerRole: 'internal-triage',
    queue: 'owner',
    missing: [],
    requesterMissing: [],
    derivableMissing: [],
    systemMissing: [],
    found: {},
    invalid: [],
    reason: scopeReason,
  }, bundle)
  const classId = classifyTicket(bundle, ticket)
  if (!classId) return decision(ticket, {
    class: null,
    scope: 'unknown',
    policy: 'internal-review',
    outcome: 'needs-rule',
    ownerRole: 'internal-triage',
    queue: 'owner',
    missing: ['classification'],
    requesterMissing: [],
    derivableMissing: [],
    systemMissing: ['classification'],
    found: {},
    reason: 'No compiled ticket class matched. Intake cannot invent a route or fall back to Matt or Yash.',
  }, bundle)

  const spec = bundle.classes[classId]
  const text = ticketText(ticket)
  const required = new Set(spec.required || [])
  for (const rule of spec.intake.conditionalRequired || []) {
    if (trustedPolicyRegex(rule.pattern).test(text)) for (const field of rule.fields || []) required.add(field)
  }
  const found = {}
  const invalid = []
  const missing = []
  for (const field of required) {
    const value = extractField(bundle, ticket, field, context)
    if (hasValue(value) && validFieldValue(bundle, field, value)) found[field] = value
    else {
      missing.push(field)
      if (hasValue(value)) invalid.push(field)
    }
  }
  const requesterMissing = missing.filter((field) => spec.intake.requesterRequired.includes(field))
  const derivableMissing = missing.filter((field) => spec.intake.derivable.includes(field))
  const systemMissing = missing.filter((field) => spec.intake.systemRequired.includes(field))
  // The layout form's label includes "new section" even for alignment-only requests.
  // Presentation guards inspect the actual request, not that form boilerplate.
  const guardText = classId === 'page-presentation'
    ? ((isWebsiteRequestForm(ticket) && formWebsiteDetail(ticket)) || requestDetail(ticket)) : text
  const guard = (spec.intake.guards || []).find((item) => trustedPolicyRegex(item.pattern).test(guardText))
  const ownerRule = (spec.intake.ownerRules || []).find((item) => ownerRuleMatches(item, ticket, text))
  const policy = guard?.policy || spec.intake.policy
  const configuredOwnerRole = guard?.ownerRole || ownerRule?.ownerRole || spec.intake.ownerRole
  const ownerRole = typeof configuredOwnerRole === 'string' && configuredOwnerRole.trim() ? configuredOwnerRole.trim() : UNRESOLVED_OWNER_ROLE
  const reason = guard?.reason || ownerRule?.reason || spec.note
    || (ownerRole === UNRESOLVED_OWNER_ROLE && configuredOwnerRole !== UNRESOLVED_OWNER_ROLE ? `Class ${classId} names no owner role; routed to the unresolved-owner queue.` : null)

  // Presence, not absence (repair plan 2026-09-25, repair 1): a derivable field whose registry has no entry for the campus
  // (spec/intake-policy.json fieldSources.<field>.missingRegistryOwnerRole) is Missing Info to that registry's owner role,
  // never needs-derivation to internal triage: the missing entry is the defect and the owner is known.
  const registryMissing = derivableMissing.filter((field) => typeof bundle.intakeFieldSources?.[field]?.missingRegistryOwnerRole === 'string')
  const registryOwnerRole = registryMissing.length && registryMissing.length === derivableMissing.length ? bundle.intakeFieldSources[registryMissing[0]].missingRegistryOwnerRole : null
  let outcome
  let finalOwnerRole = ownerRole
  if (policy === 'disallowed') {
    outcome = 'policy-denied'
  } else if (systemMissing.includes('requester')) {
    outcome = 'intake-defect'
    finalOwnerRole = sourceOwnerRole(ticket)
  } else if (requesterMissing.length) {
    outcome = 'missing-info'
    finalOwnerRole = 'requester'
  } else if (policy === 'internal-review') {
    outcome = 'policy-review'
  } else if (systemMissing.length) {
    outcome = 'intake-defect'
    finalOwnerRole = sourceOwnerRole(ticket)
  } else if (registryOwnerRole) {
    outcome = 'missing-registry'
    finalOwnerRole = registryOwnerRole
  } else if (derivableMissing.length) {
    outcome = 'needs-derivation'
    finalOwnerRole = 'internal-triage'
  } else {
    outcome = spec.intake.queue === 'execution' ? 'ready-for-execution' : 'routed'
  }

  return decision(ticket, {
    class: classId,
    scope: spec.scope,
    policy,
    outcome,
    ownerRole: finalOwnerRole,
    queue: spec.intake.queue,
    missing,
    requesterMissing,
    derivableMissing,
    systemMissing,
    found,
    invalid,
    reason: outcome === 'missing-registry' ? (bundle.intakeFieldSources[registryMissing[0]].missingRegistryReason || reason) : reason,
    ownerRule: ownerRule?.reason || null,
    guard: guard?.reason || null,
    ...(outcome === 'missing-registry' ? { registryMissing } : {}),
  }, bundle)
}

function decision(ticket, value, bundle) {
  const inputSha256 = ticketInputSha256(ticket)
  return refreshDecisionHash({
    id: ticket.id,
    title: String(ticket.title || '').slice(0, 120),
    currentStatus: ticket.status || null,
    requester: ticket.requesterEmail || null,
    ...value,
    inputSha256,
    policySha256: bundle.policySha256,
  })
}

export function refreshDecisionHash(result) {
  result.decisionSha256 = sha256(stableJson({
    policySha256: result.policySha256,
    inputSha256: result.inputSha256,
    class: result.class,
    policy: result.policy,
    outcome: result.outcome,
    ownerRole: result.ownerRole,
    ownerResolution: result.ownerResolution || null,
    queue: result.queue,
    requesterMissing: result.requesterMissing,
    derivableMissing: result.derivableMissing,
    systemMissing: result.systemMissing,
    invalid: result.invalid || [],
    found: result.found || {},
    relatedTicketIds: result.relatedTicketIds || [],
  }))
  return result
}

export function resolveDecisionOwner(bundle, result, ticket, usersByEmail = new Map()) {
  if (typeof result.ownerRole !== 'string' || !result.ownerRole.trim()) {
    // An unresolved owner goes to the explicit unresolved-owner queue, never to an empty string.
    // Cause: 2026-09-17, Boston resolved ownerRole to '' so no assignee was set and the body said "Owner: see class".
    result.ownerRole = UNRESOLVED_OWNER_ROLE
    result.ownerResolution = 'unresolved-owner-role'
    if (['ready-for-execution', 'routed'].includes(result.outcome)) result.outcome = 'owner-unresolved'
    result.reason = result.reason || 'No owner role resolved for this ticket; routed to the unresolved-owner queue for internal triage.'
    return escalateUnownedTicket(bundle, result, ticket)
  }
  if (result.ownerRole === 'requester') {
    result.owner = ticket.requesterEmail || null
    result.ownerUser = ticket.requesterEmail ? usersByEmail.get(String(ticket.requesterEmail).toLowerCase()) || null : null
    result.ownerResolution = result.ownerUser ? 'requester-apex-user' : 'requester-email-only'
    return refreshDecisionHash(result)
  }

  if (result.ownerRole === OPERATOR_ROLE) {
    const pool = operatorPool(bundle)
    if (pool) {
      assignOperatorPool(result, pool)
      result.ownerResolution = pool.members.length === 1 ? 'exact-role-owner' : 'shared-role-owners'
      return refreshDecisionHash(result)
    }
  }

  const candidates = (bundle.roleOwners[result.ownerRole] || []).filter((person) => person.apexUserId)
  if (candidates.length === 1) {
    result.owner = candidates[0].name
    result.ownerUser = { id: candidates[0].apexUserId, name: candidates[0].name }
    result.ownerResolution = 'exact-role-owner'
    return refreshDecisionHash(result)
  }

  result.ownerResolution = candidates.length ? 'ambiguous-role-owner' : 'unregistered-role-owner'
  if (['ready-for-execution', 'routed'].includes(result.outcome)) {
    result.outcome = 'owner-unresolved'
    // Protocol 1d wording: spec/ticket-templates.json templates ownerAmbiguous and ownerUnregistered.
    result.reason = renderTemplate(candidates.length ? 'ownerAmbiguous' : 'ownerUnregistered', { role: result.ownerRole })
  }
  return escalateUnownedTicket(bundle, result, ticket)
}

/**
 * Protocol 1d (decision 2026-09-19, Matt Barge): a ticket is never left without a person. Intake fails closed on
 * execution, never on ownership: when the owner role has no registered person (or several and no primary), the
 * ticket is Blocked and assigned to the website agent operator with a note naming the role, the system the work
 * lives in, and the change, so a human can name the owner in one step. Before 2026-09-24 intake left such tickets
 * Blocked and unassigned and every sweep partition had to add the assignment as a second PATCH (C1, C2, F reports).
 * The route itself does not change: the owner role, outcome, and review hold stay as the policy decided them.
 */
function escalateUnownedTicket(bundle, result, ticket) {
  result.owner = null
  result.ownerUser = null
  const operator = escalationOperator(bundle)
  if (operator) {
    assignOperatorPool(result, operator)
    result.escalation = {
      rule: 'protocol-1d',
      role: result.ownerRole,
      ownerResolution: result.ownerResolution,
      assignedTo: operator.name,
      note: escalationNote(bundle, result, ticket, { assignedTo: operator.name }),
    }
  } else {
    result.escalation = { rule: 'protocol-1d', role: result.ownerRole, ownerResolution: result.ownerResolution, assignedTo: null, note: null, error: 'no website-agent-operator is registered with an APEX user in registry/people.json' }
  }
  return refreshDecisionHash(result)
}

export function escalationOperator(bundle) {
  return operatorPool(bundle)
}

/**
 * The protocol 1d note for a ticket whose owner role has no registered person (template `blocked`): DECISION NEEDED
 * with intake's reason, then the role with no person, the system the work lives in, and the exact change requested
 * (title and page), in that order, so a human can name the owner in one step; then the person it is assigned to and
 * intake's decision (outcome and class). `actor` and `date` name who wrote it (agent/intake.mjs passes its version);
 * `system` is the class adapter's system from the bundle (the observer adapter only finds the defect, so its classes
 * name the executing role instead), then the class's executing role, then its scope; `assignedTo` defaults to the
 * resolved owner (the website agent operator).
 */
export function escalationNote(bundle, result, ticket, { actor, date, assignedTo } = {}) {
  const spec = result.class ? bundle.classes?.[result.class] : null
  const adapter = spec?.adapter ? bundle.adapters?.[spec.adapter] : null
  const executingSystem = adapter && spec.adapter !== 'observer' ? adapter.system : null
  const role = result.ownerRole || UNRESOLVED_OWNER_ROLE
  const page = result.found?.pageUrl || ticket?.url || null
  const title = String(ticket?.title || '').split(/\r?\n/)[0].trim().slice(0, 200)
  return renderTemplate('blocked', {
    actor: actor || 'intake',
    date: date || new Date().toISOString().slice(0, 10),
    decision: result.reason || renderTemplate('ownerUnregistered', { role }),
    role,
    system: executingSystem || spec?.executes || spec?.scope || 'not determined: no compiled ticket class matched',
    change: `${title || 'see the ticket'}${page ? ` (${page})` : ''}`,
    assignedTo: assignedTo || result.owner || null,
    intakeDecision: result.outcome ? `${result.outcome}${result.class ? ` for class ${result.class}` : ''}` : null,
  })
}

/**
 * Protocol 1c (decision 2026-09-18, Matt Barge): a note headed OPERATOR INSTRUCTION (website operations) or CORRECTION
 * outranks the policy bundle's class, owner, and review hold. Intake never re-routes, re-blocks, or re-assigns such a
 * ticket; it reports its evaluation only. Headings are matched at the start of a line, upper case, in the description,
 * the human comments, and the APEX agent instructions.
 */
/** The marker agent/file-observer-findings.mjs writes as customFields.filedBy on every ticket it creates (its FILED_BY). */
export const OBSERVER_FILER_FILED_BY = 'agent/file-observer-findings.mjs'

/**
 * A ticket the observer filer created: `customFields.filedBy` is the filer's exact marker, or `customFields.filerRunId` is a
 * non-blank string. True at every status, NOT_STARTED included: the filer opens, holds and closes such a ticket when its
 * check clears, so intake never requests clarification on it, never re-routes it and never reconciles it (2026-09-25:
 * intake had moved six filer tickets to Missing Info addressed to the observer owner). APEX PR 409's own server-side test
 * (checkId SITE-*, a filerRunId, past NOT_STARTED) is a subset of this one.
 */
export function observerFilerOwned(ticket) {
  const fields = ticket?.customFields || {}
  return fields.filedBy === OBSERVER_FILER_FILED_BY || (typeof fields.filerRunId === 'string' && fields.filerRunId.trim() !== '')
}

export function operatorInstruction(ticket) {
  const texts = [
    ticket.description,
    ...(ticket.comments || []).map((item) => item?.body),
    ...(ticket.agentInstructions || []).filter((item) => !item?.status || ['PENDING', 'ACKNOWLEDGED'].includes(item.status)).map((item) => item?.body),
  ]
  for (const text of texts) {
    const line = String(text || '').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
      .split(/\r?\n/).map((item) => item.trim()).find((item) => /^(?:OPERATOR INSTRUCTION|CORRECTION)\b/.test(item))
    if (line) return { kind: line.startsWith('OPERATOR') ? 'operator-instruction' : 'correction', heading: line.slice(0, 200) }
  }
  return null
}

export function administrativeAction(result) {
  if (result.outcome === 'out-of-scope') return { kind: 'no-action', api: null, assign: null }
  if (result.outcome === 'missing-info') return { kind: 'request-clarification', api: '/api/agent/tasks/{id}/status', assign: 'requester' }
  if (result.outcome === 'missing-registry') return { kind: 'registry-missing-info', api: '/api/agent/tasks/{id}/status', assign: result.ownerRole }
  if (result.outcome === 'ready-for-execution') return { kind: 'execution-ready', api: '/api/agent/tasks/{id}/reconcile', assign: result.ownerRole }
  if (result.outcome === 'routed') return { kind: 'owner-route', api: '/api/v1/tasks/{id}', assign: result.ownerRole }
  return { kind: 'blocked-review', api: '/api/agent/tasks/{id}/reconcile', assign: result.ownerRole }
}

export function classifyTicket(bundle, ticket) {
  const title = String(ticket.title || '')
  const requestType = normalizeRequestType(
    ticket.originalSubmission?.websiteRequestType
      || ticket.customFields?.websiteRequestType
      || '',
  )
  const form = isWebsiteRequestForm(ticket)
  // A form ticket is classified on what the requester typed into the form's fields, never on the form's own boilerplate
  // ("PUBLISH TIMING Publish as soon as it's ready" sent layout, media, and press requests to page-status, 2026-10-09).
  const detail = (form && formWebsiteDetail(ticket)) || requestDetail(ticket)
  const classes = Object.entries(bundle.classes || {}).filter(([, spec]) => urlGateOpen(spec, ticket))
  // 1. A class id recorded in customFields.checkId (a triage or an agent filing) is a decision already made.
  for (const [id, spec] of classes) {
    if (spec.match?.['customFields.checkId'] && ticket.customFields?.checkId === spec.match['customFields.checkId']) return id
  }
  // 1b. One id everywhere (spec/ticket-classes.json 0.13, repair plan 2026-09-25 repair 7): the check-bundle row id the ticket
  //     carries (customFields.requirementId, or requirementIds when a page-check id spans several rows) against each class's
  //     matchRequirementIds, then the page-check or agent-found check id (customFields.checkId, check) against matchCheckIds.
  //     tests/build-policy.mjs refuses an id claimed by two classes, so order never decides. Before any title pattern.
  for (const requirementId of requirementIdsFor(ticket)) {
    for (const [id, spec] of classes) if ((spec.matchRequirementIds || []).includes(requirementId)) return id
  }
  for (const check of observerCheckNames(ticket)) {
    for (const [id, spec] of classes) if ((spec.matchCheckIds || []).includes(check)) return id
  }
  // 2. The observer's own check name (customFields.check, or an agent-found checkId) against each class's observerChecks
  //    taxonomy: one class per check (tests/build-policy.mjs refuses an overlap), so titles cannot mislead it
  //    (2026-09-24: "Edit:" titles, HubSpot-URL event tickets, and timeouts swallowed by observer-health).
  for (const check of observerCheckNames(ticket)) {
    for (const [id, spec] of classes) {
      if ((spec.observerChecks || []).some((pattern) => observerCheckMatches(pattern, check))) return id
    }
  }
  // 3. The observer's loop designation (loop-health is never a website change).
  for (const [id, spec] of classes) {
    if (spec.match?.['customFields.loop'] && ticket.customFields?.loop === spec.match['customFields.loop']) return id
  }
  // 4. A staff request from the APEX website form: the request type the requester picked is the decision, ahead of any
  //    title pattern (for the typed form requests in FORM_DETAIL_FIELDS; team-member requests keep title precedence so
//    "[just update photo]" still reaches staff-photo), and observer classes never apply (2026-10-09: the form title "Link, button, calendar, or info packet"
  //    matched observer-link-cta's "calendar" and an info-packet request went to internal triage). The type may be
  //    qualified by the link type ("link-resource/info-packet") so a packet link reaches the packet owner.
  if (form && Object.hasOwn(FORM_DETAIL_FIELDS, requestType)) {
    // "Layout, new section, or something else": the form itself routes it as a design decision for internal review.
    // Only the bounded presentation class may refine it; other text must not select a staff or content class.
    if (requestType === 'layout-other') {
      const presentation = bundle.classes?.['page-presentation']
      if (presentation && urlGateOpen(presentation, ticket)
        && presentation.match?.detailPattern
        && trustedPolicyRegex(presentation.match.detailPattern).test(detail)) return 'page-presentation'
      return null
    }
    const linkType = normalizeRequestType(ticket.customFields?.webLinkType || ticket.originalSubmission?.webLinkType || '')
    for (const candidate of [linkType ? `${requestType}/${linkType}` : null, requestType].filter(Boolean)) {
      for (const [id, spec] of classes) {
        if ((spec.match?.websiteRequestType || []).map(normalizeRequestType).includes(candidate)) return id
      }
    }
  }
  const eligible = form ? classes.filter(([id]) => !id.startsWith('observer-')) : classes
  for (const [id, spec] of eligible) {
    if (id !== 'copy' && spec.match?.titlePattern && trustedPolicyRegex(spec.match.titlePattern).test(title)) return id
  }
  for (const [id, spec] of eligible) {
    if (id !== 'copy' && (spec.match?.websiteRequestType || []).map(normalizeRequestType).includes(requestType)) return id
  }
  for (const [id, spec] of eligible) {
    if (spec.match?.detailPattern && trustedPolicyRegex(spec.match.detailPattern).test(detail)) return id
  }
  const copy = bundle.classes?.copy
  if (copy && urlGateOpen(copy, ticket)) {
    if (copy.match?.titlePattern && trustedPolicyRegex(copy.match.titlePattern).test(title)) return 'copy'
    if ((copy.match?.websiteRequestType || []).map(normalizeRequestType).includes(requestType)) return 'copy'
  }
  return null
}

/** The check-bundle row ids a ticket carries: customFields.requirementId first, then requirementIds (a page-check id that spans several rows). */
export function requirementIdsFor(ticket) {
  const fields = ticket.customFields || {}
  return [...new Set([fields.requirementId, ...(Array.isArray(fields.requirementIds) ? fields.requirementIds : [])].filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))]
}

/**
 * An owner rule (spec/intake-policy.json classes.<id>.ownerRules) applies when its text pattern matches the ticket text, or (1.2)
 * when its checkIds name the ticket's check id or its requirementIds name the ticket's requirement id; a rule may carry any of the three.
 */
export function ownerRuleMatches(rule, ticket, text = ticketText(ticket)) {
  if (rule?.pattern && trustedPolicyRegex(rule.pattern).test(text)) return true
  const checks = observerCheckNames(ticket)
  if (Array.isArray(rule?.checkIds) && rule.checkIds.some((id) => checks.includes(id))) return true
  const requirements = requirementIdsFor(ticket)
  if (Array.isArray(rule?.requirementIds) && rule.requirementIds.some((id) => requirements.includes(id))) return true
  return false
}

/** match.urlPattern, when a class declares one, gates every rule of that class on the ticket's own URL. */
function urlGateOpen(spec, ticket) {
  const pattern = spec?.match?.urlPattern
  if (!pattern) return true
  return trustedPolicyRegex(pattern).test(String(ticket.url || ''))
}

function observerCheckNames(ticket) {
  const fields = ticket.customFields || {}
  return [fields.check, fields.checkId]
    .filter((value) => typeof value === 'string' && value.trim() && !/^SITE-/.test(value))
    .map((value) => value.trim())
}

export function observerCheckMatches(pattern, name) {
  if (typeof pattern !== 'string' || !pattern || /\s/.test(pattern)) return false // "campus-page-status-sentence (to build)" is a note, not a name
  const source = `^${pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`
  return new RegExp(source).test(name) // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
}

export function extractField(bundle, ticket, fieldName, context = {}) {
  const field = bundle.fields?.[fieldName]
  if (!field) return extractLabeled(ticket.description, fieldName)
  if (fieldName === 'staffHeadshot') return verifiedHeadshotId(ticket)
  const description = stripHtml(ticket.description)
  for (const source of field.from || []) {
    if (source === 'registry:campus-open-media') {
      const url = extractField(bundle, ticket, 'pageUrl', context)
      const slug = campusSlug(url)
      const entry = slug ? bundle.campusOpenMedia?.[slug] : null
      if (entry?.status === 'placed') return `${entry.openMedia}${entry.attachmentId ? ` #${entry.attachmentId}` : ''}`
      continue
    }
    if (source === 'agent-found:idempotencyKey') {
      // An agent-found ticket has no observer SITE id; its idempotency key is the durable finding identifier (protocol step 8).
      if (ticket.customFields?.source === 'agent-found' && hasValue(ticket.customFields?.idempotencyKey)) return String(ticket.customFields.idempotencyKey).trim()
      continue
    }
    if (source === 'apex:users-by-exact-name') {
      const name = extractField(bundle, ticket, 'staffName', context)
      const user = name ? context.usersByExactName?.get(normalizePersonName(name)) : null
      if (user?.email) return String(user.email).trim()
      continue
    }
    if (source === 'form:website-detail') {
      const result = formWebsiteDetail(ticket)
      if (result) return result
      continue
    }
    if (source === 'form:link-destination') {
      const result = formLinkDestination(ticket)
      if (result) return result
      continue
    }
    if (source === 'program:campus-pages') {
      const result = campusUrlFromText(bundle, (ticket.program || []).join(' | '))
      if (result) return result
      continue
    }
    if (source === 'title:campus-pages') {
      const result = campusUrlFromText(bundle, ticket.title)
      if (result) return result
      continue
    }
    const separator = source.indexOf(':')
    const path = separator === -1 ? source : source.slice(0, separator)
    const pattern = separator === -1 ? null : source.slice(separator + 1)
    const raw = path === 'description' ? description
      : path === 'title' ? String(ticket.title || '')
      : getPath(ticket, path)
    if (!hasValue(raw)) continue
    if (!pattern) {
      const value = normalizeFieldValue(fieldName, raw)
      if (fieldName === 'pageUrl' && !isPublicAlphaPage(bundle, value)) continue
      return value
    }
    const match = String(raw).match(trustedPolicyRegex(pattern))
    if (match) {
      const value = normalizeFieldValue(fieldName, match[1])
      if (fieldName === 'pageUrl' && !isPublicAlphaPage(bundle, value)) continue
      return value
    }
  }
  return null
}

export function clarificationRequirements(bundle, result) {
  const seen = new Set()
  const requirements = []
  for (const field of result.requesterMissing || []) {
    const requirement = bundle.intakeFieldSources?.[field]?.requirement
    if (!requirement || seen.has(requirement.key)) continue
    seen.add(requirement.key)
    requirements.push(requirement)
  }
  return requirements.length ? { schemaVersion: 1, requirements } : null
}

export function clarificationNote(bundle, result) {
  // Wording: spec/ticket-templates.json template intakeClarification.
  const requirements = clarificationRequirements(bundle, result)?.requirements || []
  return renderTemplate('intakeClarification', {
    items: requirements.map((item) => ({ label: item.label, prompt: item.prompt })),
    derivable: result.derivableMissing?.length ? result.derivableMissing : null,
  })
}

/**
 * The requester notice items for a missing-info decision: one plain label per typed requirement, with the
 * person named when the ticket names one ("Headshot for Avery Example"). Labels, not prompts: the prompts
 * carry system wording, and the notice's own "how to provide" line says where the file goes.
 */
export function requesterNoticeItems(bundle, result) {
  const requirements = clarificationRequirements(bundle, result)?.requirements || []
  const person = result.found?.staffName ? ` for ${result.found.staffName}` : ''
  return requirements.map((item) => `${item.label}${person}`)
}

export function ticketInputSha256(ticket) {
  const agentCommentIds = new Set((ticket.activityLog || []).flatMap(({ meta }) => {
    if (!meta || typeof meta !== 'object' || typeof meta.commentId !== 'string') return []
    return [meta.commentId]
  }))
  const customFields = Object.fromEntries(Object.entries(ticket.customFields || {}).filter(([key]) => !INTAKE_OWNED_FIELDS.has(key)))
  // The reviewer URL intake writes when the requester left it empty (and the targetUrl APEX derives from it) is intake's
  // own output, not requester input. Counting it made the next run see a "new" ticket and post the same clarification
  // again (Chicago, Bethesda/Chantilly/McLean and Denver tickets each got two identical notes, 2026-10-09).
  const intakeUrl = ticket.customFields?.intakeReviewUrl
  const ownUrl = (value) => Boolean(intakeUrl && value && normalizeUrl(value) === normalizeUrl(intakeUrl))
  const input = {
    title: ticket.title || null,
    description: ticket.description || null,
    url: ownUrl(ticket.url) ? null : ticket.url || null,
    targetUrl: ownUrl(ticket.targetUrl) ? null : ticket.targetUrl || null,
    requestType: ticket.requestType || null,
    program: [...(ticket.program || [])].sort(),
    requesterEmail: ticket.requesterEmail || null,
    originalSubmission: ticket.originalSubmission || null,
    customFields,
    assets: (ticket.assets || ticket.requestAssets || []).map(assetFingerprint).sort(sortStable),
    revisions: (ticket.revisions || []).map((revision) => ({
      id: revision.id,
      source: revision.source,
      responseData: revision.responseData,
      nextWorkingFields: revision.nextWorkingFields,
      createdAt: revision.createdAt,
    })).sort(sortStable),
    clarifications: (ticket.clarifications || []).filter((item) => item.responseData || item.respondedAt).map((item) => ({
      id: item.id,
      status: item.status,
      responseData: item.responseData,
      respondedAt: item.respondedAt,
    })).sort(sortStable),
    comments: (ticket.comments || []).filter((item) => !agentCommentIds.has(item.id)).map((item) => ({ id: item.id, body: item.body })).sort(sortStable),
  }
  return sha256(stableJson(input))
}

export function executionRevision(ticket) {
  const agentCommentIds = new Set((ticket.activityLog || []).flatMap(({ meta }) => {
    if (!meta || typeof meta !== 'object' || typeof meta.commentId !== 'string') return []
    return [meta.commentId]
  }))
  return sha256(stableJson({
    title: ticket.title,
    description: ticket.description,
    url: ticket.url,
    customFields: ticket.customFields,
    requestType: ticket.requestType,
    program: ticket.program,
    requiresHumanApproval: Boolean(ticket.requiresHumanApproval),
    assignees: (ticket.assignees || []).map((item) => item.id).sort(),
    instructions: (ticket.agentInstructions || [])
      .filter((item) => ['PENDING', 'ACKNOWLEDGED'].includes(item.status))
      .map(({ id, body, grantsApproval }) => ({ id, body, grantsApproval }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    comments: (ticket.comments || []).filter((item) => !agentCommentIds.has(item.id)).map(({ id, body }) => ({ id, body })).sort((a, b) => a.id.localeCompare(b.id)),
  }))
}

/** True when the ticket already waits on exactly this information request (same message, still unanswered). */
export function clarificationAlreadyPending(ticket, note) {
  if (ticket.status !== 'MISSING_INFO' || !note) return false
  const pending = new Set(['OPEN', 'PENDING_SEND', 'RETRYING_SEND', 'SEND_FAILED', 'SENT'])
  return (ticket.clarifications || []).some((item) => item.kind === 'INFORMATION_REQUEST' && pending.has(item.status)
    && !item.respondedAt && !item.responseData && String(item.message || '').trim() === String(note).trim())
}

export function pendingClarificationReviews(ticket) {
  const pending = new Set(['OPEN', 'PENDING_SEND', 'RETRYING_SEND', 'SEND_FAILED'])
  return (ticket.clarifications || [])
    .filter((item) => item.kind === 'INFORMATION_REQUEST' && pending.has(item.status) && !item.respondedAt && !item.responseData)
    .map((item) => ({ id: item.id, messageHash: sha256(String(item.message || '')) }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function duplicateKey(result) {
  if (!result.class || !result.found?.pageUrl) return null
  const subject = result.found.staffName || result.found.destinationUrl || result.found.changeDetail
  if (!subject) return null
  return [result.class, normalizeUrl(result.found.pageUrl), normalizeSubject(subject)].join('|')
}

export function applyDuplicateCandidates(results) {
  const groups = new Map()
  for (const result of results) {
    const key = duplicateKey(result)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(result)
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const ids = group.map((item) => item.id).sort()
    for (const result of group) {
      result.relatedTicketIds = ids.filter((id) => id !== result.id)
      if (['ready-for-execution', 'routed'].includes(result.outcome)) {
        result.outcome = 'duplicate-candidate'
        result.ownerRole = 'internal-triage'
        result.policy = 'internal-review'
        result.reason = renderTemplate('duplicate', { related: result.relatedTicketIds })
        refreshDecisionHash(result)
      }
    }
  }
  return results
}

function isWebsiteRequestForm(ticket) {
  return ticket.customFields?.formSource === 'request-form'
}

// The APEX website request form stores each request type in typed web* fields, not in a DETAIL line. Before 2026-10-09
// intake read only DETAIL, so every "Text, FAQ, or copy", link, layout, media, and press request bounced as Missing Info
// for a change the requester had already typed. Each entry lists the labelled fields in order and the fields that carry
// the substance: without one of those the request really is incomplete and the function returns null.
const FORM_DETAIL_FIELDS = {
  'copy-faq': { fields: [['Section', 'webCopySection'], ['Replacement copy', 'webCopyReplacement']], substance: ['webCopyReplacement'] },
  'link-resource': {
    fields: [['Action', 'webLinkAction'], ['Link type', 'webLinkType'], ['Label', 'webLinkLabel'], ['Destination', 'webLinkDestination'], ['Attachment', '$attachments']],
    substance: ['webLinkDestination', '$attachments'],
  },
  'layout-other': { fields: [['Desired outcome', 'webOutcome'], ['Affected section', 'webAffectedSection']], substance: ['webOutcome'] },
  media: {
    fields: [['Section', 'webMediaSection'], ['Description', 'webMediaDescription'], ['Video', 'webMediaVideoUrl'], ['Attachment', '$attachments']],
    substance: ['webMediaDescription', 'webMediaVideoUrl', '$attachments'],
  },
  'event-listing': {
    fields: [['Event', 'webEventNameOrUrl'], ['Issue', 'webEventIssue'], ['Notes', 'webNotes']],
    substance: ['webEventNameOrUrl'],
  },
  'press-news': {
    fields: [['Action', 'webPressAction'], ['Headline', 'webPressHeadline'], ['Outlet', 'webPressOutlet'], ['URL', 'webPressUrl'], ['Page', 'webPressPage'], ['Current wording', 'webPressCurrentWording'], ['New wording', 'webPressNewWording']],
    substance: ['webPressUrl', 'webPressHeadline', 'webPressNewWording'],
  },
}

function formAttachments(ticket) {
  return (ticket.customFields?.webAttachments || [])
    .filter((item) => item?.url && item.status !== 'REJECTED')
    .map((item) => `${item.originalName || 'attachment'} (${item.url})`)
    .join('; ')
}

// Form bookkeeping that says nothing about the change itself.
const FORM_BOOKKEEPING_FIELDS = new Set(['websiteRequestType', 'websiteRequestTypeLabel', 'webPublishTiming', 'webPublishDate', 'webCopyApproved', 'webMultiCampusConfirmed', 'webAttachmentIds', 'webAttachmentMimeTypes', 'webAttachments', 'webDeadline'])

export function formWebsiteDetail(ticket) {
  if (!isWebsiteRequestForm(ticket)) return null
  const fields = ticket.customFields || {}
  const spec = FORM_DETAIL_FIELDS[normalizeRequestType(fields.websiteRequestType)]
  // A form type intake has no entry for yet (event_listing first appeared 2026-10-09) is read from every filled
  // web* field rather than bounced for a DETAIL line the form never writes.
  if (!spec) {
    if (!hasValue(fields.websiteRequestType)) return null
    const lines = Object.entries(fields)
      .filter(([key, value]) => key.startsWith('web') && !FORM_BOOKKEEPING_FIELDS.has(key) && typeof value === 'string' && hasValue(value))
      .map(([key, value]) => `${key.replace(/^web/, '')}: ${value.trim()}`)
    const attachments = formAttachments(ticket)
    if (attachments) lines.push(`Attachment: ${attachments}`)
    return lines.length ? lines.join('\n') : null
  }
  const value = (key) => (key === '$attachments' ? formAttachments(ticket) : fields[key])
  if (!spec.substance.some((key) => hasValue(value(key)))) return null
  return spec.fields
    .filter(([, key]) => hasValue(value(key)))
    .map(([label, key]) => `${label}: ${String(value(key)).trim()}`)
    .join('\n')
}

function formLinkDestination(ticket) {
  if (!isWebsiteRequestForm(ticket) || normalizeRequestType(ticket.customFields?.websiteRequestType) !== 'link-resource') return null
  const fields = ticket.customFields || {}
  if (hasValue(fields.webLinkDestination)) return String(fields.webLinkDestination).trim()
  return (fields.webAttachments || []).find((item) => item?.url && item.status !== 'REJECTED')?.url || null
}

function requestDetail(ticket) {
  return String(ticket.customFields?.requestDetail || ticket.originalSubmission?.requestDetail || stripHtml(ticket.description || ''))
}

function ticketText(ticket) {
  return [ticket.title, requestDetail(ticket), ticket.description, ...(ticket.program || [])].filter(Boolean).join('\n')
}

function sourceOwnerRole(ticket) {
  if (ticket.customFields?.source === 'alpha-site-qc') return 'observer-owner'
  if (ticket.customFields?.source === 'agent-found') return 'website-agent-operator'
  return 'internal-triage'
}

function outOfScopeReason(bundle, ticket) {
  const scope = bundle.siteScope
  if (!scope) return null
  const excluded = scope.excludedPattern ? trustedPolicyRegex(scope.excludedPattern) : null
  const programs = (ticket.program || [])
    .map((item) => String(item || '').trim())
    .filter((item) => item && !/^Alpha School$/i.test(item))
  if (programs.length && programs.every((item) => excluded?.test(item))) return scope.reason
  const title = String(ticket.title || '')
  if (!programs.length && excluded?.test(title) && !campusUrlFromText(bundle, title)) return scope.reason
  return null
}

function campusUrlFromText(bundle, value) {
  const text = String(value || '').toLowerCase()
  let best = null
  for (const page of Object.values(bundle.campusPages || {})) {
    for (const name of page.names || []) {
      if (text.includes(String(name).toLowerCase()) && (!best || name.length > best.name.length)) best = { name, url: page.url }
    }
  }
  return best?.url || null
}

function isPublicAlphaPage(bundle, value) {
  try {
    const url = new URL(String(value))
    if (url.protocol !== 'https:' || !(bundle.siteScope?.publicHosts || [])
      .map((item) => String(item).toLowerCase())
      .includes(url.hostname.toLowerCase())) return false
    if (/^\/(?:wp-admin|wp-json)(?:\/|$)|^\/wp-login\.php$/i.test(url.pathname)) return false
    return !['preview', 'page_id', 'preview_id', 'preview_nonce', 'elementor-preview']
      .some((key) => url.searchParams.has(key))
  } catch { return false }
}

function getPath(object, path) {
  return String(path || '').split('.').reduce((value, key) => value == null ? undefined : value[key], object)
}

function extractLabeled(description, fieldName) {
  const label = String(fieldName).replace(/([A-Z])/g, ' $1').trim()
  const prefix = `${label}:`.toLowerCase()
  for (const line of String(description || '').split(/\r?\n/)) {
    const trimmed = line.trimStart()
    if (trimmed.toLowerCase().startsWith(prefix)) return trimmed.slice(prefix.length).trim() || null
  }
  return null
}

function trustedPolicyRegex(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > 2000) throw new Error('Invalid compiled policy pattern')
  // Patterns are repository-controlled, compiled into the signed policy bundle, length-bounded here,
  // and validated by tests/validate-playbook.mjs before deployment.
  return new RegExp(pattern, 'i') // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
}

function normalizeRequestType(value) {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-')
}

function normalizeExtracted(value) {
  if (typeof value === 'string') return value.trim().replace(/[),.;]+$/, '')
  return value
}

function normalizeFieldValue(fieldName, value) {
  const normalized = normalizeExtracted(value)
  if (fieldName === 'staffName' && typeof normalized === 'string') return normalized.replace(/\s*\[[^\]]+\]\s*$/, '').trim()
  return normalized
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value))
    url.hash = ''
    url.search = ''
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
    return url.toString().toLowerCase()
  } catch { return String(value || '').toLowerCase() }
}

function campusSlug(value) {
  try { return new URL(String(value)).pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || null } catch { return null }
}

function normalizeSubject(value) {
  return stripHtml(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function normalizePersonName(value) {
  return stripHtml(value).toLowerCase().replace(/\s+/g, ' ').trim()
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function validFieldValue(bundle, fieldName, value) {
  const requirement = bundle.intakeFieldSources?.[fieldName]?.requirement
  if (!requirement) return true
  const text = String(value).trim()
  if (requirement.responseType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return false
  if (requirement.responseType === 'url') {
    try { new URL(text) } catch { return false }
  }
  const validation = requirement.validation || {}
  if (validation.minLength !== undefined && text.length < validation.minLength) return false
  if (validation.maxLength !== undefined && text.length > validation.maxLength) return false
  return true
}

function assetFingerprint(asset) {
  return { id: asset.id, kind: asset.kind, checksum: asset.checksum, status: asset.status, source: asset.source }
}

function verifiedHeadshotId(ticket) {
  const fields = ticket.customFields || {}
  const requestedIds = new Set([
    ticket.originalSubmission?.webTmHeadshotAssetId,
    fields.webTmHeadshotAssetId,
    fields.webTmHeadshotAsset?.id,
    fields.requesterResponses?.headshot,
  ].filter(Boolean).map(String))
  if (!requestedIds.size) return null
  const candidates = [
    fields.webTmHeadshotAsset,
    ...(ticket.assets || []),
    ...(ticket.requestAssets || []),
  ].filter(Boolean)
  const asset = candidates.find((item) => {
    if (!item.id || item.status !== 'VERIFIED') return false
    if (!requestedIds.has(String(item.id))) return false
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(item.mimeType)) return false
    return Number(item.sizeBytes) > 0 && Number(item.sizeBytes) <= 15 * 1024 * 1024
  })
  return asset?.id || null
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function sortStable(a, b) { return stableJson(a).localeCompare(stableJson(b)) }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
export function stableJson(value) {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  return JSON.stringify(value)
}
