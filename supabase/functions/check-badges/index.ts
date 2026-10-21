import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// check-badges — called by the client on SIGNED_IN. Always evaluates the
// caller (JWT user); any user_id in the body is ignored. goose_score is
// owned by recompute_user_stats() in the DB (badge points included), so
// this function never writes the score itself.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

type Ctx = { stats: any; activities: number; longestFlightHours: number; collabCount: number }

const BADGES: Record<string, { name: string; tier: 'easy' | 'medium' | 'hard' | 'legendary'; earned: (c: Ctx) => boolean }> = {
  first_trip:       { name: 'First Trip',       tier: 'easy',      earned: c => (c.stats.trips_created || 0) >= 1 },
  wheels_up:        { name: 'Wheels Up',        tier: 'easy',      earned: c => (c.stats.total_flights || 0) >= 1 },
  first_pin:        { name: 'First Pin',        tier: 'easy',      earned: c => c.activities >= 1 },
  packing_pro:      { name: 'Packing Pro',      tier: 'easy',      earned: c => (c.stats.packing_completed || 0) >= 1 },
  money_goose:      { name: 'Money Goose',      tier: 'easy',      earned: c => (c.stats.currency_lookups || 0) >= 1 },
  first_honk:       { name: 'First Honk',       tier: 'easy',      earned: c => (c.stats.honks_used || 0) >= 1 },
  ocean_crosser:    { name: 'Ocean Crosser',    tier: 'medium',    earned: c => c.longestFlightHours >= 8 },
  foodie_goose:     { name: 'Foodie Goose',     tier: 'medium',    earned: c => (c.stats.restaurants_added || 0) >= 10 },
  culture_vulture:  { name: 'Culture Vulture',  tier: 'medium',    earned: c => (c.stats.museums_visited || 0) >= 5 },
  continent_hopper: { name: 'Continent Hopper', tier: 'medium',    earned: c => (c.stats.countries_visited || 0) >= 3 },
  travel_squad:     { name: 'Travel Squad',     tier: 'medium',    earned: c => c.collabCount >= 1 },
  planner_goose:    { name: 'Planner Goose',    tier: 'medium',    earned: c => (c.stats.trips_completed || 0) >= 5 },
  world_citizen:    { name: 'World Citizen',    tier: 'hard',      earned: c => (c.stats.countries_visited || 0) >= 15 },
  seven_summits:    { name: 'Seven Summits',    tier: 'hard',      earned: c => (c.stats.countries_visited || 0) >= 7 },
  jet_set:          { name: 'Jet Set',          tier: 'hard',      earned: c => (c.stats.total_flights || 0) >= 25 },
  michelin_goose:   { name: 'Michelin Goose',   tier: 'hard',      earned: c => (c.stats.splurge_restaurants || 0) >= 5 },
  road_warrior:     { name: 'Road Warrior',     tier: 'hard',      earned: c => (c.stats.days_abroad || 0) >= 100 },
  everywhere_goose: { name: 'Everywhere Goose', tier: 'legendary', earned: c => (c.stats.countries_visited || 0) >= 50 },
  perfect_planner:  { name: 'Perfect Planner',  tier: 'legendary', earned: c => (c.stats.trips_completed || 0) >= 10 },
}

const TIER_POINTS = { easy: 10, medium: 25, hard: 50, legendary: 100 }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No auth' }, 401)

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)
    const userId = user.id

    // Fresh stats first: trips become "completed" by date without any row change.
    const { error: recomputeErr } = await supabase.rpc('recompute_user_stats', { p_user_id: userId })
    if (recomputeErr) console.error('recompute_user_stats failed:', recomputeErr.message)

    const [statsRes, earnedRes, flightsRes, activitiesRes, collabRes] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', userId).single(),
      supabase.from('user_badges').select('badge_id').eq('user_id', userId),
      supabase.from('bookings').select('departure_time, arrival_time').eq('created_by', userId).eq('type', 'flight'),
      supabase.from('trip_activities').select('id', { count: 'exact', head: true }).eq('created_by', userId),
      supabase.from('trip_collaborators').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('status', 'accepted').neq('role', 'owner'),
    ])

    for (const r of [statsRes, earnedRes, flightsRes, activitiesRes, collabRes]) {
      if (r.error) return json({ error: r.error.message }, 500)
    }
    if (!statsRes.data) return json({ error: 'No stats found' }, 404)

    // Flight duration from stored ISO timestamps (both carry timezone offsets).
    const longestFlightHours = Math.max(0, ...(flightsRes.data || []).map((f: any) => {
      if (!f.departure_time || !f.arrival_time) return 0
      const hours = (new Date(f.arrival_time).getTime() - new Date(f.departure_time).getTime()) / 3_600_000
      return Number.isFinite(hours) && hours > 0 && hours < 24 ? hours : 0
    }))

    const ctx: Ctx = {
      stats: statsRes.data,
      activities: activitiesRes.count || 0,
      longestFlightHours,
      collabCount: collabRes.count || 0,
    }

    const already = new Set((earnedRes.data || []).map((b: any) => b.badge_id))
    const newBadges = Object.entries(BADGES)
      .filter(([id, b]) => !already.has(id) && b.earned(ctx))
      .map(([id]) => id)

    if (newBadges.length > 0) {
      const rows = newBadges.map(id => ({
        user_id: userId,
        badge_id: id,
        badge_name: BADGES[id].name,
        badge_tier: BADGES[id].tier,
        unlocked_at: new Date().toISOString(),
      }))
      // ignoreDuplicates: two concurrent sign-ins must not fail on the unique key
      const { error: insertErr } = await supabase.from('user_badges')
        .upsert(rows, { onConflict: 'user_id,badge_id', ignoreDuplicates: true })
      if (insertErr) {
        console.error('Badge insert failed:', insertErr.message)
        return json({ error: insertErr.message }, 500)
      }
    }

    const pointsAdded = newBadges.reduce((sum, id) => sum + TIER_POINTS[BADGES[id].tier], 0)
    return json({ awarded: newBadges, points_added: pointsAdded })
  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
})
