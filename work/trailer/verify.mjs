// Hollowtree trailer — verification pass on the FINISHED file, not on the intermediates.
// Pulls a still from the middle of every shot plus the two moments Jurek flagged, builds a
// contact sheet, and prints what ffprobe says the file actually is.

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { timeline, duration } from './lib/edit.mjs';

const FFMPEG = '/usr/local/bin/ffmpeg';
const FFPROBE = '/usr/local/bin/ffprobe';
const FILE = 'out/hollowtree-trailer.mp4';
const DIR = 'tmp/verify';

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const TL = timeline();
const marks = [];
for (const row of TL) {
  marks.push({ t: row.start + row.seconds * 0.5, label: row.id });
}
// The two complaints, sampled densely enough to catch a one-frame jump.
for (const t of [6.8, 7.0, 7.2]) marks.push({ t, label: `note1-${t}` });
for (let t = 11.0; t <= 14.0; t += 0.5) marks.push({ t, label: `note2-${t.toFixed(1)}` });
marks.sort((a, b) => a.t - b.t);

marks.forEach((m, i) => {
  execFileSync(FFMPEG, [
    '-y', '-loglevel', 'error', '-ss', String(m.t), '-i', FILE,
    '-frames:v', '1', `${DIR}/${String(i).padStart(3, '0')}-${m.label}.png`,
  ]);
});

execFileSync('bash', ['contact-sheet.sh', DIR, 'out/contact-sheet.png', '5', '440'], { stdio: 'inherit' });

const probe = JSON.parse(execFileSync(FFPROBE, [
  '-v', 'error', '-show_format', '-show_streams', '-of', 'json', FILE,
], { encoding: 'utf8' }));
const v = probe.streams.find((s) => s.codec_type === 'video');
const a = probe.streams.find((s) => s.codec_type === 'audio');
const [num, den] = v.r_frame_rate.split('/').map(Number);
console.log(`\n${FILE}`);
console.log(`  ${v.width}x${v.height}  ${num / den} fps  ${v.codec_name} ${v.profile}/${v.pix_fmt}  ${v.nb_frames} frames`);
console.log(`  ${Number(probe.format.duration).toFixed(2)} s (edit says ${duration().toFixed(2)} s)`);
console.log(`  ${(Number(probe.format.size) / 1048576).toFixed(1)} MB  ${(Number(probe.format.bit_rate) / 1e6).toFixed(2)} Mb/s`);
console.log(`  audio ${a.codec_name} ${a.sample_rate} Hz ${a.channels}ch ${Math.round(Number(a.bit_rate) / 1000)} kb/s`);
console.log(`  stills in ${DIR}, sheet at out/contact-sheet.png`);
