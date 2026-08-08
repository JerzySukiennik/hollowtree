// Hollowtree — networking constants: driver selection, Firebase credentials, publish rates, interpolation and offline accrual.

export const NET = {
  // 'firebase' — the live Realtime Database (hollowtree-hive).
  // 'local'    — BroadcastChannel + localStorage, same machine, no credentials needed.
  // The local driver implements the identical interface and is what the M4 test page
  // drives; it also catches every session when Firebase is unreachable.
  driver: 'firebase',

  // Fixed by the deployed security rules: everything lives under /hives/<code>.
  root: 'hives',

  // The hive code is the ONLY access control — there is no Firebase Auth on this
  // project (anonymous sign-in needs billing). The rules reject codes shorter than
  // eight characters, so codes are generated at this length from an alphabet with no
  // look-alike glyphs. Raising this only ever makes sessions harder to guess.
  codeLength: 10,
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  codeMinLength: 8,

  // Client identity: a random id generated once and kept in localStorage. It replaces
  // auth.uid everywhere, including the lowest-id world-simulation authority rule.
  identityKey: 'ht.uid',
  identityLength: 16,

  maxPlayers: 3,

  rates: {
    motionHz: 10,          // spec: ~10 Hz authoritative publish of own queen
    idleMotionHz: 2,       // fall back to this while the queen is effectively still
    idleMoveEpsilon: 0.05, // metres of movement below which a frame counts as idle
    idleTurnEpsilon: 0.01, // quaternion component delta below which a frame counts as idle
    swarmHz: 1,            // swarm composition only ever goes out when it changes
    // How long a presence entry may go unheard before the hive treats that queen as
    // gone. This is a BACKSTOP, not the primary signal: a player who closes the tab is
    // removed instantly by Firebase onDisconnect, so the only thing this window catches
    // is a crash or a dead socket. It therefore wants to be generous rather than tight.
    // At 12 s a player who alt-tabbed vanished from their friend's hive, because a
    // hidden tab has its setInterval throttled by the browser (to ~1/min after a few
    // minutes) and cannot keep a 3 s heartbeat. 45 s survives that throttling long
    // enough for the common case of tabbing away to look something up, while a genuinely
    // crashed client still clears well inside a minute.
    presenceStaleSec: 45,
    worldClockSyncSec: 30, // the owner refreshes bank.lastActive at this interval

    // The heartbeat runs on setInterval, NOT on the frame loop: src/core/loop.js stops
    // requestAnimationFrame when the tab is hidden, and a heartbeat that stops with it
    // lets a hidden client keep believing it owns the world simulation.
    heartbeatSec: 3,

    // World-simulation ownership is a LEASE, not an inference. The owner holds
    // world/lease with a server-timestamped expiry and renews it; everyone else reads
    // it. Expiry is evaluated against the local server-corrected clock, so a client
    // that goes quiet drops its own claim with no network round trip — which is what
    // makes "never two owners at once" hold even for a frozen tab.
    leaseSec: 9,           // how long a claim is good for
    leaseGraceSec: 2,      // a non-lowest client waits this long past expiry before claiming
    // A client that has not called update() for this long is not simulating anything,
    // so it must neither renew its lease nor claim one.
    simStaleSec: 4,
  },

  interpolation: {
    // Render remote queens this far in the past so there is always a sample on both
    // sides of the render time. 100 ms is one packet interval at 10 Hz; the rest is
    // jitter budget. The buffer grows adaptively up to maxDelayMs on a bad link.
    baseDelayMs: 150,
    minDelayMs: 110,
    maxDelayMs: 420,
    jitterFactor: 3.0,     // delay target = interval + jitterFactor * jitter + safety
    safetyMs: 25,
    delayAdaptRate: 1.2,   // per-second exponential rate toward the delay target
    maxExtrapolationMs: 250,
    bufferSamples: 24,
    snapDistance: 25,      // metres; beyond this we teleport instead of interpolating
  },

  precision: {
    position: 100,    // 1 cm
    quaternion: 10000,
    velocity: 100,
    carry: 100,
  },

  bank: {
    // Offline progression: the swarm keeps working at this fraction of its live rate,
    // and never accrues more than capHours of it in one absence.
    offlineRate: 0.25,
    capHours: 8,
    minAccrualSec: 60,          // ignore absences shorter than this
    defaultRate: { pollen: 40, nectar: 30, resin: 8 }, // units/hour at full swarm rate
    // Contention on the bank node is normal, not an edge case: three queens fly into
    // the hollow together. Each client serialises its own bank writes into a queue, so
    // this budget only ever has to absorb cross-client collisions.
    transactionRetries: 40,
    retryBackoffMs: 6,
    retryBackoffMaxMs: 140,
  },

  local: {
    storagePrefix: 'ht.net.',
    latencyMs: 45,        // one-way delivery delay applied to broadcasts
    latencyJitterMs: 25,
    clockSkewMs: 900,     // simulated server-vs-client clock skew; proves now() is not Date.now()
    clientSkewSpreadMs: 2500, // each tab pretends its own clock is this far off
    reapIntervalSec: 3,
  },

  // Live project on gzowotesla@gmail.com, Spark plan, no billing. A Firebase web API
  // key is not a secret — it identifies the project, it does not authorise anything.
  // What guards the data is database.rules.json plus the length of the hive code.
  FIREBASE: {
    apiKey: 'AIzaSyCr-V27G1IOVXkbS1AlOY1lDfEoyul3-O4',
    authDomain: 'hollowtree-hive.firebaseapp.com',
    databaseURL: 'https://hollowtree-hive-default-rtdb.firebaseio.com',
    projectId: 'hollowtree-hive',
    messagingSenderId: '597019996899',
    storageBucket: 'hollowtree-hive.firebasestorage.app',
    appId: '1:597019996899:web:cb02e3e819791b4edccbd6',
  },

  // No auth module: this project has no Firebase Auth (Identity Platform needs
  // billing). Loading it would only cost bytes and add a failure mode.
  firebaseSdk: {
    version: '10.14.1',
    appUrl: 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js',
    dbUrl: 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js',
  },

  // Seconds to wait for the RTDB socket before falling back to the local driver, so a
  // dead connection can never stall the loading screen.
  connectTimeoutSec: 8,

  season: {
    // One season is two real days; a full year is eight. Derived from the server epoch.
    lengthSec: 2 * 24 * 3600,
    names: ['spring', 'summer', 'autumn', 'prewinter'],
  },

  debug: false,
};

export const FIREBASE = NET.FIREBASE;
