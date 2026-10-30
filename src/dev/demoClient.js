// Offline stand-in for the Supabase client, used only by the demo mode (?demo in dev builds,
// or VITE_DEMO=1 builds) so every signed-in screen can be screenshotted without touching the
// live project. Queries run against in-memory fixtures (src/dev/fixtures.js).
//   ?demo                 signed in with fixture data
//   ?demo&fail=guide,ai   Edge Functions in the list fail (guide, ai = all AI, checklist, honk, phrases)
//   ?demo&slow=1          Edge Functions take 60s (loading states)
//   ?demo&empty=1         no trips (empty state)
//   ?demo&flagship=9      the multi-city flagship trip (Seattle → Spain → Germany → Rome), on trip day 9
//   ?demo&signedout=1     no session (auth screen)
//   ?demo&plan=first_class  signed in with First Class (default: free)
//   ?demo&limits=1        new trips and reservations hit the free-plan limit (paywall)
//   ?demo&founders=off    the founders (lifetime) offer has ended
//   ?demo&paywall=settings  opens the First Class paywall at launch (cloud device screenshots)
// App builds have no address bar: VITE_DEMO_PARAMS="limits=1&paywall=settings" sets the same options at build time.
import { buildFixtures, DEMO_USER } from './fixtures'

// Set up by createDemoClient(); nothing runs at import time, so production bundles drop this file.
let FAIL = new Set()
let SLOW = false
let db = null
let session = null
let PLAN = 'free'
let LIMITS = false
let FOUNDERS = true
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

// Embedded selects the app relies on: trips → bookings, trip_activities; trip_collaborators → trips
function embed(table, row, select) {
  if (!select || !select.includes('(')) return row
  const out = { ...row }
  if (table === 'trips') {
    if (select.includes('bookings(')) out.bookings = db.bookings.filter(b => b.trip_id === row.id)
    if (select.includes('trip_activities(')) out.trip_activities = db.trip_activities.filter(a => a.trip_id === row.id)
    if (select.includes('trip_stops(')) out.trip_stops = (db.trip_stops || []).filter(s => s.trip_id === row.id)
  }
  if (table === 'trip_collaborators' && select.includes('trips(')) out.trips = db.trips.find(t => t.id === row.trip_id) || null
  return out
}

class Query {
  constructor(table) {
    this.table = table
    this.filters = []
    this.op = 'select'
    this.payload = null
    this.mode = 'many'
    this.selectStr = '*'
    this.orderBy = null
    this.limitN = null
    this.returning = false
  }
  select(s = '*') { if (this.op === 'select') this.selectStr = s; else this.returning = true; return this }
  insert(v) { this.op = 'insert'; this.payload = v; return this }
  upsert(v) { this.op = 'upsert'; this.payload = v; return this }
  update(v) { this.op = 'update'; this.payload = v; return this }
  delete() { this.op = 'delete'; return this }
  eq(k, v) { this.filters.push(r => r[k] === v); return this }
  neq(k, v) { this.filters.push(r => r[k] !== v); return this }
  in(k, arr) { this.filters.push(r => arr.includes(r[k])); return this }
  gt(k, v) { this.filters.push(r => r[k] == null || r[k] > v); return this }
  gte(k, v) { this.filters.push(r => r[k] >= v); return this }
  lt(k, v) { this.filters.push(r => r[k] < v); return this }
  lte(k, v) { this.filters.push(r => r[k] <= v); return this }
  ilike(k, v) { const re = new RegExp('^' + String(v).replace(/%/g, '.*') + '$', 'i'); this.filters.push(r => re.test(r[k] || '')); return this }
  is(k, v) { this.filters.push(r => (r[k] ?? null) === v); return this }
  not(k, op, v) { const f = op === 'is' ? r => (r[k] ?? null) !== v : op === 'eq' ? r => r[k] !== v : () => true; this.filters.push(f); return this }
  or() { return this }
  match(obj) { Object.entries(obj).forEach(([k, v]) => this.eq(k, v)); return this }
  order(k, { ascending = true } = {}) { this.orderBy = { k, ascending }; return this }
  limit(n) { this.limitN = n; return this }
  range() { return this }
  single() { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }
  abortSignal() { return this }

