// Dev-only fixtures for /admin/?demo (never in a production build: api.js imports this behind import.meta.env.DEV).
// Invented people; shapes match the admin_* functions.

const day = (n) => new Date(Date.now() + n * 86400000).toISOString()
const d10 = (n) => day(n).slice(0, 10)
const STAGES = ['new', 'dreaming', 'planning', 'getting_ready', 'on_the_road', 'just_back', 'between_trips', 'lapsed']
const NAMES = ['Ana Ruiz', 'Ben Okafor', 'Chloe Martin', 'Dev Patel', 'Emma Lindqvist', 'Farah Haddad', 'Gus Moreau', 'Hana Sato',
  'Ivan Petrov', 'Jade Wong', 'Kofi Mensah', 'Lena Weber', 'Mateo Rossi', 'Nora Kelly', 'Omar Aziz', 'Priya Rao', 'Quinn Baker', 'Rosa Diaz']
const FARES = ['basic', 'economy', 'economy', 'premium', 'business', null]

const members = NAMES.map((name, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  email: `${name.split(' ')[0].toLowerCase()}@example.com`,
  name, joined: day(-i * 9 - 2), last_seen: day(-(i % 6) - 0.1 * i), platform: i % 3 ? 'web' : 'android', app_version: '0.20.0',
  trips: i % 5, bookings: (i % 5) * 4, next_trip: i % 4 === 1 ? d10(5 + i) : null, last_trip_end: i % 3 ? d10(-10 - i) : null,
  stage: STAGES[i % 8], plan: i % 6 === 0 ? 'first_class' : 'free', status: i === 7 ? 'restricted' : i === 11 ? 'warning' : 'active',
  internal: false, tags: i % 7 === 0 ? ['beta'] : [], home_city: ['Seattle', 'London', 'Lisbon', 'Toronto'][i % 4], countries: i % 4 + (i % 2),
  fare_top: FARES[i % 6], party_max: (i % 4) + 1, source: ['instagram', 'google.com', null, 'tiktok'][i % 4],
}))

const AFF = ['Value', 'Comfort', 'Comfort', 'Premium', 'Luxury', null]
const insights = (m, i = Number(m.id.slice(-2))) => ({ ...m, traveller_type: ['Solo', 'Couple or pair', 'Family or group'][i % 3], affluence: AFF[i % 6],
  trip_style: ['Short breaks', 'Multi-city', 'Long trips', 'Mixed'][i % 4], planning_style: ['Early planner', 'Planner', 'Last-minute'][i % 3],
  persona: ['Organiser', 'Explorer', 'Linguist', 'Group planner'][i % 4], channel: ['Direct', 'Booking.com', 'Forwarded email', 'Expedia group'][i % 4],
  regions: [['Europe'], ['Asia', 'Europe'], ['Americas']][i % 3], trips_per_year: (i % 5) + 0.5, avg_trip_days: 4 + (i % 9), lead_days: 10 + i * 4,
  health: (i * 13) % 100, lifetime_value: i % 6 === 0 ? 2999 : null,
  next_action: ['Send a trip recap and the First Class offer', 'Check their bookings imported cleanly before they leave', 'Win-back: inspiration for their next trip', null][i % 4] })
const series = (n, f) => Array.from({ length: n }, (_, i) => ({ day: d10(i - n + 1), ...f(i) }))

const codes = [
  { id: 'c1', label: 'GOOSE30', is_batch: false, batch: null, codes: 1, kind: 'first_class', days: 30, lifetime: false, audience: 'anyone',
    max_uses: 100, starts_at: day(-12), ends_at: day(20), campaign: 'launch', note: 'Launch week', status: 'active', created_at: day(-12),
    uses: 23, members: 23, attempts: 31, still_first_class: 19, last_used: day(-0.2) },
  { id: 'c2', label: 'PARTNER-20261020-0910', is_batch: true, batch: 'PARTNER-20261020-0910', codes: 50, kind: 'first_class', days: 90, lifetime: false,
    audience: 'anyone', max_uses: 50, starts_at: day(-3), ends_at: null, campaign: 'blogger_oct', note: 'Travel blogger partnership', status: 'active',
    created_at: day(-3), uses: 7, members: 7, attempts: 9, still_first_class: 7, last_used: day(-1) },
  { id: 'c3', label: 'FOUNDERS20', is_batch: false, batch: null, codes: 1, kind: 'discount', discount_percent: 20, discount_duration: 'once',
    audience: 'anyone', max_uses: null, starts_at: day(-1), ends_at: null, campaign: 'founders', note: null, status: 'paused', created_at: day(-1),
    uses: 0, members: 0, attempts: 4, still_first_class: 0, last_used: null },
]

