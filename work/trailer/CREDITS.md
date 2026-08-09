# Hollowtree trailer — credits and licences

## Music

**"Fantasy Orchestral Theme" — Joth**

| | |
|---|---|
| Licence | **CC0 1.0 Universal** (public domain dedication) — <https://creativecommons.org/publicdomain/zero/1.0/> |
| Source page | <https://opengameart.org/content/fantasy-orchestral-theme> |
| Direct file | <https://opengameart.org/sites/default/files/FantasyOrchestralTheme_1.mp3> |
| Local file | `work/trailer/music/track.mp3` |
| Downloaded | 2026-08-08 |
| Format | mp3, 44.1 kHz, stereo, 160 kb/s, 3:11.7 |

CC0 requires **no attribution**. The author's note on the source page reads that credit is
appreciated but not required. A courtesy line for the YouTube description:

```
Music: "Fantasy Orchestral Theme" by Joth — CC0 1.0 (public domain)
https://opengameart.org/content/fantasy-orchestral-theme
```

### Why not `assets/audio/cutscene-music.mp3`

That file ships with the game but its provenance is unknown. On a private page that does not
matter; on YouTube the soundtrack is fingerprinted against Content ID, and a track whose
origin cannot be established risks a claim, a regional block or a revenue takeover — which
happens routinely to material the uploader believed was free. The trailer therefore uses a
track whose licence is public and dated.

### Residual risk, stated plainly

CC0 is a dedication, not a guarantee against third-party fingerprinting: anyone may legally
re-upload a CC0 track to a distributor, and it can end up in Content ID under someone else's
name. That is unlikely for a 2016 OpenGameArt piece — OpenGameArt does not distribute to
DSPs — but it cannot be proven from the source page. Any claim that did appear would be a
bogus third-party claim and disputable, since the dedication is public and dated.

### Swapping the track

`assemble.mjs` reads the music from one constant:

```js
const MUSIC = 'music/track.mp3';
const MUSIC_START = 0.0;   // seconds into the track where the cut begins
const MUSIC_GAIN = 0.85;
```

Change `MUSIC`, re-run `node assemble.mjs`, done. Trim, fades and encoding do not care which
file it is. If Jurek confirms where `cutscene-music.mp3` came from and that it may be used
publicly, that is the only edit needed.

## Everything else

All footage is rendered from the running game in this repository — no stock, no external
imagery, no AI-generated frames. Fonts are the system UI stack the game itself uses
(`ui-rounded` / `system-ui`); no font files are embedded or redistributed.

Tooling: puppeteer (Apache-2.0) driving headless Chrome, and ffmpeg 8.1.2 for assembly.
