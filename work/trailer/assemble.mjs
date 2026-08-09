// Hollowtree trailer — assembly. Takes the per-shot intermediates, dissolves them together,
// lays the caption plates over the top, puts the music under it and encodes one H.264 file
// for YouTube. The whole graph is derived from lib/edit.mjs, so changing the cut changes
// this without editing a single ffmpeg argument.
//
// The music path is a single constant: swap MUSIC and nothing else moves.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { CUT, XFADE, timeline, duration } from './lib/edit.mjs';
import { CAPTIONS, FADE } from './lib/captions.def.mjs';

const FFMPEG = '/usr/local/bin/ffmpeg';
const FFPROBE = '/usr/local/bin/ffprobe';

// ---------------------------------------------------------------- swap point
// One path. Everything downstream — trim, fades, loudness — is independent of which file
// this is, so a different track is a one-line change. Licence in CREDITS.md.
const MUSIC = 'music/track.mp3';
// Where in the track the cut starts. The chosen piece opens quiet and builds, which is the
// shape of the edit, so it runs from the top.
const MUSIC_START = 0.0;
const MUSIC_GAIN = 0.85;

const OUT = 'out/hollowtree-trailer.mp4';
mkdirSync('out', { recursive: true });

const TL = timeline();
const TOTAL = duration();

for (const s of CUT) {
  if (!existsSync(`shots/${s.id}.mp4`)) {
    throw new Error(`missing shots/${s.id}.mp4 — run: node render.mjs ${s.id}`);
  }
}
if (!existsSync(MUSIC)) throw new Error(`missing ${MUSIC}`);
for (const c of CAPTIONS) {
  if (!existsSync(`captions/${c.id}.png`)) throw new Error(`missing captions/${c.id}.png — run: node captions.mjs`);
}

// ---------------------------------------------------------------- inputs
const inputs = [];
for (const s of CUT) inputs.push(['-i', `shots/${s.id}.mp4`]);
for (const c of CAPTIONS) {
  // Each plate becomes a still stream exactly as long as it is on screen; tpad then slides
  // it to its place on the timeline, so overlay never has to guess.
  inputs.push(['-loop', '1', '-framerate', '60', '-t', String(c.seconds), '-i', `captions/${c.id}.png`]);
}
inputs.push(['-ss', String(MUSIC_START), '-i', MUSIC]);

const musicIndex = CUT.length + CAPTIONS.length;

// ---------------------------------------------------------------- video graph
const filters = [];

// Dissolves. xfade's offset is measured on the RUNNING output, which already has every
// earlier transition's overlap subtracted out — that is what `timeline()` computes.
let vlabel;
if (CUT.length === 1) {
  filters.push(`[0:v]format=yuv420p[vcut]`);
  vlabel = 'vcut';
} else {
  let acc = CUT[0].seconds;
  let prev = '0:v';
  for (let i = 1; i < CUT.length; i++) {
    const offset = acc - XFADE;
    const out = i === CUT.length - 1 ? 'vcut' : `x${i}`;
    filters.push(`[${prev}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(4)}[${out}]`);
    acc = offset + CUT[i].seconds;
    prev = out;
  }
  vlabel = 'vcut';
}

// Open from black and close to black. The opening block is written as a fade up from
// darkness, so the grade and the edit agree rather than fighting.
filters.push(`[${vlabel}]fade=t=in:st=0:d=1.1,fade=t=out:st=${(TOTAL - 1.2).toFixed(3)}:d=1.2[vbase]`);

let base = 'vbase';
CAPTIONS.forEach((c, i) => {
  const idx = CUT.length + i;
  const outAt = c.holdOut ? null : Math.max(0, c.seconds - FADE);
  const fades = [`fade=t=in:st=0:d=${FADE}:alpha=1`];
  if (outAt !== null) fades.push(`fade=t=out:st=${outAt.toFixed(3)}:d=${FADE}:alpha=1`);
  filters.push(
    `[${idx}:v]format=rgba,${fades.join(',')},` +
    `tpad=start_duration=${c.at.toFixed(3)}:start_mode=add:color=0x00000000[cap${i}]`
  );
  const out = i === CAPTIONS.length - 1 ? 'vout' : `ov${i}`;
  filters.push(`[${base}][cap${i}]overlay=0:0:eof_action=pass:format=auto[${out}]`);
  base = out;
});
if (!CAPTIONS.length) filters.push(`[${base}]null[vout]`);

// ---------------------------------------------------------------- audio graph
filters.push(
  `[${musicIndex}:a]atrim=0:${TOTAL.toFixed(3)},asetpts=N/SR/TB,` +
  `volume=${MUSIC_GAIN},` +
  `afade=t=in:st=0:d=2.0,afade=t=out:st=${(TOTAL - 3.0).toFixed(3)}:d=3.0,` +
  `aresample=48000[aout]`
);

const args = [
  '-y', '-hide_banner', '-loglevel', 'error', '-stats',
  ...inputs.flat(),
  '-filter_complex', filters.join(';'),
  '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
  '-profile:v', 'high', '-level', '4.2',
  '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-x264-params', 'keyint=120:min-keyint=60:scenecut=0',
  '-maxrate', '20M', '-bufsize', '40M',
  '-r', '60',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart',
  '-t', TOTAL.toFixed(3),
  OUT,
];

writeFileSync('out/ffmpeg-command.txt', `${FFMPEG} \\\n  ${args.map((a) => (/[ ;\[\]]/.test(a) ? `'${a}'` : a)).join(' \\\n  ')}\n`);

console.log(`assembling ${CUT.length} shots, ${CAPTIONS.length} caption plates, ${TOTAL.toFixed(2)}s`);
execFileSync(FFMPEG, args, { stdio: ['ignore', 'inherit', 'inherit'] });

const probe = execFileSync(FFPROBE, [
  '-v', 'error', '-show_format', '-show_streams', '-of', 'json', OUT,
], { encoding: 'utf8' });
writeFileSync('out/final-probe.json', probe);

const info = JSON.parse(probe);
const v = info.streams.find((s) => s.codec_type === 'video');
const a = info.streams.find((s) => s.codec_type === 'audio');
console.log(`\n${OUT}`);
console.log(`  ${v.width}x${v.height}  ${eval(v.r_frame_rate)} fps  ${v.codec_name}/${v.pix_fmt}`);
console.log(`  ${Number(info.format.duration).toFixed(2)} s  ${(Number(info.format.size) / 1048576).toFixed(1)} MB  ${(Number(info.format.bit_rate) / 1e6).toFixed(2)} Mb/s`);
console.log(`  audio ${a.codec_name} ${a.sample_rate} Hz ${a.channels}ch`);
