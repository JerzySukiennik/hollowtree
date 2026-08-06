// Hollowtree — the wing buzz: four detuned looping voices whose pitch tracks queen speed and whose body and low octave grow with swarm size, so a big swarm is audibly big.

import { AUDIO } from '../config.audio.js';
import { createLayer } from './layer.js';

export function createWings(ctx, library, destination) {
  const cfg = AUDIO.wings;

  const bus = ctx.createGain();
  bus.gain.value = cfg.gain;
  bus.connect(destination);

  const voices = cfg.voices.map((spec, index) =>
    ({
      spec,
      phase: Math.random() * Math.PI * 2,
      wobble: cfg.wobbleRate * (0.72 + 0.5 * (index / Math.max(1, cfg.voices.length - 1))),
      layer: createLayer(ctx, library, spec.id, bus, {
        filter: 'lowpass',
        cutoff: cfg.cutoffIdle,
        q: 0.6,
        rate: spec.rate,
        detune: spec.detune,
      }),
    })
  );

  const state = { speed: 0, swarm: 0, level: 0 };

  function update(dt, context) {
    const speed = Math.max(0, context.speed || 0);
    const swarm = Math.max(0, context.swarmSize || 0);
    const inside = Math.min(1, Math.max(0, context.insideness || 0));
    const k = 1 - Math.exp(-dt / cfg.glide);
    state.speed += (speed - state.speed) * k;
    state.swarm += (swarm - state.swarm) * (1 - Math.exp(-dt / (cfg.glide * 6)));

    const speedNorm = Math.min(1, state.speed / cfg.maxSpeed);
    const swarmNorm = Math.min(1, Math.sqrt(state.swarm / cfg.swarmMax));
    const swarmFill = Math.min(1.35, Math.sqrt(state.swarm / Math.max(1, cfg.swarmRef)));
    const level = (cfg.idleGain + cfg.speedGain * speedNorm) * (1 + cfg.insideBoost * inside);
    state.level = level;

    const cutoff = cfg.cutoffIdle + (cfg.cutoffFast - cfg.cutoffIdle) * speedNorm;
    const now = ctx.currentTime;

    for (let i = 0; i < voices.length; i++) {
      const voice = voices[i];
      voice.phase += dt * voice.wobble * Math.PI * 2;
      const wobble = 1 + Math.sin(voice.phase) * cfg.wobbleDepth * (0.4 + 0.6 * speedNorm);
      const swarmVoice = voice.spec.swarm || 0;
      const pitchDrop = 1 - cfg.swarmPitchDrop * swarmNorm * (swarmVoice ? 1 : 0.35);
      const rate = voice.spec.rate * (cfg.rateIdle + cfg.ratePitch * speedNorm) * wobble * pitchDrop;
      voice.layer.setRate(Math.max(0.35, rate));
      voice.layer.setCutoff(cutoff * (swarmVoice ? 0.72 : 1));

      const swarmGain = swarmVoice
        ? cfg.swarmGain * swarmFill * swarmVoice * (0.55 + 0.45 * speedNorm)
        : voice.spec.gain * (1 - cfg.swarmSpread * swarmNorm * 0.35);
      voice.layer.setTarget(level * Math.max(0, swarmGain));
      voice.layer.update(dt, cfg.glide * 2);
    }

    bus.gain.setTargetAtTime(cfg.gain, now, 0.2);
  }

  function dispose() {
    for (const voice of voices) voice.layer.dispose();
    try {
      bus.disconnect();
    } catch (error) {
      /* already gone */
    }
  }

  return { state, update, dispose, bus };
}
