# STT Brand — Warm Minimal Clay

The brand system for **Silly Travel Tool** (sillytraveltool.com): a serious travel wallet with a cheeky goose in the corner. Everything here is taken from the signed-off Clay screens; use the tokens by name, never retype hex values.

## Personality

- **Serious tool, silly voice.** The app has to work at 6am in a foreign airport. Humor lives in small places (empty states, loading lines, error titles, the Goose), never in buttons, numbers or anything a traveler acts on.
- **Warm, tactile, calm.** Surfaces look like soft clay: rounded, lightly raised, warm-tinted. No neon, no gradients, no glassmorphism.
- **Glanceable first.** One hero card per screen answers "what's next?" Everything else is a quiet list.

## Voice

| Do | Don't |
| --- | --- |
| "Goose lost the plot" (error title) followed by a plain fix: "Try again" | Jokes inside the action: "Honk harder!" |
| "Goose is reading up on Sevilla" | "Loading…" |
| "Not now" / "Keep my account" | "No thanks, I hate fun" |
| Plain, specific labels: "Show tickets", "Copy address" | Vague labels: "Go", "OK" |

Write in sentence case. Use "Goose" as a name (no "the"). Every AI-written surface carries a one-line disclosure ("Suggested by Goose (AI)…") and a way to report.

## The Goose

The mascot is the existing outlined goose: cream feathers (`goose-feather`), grey-cream wings (`goose-wing`), two-tone beak (`goose-beak`, `goose-beak-shade`), ink outline (`ink`), a faint `brand-terracotta` blush. It is not redrawn per screen; reuse the master SVG in **Assets › Logos**.

- Expressions change only the eye, brow and mouth.
- The Goose sits in a `surface-card` or `surface-page` tile so the ink outline always has a light ground. On `surface-inverse`, put it on a light tile first.
- Never recolor it, stretch it, add outfits for one-off jokes, or use it as a bullet point.

## Logo

**The luggage tag** (chosen Oct 2026; direction B on the *STT Design Directions* canvas). The Goose rides in a terracotta luggage tag: the brand's travel tie-in, with the Goose kept intact.

- **Mark:** `tag-mark.svg`. Tag `accent`, punched hole and Goose window `surface-card`, string and outlines `ink`. The Goose inside is the master Goose, clipped to the window.
- **Wordmark:** stacked, lowercase, Space Grotesk 700, letter-spacing −0.03em. Line 1 "silly" in `accent`, line 2 "travel tool" in `ink`. Lockup = tag left, wordmark right, wordmark cap-height ≈ tag window height, gap ≈ 0.2 × tag height.
- **On dark** (`surface-inverse`): tag stays `accent`, hole cut to the ground, string `ink-inverse-muted`; "silly" in `accent-on-inverse`, "travel tool" in `ink-inverse`.
- **On terracotta** (`accent`): tag flips to `surface-card` with an `accent` hole; wordmark all `ink-inverse`.
- **App icon:** `app-icon-tag.svg`, a cream tag on `accent`. **Favicon** 16–48px: `favicon-tag.svg`, a flat tag with a window and eye dot (the Goose's detail does not survive below 48px).
- **Clear space:** at least the tag's width on every side of the lockup; never smaller than `space-10`.
- **Don't:** recolor the tag, drop the string at 48px and up, replace the window Goose with another expression, set the wordmark in title case, or put the wordmark inside the tag.

`goose-mark.svg` is the standalone mascot for in-app use (empty states, avatars), not a logo.

## Color

Warm neutrals do the work; terracotta is the one accent.

- **Grounds:** `surface-page` behind everything, `surface-card` for content, `surface-inverse` for the single dark hero (HONK, next-up, score).
- **Text:** `ink` → `ink-secondary` → `ink-muted`. Nothing lighter than `ink-muted` carries text.
- **Accent:** all terracotta text, links, active tabs and primary buttons use `accent` (#B24A17). The original `brand-terracotta` (#C4561E) is 4.47:1 on white, so it is decorative only (illustration, 24px+ display type).
- **Booking categories** (icon on its soft fill): flight `info`, stay `stay`, train and transport `accent`, tickets and activities `success`, car and notes `ink-secondary` on `line`.
- **Danger** is reserved for SOS and destructive actions. Never use it for decoration.
- Status is never color alone: pair it with an icon or word ("Completed", a check).

## Typography

Two families, both on Google Fonts:

- **Space Grotesk** (`display`), weights 500–700: titles, numbers, the wordmark. Tight tracking (−0.02em) at 24px and up.
- **DM Sans** (`body`), weights 400–600: everything else.

Smallest text is 12px (`micro`, `overline`). Inputs use 16px so iOS doesn't zoom. Overlines are uppercase with 0.06em tracking.

## Shape and depth

- Radii scale with size: `radius-sm` chips → `radius-md` buttons → `radius-lg` list cards → `radius-xl` hero cards → `radius-2xl` sheets. Nested corners step down one size.
- Depth comes from `shadow-card` and `shadow-raised` (warm brown tint plus a faint inset bottom lip). One raised element per screen.
- Inputs are sunken (`shadow-field`), not outlined.
- Dividers inside cards are 1px `line`; cards themselves have no borders.

## Layout

- Reference frame 390 × 844. Side gutter `space-5` (20px); onboarding `space-6`.
- Bottom nav: 4 tabs (Trips · Explore · Tools · Profile), `nav-height` 84px, `surface-card` with `radius-xl` top corners.
- Screen order: title row → hero card → lists. Primary action at the bottom on full-screen flows.
- Every tap target is at least `touch-min` (44px).

## Iconography

Stroke icons on a 24px grid, 1.8px stroke, round caps and joins, `currentColor`-style single ink. Icons inside a colored tile use that category's strong color on its soft fill. No emoji, no filled icon sets, no mixed weights.

## Accessibility

- Text meets 4.5:1 on its ground (3:1 at 24px+). The token notes list each safe pairing.
- Real controls: `button`, `a`, `input` + `label`. Icon-only buttons get an `aria-label`.
- Motion: none required to understand state; loading uses text plus a progress bar.

## Components

See the Components view: Button, Card, Segmented control, List row, Bottom nav. Each preview uses only these tokens.
