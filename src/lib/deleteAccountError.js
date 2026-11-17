// What the member sees when account deletion fails. The Edge Function already hides database errors; this is the
// second wall, so a constraint or SQL message can never reach the screen even from an older function version.
export const DELETE_FALLBACK = 'Couldn’t delete your account. Nothing was deleted; try again or email machinemisha@gmail.com.'
const TECHNICAL = /violates|constraint|foreign key|duplicate key|insert or update|relation "|column "|syntax error|sqlstate|pg_|permission denied|function public\./i

export function friendlyDeleteError(msg) {
  const m = typeof msg === 'string' ? msg.trim() : ''
  if (!m || m.length > 160 || TECHNICAL.test(m)) return DELETE_FALLBACK
  return m
}
