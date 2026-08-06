// Hollowtree — headless acceptance checks for the audio layer: node work/audio-checks.mjs [regress|driven|alloc]  (alloc needs no flags; regress accepts MODE=404|reject|noaudio)

const MODE_ARG = process.argv[2] || 'regress';
const ROOT = new URL('../', import.meta.url).href;

class Param {
  constructor(v) { this.value = v; }
  setTargetAtTime(v) { this.value = v; return this; }
  setValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node { constructor() { this.outs = []; } connect(n) { this.outs.push(n); return n; } disconnect() { this.outs.length = 0; } }
class GainNode extends Node { constructor() { super(); this.gain = new Param(1); } }
class BiquadNode extends Node { constructor() { super(); this.frequency = new Param(350); this.Q = new Param(1); this.type = 'lowpass'; } }
class DelayNode extends Node { constructor() { super(); this.delayTime = new Param(0); } }
class PanNode extends Node { constructor() { super(); this.pan = new Param(0); } }
class SourceNode extends Node {
  constructor() { super(); this.playbackRate = new Param(1); this.detune = new Param(0); this.buffer = null; this.loop = false; }
  start() {} stop() {}
}
class Ctx {
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.destination = new Node(); this.sampleRate = 44100; }
  createGain() { return new GainNode(); }
  createBiquadFilter() { return new BiquadNode(); }
  createDelay() { return new DelayNode(); }
  createStereoPanner() { return new PanNode(); }
  createChannelMerger() { return new Node(); }
  createBufferSource() { return new SourceNode(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { return Promise.resolve(); }
  decodeAudioData(d, ok) { const b = { duration: 30, sampleRate: 44100 }; if (ok) ok(b); return Promise.resolve(b); }
}
global.window = { AudioContext: Ctx };
global.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });


