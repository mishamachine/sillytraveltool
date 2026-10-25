# STT ads: product-proof cut builder

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

## Inputs and sources

- Footage: `video/app-footage/*-light.mp4` (see its README). Not committed.
- Fonts: Space Grotesk and DM Sans variable TTFs, downloaded on first run from the Google Fonts repository (`github.com/google/fonts`, `ofl/spacegrotesk`, `ofl/dmsans`, SIL Open Font License) into `fonts/` (gitignored).
- Logo: `docs/brand/logos/tag-mark.svg`. Colours: `docs/brand/brand-tokens.json`.
- Audio: silent. Add a platform-licensed sound when posting.

## Notes

- Hook scene (ad A) runs 2.6 s, not 2 s, so every caption stays on screen at least 2.5 s.
- Outputs (`out/*.mp4`) are not committed.
- Footage shows demo fixture data (Sam Rivera, Maria and Tom Silva); re-record clips and re-check scene `ss` offsets if the app changes.
