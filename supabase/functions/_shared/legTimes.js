// A flight or train never arrives before it leaves. Compared as instants (UTC), never as wall clocks: HND 17:10 to
// YVR 10:05 on the same calendar day is valid because Vancouver is 16 hours behind Tokyo.
const DAY = 864e5
const isInstant = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v.trim()) && !Number.isNaN(Date.parse(v))

/**
 * The arrival to store, as an ISO instant, given the departure and arrival instants (ISO strings).
 * - arrival at or after departure: unchanged
 * - before departure: rolled forward by whole days (at most `maxDays`) to the first instant after departure; this is
 *   the arrival date the AI dropped from "Arrive Thu 22 Apr 13:55" or a "+1" / "next day" marker
 * - still before departure: null (keep the departure, store no arrival rather than a wrong one)
 * Anything that is not a full instant (a date only, null) is returned as it came.
 */
export function guardArrival(departure, arrival, maxDays = 2) {
  if (!isInstant(departure) || !isInstant(arrival)) return arrival ?? null
  const dep = Date.parse(departure), arr = Date.parse(arrival)
  if (arr >= dep) return arrival
  const days = Math.ceil((dep - arr) / DAY)
  return days <= maxDays ? new Date(arr + days * DAY).toISOString() : null
}
