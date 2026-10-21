# SegmentedControl

A sunken track with a raised selected pill; used for trip tabs (Plan · Weather · Pack) and small option sets like tip percentages.

Track `surface-sunken`, `radius-md` + 2px, 4px padding. Selected segment `surface-card`, `shadow-card`, `ink` label at 600; others transparent with `ink-secondary` at 500. Segment height 40–44px. 2–4 segments; more than four becomes a list. Use `role="tablist"` for views and `role="radiogroup"` for values. The consumer provides labels, the selected index and the change handler.
