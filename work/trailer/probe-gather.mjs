// Does gathering still credit the baskets after the audio layer landed? Drives the real
// loop — real charge ramp, real flowers.drain — rather than poking gather.state, because
// poking `active` without `charge` credits nothing by design and would fake a defect.

import { launch, openGame } from './lib/session.mjs';

const browser = await launch();
const { page, stepper } = await openGame(browser, { dateEpoch: 1754640000000 });

const out = await page.evaluate(async () => {
  const ht = window.hollowtree;
  const gather = ht.gather;
  const flight = ht.flight;
  if (!gather) return { error: 'no gather on window.hollowtree' };

  // Park her on top of a bloom, dead still: gathering refuses above a speed threshold.
  const near = ht.flowers.sampleNearest(flight.position, 400);
  if (!near) return { error: 'no flower found within 400' };
  flight.position.set(near.position.x, near.position.y + 0.6, near.position.z);
  if (flight.velocity) flight.velocity.set(0, 0, 0);

  const log = [];
  const step = (n, wants) => {
    for (let i = 0; i < n; i++) {
      if (flight.velocity) flight.velocity.set(0, 0, 0);
      gather.update(1 / 60, { gather: wants });
    }
    log.push({
      wants,
      load: +gather.state.load.toFixed(4),
      charge: +gather.state.charge.toFixed(3),
      fill: +gather.state.fill.toFixed(3),
      hint: gather.state.hint,
      nearFlower: gather.state.nearFlower,
      tooFast: gather.state.tooFast,
    });
  };

  step(30, false);   // idle: should stay at zero
  step(120, true);   // two seconds of holding: should climb
  step(120, true);   // and keep climbing
  return { flower: near.species ? near.species.name : '?', log };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
