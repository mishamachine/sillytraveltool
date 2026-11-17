# Goose mascot directions (exploration)

Ways to draw Goose, for the owner to pick from. **Nothing in the app uses these files.**

- **Round two** (after the owner passed on round one): `index-2.html` / `contact-sheet-2.png`, built by `build2.mjs`. See the next section.
- **Round one**: the eight directions further down (`index.html` / `contact-sheet.png`, built by `build.mjs`).

## Round two

The owner's brief was "one that is like an old 8-bit video game, and one that is a little more silly but cute". Each direction is pushed further and comes with variants.

### A. Arcade (8-bit sprite)

A real 32 x 32 sprite, not vector styled to look pixelated. Every pixel is hand-placed in a character grid in `build2.mjs` and exported as a true PNG at whole-number scales (1x, 4x, 8x, nearest-neighbour) and as SVG `<rect>` runs with `crispEdges`. It has NES and Game Boy proportions: a big head, a stubby body, a chunky two-tone beak, a one-pixel glint in the eye and a terracotta scarf.

- **Variants:** **NES** (ink, cream, shadow, beak yellow, terracotta: five colours, plus the sky colour on the title screen only); **Game Boy** (four greens from the success tokens: ink, `#2D6E4A`, `#86C9A0`, `#E7F2EC`); and the **title-screen tag** (the sprite in a pixel luggage tag with three lives, 40 x 52) used for the app icon.
- **Frames:** idle, blink, walk 1, walk 2, and honk (48 x 32, with a pixel speech bubble). The sheet plays the walk cycle and blink live.
- **Files:** `svg/9-arcade/{nes,gb}-{idle,blink,walkA,walkB,honk,title,icon,app-icon}.svg`; `png/arcade/{nes,gb}-<frame>@{1,4,8}x.png` plus a walk strip; close-up `png/arcade-nes-idle-512.png` (16x).
- **24 px:** a separate 12 x 12 sprite drawn at 2x (`icon`), because the 32 px sprite can't be scaled down cleanly.

### B. Waddle (silly but cute)

Rounder and goofier than Clay Pebble. It has oversized eyes with a lazy half-lid wink, a too-big orange bill with a cheeky grin crease, a tiny tuft, short legs with huge orange feet, a terracotta scarf and a blush. The ink outline and cream fill keep it in the Clay system.

- **Variants:** **Proud** (chest out, wings on hips, lazy wink); **Mid-waddle** (leaning into the step, one foot up, scarf streaming); **Lost the plot** (spiral eyes, beak agape, map upside down with the north arrow pointing at the floor, orbiting stars).
- **Files:** `svg/10-waddle/{proud,waddle,lost}{,-dark,-mono}.svg`, `tag.svg`, `app-icon.svg`, `icon-24.svg`, `icon-24-dark.svg`; close-ups `png/waddle-proud-512.png` and `png/waddle-lost-512.png`.

### My take on round two

- **Waddle is the stronger mascot.** It has real comedy and range: the three poses already cover the "excited", "lost" and "smug" beats the app uses. It drops straight into `GooseMark` as the same outline-and-fill system, and the big bill and feet read as a goose, not a chick. Its weak spot is 24 px, where only the face survives (the icon is head, eyes and bill).
- **Arcade is the stronger icon system.** It is perfect at 32, 64 and 128 px, the Game Boy variant gives a striking app-store tile, and sprite frames make loading and empty-state animation cheap (swap two PNGs). It fights the soft Clay UI if used everywhere. Best use: as the app icon and a delight layer (loading, the HONK card, an easter egg), or as the whole personality if the owner wants the app to lean retro.
- **Recommendation:** Waddle as the in-app Goose (Proud as the master pose), with the Arcade NES sprite kept for loading and celebration moments. If the owner wants one look across everything, choose Waddle.

