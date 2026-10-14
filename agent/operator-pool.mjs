/** Only the website execution role is shared; other domain-owner ambiguities remain holds. */
export const OPERATOR_ROLE = 'website-agent-operator'

export function operatorPool(bundle, people) {
  const registered = bundle?.roleOwners?.[OPERATOR_ROLE]
    ?? Object.values(people?.people || {}).filter(person => person.roles?.some(role => role.role === OPERATOR_ROLE))
  const members = [...new Map((registered || []).filter(person => person.apexUserId && person.name)
    .map(person => [person.apexUserId, { name: person.name, apexUserId: person.apexUserId }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.apexUserId.localeCompare(b.apexUserId))
  if (!members.length) return null
  return { name: members.map(person => person.name).join(' or '),
    apexUserId: members.length === 1 ? members[0].apexUserId : null,
    apexUserIds: members.map(person => person.apexUserId), members }
}

export function assignOperatorPool(result, pool) {
  result.owner = pool.name
  result.ownerUsers = pool.members.map(person => ({ id: person.apexUserId, name: person.name }))
  result.ownerUser = result.ownerUsers.length === 1 ? result.ownerUsers[0] : null
}
