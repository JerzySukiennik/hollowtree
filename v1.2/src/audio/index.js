// Hollowtree — the audio system entry point: unlocks the context after a user gesture, drives ambience, wing buzz, gathering, weather and hornets, and exposes one-shots, music stings and volume control.

import { AUDIO } from '../config.audio.js';
import { createGraph } from './context.js';
import { createLibrary } from './library.js';
import { createLayer } from './layer.js';
import { createAmbience } from './ambience.js';
import { createWings } from './wings.js';
import { createWeather } from './weather.js';
import { createEmitter } from './emitter.js';

function noop() {}

const EMPTY_CONTEXT = {};
const VOLUME_KEYS = ['master', 'ambience', 'sfx', 'music'];

function silentAudio() {
  const volumes = { ...AUDIO.volumes };
  return {
    unlock: () => Promise.resolve(),
    ready: Promise.resolve(),
    update: noop,
    setWeather: noop,
    thunder: () => null,
    play: () => null,
    music: () => null,
    stopMusic: noop,
    setVolumes: (next) => Object.assign(volumes, next || {}),
    volumes,
    setHornets: noop,
    dispose: noop,
    weather: { kind: 'clear', intensity: 0, wetness: 0, damp: 0, wind: 0, driven: false },
    available: false,
  };
}

