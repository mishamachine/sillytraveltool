# STT ads: product-proof cuts and fictional-traveller voice-overs

Builds three vertical ads (1080x1920, 30 fps, H.264 High, silent AAC track) from the real app footage pack. No generated media.

| Key | Ad | Length |
|---|---|---|
| `a` | "Forward it. Done." (lead) | 20 s |
| `b` | "Tools that switch" | 15 s |
| `c` | "Travel together" | 15 s |

Each ad is clips in a rounded device frame on the Clay background, a caption pill per scene (Space Grotesk 700, one terracotta word), 0.4 s cross-dissolves, and a 3 s end card (luggage tag, name, URL, Beta pill). Text sits in the middle 70% of the frame for TikTok and Reels UI. Light-mode clips only.

## Rebuild

```bash
cd video/ads
npm install --foreground-scripts   # ffmpeg-static (downloads the ffmpeg binary) + puppeteer-core
node build.mjs all                 # or: node build.mjs a | b | c
```

Options: `--footage DIR` (default `../app-footage`, or `$STT_FOOTAGE`), `--out DIR` (default `./out`), `--keep` (keep the rendered PNG assets). Env: `FFMPEG` (own ffmpeg binary), `CHROME` (Chrome path; otherwise the Playwright cache or `/Applications/Google Chrome.app`).

How it works: headless Chrome renders the device frame, caption pills and end card to PNG (so fonts, kerning and the SVG logo are exact); ffmpeg `filter_complex` trims and rescales each clip, dissolves them with `xfade`, masks the rounded screen, then overlays frame, captions (fade in/out) and end card. The npm ffmpeg build has no `drawtext`, which is why text is rendered in Chrome.

Edit scenes, timings and captions in the `VARIANTS` table at the top of `build.mjs` (`[word]` marks the terracotta word).

## Fictional-traveller voice-over ads

Four 22.9 s ads (1080x1920, 30 fps, H.264 High, AAC mono). Each fictional traveller talks in first person about one pain point and the one feature that solves it, over real footage. Under 60 spoken words each, no music.

| Persona | Story | Voice | Footage |
|---|---|---|---|
| Ana, family organiser | "five people, five inboxes": everyone forwards to Goose, one card per shared flight | Samantha (en_US, F) | 02, 07 |
| Marcus, business traveller | "landing at 6 am, where next": Today and Get there | Daniel (en_GB, M) | 05, 06 |
| Linda, long Europe trip | "new country, new currency, new emergency number": tools switch, SOS | Moira (en_IE, F) | 04, 09 |
| Dev, solo backpacker | "screenshots everywhere": forward the confirmation | Rishi (en_IN, M) | 01, 02, 03 |

Timeline: 0-2 s persona card (name, one-liner, "Fictional traveller"); 2-18 s voice-over, one footage scene and one caption pill per spoken line (cuts follow the speech); 18-20.4 s result line; 20.4-22.9 s end card with "Fictional traveller. Silly Travel Tool is in beta."

```bash
cd video/ads
node build.mjs --variant persona:all          # or persona:ana | persona:marcus | persona:linda | persona:dev
```

Outputs `out/stt-ad-persona-<name>.mp4`. Edit scripts, voices, rates, clips and captions in the `PERSONAS` table at the top of `build.mjs` (`say` is the spoken text, `[word]` is the terracotta word).

Voices are macOS `say` (offline; the Mac had no Premium/Enhanced voices installed, so these are the best standard ones). Each line is synthesised separately, trimmed, mixed on a timeline and loudness-normalised with two-pass `loudnorm` (-16 LUFS, true peak -1.5 dB); no room tone. Needs macOS and `say`; a different Mac with other voices installed will sound different, so keep the rendered MP4s. If a script runs long the build stops and tells you to shorten it or raise `rate`.

## Inputs and sources

- Footage: `video/app-footage/*-light.mp4` (see its README). Not committed.
- Fonts: Space Grotesk and DM Sans variable TTFs, downloaded on first run from the Google Fonts repository (`github.com/google/fonts`, `ofl/spacegrotesk`, `ofl/dmsans`, SIL Open Font License) into `fonts/` (gitignored).
- Logo: `docs/brand/logos/tag-mark.svg`. Colours: `docs/brand/brand-tokens.json`.
- Audio: ads A-C are silent (add a platform-licensed sound when posting); persona ads carry the `say` voice-over.

## Notes

- Hook scene (ad A) runs 2.6 s, not 2 s, so every caption stays on screen at least 2.5 s.
- Outputs (`out/*.mp4`) are not committed.
- Footage shows demo fixture data (Sam Rivera, Maria and Tom Silva); re-record clips and re-check scene `ss` offsets if the app changes.
