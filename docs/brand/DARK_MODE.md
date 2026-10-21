# Dark mode — Clay (proposed, for owner sign-off)

Dark mode was never designed, so this palette is **derived** from the signed-off light tokens using BRAND.md's
principles. Values live in `docs/brand/dark-tokens.json`; `npm run tokens` writes them into
`src/styles/tokens.css`, and `node scripts/build-tokens.mjs --report` re-prints the contrast table below.
`brand-tokens.json` (the signed-off light set) is unchanged.

**Status: awaiting owner sign-off.** Every value below can be changed in one file and regenerated.

## Principles applied

1. **Warm, never black.** Grounds are brown-blacks (`#1C1814` page, `#28221C` card), so the clay feel survives.
   Nothing uses `#000`; shadows are black-tinted only because brown shadows vanish on dark grounds.
2. **Same hierarchy, flipped lightness.** Page < card < inverse hero in lightness. Sunken tracks are darker than the
   page so segmented controls and progress tracks still read as pressed in.
3. **Terracotta stays the one accent.** Fills (primary button, FAB, selected switch, logo tag) keep the brand
   `#B24A17` so white labels hold 5.3:1. Terracotta *text* (links, overlines, active tab) is lightened to
   `#F0895A` — the minimum change that clears 4.5:1 on every dark ground (7.1:1 on the page, 5.7:1 on its soft tile).
4. **The Goose always sits on a light tile.** `goose-tile` is `#F4EEE6` in dark, and the Goose's own colours and
   ink outline are fixed tokens (`goose-*`, `goose-outline`), so the mascot is never recoloured.
5. **Category colours keep their roles.** Flight blue, stay violet, success green and danger red are lightened for
   text/icons and deepened for their soft tiles, keeping each category recognisable.
6. **Status is never colour alone** (unchanged): chips and rows pair colour with a word or icon.

## How it switches

- Default follows the phone (`prefers-color-scheme`). Profile → Settings → Appearance offers System · Light · Dark;
  an explicit choice is saved (`localStorage stt_theme`) and applied as `<html data-theme>`.
- The native status bar and the browser `theme-color` follow the resolved theme (`src/lib/theme.js`).
- Android splash has a dark variant (`drawable-night`).

## Colour tokens

| Token | Light (signed off) | Dark (proposed) | Note |
|---|---|---|---|
| `surface-page` | #F4EEE6 | #1C1814 | Warm near-black, never #000 |
| `surface-card` | #FFFDF9 | #28221C | One step lighter than the page, so cards still lift |
| `surface-sunken` | #E9E0D4 | #13100D | Darker than the page: tracks stay "pressed in" |
| `surface-inverse` | #2A2520 | #3A3129 | Hero cards get lighter than cards (inverse means "stands out", not "is dark") |
| `line` | #EFE7DC | #3A332B |  |
| `line-strong` | #D6C8B8 | #5A5045 |  |
| `ink` | #2A2520 | #F4EEE6 |  |
| `ink-secondary` | #5A5247 | #D6CBBD |  |
| `ink-muted` | #6B6355 | #B3A796 |  |
| `ink-inverse` | #FFFDF9 | #FFFDF9 | Unchanged |
| `ink-inverse-muted` | #D9CFC2 | #DCD2C5 |  |
| `accent` | #B24A17 | #F0895A | Lightened terracotta for text, links, active tabs (7.1:1 on page) |
| `accent-hover` | #8E3A12 | #F6A57F |  |
| `accent-soft` | #F6E9DF | #3D2619 | Deep terracotta tile fill |
| `accent-on-inverse` | #F28B5B | #F59A6F |  |
| `brand-terracotta` | #C4561E | #C4561E | Unchanged, decorative only |
| `danger` | #A3261B | #F28B7E | Lightened for text on dark |
| `danger-soft` | #F8E4E1 | #3E1E1A |  |
| `success` | #2D6E4A | #86C9A0 |  |
| `success-soft` | #E7F2EC | #1C3326 |  |
| `info` | #3E5C8A | #9DB9E3 |  |
| `info-soft` | #E6EEF8 | #1F2D3F |  |
| `stay` | #5E4B9A | #BDAEEB |  |
| `stay-soft` | #EFEAF8 | #2C2640 |  |
| `weather-sun` | #D4910A | #E8B23A | Lifted so the sun icon reads on dark cards |
| `goose-feather` | #F0EBE3 | #F0EBE3 | Unchanged: the Goose is never recoloured |
| `goose-wing` | #E8E3DB | #E8E3DB | Unchanged |
| `goose-beak` | #E8A820 | #E8A820 | Unchanged |
| `goose-beak-shade` | #D4910A | #D4910A | Unchanged |

