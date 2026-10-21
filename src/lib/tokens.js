// Thin compatibility layer over the Clay tokens (src/styles/tokens.css, generated from
// docs/brand/brand-tokens.json). New code uses CSS classes and src/ui components instead.

const v = name => `var(--${name})`

export const colors = {
  bg: v('surface-page'),
  surface: v('surface-card'),
  surfaceAlt: v('surface-sunken'),
  border: v('line'),
  borderLight: v('line'),
  text: v('ink'),
  textSec: v('ink-secondary'),
  textTert: v('ink-muted'),
  textInv: v('on-accent'),
  primary: v('accent'),
  primaryLight: v('accent-soft'),
  primaryDark: v('accent-hover'),
  success: v('success'),
  warning: v('weather-sun'),
  error: v('danger'),
  info: v('info'),
  flight: v('info'),
  hotel: v('stay'),
  activity: v('success'),
}

export const fonts = { heading: v('font-display'), body: v('font-body') }

// Bottom nav height in px (brand token nav-height)
export const NAV_HEIGHT = 84

// Badge definitions — single source of truth. `icon` is a name from src/ui/icons/paths.js.
export const BADGES = {
  // Tier 1 — Easy
  first_trip: { name: 'Bag Dropped', tier: 'easy', description: 'Created your first trip. The Goose approves.', icon: 'trips', target: 1, stat: 'trips_created' },
  first_honk: { name: 'Honk If You\'re Winging It', tier: 'easy', description: 'Used Goosey for the first time', icon: 'megaphone', target: 1, stat: 'honks_used' },
  wheels_up: { name: 'Finally Left', tier: 'easy', description: 'Added your first flight. No more excuses.', icon: 'plane-takeoff', target: 1, stat: 'total_flights' },
  first_pin: { name: 'I Know A Spot', tier: 'easy', description: 'Added your first activity', icon: 'pin', target: 1, stat: 'activities_added' },
  packing_pro: { name: 'No Forgotten Chargers', tier: 'easy', description: 'Completed your packing checklist', icon: 'list', target: 1, stat: 'packing_completed' },
  money_goose: { name: 'Splurge Assessed', tier: 'easy', description: 'Used the currency converter. Results may vary.', icon: 'currency', target: 1, stat: 'currency_lookups' },

  // Tier 2 — Medium
  ocean_crosser: { name: 'Long-Haul Goose', tier: 'medium', description: 'Survived a flight over 8 hours', icon: 'wave', target: 1, stat: 'total_flights' },
  foodie_goose: { name: 'Restaurant Hoarder', tier: 'medium', description: 'Added 10 restaurants. Calories don\'t count abroad.', icon: 'restaurant', target: 10, stat: 'restaurants_added' },
  culture_vulture: { name: 'Queue Enthusiast', tier: 'medium', description: 'Visited 5 museums. The Goose is impressed.', icon: 'museum', target: 5, stat: 'museums_visited' },
  continent_hopper: { name: 'Mild Globetrotter', tier: 'medium', description: 'Visited 3+ countries', icon: 'globe', target: 3, stat: 'countries_visited' },
  travel_squad: { name: 'Herd Mentality', tier: 'medium', description: 'Shared a trip. Accountability unlocked.', icon: 'users', target: 1, stat: null },
  planner_goose: { name: 'Suspiciously Organised', tier: 'medium', description: 'Completed 5 trips. The Goose is taking notes.', icon: 'clipboard', target: 5, stat: 'trips_completed' },

  // Tier 3 — Hard
  world_citizen: { name: 'Passport Full', tier: 'hard', description: 'Visited 15 countries. You\'re running out of pages.', icon: 'passport', target: 15, stat: 'countries_visited' },
  seven_summits: { name: 'Geographically Aggressive', tier: 'hard', description: 'Visited 7+ countries', icon: 'mountain', target: 7, stat: 'countries_visited' },
  jet_set: { name: 'Airline\'s Favourite Human', tier: 'hard', description: 'Booked 25 flights. Sky miles? Many.', icon: 'plane', target: 25, stat: 'total_flights' },
  michelin_goose: { name: 'Expense Account Vibes', tier: 'hard', description: 'Added 5 splurge restaurants. Treating yourself.', icon: 'star', target: 5, stat: 'splurge_restaurants' },
  festival_goose: { name: 'Never Sleeping In', tier: 'hard', description: 'Attended 10 events. The Goose is tired for you.', icon: 'event', target: 10, stat: null },
  road_warrior: { name: 'Never Actually Home', tier: 'hard', description: '100+ days abroad. What is a bed?', icon: 'road', target: 100, stat: 'days_abroad' },

  // Tier 4 — Legendary
  the_goose: { name: 'You Are The Goose', tier: 'legendary', description: 'Unlocked everything. The Goose bows.', icon: 'trophy', target: null, stat: null },
  everywhere_goose: { name: 'Basically A Diplomat', tier: 'legendary', description: 'Visited 50+ countries. Unhinged in the best way.', icon: 'map', target: 50, stat: 'countries_visited' },
  perfect_planner: { name: 'The Algorithm', tier: 'legendary', description: '10 fully planned trips. Terrifyingly organised.', icon: 'sparkles', target: 10, stat: 'trips_completed' },
}

// Tier → IconTile / Chip tone
export const BADGE_TIER_TONE = {
  easy: 'success',
  medium: 'info',
  hard: 'stay',
  legendary: 'accent',
}

// Deprecated: raw hex tier colours, used only by the pre-Clay Profile screen until it is rebuilt.
export const BADGE_TIER_COLORS = {
  easy: '#2D6E4A',
  medium: '#3E5C8A',
  hard: '#5E4B9A',
  legendary: '#B24A17',
}
