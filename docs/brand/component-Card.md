# Card

Cards hold all content; three weights set the hierarchy of a screen.

- **Hero (raised)** — `surface-card`, `radius-xl`, `shadow-raised`, padding `space-5`. One per screen: the thing to act on now (next booking, today's weather).
- **Hero (inverse)** — `surface-inverse`, `radius-xl`, `shadow-inverse`. Use for HONK, the active trip and the Goose score; at most one per screen, and never both hero types competing at the top.
- **Group** — `surface-card`, `radius-lg`, `shadow-card`, rows separated by 1px `line`. Lists of bookings, settings, phrases.

Cards never have borders. Overline (`overline`, `ink-muted` or `accent`) sits above or inside the card's top edge. The consumer provides the content.
