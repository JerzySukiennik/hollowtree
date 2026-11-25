// Hollowtree trailer — the edit. One source of truth for what is in the cut, how long each
// shot runs and where the dissolves fall; captions and assembly both derive from it.
//
// Every block is in this list. Insert or remove a row and everything downstream — the
// timeline, the caption offsets and the ffmpeg graph — recomputes itself.

export const FPS = 60;
export const XFADE = 0.5;

export const CUT = [
  { id: 'b1-opening', seconds: 6.0, block: 1 },
  { id: 'b2-meadow', seconds: 11.0, block: 2 },
  { id: 'b3a-approach', seconds: 3.6, block: 3 },
  { id: 'b3b-scoop', seconds: 4.0, block: 3 },
  { id: 'b3c-lift', seconds: 3.4, block: 3 },

  { id: 'b4a-enter', seconds: 3.2, block: 4 },
  { id: 'b4b-hall', seconds: 4.2, block: 4 },
  { id: 'b4c-comb', seconds: 6.6, block: 4 },

  { id: 'b5-seasons', seconds: 12.0, block: 5 },

  // Block 6 is the hornet raid, not the spec's "three queens, one hollow". Three
  // simultaneous clients in one hive is beyond this harness; an attack is the beat that was
  // asked for and it is real footage of the game's own raid system.
  { id: 'b6-hornets', seconds: 5.6, block: 6 },

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
