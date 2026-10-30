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
  health: (i * 13) % 100, lifetime_value: i % 6 === 0 ? 2999 : null, is_me: i === 0,
  country: ['US', 'GB', 'PT', 'CA', 'DE', null][i % 6], area: ['Los Angeles', 'London', 'Lisbon', 'Toronto', 'Berlin', ''][i % 6], location_from: 'first session', tz: 'America/Los_Angeles',
  platforms: [['web', 'android'], ['android'], ['web'], ['ios', 'web'], ['web (installed)', 'android'], []][i % 6], main_platform: [['web'], ['android'], ['web'], ['ios'], ['web (installed)'], [null]][i % 6][0],
  platform_mix: ['android + web', 'android', 'web', 'ios + web', 'android + web', ''][i % 6], offers: true, emails_ok: i % 3 === 0,
  next_action: ['Send a trip recap and the First Class offer', 'Check their bookings imported cleanly before they leave', 'Win-back: inspiration for their next trip', null][i % 4] })
const demoSettings = {
  founders_offer: { active: true, _updated_at: day(-1) },
  free_limits: { enabled: false, trips_on: true, reservations_on: true, imports_on: true, upcoming_trips: 2, reservations_per_trip: 5, email_imports: 5, _updated_at: day(-1) },
  ai_limits: { ai_daily: 100, guide_daily: 40, _updated_at: day(-1) },
  google_limits: { per_user_daily: 5000, _updated_at: day(-1) },
  kill: { ai_paused: false, google_paused: false, _updated_at: day(-1) },
  beta: { web_url: 'https://sillytraveltool.com/', show_web: true, show_ios: false, show_android: false, redirect_on: false, _updated_at: day(-1) },
  cost_alert: { daily_usd: 10, email_usd: 50, flag_ai: 300, flag_guide: 150, flag_google: 1500, email_ai: 1000, email_guide: 400, email_google: 5000, last_sent_day: d10(-3), _updated_at: day(-1) },
  cost_rates: { ai_call: 0.0015, guide_section: 0.004, supabase_monthly: 25, hosting_monthly: 4, _updated_at: day(-1),
    ai_prices: { 'deepseek-chat': { input: 0.28, cached_input: 0.028, output: 0.42 }, 'gemini-2.5-flash': { input: 0.3, cached_input: 0.075, output: 2.5 } },
    google: { autocomplete: 0.00283, place_details: 0.017, text_search: 0.032, nearby: 0.032, photo: 0.007, routes: 0.005, geocode: 0.005, timezone: 0.005, static_map: 0.002, other: 0.005 } },
}
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
      { key: 'cost_day:x', priority: 1, tab: 'money', title: 'AI + Google spend today is about $12.40', detail: 'Over your $10.00 alert level. Money → Costs shows who and what; the kill switches are in Controls.' },
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
    case 'admin_usage_activity': {
      const n = args.p_days === 30 ? 30 : 7
      const k = n === 30 ? 3.4 : 1
      const row = (i, extra) => ({ user_id: members[i].id, email: members[i].email, joined: members[i].joined, last_seen: members[i].last_seen, plan: members[i].plan,
        internal: false, ai_calls: 0, ai_today: 0, forwarded_imports: 0, in_app_imports: 0, google_calls: 0, errors: 0, inbox_cap_hits: 0, inbox_days_over: 0,
        import_blocks: 0, inbox_refusals: 0, flags: [], ...extra })
      const list = [
        row(3, { ai_calls: Math.round(212 * k), ai_today: 104, forwarded_imports: 6, in_app_imports: 2, google_calls: 480, errors: 3, flags: ['over_ai_limit', 'far_above_median'] }),
        row(0, { ai_calls: Math.round(96 * k), ai_today: 22, forwarded_imports: 9, in_app_imports: 1, google_calls: 210, inbox_cap_hits: 2, inbox_days_over: 2, flags: ['inbox_cap'] }),
        row(6, { ai_calls: Math.round(31 * k), ai_today: 4, inbox_refusals: 2, forwarded_imports: 3, google_calls: 60, errors: 1 }),
        row(2, { ai_calls: Math.round(18 * k), ai_today: 0, forwarded_imports: 1, in_app_imports: 4, google_calls: 12, import_blocks: 3, flags: ['free_import_blocked'] }),
        row(9, { ai_calls: Math.round(9 * k), ai_today: 2, in_app_imports: 1, google_calls: 33 }),
        row(14, { ai_calls: Math.round(4 * k), google_calls: 5 }),
        row(5, { ai_calls: 0 }),
      ]
      return { days: n, from: d10(1 - n), limits: { ai_daily: 100, guide_daily: 40, inbox_daily: 30 }, median_ai_calls: 18 * k,
        far_above_rule: 'AI calls in the window at least 5 x the median of members with any AI call, and at least 50', members: list,
        recent: [
          { id: 3, kind: 'inbox_cap_hit', fn: 'receive-booking-email', ts: day(-0.05), user_id: members[0].id, email: members[0].email },
          { id: 2, kind: 'free_import_blocked', fn: 'receive-booking-email', ts: day(-0.4), user_id: members[2].id, email: members[2].email },
          { id: 4, kind: 'inbox_quota_refused', fn: 'receive-booking-email', ts: day(-0.8), user_id: members[6].id, email: members[6].email },
          { id: 1, kind: 'inbox_cap_hit', fn: 'receive-booking-email', ts: day(-1.2), user_id: members[0].id, email: members[0].email },
        ] }
    }
    case 'admin_audience': {
      const rows = members.map(insights)
      const dist = (k) => Object.entries(rows.reduce((a, r) => { for (const v of (k === 'region' ? r.regions : [r[k] ?? 'Not known yet'])) a[v] = (a[v] || 0) + 1; return a }, {}))
        .map(([value, n]) => ({ value, n })).sort((x, y) => y.n - x.n)
      return { members: rows.length, with_trips: 14, avg_trips_per_year: 2.6, avg_trip_days: 7.4, avg_lead_days: 41, avg_health: 46,
        premium_or_better_pct: 38, affluence_known: 13, paying: 3, lifetime_value: 8997,
        dist: Object.fromEntries(['traveller_type', 'affluence', 'trip_style', 'planning_style', 'persona', 'channel', 'region', 'source', 'country', 'main_platform', 'platform_mix'].map(k => [k, dist(k)])), multi_platform: 9, located: 15 }
    }
    case 'admin_context': return { sessions: 160, dist: { os: [{ value: 'ios', n: 70 }, { value: 'android', n: 41 }, { value: 'mac', n: 30 }, { value: 'windows', n: 19 }],
      display: [{ value: 'browser', n: 90 }, { value: 'app', n: 41 }, { value: 'installed', n: 29 }], screen: [{ value: 'phone', n: 118 }, { value: 'desktop', n: 42 }],
      return_gap: [{ value: 'Within a week', n: 80 }, { value: 'Same day', n: 50 }, { value: 'First session on device', n: 30 }],
      lang: [{ value: 'en-US', n: 100 }, { value: 'en-GB', n: 30 }, { value: 'es-ES', n: 20 }], tz: [{ value: 'America/Los_Angeles', n: 60 }, { value: 'Europe/London', n: 40 }],
      theme: [{ value: 'light', n: 110 }, { value: 'dark', n: 50 }], net: [{ value: '4g', n: 140 }, { value: '3g', n: 20 }] } }
    case 'admin_email_templates': return [
      { key: 'recap', name: 'Trip recap (just back)', kind: 'marketing', subject: 'Welcome back from {{last_trip_city}}', body: 'Hi {{first_name}},\n\nWelcome home from {{last_trip_city}}. {{last_trip_days}} days, all in one place.\n\nYour recap is ready in the app.', cta_label: 'See your recap', cta_url: '{{app_url}}', updated_at: day(-1) },
      { key: 'win_back', name: 'Win-back (lapsed)', kind: 'marketing', subject: 'Where to next, {{first_name}}?', body: 'Hi {{first_name}},\n\nIt has been a while.', cta_label: 'Start a trip', cta_url: '{{app_url}}', updated_at: day(-1) },
      { key: 'welcome', name: 'Welcome note (new member)', kind: 'service', subject: 'Welcome to Silly Travel Tool', body: 'Hi {{first_name}},\n\nThanks for signing up.', cta_label: 'Open the app', cta_url: '{{app_url}}', updated_at: day(-1) },
      { key: 'notice_warning', name: 'Account warning', kind: 'service', subject: 'About your Silly Travel Tool account', body: '{{message}}', updated_at: day(-1) },
    ]
    case 'admin_email_log': return { opted_in: 7, members: 18, sent_30d: 12, by_template: { recap: 5, welcome: 6, notice_warning: 1 },
      sends: members.slice(0, 6).map((m, i) => ({ id: i, user_id: m.id, email: m.email, template: ['recap', 'welcome', 'win_back'][i % 3], kind: 'marketing',
        subject: 'Welcome back from Lisbon', status: i === 4 ? 'skipped' : 'sent', reason: i === 4 ? "Hasn't opted in to emails" : null, campaign: i < 3 ? 'recap_oct' : null, created_at: day(-i) })) }
    case 'email:check': return { kind: 'marketing', eligible: Math.max(1, (args.user_ids?.length || 13) - 2), skipped: [{ email: 'jade@example.com', reason: "Hasn't opted in to emails" }, { email: 'ivan@example.com', reason: 'Unsubscribed' }] }
    case 'email:preview': return { kind: 'marketing', subject: 'Welcome back from Lisbon', html: '<table><tr><td style="background:#FFFDF9;border-radius:22px;padding:24px"><p style="margin:0 0 16px;font-size:16px;color:#2A2520">Hi Ana,</p><p style="margin:0 0 16px;font-size:16px;color:#2A2520">Welcome home from Lisbon. 7 days, all in one place.</p><p><a style="display:inline-block;background:#B24A17;color:#FFFDF9;padding:12px 22px;border-radius:14px;text-decoration:none;font-weight:600">See your recap</a></p></td></tr></table>' }
    case 'email:send': return { sent: 11, failed: 0, skipped: 2 }
    case 'admin_experiments': return { traffic: { paywall: 18, paywall_estimated: true, pricing: 4, onboarding: 6, trip_planning: 22, explore: 15, email: 7, other: 30, website: null, website_note: 'needs GA4 visits (build step 3)', active: 30, signups: 6 },
      experiments: [
        { id: 'x1', key: 'founders_badge_on_the_paywall_1a2b', metric_event: 'purchase_completed', name: 'Founders badge on the paywall', status: 'running', surface: 'paywall', audience: 'everyone', hypothesis: 'If the paywall shows a "Founders, limited time" badge, more people buy lifetime, because scarcity makes the offer feel time-bound.', primary_metric: 'paywall → purchase rate', guardrail: 'refund rate', baseline_rate: 0.04, min_effect: 0.6, traffic_share: 1, variants: [{ key: 'control', name: 'Today', weight: 50 }, { key: 'b', name: 'Founders badge', weight: 50 }], started_at: day(-9), ice_impact: 7, ice_confidence: 6, ice_ease: 9 },
        { id: 'x2', name: 'Recap email with a share card', status: 'queued', queue_position: 1, surface: 'email', audience: 'just back', hypothesis: 'If the recap email includes a share card, more members share their trip, because it is one tap.', primary_metric: 'recap shares', guardrail: 'unsubscribes', baseline_rate: 0.08, min_effect: 0.5, traffic_share: 1, variants: [{ key: 'control', name: 'Plain recap', weight: 50 }, { key: 'b', name: 'With share card', weight: 50 }], ice_impact: 5, ice_confidence: 5, ice_ease: 8 },
        { id: 'x3', name: 'Yearly first on the paywall', status: 'queued', queue_position: 2, surface: 'paywall', audience: 'everyone', hypothesis: 'If yearly is shown first, more people pick yearly.', primary_metric: 'paywall → purchase rate', guardrail: 'refunds', baseline_rate: 0.04, min_effect: 0.5, traffic_share: 1, variants: [{ key: 'control', name: 'Lifetime first', weight: 50 }, { key: 'b', name: 'Yearly first', weight: 50 }], ice_impact: 6, ice_confidence: 4, ice_ease: 9 },
        { id: 'x4', name: 'Onboarding: forward one email first', status: 'draft', surface: 'onboarding', audience: 'new members', updated_at: day(-1), variants: [] },
        { id: 'x5', name: 'Trip limit message wording', status: 'done', surface: 'trip_planning', decision: 'ship', learnings: 'Saying what First Class unlocks beat saying what is blocked.', started_at: day(-60), ended_at: day(-30), variants: [] },
      ] }
    case 'experiment:ai': return { reply: args.messages?.length ? 'Good. Who should see it: everyone who opens the paywall, or only free members who just hit the trip limit? And what share buys today, roughly?' : 'Hi! What would you like more people to do? For example: upgrade after hitting a limit, finish their first trip, or come back after a trip.',
      draft: args.messages?.length ? { name: 'Upgrade prompt after the trip limit', surface: 'paywall', primary_metric: 'paywall → purchase rate', guardrail: '7-day retention', baseline_rate: 0.04, min_effect: 0.5 } : {}, done: false }
    case 'admin_experiment_save': return 'x9'
    case 'admin_cohorts': return [
      { id: 'c1', name: 'Premium travellers just back', kind: 'rules', rules: { affluence: 'Premium', stage: 'just_back' }, fixed_count: 0, created_at: day(-20),
        now: { size: 6, active_7d: 4, paying: 2, emails_ok: 3, avg_health: 58 }, history: series(20, i => ({ size: 2 + Math.floor(i / 5), active_7d: 1, paying: 1 })) },
      { id: 'c2', name: 'Beta testers', kind: 'fixed', rules: {}, fixed_count: 8, created_at: day(-40), now: { size: 8, active_7d: 5, paying: 3, emails_ok: 6, avg_health: 64 }, history: [] },
    ]
    case 'admin_cohort_members': return members.slice(0, 6).map(insights)
    case 'admin_cohort_preview': return { size: 7, emails_ok: 3 }
    case 'admin_cohort_save': return 'c9'
    case 'admin_experiment_readout': return { metric_event: 'purchase_completed', variants: [{ variant: 'control', assigned: 64, exposed: 51, converted: 2 }, { variant: 'b', assigned: 61, exposed: 49, converted: 5 }] }
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
    case 'admin_costs': return {
      days: 30, variable: 4.82, variable_all: 6.1, fixed: 29, total: 33.82, ai_usd: 1.94, guide_usd: 0.88, google_usd: 2.0,
      ai_calls: 1293, guide_calls: 220, google_calls: 410, active_members: 14, paying_members: 3, per_active: 0.3443, per_paying: 11.27,
      gross: 119.94, refunded: 0, margin: 84.84, today: 0.42, today_threshold: 10,
      daily: series(30, i => { const ai = 0.03 + ((i * 7) % 5) * 0.01, guide = (i % 4) * 0.01, google = 0.04 + ((i * 3) % 6) * 0.01
        return { ai, guide, google, total: ai + guide + google, ai_calls: Math.round(ai / 0.0015), guide_calls: Math.round(guide / 0.004), google_calls: 12 + i } }),
      google_endpoints: [['text_search', 31, 0.99], ['place_details', 44, 0.75], ['autocomplete', 260, 0.74], ['photo', 52, 0.36], ['routes', 15, 0.08], ['geocode', 8, 0.04]]
        .map(([endpoint, calls, usd]) => ({ endpoint, calls, usd })),
      top_members: [{ user_id: '00000000-0000-0000-0000-000000000000', email: null, system: true, internal: false, plan: 'free', ai_calls: 0, guide_calls: 0, google_calls: 22, usd: 0.11, max_ai_day: 0, max_google_day: 6 },
        ...members.slice(0, 8).map((m, i) => ({ user_id: m.id, email: m.email, system: false, internal: false, plan: m.plan, ai_calls: 220 - i * 25, guide_calls: 40 - i * 4,
          google_calls: 90 - i * 9, usd: Number((0.9 - i * 0.1).toFixed(2)), max_ai_day: 60 - i * 6, max_google_day: 30 - i * 3 }))],
      flags: [{ day: d10(-2), user_id: members[3].id, kind: 'ai', calls: 342, email: members[3].email }],
      last_24h: { ai_members: 6, ai_calls: 141, google_members: 5, google_calls: 37 },
    }
    case 'admin_financials': return {
      days: 30,
      stripe: { connected: true, livemode: false, gross: 119.94, refunds: -29.99, disputes: 0, processing_fees: -4.95, stripe_fees: -0.84, other: 0, net: 84.16, payouts: 50,
        fee_lines: [{ label: 'Stripe processing fees', amount: -4.95 }, { label: 'Billing - Usage Fee (2026-10-01 - 2026-10-31)', amount: -0.84 }],
        discounts: 14.99, transactions: 9, balance: { available: 1210, pending: 2735, currency: 'usd', at: day(-0.05) }, last_sync: day(-0.01), currencies: ['usd'] },
      stores: { connected: false, note: 'App Store and Google Play sales arrive with the native apps (RevenueCat). Apple and Google keep 15% (small business programmes).' },
      revenue_net: 84.16,
      costs: { ai: 0.31, guides: 0.12, google: 2.0, fixed: [{ label: 'Supabase', amount: 25, source: 'monthly amount in Controls, prorated' }, { label: 'Hosting (Hostinger)', amount: 4, source: 'monthly amount in Controls, prorated' }],
        fixed_total: 29, total: 31.43, missing: [
          { key: 'google_billing', label: 'Google Cloud actual bill (Maps + Gemini)', detail: 'Using calls × list price until the billing export is connected.' },
          { key: 'resend', label: 'Resend (email)', detail: 'Free plan today; add it to the fixed costs when you upgrade.' },
          { key: 'stores', label: 'App Store and Google Play', detail: 'Developer fees and store commission are not counted yet.' }] },
      ai: { by_provider: [{ provider: 'deepseek', model: 'deepseek-flash', calls: 412, failed: 0, input_tokens: 380000, cached_tokens: 120000, output_tokens: 210000, usd: 0.17 },
          { provider: 'gemini', model: 'gemini-2.5-flash', calls: 9, failed: 0, input_tokens: 42000, cached_tokens: 0, output_tokens: 9000, usd: 0.0351 }],
        by_feature: [['generate-guide', 120, 0.12, 1900], ['parse-booking-email', 64, 0.09, 1400], ['receive-booking-email', 40, 0.06, 1500], ['generate-phrases', 150, 0.03, 600], ['goosey-discover', 47, 0.02, 900]]
          .map(([feature, calls, usd, avg_tokens]) => ({ feature, calls, usd, avg_tokens })), logged_since: d10(-20), estimated_days: 10 },
      deepseek: { connected: true, latest: { ts: day(-0.02), currency: 'USD', total: 19.62, granted: 0, topped_up: 19.62 }, spent: 0.17, tracked_since: day(-20), tokens_usd: 0.17 },
      profit: 52.73,
      daily: series(30, i => ({ net: i % 4 === 0 ? 28.82 : i % 7 === 0 ? 14.26 : 0, costs: 1.05 })),
    }
    case 'admin_free_plan': return {
      settings: { ...demoSettings.free_limits }, members: 18, free: 15, first_class: 3, paywall_views_30d: 24, limit_hits_30d: { trips: 3, imports: 2 },
      histograms: {
        trips: [{ n: 0, members: 6 }, { n: 1, members: 5 }, { n: 2, members: 3 }, { n: 3, members: 1 }],
        reservations: [{ n: 0, members: 8 }, { n: 1, members: 2 }, { n: 2, members: 2 }, { n: 4, members: 1 }, { n: 6, members: 1 }, { n: 9, members: 1 }],
        imports: [{ n: 0, members: 9 }, { n: 1, members: 2 }, { n: 3, members: 1 }, { n: 5, members: 2 }, { n: 22, members: 1 }],
      },
    }
    case 'admin_alerts': return { items: [
      { key: 'cost_day:x', kind: 'cost', tab: 'money', title: 'AI + Google spend today is about $12.40', detail: 'Over your $10.00 alert level. You get an email only past $50.00. Money → Costs shows who and what; the kill switches are in Controls.' },
    ] }
    case 'admin_settings': return demoSettings
    case 'admin_setting_set': {
      const old = demoSettings[args.p_key] || {}
      demoSettings[args.p_key] = { ...old, ...args.p_value, ...(args.p_value.google ? { google: { ...old.google, ...args.p_value.google } } : {}), _updated_at: day(0) }
      return demoSettings[args.p_key]
    }
    case 'cost:test': return { sent: true, today: 0.42, flags: 0, test: true }
    case 'admin_beta': return {
      total: 214, in_window: 188, unsubscribed: 3, series: series(30, i => ({ value: i > 20 ? (i * 7) % 23 + 4 : 0 })).map(x => ({ day: x.day, value: x.value })),
      platforms: [{ platform: 'ios', total: 121, waiting: 121, sent: 0, failed: 0, sending: 0 }, { platform: 'android', total: 58, waiting: 58, sent: 0, failed: 0, sending: 0 },
        { platform: 'web', total: 35, waiting: 30, sent: 4, failed: 1, sending: 0 }],
      sources: [{ label: 'instagram', value: 102 }, { label: 'tiktok', value: 71 }, { label: 'Direct or unknown', value: 29 }, { label: 'share', value: 12 }],
      frequency: [{ label: 'few_year', value: 96 }, { label: 'not_given', value: 61 }, { label: 'monthly', value: 38 }, { label: 'rarely', value: 12 }, { label: 'weekly', value: 7 }],
      settings: { ...demoSettings.beta },
    }
    case 'admin_beta_rows': return [{ id: 1, email: 'ana@example.com', platform: 'ios', travel_frequency: 'monthly', utm_source: 'instagram', created_at: day(-2), invite_status: 'waiting' }]
    case 'admin_beta_settings_set': demoSettings.beta = { ...demoSettings.beta, ...args.p_value, _updated_at: day(0) }; return demoSettings.beta
    case 'beta:test': return { sent: 1, to: 'owner@example.com', platforms: ['web'] }
    case 'beta:send': return { sent: 30, failed: 0, by_platform: { web: { sent: 30, failed: 0 } }, skipped_no_link: ['ios', 'android'] }
    case 'beta:release': return { released: 0 }
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
