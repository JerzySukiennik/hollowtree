// Hollowtree — comb cell definitions: costs, build times, effects and adjacency bonuses.
//
// Everything a cell type does is DATA. src/nest/comb.js is a generic evaluator over
// these records — it never branches on a type id. Adding a cell type is an entry here,
// not a new `if` somewhere in the system.
//
// Effect vocabulary (all optional, all additive across cells unless noted):
//   capacity: { pollen|nectar|resin|honey: n }   store room this cell contributes
//   swarmCap: n                                  brood: how many workers it houses
//   convert:  { from, to, rate, per }            nectar ripening; rate is TO-units/sec,
//                                                `per` is FROM-units consumed per TO-unit
//   unlocks:  [typeId]                           types this cell makes buildable
//   buildSpeed: n                                additive multiplier on build times
//   guardSlots: n                                seats for guard workers (M3)
//   hornetSlow: 0..1                             fraction a hornet is slowed at the mouth
//   forageThroughput: n                          signed multiplier on our own foragers
//   trapCharges: n                               consumable resin-trap charges
//   queenChamber: true                           respawn + upgrade point
//
// Bonus vocabulary — the reason the hexes are not decoration:
//   source: 'occupiedNeighbours'  every finished neighbour (6 in-plane + layer ±1)
//           'neighbourTag'        finished neighbours carrying `tag`
//           'sameType'            finished neighbours of this cell's own type
//           'routeProximity'      how close to the entrance along the built route
//   per / max: bonus = min(max, per * count); the effect named by `applies` is
//              multiplied by (1 + bonus)
//   staff:     optional key into COMB_TUNING.staffing, so M3's worker types scale a
//              bonus that already exists and is already visible today
//
// Gates — a cell whose gate fails is BUILT but INERT (`cell.active === false`), and
// contributes none of its effects:
//   { kind: 'route', range: n }   must sit within n built steps of the entrance mouth
//
// Two flags exist for the seed comb and are meaningful on any type:
//   hidden: true      never offered to the player — kept out of CELL_TYPES entirely, so
//                     neither the build panel nor unlockedTypes() can ever list it
//   permanent: true   cannot be demolished; the hive must never be able to reach zero
//                     cells again, or "must touch the comb" becomes unsatisfiable

export const COMB_TUNING = {
  // The bare hollow before a single cell is built. Without this M1 gathering would have
  // nowhere to put anything; with it, the first stores are a real upgrade rather than
  // the difference between zero and non-zero.
  baseCapacity: { pollen: 40, nectar: 40, resin: 40, honey: 0 },

  // Demolition returns this fraction of the cell's RESIN cost, per the master prompt
  // ("częściowy zwrot żywicy") — pollen and nectar spent on a cell are gone.
  refundFraction: 0.5,

  // Entrance route: cells within `apertureRing` lattice steps of the aperture are the
  // mouth; a built cell is "on the route" if it is reachable from a built mouth cell in
  // at most `routeRange` steps through other built cells.
  apertureRing: 2,
  routeRange: 5,

  // Worker staffing, 0..1. M3 sets these from the real swarm; until then a bare hive
  // fans and builds at the baseline below, so adjacency is observable today.
  staffing: { fanning: 1, builder: 0 },

  // Cells under construction are the only ones whose matrices move. Capped so a burst of
  // placements cannot turn into per-frame instance uploads.
  buildTickHz: 12,
  growFrom: 0.28,

  // Ripening runs on this cadence, not per frame: it is a transaction when networked.
  convertTickSec: 1.0,

  // Geometry
  fill: 0.94,          // hex across-flats as a fraction of the lattice pitch
  depthFill: 0.86,     // prism depth as a fraction of COMB.cellDepth
  emissive: 0.06,      // default self-glow, as a fraction of the cell's own colour

  // The seed comb. DESIGN-hollow.md §3 puts the first comb on the Landing, and without
  // it the touch rule has nothing to touch: the player's first cell may land anywhere on
  // a 320 x 71 x 4 lattice wrapped round the whole hall, and every later placement is
  // then refused with "must touch the comb" pointing at a cell they cannot find.
  //
  // It sits dead centre of the single buildable wall, at aperture height, so it is straight
  // ahead at eye level the moment the queen flies in. It used to hug the aperture rim on the
  // entrance wall, which put it BEHIND her — the reported "there is no comb anywhere".
  seed: {
    type: 'seed',
    owner: 'hive',
    cells: 7,          // anchor + its six neighbours: one hex flower
    probeSteps: 14,    // how far to search either side of centre for a column the lattice takes
  },

  colors: {
    ghostValid: 0x8ff2a8,
    ghostInvalid: 0xff7d6b,
    inert: 0x6b5b46,
  },
};

