// Hollowtree — seasonal and daytime ambience beds: meadow, birds, cicadas, wind and night crossfaded by season, sun position and insideness, plus the hollow's interior bed.

import { AUDIO } from '../config.audio.js';
import { createLayer } from './layer.js';

const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];

function smoothstep(a, b, x) {
  if (b === a) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function normalizeSeason(season) {
  if (typeof season === 'number') return SEASON_NAMES[((season % 4) + 4) % 4];
  if (typeof season === 'string') {
    const key = season.toLowerCase();
    if (AUDIO.ambience.seasons[key]) return key;
    if (key === 'fall') return 'autumn';
    if (key === 'prewinter' || key === 'late-autumn') return 'winter';
  }
  return 'summer';
}

function normalizeTime(timeOfDay) {
  if (typeof timeOfDay !== 'number' || !isFinite(timeOfDay)) return 0.5;
  let t = timeOfDay > 1.0001 ? timeOfDay / 24 : timeOfDay;
  t -= Math.floor(t);
  return t;
}

export function createAmbience(ctx, library, destination) {
  const cfg = AUDIO.ambience;
  const layers = {};
  for (const key of Object.keys(cfg.layers)) {
    layers[key] = createLayer(ctx, library, cfg.layers[key].id, destination);
  }

  const weights = { ...cfg.seasons.summer };
  const state = { season: 'summer', dayness: 1, insideness: 0 };

  function update(dt, context) {
    const season = normalizeSeason(context.season);
    const time = normalizeTime(context.timeOfDay);
    const inside = Math.min(1, Math.max(0, context.insideness || 0));
    const swarm = Math.max(0, context.swarmSize || 0);
    state.season = season;
    state.insideness = inside;

    const target = cfg.seasons[season] || cfg.seasons.summer;
    const seasonK = 1 - Math.exp(-dt / cfg.seasonGlide);
    for (const key of Object.keys(target)) {
      weights[key] = (weights[key] || 0) + (target[key] - (weights[key] || 0)) * seasonK;
    }

    const tw = cfg.twilight;
    const dayTarget =
      smoothstep(cfg.dawn - tw, cfg.dawn + tw, time) - smoothstep(cfg.dusk - tw, cfg.dusk + tw, time);
    state.dayness += (dayTarget - state.dayness) * (1 - Math.exp(-dt / cfg.dayGlide));

    const day = Math.min(1, Math.max(0, state.dayness));
    const night = 1 - day;
    const outside = 1 - inside * cfg.outsideDuck;
    const golden = 1 + cfg.duskWarmth * (1 - Math.abs(day - 0.5) * 2);

    const base = cfg.layers;
    layers.meadow.setTarget(weights.meadow * base.meadow.gain * (cfg.nightFloor + day * (1 - cfg.nightFloor)) * outside);
    layers.birds.setTarget(weights.birds * base.birds.gain * day * golden * outside);
    layers.cicadas.setTarget(
      weights.cicadas * base.cicadas.gain * (0.35 + 0.65 * Math.max(day, night * 0.5)) * outside
    );
    layers.windCalm.setTarget(weights.windCalm * base.windCalm.gain * outside);
    layers.windForest.setTarget(weights.windForest * base.windForest.gain * (0.7 + 0.3 * night) * outside);
    layers.night.setTarget(night * cfg.nightLevel * base.night.gain * outside);

    layers.hollow.setTarget(inside * cfg.hollowRise * base.hollow.gain);
    const hiveFill = Math.min(1, swarm / Math.max(1, AUDIO.wings.swarmRef));
    layers.hive.setTarget(inside * base.hive.gain * (cfg.hiveRise * (0.45 + cfg.hiveSwarmBoost * hiveFill)));

    const glide = AUDIO.crossfade;
    for (const key of Object.keys(layers)) {
      layers[key].update(dt, key === 'hollow' || key === 'hive' ? AUDIO.insideFade * 3 : glide);
    }
  }

  function setWindBoost(value) {
    const extra = Math.max(0, value || 0);
    weights.windForest = Math.max(weights.windForest, extra);
  }

  function dispose() {
    for (const key of Object.keys(layers)) layers[key].dispose();
  }

  return { layers, state, update, setWindBoost, dispose };
}
