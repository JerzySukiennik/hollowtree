import { launch, openGame } from './lib/session.mjs';
const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

// Walk a full day-night cycle and record the golden-hour drive.
const curve = await page.evaluate(() => {
  const ht = window.hollowtree;
  const out = [];
  for (let k = 0; k < 1000; k++) {
    const t = k / 1000;
    ht.post.setDayPhase(t);
    out.push([t, ht.post.gradeDebug().golden]);
  }
  return out;
});

// How many separate events, how wide, and is the curve continuous?
const events = [];
let run = null;
for (const [t, g] of curve) {
  if (g > 0.02 && !run) run = { start: t, peak: 0, peakAt: 0 };
  if (run) { if (g > run.peak) { run.peak = g; run.peakAt = t; } }
  if (g <= 0.02 && run) { run.end = t; events.push(run); run = null; }
}
if (run) { run.end = 1; events.push(run); }
let maxStep = 0;
for (let i = 1; i < curve.length; i++) maxStep = Math.max(maxStep, Math.abs(curve[i][1] - curve[i - 1][1]));
// Wrap-around step, so an event near midnight cannot hide a seam.
maxStep = Math.max(maxStep, Math.abs(curve[0][1] - curve[curve.length - 1][1]));

// Screenshots: noon against dusk, through the real post stack.
const shots = [];
for (const [name, t] of [['noon', 0.5], ['dusk', 0.80]]) {
  await page.evaluate((v) => {
    const ht = window.hollowtree;
    if (!ht.post.__realDay) ht.post.__realDay = ht.post.setDayPhase.bind(ht.post);
    if (!ht.post.__realSeason) ht.post.__realSeason = ht.post.setSeasonPhase.bind(ht.post);
    ht.post.__realSeason(1, 0.4);
    ht.post.setSeasonPhase = () => {};
    ht.post.__realDay(v);
    ht.post.setDayPhase = () => {};
    ht.sky.update(0.016, v, ht.camera.position);
  }, t);
  await stepper.step(4);
  await page.screenshot({ path: `out/golden-${name}.png` });
  shots.push(name);
}

console.log(JSON.stringify({
  events: events.map((e) => ({
    startsAt: +e.start.toFixed(3),
    peaksAt: +e.peakAt.toFixed(3),
    endsAt: +e.end.toFixed(3),
    widthOfDay: +(e.end - e.start).toFixed(3),
    peak: +e.peak.toFixed(3),
  })),
  largestStep: +maxStep.toFixed(5),
  shots,
}, null, 1));
await browser.close();
