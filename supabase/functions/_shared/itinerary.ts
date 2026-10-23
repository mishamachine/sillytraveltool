// Checks on a parsed itinerary that don't depend on the AI getting it right:
// connecting legs in order, and the trip's destination (where you stay, not where you fly home to).
import { wallToInstantISO } from './timezones.ts'
import { geminiFetch, geminiDirect } from './gemini.ts'

type Booking = Record<string, any>

const MOVES = new Set(['flight', 'transport'])
const DAY = 86400000
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()
const ms = (v: unknown) => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isNaN(t) ? null : t }

/** "2026-11-14T13:20" → "2026-11-15T13:20" */
function nextDay(wall: string): string {
  const [date, time = ''] = wall.split('T')
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10) + (time ? `T${time}` : '')
}

/**
 * A leg that starts where the previous one landed can't leave before it lands: the confirmation printed "+1" on the
 * arrival and the next leg's date was read from the day heading. Move such legs a day (twice at most).
 * Call after attachZones, with `wall` holding each booking's printed { dep, arr } times.
 * Returns the number of legs moved.
 */
export function fixConnectingLegs(bookings: Booking[], wall: Map<Booking, { dep?: string, arr?: string }>): number {
  let moved = 0
  const legs = bookings.filter(b => MOVES.has(b.type) && ms(b.departure_time) != null)
  for (let i = 1; i < legs.length; i++) {
    const prev = legs[i - 1], leg = legs[i]
    if (!norm(prev.arrival_airport) || norm(prev.arrival_airport) !== norm(leg.departure_airport)) continue
    const landed = ms(prev.arrival_time)
    const w = wall.get(leg)
    if (landed == null || !w?.dep || !leg.departure_tz) continue
    for (let n = 0; n < 2 && (ms(leg.departure_time) ?? Infinity) < landed; n++) {
      w.dep = nextDay(w.dep)
      leg.departure_time = wallToInstantISO(w.dep, leg.departure_tz) ?? leg.departure_time
      if (w.arr && leg.arrival_tz) {
        w.arr = nextDay(w.arr)
        leg.arrival_time = wallToInstantISO(w.arr, leg.arrival_tz) ?? leg.arrival_time
      }
      leg.date_adjusted = true
    }
    if (leg.date_adjusted) moved++
  }
  return moved
}

const nights = (b: Booking) => {
  const a = ms(b.check_in_date), z = ms(b.check_out_date)
  return a != null && z != null ? Math.max(0, Math.round((z - a) / DAY)) : 0
}

/**
 * Where the trip is to: the city of the longest hotel stay; for a round trip without hotels, where you turn
 * around (the arrival before the longest gap between legs); otherwise the last arrival.
 * Returns null to keep the AI's answer.
 */
export function pickDestination(bookings: Booking[]): { city: string, airport_code: string | null } | null {
  const stays = bookings.filter(b => b.type === 'hotel' && b.destination_city)
  if (stays.length) {
    const best = stays.reduce((a, b) => (nights(b) > nights(a) ? b : a))
    return { city: best.destination_city, airport_code: null }
  }
  const legs = bookings.filter(b => MOVES.has(b.type))
  if (legs.length < 2) return null
  const first = legs[0], last = legs[legs.length - 1]
  const home = [norm(first.departure_airport), norm(first.departure_city)].filter(Boolean)
  const roundTrip = home.includes(norm(last.arrival_airport)) || (norm(last.destination_city) && home.includes(norm(last.destination_city)))
  if (!roundTrip) return null
  let turn = -1, gap = -1
  for (let i = 0; i < legs.length - 1; i++) {
    const g = (ms(legs[i + 1].departure_time) ?? 0) - (ms(legs[i].arrival_time) ?? 0)
    if (g > gap) { gap = g; turn = i }
  }
  const leg = legs[turn]
  if (!leg?.destination_city && !leg?.arrival_airport) return null
  return { city: leg.destination_city || leg.arrival_airport, airport_code: leg.type === 'flight' ? leg.arrival_airport || null : null }
}

// ── Reading an itinerary with the AI: a confirmation email, a spreadsheet as text, or a PDF / photo ──────────────

/** File types the AI reads directly (vision): PDFs and images. Spreadsheets are turned into text first (sheet.js). */
export const VISION_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif|gif))$/

