// Hollowtree — hornet raids: when they come, how the nest's shape turns them back, and what a failed defence costs.
//
// Every number here is read by src/entities/hornets.js and by nothing else. The whole
// system is deterministic from (HORNETS.seed, the world epoch, the season index), so two
// clients that never talk still agree on which season is raided, at what minute, by how
// many, and what the outcome was.
//
// Design rules these numbers serve, from the master prompt:
//   - the player never fights; contact only costs the load she is carrying
//   - defence is structural: the constrictor, the traps, the guard posts and the length
//     of the corridor from the mouth to the stores are the whole of it
//   - a failed defence steals honey and destroys cells on the path; it never wipes the
//     hive, never empties the bank below zero, never touches a queen's chamber

export const HORNETS = {
  seed: 20260807,

  // A hard ceiling on live hornets: one InstancedMesh sized once, never resized.
  maxAlive: 24,

  // Per-season probability of a raid. Late summer and autumn, per the prompt; spring is
  // free. Keys are the season names from NET.season.names.
  seasonChance: { spring: 0, summer: 0.35, autumn: 0.85, prewinter: 0.5 },

  // Where inside the season the raid lands, as a fraction of the season length.
  seasonWindow: [0.32, 0.88],

  // How far ahead schedule() looks for the next raid, so the calendar can mark a raid
  // that is still two seasons out.
  lookaheadSeasons: 9,

  // schedule() is re-derived at most this often; it is pure arithmetic, but it has no
  // reason to run on every frame.
  scheduleEverySec: 5,

  countMin: 5,
  countMax: 14,

  timing: {
    // The announcement, in seconds before the swarm reaches the mouth. This is the
    // number that makes the event fair: the sound and the calendar marker both fire at
    // arriveAt - warnLeadSec, and everything the hive can do about it must fit inside.
    warnLeadSec: 180,
    approachSec: 45,   // visible flight in from the slope
    assaultSec: 60,    // at the mouth — this window is where the defence does its work
    raidSec: 45,       // inside, out of sight, taking what they came for
    departSec: 25,     // back out to the slope
    retreatSec: 9,     // a repelled hornet's own flight home
  },

  // The slope by the forest edge, relative to the hollow tree. bearing is radians on the
  // XZ plane; the per-raid jitter keeps them from always using the same lane.
  origin: {
    bearing: 2.35,
    bearingJitter: 0.55,
    distance: 220,
    altitude: 30,
  },

  // How the built nest turns a raid back. Each stage eats into the number that reaches
  // the stores; nothing here is a die roll the player cannot see coming.
  defence: {
    // comb effects.hornetSlow is 0..0.9. This is how much of that slowdown becomes
    // hornets that give up at the mouth rather than merely arriving later.
    constrictorTurnaway: 0.62,

    // Resin traps are consumable: comb effects.trapCharges is the stock.
    trapKillPerCharge: 0.5,

    // A guard seat is worth this many hornets over one assault window.
    guardKillPerSlot: 0.95,

    // M3 will publish real guard staffing as comb.staffing.guard. Until it does, a built
    // guard post counts as staffed — otherwise the cell the prompt calls defence would
    // measurably do nothing.
    defaultGuardStaffing: 1,

    // The corridor. Every lattice step between the mouth and the nearest store cell
    // takes this much off what the breachers manage to carry out.
    corridorPerStep: 0.07,
    corridorMax: 0.55,
  },

  // What a breach costs. Deliberately expressed in stores and cells, never in progress.
  loss: {
    honeyPerBreacher: 9,
    // Never more than this share of the honey on hand, whatever the swarm size. The loss
    // has to hurt in weeks of stores, not in a restart.
    honeyMaxFraction: 0.6,

    cellsPerBreacher: 0.5,
    maxCellsLost: 12,
    maxCellFraction: 0.25,

    // Cell types a raid can never take. The queen's chamber is the respawn point.
    protectedTypes: ['queen'],
  },

  // Contact is local to each client: only this machine knows where its own queen really
  // is this frame. Touching a hornet drops the load, nothing else.
  contact: {
    radius: 2.6,
    cooldownSec: 6,
  },

  render: {
    bodyLength: 0.62,
    bodyRadius: 0.17,
    wingSpan: 0.72,
    swirlAmp: 1.35,
    swirlFreq: [1.7, 2.3, 1.1],
    circleRadius: 4.2,
    circleSpread: 2.1,
    circleSpeed: 0.85,
    approachEase: 2.0,
    colors: {
      dark: 0x241a12,
      amber: 0xd8a12c,
      head: 0x120d09,
      wing: 0xd9dbc9,
      wingAlpha: 0.5,
    },
  },
};

export const HORNET_PHASES = ['idle', 'warning', 'inbound', 'assault', 'raid', 'depart'];
