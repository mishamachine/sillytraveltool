// Offline stand-in for the Supabase client, used only by the demo mode (?demo in dev builds,
// or VITE_DEMO=1 builds) so every signed-in screen can be screenshotted without touching the
// live project. Queries run against in-memory fixtures (src/dev/fixtures.js).
//   ?demo                 signed in with fixture data
//   ?demo&fail=guide,ai   Edge Functions in the list fail (guide, ai = all AI, checklist, honk, phrases)
//   ?demo&slow=1          Edge Functions take 60s (loading states)
//   ?demo&empty=1         no trips (empty state)
//   ?demo&signedout=1     no session (auth screen)
import { buildFixtures, DEMO_USER } from './fixtures'

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
const FAIL = new Set((params.get('fail') || '').split(',').filter(Boolean))
const SLOW = params.has('slow')
const SIGNED_OUT = params.has('signedout')

const db = buildFixtures({ empty: params.has('empty') })
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))

// Embedded selects the app relies on: trips → bookings, trip_activities; trip_collaborators → trips
function embed(table, row, select) {
  if (!select || !select.includes('(')) return row
  const out = { ...row }
  if (table === 'trips') {
    if (select.includes('bookings(')) out.bookings = db.bookings.filter(b => b.trip_id === row.id)
    if (select.includes('trip_activities(')) out.trip_activities = db.trip_activities.filter(a => a.trip_id === row.id)
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
  is(k, v) { this.filters.push(r => r[k] === v); return this }
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
    return { data, error: null }
  }
  then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject) }
}

const session = SIGNED_OUT ? null : {
  access_token: 'demo-token', refresh_token: 'demo', expires_at: Math.floor(Date.now() / 1000) + 3600, user: DEMO_USER,
}

const FUNCTION_GROUP = {
  'generate-guide': 'guide', 'generate-checklist': 'checklist', 'goosey-discover': 'honk',
  'generate-phrases': 'phrases', 'parse-booking-email': 'parse',
}

async function invoke(name, opts = {}) {
  const body = typeof opts.body === 'string' ? JSON.parse(opts.body || '{}') : (opts.body || {})
  if (SLOW) await wait(60000)
  else await wait(700)
  const group = FUNCTION_GROUP[name]
  if (FAIL.has(group) || (group && FAIL.has('ai'))) {
    return { data: null, error: { name: 'FunctionsHttpError', message: 'The guide took too long to write.' } }
  }
  const handler = db.functions[name]
  return { data: handler ? handler(body) : { success: true }, error: null }
}

export function createDemoClient() {
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