  run() {
    const rows = db[this.table] || (db[this.table] = [])
    const match = r => this.filters.every(f => f(r))
    let data
    if (this.op === 'insert' && LIMITS && PLAN === 'free' && (this.table === 'trips' || this.table === 'bookings')) {
      return { data: null, error: { message: this.table === 'trips' ? 'upgrade:trips' : 'upgrade:reservations' } }
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(v => ({ id: uid(), created_at: new Date().toISOString(), ...v }))
      for (const item of list) {
        const i = this.op === 'upsert' ? rows.findIndex(r => (item.user_id && r.user_id === item.user_id) || r.id === item.id) : -1
        if (i >= 0) rows[i] = { ...rows[i], ...item }; else rows.push(item)
      }
      data = list
    } else if (this.op === 'update') {
      data = []
      rows.forEach((r, i) => { if (match(r)) { rows[i] = { ...r, ...this.payload }; data.push(rows[i]) } })
    } else if (this.op === 'delete') {
      data = rows.filter(match)
      db[this.table] = rows.filter(r => !match(r))
    } else {
      data = rows.filter(match).map(r => embed(this.table, r, this.selectStr))
      if (this.orderBy) {
        const { k, ascending } = this.orderBy
        data.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (ascending ? 1 : -1))
      }
      if (this.limitN != null) data = data.slice(0, this.limitN)
    }
    if (this.mode === 'single') return data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'No rows', code: 'PGRST116' } }
    if (this.mode === 'maybe') return { data: data[0] || null, error: null }
    return { data, count: Array.isArray(data) ? data.length : null, error: null }
  }
  then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject) }
}


const FUNCTION_GROUP = {
  'generate-guide': 'guide', 'generate-checklist': 'checklist', 'goosey-discover': 'honk',
  'generate-phrases': 'phrases', 'parse-booking-email': 'parse', 'fill-my-day': 'fillday',
}

async function invoke(name, opts = {}) {
  const body = typeof opts.body === 'string' ? JSON.parse(opts.body || '{}') : (opts.body || {})
  if (SLOW) await wait(60000)
  else await wait(700)
  const group = FUNCTION_GROUP[name]
  if (FAIL.has(group) || (group && FAIL.has('ai'))) {
    return { data: null, error: { name: 'FunctionsHttpError', message: 'Demo mode: this request was set to fail.' } }
  }
  // Held forwarded emails (?held=N): filed at once after Allow
  if (name === 'inbox-release') {
    const filed = (db.held_inbox_emails || []).length
    db.held_inbox_emails = []
    return { data: { filed, expired: 0, failed: 0, remaining: 0 }, error: null }
  }
  const handler = db.functions[name]
  return { data: handler ? handler(body) : { success: true }, error: null }
}

/** Demo options from the address bar, plus VITE_DEMO_PARAMS for app builds. */
export function demoParams() {
  return new URLSearchParams(`${location.search.replace(/^\?/, '')}&${import.meta.env.VITE_DEMO_PARAMS || ''}`)
}

export function createDemoClient() {
  const params = demoParams()
  FAIL = new Set((params.get('fail') || '').split(',').filter(Boolean))
  SLOW = params.has('slow')
  PLAN = params.get('plan') === 'first_class' ? 'first_class' : 'free'
  LIMITS = params.has('limits')
  FOUNDERS = params.get('founders') !== 'off'
  db = buildFixtures({ empty: params.has('empty'), flagship: params.get('flagship'), askAi: params.has('askai'), held: Number(params.get('held')) || 0 })
  session = params.has('signedout') ? null : {
    access_token: 'demo-token', refresh_token: 'demo', expires_at: Math.floor(Date.now() / 1000) + 3600, user: DEMO_USER,
  }

  // Requests the app makes with plain fetch() to Edge Functions are answered locally too.
  const base = import.meta.env.VITE_SUPABASE_URL
  const realFetch = window.fetch.bind(window)
  window.fetch = (url, init) => {
    if (base && String(url).startsWith(base)) return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    return realFetch(url, init)
  }
  const listeners = []
  return {
    __demo: true,
    from: (table) => new Query(table),
    rpc: async (fn, args) => {
      if (fn === 'public_settings') {
        return { data: { founders_offer: { active: FOUNDERS }, free_limits: { upcoming_trips: 2, reservations_per_trip: 5, email_imports: 5 } }, error: null }
      }
      if (fn === 'my_entitlement') {
        const fc = PLAN === 'first_class'
        return { data: { plan: PLAN, until: fc ? new Date(Date.now() + 300 * 864e5).toISOString() : null,
          web: { lifetime: false, subscription: fc ? { status: 'active', canceling: false } : null, customer: fc }, store: null, limits_on: LIMITS }, error: null }
      }
      if (fn === 'my_record_ai_consent') return { data: args?.p_event === 'granted' ? new Date().toISOString() : null, error: null }
      if (fn === 'reveal_document_number') return { data: db.revealed[args?.p_doc_id] || 'X1234567', error: null }
      return { data: null, error: null }
    },
    functions: { invoke },
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session?.user || null }, error: null }),
      onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } } },
      refreshSession: async () => ({ data: { session }, error: null }),
      signOut: async () => { listeners.forEach(cb => cb('SIGNED_OUT', null)); return { error: null } },
      signInWithPassword: async () => ({ data: {}, error: { message: 'Demo mode: sign-in is disabled.' } }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      signUp: async () => ({ data: {}, error: null }),
      signInWithOAuth: async () => ({ data: {}, error: { message: 'Demo mode: sign-in is disabled.' } }),
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      exchangeCodeForSession: async () => ({ data: {}, error: null }),
      setSession: async () => ({ data: {}, error: null }),
    },
  }
}