/** The prompt for any itinerary. source: the text (email, spreadsheet) or null when a file is attached. */
export function itineraryPrompt(source: string | null, { transcribe = false } = {}): string {
  const what = source == null
    ? `the attached document (a booking confirmation, a travel agent's itinerary, a tour agenda, a screenshot or a photo of a
handwritten plan). Read every page.`
    : `this travel confirmation, itinerary or spreadsheet.

Source:
---
${source}
---`
  return `Extract ALL bookings and booked plans from ${what}

An itinerary can list many days: return every flight, train, bus, ferry, car rental, hotel stay, tour, ticket and
restaurant reservation in it, each as its own object, in date order. A spreadsheet row is usually one booking.

For multi-leg flights (e.g. YVR -> LAX -> NRT), return EACH leg as a separate object in the bookings array.
Connection cities are intermediate stops. The ultimate_destination is where the traveller is going, never the
city they fly home to: for a round trip (outbound and return), it is the final arrival of the OUTBOUND journey.

Return ONLY valid JSON with no markdown, exactly this shape:
{
  "bookings": [
    {
      "type": "flight",
      "title": "YVR -> LAX",
      "confirmation_number": null,
      "booking_url": null,
      "price": null,
      "currency": null,
      "flight_number": null,
      "airline": null,
      "departure_airport": null,
      "arrival_airport": null,
      "departure_time": null,
      "arrival_time": null,
      "flight_class": null,
      "hotel_name": null,
      "hotel_address": null,
      "check_in_date": null,
      "check_out_date": null,
      "room_type": null,
      "activity_date": null,
      "activity_time": null,
      "venue_name": null,
      "venue_address": null,
      "destination_city": null,
      "passenger_name": null,
      "seat_number": null,
      "ticket_quantity": null,
      "party_size": null,
      "transport_mode": null
    }
  ],
  "ultimate_destination": {
    "city": "Tokyo",
    "airport_code": "NRT"
  }
}

Rules:
- For a single-leg booking, bookings array has exactly 1 item
- For multi-leg flights, each leg is its own object in the array
- title for flights should be "ORIGIN -> DESTINATION" (e.g. "YVR -> LAX")
- ultimate_destination.city = city name of the destination (not a connection, not the home city of a round trip)
- destination_city on each booking = arrival city for that specific leg (for hotels, the hotel's city)
- Overnight legs: when an arrival is marked "+1" (or "+2"), its date is the next day, and a connecting leg that
  leaves from that airport departs on or after that arrival date, even if it is listed under the earlier day heading
- Shared fields like confirmation_number, price, airline appear on each leg
- departure_time and arrival_time: the LOCAL time exactly as printed on the confirmation, as YYYY-MM-DDTHH:MM with NO time zone or offset. The departure time is local to the departure airport/station, the arrival time local to the arrival airport/station. Never convert between time zones. Date only (YYYY-MM-DD) if no time is printed.
- activity_time: local time exactly as printed, HH:MM 24h.
- departure_airport / arrival_airport for flights: the 3-letter IATA code when shown (e.g. MAD), otherwise the airport name
- Dates as YYYY-MM-DD.
- For hotels/activities, bookings array has 1 item; ultimate_destination = hotel city
- passenger_name: full name of the traveller if present in the email (e.g. "JOHN SMITH")
- seat_number: assigned seat for flights (e.g. "14A"). null if not assigned.
- ticket_quantity: number of tickets for activities/events. null for flights/hotels.
- type must be one of: flight, hotel, activity, transport, restaurant, other
- restaurant = a dining reservation (OpenTable, Resy, Tock, SevenRooms, TheFork, direct booking):
  venue_name = restaurant, venue_address, activity_date (YYYY-MM-DD), activity_time (HH:MM, 24h), party_size = number of guests,
  title like "Dinner at <restaurant>"
- transport = train, bus, ferry, coach or car rental: transport_mode = train|bus|ferry|coach|car,
  airline = operator (e.g. Amtrak, Eurostar, Trenitalia, FlixBus), flight_number = train/service number,
  departure_airport / arrival_airport = station or port names, departure_time / arrival_time as for flights
- activity = museum, attraction, tour, concert, show or sports ticket: venue_name, venue_address, activity_date,
  activity_time, ticket_quantity
- party_size: guests on a restaurant reservation, otherwise null. transport_mode: null unless type is transport.${transcribe ? `
- Also return "read_text": what you read, as plain text lines in reading order (dates, times, places, names exactly as
  written; mark anything you could not read with [?]). At most 3000 characters.` : ''}`
}

/** The AI's JSON answer, tolerant of fences and chatter; null when there is none. */
export function parseAiJson(raw: string | null | undefined): any | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) } catch { /* fall through */ }
  const m = cleaned.match(/(\{[\s\S]*\})/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

/**
 * Read an itinerary: text through the app's AI (DeepSeek first), a PDF or image through Gemini vision.
 * Returns { result } ({ bookings, ultimate_destination, read_text? }) or { error, status }.
 */
export async function readItinerary(
  apiKey: string,
  { text = null, file = null, transcribe = false }: { text?: string | null, file?: { mime: string, data: string } | null, transcribe?: boolean },
): Promise<{ result?: any, error?: string, status?: number }> {
  const generationConfig = { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 8192 }
  let res: Response
  if (file) {
    if (!VISION_TYPES.test(file.mime)) return { error: 'That file type can\'t be read. Try a PDF, a photo or a spreadsheet.', status: 415 }
    res = await geminiDirect(apiKey, {
      contents: [{ parts: [{ text: itineraryPrompt(null, { transcribe }) }, { inline_data: { mime_type: file.mime, data: file.data } }] }],
      generationConfig,
    }, { timeoutMs: 45000 })
  } else {
    // 24s cap prevents the EarlyDrop wall-clock kill; geminiFetch returns 504 on timeout
    res = await geminiFetch(apiKey, { contents: [{ parts: [{ text: itineraryPrompt(String(text ?? ''), { transcribe }) }] }], generationConfig }, { timeoutMs: 24000 })
  }
  if (res.status === 504) return { error: 'Reading it timed out — please try again', status: 504 }
  if (!res.ok) return { error: `AI error: ${(await res.text()).slice(0, 200)}`, status: 502 }
  const data = await res.json()
  let result = parseAiJson(data.candidates?.[0]?.content?.parts?.[0]?.text)
  if (!result) return { error: 'Failed to read the AI response', status: 502 }
  // Backwards-compat: a single booking object instead of { bookings }
  if (!result.bookings) {
    result = { bookings: [result], ultimate_destination: { city: result.destination_city || result.arrival_airport || null, airport_code: result.arrival_airport || null } }
  }
  if (!Array.isArray(result.bookings)) result.bookings = [result.bookings]
  result.bookings = result.bookings.filter((b: any) => b && typeof b === 'object')
  return { result }
}
