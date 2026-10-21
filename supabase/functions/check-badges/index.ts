import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BADGE_TIER_POINTS = { easy: 10, medium: 25, hard: 50, legendary: 100 }

const BADGE_CONDITIONS = {
  // Easy badges
  first_trip: (stats) => (stats.trips_created || stats.trips_total || stats.trips_completed || 0) >= 1,
  wheels_up: (stats, bookings) => (stats.total_flights || 0) >= 1,
  first_pin: (stats, activities) => (activities || 0) >= 1,
  packing_pro: (stats) => (stats.packing_completed || 0) >= 1,
  money_goose: (stats) => (stats.currency_lookups || 0) >= 1,
  first_honk: (stats) => (stats.honks_used || 0) >= 1,

  // Medium badges
  ocean_crosser: (stats, _, flights) => (flights || []).some(f => f.flight_duration_hours >= 8),
  foodie_goose: (stats) => (stats.restaurants_added || 0) >= 10,
  culture_vulture: (stats) => (stats.museums_visited || 0) >= 5,
  continent_hopper: (stats) => (stats.countries_visited || 0) >= 3,
  travel_squad: (stats, _, __, collabCount) => (collabCount || 0) >= 1,
  planner_goose: (stats) => (stats.trips_completed || 0) >= 5,

  // Hard badges
  world_citizen: (stats) => (stats.countries_visited || 0) >= 15,
  seven_summits: (stats) => (stats.countries_visited || 0) >= 7, // Simplified: 7+ countries
  jet_set: (stats) => (stats.total_flights || 0) >= 25,
  michelin_goose: (stats) => (stats.splurge_restaurants || 0) >= 5,
  road_warrior: (stats) => (stats.days_abroad || 0) >= 100,

  // Legendary
  everywhere_goose: (stats) => (stats.countries_visited || 0) >= 50,
  perfect_planner: (stats) => (stats.trips_completed || 0) >= 10,
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    }})
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'No auth' }), { status: 401 })

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY')
    )
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    )

    // Verify JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
    if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const body = await req.json().catch(() => ({}))
    const userId = body.user_id || user.id

    // Fetch current stats, existing badges, bookings
    const [
      { data: stats },
      { data: earnedBadges },
      { data: bookings },
      { data: collab },
    ] = await Promise.all([
      supabase.from('user_stats').select('*').eq('user_id', userId).single(),
      supabase.from('user_badges').select('badge_id').eq('user_id', userId),
      supabase.from('bookings').select('type, flight_duration_hours').eq('created_by', userId),
      supabase.from('trip_collaborators').select('id').eq('user_id', userId).eq('status', 'accepted').neq('role', 'owner'),
    ])

    if (!stats) return new Response(JSON.stringify({ error: 'No stats found' }), { status: 404 })

    const alreadyEarned = new Set((earnedBadges || []).map(b => b.badge_id))
    const newBadges = []

    for (const [badgeId, condition] of Object.entries(BADGE_CONDITIONS)) {
      if (alreadyEarned.has(badgeId)) continue
      try {
        const earned = condition(stats, bookings, bookings, collab?.length || 0)
        if (earned) newBadges.push(badgeId)
      } catch {}
    }

    let pointsAdded = 0
    const tierPoints = BADGE_TIER_POINTS

    if (newBadges.length > 0) {
      // Badge metadata — name + tier required by schema (NOT NULL)
      const BADGE_METADATA: Record<string, { name: string; tier: string }> = {
        first_trip:       { name: 'First Trip',        tier: 'easy' },
        wheels_up:        { name: 'Wheels Up',         tier: 'easy' },
        first_pin:        { name: 'First Pin',         tier: 'easy' },
        packing_pro:      { name: 'Packing Pro',       tier: 'easy' },
        money_goose:      { name: 'Money Goose',       tier: 'easy' },
        first_honk:       { name: 'First Honk',        tier: 'easy' },
        ocean_crosser:    { name: 'Ocean Crosser',     tier: 'medium' },
        foodie_goose:     { name: 'Foodie Goose',      tier: 'medium' },
        culture_vulture:  { name: 'Culture Vulture',   tier: 'medium' },
        continent_hopper: { name: 'Continent Hopper',  tier: 'medium' },
        travel_squad:     { name: 'Travel Squad',      tier: 'medium' },
        planner_goose:    { name: 'Planner Goose',     tier: 'medium' },
        world_citizen:    { name: 'World Citizen',     tier: 'hard' },
        seven_summits:    { name: 'Seven Summits',     tier: 'hard' },
        jet_set:          { name: 'Jet Set',           tier: 'hard' },
        michelin_goose:   { name: 'Michelin Goose',    tier: 'hard' },
        road_warrior:     { name: 'Road Warrior',      tier: 'hard' },
        festival_goose:   { name: 'Festival Goose',    tier: 'hard' },
        everywhere_goose: { name: 'Everywhere Goose',  tier: 'legendary' },
        perfect_planner:  { name: 'Perfect Planner',   tier: 'legendary' },
        the_goose:        { name: 'The Goose',         tier: 'legendary' },
      }

      // Insert new badges — include badge_name and badge_tier (NOT NULL in schema)
      const badgeRows = newBadges.map(id => ({
        user_id: userId,
        badge_id: id,
        badge_name: BADGE_METADATA[id]?.name || id,
        badge_tier: BADGE_METADATA[id]?.tier || 'easy',
        awarded_at: new Date().toISOString(),
      }))
      await supabase.from('user_badges').insert(badgeRows)

      // Calculate points
      const BADGE_TIERS: Record<string, string> = Object.fromEntries(
        Object.entries(BADGE_METADATA).map(([id, m]) => [id, m.tier])
      )
      pointsAdded = newBadges.reduce((sum, id) => sum + (tierPoints[BADGE_TIERS[id] || 'easy'] || 10), 0)

      // Update goose_score
      if (pointsAdded > 0) {
        await supabase.from('user_stats').update({
          goose_score: (stats.goose_score || 0) + pointsAdded,
        }).eq('user_id', userId)
      }
    }

    return new Response(JSON.stringify({
      awarded: newBadges,
      points_added: pointsAdded,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
