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

  // ---------------------------------------------------------------- virtual timers
  // Boot needs real timers: asset loading and the network handshake resolve on them. Once
  // the world is up they become a liability — a setTimeout that fires between two captured
  // frames advances the world by an amount that depends on how long the screenshot took.
  // After freeze() every pending and future timer is due on the virtual clock and fires
  // inside step(), in order, so real time stops being an input to the render.
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearInterval = window.clearInterval.bind(window);

  let frozen = false;
  let timerId = 1;
  const timers = new Map();

  function fireDueTimers() {
    if (!frozen) return;
    // A bounded number of rounds: a timer that reschedules itself at zero delay must not
    // spin the frame forever.
    for (let round = 0; round < 8; round++) {
      const due = [];
      for (const [id, t] of timers) if (t.due <= vt) due.push([id, t]);
      if (!due.length) return;
      due.sort((a, b) => (a[1].due - b[1].due) || (a[0] - b[0]));
      for (const [id, t] of due) {
        if (t.repeat) t.due = vt + Math.max(1, t.delay);
        else timers.delete(id);
        try { t.fn(...t.args); } catch (err) { console.error('[harness] timer threw', err); }
      }
    }
  }

  function freezeTimers() {
    if (frozen) return;
    frozen = true;
    window.setTimeout = (fn, delay, ...args) => {
      if (typeof fn !== 'function') return 0;
      const id = timerId++;
      timers.set(id, { fn, args, due: vt + (Number(delay) || 0), repeat: false, delay: Number(delay) || 0 });
      return id;
    };
    window.setInterval = (fn, delay, ...args) => {
      if (typeof fn !== 'function') return 0;
      const id = timerId++;
      const d = Math.max(1, Number(delay) || 0);
      timers.set(id, { fn, args, due: vt + d, repeat: true, delay: d });
      return id;
    };
    window.clearTimeout = (id) => { timers.delete(id); realClearTimeout(id); };
    window.clearInterval = (id) => { timers.delete(id); realClearInterval(id); };
  }

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
      fireDueTimers();
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
    freezeTimers,
    get frozen() { return frozen; },
    // One round trip per frame instead of two. Anything that fires between two separate
    // calls — a stray timer, a promise chained off one — would otherwise land at a point
    // that depends on how long the round trip took.
    advance(frameIndex, dtMs) {
      if (window.__cine) window.__cine.frame(frameIndex);
      return this.step(dtMs);
    },
    setEpoch(ms) { dateEpoch = Number(ms) || 0; },
    get epoch() { return dateEpoch; },
    get worldNow() { return dateEpoch + vt; },
  };
})();
