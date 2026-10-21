# Button

Clay buttons are soft, raised pills with a pressed-in bottom lip; one primary per screen.

- **Primary** — `accent` fill, `ink-inverse` label, `shadow-accent`. The single main action.
- **Secondary** — `surface-page` fill (on cards) or `surface-card` fill (on the page), `ink` label.
- **Dark** — `surface-inverse` fill, for the main action on onboarding screens.
- **Ghost** — no fill, `ink-secondary` label, for "Not now" / "Skip".
- **Danger** — `danger` fill, only for irreversible deletes; disabled until confirmed.

Height `button-height` (48px), 52–54px for a full-width primary. Radius `radius-md`. Label style `label` (14–16px, 600). Icons 18px, 8px gap. The consumer provides the label text and handler.