Adopting either touches the same places listed under "What adopting one would touch" below. Arcade also needs `image-rendering: pixelated` wherever it renders and integer-scale exports for every icon size (iOS and Android icon sizes that aren't multiples of 32 need the 12 x 12 or a hand-tuned sprite).

---

# Round one: eight directions

Eight new ways to draw Goose.

- `index.html`: the contact sheet (open it in a browser). `contact-sheet.png` is the same page rendered at 2x.
- `svg/<direction>/`: per direction, `goose.svg` (light), `goose-dark.svg`, `goose-mono.svg` (ink on cream), `expression.svg`, `tag.svg` (cream Goose in the terracotta tag), `app-icon.svg`, `icon-24.svg` and `icon-24-dark.svg`.
- `png/`: four of the directions rendered at 512 px.
- `build.mjs`: the hand-written path data for all eight, in one file. Rebuild everything with `node docs/brand/mascot-options/build.mjs`.

Rules followed: `viewBox 0 0 256 256` (icons `0 0 24 24`, 1.8 stroke), colours only from `brand-tokens.json` and `dark-tokens.json`, no fonts, images or emoji inside the SVGs.

## Today's Goose: what works and what limits it

Today's Goose is warm and approachable. It shares the app's ink outline and cream fills, and its expression system (only the eye, brow and mouth change) already gives seven moods in `GooseMark.jsx`. It also fits neatly in the luggage tag. Its limits come from its construction. A round head on a short trapezoid body, with no neck, reads as a chick or duckling more than a goose. Only one eye shows, so a wink just looks like a closed eye. Below 48 px the detail collapses: BRAND.md already swaps the favicon for a flat tag with an eye dot. The pose is static and front-on, so the only real animation is a wing flap; it can't walk, fly or turn. The yellow beak sits outside the terracotta palette. In the app icon the Goose fills about a third of the tile, so in a store grid the icon reads as "a tag", not as a character.

## The eight

| # | Name | Concept | Expression shown |
|---|------|---------|------------------|
| 1 | **Three-Piece** | A bold geometric goose made of a half-disc body, a capsule neck and a triangle beak, with a Canada-goose chinstrap. | Honk |
| 2 | **One Line** | One unbroken stroke and one dot. Calm and elegant, and it can draw itself on screen. | Lost the plot (the line tangles) |
| 3 | **Clay Pebble** | A squishy gourd of clay with soft shading, two dot eyes and stubby wings: the Clay design system as a creature. | Wink |
| 4 | **Carry-On** | A long-necked traveller mid-stride, terracotta scarf flying, a tiny carry-on held in its beak. | Surprised (drops the bag) |
| 5 | **Pixel Honk** | A 16 x 16 pixel goose with a terracotta collar. Pixel-perfect at 16 and 32 px. | Surprised |
| 6 | **True North** | Goose seen from above, heading north-east on a dotted route: the arrow on your map. | Lost the plot (wrong way, looped route) |
| 7 | **Hello** | Head-on and badge-shaped, with two eyes, a front-view beak and the domestic goose's knob. Made for avatars. | Wink |
| 8 | **Origami** | A goose folded from paper in a long glide, half crane and half paper plane. | Lost the plot (tailspin) |

## My ranking

Scored on brand fit (Clay, "serious about your trip, not about itself"), scalability (24 px and favicon), animation potential, and how distinct it looks in an app-store grid.

1. **Carry-On.** It's the only direction where the mascot is visibly travelling, so it tells the app's story without words. It keeps today's line and fill language (ink outline, cream feathers), so the rest of the UI doesn't change, and the terracotta scarf ties it to the accent. It has the most animation range: walk cycle, scarf flutter, bag swing, the bag drop. Weakness: the full drawing is busy below 64 px, so it needs the simplified 24 px icon (no bag) and a simpler app icon.
2. **Hello.** This is the best app icon and avatar: it's face-on, makes eye contact and fills the tile. Two eyes give it the widest range of expressions, so all seven current expressions would map over directly. The knob keeps it a goose, not a duck. Weakness: there's no body, so it can't walk or fly in tour scenes on its own. It pairs well with Carry-On as the "head" version.
3. **Three-Piece.** It scales best: at 24 px and in the store grid it stays crisp and is instantly distinct. It's also the easiest to animate in CSS (three shapes, so the neck can bob and the beak open). Weakness: flat fills move away from the outline style, and its look is cooler and more design-led than the brand voice.
4. **One Line.** It's elegant and would be lovely animated (it draws itself in empty states and loading). Weakness: it has thin presence at small sizes, little warmth, and only one expression channel (the eye).
5. **Clay Pebble.** It's the closest fit to the Clay surfaces, and very huggable. Weakness: it reads as a chick or duckling (the same problem as today, softer), and blob mascots are crowded in app stores.
6. **Origami.** It has distinctive motion and a travel link (the paper plane). Weakness: the facets get noisy at small sizes, faces are hard to give it, and it feels cool rather than cheeky.
7. **Pixel Honk.** It's the best of all at 16 px and fun, but the retro pixel look fights the soft Clay system everywhere except the favicon. It might be worth keeping as an easter egg.
8. **True North.** The idea is clever, but a goose from above doesn't read as a goose without context. It would work as a map marker inside the app, not as the mascot.

**Recommendation:** adopt **Carry-On** as the full-body Goose, with a **Hello**-style head for the app icon, avatars and small tiles. If one drawing has to do everything, choose Three-Piece for scalability, or Carry-On for character.

## What adopting one would touch

- **Logo files** in `docs/brand/logos/`: `goose-mark.svg`, `tag-mark.svg`, `app-icon-tag.svg`, `favicon-tag.svg`; plus the "The Goose" and "Logo" sections and the `goose-*` tokens in `BRAND.md` and `brand-tokens.json` / `dark-tokens.json`.
- **The component**: `src/ui/GooseMark.jsx` (all seven expressions: happy, excited, worried, sleepy, reading, lost, sad), the `g-*` and `c-goose-tile` styles in `src/ui/ui.css`, and `TagMark`. Around 16 files import these, so redrawing the component updates them all.
- **Screens with bespoke Goose art**: onboarding tour (`src/screens/auth/TourArt.jsx`, `tour.css`, `Onboarding.jsx`), `AuthScreen.jsx`, empty and error states (`src/ui/States.jsx`, including "Goose lost the plot"), HONK (`HonkView.jsx`), Explore and Guide, Profile, Help, Settings, Delete account, and the side pages (`src/beta`, `src/upgrade`, `src/redeem`, `src/unsubscribe`, `src/admin`).
- **Web and PWA icons** in `public/`: `favicon.svg`, `favicon.ico`, `favicon.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, and the OG images (`og-image.png`, `og-home.png`, `og-beta.png`).
- **Native**: `assets/icon-*.png` and `assets/splash*.png` (Capacitor assets source), then regenerate `ios/App/App/Assets.xcassets/AppIcon.appiconset` and `Splash.imageset`, and the Android `res/mipmap-*` and `drawable*` splash files.
- **Stores**: App Store and Play listing icons, screenshots and feature graphic, plus the ad and footage packs that show Goose.
- **Email**: Goose art in Supabase function emails (`send-welcome-email`, `send-invite`, `beta-invite`, `beta-signup`, `_shared/betaEmails.js`).

A switch to a new icon on iOS and Android counts as a new app version for review, so it's best bundled with a planned release.
