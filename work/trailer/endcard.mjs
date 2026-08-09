// Hollowtree trailer — the end-card plate, block 7 of SPEC-trailer.md, built with ffmpeg
// alone. The in-engine b7-endcard shot (a dusk orbit of the tree) is defined in
// lib/shots.js and still wants rendering; until the browser is free this stands in for it.
//
// It is NOT a synthetic graphic. The pictures are real captured frames — the tail of
// b1-opening, where the crane has slowed to a crawl on the mouth of the hollow — retimed
// to a quarter speed and graded down toward evening. Grass and leaves still move, so the
// card breathes instead of freezing, and every pixel still came out of the running game.
//
// Bookending on the hollow is deliberate: the trailer opens finding the tree and closes
// back on it with the title over the top.
//
//   node endcard.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const FFMPEG = '/usr/local/bin/ffmpeg';
const FFPROBE = '/usr/local/bin/ffprobe';

const SRC = 'shots/b1-opening.mp4';
const OUT = 'shots/b7-endcard.mp4';
const SECONDS = 9.0;          // must match lib/edit.mjs and lib/shots.js
const FPS = 60;

// The slowest, steadiest stretch of the opening crane: by here the move has almost
// stopped, so a 4x stretch reads as a held shot rather than as slow motion.
const FROM = 224;
const COUNT = Math.round((SECONDS * FPS) / 4);   // 135 source frames -> 540 output frames

if (!existsSync(SRC)) throw new Error(`missing ${SRC}`);
mkdirSync('shots', { recursive: true });

const filter = [
  // Take the tail, restart its clock, then stretch it fourfold.
  `select='gte(n\\,${FROM})*lt(n\\,${FROM + COUNT})'`,
  `setpts=(PTS-STARTPTS)*4.0`,
  // No synthetic push on top. The crane is still creeping in these frames and a quarter
  // speed keeps that alive; a zoompan over it only added integer-pixel stepping, which on
  // a shot this slow reads as a stutter rather than as a move.
  // Toward evening: pull the blues down, keep the honey in the rim of the hollow, and let
  // the corners fall away so the title has somewhere quiet to sit.
  `eq=brightness=-0.055:contrast=1.04:saturation=0.94`,
  `colorbalance=rs=0.055:bs=-0.075:rm=0.045:gm=0.005:bm=-0.060:rh=0.02:bh=-0.03`,
  `vignette=angle=PI/4.6`,
  // The retime lands a frame or two short of nine seconds. Hold the last frame past the
  // end and let -t cut it dead on, so the shot is exactly as long as the edit says it is
  // and every xfade offset downstream stays true.
  `tpad=stop_mode=clone:stop_duration=0.5`,
  `fps=${FPS}`,
  `format=yuv420p`,
].join(',');

execFileSync(FFMPEG, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-i', SRC,
  '-vf', filter,
  '-an',
  '-r', String(FPS),
  '-t', String(SECONDS),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '10',
  '-pix_fmt', 'yuv420p', '-color_range', 'tv',
  OUT,
], { stdio: ['ignore', 'inherit', 'inherit'] });

const probe = JSON.parse(execFileSync(FFPROBE, [
  '-v', 'error', '-show_format', '-show_streams', '-of', 'json', OUT,
], { encoding: 'utf8' }));
const v = probe.streams.find((s) => s.codec_type === 'video');
console.log(`${OUT}  ${v.width}x${v.height}  ${v.nb_frames} frames  ${Number(probe.format.duration).toFixed(2)}s`);
