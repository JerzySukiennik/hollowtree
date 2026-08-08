// Hollowtree — the audio graph: context, master/bus gains, and the hollow-interior space (lowpass + feedback-delay tail) driven by insideness.

import { AUDIO } from '../config.audio.js';

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function createGraph() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;

  let ctx;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch (error) {
    try {
      ctx = new Ctor();
    } catch (fatal) {
      return null;
    }
  }

  const S = AUDIO.space;
  const master = ctx.createGain();
  master.gain.value = AUDIO.volumes.master;
  master.connect(ctx.destination);

  const music = ctx.createGain();
  music.gain.value = AUDIO.volumes.music;
  music.connect(master);

  const space = ctx.createGain();
  space.connect(master);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = S.outsideCutoff;
  lowpass.Q.value = 0.4;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = S.outsideHighpass;
  highpass.Q.value = 0.5;

  lowpass.connect(highpass);

  const dry = ctx.createGain();
  dry.gain.value = 1;
  highpass.connect(dry);
  dry.connect(space);

  const send = ctx.createGain();
  send.gain.value = S.wetOutside;
  highpass.connect(send);

  const preDelay = ctx.createDelay(0.2);
  preDelay.delayTime.value = S.preDelay;
  send.connect(preDelay);

  const wet = ctx.createGain();
  wet.gain.value = 1;
  const merger = ctx.createChannelMerger(2);

  const taps = [];
  for (let i = 0; i < S.taps.length; i++) {
    const delay = ctx.createDelay(1);
    delay.delayTime.value = S.taps[i];
    const feedback = ctx.createGain();
    feedback.gain.value = S.feedback;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = S.damping;
    damp.Q.value = 0.3;
    const pan = ctx.createGain();
    pan.gain.value = 1 / S.taps.length;
    preDelay.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(pan);
    pan.connect(merger, 0, i % 2);
    taps.push({ delay, feedback, damp, pan });
  }
  merger.connect(wet);
  wet.connect(space);

  const ambience = ctx.createGain();
  ambience.gain.value = AUDIO.volumes.ambience;
  ambience.connect(lowpass);

  const sfx = ctx.createGain();
  sfx.gain.value = AUDIO.volumes.sfx;
  sfx.connect(lowpass);

  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 20000;
  damp.Q.value = 0.3;
  damp.connect(ambience);

  const weather = ctx.createGain();
  weather.gain.value = 1;
  weather.connect(damp);

  const beds = ctx.createGain();
  beds.gain.value = 1;
  beds.connect(damp);

  let insideness = -1;
  let weatherDamp = -1;

  function setInsideness(value) {
    const k = clamp01(value);
    if (Math.abs(k - insideness) < 0.002) return;
    insideness = k;
    const now = ctx.currentTime;
    const tc = AUDIO.insideFade;
    const cutoff = S.outsideCutoff * Math.pow(S.insideCutoff / S.outsideCutoff, k);
    lowpass.frequency.setTargetAtTime(cutoff, now, tc);
    highpass.frequency.setTargetAtTime(S.outsideHighpass + (S.insideHighpass - S.outsideHighpass) * k, now, tc);
    dry.gain.setTargetAtTime(1 + (S.dryInside - 1) * k, now, tc);
    send.gain.setTargetAtTime(S.wetOutside + (S.wetInside - S.wetOutside) * k, now, tc);
    for (let i = 0; i < taps.length; i++) {
      taps[i].feedback.gain.setTargetAtTime(S.feedback * (0.55 + 0.45 * k), now, tc);
    }
  }

  function setWeatherDamp(value) {
    const k = clamp01(value);
    if (Math.abs(k - weatherDamp) < 0.005) return;
    weatherDamp = k;
    const target = 20000 * Math.pow(AUDIO.weather.dampCutoff / 20000, k);
    damp.frequency.setTargetAtTime(target, ctx.currentTime, 0.9);
  }

  function setVolume(bus, value) {
    const node = bus === 'master' ? master : bus === 'music' ? music : bus === 'sfx' ? sfx : ambience;
    node.gain.setTargetAtTime(Math.max(0, value), ctx.currentTime, 0.05);
  }

  function dispose() {
    try {
      master.disconnect();
      ctx.close();
    } catch (error) {
      /* already gone */
    }
  }

  setInsideness(0);
  setWeatherDamp(0);

  return {
    ctx,
    master,
    buses: { ambience: beds, sfx, music, weather },
    setInsideness,
    setWeatherDamp,
    setVolume,
    dispose,
  };
}
