// Hollowtree trailer — caption plates and where they sit on the cut. Wording is block for
// block from SPEC-trailer.md; timings are derived from the edit so they cannot drift.

import { startOf, duration } from './edit.mjs';

export const FADE = 0.55;

const TITLE_AT = startOf('b7-endcard') + 1.0;
const CALL_AT = startOf('b7-endcard') + 3.6;

export const CAPTIONS = [
  { id: 'cap-1-intro', kind: 'lower', text: 'Introducing&hellip;', at: startOf('b1-opening') + 1.1, seconds: 3.6 },
  { id: 'cap-2-meadow', kind: 'lower', text: 'Explore a meadow that breathes', at: startOf('b2-meadow') + 1.4, seconds: 4.6 },
  { id: 'cap-3-gather', kind: 'lower', text: 'Gather what the hive needs', at: startOf('b3a-approach') + 0.5, seconds: 4.4 },

  // cap-4-build ("Build your hollow, cell by cell") is deliberately absent, because the
  // footage it describes is absent — see the block 4 gap in edit.mjs. A caption promising
  // a build system over a shot of a meadow would be the one thing in this cut that lies.
  // The plate is already rendered at captions/cap-4-build.png; when b4a/b4b/b4c go into
  // the edit, put this row back between the line above and the end card:
  //
  //   { id: 'cap-4-build', kind: 'lower', text: 'Build your hollow, cell by cell',
  //     at: startOf('b4a-enter') + 0.5, seconds: 4.6 },

  // The end card holds to the last frame: the title comes up first, the call to action
  // follows it in, and neither fades out. Their lengths are measured back from the end of
  // the cut rather than written down, so they stay welded to the last frame however long
  // the edit grows.
  { id: 'cap-5-title', kind: 'endTitle', at: TITLE_AT, seconds: +(duration() - TITLE_AT).toFixed(3), holdOut: true },
  { id: 'cap-6-call', kind: 'endCall', at: CALL_AT, seconds: +(duration() - CALL_AT).toFixed(3), holdOut: true },
];
