// All the words of "Fill my day" in one place, so the copy can be swapped without touching the screens.
// Stop counts and the budget rules live in supabase/functions/_shared/fillDay.js; the pace hints here must match them.
export const COPY = {
  title: 'Plan me a day, Goose',
  subtitle: 'Tell Goose how you like it. Goose does the legwork.',
  emptyDay: 'Nothing planned yet. Goose can sketch you a day.',
  pill: 'Let Goose fill it',
  freeDays: 'Free days',
  paceTitle: 'How hard are we going?',
  budgetTitle: 'What’s the damage?',
  vibeTitle: 'What’s the mood?',
  vibeHint: 'Pick up to three, or none for a mix.',
  vibeCap: 'Three moods max for now.',
  go: 'Fill it up',
  loading: 'Goose is waddling around…',
  add: 'Add to my day',
  another: 'Shuffle',
  cancel: 'Not this',
  footnote: 'Check times before you go.',
  error: 'Goose came back empty-winged. Try fewer moods or a slower pace.',
}
export const PACE_COPY = { slow: ['Lazy lie-in', '2–3 stops'], steady: ['Steady strut', '4–5 stops'], packed: ['Full honk', '6+ stops'] }
export const BUDGET_COPY = { easy: 'Pocket change', middle: 'Comfortably fed', treat: 'Treat yourself' }
export const VIBE_COPY = {
  cafes: 'Coffee crawl', museums: 'Museum mode', history: 'History nerd', food: 'Snack attack',
  walking: 'Wander about', views: 'Big views', markets: 'Market haul', parks: 'Green spaces',
}