## New semantic tokens (both themes)

These split roles that a single light token plays (e.g. `accent` is both a text colour and a button fill). In light
mode they equal existing brand values, so the light theme is unchanged.

| Token | Light | Dark | Why it exists |
|---|---|---|---|
| `accent-fill` | `#B24A17` | `#B24A17` | Primary button / FAB fill. Stays #B24A17 in dark so white labels keep 5.3:1 (the lighter text accent would need dark labels). |
| `accent-fill-hover` | `#8E3A12` | `#943D12` | Pressed state of the fill |
| `on-accent` | `#FFFDF9` | `#FFFDF9` | Label on accent fills |
| `danger-fill` | `#A3261B` | `#B3302A` | Delete-account button fill |
| `on-danger` | `#FFFDF9` | `#FFFDF9` | Label on danger fill |
| `goose-tile` | `#FFFDF9` | `#F4EEE6` | The light tile the Goose always sits on (BRAND: Goose on a light tile) |
| `goose-outline` | `#2A2520` | `#2A2520` | The Goose ink line; fixed so the mascot never changes |
| `scrim` | `rgba(42,37,32,0.48)` | `rgba(8,6,4,0.62)` | Behind sheets and dialogs |
| `progress-track-inverse` | `#4A433B` | `#5A5045` | Progress track on inverse hero cards |
| `shadow-lip` | `inset 0 -3px 0 rgba(120,80,50,0.06)` | `inset 0 -3px 0 rgba(0,0,0,0.22)` | The pressed-clay bottom lip; black-tinted in dark |
| `shadow-sheet` | `0 -12px 40px rgba(42,37,32,0.28)` | `0 -12px 40px rgba(0,0,0,0.5)` | Bottom sheet shadow |
| `shadow-knob` | `0 2px 4px rgba(42,37,32,0.25)` | `0 2px 4px rgba(0,0,0,0.45)` | Switch knob |
| `app-max` | `480px` | `480px` | Max app column width (not a colour) |

## Shadows

| Shadow | Light | Dark |
|---|---|---|
| `shadow-card` | `0 8px 22px rgba(120,80,50,0.10)` | `0 8px 22px rgba(0,0,0,0.30)` |
| `shadow-raised` | `0 10px 30px rgba(120,80,50,0.12), inset 0 -4px 0 rgba(120,80,50,0.05)` | `0 10px 30px rgba(0,0,0,0.38), inset 0 -4px 0 rgba(0,0,0,0.18)` |
| `shadow-inverse` | `0 12px 28px rgba(42,37,32,0.24)` | `0 12px 28px rgba(0,0,0,0.45)` |
| `shadow-accent` | `0 6px 14px rgba(178,74,23,0.28), inset 0 -3px 0 rgba(0,0,0,0.12)` | `0 6px 14px rgba(0,0,0,0.40), inset 0 -3px 0 rgba(0,0,0,0.18)` |
| `shadow-nav` | `0 -6px 20px rgba(120,80,50,0.08)` | `0 -6px 20px rgba(0,0,0,0.35)` |
| `shadow-field` | `inset 0 2px 4px rgba(120,80,50,0.08)` | `inset 0 2px 4px rgba(0,0,0,0.35)` |

## Contrast (WCAG 2.1, every pairing the components use)

