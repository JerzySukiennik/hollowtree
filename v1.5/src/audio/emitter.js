// Hollowtree — one-shot playback with cheap camera-relative panning and distance rolloff, plus the sparse music-sting player.

import { AUDIO } from '../config.audio.js';

const _right = { x: 1, y: 0, z: 0 };
const _forward = { x: 0, y: 0, z: -1 };

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function createEmitter(ctx, library, sfxBus, musicBus, camera) {
  const listener = { x: 0, y: 0, z: 0 };
  let panSupported = typeof ctx.createStereoPanner === 'function';

  function syncCamera() {
    if (!camera || !camera.matrixWorld) return;
    const e = camera.matrixWorld.elements;
    listener.x = e[12];
    listener.y = e[13];
    listener.z = e[14];
    _right.x = e[0];
    _right.y = e[1];
    _right.z = e[2];
    _forward.x = -e[8];
    _forward.y = -e[9];
    _forward.z = -e[10];
  }

  function spatial(position) {
    if (!position) return { gain: 1, pan: 0 };
    syncCamera();
    const dx = position.x - listener.x;
    const dy = (position.y || 0) - listener.y;
    const dz = position.z - listener.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ref = AUDIO.refDistance;
    const gain = distance <= ref
      ? 1
      : Math.pow(ref / distance, AUDIO.rolloff) * (1 - clamp((distance - ref) / (AUDIO.maxDistance - ref), 0, 1) * 0.35);
    const inv = distance > 0.0001 ? 1 / distance : 0;
    const pan = clamp((dx * _right.x + dy * _right.y + dz * _right.z) * inv, -1, 1);
    return { gain: clamp(gain, 0, 1), pan: pan * clamp(distance / ref, 0, 1) };
  }

  function play(id, options) {
    const opts = options || {};
    const spec = AUDIO.oneShots[id];
    const bufferId = spec ? spec.id : id;
    const buffer = library.get(bufferId);
    if (!buffer) {
      library.load(bufferId);
      return null;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const spread = spec ? spec.spread : 0.04;
    const jitter = 1 + (Math.random() * 2 - 1) * spread;
    source.playbackRate.value = Math.max(0.25, (opts.rate || 1) * jitter);
    if (source.detune && opts.detune) source.detune.value = opts.detune;

    const gain = ctx.createGain();
    const place = spatial(opts.position);
    const base = spec ? spec.gain : 1;
    gain.gain.value = Math.max(0, base * (opts.volume === undefined ? 1 : opts.volume) * place.gain);

    const chain = [gain];
    let tail = gain;
    if (opts.lowpass && opts.lowpass < 20000) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = Math.max(60, opts.lowpass);
      filter.Q.value = 0.5;
      tail.connect(filter);
      chain.push(filter);
      tail = filter;
    }
    if (panSupported) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = opts.pan !== undefined ? clamp(opts.pan, -1, 1) : place.pan;
      tail.connect(panner);
      chain.push(panner);
      tail = panner;
    }
    tail.connect(opts.bus || sfxBus);
    source.connect(gain);
    source.onended = () => {
      try {
        source.disconnect();
        for (const node of chain) node.disconnect();
      } catch (error) {
        /* already gone */
      }
    };
    const when = ctx.currentTime + Math.max(0, opts.delay || 0);
    try {
      source.start(when, Math.max(0, opts.offset || 0));
    } catch (error) {
      return null;
    }
    return source;
  }

  const musicState = { current: null, gain: null, last: -1e9, id: null };

  function music(id, options) {
    const opts = options || {};
    const track = AUDIO.music.tracks[id] || AUDIO.music.tracks[String(id)];
    if (!track) return null;
    const now = ctx.currentTime;
    if (!opts.force && now - musicState.last < AUDIO.music.minGap) return null;
    const buffer = library.get(track.id);
    if (!buffer) {
      library.load(track.id);
      return null;
    }
    stopMusic(track.fadeOut * 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, track.gain * (opts.volume === undefined ? 1 : opts.volume)),
      now + Math.max(0.05, opts.fadeIn === undefined ? track.fadeIn : opts.fadeIn)
    );
    gain.connect(musicBus);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = Boolean(opts.loop);
    if (opts.loop) {
      const points = library.loopPoints(buffer);
      source.loopStart = points.start;
      source.loopEnd = points.end;
    }
    source.connect(gain);
    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch (error) {
        /* already gone */
      }
      if (musicState.current === source) {
        musicState.current = null;
        musicState.gain = null;
        musicState.id = null;
      }
    };
    try {
      source.start();
    } catch (error) {
      return null;
    }
    musicState.current = source;
    musicState.gain = gain;
    musicState.last = now;
    musicState.id = id;
    return source;
  }

  function stopMusic(fade) {
    if (!musicState.current) return;
    const source = musicState.current;
    const gain = musicState.gain;
    const now = ctx.currentTime;
    const time = Math.max(0.08, fade === undefined ? AUDIO.music.tracks.season.fadeOut : fade);
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0002, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0002, now + time);
      source.stop(now + time + 0.05);
    } catch (error) {
      /* already stopping */
    }
    musicState.current = null;
    musicState.gain = null;
    musicState.id = null;
  }

  function dispose() {
    stopMusic(0.15);
  }

  return { play, music, stopMusic, musicState, dispose, syncCamera };
}
