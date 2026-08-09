// Hollowtree trailer — what is the translucent column over the trunk? Renders b2 at a
// fixed frame, then hides one candidate group at a time and re-renders, so the offender
// can be named rather than guessed.

import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openGame, setTimeOfDay } from './lib/session.mjs';
import { shotList, PREROLL } from './lib/render-shot.mjs';

mkdirSync('tmp/col', { recursive: true });
const SHOT = 'b2-meadow';
const TARGET = 90;

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });
const shot = (await shotList(page)).find((s) => s.id === SHOT);
await setTimeOfDay(page, shot.timeOfDay);
await page.evaluate((id) => window.__cine.beginShot(id), SHOT);
for (let i = 0; i < PREROLL; i++) await stepper.advance(0);
for (let i = 0; i <= TARGET; i++) await stepper.advance(i);

const tree = await page.evaluate(() => {
  const out = [];
  window.hollowtree.scene.traverse((o) => {
    if (!o.visible) return;
    if (o.isMesh || o.isPoints || o.isLine || o.isSprite) {
      const m = o.material;
      const mats = Array.isArray(m) ? m : [m];
      const transparent = mats.some((x) => x && (x.transparent || (x.opacity !== undefined && x.opacity < 1)));
      if (!transparent) return;
      out.push({
        name: o.name || '(unnamed)',
        parent: o.parent ? (o.parent.name || '(unnamed)') : null,
        type: o.type,
        opacity: mats[0] ? mats[0].opacity : null,
        depthWrite: mats[0] ? mats[0].depthWrite : null,
        blending: mats[0] ? mats[0].blending : null,
        renderOrder: o.renderOrder,
        pos: [+o.position.x.toFixed(2), +o.position.y.toFixed(2), +o.position.z.toFixed(2)],
        count: o.isInstancedMesh ? o.count : null,
      });
    }
  });
  return out;
});
console.log('transparent visible objects:');
for (const t of tree) console.log(' ', JSON.stringify(t));

const state = await page.evaluate(() => {
  const ht = window.hollowtree;
  return {
    insideness: ht.nest.portal.state.insideness,
    portalState: JSON.parse(JSON.stringify(ht.nest.portal.state)),
    interiorVisible: ht.nest.interior && ht.nest.interior.group ? ht.nest.interior.group.visible : null,
    fog: { density: ht.scene.fog ? ht.scene.fog.density : null, color: ht.scene.fog ? ht.scene.fog.color.getHexString() : null },
    weather: ht.weather.state.kind,
    combCount: ht.nest.comb ? ht.nest.comb.count : null,
  };
});
console.log('state', JSON.stringify(state, null, 1));

writeFileSync('tmp/col/base.png', await stepper.buffer());

// Hide candidates one at a time.
const CANDIDATES = [
  ['interior', () => { const g = window.hollowtree.nest.interior.group; g.visible = false; return true; }],
  ['comb', () => { const c = window.hollowtree.nest.comb; if (c && c.group) { c.group.visible = false; return true; } return false; }],
  ['swarm', () => { const s = window.hollowtree.swarm; if (s && s.group) { s.group.visible = false; return true; } return false; }],
];
for (const [name, fn] of CANDIDATES) {
  const ok = await page.evaluate(`(${fn.toString()})()`);
  await stepper.advance(TARGET);
  writeFileSync(`tmp/col/hide-${name}.png`, await stepper.buffer());
  console.log('hid', name, ok);
  await page.evaluate(`(${fn.toString().replace('false', 'true')})()`);
}

await browser.close();