| Pair | Use | Min | Light | Dark | Dark values |
|---|---|---|---|---|---|
| `ink` on `surface-page` | Body text on the page | 4.5:1 | 13.16:1 | 15.31:1 | #F4EEE6 on #1C1814 |
| `ink` on `surface-card` | Body text on cards | 4.5:1 | 14.94:1 | 13.64:1 | #F4EEE6 on #28221C |
| `ink` on `surface-sunken` | Selected segment label / text on sunken track | 4.5:1 | 11.62:1 | 16.45:1 | #F4EEE6 on #13100D |
| `ink-secondary` on `surface-page` | Supporting copy on the page | 4.5:1 | 6.67:1 | 11.04:1 | #D6CBBD on #1C1814 |
| `ink-secondary` on `surface-card` | Supporting copy on cards | 4.5:1 | 7.56:1 | 9.83:1 | #D6CBBD on #28221C |
| `ink-secondary` on `surface-sunken` | Unselected segment label | 4.5:1 | 5.88:1 | 11.86:1 | #D6CBBD on #13100D |
| `ink-secondary` on `line` | Car / note icon on its tile | 3:1 | 6.27:1 | 7.78:1 | #D6CBBD on #3A332B |
| `ink-muted` on `surface-page` | Meta text, overlines on the page | 4.5:1 | 5.15:1 | 7.47:1 | #B3A796 on #1C1814 |
| `ink-muted` on `surface-card` | Meta text on cards | 4.5:1 | 5.84:1 | 6.65:1 | #B3A796 on #28221C |
| `accent` on `surface-page` | Links, overlines, active tab on the page | 4.5:1 | 4.69:1 | 7.08:1 | #F0895A on #1C1814 |
| `accent` on `surface-card` | Links and active nav on cards | 4.5:1 | 5.32:1 | 6.31:1 | #F0895A on #28221C |
| `accent` on `accent-soft` | Accent icon / text on its soft tile | 4.5:1 | 4.54:1 | 5.66:1 | #F0895A on #3D2619 |
| `on-accent` on `accent-fill` | Primary button label | 4.5:1 | 5.32:1 | 5.32:1 | #FFFDF9 on #B24A17 |
| `ink-inverse` on `surface-inverse` | Text on inverse hero cards | 4.5:1 | 14.94:1 | 12.52:1 | #FFFDF9 on #3A3129 |
| `ink-inverse-muted` on `surface-inverse` | Secondary text on inverse hero | 4.5:1 | 9.87:1 | 8.52:1 | #DCD2C5 on #3A3129 |
| `accent-on-inverse` on `surface-inverse` | Terracotta text on inverse hero | 4.5:1 | 6.23:1 | 5.90:1 | #F59A6F on #3A3129 |
| `danger` on `surface-card` | Emergency numbers, destructive links | 4.5:1 | 7.25:1 | 6.57:1 | #F28B7E on #28221C |
| `danger` on `danger-soft` | Danger icon on its tile | 4.5:1 | 6.03:1 | 6.24:1 | #F28B7E on #3E1E1A |
| `on-danger` on `danger-fill` | Danger button label | 4.5:1 | 7.25:1 | 6.13:1 | #FFFDF9 on #B3302A |
| `success` on `surface-card` | Completed chips, checks | 4.5:1 | 6.01:1 | 8.14:1 | #86C9A0 on #28221C |
| `success` on `success-soft` | Success chip text on its fill | 4.5:1 | 5.32:1 | 7.01:1 | #86C9A0 on #1C3326 |
| `info` on `surface-card` | Info text on cards | 4.5:1 | 6.66:1 | 7.85:1 | #9DB9E3 on #28221C |
| `info` on `info-soft` | Flight icon / date chip on its tile | 4.5:1 | 5.79:1 | 6.96:1 | #9DB9E3 on #1F2D3F |
| `stay` on `stay-soft` | Stay icon on its tile | 4.5:1 | 6.03:1 | 7.14:1 | #BDAEEB on #2C2640 |
| `weather-sun` on `surface-card` | Sun icon (icon only, 3:1; light value is the signed-off brand token) | 3:1 | 2.63:1 **FAIL** | 8.13:1 | #E8B23A on #28221C |
| `goose-outline` on `goose-tile` | Goose outline on its light tile | 3:1 | 14.94:1 | 13.16:1 | #2A2520 on #F4EEE6 |


The one failing cell is the **light** `weather-sun` (#D4910A on #FFFDF9, 2.63:1): that is the signed-off brand token,
used for the sun icon only and always next to a temperature label. Flagging it, not changing it.

## Logo on dark

Per BRAND.md: tag stays terracotta, punched hole cut to the ground (`surface-page`), string in light ink, window and
Goose on the light tile; wordmark "silly" in the text accent, "travel tool" in `ink`.

## Screenshots

Every screen is captured in both themes in `docs/screenshots/clay/` (`*-light.jpg` / `*-dark.jpg`).
