# The Hollow — interior design

Owner: `src/nest/*`. This is the brief for the interior volume of the hive tree: the second
explorable space of the game, entered by flying through the entrance hole with the same flight
model used outside. It is not a menu, not a room, not a UI screen.

Scale reference: **the queen is ~1 world unit long** (worker ~0.6). Every number below is in
world units unless stated otherwise. All tuning values live in `src/config.js` under `INTERIOR`
and `COMB`; nothing here is hardcoded in the modules.

---

## 1. Dimensions

The hollow is derived at runtime from the exterior tree (`HIVE` in config plus the values the
hive module exports), never hardcoded, because the exterior trunk is being rebuilt to be
enormous while this is written.

| Quantity | Rule | Value with today's `HIVE` | Value with an enormous trunk (r≈16, h≈60) |
|---|---|---|---|
| Inner radius (widest) | `max(minInnerRadius, trunkRadiusBase · radiusScale)` | 11.0 (from the 11.0 floor) | 13.1 |
| Height | `clamp(trunkHeight · heightScale, minHeight, maxAltitude − ceilingClearance)` | 48 | 82 |
| Floor Y | tree base (terrain height at the trunk) | 0 | 0 |
| Ceiling Y | floor + height | 48 | 82 |
| Entrance Y | from the hive module | 5.2 | ~22 |
| Wall thickness (collision) | `wallThickness` | 1.6 | 1.6 |

That is **48–82 queen-lengths tall and 22–26 wide** — a cathedral at bee scale. At the queen's
`maxSpeed` of 12 u/s it takes ~5 s of continuous climb to fly from the basin to the oculus, and
the waist (§3) forces a slalom on the way, so the climb is flying, not an elevator ride.

Height is capped by `FLIGHT.maxAltitude` (90 above terrain), which the flight module enforces
regardless of where we are; `ceilingClearance` keeps the oculus below that ceiling so the queen
never hits an invisible lid inside the tree. If the trunk ever grows past that, raise
`FLIGHT.maxAltitude` — that is the one external constant this design depends on.

### Bigger on the inside — stated plainly

**Yes, until the exterior rebuild lands.** `minInnerRadius = 11` is a floor: with today's
2.45-unit trunk the interior is roughly five times wider than the silhouette that contains it.
That is deliberate — the interior must be playable now and must not shrink into a drainpipe if
someone tunes the trunk down. Once the rebuilt trunk's `trunkRadiusBase · radiusScale` exceeds
11, the `max()` picks the trunk and the geometry becomes honest with **no code change**.

Three mechanisms hide the mismatch while it exists, all of which we want anyway for performance:

1. **The interior renders only when the player is inside it** (`insideness > 0`). From the
   meadow the hollow does not exist as geometry, so an oversized shell can never poke through
   the bark.
2. **From inside, the exterior trunk is invisible for free** — its material is `FrontSide`, so
   its faces are back-culled when seen from within. We never toggle it, and the entrance hole
   still frames the real meadow.
3. **During the crossing, the interior is clipped to the entrance plane** (a single
   `THREE.Plane` on the shell material, facing inward along the entrance axis). While the queen
   is in the throat, only the part of the hollow beyond the trunk wall is drawn, so no interior
   surface is ever visible outside the silhouette even for one frame.

The honest cost of the oversize is **collision**, not rendering: the wall collider ring is sized
`max(trunkRadius, innerRadius + wallThickness)`, so today an invisible cylinder of radius ~12.6
surrounds the small trunk. Its entrance gap is widened by the same ratio so the hole is still
reachable from the meadow. This disappears by itself when the trunk grows. It is logged at boot
(`[interior] oversized shell — exterior trunk is smaller than the hollow`) so nobody mistakes it
for a bug.

---

## 2. The transition — seamless fly-through

No loading screen, no teleport, no fade to black, no separate scene. One `THREE.Scene`, one
camera, one flight state; the queen crosses a **throat**: a `throatLength` (3.2) tunnel that
runs radially inward from the entrance hole through the trunk wall into the shaft.

`src/nest/portal.js` computes one scalar per frame, `insideness ∈ [0,1]`, from the queen's
position only (never from a trigger box, so it is correct on exit, on re-entry, and if the queen
is pushed by a collider):

