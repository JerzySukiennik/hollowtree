// Hollowtree — a looping audio layer: buffer source with inset loop points, a smoothed gain and optional filter/rate control, safe when the buffer never arrived.

export function createLayer(ctx, library, id, destination, options) {
  const opts = options || {};
  const gain = ctx.createGain();
  gain.gain.value = 0;

  let tail = gain;
  let filter = null;
  if (opts.filter) {
    filter = ctx.createBiquadFilter();
    filter.type = opts.filter;
    filter.frequency.value = opts.cutoff || 20000;
    filter.Q.value = opts.q || 0.5;
    gain.connect(filter);
    tail = filter;
  }
  tail.connect(destination);

  let source = null;
  let started = false;
  let current = 0;
  let target = 0;
  let rate = opts.rate || 1;
  let detune = opts.detune || 0;

  function start(when) {
    if (started) return true;
    const buffer = library.get(id);
    if (!buffer) return false;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const points = library.loopPoints(buffer);
    source.loopStart = points.start;
    source.loopEnd = points.end;
    source.playbackRate.value = rate;
    if (source.detune) source.detune.value = detune;
    source.connect(gain);
    try {
      source.start(when || 0, points.start + Math.random() * (points.end - points.start) * 0.5);
    } catch (error) {
      source.start(0);
    }
    started = true;
    return true;
  }

  function setTarget(value) {
    target = value > 0 ? value : 0;
  }

  function update(dt, glide) {
    if (!started) {
      if (target <= 0.0001) return;
      if (!start()) return;
    }
    const tau = glide || 0.25;
    const k = 1 - Math.exp(-dt / Math.max(0.016, tau));
    current += (target - current) * k;
    if (current < 0.0004 && target === 0) current = 0;
    gain.gain.setTargetAtTime(current, ctx.currentTime, 0.05);
  }

  function setRate(value) {
    rate = value;
    if (source) source.playbackRate.setTargetAtTime(value, ctx.currentTime, 0.08);
  }

  function setDetune(value) {
    detune = value;
    if (source && source.detune) source.detune.setTargetAtTime(value, ctx.currentTime, 0.12);
  }

  function setCutoff(value) {
    if (filter) filter.frequency.setTargetAtTime(value, ctx.currentTime, 0.12);
  }

  function stop() {
    if (source) {
      try {
        source.stop();
      } catch (error) {
        /* already stopped */
      }
      source.disconnect();
      source = null;
    }
    started = false;
    current = 0;
    target = 0;
    gain.gain.value = 0;
  }

  function dispose() {
    stop();
    try {
      tail.disconnect();
      if (filter) gain.disconnect();
    } catch (error) {
      /* already gone */
    }
  }

  return {
    id,
    gain,
    setTarget,
    update,
    setRate,
    setDetune,
    setCutoff,
    start,
    stop,
    dispose,
    get value() {
      return current;
    },
    get playing() {
      return started;
    },
  };
}
