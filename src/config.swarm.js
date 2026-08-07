// Hollowtree — the swarm: worker types and boid/economy tuning.
//
// A worker type is DATA. src/entities/swarm.js is a generic evaluator over these
// records and never branches on a type id: adding builder/guard/fanner is an entry
// here, not a new `if` in the system. Only `forager` is buildable from a bare hive;
// everything else names the comb cell that unlocks it in `requiresCell` (the wax
// workshop, per the master prompt), so the unlock graph reads from the data alone.
//
// Field vocabulary:
//   cost:         { pollen|nectar|resin } charged through the shared bank, per bee
//   upkeep:       honey units per second, per bee — the only negative feedback
//   gatherRate:   units/sec this type pulls from a settled flower (0 = never settles)
//   staff:        optional key into comb's COMB_TUNING.staffing that this type feeds,
//                 so a swarm of fanners really does speed the comb's ripening
//   staffPerBee:  how much of that staffing one bee contributes (total clamped to 1)
//   requiresCell: comb cell type id that must be built and active before buy() works
//   starveOrder:  who dies first when the honey runs out — higher goes first, so the
//                 hive keeps its foragers (its only way back out of starvation) longest
//   body:         purely visual — size and colours for the instanced mesh

export const WORKER_TYPES = [
  {
    id: 'forager',
    name: 'forager',
    blurb: 'settles the blooms around yours — this is the whole efficiency curve',
    cost: { pollen: 10, nectar: 0, resin: 0 },
    upkeep: 0.011,
    gatherRate: 0.42,
    staff: null,
    staffPerBee: 0,
    requiresCell: null,
    starveOrder: 0,
    body: { scale: 0.62, coat: 0xf0b34a, dark: 0x2a1d13, wing: 0xd8e7f2 },
  },
  {
    id: 'builder',
    name: 'builder',
    blurb: 'wax on the wing: cells go up faster and repairs stop dragging',
    cost: { pollen: 14, nectar: 0, resin: 4 },
    upkeep: 0.015,
    gatherRate: 0.12,
    staff: 'builder',
    staffPerBee: 0.09,
    requiresCell: 'wax',
    starveOrder: 2,
    body: { scale: 0.60, coat: 0xd8c89a, dark: 0x3a2b1c, wing: 0xd8e7f2 },
  },
  {
    id: 'guard',
    name: 'guard',
    blurb: 'sits the guard posts; never leaves the route to pick flowers',
    cost: { pollen: 8, nectar: 0, resin: 6 },
    upkeep: 0.013,
    gatherRate: 0,
    staff: null,
    staffPerBee: 0,
    requiresCell: 'wax',
    starveOrder: 3,
    body: { scale: 0.66, coat: 0x9c7b52, dark: 0x1d150e, wing: 0xcddbe6 },
  },
  {
    id: 'fanner',
    name: 'fanner',
    blurb: 'ripens nectar faster and cools the hollow in high summer',
    cost: { pollen: 9, nectar: 4, resin: 0 },
    upkeep: 0.009,
    gatherRate: 0.18,
    staff: 'fanning',
    staffPerBee: 0.08,
    requiresCell: 'wax',
    starveOrder: 1,
    body: { scale: 0.56, coat: 0xf6c95a, dark: 0x33240f, wing: 0xe4f0f8 },
  },
];

export const WORKER_BY_ID = new Map(WORKER_TYPES.map((t) => [t.id, t]));

// Buildable before a single wax workshop exists — everything else names `requiresCell`.
export const STARTER_WORKERS = WORKER_TYPES.filter((t) => !t.requiresCell).map((t) => t.id);

export const COST_KINDS = ['pollen', 'nectar', 'resin'];

export function workerCost(typeId, n) {
  const type = WORKER_BY_ID.get(typeId);
  const count = Math.max(0, Math.round(Number(n) || 0));
  const out = {};
  for (const kind of COST_KINDS) out[kind] = ((type && type.cost && type.cost[kind]) || 0) * count;
  return out;
}

