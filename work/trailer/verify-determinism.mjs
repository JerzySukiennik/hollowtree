// Hollowtree trailer — determinism proof. Renders the same two-second span twice, in two
// separate browser sessions, and compares the SHA-256 of every PNG. If a single frame
// differs the render is not reproducible and the agent-critic loop is judging noise, so
// this exits non-zero and names the first frame that drifted.
//
//   node verify-determinism.mjs [shotId] [startFrame]

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openGame } from './lib/session.mjs';
import { renderShot, shotList } from './lib/render-shot.mjs';

const shotId = process.argv[2] || 'b4c-comb';
const startFrame = Number(process.argv[3] || 60);
const SPAN = 120; // two seconds at 60 fps

mkdirSync('out', { recursive: true });

async function pass(label) {
  const dir = `tmp/determinism/${label}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const browser = await launch();
  const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
  const shot = (await shotList(page)).find((s) => s.id === shotId);
  if (!shot) throw new Error(`no such shot: ${shotId}`);
  const res = await renderShot(page, stepper, shot, {
    outDir: dir,
    firstFrame: startFrame,
    lastFrame: startFrame + SPAN,
    hash: true,
  });
  await browser.close();
  console.log(`pass ${label}: ${res.hashes.length} frames hashed`);
  return { hashes: res.hashes, dir };
}

// When hashes disagree, say by HOW MUCH. A run that differs by a fraction of one grey level
// on a handful of pixels is a different fact from one that re-rolls the scene, and the
// difference decides whether the agent-critic loop is judging the same material.
function pixelDelta(fileA, fileB) {
  const out = execFileSync('/usr/local/bin/ffmpeg', [
    '-hide_banner', '-i', fileA, '-i', fileB,
    '-filter_complex', 'blend=all_mode=difference,signalstats,metadata=print:file=-',
    '-f', 'null', '-',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const grab = (key) => {
    const m = out.match(new RegExp(`lavfi\\.signalstats\\.${key}=([-0-9.]+)`));
    return m ? Number(m[1]) : null;
  };
  return { maxY: grab('YMAX'), avgY: grab('YAVG'), maxU: grab('UMAX'), maxV: grab('VMAX') };
}

const A = await pass('A');
const B = await pass('B');
const a = A.hashes;
const b = B.hashes;

let firstDiff = -1;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] !== b[i]) { firstDiff = i; break; }
}

const frameFiles = [];
for (let i = 0; i < SPAN; i += Math.floor(SPAN / 6) || 1) {
  const name = `${String(startFrame + i).padStart(5, '0')}.png`;
  frameFiles.push({ frame: startFrame + i, name });
}
const deltas = frameFiles.map(({ frame, name }) => {
  try { return { frame, ...pixelDelta(join(A.dir, name), join(B.dir, name)) }; }
  catch (e) { return { frame, error: String(e).slice(0, 120) }; }
});

const report = {
  shot: shotId,
  span: `frames ${startFrame}..${startFrame + SPAN} (2.0 s at 60 fps)`,
  framesCompared: a.length,
  identical: firstDiff === -1 && a.length === b.length,
  firstDivergentFrame: firstDiff,
  passA: { first: a[0], last: a[a.length - 1] },
  passB: { first: b[0], last: b[b.length - 1] },
  sample: a.slice(0, 4).map((h, i) => ({ frame: startFrame + i, a: h, b: b[i], match: h === b[i] })),
  // Difference image statistics, 0-255 per channel. All zero means the two renders are
  // pixel-for-pixel the same image even where the PNG bytes are not.
  pixelDeltas: deltas,
};

writeFileSync('out/determinism.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (!report.identical) {
  console.error(`NOT DETERMINISTIC — first difference at frame index ${firstDiff}`);
  process.exit(1);
}
console.log('DETERMINISTIC — every frame hash matched across two independent sessions.');