```
radial      = distance from the trunk axis in XZ
heightBand  = smoothstep across floorY..floorY+1 and ceilY-1..ceilY
insideness  = heightBand · smoothstep(outerR + 1 → innerR(y) − 1, radial)   [inverted]
```

It is then slew-limited by `fadeSpeed` so no single frame can jump. Everything else is a
crossfade driven by that one number:

| Channel | Outside | Inside | Crossfade |
|---|---|---|---|
| Fog colour | meadow `PALETTE.fog` | `INTERIOR.fog.color` (deep warm brown) | `lerp` on `insideness` |
| Fog near/far | 90 / 520 | 6 / 120 | `lerp` |
| Scene background | sky | interior fog colour | `lerp` |
| Interior lights | removed from the scene | added, intensity ×`insideness` | intensity ramp |
| Grass, flowers, clutter | visible | hidden at `insideness > 0.85` | hard switch, invisible behind the wall |
| Interior shell | hidden | visible | shown at `insideness > 0`, clipped below 0.6 |
| Audio (when audio exists) | meadow ambience | reverb bus, muffled outdoors, wing echo | same scalar, exposed as `portal.insideness` |

The fog crossfade is the workhorse: it is what makes the tunnel *feel* like a threshold, and
because both fogs are already per-frame uniforms it costs nothing. The camera does **not**
change mode — the same spring rig follows the queen through. It gets one extra constraint while
inside (§6): its position is clamped into the shaft so it cannot end up behind the wall when the
queen hugs a surface.

Deposit-on-entry (the existing hive trigger) keeps working: the trigger is at the entrance and
`insideness` crossing 0.5 is the canonical "entered" event, exposed as `onEnter`/`onExit` for
audio and, later, for the seasonal music sting on first entry.

Rejected: a masked handoff (portal quad + second scene). It buys nothing here — the interior is
small enough to keep resident — and it costs a second render target on a GPU with 4 GB.

---

## 3. Vertical layout

Fractions are of the entrance-to-ceiling span; the shape is built around the entrance at
runtime, so it stays correct whatever height the rebuilt trunk puts the hole at.

**The Basin — floor to just below the entrance.** Radius pinches to 0.72. Root buttresses, a
still amber pool of resin seepage that is the only light down here, and the darkest air in the
game. Cool and quiet. This is where honey and pollen storage comb wants to grow (later:
temperature matters and the basin is the coldest volume). Reached by diving from the landing —
falling in is fast and getting back out is a climb, which is the correct risk/reward shape.

**The Landing — the entrance band, radius 1.00 (widest).** The throat opens onto a broad shelf
half-ringing the shaft. Brightest daylight in the hollow, a hard-edged blade of sun on the far
wall that moves with the sun. This is the arrival room, the deposit point, and where the first
comb is seeded. Everything the player needs in the first ten minutes is here — the rest of the
volume is optional, which is what makes exploring it feel like a choice.

**The Waist — 45 % of the way from entrance to ceiling, radius 0.58.** The trunk narrows and
three collapsed root beams cross the gap. You slalom through. Its real job is **sightline
denial**: standing at the entrance you cannot see the crown, only a dark constriction with light
leaking around it. That unexplained light is the reason a player flies up rather than hovering
at the hole. It is also the natural chokepoint for structural defence later (entrance
constrictor, resin traps, guard posts on the beams).

**The Crown Chamber — 78 % up, radius 0.92.** It opens out again, taller than it is wide, walls
covered in old dry comb from a previous swarm (dressing, not buildable). The queen's chamber
ledge lives here — the upgrade room is at the top of a climb, on purpose.

**The Oculus — the ceiling.** The trunk is broken open. A `oculusRadius` (2.6) hole to the sky
drops a single column of light the full height of the hollow, and it is a second, hard exit:
narrow, high, requiring a clean vertical climb. Rain, snow and season colour come through it,
which is how the interior stays connected to the seasonal clock without any UI.

Seven ledges spiral between the bands (`ledgeCount`), each `ledgeDepth` 2.4 deep. They are
perches, comb substrate, and a **ruler**: evenly spaced, known size, so the eye can read the
height of the shaft from them.

---

## 4. Lighting

Dark wood, warm palette, and the sun is outside. Four sources, none of them casting shadows —
the single shadow cascade stays reserved for the meadow.

