// Hollowtree trailer — isolate the halo around the queen at 0:07. Renders the same shot
// frame with the post stack's passes switched on and off one at a time, so the artifact can
// be attributed rather than guessed at.
//
//   node diag-blur.mjs [shot] [t-seconds]

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openGame, setTimeOfDay } from './lib/session.mjs';
import { shotList, PREROLL } from './lib/render-shot.mjs';

const SHOT = process.argv[2] || 'b2-meadow';
const AT = Number(process.argv[3] || 1.5);
const TARGET = Math.round(AT * 60);

mkdirSync('tmp/blur', { recursive: true });

const VARIANTS = [
  { name: 'as-is', apply: () => {} },
  { name: 'no-motion', apply: () => { window.hollowtree.post.toggles.motion = false; } },
  { name: 'no-dof', apply: () => { window.hollowtree.post.toggles.dof = false; } },
  { name: 'neither', apply: () => { window.hollowtree.post.toggles.motion = false; window.hollowtree.post.toggles.dof = false; } },
  {
    name: 'motion-nearpush',
    apply: () => {
      const u = window.hollowtree.post.materials.motion.uniforms;
      u.uNearStart.value = 12.0;
      u.uNearEnd.value = 30.0;
    },
  },
];

const report = [];
for (const v of VARIANTS) {
  // A fresh session per variant. Sharing one page lets an earlier variant's frames leave
  // the world in a slightly different state, and the differences that then show up in the
  // crops are the state, not the toggle under test.
  const browser = await launch();
  const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
  const shot = (await shotList(page)).find((s) => s.id === SHOT);
  await setTimeOfDay(page, shot.timeOfDay);
  await page.evaluate((id) => window.__cine.beginShot(id), SHOT);
  await page.evaluate(`(${v.apply.toString()})()`);
  for (let i = 0; i < PREROLL; i++) await stepper.advance(0);
  for (let i = 0; i <= TARGET; i++) await stepper.advance(i);
  const buf = await stepper.buffer();
  writeFileSync(`tmp/blur/${SHOT}-${AT}-${v.name}.png`, buf);
  const st = await page.evaluate(() => {
    const ht = window.hollowtree;
    const md = ht.post.motionDebug();
    const p = ht.flight.position.clone().project(ht.camera);
    return {
      strength: +md.strength.toFixed(4), drive: +md.motionDrive.toFixed(4), cut: md.cutThisFrame,
      dist: +ht.camera.position.distanceTo(ht.flight.position).toFixed(3),
      ndc: [+p.x.toFixed(3), +p.y.toFixed(3)],
      dofFocus: +ht.post.materials.dof.uniforms.uFocus.value.toFixed(3),
      dofRange: ht.post.materials.dof.uniforms.uRange.value,
    };
  });
  report.push({ variant: v.name, ...st });
  console.log(v.name, JSON.stringify(st));
  await browser.close();
}

writeFileSync(`tmp/blur/report-${SHOT}-${AT}.json`, JSON.stringify(report, null, 2));
