// Hollowtree trailer — injected before any page script. Replaces every source of
// wall-clock time and randomness with a virtual clock the renderer steps by hand, so the
// same frame index always produces the same pixels. Nothing here touches src/.

(() => {
  const CFG = window.__TRAILER_CFG || {};
  const seed = (CFG.seed | 0) || 20260808;
  let dateEpoch = Number(CFG.dateEpoch) || 1754640000000;

  // ---------------------------------------------------------------- randomness
  let s = seed >>> 0;
  function rand() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  Math.random = rand;

  // ---------------------------------------------------------------- virtual clock
  // `vt` is milliseconds since page start. performance.now() reads it directly;
  // Date.now() is the epoch plus it. Both only move when step() says so.
  let vt = 0;

  const RealDate = Date;
  const RealPerfNow = performance.now.bind(performance);

  performance.now = () => vt;
  if (performance.timeOrigin !== undefined) {
    try { Object.defineProperty(performance, 'timeOrigin', { get: () => dateEpoch }); } catch (e) {}
  }

  function VirtualDate(...args) {
    if (!(this instanceof VirtualDate)) return new RealDate(dateEpoch + vt).toString();
    if (args.length === 0) return new RealDate(dateEpoch + vt);
    return new RealDate(...args);
  }
  VirtualDate.prototype = RealDate.prototype;
  VirtualDate.now = () => dateEpoch + vt;
  VirtualDate.parse = RealDate.parse;
  VirtualDate.UTC = RealDate.UTC;
  window.Date = VirtualDate;

  // ---------------------------------------------------------------- frame queue
  // requestAnimationFrame never fires on its own. Callbacks queue up and are drained
  // exactly once per step(), which is what makes the frame timeline exact.
  let queue = [];
  let nextId = 1;
  const ids = new Map();

  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    ids.set(id, cb);
    queue.push(id);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    ids.delete(id);
    const i = queue.indexOf(id);
    if (i !== -1) queue.splice(i, 1);
  };

  // The page must never think it is hidden: loop.js stops itself on visibilitychange.
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
  } catch (e) {}

  let frames = 0;

  window.__h = {
    get vt() { return vt; },
    get frames() { return frames; },
    get pending() { return queue.length; },
    realNow: RealPerfNow,
    // Advance the virtual clock by dtMs and run every callback queued for this frame.
    // Callbacks queued *during* the drain belong to the next frame, which is exactly how
    // a real rAF behaves.
    step(dtMs) {
      // Reseed per frame. Network driver timers and other real-time callbacks fire between
      // steps a different number of times on every run, and each call they make to
      // Math.random() shifts the stream for the frame that follows. Anchoring the seed to
      // the frame index makes the sequence a function of WHICH frame this is rather than of
      // how much wall-clock time the render happened to take.
      s = (seed ^ Math.imul(frames + 1, 2654435761)) >>> 0;
      vt += dtMs;
      const batch = queue;
      queue = [];
      for (let i = 0; i < batch.length; i++) {
        const cb = ids.get(batch[i]);
        if (!cb) continue;
        ids.delete(batch[i]);
        try { cb(vt); } catch (err) { console.error('[harness] rAF threw', err); }
      }
      frames++;
      return frames;
    },
    // Move the world clock without running a frame — used to set the time of day for a
    // shot after boot has already burned some virtual seconds. Everything time-derived
    // (sky, season, weather schedule) reads Date.now(), so this is the only lever needed.
    setEpoch(ms) { dateEpoch = Number(ms) || 0; },
    get epoch() { return dateEpoch; },
    get worldNow() { return dateEpoch + vt; },
  };
})();
