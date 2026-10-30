// All the words of "Fill my day" in one place, so the copy can be swapped without touching the screens.
// Stop counts and the budget rules live in supabase/functions/_shared/fillDay.js; the pace hints here must match them.
export const COPY = {
  title: 'Plan me a day, Goose',
  subtitle: 'Tell Goose how you like it. Goose does the legwork.',
  emptyDay: 'Nothing planned yet.',
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
  errorLater: 'Goose can’t plan days right now. Try again later.',
  addError: 'Couldn’t add these. Try again.',
  error: 'Goose came back empty-winged. Try fewer moods or a slower pace.',
}
export const PACE_COPY = { slow: ['Here to relax', '2–3 stops'], steady: ['Steady pace', '4–5 stops'], packed: ['FULL HONK!', '6+ stops'] }
export const BUDGET_OPTIONS = ['$', '$$', '$$$', '$$$$']
export const VIBE_COPY = {
  cafes: 'Cafés', streetfood: 'Street food', hotspots: 'Hotspots', markets: 'Markets', shopping: 'Shopping',
  museums: 'Museums', monuments: 'Monuments', history: 'History', art: 'Art', views: 'Views', parks: 'Parks',
  beaches: 'Beaches', music: 'Live music', walking: 'Walking',
}