1. **The entrance blade.** A warm `PointLight` just inside the throat plus an additive light
   shaft mesh (a soft-edged cone through the hole). It is the strongest light and it is
   *directional* in feel, so the Landing has a lit side and a dark side.
2. **The oculus column.** A vertical additive cylinder down the axis, brightest at the top,
   faded by height, with a cool tint against the warm wood. Two lights (top and mid) light the
   Crown Chamber. This is the visual bait that pulls the player upward — from the Landing you
   see the *light*, not the source.
3. **The resin pools.** Small emissive discs plus one dim amber `PointLight` in the Basin, so
   the bottom reads as a floor and not as a void.
4. **The comb itself.** Cells carry an emissive term that scales with fill level: empty wax is
   matte, honey glows. As the hive grows, the player's own construction becomes the third light
   source in the room. That is the strongest long-term reason for the interior to be dark now.

Reading depth and distance in a dark cylinder is the real problem, solved by four cues that
cost almost nothing:

- **Interior fog** (near 6, far 120, warm brown) — the primary distance cue; the far wall of a
  26-wide shaft is measurably hazier than the near one.
- **A baked vertical value gradient in vertex colours** — walls darken with distance from each
  opening. Free, and it survives the switch to an authored GLB (see §7, vertex colour needs).
- **Dust motes** — one `Points` cloud (~400) drifting in the shafts of light. Parallax against
  the walls tells the eye how big the space is, which a static image cannot.
- **Ledges at a known spacing** — the ruler above.

---

## 5. The comb lattice on a curved wall

The hard problem: hex cells must snap to a lattice that lives on a curved interior surface,
every new cell must touch an existing one, and comb must be able to grow in 3D up the shaft and
inward from the wall — not on one flat plane. `src/nest/hexgrid.js` is this and nothing else
(no build UI, no cell types — M2 owns those).

### Coordinate system: wrapped odd-r offset hex on the unwrapped cylinder, plus a layer index

The hollow is a surface of revolution, so it unwraps exactly: a point on the wall is `(θ, y)`,
and the wall is a cylinder cut open and flattened. On that flattened sheet we use a standard
**pointy-top hex lattice in odd-r offset coordinates**. A cell is:

```
{ col, row, layer }        col: around the shaft, wraps      row: up the shaft
                           layer: inward from the wall, 0 = touching the wall
```

**Seam-free wrapping is the reason for offset rather than axial coordinates.** Axial `q` shifts
by half a cell per row, so wrapping it modulo a column count is wrong on odd rows. In odd-r
offset the row offset is explicit in the mapping, so `col` wraps by plain modulo on every row.
The column count is chosen so the lattice closes exactly:

```
columns = max(6, round(2π·R_ref / cellWidth))     // R_ref = widest inner radius
dθ      = 2π / columns                            // exact, no seam by construction
dv      = cellWidth · √3/2                        // vertical row pitch (pointy-top)
θ(cell) = (col + 0.5·(row & 1)) · dθ
y(cell) = floorY + rowBase + row · dv
```

Cell centre in world space, on the actual (barrel-profiled) wall:

```
r     = radiusAt(y) − layer · cellDepth
p     = axis + (cos θ, 0, sin θ)·r + (0, y, 0)
basis = normal −(cos θ, 0, sin θ) tilted by dr/dy, tangent (−sin θ, 0, cos θ), up = n × t
```

The angular pitch is constant, so **cells are physically smaller where the shaft is narrower**
(the waist) and larger where it is wide. This is the deliberate trade: it keeps the lattice
topologically perfect — every cell touches its six neighbours everywhere, on every row, with no
seam, no T-junction and no special case at the waist — at the cost of ±20 % size variation over
the height. Real comb varies more than that, and a bee-eye view cannot tell. The alternative
(constant cell size, recomputed column count per band) produces a broken row every time the
radius crosses a threshold, which is visible and unfixable.

**Adjacency** is 8-connected: the six in-plane hex neighbours (odd-r offset tables, `col`
wrapped) plus `layer ± 1` at the same `(col,row)`. The touch rule for placement is "at least one
of those eight is occupied", so comb grows as one organic body, spirals around the shaft, climbs
it, and thickens inward from the wall in layers — the 3D growth the spec requires.