function member(id) {
  const m = members.find(x => x.id === id) || members[0]
  return {
    ...m, is_admin: false,
    account: { confirmed: true, last_sign_in: m.last_seen, providers: ['google'], banned_until: null, mfa: false },
    profile: { home_currency: 'USD', timezone: 'America/Los_Angeles', temp_unit: 'F' },
    attribution: m.source ? { utm_source: m.source, first_seen: m.joined } : null,
    trips: [
      { id: 't1', city: 'Lisbon', country: 'PT', start: d10(6), end: d10(13), status: 'planning', owner: true, bookings: 6, by_type: { flight: 2, hotel: 2, restaurant: 2 }, stops: 2, travellers: 2 },
      { id: 't2', city: 'Kyoto', country: 'JP', start: d10(-80), end: d10(-70), status: 'completed', owner: true, bookings: 9, by_type: { flight: 4, hotel: 3, activity: 2 }, stops: 3, travellers: 1 },
    ],
    fares: { economy: 3, premium: 2, basic: 1 },
    stats: { trips_created: 2, honks_used: 4 },
    usage: { guide_viewed: 14, booking_added: 11, honk_used: 4, translate_used: 2, checklist_generated: 1 },
    timeline: Array.from({ length: 12 }, (_, i) => ({ event: ['screen_view', 'booking_added', 'guide_viewed', 'active_time'][i % 4], screen: 'trip',
      props: i % 4 === 3 ? { path: 'trip/itinerary', seconds: 240 } : { path: 'trip/itinerary', type: 'flight' }, platform: m.platform, version: '0.20.0', ts: day(-i * 0.3) })),
    grants: m.plan === 'first_class' ? [{ id: 'g1', source: 'code', code: 'GOOSE30', reason: 'code', starts_at: day(-5), ends_at: day(25), live: true, created_at: day(-5) }] : [],
    codes: m.plan === 'first_class' ? [{ id: 'r1', code: 'GOOSE30', redeemed_at: day(-5), ended_at: null }] : [],
    code_attempts: [{ code: 'GOOSE3O', result: 'invalid', ts: day(-5.01) }],
    moderation: m.status === 'restricted' ? [{ id: 'm1', level: 'restricted', reason: 'ai_abuse', note: '600 AI calls in an hour', starts_at: day(-1), ends_at: day(6), live: true, created_at: day(-1) }] : [],
    notes: [{ id: 1, body: 'Wrote in about a missing flight import from Iberia. Fixed the parser, replied.', pinned: true, created_at: day(-4) }],
    audit: [{ action: 'note.add', detail: {}, ts: day(-4) }],
  }
}

