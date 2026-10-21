// Silly Travel Tool — Design Tokens
// Single source of truth for all design values

export const colors = {
  // Backgrounds
  bg: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F1EB',

  // Borders
  border: '#E8E3DB',
  borderLight: '#F0EEEA',

  // Text
  text: '#2A2520',
  textSec: '#6B6355',
  textTert: '#A09688',
  textInv: '#FFFFFF',

  // Brand
  primary: '#C4561E',
  primaryLight: '#FFF0EB',
  primaryDark: '#A3431A',

  // Semantic
  success: '#2D8B55',
  warning: '#D4910A',
  error: '#D93025',
  info: '#1A73E8',

  // Booking type colors
  flight: '#4A7FC4',
  hotel: '#7B61C4',
  activity: '#2D8B55',

  // Price tier colors
  tier1: '#2D8B55',   // $ cheap
  tier2: '#D4910A',   // $$ mid
  tier3: '#C4561E',   // $$$ splurge

  // Dark mode
  dark: {
    bg: '#1A1612',
    surface: '#242018',
    surfaceAlt: '#2E2A24',
    border: '#3D3830',
    borderLight: '#332F28',
    text: '#F0EBE3',
    textSec: '#A09688',
    textTert: '#6B6355',
    primary: '#E8723A',
    primaryLight: '#2A1A10',
  }
}

export const fonts = {
  heading: "'Space Grotesk', sans-serif",
  body: "'DM Sans', sans-serif",
  mono: "'Space Mono', monospace",
}

export const fontSizes = {
  xs: '11px',
  sm: '13px',
  base: '15px',
  md: '17px',
  lg: '20px',
  xl: '24px',
  '2xl': '28px',
  '3xl': '32px',
}

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  '2xl': '24px',
  '3xl': '32px',
  '4xl': '40px',
}

export const radius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
}

export const shadows = {
  sm: '0 1px 4px rgba(42,37,32,0.08)',
  md: '0 2px 12px rgba(42,37,32,0.10)',
  lg: '0 4px 24px rgba(42,37,32,0.12)',
  primary: '0 4px 20px rgba(196,86,30,0.25)',
}

// Bottom nav height — used for padding throughout
export const NAV_HEIGHT = 64

// Badge definitions — single source of truth
export const BADGES = {
  // Tier 1 — Easy
  first_trip: { name: 'Bag Dropped', tier: 'easy', description: 'Created your first trip. The Goose approves.', icon: '🧳', target: 1, stat: 'trips_created' },
  first_honk: { name: 'Honk If You\'re Winging It', tier: 'easy', description: 'Used Goosey for the first time', icon: '🪿', target: 1, stat: 'honks_used' },
  wheels_up: { name: 'Finally Left', tier: 'easy', description: 'Added your first flight. No more excuses.', icon: '✈️', target: 1, stat: 'total_flights' },
  first_pin: { name: 'I Know A Spot', tier: 'easy', description: 'Added your first activity', icon: '📍', target: 1, stat: 'activities_added' },
  packing_pro: { name: 'No Forgotten Chargers', tier: 'easy', description: 'Completed your packing checklist', icon: '🧳', target: 1, stat: 'packing_completed' },
  money_goose: { name: 'Splurge Assessed', tier: 'easy', description: 'Used the currency converter. Results may vary.', icon: '💰', target: 1, stat: 'currency_lookups' },

  // Tier 2 — Medium
  ocean_crosser: { name: 'Long-Haul Goose', tier: 'medium', description: 'Survived a flight over 8 hours', icon: '🌊', target: 1, stat: 'total_flights' },
  foodie_goose: { name: 'Restaurant Hoarder', tier: 'medium', description: 'Added 10 restaurants. Calories don\'t count abroad.', icon: '🍜', target: 10, stat: 'restaurants_added' },
  culture_vulture: { name: 'Queue Enthusiast', tier: 'medium', description: 'Visited 5 museums. The Goose is impressed.', icon: '🏛️', target: 5, stat: 'museums_visited' },
  continent_hopper: { name: 'Mild Globetrotter', tier: 'medium', description: 'Visited 3+ countries', icon: '🌍', target: 3, stat: 'countries_visited' },
  travel_squad: { name: 'Herd Mentality', tier: 'medium', description: 'Shared a trip. Accountability unlocked.', icon: '👥', target: 1, stat: null },
  planner_goose: { name: 'Suspiciously Organised', tier: 'medium', description: 'Completed 5 trips. The Goose is taking notes.', icon: '📋', target: 5, stat: 'trips_completed' },

  // Tier 3 — Hard
  world_citizen: { name: 'Passport Full', tier: 'hard', description: 'Visited 15 countries. You\'re running out of pages.', icon: '🌐', target: 15, stat: 'countries_visited' },
  seven_summits: { name: 'Geographically Aggressive', tier: 'hard', description: 'Visited 7+ countries', icon: '🏔️', target: 7, stat: 'countries_visited' },
  jet_set: { name: 'Airline\'s Favourite Human', tier: 'hard', description: 'Booked 25 flights. Sky miles? Many.', icon: '🛫', target: 25, stat: 'total_flights' },
  michelin_goose: { name: 'Expense Account Vibes', tier: 'hard', description: 'Added 5 splurge restaurants. Treating yourself.', icon: '⭐', target: 5, stat: 'splurge_restaurants' },
  festival_goose: { name: 'Never Sleeping In', tier: 'hard', description: 'Attended 10 events. The Goose is tired for you.', icon: '🎪', target: 10, stat: null },
  road_warrior: { name: 'Never Actually Home', tier: 'hard', description: '100+ days abroad. What is a bed?', icon: '🛣️', target: 100, stat: 'days_abroad' },

  // Tier 4 — Legendary
  the_goose: { name: 'You Are The Goose', tier: 'legendary', description: 'Unlocked everything. The Goose bows.', icon: '🏆', target: null, stat: null },
  everywhere_goose: { name: 'Basically A Diplomat', tier: 'legendary', description: 'Visited 50+ countries. Unhinged in the best way.', icon: '🗺️', target: 50, stat: 'countries_visited' },
  perfect_planner: { name: 'The Algorithm', tier: 'legendary', description: '10 fully planned trips. Terrifyingly organised.', icon: '✨', target: 10, stat: 'trips_completed' },
}

export const BADGE_TIER_COLORS = {
  easy: '#2D8B55',
  medium: '#1A73E8',
  hard: '#7B61C4',
  legendary: '#C4561E',
}
