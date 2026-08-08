// Hollowtree — little flower glyphs drawn from the species data, for lines that would
// otherwise have to name a plant in words.
//
// The barrier line used to read:
//
//   THE FLOWER MEADOW NEEDS 8 MORE COMB CELLS, A POLLEN STORE — GATHER POLLEN FROM MEADOW
//   DAISY (THE CLEARING), RESIN FROM SPRUCE SEEP (THE CLEARING), THEN PRESS TAB INSIDE THE
//   HOLLOW TO BUILD.
//
// Three wrapped rows over the meadow, at 12px, while the player is being pushed backwards by
// a wind barrier. Nobody reads that. A picture of the plant is recognised instantly and
// matches what the player is looking at in the field, which a name never does.
//
// Glyphs are canvas-drawn rather than rendered from the GLBs on purpose: they must read at
// 22px, and a real render of a 165-triangle daisy at that size is mush. Shape comes from
// `geometry`, petal count from `petals`, colour from the species' own palette — so an icon
// cannot drift from the flower it stands for.

import { FLOWER_SPECIES } from '../config.js';

const cache = new Map();

function hex(value) {
  return `#${(value >>> 0).toString(16).padStart(6, '0')}`;
}

// Conifer foliage is near-black green. Measured against the daisy glyph it came out at 24.5%
// coverage and luma 75 versus 45.1% and 234 — three times darker and half the size, which on
// a sunlit meadow is invisible. Lifting it toward white keeps the species' hue and makes it
// read at 26px.
function lighten(value, amount) {
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${((mix(r) << 16) | (mix(g) << 8) | mix(b)).toString(16).padStart(6, '0')}`;
}

function drawDaisy(ctx, size, species) {
  const cx = size / 2;
  const cy = size / 2;
  const petals = Math.max(4, Math.min(12, species.petals || 8));
  const outer = size * 0.44;
  const petalLen = outer * 0.92;
  const petalWide = (Math.PI * 2 * outer) / petals / 2.6;
  ctx.fillStyle = hex(species.colors.petal);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(petalLen * 0.55, 0, petalLen * 0.45, petalWide, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = hex(species.colors.core);
  ctx.beginPath();
  ctx.arc(cx, cy, outer * 0.36, 0, Math.PI * 2);
  ctx.fill();
}

function drawClover(ctx, size, species) {
  const cx = size / 2;
  const cy = size * 0.46;
  const r = size * 0.21;
  ctx.fillStyle = hex(species.colors.petal);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = hex(species.colors.core);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBell(ctx, size, species) {
  const cx = size / 2;
  const top = size * 0.24;
  const w = size * 0.36;
  const h = size * 0.46;
  ctx.fillStyle = hex(species.colors.petal);
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.42, top);
  ctx.quadraticCurveTo(cx - w, top + h * 0.72, cx - w, top + h);
  ctx.quadraticCurveTo(cx, top + h * 1.22, cx + w, top + h);
  ctx.quadraticCurveTo(cx + w, top + h * 0.72, cx + w * 0.42, top);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = hex(species.colors.tip || species.colors.core);
  ctx.beginPath();
  ctx.ellipse(cx, top + h * 1.0, w * 0.62, h * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawConifer(ctx, size, species) {
  const cx = size / 2;
  ctx.fillStyle = lighten(species.colors.stem || species.colors.petal, 0.25);
  ctx.fillRect(cx - size * 0.06, size * 0.74, size * 0.12, size * 0.2);
  ctx.fillStyle = lighten(species.colors.petal, 0.42);
  for (let i = 0; i < 3; i++) {
    const top = size * (0.06 + i * 0.22);
    const halfW = size * (0.24 + i * 0.11);
    const bottom = top + size * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx - halfW, bottom);
    ctx.lineTo(cx + halfW, bottom);
    ctx.closePath();
    ctx.fill();
  }
  // The seep itself — the thing the player is actually here for.
  ctx.fillStyle = lighten(species.colors.core, 0.3);
  ctx.beginPath();
  ctx.arc(cx + size * 0.26, size * 0.58, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

const SHAPES = { daisy: drawDaisy, clover: drawClover, bell: drawBell, conifer: drawConifer };

// Returns a data URI, cached per species and size. Safe to call on every frame; it will only
// ever draw once per pair.
export function flowerIconUrl(speciesId, size) {
  const px = Math.max(16, Math.round(size || 26));
  const key = `${speciesId}@${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const species = FLOWER_SPECIES.find((s) => s.id === speciesId);
  if (!species || typeof document === 'undefined') return '';
  const scale = 2; // drawn at 2x so it stays crisp on a retina panel
  const canvas = document.createElement('canvas');
  canvas.width = px * scale;
  canvas.height = px * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  (SHAPES[species.geometry] || drawDaisy)(ctx, px, species);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function flowerIconImg(speciesId, size, title) {
  const url = flowerIconUrl(speciesId, size);
  if (!url) return '';
  const px = Math.max(16, Math.round(size || 26));
  // The message text has a text-shadow; without a matching one the glyphs wash out against
  // a bright sky exactly where the barrier is most often hit.
  return `<img src="${url}" width="${px}" height="${px}" alt="" title="${title || ''}"
    style="vertical-align:middle;display:inline-block;filter:drop-shadow(0 1px 3px rgba(0,0,0,.85))">`;
}