export default async function demo(name, args) {
  await new Promise(r => setTimeout(r, 150))
  switch (name) {
    case 'admin_whoami': return { is_admin: true, role: 'owner', aal: 'aal2', has_factor: true }
    case 'admin_pulse': {
      const n = Math.max(1, (new Date(args.p_to) - new Date(args.p_from)) / 86400000 + 1)
      return { online_now: 3, signups: 14, signups_prev: 9, active: 41, active_prev: 33, sessions: 160, sessions_prev: 120, trips: 22, trips_prev: 25,
        bookings: 96, bookings_prev: 71, errors: 6, errors_prev: 11, ai_calls: 820, ai_calls_prev: 610, codes_used: 30, first_class: 26, members: 312, function_errors: 2,
        series: series(n, i => ({ signups: (i * 7) % 4, active: 8 + ((i * 5) % 9), bookings: (i * 3) % 7, errors: i % 5 === 0 ? 2 : 0 })) }
    }
    case 'admin_needs_you': return { items: [
      { key: 'errors:x', priority: 1, tab: 'product', title: '9 errors in the last 24 hours', detail: 'About 2.1 a day is normal. Open Product to see which screens and versions.' },
      { key: 'welcome:x', priority: 2, tab: 'members', filter: 'new', title: '14 new members this week', detail: 'Say hello while it\'s fresh. A personal note from the founder converts better than any campaign.' },
      { key: 'just_back:x', priority: 2, tab: 'members', filter: 'just_back', title: '5 members are just back from a trip', detail: 'Best moment for a recap, a share ask or the First Class offer.' },
      { key: 'code_cap:c1', priority: 2, tab: 'money', code: 'c1', title: 'Code GOOSE30 has 83 of 100 uses', detail: 'Raise the limit or let it run out.' },
      { key: 'no_test:x', priority: 2, tab: 'experiments', title: 'No conversion test running', detail: 'The experiments engine is build step 4. Until then, note test ideas in Up next.' },
      { key: 'own:1', priority: 2, title: 'Reply to the travel blogger about the partner codes', own: true },
      { key: 'getting_ready:x', priority: 3, tab: 'members', filter: 'getting_ready', title: '3 members leave within 7 days', detail: 'Check their imports worked and nothing in their plan is broken.' },
    ], done_recent: [{ key: 'd1', title: 'Code PARTNER batch sent to the blogger', status: 'done', at: day(-1) }] }
    case 'admin_members': return members.filter(m => !args.p_search || `${m.name} ${m.email}`.toLowerCase().includes(args.p_search.toLowerCase()))
    case 'admin_member': return member(args.p_user)
    case 'admin_members_plus': return members.filter(m => !args.p_search || `${m.name} ${m.email}`.toLowerCase().includes(args.p_search.toLowerCase())).map(insights)
    case 'admin_member_insights': return { ...insights(members.find(m => m.id === args.p_user) || members[0]), affluence_why: ['Flies premium', 'Hotel ~$240/night', 'Status: Marriott Bonvoy Gold'], affluence_signals: 5, active_days_30: 9, sessions_30: 14, active_min_30: 96 }
    case 'admin_audience': {
      const rows = members.map(insights)
      const dist = (k) => Object.entries(rows.reduce((a, r) => { for (const v of (k === 'region' ? r.regions : [r[k] ?? 'Not known yet'])) a[v] = (a[v] || 0) + 1; return a }, {}))
        .map(([value, n]) => ({ value, n })).sort((x, y) => y.n - x.n)
      return { members: rows.length, with_trips: 14, avg_trips_per_year: 2.6, avg_trip_days: 7.4, avg_lead_days: 41, avg_health: 46,
        premium_or_better_pct: 38, affluence_known: 13, paying: 3, lifetime_value: 8997,
        dist: Object.fromEntries(['traveller_type', 'affluence', 'trip_style', 'planning_style', 'persona', 'channel', 'region', 'source', 'platform'].map(k => [k, dist(k)])) }
    }
    case 'admin_context': return { sessions: 160, dist: { os: [{ value: 'ios', n: 70 }, { value: 'android', n: 41 }, { value: 'mac', n: 30 }, { value: 'windows', n: 19 }],
      display: [{ value: 'browser', n: 90 }, { value: 'app', n: 41 }, { value: 'installed', n: 29 }], screen: [{ value: 'phone', n: 118 }, { value: 'desktop', n: 42 }],
      return_gap: [{ value: 'Within a week', n: 80 }, { value: 'Same day', n: 50 }, { value: 'First session on device', n: 30 }],
      lang: [{ value: 'en-US', n: 100 }, { value: 'en-GB', n: 30 }, { value: 'es-ES', n: 20 }], tz: [{ value: 'America/Los_Angeles', n: 60 }, { value: 'Europe/London', n: 40 }],
      theme: [{ value: 'light', n: 110 }, { value: 'dark', n: 50 }], net: [{ value: '4g', n: 140 }, { value: '3g', n: 20 }] } }
    case 'stripe:status': return { configured: true, livemode: false, sync: { last_sync: day(-0.01), ok: true } }
    case 'stripe:sync': return { skipped: true }
    case 'stripe:code_push': return { promo: 'promo_demo' }
    case 'admin_stripe': return { sync: { last_sync: day(-0.01), ok: true, livemode: false }, customers: 9, matched_customers: 8, active_subscriptions: 6, past_due: 1, canceling: 1,
      arr: 8994, lifetime_sold: 11, lifetime_sold_period: 4, gross: 25480, refunded: 1499, failed: 2, disputes: 0, discounts: 1200, new_subscriptions: 3,
      cancellations: 1, checkout_started: 21, checkout_completed: 9,
      daily: series(30, i => ({ gross: i % 4 === 0 ? 2999 : i % 5 === 0 ? 1499 : 0 })),
      payments: members.slice(0, 8).map((m, i) => ({ id: `ch_${i}`, amount: i % 2 ? 2999 : 1499, refunded: 0, currency: 'usd', status: i === 3 ? 'failed' : 'succeeded',
        plan: i % 2 ? 'lifetime' : 'yearly', created: day(-i * 2), user_id: m.id, email: m.email, failure: i === 3 ? 'card_declined' : null })),
      subscriptions: members.slice(0, 6).map((m, i) => ({ id: `sub_${i}`, status: i === 2 ? 'past_due' : 'active', amount: 1499, currency: 'usd', interval: 'year',
        renews: day(300 - i * 20), canceling: i === 4, created: day(-60 + i), user_id: m.id, email: m.email, promotion_code: i === 1 ? 'promo_x' : null })) }
    case 'admin_code_stripe': return { promotion: { times_redeemed: 5, active: true }, checkouts: 5, revenue: 5996, discount_given: 1499, subscriptions_active: 4, subscriptions_canceled: 1 }
    case 'admin_status_impact': return { plan: 'free', live_grants: 0, store_subscription: null, shared_trips: 1, travellers_on_them: 2, pending_invites: 1, is_admin: false, status: 'active' }
    case 'admin_usage': return {
      active: 41, active_free: 33, active_first_class: 8, sessions: 160,
      features: [['guide_viewed', 31, 220], ['booking_added', 27, 96], ['trip_created', 19, 22], ['honk_used', 14, 40], ['translate_used', 9, 18],
        ['checklist_generated', 8, 9], ['currency_converted', 6, 15], ['idea_added', 5, 12], ['sos_opened', 2, 2], ['get_there', 1, 1]]
        .map(([event, users, uses]) => ({ event, users, uses, pct: Math.round(users / 41 * 100), free_users: Math.round(users * 0.75), fc_users: Math.round(users * 0.25) })),
      screens: [['trips', 410, 39, 18000], ['trip/itinerary', 330, 33, 26000], ['explore/guide', 210, 28, 21000], ['tools', 90, 20, 3000], ['explore/honk', 60, 14, 4200], ['profile', 44, 18, 900]]
        .map(([path, views, users, seconds]) => ({ path, views, users, seconds })),
      active_time: { seconds: 73100, sessions: 160, per_session_min: 7.6, since: day(-6) },
      errors: [{ event: 'ai_error', kind: 'guide', screen: 'guide', version: '0.20.0', platform: 'web', n: 4, users: 3, last: day(-0.3) },
        { event: 'app_error', kind: 'TypeError', screen: 'trip', version: '0.20.0', platform: 'android', n: 2, users: 1, last: day(-1) }],
      platforms: { web: 30, android: 11 }, versions: { '0.20.0': 38, '0.19.0': 3 },
      daily: series(30, i => ({ events: 150 + ((i * 37) % 90), users: 8 + (i % 9) })),
    }
    case 'admin_system': return {
      function_errors: [{ fn: 'generate-guide', kind: 'timeout', status: 504, n: 2, last: day(-0.5) }],
      ai_usage: [{ day: d10(0), kind: 'ai', calls: 120, users: 9 }, { day: d10(0), kind: 'guide', calls: 34, users: 5 }],
      quota_hits: 1, flags: [{ user_id: members[7].id, level: 'restricted', reason: 'ai_abuse', ends_at: day(6) }],
      audit: [{ action: 'status.restricted', target: members[7].id, email: members[7].email, detail: { reason: 'ai_abuse' }, ts: day(-1) },
        { action: 'code.create', target: null, email: null, detail: { count: 50, batch: 'PARTNER-20261020-0910' }, ts: day(-3) }],
      admins: [{ email: 'owner@example.com', role: 'owner', added_at: day(-1) }],
    }
    case 'admin_codes': return codes
    case 'admin_code_report': return {
      codes: [{ id: 'x1', code: 'GOOSE30', status: 'active', uses: 23 }],
      daily: series(12, i => ({ uses: (i * 3) % 5 })).map(x => ({ day: x.day, uses: x.uses })),
      attempts: { ok: 23, invalid: 5, already_used: 2, rate_limited: 1 },
      redemptions: members.slice(0, 6).map((m, i) => ({ id: `r${i}`, user_id: m.id, email: m.email, code: 'GOOSE30', redeemed_at: day(-i), ended_at: null, plan_now: 'first_class' })),
    }
    case 'admin_code_create': return { codes: args.p_count > 1 ? Array.from({ length: args.p_count }, (_, i) => `DEMO-${i}`) : [args.p.code || 'DEMO1'], batch: args.p_count > 1 ? 'DEMO-BATCH' : null }
    default: return null
  }
}
