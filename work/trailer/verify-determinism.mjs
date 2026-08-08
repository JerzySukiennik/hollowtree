// Hollowtree trailer — determinism proof. Renders the same two-second span twice, in two
// separate browser sessions, and compares the SHA-256 of every PNG. If a single frame
// differs the render is not reproducible and the agent-critic loop is judging noise, so
// this exits non-zero and names the first frame that drifted.
//
//   node verify-determinism.mjs [shotId] [startFrame]

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';
import { renderShot, shotList } from './lib/render-shot.mjs';

const shotId = process.argv[2] || 'b4c-comb';
const startFrame = Number(process.argv[3] || 60);
const SPAN = 120; // two seconds at 60 fps

mkdirSync('out', { recursive: true });

async function pass(label) {
  const browser = await launch();
  const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
  const shot = (await shotList(page)).find((s) => s.id === shotId);
  if (!shot) throw new Error(`no such shot: ${shotId}`);
  const res = await renderShot(page, stepper, shot, {
    firstFrame: startFrame,
    lastFrame: startFrame + SPAN,
    hash: true,
  });
  await browser.close();
  console.log(`pass ${label}: ${res.hashes.length} frames hashed`);
  return res.hashes;
}

const a = await pass('A');
const b = await pass('B');

let firstDiff = -1;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) { firstDiff = i; break; }
}

const report = {
  shot: shotId,
  span: `frames ${startFrame}..${startFrame + SPAN} (2.0 s at 60 fps)`,
  framesCompared: a.length,
  identical: firstDiff === -1 && a.length === b.length,
  firstDivergentFrame: firstDiff,
  passA: { first: a[0], last: a[a.length - 1] },
  passB: { first: b[0], last: b[b.length - 1] },
  sample: a.slice(0, 6).map((h, i) => ({ frame: startFrame + i, a: h, b: b[i], match: h === b[i] })),
};

writeFileSync('out/determinism.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!report.identical) {
  console.error(`NOT DETERMINISTIC — first difference at frame index ${firstDiff}`);
  process.exit(1);
}
console.log('DETERMINISTIC — every frame hash matched across two independent sessions.');
