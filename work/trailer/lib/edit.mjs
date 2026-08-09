// Hollowtree trailer — the edit. One source of truth for what is in the cut, how long each
// shot runs and where the dissolves fall; captions and assembly both derive from it.
//
// Blocks 5 and 6 of SPEC-trailer.md are not in this list. To add them, insert their shots
// where the gap comments are and everything downstream — timeline, captions, ffmpeg graph —
// recomputes itself.

export const FPS = 60;
export const XFADE = 0.5;

export const CUT = [
  { id: 'b1-opening', seconds: 6.0, block: 1 },
  { id: 'b2-meadow', seconds: 11.0, block: 2 },
  { id: 'b3a-approach', seconds: 3.6, block: 3 },
  { id: 'b3b-scoop', seconds: 4.0, block: 3 },
  { id: 'b3c-lift', seconds: 3.4, block: 3 },

  // ------------------------------------------------------------------ GAP: block 4
  // "Build your hollow, cell by cell" — the heart of the trailer, and the one block that
  // is not shot. It belongs HERE, between the lift-off and the end card, and it is 13.4 s
  // of screen time (three shots, 14.0 s of footage less two 0.5 s dissolves):
  //
  //   { id: 'b4a-enter', seconds: 3.2, block: 4 },   flying in through the mouth
  //   { id: 'b4b-hall',  seconds: 4.2, block: 4 },   the hall opening up around her
  //   { id: 'b4c-comb',  seconds: 6.6, block: 4 },   the comb growing on the build bay
  //
  // All three are already authored in lib/shots.js; they only want rendering. Put the
  // three rows back in this spot, restore cap-4-build in captions.def.mjs, and the
  // timeline, the caption offsets and the ffmpeg graph all recompute themselves — the
  // cut goes from 34.5 s to 47.9 s with nothing else touched.
  //
  // GAP — block 5 "Weather the season" goes after block 4.
  // GAP — block 6 "Three queens, one hollow" goes after block 5.

  { id: 'b7-endcard', seconds: 9.0, block: 7 },
];

// Each dissolve eats XFADE seconds of the running time, because the two shots overlap.
export function timeline() {
  let t = 0;
  const out = [];
  for (let i = 0; i < CUT.length; i++) {
    const s = CUT[i];
    out.push({ ...s, start: t, end: t + s.seconds });
    t += s.seconds - (i < CUT.length - 1 ? XFADE : 0);
  }
  return out;
}

export function duration() {
  return CUT.reduce((a, s) => a + s.seconds, 0) - XFADE * (CUT.length - 1);
}

export function startOf(id) {
  const row = timeline().find((s) => s.id === id);
  return row ? row.start : 0;
}