**Picking** (`worldToCell`) inverts the mapping: project the ray hit onto the axis to get
`(θ, y, r)`, convert to sheet coordinates `(u = θ/dθ, v = (y − rowBase)/dv)`, convert to axial,
cube-round, convert back to offset, wrap `col`, and derive `layer` from `r`. Round-tripping
`worldToCell(cellCenter(c)) === c` is the first check in `hexgrid.selfTest()`, along with
neighbour symmetry, wrap continuity across `col = 0`, and centre-distance uniformity within a
row. `selfTest()` returns an array of failures (empty = pass) and is reachable from the console
as `window.hollowtree.nest.grid.selfTest()`, so M2 can build against verified maths.

Ledges and the floor are **not** part of the lattice in V1. When they become buildable, they
enter as additional surfaces behind the same interface (`surfaceId` on the cell key) with their
own `(u,v) → world` mapping; nothing else in the API changes.

Capacity with today's numbers: `R_ref` 11, `cellWidth` 1.0 → 69 columns × ~55 rows × 4 layers ≈
15 000 addressable cells. Storage is a sparse `Map`, so cost is proportional to what is built.

---

## 6. Performance budget — 2019 Intel MacBook Pro, target 40 fps

The interior is cheap by construction: it is one closed shell seen from inside, so the far half
is back-culled by the GPU for free, and there is nothing beyond it to draw.

| Item | Budget |
|---|---|
| Shell + ledges + throat | 1 draw call, ≤ 6 000 triangles, `MeshLambertMaterial`, vertex colours, flat shading |
| Light shafts | 2 additive meshes, no depth write |
| Dust motes | 1 `Points`, 400 vertices, animated in the vertex shader |
| Lights | 4 `PointLight`, **zero shadow casters**, added to the scene only while inside |
| Comb (M2) | 1 `InstancedMesh` per cell type, preallocated, matrices written only on change |
| Wall collision | ~200 AABBs, rejected by a 6-compare early-out before any maths |

**Culling when outside:** the whole interior group is `visible = false`, its lights are removed
from the scene (so they cost nothing in every meadow material's shader — this is the important
one; four extra point lights recompile and slow every lit material in the meadow), and comb
instance updates are skipped.

**Culling when inside:** grass (90 000 blades), flowers (900) and ground clutter are hidden at
`insideness > 0.85`. They are behind an opaque wall, so nothing is lost, and this is the single
biggest GPU saving in the game — the interior should run *faster* than the meadow.

**Collision** is the one CPU cost that is always paid. The hollow wall is a ring of
`collisionRings × collisionSegments` (13 × 16 ≈ 200) axis-aligned slabs approximating the barrel,
with a gap at the entrance. It is a static array pushed into `terrain.colliders`, so the existing
sphere-vs-AABB resolver in `flight.js` handles the interior with no new code path: slabs push the
queen away on both sides, which means the same ring is the solid trunk from outside and the
hollow wall from inside. The hive's own solid trunk box is removed at wiring time (it would seal
the entrance); the ring replaces it. ~200 boxes × 60 Hz with an early-out is well under 0.1 ms.

**Camera:** `rig.js` has no wall push-out. Rather than change a file another agent owns, the
interior exposes `clampCamera(camera, insideness)`, called from `main.js` after the rig update:
it clamps the camera's radial distance to `radiusAt(y) − cameraMargin` and its Y into the shaft,
blended by `insideness`. Cheap, local, and reversible when the rig grows its own collision.

---

## 7. Asset request — `assets/models/hollow.glb`

Authored in Blender via MCP, exported to `assets/models/hollow.glb`, loaded through
`src/core/assets.js` as `hollow`. The engine runs without it (a crude procedural placeholder
stands in), so it can land at any time; nothing else changes when it does.

**Style bar:** the same released-game stylized low-poly language as the queen and the trunk —
warm dark wood, faceted, readable silhouettes, no photoreal bark. Judged by an independent
Critic against that bar, not against "it loads".

### Dimensions (bee scale, queen ≈ 1 unit long)

Build to these; the engine scales uniformly to the live trunk and does not stretch.

- Total height **48**, floor at `y = 0`, ceiling (oculus plane) at `y = 48`.
- Widest inner radius **11** (diameter 22), at the entrance band.
- Wall profile, radius as a fraction of 11, bottom to top:

| y | 0 | 5 | 9.5 | 14 | 24 | 32 | 42 | 45.5 | 48 |
|---|---|---|---|---|---|---|---|---|---|
| r/11 | 0.72 | 0.90 | 1.00 | 1.00 | 0.58 | 0.92 | 0.90 | 0.42 | 0.24 |

  Interpolate smoothly (no hard creases except where called out). The 0.58 pinch at y≈24 is the
  Waist and must genuinely block the sightline from the entrance to the crown.
- **Entrance hole: centre `y = 11`, on the `+Z` wall, radius 1.7** (about two queen-lengths
  across — she flies through it at speed without threading a needle). The throat is a tube
  running from the hole radially inward, length 3.2, flaring slightly into the shaft.
  *The exterior trunk's entrance numbers are changing right now: build the hole to these
  numbers, and if the exterior lands elsewhere the engine re-anchors the shell (position, and
  the throat's height) from the hive module — so the hole must be a clean, separately named
  object that survives being re-seated.*
- **Oculus: radius 2.6 at `y = 48`, open to the sky**, no cap.
- Wall thickness where it is visible (throat, oculus rim, ledge edges): **1.0–1.6**.
- Seven ledges spiralling up the wall, each ~2.4 deep, 0.45 thick, spanning 60–110° of arc,
  distributed roughly one per 6 units of height, avoiding the entrance blade's line of sight.
- Basin floor: uneven, root buttresses, two or three shallow resin pools (flat discs, separately
  named, so the engine can make them emissive).

### Named sub-objects the engine looks for

Exact names, case-sensitive, at the top level of the exported scene:

| Name | What it is |
|---|---|
| `hollow_shell` | the main wall + floor + ceiling surface (the shell the player is inside) |
| `hollow_throat` | the entrance tube |
| `hollow_ledges` | all ledges merged into one mesh |
| `hollow_pools` | resin pool discs (engine makes them emissive) |
| `hollow_deco` | old dry comb, roots, beams — anything the player cannot touch and the engine may hide first under load |

Anything not matching these names is kept and treated as decoration. Missing objects are
tolerated; a missing `hollow_shell` falls back to the placeholder.

### Conventions

- **+Y up, +Z forward.** The entrance faces **+Z**.
- **Origin at the centre of the floor** (`x = 0, z = 0, y = 0` = basin floor centre), so the
  engine seats it by dropping it at the trunk base with no offset maths.
- Apply all transforms; no parenting to empties; metres = world units; scene scale 1.0.
- Normals point **inward**, toward the player. The shell is seen from inside only, so it must
  be single-sided-correct from within. Do not rely on double-sided materials.
- Triangle budget: **6 000 total**, of which ≤ 4 000 for `hollow_shell`. Decoration must fit in
  the remainder.
- **Vertex colours are required** (`COLOR_0`, sRGB): bake the ambient-occlusion and the vertical
  value gradient into them — dark deep in the basin and behind the waist, warm and bright around
  the entrance and under the oculus. The engine multiplies them onto one untextured
  `MeshLambertMaterial`; there is no lightmap and no baked texture. This is where all the
  material richness comes from, so it carries the quality bar.
- One material for everything, or at most two (shell + pools). No image textures in V1.
- Do not model comb cells on the wall as geometry: the buildable comb is instanced at runtime.
  Old dry comb as decoration is welcome, in `hollow_deco`, clearly not on the buildable bands.

### Splitting for streaming and culling

Keep it as the five objects above in a single GLB — the whole hollow is ~6 k triangles, less
than a second of load, and splitting per band would cost more draw calls than it saves. The one
split that matters is `hollow_deco`, kept separate so it can be dropped on a slow frame budget
without touching the shell.

---

## 8. Files

| File | Contents |
|---|---|
| `src/nest/interior.js` | the volume: asset load + placeholder fallback behind one function, lighting, dust, light shafts, collider ring, camera clamp |
| `src/nest/portal.js` | the transition: `insideness`, fog/background/light crossfade, visibility switching, `onEnter`/`onExit` |
| `src/nest/hexgrid.js` | the comb coordinate system and snapping maths only, with `selfTest()` |
| `src/config.js` | `INTERIOR` and `COMB` blocks (appended, never rewritten) |
| `src/main.js` | wiring only |
