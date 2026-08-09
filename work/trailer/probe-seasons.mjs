import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const names = ['spring', 'summer', 'autumn', 'prewinter'];
const rows = [];
for (let i = 0; i < 4; i++) {
  // Mid-season, well clear of the handover, so each shot is that season wearing its own
  // colour rather than halfway into the next.
  // The loop drives the season from the real calendar every frame, so pin it: set the
  // phase we want, then make further calls no-ops for the duration of the shot. And do
  // NOT call renderer.render here -- that draws the raw scene and skips the whole post
  // stack, which is where the season tint lives.
  await page.evaluate(([idx]) => {
    const ht = window.hollowtree;
    if (!ht.post.__realSetSeason) ht.post.__realSetSeason = ht.post.setSeasonPhase.bind(ht.post);
    ht.post.__realSetSeason(idx, 0.4);
    ht.post.setSeasonPhase = () => {};
  }, [i]);
  await stepper.step(4);
  await page.screenshot({ path: `out/season-${i}-${names[i]}.png` });
  rows.push(names[i]);
}

// Is the handover smooth? Walk one season's last stretch and look for a jump.
const curve = await page.evaluate(() => {
  const ht = window.hollowtree;
  const out = [];
  const real = ht.post.__realSetSeason || ht.post.setSeasonPhase.bind(ht.post);
  // Walk a whole season plus the first slice of the next, in fine steps, and record the
  // graded colour so any discontinuity shows up as a spike in the difference.
  for (let k = 0; k <= 400; k++) {
    const t = k / 400;
    real(1, t);
    const d = ht.post.gradeDebug();
    out.push([d.tint[0] * d.mix, d.tint[1] * d.mix, d.tint[2] * d.mix]);
  }
  real(2, 0);
  const d = ht.post.gradeDebug();
  out.push([d.tint[0] * d.mix, d.tint[1] * d.mix, d.tint[2] * d.mix]);
  return out;
});
console.log('shots:', rows.join(', '));
let maxStep = 0;
for (let i = 1; i < curve.length; i++) {
  const step = Math.max(
    Math.abs(curve[i][0] - curve[i - 1][0]),
    Math.abs(curve[i][1] - curve[i - 1][1]),
    Math.abs(curve[i][2] - curve[i - 1][2]),
  );
  if (step > maxStep) maxStep = step;
}
console.log('largest single step across the whole handover:', maxStep.toFixed(5));
console.log('total change across the handover:', Math.max(
  Math.abs(curve[curve.length - 1][0] - curve[0][0]),
  Math.abs(curve[curve.length - 1][1] - curve[0][1]),
  Math.abs(curve[curve.length - 1][2] - curve[0][2]),
).toFixed(4));
await browser.close();
