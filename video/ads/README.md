# Silly Travel Tool ads v2: light-hearted, energetic cuts

Builds seven vertical ads (1080x1920, 30 fps, H.264 High, AAC stereo) from the real app footage pack. The product is always called **Silly Travel Tool** (captions, voice-over, end card, file names). No generated video.

| Key | Ad | Length |
|---|---|---|
| `a` | "Forward it. Done." (lead) | about 19 s |
| `b` | "Tools that switch" | about 16 s |
| `c` | "Travel together" | about 14 s |
| persona | Ana, Marcus, Linda, Dev (fictional travellers, voice-over) | about 19 to 22 s |

Files are named `silly-travel-tool-ad-<key>-<name>.mp4` and `silly-travel-tool-ad-persona-<name>.mp4`, written to this folder (git-ignored).

## What makes them energetic

- **Fast cuts.** Scenes run 2 to 3 s and switch with 0.15 s snap transitions (slides and a zoom) instead of dissolves.
- **Pop-in captions.** Each caption scales up with a little overshoot and a tilt that settles, and the key word sits in a terracotta pill. Text stays in the middle 70% of the frame.
- **The ding.** When a forwarded booking lands in the trip (ad A, Ana, Dev) a terracotta "In the trip" badge pops with a bell ding. No confetti.
- **One playful Goose line per ad** (dry but warm), always the last scene: "Goose does the admin. You do the tapas." (A), "Goose switches. You just land." (B), "Zero what's-your-seat texts." (C), "I've retired as the group's search engine." (Ana), "Goose is up, so I don't have to be." (Marcus), "Border crossed. Goose didn't blink." (Linda), "My camera roll can go back to sunsets." (Dev).
- **End card.** The luggage-tag logo drops in and bounces, then "Silly Travel Tool", "sillytraveltool.com", the Beta pill and the disclosure line ("Real app footage. Silly Travel Tool is in beta." or "Fictional traveller. Silly Travel Tool is in beta.").
- **Rhythm bed.** A 120 bpm pulse synthesised by ffmpeg from sine waves and noise bursts (kick, clap, off-beat hats, bouncy bass, pentatonic pluck). No samples, so nothing to license. It sits low (about -24 LUFS on its own) and ducks under the voice on persona ads. Scene cuts land on the beat (0.5 s grid). **It is a placeholder: replace it with a licensed track before a paid launch** (swap the audio in `audioTrack()`, or add the platform's licensed sound when posting).

Phone frame and Clay background are unchanged. Light-mode clips only.

## Rebuild

```bash
cd video/ads
npm install --foreground-scripts       # ffmpeg-static (downloads the ffmpeg binary) + puppeteer-core
node build.mjs all                     # product-proof ads; or: node build.mjs a | b | c
node build.mjs --variant persona:all   # or persona:ana | persona:marcus | persona:linda | persona:dev
```

Options: `--footage DIR` (default `../app-footage`, `$ADS_FOOTAGE`, or the main checkout's `video/app-footage` when run from a worktree), `--out DIR` (default this folder), `--keep` (keep the rendered PNG assets). Env: `FFMPEG` (own ffmpeg binary), `CHROME` (Chrome path; otherwise the Playwright cache or `/Applications/Google Chrome.app`). A full rebuild takes roughly 15 minutes: Chrome renders the pop-in frames as PNG sequences.

How it works: headless Chrome renders the phone frame, caption pop-ins, the badge and the end card to PNG sequences (so fonts, kerning and the SVG logo are exact); ffmpeg `filter_complex` trims and rescales each clip, joins them with `xfade` snaps, masks the rounded screen, overlays frame, captions and badge, then joins the end card. The npm ffmpeg build has no `drawtext`, which is why text is rendered in Chrome. The bed, ding and thud come from the `aevalsrc` expressions `BED`, `DING` and `THUD` in the sound section of `build.mjs`.

Edit scenes, timings, captions and playful lines in `VARIANTS` (product ads; `dur` in multiples of 0.5 s so cuts stay on the beat) and `PERSONAS` (voice-over ads) at the top of `build.mjs`. `[word]` marks the terracotta pill word.

## Fictional-traveller voice-over ads

Each fictional traveller talks in first person about one pain point and the feature that solves it, over real footage. Upbeat, five short lines, under 45 spoken words each.

| Persona | Story | Voice | Footage |
|---|---|---|---|
| Ana, family organiser | "five people, five inboxes": everyone forwards to Goose, one card per shared flight | Samantha (en_US, F) | 02, 07 |
| Marcus, business traveller | "landing at 6 am, where next": Today and Get there | Daniel (en_GB, M) | 05, 06 |
| Linda, long Europe trip | "new country, new currency, new emergency number": tools switch, SOS | Moira (en_IE, F) | 04, 09 |
| Dev, solo backpacker | "screenshots everywhere": forward the confirmation | Rishi (en_IN, M) | 01, 02, 03 |

Timeline: 1.5 s persona card (name, one-liner, "Fictional traveller"); the voice-over, one scene and one caption per spoken line (each cut lands on a beat, speech starts 0.25 s later); 2 s result line; 2.8 s bouncing end card with the disclosure.

Voices are macOS `say` (offline; the Mac had no Premium/Enhanced voices, so these are the best standard ones). `synth()` is the one place to swap in natural voices (a Speechify path was blocked on the Basic plan). Each line is synthesised separately, trimmed, mixed on a timeline and loudness-normalised with two-pass `loudnorm` (-16 LUFS, true peak -1.5 dB), then mixed over the ducked bed. Needs macOS and `say`; a Mac with other voices installed will sound different, so keep the rendered MP4s.

## Inputs and sources

- Footage: `video/app-footage/*-light.mp4` (see its README). Not committed.
- Fonts: Space Grotesk and DM Sans variable TTFs, downloaded on first run from the Google Fonts repository (`github.com/google/fonts`, `ofl/spacegrotesk`, `ofl/dmsans`, SIL Open Font License) into `fonts/` (gitignored).
- Logo: `docs/brand/logos/tag-mark.svg`. Colours: `docs/brand/brand-tokens.json`.

## Rules these ads follow

Never the word "free", no prices, real features only, "Fictional traveller" on persona ads, end card "Silly Travel Tool is in beta.", Clay colours and fonts, no emoji, always the full product name.

## Notes

- Footage shows demo fixture data (Sam Rivera, Maria and Tom Silva); re-record clips and re-check scene `ss` offsets if the app changes.
- The pack builder is `../posting/build-pack.mjs`; re-run it with `--force` after every re-render.
