// Email-usage alert (cost-alert Edge Function, kind "usage"): builds the owner email from the counts the daily SQL
// check sends. Pure, so it can be tested without Deno. Only whitelisted integer fields are used: no ids, no addresses.
const FIELDS = [
  ['auth_confirm_today', 'sign-up confirmations'], ['auth_recovery_today', 'password resets'], ['auth_email_change_today', 'email changes'],
  ['auth_invite_today', 'auth invites'], ['app_email_sends_today', 'member emails'], ['app_invite_sends_today', 'trip invites'], ['beta_today', 'beta emails'],
]
const MTD = [['auth_mtd', 'auth emails'], ['app_email_sends_mtd', 'member emails'], ['app_invite_sends_mtd', 'trip invites'], ['beta_mtd', 'beta emails']]
const isCount = v => Number.isInteger(v) && v >= 0 && v < 1e9

export function usageEmail(b) {
  if (!b || b.kind !== 'usage' || (b.scope !== 'day' && b.scope !== 'month')) return null
  if (!isCount(b.total) || !isCount(b.limit)) return null
  const c = b.counts && typeof b.counts === 'object' ? b.counts : {}
  const day = b.scope === 'day'
  const free = day ? '100 a day' : '3,000 a month'
  const rows = (day ? FIELDS : MTD).filter(([k]) => isCount(c[k])).map(([k, label]) => `${label}: ${c[k]}`)
  const lines = [
    day ? `Outbound email today (UTC) reached ${b.total}; the alert level is ${b.limit}.` : `Outbound email this month (UTC) reached ${b.total}; the alert level is ${b.limit}.`,
    `The Resend Free plan allows ${free}, with overage off: past that, mail stops.`,
    ...rows,
    'Counts only. auth emails count each member once per kind, and member emails include skipped and failed attempts, so this is an upper bound.',
  ]
  return { subject: `STT email volume: ${b.total} ${day ? 'today' : 'this month'} (alert level ${b.limit})`, lines }
}
