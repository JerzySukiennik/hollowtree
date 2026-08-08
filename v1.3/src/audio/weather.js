// Hollowtree — weather layers: outside/inside rain crossfaded by insideness, gale wind, spectral damping and randomised thunder strikes.

import { AUDIO } from '../config.audio.js';
import { createLayer } from './layer.js';

const MIX_KEYS = ['rain', 'rainHeavy', 'gale', 'wind', 'damp'];
const LAYER_KEYS = ['rain', 'rainHeavy', 'rainInside', 'rainInsideHeavy', 'gale'];

export function createWeather(ctx, library, destination, oneShot) {
  const cfg = AUDIO.weather;
  const specs = cfg.layers;

  const layers = {
    rain: createLayer(ctx, library, specs.rain.id, destination),
    rainHeavy: createLayer(ctx, library, specs.rainHeavy.id, destination),
    rainInside: createLayer(ctx, library, specs.rainInside.id, destination),
    rainInsideHeavy: createLayer(ctx, library, specs.rainInsideHeavy.id, destination),
    gale: createLayer(ctx, library, specs.gale.id, destination),
  };

  const state = { kind: 'clear', intensity: 0, wetness: 0, damp: 0, wind: 0, driven: false };
  let mix = { rain: 0, rainHeavy: 0, gale: 0, wind: 0, damp: 0 };
  let strikeTimer = 12;

  function setDriven() {
    state.driven = true;
  }

  function setWeather(next) {
    state.driven = true;
    const value = next || {};
    const kind = cfg.kinds[value.kind] ? value.kind : 'clear';
    state.kind = kind;
    state.intensity = Math.min(1, Math.max(0, value.intensity === undefined ? 1 : value.intensity));
    state.wetness = Math.min(1, Math.max(0, value.wetness === undefined ? state.intensity : value.wetness));
    if (kind === 'storm' || kind === 'rain') strikeTimer = Math.min(strikeTimer, 6);
  }

  function nextStrike() {
    const range = state.kind === 'storm' ? cfg.thunder.storm : cfg.thunder.rain;
    const span = range[1] - range[0];
    return range[0] + Math.random() * span * (1.3 - 0.6 * state.intensity);
  }

  function update(dt, context) {
    const inside = Math.min(1, Math.max(0, context.insideness || 0));
    const target = cfg.kinds[state.kind] || cfg.kinds.clear;
    const k = 1 - Math.exp(-dt / cfg.glide);
    for (let i = 0; i < MIX_KEYS.length; i++) {
      const key = MIX_KEYS[i];
      const want = (target[key] || 0) * (key === 'damp' ? 1 : state.intensity);
      mix[key] += (want - mix[key]) * k;
    }
    state.damp = mix.damp;
    state.wind = mix.wind;

    const outside = 1 - inside;
    layers.rain.setTarget(mix.rain * specs.rain.gain * outside);
    layers.rainHeavy.setTarget(mix.rainHeavy * specs.rainHeavy.gain * outside);
    layers.rainInside.setTarget(mix.rain * specs.rainInside.gain * inside);
    layers.rainInsideHeavy.setTarget(mix.rainHeavy * specs.rainInsideHeavy.gain * inside);
    layers.gale.setTarget(mix.gale * specs.gale.gain * (1 - inside * 0.7));

    for (let i = 0; i < LAYER_KEYS.length; i++) layers[LAYER_KEYS[i]].update(dt, cfg.glide);

    const stormy = !state.driven && (state.kind === 'storm' || (state.kind === 'rain' && state.intensity > 0.55));
    if (!stormy) {
      strikeTimer = Math.max(strikeTimer, 8);
      return;
    }
    strikeTimer -= dt;
    if (strikeTimer > 0) return;
    strikeTimer = nextStrike();
    const ids = cfg.thunder.ids;
    const id = ids[(Math.random() * ids.length) | 0];
    const rate = cfg.thunder.rateRange;
    if (typeof oneShot === 'function') {
      oneShot(id, {
        volume: cfg.thunder.gain * (0.55 + 0.45 * state.intensity) * (1 - inside * cfg.thunder.indoorDuck),
        rate: rate[0] + Math.random() * (rate[1] - rate[0]),
        pan: (Math.random() * 2 - 1) * 0.7,
      });
    }
  }

  function dispose() {
    for (let i = 0; i < LAYER_KEYS.length; i++) layers[LAYER_KEYS[i]].dispose();
  }

  return { state, layers, setWeather, setDriven, update, dispose };
}