export const SWARM = {
  // ---------------------------------------------------------------- capacity
  // The cap is the comb's, always: sum of brood-cell swarmCap (already computed by
  // src/nest/comb.js, warmth bonus included). `floorLimit` is what a hive with a comb
  // but no brood can still hold, so M3 is playable the moment it is wired; `baseLimit`
  // is the fallback when there is no comb object at all (the test harness, and any
  // scene that has a queen before it has a nest).
  floorLimit: 2,
  baseLimit: 3,

  // Instanced pool per worker type. Three queens × 200 bees is the contract, but those
  // 600 are spread over types and flocks, so one type never needs the full budget.
  poolPerType: 640,

  // ---------------------------------------------------------------- boids
  // perception IS the spatial-grid cell size: one cell per perception radius means a
  // 3×3×3 bin sweep covers the whole neighbourhood exactly once. Never widen one
  // without the other.
  perception: 2.6,
  separation: 1.05,
  maxNeighbours: 10,        // hard bound: this is what keeps the search O(n), not O(n²)

  wSeparation: 5.4,
  wAlignment: 0.85,
  wCohesion: 0.55,
  wAnchor: 1.9,             // pull toward the queen (or the assigned flower)
  wSettle: 5.2,             // pull toward an assigned bloom — beats the anchor on purpose

  maxSpeed: 9.5,
  maxForce: 26.0,
  drag: 0.55,
  arrive: 3.2,              // start easing off the anchor inside this radius
  wander: 1.35,             // per-bee idle drift so a parked swarm still breathes
  wanderHz: 0.37,

  // Where the cloud sits relative to the queen: behind and a little above, so she is
  // never buried in her own swarm and the silhouette stays readable from the TPP camera.
  trail: 2.3,
  lift: 0.75,
  spread: 1.5,              // radius of the follow cloud
  groundClearance: 0.35,

  // ---------------------------------------------------------------- collective gather
  // The one mechanic the whole milestone exists for: while the queen holds E on a
  // bloom, her workers settle the blooms AROUND it. A bigger swarm reaches more of
  // them and reaches further — nothing else in the game raises throughput.
  assignHz: 4,              // reassignment tick; flower lookups never run per frame
  settleBase: 5.5,          // radius searched with an empty swarm
  settleGrowth: 1.45,       // added per sqrt(bee), so 4× the bees is ~2× the reach
  settleMax: 26.0,
  probeRadius: 4.0,         // how far a probe point may look for its own nearest bloom
  probePerBee: 0.55,        // probe points scale with the swarm; more probes, more blooms
  probeMax: 72,
  beesPerFlower: 3,         // above this the extra bees queue on the same bloom
  settleDist: 0.85,         // must be this close before it draws anything
  settleHover: 0.55,

  // ---------------------------------------------------------------- upkeep
  // A large swarm without storage eats more than it brings. Consumption is honey per
  // second summed from the type records; when the stores are empty the swarm SHRINKS
  // on this cadence rather than the hive dying — the master prompt is explicit that
  // there is no game over, the swarm just contracts.
  starveGraceSec: 2.5,      // empty stores tolerated this long before the first loss
  starveShrinkSec: 4.0,     // one bee lost per this many seconds of continued famine
  starveRecoverSec: 3.0,    // how fast the famine timer unwinds once honey returns
  upkeepIndoorRelief: 0.45, // a swarm sheltering in the hollow eats less

  // ---------------------------------------------------------------- render
  wingBeatHz: 24,
  wingSmear: 0.5,
  bobAmp: 0.05,
  castShadow: false,        // hard rule: swarm bees never cast shadows
  cullDistance: 120,

  // ---------------------------------------------------------------- misc
  // The spatial hash table. Power of two so the hash can mask instead of modulo.
  hashBins: 4096,
  // Deduct upkeep straight from comb.stores.honey when a comb is present. Turn this
  // off and the swarm only reports `upkeep.consumed` and leaves the books to the caller.
  consumeHoneyDirectly: true,
  // Push staffing into the comb when the composition changes (never per frame — a
  // setStaffing call forces a comb recompute).
  driveCombStaffing: true,
};