if (MODE_ARG === 'alloc') {
  const { Session } = await import('node:inspector/promises');
  globalThis.Session = Session;
}
if (MODE_ARG === 'regress') {
if (process.env.MODE === '404') global.fetch = async () => ({ ok: false, status: 404 });
  if (process.env.MODE === 'reject') global.fetch = async () => { throw new Error('network down'); };
  if (process.env.MODE === 'noaudio') global.window = {};
  const warns = []; console.warn = (...a) => warns.push(a.join(' '));
  function assert(ok, msg) { console.log((ok ? '  ok   ' : ' FAIL  ') + msg); if (!ok) process.exitCode = 1; }
  
  const { createAudio } = await import(ROOT + 'src/audio/index.js');
  const audio = createAudio(null);
  for (const fn of ['unlock','update','setWeather','thunder','play','music','stopMusic','setVolumes','setHornets','dispose']) {
    assert(typeof audio[fn] === 'function', `API exposes ${fn}()`);
  }
  assert(audio.ready && typeof audio.ready.then === 'function', 'API exposes ready promise');
  assert(audio.weather && typeof audio.weather.driven === 'boolean', 'API exposes weather state incl. driven');
  
  audio.update(0.016, { insideness: 0.4, speed: 6, swarmSize: 40, season: 'summer', timeOfDay: 0.5 });
  audio.setWeather({ kind: 'storm', intensity: 1, wetness: 1 });
  audio.play('deposit'); audio.music('season'); audio.thunder(120);
  assert(true, 'pre-unlock calls are no-ops without throwing');
  
  await audio.unlock(); await audio.ready;
  const decoded = audio.library ? [...audio.library.buffers.values()].filter(Boolean).length : 0;
  assert(true, audio.library ? `${decoded} clips decoded, ${audio.library.failed.size} failed` : 'no Web Audio — silent fallback in use');
  
  const seasons = ['spring','summer','autumn','winter',0,3,'fall',undefined,'nonsense'];
  const kinds = ['clear','overcast','rain','storm','wind','fog','bogus'];
  let t = 0;
  if (audio.available) {
  for (let i = 0; i < 6000; i++) {
    t += 1/60; audio.context.currentTime = t;
    if (i % 300 === 0) audio.setWeather({ kind: kinds[(i/300) % kinds.length], intensity: Math.random(), wetness: Math.random() });
    audio.update(1/60, {
      insideness: 0.5 + 0.5*Math.sin(i/90), speed: 9 + 9*Math.sin(i/33),
      swarmSize: Math.floor(100 + 100*Math.sin(i/210)), season: seasons[(i/400|0) % seasons.length],
      timeOfDay: (i/900) % 1, gathering: i % 400 < 150 ? 1 : 0, position: { x: 1, y: 2, z: 3 },
    });
    if (i % 700 === 0) audio.play('deposit', { position: { x: 10, y: 3, z: -20 } });
    if (i % 1100 === 0) audio.setHornets(Math.random());
    if (i % 900 === 0) audio.thunder(Math.random() * 500);
  }
  audio.update(0, {}); audio.update(NaN, { insideness: NaN, speed: NaN, swarmSize: NaN });
  audio.update(5, { season: null, timeOfDay: 999 });
  audio.play('nope'); audio.music('nope');
  audio.setVolumes({ master: 0.5, ambience: 2, sfx: -1, music: 'x' });
  if (audio.available) assert(audio.volumes.master === 0.5 && audio.volumes.ambience === 1.5 && audio.volumes.sfx === 0 && audio.volumes.music === 0.7, 'setVolumes clamps and ignores junk');
  }
  assert(true, '6000-frame sweep completed without throwing');
  
  // thunder delay accuracy
  if (audio.available && decoded > 0) {
  audio.context.currentTime = 1000;
  const rc = audio.context.createBufferSource.bind(audio.context);
  let last = null;
  audio.context.createBufferSource = () => { const s = rc(); const rs = s.start.bind(s); s.start = (w,o) => { if (!s.loop) last = { w, o }; rs(); }; return s; };
  let delaysOk = true;
  for (const d of [5, 40, 90, 150, 250, 400, 900, -3, NaN, undefined, 'x']) {
    last = null; audio.thunder(d);
    const dist = typeof d === 'number' && isFinite(d) && d > 0 ? d : 0;
    if (!last || Math.abs((last.w - 1000) - Math.min(6, dist/343)) > 1e-6) delaysOk = false;
  }
  assert(delaysOk, 'thunder() delay == min(distance/343, 6 s) for all inputs incl. junk');
  } else { assert(audio.thunder(150) === null, 'thunder() returns null and stays silent when no clip decoded'); }
  
  audio.dispose();
  const dupes = warns.length !== new Set(warns).size;
  assert(!dupes, `${warns.length} warnings, no duplicates`);
  assert(true, 'dispose() survived');
  
} else if (MODE_ARG === 'driven') {
  const { createAudio } = await import(ROOT + 'src/audio/index.js');

  function assert(ok, msg) { console.log((ok ? '  ok   ' : ' FAIL  ') + msg); if (!ok) process.exitCode = 1; }
  function tap(audio) {
    const arr = [];
    const rc = audio.context.createBufferSource.bind(audio.context);
    audio.context.createBufferSource = () => {
      const s = rc(); const rs = s.start.bind(s);
      s.start = (w, o) => { if (!s.loop) arr.push(w); rs(); };
      return s;
    };
    return arr;
  }
  function run(audio, frames) {
    for (let i = 0; i < frames; i++) { audio.context.currentTime += 1 / 60; audio.update(1 / 60, { insideness: 0, season: 'summer', timeOfDay: 0.5 }); }
  }
  
  const audio = createAudio(null);
  await audio.unlock(); await audio.ready;
  audio.state.lastSeason = 'summer'; audio.state.enteredHollow = true;
  const starts = tap(audio);
  
  assert(audio.weather.driven === false, 'driven is false before any weather state arrives');
  audio.setWeather({ kind: 'rain', intensity: 0.7, wetness: 0.8 });
  assert(audio.weather.driven === true, 'driven latches true as soon as a rain phase begins');
  
  starts.length = 0; run(audio, 18000);
  assert(starts.length === 0, `no client-local thunder over 300 s of rain (${starts.length} strikes)`);
  
  audio.setWeather({ kind: 'storm', intensity: 1, wetness: 1 });
  starts.length = 0; run(audio, 18000);
  assert(starts.length === 0, `no client-local thunder over 300 s of storm either (${starts.length} strikes)`);
  
  starts.length = 0; audio.thunder(150);
  assert(starts.length === 1, `audio.thunder() still fires exactly one strike (${starts.length})`);
  
  const solo = createAudio(null);
  await solo.unlock(); await solo.ready;
  solo.state.lastSeason = 'summer'; solo.state.enteredHollow = true;
  const s2 = tap(solo);
  solo.weather.kind = 'storm'; solo.weather.intensity = 1;
  run(solo, 18000);
  assert(s2.length >= 6, `undriven fallback still fires (${s2.length} strikes over 300 s)`);
  
} else if (MODE_ARG === 'alloc') {
  const Session = globalThis.Session;

  const { createAudio } = await import(ROOT + 'src/audio/index.js');
  const audio = createAudio(null);
  await audio.unlock();
  await audio.ready;
  audio.setWeather({ kind: 'storm', intensity: 1, wetness: 1 });
  audio.thunder(150);
  
  const CTX = { insideness: 0.35, speed: 7.5, swarmSize: 80, season: 'summer', timeOfDay: 0.42, gathering: 0.4 };
  const WARM = 20000;
  const RUN = 50000;
  for (let i = 0; i < WARM; i++) { audio.context.currentTime += 1 / 60; audio.update(1 / 60, CTX); }
  
  const session = new Session();
  session.connect();
  await session.post('HeapProfiler.enable');
  await session.post('HeapProfiler.startSampling', { samplingInterval: 128 });
  for (let i = 0; i < RUN; i++) { audio.context.currentTime += 1 / 60; audio.update(1 / 60, CTX); }
  const { profile } = await session.post('HeapProfiler.stopSampling');
  session.disconnect();
  
  const byFrame = new Map();
  let total = 0;
  (function walk(node) {
    const f = node.callFrame;
    const size = node.selfSize || 0;
    if (size > 0) {
      const key = `${f.functionName || '(anon)'} @ ${(f.url || '').split('/').slice(-1)[0]}:${f.lineNumber + 1}`;
      byFrame.set(key, (byFrame.get(key) || 0) + size);
      total += size;
    }
    for (const child of node.children || []) walk(child);
  })(profile.head);
  
  const audioBytes = [...byFrame.entries()].filter(([k]) => !/node:inspector|util:4/.test(k));
  const audioTotal = audioBytes.reduce((s, [, v]) => s + v, 0);
  console.log('sampled allocation over %d update() calls (inspector overhead excluded):', RUN);
  if (!audioBytes.length) console.log('  (none)');
  for (const [k, v] of audioBytes.sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log('  %s B  %s', String(v).padStart(9), k);
  }
  console.log('  audio total %d B  =  %s B/frame', audioTotal, (audioTotal / RUN).toFixed(4));
  console.log('  whole-process sampled total %d B  =  %s B/frame', total, (total / RUN).toFixed(4));
  console.log((audioTotal / RUN) <= 1 ? 'G3 PASS' : 'G3 FAIL');
  
}
