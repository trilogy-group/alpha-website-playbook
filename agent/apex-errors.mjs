/**
 * APEX error predicates shared by the intake administrator (agent/intake.mjs) and the observer filer
 * (agent/file-observer-findings.mjs), so one definition decides what a filer-owned conflict looks like.
 *
 * APEX PR 409: a ticket the observer filer owns answers 409 with code OBSERVER_FILER_OWNED. Depending on the route the
 * code arrives top-level (`{ code }`), nested (`{ error: { code } }`), or only in the message text; the client that threw
 * may have copied it onto the error itself (`error.code`) or kept the parsed body (`error.body`).
 */
export const FILER_OWNED_CODE = 'OBSERVER_FILER_OWNED'

/** Every place a response body may carry an error code. */
export function apexErrorCodes(body) {
  if (!body || typeof body !== 'object') return []
  const codes = [body.code, body.error?.code, body.details?.code, body.data?.code]
  return codes.filter((c) => typeof c === 'string' && c)
}

/** True when the error is APEX's 409 OBSERVER_FILER_OWNED, whichever shape the route used. */
export function isFilerOwnedConflict(error) {
  if (!error || error.status !== 409) return false
  if (error.code === FILER_OWNED_CODE) return true
  if (apexErrorCodes(error.body).includes(FILER_OWNED_CODE)) return true
  const body = error.body || {}
  const texts = [error.message, typeof body.error === 'string' ? body.error : body.error?.message, body.message]
  return texts.some((t) => typeof t === 'string' && t.includes(FILER_OWNED_CODE))
}