export function createAudio(camera) {
  const graph = createGraph();
  if (!graph) {
    console.warn('[audio] Web Audio unavailable — running silent');
    return silentAudio();
  }

  const { ctx, buses } = graph;
  const library = createLibrary(ctx);
  const volumes = { ...AUDIO.volumes };

  const ambience = createAmbience(ctx, library, buses.ambience);
  const wings = createWings(ctx, library, buses.sfx);
  const emitter = createEmitter(ctx, library, buses.sfx, buses.music, camera);
  const weather = createWeather(ctx, library, buses.weather, (id, opts) =>
    emitter.play(id, { ...opts, bus: buses.weather })
  );

  const gather = createLayer(ctx, library, AUDIO.gather.id, buses.sfx, {
    filter: 'bandpass',
    cutoff: AUDIO.gather.cutoffLow,
    q: 0.9,
  });

  const hornets = createLayer(ctx, library, AUDIO.hornet.droneId, buses.ambience, {
    filter: 'lowpass',
    cutoff: 1200,
    q: 0.7,
  });

  const state = {
    unlocked: false,
    insideness: 0,
    gathering: 0,
    hornetLevel: 0,
    hornetTarget: 0,
    enteredHollow: false,
    lastSeason: null,
    musicDuck: 1,
  };

  let resolveReady = noop;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let loading = null;

  function unlock() {
    if (!loading) {
      loading = library
        .loadAll(true)
        .then(() => {
          resolveReady();
          return library.loadAll(false);
        })
        .catch(() => {
          resolveReady();
        });
    }
    const resume = ctx.state === 'suspended' && typeof ctx.resume === 'function'
      ? ctx.resume().catch(() => {})
      : Promise.resolve();
    return resume.then(() => {
      state.unlocked = true;
      return loading;
    });
  }

  function setVolumes(next) {
    if (!next) return volumes;
    for (let i = 0; i < VOLUME_KEYS.length; i++) {
      const key = VOLUME_KEYS[i];
      if (typeof next[key] === 'number' && isFinite(next[key])) {
        volumes[key] = Math.min(1.5, Math.max(0, next[key]));
        graph.setVolume(key, volumes[key]);
      }
    }
    return volumes;
  }

  function setHornets(level) {
    state.hornetTarget = Math.min(1, Math.max(0, level || 0));
  }

  function play(id, opts) {
    if (!state.unlocked) return null;
    return emitter.play(id, opts);
  }

  function music(id, opts) {
    if (!state.unlocked) return null;
    return emitter.music(id, opts);
  }

  function setWeather(next) {
    weather.setWeather(next);
  }

  function thunder(distanceMeters) {
    weather.setDriven();
    if (!state.unlocked) return null;
    const cfg = AUDIO.weather.thunder;
    const distance = Math.max(0, typeof distanceMeters === 'number' && isFinite(distanceMeters) ? distanceMeters : 0);
    let band = cfg.bands[cfg.bands.length - 1];
    for (let i = 0; i < cfg.bands.length; i++) {
      if (distance <= cfg.bands[i].maxDistance) {
        band = cfg.bands[i];
        break;
      }
    }
    const delay = Math.min(cfg.maxDelay, distance / cfg.speedOfSound);
    const falloff = Math.pow(cfg.distanceRef / Math.max(cfg.distanceRef, distance), cfg.distanceFalloff);
    const volume = cfg.gain * band.gain * falloff * (1 - state.insideness * cfg.indoorDuck);
    return emitter.play(band.id, {
      bus: buses.weather,
      volume,
      rate: band.rate,
      delay,
      offset: band.offset,
      lowpass: band.cutoff * (1 - state.insideness * 0.45),
      pan: (Math.random() * 2 - 1) * 0.6 * Math.min(1, distance / 120),
    });
  }

  function update(dt, context) {
    if (!state.unlocked) return;
    const step = Math.min(0.25, Math.max(0.0005, dt || 0));
    const info = context || EMPTY_CONTEXT;
    const inside = Math.min(1, Math.max(0, info.insideness || 0));
    state.insideness = inside;

    graph.setInsideness(inside);
    graph.setWeatherDamp(weather.state.damp);

    ambience.update(step, info);
    ambience.setWindBoost(weather.state.wind * 0.6);
    wings.update(step, info);
    weather.update(step, info);

    const wants = typeof info.gathering === 'number'
      ? Math.min(1, Math.max(0, info.gathering))
      : info.gathering
        ? 1
        : 0;
    const tau = wants > state.gathering ? AUDIO.gather.rise : AUDIO.gather.fall;
    state.gathering += (wants - state.gathering) * (1 - Math.exp(-step / tau));
    if (state.gathering < 0.001) state.gathering = 0;
    gather.setTarget(state.gathering * AUDIO.gather.gain);
    gather.setCutoff(
      AUDIO.gather.cutoffLow + (AUDIO.gather.cutoffHigh - AUDIO.gather.cutoffLow) * state.gathering
    );
    gather.setRate(AUDIO.gather.rateLow + (AUDIO.gather.rateHigh - AUDIO.gather.rateLow) * state.gathering);
    gather.update(step, 0.12);

    state.hornetLevel += (state.hornetTarget - state.hornetLevel) * (1 - Math.exp(-step / AUDIO.hornet.glide));
    hornets.setTarget(state.hornetLevel * AUDIO.hornet.gain * (1 - inside * 0.4));
    hornets.update(step, AUDIO.hornet.glide);

    const ducking = emitter.musicState.current ? AUDIO.music.duckAmbience : 1;
    state.musicDuck += (ducking - state.musicDuck) * (1 - Math.exp(-step / AUDIO.music.duckGlide));
    graph.setVolume('ambience', volumes.ambience * state.musicDuck);

    if (info.season !== undefined && info.season !== null) {
      if (state.lastSeason === null) state.lastSeason = info.season;
      else if (info.season !== state.lastSeason) {
        state.lastSeason = info.season;
        music('season');
      }
    }
    if (!state.enteredHollow && inside > 0.75) {
      state.enteredHollow = true;
      music('discovery', { force: true });
    }
  }

  function dispose() {
    ambience.dispose();
    wings.dispose();
    weather.dispose();
    emitter.dispose();
    gather.dispose();
    hornets.dispose();
    graph.dispose();
    state.unlocked = false;
  }

  setVolumes(volumes);

  return {
    unlock,
    ready,
    update,
    setWeather,
    thunder,
    play,
    music,
    stopMusic: emitter.stopMusic,
    setVolumes,
    volumes,
    setHornets,
    dispose,
    weather: weather.state,
    available: true,
    context: ctx,
    library,
    state,
  };
}

export default createAudio;
