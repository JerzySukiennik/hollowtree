// Hollowtree trailer — per-frame telemetry for one shot. Dumps camera, queen, motion-blur
// and DoF state for every frame so a defect can be located by number rather than by eye.
//
//   node diag-b2.mjs b2-meadow > out/telemetry-b2.json

import { writeFileSync } from 'node:fs';
import { launch, openGame, setTimeOfDay } from './lib/session.mjs';
import { shotList } from './lib/render-shot.mjs';
import { PREROLL } from './lib/render-shot.mjs';

const SHOT = process.argv[2] || 'b2-meadow';

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
const shot = (await shotList(page)).find((s) => s.id === SHOT);
if (!shot) throw new Error('no shot ' + SHOT);

await setTimeOfDay(page, shot.timeOfDay);
await page.evaluate((id) => window.__cine.beginShot(id), SHOT);

// Wrap the guards so we can see exactly how much each one moved the lens this frame.
await page.evaluate(() => {
  const api = window.__cine.api;
  window.__guard = { push: 0, flower: 0 };
  // Hook the camera write: record the position the shot asked for, before any guard.
  const realApply = api.applyCamera;
  window.__raw = null;
});

const total = Math.round(shot.seconds * 60);
for (let i = 0; i < PREROLL; i++) await stepper.advance(0);

const rows = [];
for (let i = 0; i < total; i++) {
  await stepper.advance(i);
  const r = await page.evaluate((idx) => {
    const ht = window.hollowtree;
    const c = ht.camera;
    const f = ht.flight;
    const md = ht.post && ht.post.motionDebug ? ht.post.motionDebug() : {};
    // Where the queen lands on screen, in normalised device coords.
    const p = f.position.clone().project(c);
    return {
      i: idx,
      cam: [+c.position.x.toFixed(4), +c.position.y.toFixed(4), +c.position.z.toFixed(4)],
      quat: [+c.quaternion.x.toFixed(5), +c.quaternion.y.toFixed(5), +c.quaternion.z.toFixed(5), +c.quaternion.w.toFixed(5)],
      fov: +c.fov.toFixed(3),
      qsim: [+f.simPosition.x.toFixed(4), +f.simPosition.y.toFixed(4), +f.simPosition.z.toFixed(4)],
      qren: [+f.position.x.toFixed(4), +f.position.y.toFixed(4), +f.position.z.toFixed(4)],
      ndc: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(5)],
      dist: +c.position.distanceTo(f.position).toFixed(3),
      drive: +(md.motionDrive || 0).toFixed(5),
      strength: +(md.strength || 0).toFixed(5),
      cut: Boolean(md.cutThisFrame),
      cuts: md.cutCount || 0,
    };
  }, i);
  rows.push(r);
}

await browser.close();

// ------------------------------------------------------------------ analysis
function d3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

let out = [];
for (let i = 1; i < rows.length; i++) {
  const a = rows[i - 1], b = rows[i];
  out.push({
    i: b.i,
    t: +(b.i / 60).toFixed(3),
    camStep: +d3(a.cam, b.cam).toFixed(4),
    qStep: +d3(a.qren, b.qren).toFixed(4),
    ndcStep: +Math.hypot(a.ndc[0] - b.ndc[0], a.ndc[1] - b.ndc[1]).toFixed(4),
    ndcY: b.ndc[1],
    camY: b.cam[1],
    qY: b.qren[1],
    strength: b.strength,
    drive: b.drive,
    cut: b.cut,
    dist: b.dist,
  });
}

writeFileSync(`out/telemetry-${SHOT}.json`, JSON.stringify({ shot: SHOT, rows, deltas: out }, null, 1));

const camMed = median(out.map((r) => r.camStep));
console.log(`shot ${SHOT}  ${rows.length} frames`);
console.log(`median camStep ${camMed.toFixed(4)} m/frame  (= ${(camMed * 60).toFixed(2)} m/s)`);
console.log('\nworst camera steps:');
[...out].sort((a, b) => b.camStep - a.camStep).slice(0, 12)
  .sort((a, b) => a.i - b.i)
  .forEach((r) => console.log(`  t=${r.t.toFixed(3)} f=${r.i}  camStep ${r.camStep.toFixed(3)}  camY ${r.camY}  ndcY ${r.ndcY}  qY ${r.qY}  strength ${r.strength}`));
console.log('\nworst on-screen queen jumps (ndc):');
[...out].sort((a, b) => b.ndcStep - a.ndcStep).slice(0, 12)
  .sort((a, b) => a.i - b.i)
  .forEach((r) => console.log(`  t=${r.t.toFixed(3)} f=${r.i}  ndcStep ${r.ndcStep.toFixed(3)}  ndcY ${r.ndcY}  camY ${r.camY}  camStep ${r.camStep}`));
console.log('\nstrength profile (every 30 frames):');
for (let i = 0; i < out.length; i += 30) {
  const r = out[i];
  console.log(`  t=${r.t.toFixed(2)}  strength ${r.strength}  drive ${r.drive}  dist ${r.dist}  camStep ${r.camStep}  ndcY ${r.ndcY}`);
}
console.log(`\ncuts detected: ${rows[rows.length - 1].cuts}`);

function median(a) { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