export const CELL_TYPES = [
  {
    id: 'honey',
    name: 'honey store',
    blurb: 'ripens nectar into honey; a bank of them breathes together',
    cost: { pollen: 2, nectar: 0, resin: 4 },
    buildTime: 6,
    color: 0xf2b544,
    tags: ['airflow', 'store'],
    effects: {
      capacity: { honey: 25, nectar: 12 },
      convert: { from: 'nectar', to: 'honey', rate: 0.045, per: 1.5 },
    },
    bonus: {
      id: 'airflow',
      label: 'airflow',
      source: 'neighbourTag',
      tag: 'airflow',
      per: 0.16,
      max: 0.8,
      applies: 'convert.rate',
      staff: 'fanning',
    },
  },
  {
    id: 'pollen',
    name: 'pollen store',
    blurb: 'bread cells; packed side by side they waste less wax',
    cost: { pollen: 1, nectar: 0, resin: 3 },
    buildTime: 5,
    color: 0xf6c95a,
    tags: ['store'],
    effects: { capacity: { pollen: 30 } },
    bonus: {
      id: 'packing',
      label: 'packing',
      source: 'sameType',
      per: 0.1,
      max: 0.4,
      applies: 'capacity.pollen',
    },
  },
  {
    id: 'brood',
    name: 'brood cell',
    blurb: 'raises the swarm cap; needs the warmth of a tight build',
    cost: { pollen: 6, nectar: 2, resin: 2 },
    buildTime: 9,
    color: 0xe0a25c,
    tags: ['warm'],
    effects: { swarmCap: 4 },
    bonus: {
      id: 'warmth',
      label: 'warmth',
      source: 'occupiedNeighbours',
      per: 0.12,
      max: 0.6,
      applies: 'swarmCap',
    },
  },
  {
    id: 'queen',
    name: "queen's chamber",
    blurb: 'your respawn point and flight upgrades — one per queen',
    cost: { pollen: 4, nectar: 4, resin: 6 },
    buildTime: 10,
    color: 0xffe6a8,
    tags: ['warm'],
    limitPerPlayer: 1,
    effects: { queenChamber: true },
    bonus: {
      id: 'shelter',
      label: 'shelter',
      source: 'occupiedNeighbours',
      per: 0.08,
      max: 0.48,
      applies: 'none',
    },
  },
  {
    id: 'wax',
    name: 'wax workshop',
    blurb: 'unlocks the defensive cells and speeds every build',
    cost: { pollen: 8, nectar: 4, resin: 8 },
    buildTime: 12,
    color: 0xd8c89a,
    tags: ['airflow'],
    effects: {
      capacity: { resin: 20 },
      buildSpeed: 0.15,
      unlocks: ['guard', 'constrictor', 'trap'],
    },
    bonus: null,
  },
  {
    id: 'guard',
    name: 'guard post',
    blurb: 'seats guards — only works on the route from the entrance',
    cost: { pollen: 2, nectar: 0, resin: 8 },
    buildTime: 8,
    color: 0x9c7b52,
    tags: ['defence'],
    requires: 'wax',
    gate: { kind: 'route', range: 5 },
    effects: { guardSlots: 2 },
    bonus: {
      id: 'watch',
      label: 'watch',
      source: 'routeProximity',
      per: 0.2,
      max: 0.8,
      applies: 'guardSlots',
    },
  },
  {
    id: 'constrictor',
    name: 'entrance constrictor',
    blurb: 'narrows the mouth: hornets slow down, so do your own foragers',
    cost: { pollen: 0, nectar: 0, resin: 14 },
    buildTime: 10,
    color: 0x7a5a3a,
    tags: ['defence'],
    requires: 'wax',
    gate: { kind: 'route', range: 2 },
    effects: { hornetSlow: 0.35, forageThroughput: -0.18 },
    bonus: {
      id: 'choke',
      label: 'choke',
      source: 'routeProximity',
      per: 0.25,
      max: 0.5,
      applies: 'hornetSlow',
    },
  },
  {
    id: 'trap',
    name: 'resin trap',
    blurb: 'sticky floor on the inlet route; it wears out',
    cost: { pollen: 0, nectar: 0, resin: 9 },
    buildTime: 6,
    color: 0xb7784a,
    tags: ['defence'],
    requires: 'wax',
    gate: { kind: 'route', range: 4 },
    effects: { trapCharges: 6 },
    bonus: {
      id: 'placement',
      label: 'placement',
      source: 'routeProximity',
      per: 0.25,
      max: 0.75,
      applies: 'trapCharges',
    },
  },
];

// Types the player never chooses. They are deliberately NOT in CELL_TYPES: the build
// panel and every "what can I build" query iterate that list, so keeping them out here is
// what stops a dead row appearing in the UI. src/nest/comb.js renders and resolves cells
// from ALL_CELL_TYPES / CELL_BY_ID below, which do include them.
export const HIDDEN_CELL_TYPES = [
  {
    id: 'seed',
    name: 'old comb',
    blurb: 'dry comb left by the swarm before you — the hive grows outward from here',
    cost: { pollen: 0, nectar: 0, resin: 0 },
    buildTime: 0,
    color: 0xc79c5c,
    // Brighter than the rest on purpose: in a hall this dark the seed is the landmark
    // that answers "where may I build", so it has to read from across the Landing.
    emissive: 0.42,
    tags: [],
    hidden: true,
    permanent: true,
    // Nothing in the game unlocks 'seed', so typeUnlocked() is false forever and the
    // player can never place one even if a type id leaks into build mode.
    requires: '__never',
    effects: {},
    bonus: null,
  },
];

export const ALL_CELL_TYPES = CELL_TYPES.concat(HIDDEN_CELL_TYPES);

export const CELL_BY_ID = new Map(ALL_CELL_TYPES.map((t) => [t.id, t]));

// Types buildable before anything exists. Everything else names its unlocking cell in
// `requires`, so the unlock graph is readable from the data alone.
export const STARTER_TYPES = CELL_TYPES.filter((t) => !t.requires).map((t) => t.id);

export const COST_KINDS = ['pollen', 'nectar', 'resin'];

export function costOf(typeId) {
  const type = CELL_BY_ID.get(typeId);
  const cost = {};
  for (const kind of COST_KINDS) cost[kind] = (type && type.cost && type.cost[kind]) || 0;
  return cost;
}

export function refundOf(typeId, fraction) {
  const f = typeof fraction === 'number' ? fraction : COMB_TUNING.refundFraction;
  const cost = costOf(typeId);
  return { resin: Math.round(cost.resin * f * 100) / 100 };
}
