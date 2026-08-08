// Hollowtree trailer — caption plates and where they sit on the cut. Wording is block for
// block from SPEC-trailer.md; timings are derived from the edit so they cannot drift.

import { startOf } from './edit.mjs';

export const FADE = 0.55;

export const CAPTIONS = [
  { id: 'cap-1-intro', kind: 'lower', text: 'Introducing&hellip;', at: startOf('b1-opening') + 1.1, seconds: 3.6 },
  { id: 'cap-2-meadow', kind: 'lower', text: 'Explore a meadow that breathes', at: startOf('b2-meadow') + 1.4, seconds: 4.6 },
  { id: 'cap-3-gather', kind: 'lower', text: 'Gather what the hive needs', at: startOf('b3a-approach') + 0.5, seconds: 4.4 },
  { id: 'cap-4-build', kind: 'lower', text: 'Build your hollow, cell by cell', at: startOf('b4a-enter') + 0.5, seconds: 4.6 },
  // The end card holds to the last frame: the title comes up first, the call to action
  // follows it in, and neither fades out.
  { id: 'cap-5-title', kind: 'endTitle', at: startOf('b7-endcard') + 1.0, seconds: 8.0, holdOut: true },
  { id: 'cap-6-call', kind: 'endCall', at: startOf('b7-endcard') + 3.6, seconds: 5.4, holdOut: true },
];
