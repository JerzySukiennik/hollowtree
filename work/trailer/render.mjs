// Hollowtree trailer — full offline render. Every shot in the edit is stepped at a fixed
// 1/60 s and captured frame by frame to PNG, then encoded to a near-lossless intermediate.
// Nothing is screen-recorded and nothing runs on wall-clock time.
//
//   node render.mjs                 render every shot in the edit
//   node render.mjs b4c-comb ...    re-render only these
//   node render.mjs --keep-frames   leave the PNGs on disk

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { launch, openGame } from './lib/session.mjs';
import { renderShot, shotList } from './lib/render-shot.mjs';
import { CUT } from './lib/edit.mjs';

const FFMPEG = '/usr/local/bin/ffmpeg';
const args = process.argv.slice(2);
const keepFrames = args.includes('--keep-frames');
const only = args.filter((a) => !a.startsWith('--'));

mkdirSync('shots', { recursive: true });
mkdirSync('frames', { recursive: true });
mkdirSync('out', { recursive: true });

const manifestPath = 'out/render-manifest.json';
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { shots: {} };

const browser = await launch();
const { page, stepper, errors } = await openGame(browser, { dateEpoch: 1754640000000 });

const live = await shotList(page);
const byId = new Map(live.map((s) => [s.id, s]));

// The edit and the shot list are separate files on purpose — one is the cut, the other is
// the camera work — so they are checked against each other rather than assumed to agree.
for (const row of CUT) {
  const s = byId.get(row.id);
  if (!s) throw new Error(`edit.mjs lists ${row.id}, which the shot list does not define`);
  if (Math.abs(s.seconds - row.seconds) > 1e-6) {
    throw new Error(`${row.id}: edit says ${row.seconds}s, shots.js says ${s.seconds}s`);
  }
}

for (const row of CUT) {
  if (only.length && !only.includes(row.id)) continue;
  const shot = byId.get(row.id);
  const dir = `frames/${shot.id}`;
  rmSync(dir, { recursive: true, force: true });

  const t0 = Date.now();
  const res = await renderShot(page, stepper, shot, { outDir: dir, hash: true });
  const secs = (Date.now() - t0) / 1000;

  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-framerate', '60',
    '-i', `${dir}/%05d.png`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '10',
    '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    `shots/${shot.id}.mp4`,
  ]);

  manifest.shots[shot.id] = {
    seconds: shot.seconds,
    frames: res.frames,
    caption: shot.caption,
    timeOfDay: shot.timeOfDay,
    hud: shot.hud,
    // One hash per frame plus a digest of the lot: enough to prove two renders agree
    // without keeping two full frame sets around.
    frameHashes: res.hashes,
    digest: digestOf(res.hashes),
    renderedInSeconds: +secs.toFixed(1),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (!keepFrames) rmSync(dir, { recursive: true, force: true });
  console.log(`${shot.id.padEnd(14)} ${String(res.frames).padStart(4)} frames  ${secs.toFixed(1)}s  digest ${manifest.shots[shot.id].digest.slice(0, 16)}`);
}

if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 8));
await browser.close();

function digestOf(hashes) {
  const h = createHash('sha256');
  for (const x of hashes) h.update(x);
  return h.digest('hex');
}
