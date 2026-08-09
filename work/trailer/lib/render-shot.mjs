// Hollowtree trailer — renders one shot to PNG frames, deterministically.

import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { setTimeOfDay, STEP_MS } from './session.mjs';

export const PREROLL = 60;

export async function renderShot(page, stepper, shot, {
  outDir = null,
  everyN = 1,
  firstFrame = 0,
  lastFrame = null,
  hash = true,
  onFrame = null,
} = {}) {
  if (outDir) mkdirSync(outDir, { recursive: true });

  // Clock first, weather second. The weather schedule is indexed off the world clock, so
  // stamping a phase and then moving the clock lands the shot somewhere else in the chain
  // — which is how a request for clear sky turned into rain.
  if (typeof shot.timeOfDay === 'number') await setTimeOfDay(page, shot.timeOfDay);
  await page.evaluate((sid) => window.__cine.beginShot(sid), shot.id);

  // Preroll: hold the opening frame while the world catches up to it.
  for (let i = 0; i < PREROLL; i++) await stepper.advance(0);

  const total = Math.round(shot.seconds * 60);
  const end = lastFrame === null ? total : Math.min(total, lastFrame);
  const hashes = [];

  for (let i = 0; i < end; i++) {
    await stepper.advance(i);
    if (i < firstFrame) continue;
    if ((i - firstFrame) % everyN !== 0) continue;
    const buf = await stepper.buffer();
    if (outDir) writeFileSync(join(outDir, `${String(i).padStart(5, '0')}.png`), buf);
    if (hash) hashes.push(createHash('sha256').update(buf).digest('hex'));
    if (onFrame) await onFrame(i, buf);
  }
  return { id: shot.id, frames: end, hashes };
}

export async function shotList(page) {
  return page.evaluate(() => window.__cine.ORDER.map((id) => {
    const info = window.__cine.shotInfo(id);
    return info;
  }));
}
