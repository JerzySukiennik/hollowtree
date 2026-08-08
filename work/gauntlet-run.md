# Gauntlet run — Hollowtree authored assets

- Run ID: 2026-08-06-hollowtree-assets
- Status: ACTIVE
- Mode: FULL MULTI-AGENT
- Objective: Replace every placeholder stand-in in the live build with an authored Blender asset that an independent Critic judges to meet the released-stylized-low-poly-studio-game bar, verified in-engine.
- Artifact: `assets/models/hollow-tree.glb`, `flower-daisy.glb`, `flower-clover.glb`, `flower-harebell.glb`, `meadow-tree.glb`, `hollow.glb` (+ any wiring in `src/` needed to load them)
- Reference mode: PROXY (benchmark profile — released stylized low-poly game asset; no single copyable exemplar)
- Reference: benchmark profile in §Rubric below, derived from the master prompt's per-layer bars
- Rubric version: v1
- Pass rule: weighted >= 85/100, every critical dimension >= 4/5, all gates PASS
- Comparison requirement: single-candidate benchmark-profile evaluation by a fresh-context Critic (non-blind, artifact has no provenance cues in the packet — renders only)
- Budget: default stop conditions (max 8 rounds per asset, 3 critic attempts per unchanged candidate)
- Started: 2026-08-06
- Approval boundaries: no deploy, no commit-and-push without Jurek; local file writes only

## Rubric (per 3D asset)

| # | Dimension | Weight | Critical | Anchors |
|---|---|---:|---|---|
| 1 | Silhouette & readability | 25 | yes | Recognizable at 5 px and at full screen; reads as its object from any of 4 viewing angles; no ambiguous blobs |
| 2 | Form craft & proportion | 25 | yes | Deliberate faceting, believable mass distribution, no primitive-stack look, no intersecting seams visible from gameplay angles |
| 3 | Colour & surface finish | 20 | no | Palette matches config (bark 0x6b503a, canopy 0x527a35, warm honey key); vertex-colour AO/gradient present; no flat single-tone surfaces |
| 4 | Spec compliance | 15 | yes | Dimensions, named anchors, axis convention, tri budget, single-GLB export path exactly as briefed |
| 5 | In-engine result | 15 | yes | Loads with zero console errors, sits correctly in the world, no z-fighting/holes/shadow acne, frame budget unchanged |

## Gates (binary)

- G1 GLB exports to the exact briefed path and the engine loads it with no console error.
- G2 All briefed named nodes exist and the engine resolves them.
- G3 Triangle budget respected.
- G4 Gameplay function preserved (entrance passable / gather anchor reachable / instancing intact).
- G5 No regression: game boots to menu and to play mode as before.

## Baseline (2026-08-06)

Live build runs at http://localhost:8123. Console shows five missing models:
`hollow.glb`, `flower-daisy.glb`, `flower-clover.glb`, `flower-harebell.glb`, `meadow-tree.glb`, `hollow-tree.glb`.
Only `queen.glb` is authored. Everything else renders through crude procedural placeholders:
the hero hollow tree is a dark box-cylinder, flowers are white discs, background forest is
blobs, the interior is white slabs. Baseline score against the rubric: **UNJUDGEABLE as authored
asset — placeholders are explicitly out of the quality bar** (they are stand-ins, not candidates).

Largest gaps, ranked: (1) hollow tree exterior — dominates every frame and the menu backdrop;
(2) interior hollow — the second play space, currently white slabs; (3) flowers — the thing the
player looks at while gathering; (4) background forest.

## Round 1 — hollow-tree.glb

- Target gap: hero prop is a procedural placeholder box.
- Builder assignment: Blender MCP builder -> assets/models/hollow-tree.glb (+ work/blender/build_tree.py, render_tree.py)
- Candidate snapshot: assets/models/hollow-tree.glb, 489 688 B, 5 806 tris
- Changes: authored leaning bole, 6 buttresses, 4 broken limbs, 7-8 faceted leaf masses, entrance collar at y=16, vertex-colour AO, 3 materials.
- Verification (orchestrator, in-engine at http://localhost:8123):
  - PASS — loads: node list resolves `trunk`, `canopy`, `canopy_foliage`, `entrance`; no `hollow-tree.glb` 404 after reload.
  - PASS — entrance anchor: engine reports hive.entrance = (0, 16, 7.76), i.e. +Z at the briefed height.
  - PASS — frame rate: 52 fps in play mode on this machine (target 40).
- Critic identity: fresh-context Critic subagent, single-candidate benchmark-profile mode, no builder narrative in the packet.
- Critic verdict: REJECT, confidence high. Weighted 59/100. Scores: silhouette 3, form 4, colour 3, spec 3, in-engine 1.
- Gate results: G1 PASS (defect: `canopy` holds 408 bark tris), G2 PASS, **G3 FAIL**, G4 PASS, G5 PASS.
- Largest gap: **the tree is not hollow** — trunk is a watertight solid (0 boundary edges); 49 rays across the r=3.2 aperture all hit wood at z≈4.0–6.6; the cavity is a blind alcove ~3.3 deep. Flying the queen through the entrance is impossible.
- Secondary gaps: vertex-colour checkerboarding on the trunk; `canopy` not foliage-only; canopy is 8 near-identical icospheres; doubleSided materials.
- Decision: REJECT -> Round 2 build (queued behind the flower builder; Blender is a single shared connection).
- Best-known candidate: hollow-tree.glb r1 (in the build, better than the placeholder, but failing G3).

## Round 1 — flowers (daisy / clover / harebell)

- Target gap: flowers were flat placeholder discs; they are what the player stares at while gathering.
- Builder assignment: Blender MCP builder -> assets/models/flower-{daisy,clover,harebell}.glb
- Candidate snapshot: 165 / 148 / 135 triangles, one material each, COLOR_0 float VEC3, `head` empty in each.
- Verification (orchestrator, file-level): all three GLBs parse; node names `head` + mesh; budgets met (≤170/150/150); no textures, cameras or lights. In-engine: all three load with no 404 and render in the meadow.
- Critic identity: fresh-context Critic subagent, single-candidate benchmark-profile mode.
- Critic verdict: CONDITIONAL PASS, confidence high. Weighted 81/100. Scores: readability 4, form 3, colour 4, spec 5, instancing 5.
- Gate results: G1–G5 all PASS.
- Largest gap: harebell main stem physically pierces the main bell (13 tri pairs at y 5.37–5.83) — a green stripe across the bloom at the exact point the player hovers to gather.
- Secondary: clover head is a featureless dome with no floret structure; clover leaves are not trifoliate; harebell lobe tips near-white; daisy petal underside reads grey.
- Decision: CONDITIONAL PASS treated as rejection per the contract -> revision brief sent to the builder; re-critique required after re-export.
- Best-known candidate: flower set r1 (already live in the build and far better than the placeholders).

## Orchestrator fixes between rounds (2026-08-06)

- **Entrance marker floated ~30 units in front of the tree.** `adoptTree` in `src/entities/hive.js` read the
  `entrance` anchor with `getWorldPosition()` *before* `group.add(root)`, so the anchor was still in scene space
  while the hive group sits at z = -30. `entranceSurface` came out 36.5 instead of 6.5, putting the glowing
  entrance ring — and the deposit trigger — in mid-air over the meadow. Fixed by parenting first, then converting
  the anchor through `group.worldToLocal`. Evidence: ring world position went from (0, 16, +6.9) to (0, 16, -23.1),
  which is on the trunk surface, and the screenshot now shows the ring seated in the bark.
- **Preview pane served a stale module graph.** Edits to `src/main.js` were invisible to the running page even after
  reload; `window.hollowtree` kept the pre-edit key set while `curl` showed the new file. Replaced the dev server with
  `work/devserver.py` (no-store headers) on port 8124 and updated `.claude/launch.json`. Verification is trustworthy again.
- Audio wired into `src/main.js` (creation, `unlock()` on menu launch, per-frame `update`, volume routing, deposit hook).
  In-engine: `window.hollowtree.audio.available === true`, 54-60 fps, no console errors.

## Systems integrated (2026-08-06)

**Audio** — `src/audio/*` + `src/config.audio.js`, 36 clips / 8.83 MB, every file licence-logged in
`assets/audio/CREDITS.md` (7 ambience beds + 9 weather clips from Jurek's licensed library, the rest CC0
from Freesound and Kenney, with a rejected-sources table). Wired in `main.js`: `unlock()` on menu launch,
per-frame `update` with insideness/speed/season/gathering, volumes from the settings panel, deposit one-shot.
Verified in-engine: `window.hollowtree.audio.available === true`, 60 fps, no console errors.
`thunder(distanceMeters)` added afterwards so the seeded lightning drives the bang instead of audio inventing
its own — verified headlessly: delay matches d/343 within 1e-6 s, internal generator latches off after the
first external cue (0 internal strikes over 100 s of storm), fallback still fires 9 strikes when undriven.

**Weather** — `src/world/weather.js` + `src/config.weather.js`. Six states, deterministic from (seed, startedAt),
cross-faded, never snapped. Agent-measured: avg 0.08 ms/frame, worst 0.20 ms; 3584 rain particles at high quality
in one draw call; 0.0 KB heap delta over 2000 update calls; two independent instances with the same seed produced
identical 240-sample chains over 4 h. Verified in-engine by the orchestrator: driving a storm gave 2176 rain
instances, 3 fog layers, wind 3.2 m/s at 60 fps, and the screenshot shows a real downpour with the meadow greyed out.
**Open regression:** the grass wind work declares `uWindDir`/`uWindBias` twice, so all four grass materials fail to
compile (`VALIDATE_STATUS false`). Sent back to the builder with the console output and an acceptance test.

**Multiplayer (M4)** — `src/net/*` + `src/config.net.js`. Agent test suite: **40 passed / 0 failed** in the browser-
identical headless run, plus 21/21 pure-logic. Contended deposits commit 40/40 and land on the exact sum (a stale-read
`set()` would have lost updates); authority is the lowest live client id with clean handover and never two owners;
presence reaps ghosts; offline accrual credits exactly 8 h of a 20 h absence at 25 % and never double-credits.
Interpolation: 150 ms base / 110–420 ms adaptive, mean error 0.037 m, worst 0.360 m. Uplink 1.60 KB/s per client,
~4.8 KB/s aggregate at three players — under the 2 KB/s target. The live RTDB rules were probed with the exact write
shapes: all five allowed subtrees 200, unlisted subtree 401, short code 401, outside `/hives` 401.
Verified in-engine by the orchestrator: entering a solo world produced `driver: "firebase"`, a 10-character hive code,
a stable uid and `isAuthority: true`, at 60 fps. `LOBBY.codeLength` raised 5 → 10 so join-by-code matches the minted codes.

## Round 2 — hollow-tree.glb

- Target gap: G3 failed in round 1 — the tree was not hollow.
- Changes: real through-shaft cut through the trunk wall into an inner void; vertex-colour checkerboarding replaced with a
  height/AO gradient; `canopy` node made foliage-only; materials made single-sided; entrance empty re-seated on the aperture mouth.
- Verification (orchestrator, own ray test on the exported GLB): 29 samples across the r=3.2 aperture, **0 failures** —
  every ray shows ≥4 crossings or exits past z < −4. In-engine: loads with no 404, 60 fps.
- Critic identity: fresh-context Critic subagent (different session from round 1), single-candidate benchmark-profile mode.
- Critic verdict: **CONDITIONAL PASS**, confidence high. Weighted **81/100** (was 59). Scores: silhouette 4, form 3, colour 4, spec 5, in-engine 5.
- Gate results: **G1–G5 all PASS**. G3 independently re-tested with 289 rays over 9 concentric rings: 0 failures, and a swept
  1.0-radius body clears z=+12 → −4 with 1.51 minimum clearance. 0 flipped normals across 5906 tris; trunk watertight; single-sided materials.
- Largest remaining gap: branches and roots are 21 separate closed shells interpenetrating the trunk (22 connected components,
  not 1), so every junction is a hard collarless seam. Acceptance test: welding by position yields ≤2 components with no visible seam.
- Secondary: entrance illegible off-axis (collapses to a sliver at 45°); a black slit at y≈25–34 exposes the hollow beside a branch
  junction; 25 % of bark verts clamp at luminance 0.609; foliage reads as a mid-clump dark band rather than a light direction.
- Decision: keep in the build (all gates pass, big improvement), queue the weld pass behind the two missing assets — placeholders
  cost more quality than the tree's seams do.
- Best-known candidate: hollow-tree.glb r2, 81/100.

## Open bugs found while verifying (owner: orchestrator)

1. ~~The game can strand in `cinematic` mode.~~ **Not a bug — retracted.** The loop stops itself on
   `visibilitychange` (`src/core/loop.js` calls `stop()` when `document.hidden`), and the Browser preview pane reports
   `document.hidden === true` whenever it is not painting. So while I drove the page from the console the cinematic
   genuinely froze — `renderer.info.render.frame` stuck at 1, zero render-handler calls, `loop.state.fps` reporting a
   stale 60 because it is only smoothed inside `tick`. Taking a screenshot makes the pane paint, the loop resumes, and
   the cinematic runs to completion and reaches `play` normally (verified: frame 1 → 145, cinematic time 221 s, mode `play`).
   **Lesson for every future verification in this project:** `fps` from `loop.state` is not proof the loop is running —
   check `renderer.info.render.frame` advancing, and remember that console-driven probes run with the tab hidden.

2. **`flight.position` is a derived, render-sampled vector** — writing to it silently does nothing (reads back the old value in the
   same statement). The authoritative state is `flight.simPosition`. Not a bug in itself, but it is an easy trap; anything that
   teleports the queen (respawn at the queen's chamber, debug tools, netcode) must write `simPosition`.

## Round 1 — hollow.glb (the interior)

- Target gap: the second playable space was white procedural slabs.
- Candidate: 7706 tris, 2 materials, four named objects, COLOR_0 (VEC3 float) on every primitive.
- Verification (orchestrator): loads in-engine, `assets.get('hollow')` non-null, the `hollow.glb` 404 is gone.
- Critic identity: fresh-context Critic subagent, single-candidate benchmark-profile mode.
- Critic verdict: CONDITIONAL PASS, confidence high. Weighted **68/100**. Scores: place/scale 3, form 2, baked light 4, spec 5, inside-out 4.
- Gate results: **G1–G5 all PASS**. Winding proven two ways — 0 inconsistent directed edges, and 12 000 rays from 300 interior
  points produced 0 backfacing first hits on the shell. Proportions exact: 96.00 × 63.64 × 64.00.
- Largest gap: `hollow_deco` models **64 regular hexagonal comb cells** (1024 tris) on the buildable wall bands — geometry the
  engine generates at runtime, so it will z-fight and double up with player-built comb.
- Secondary: the shell is six flat slabs (±2 u relief over 96 × 64, no taper) with ledges on a perfect mirrored grid, so it reads as
  a rectangular hall with shelves; the entrance aperture is centred at y≈13.5 while the engine's entrance line is y=16 (a queen would
  clip the lintel); under-ledge occlusion is only 23 % and the ceiling is the brightest surface class; 16 one-triangle slivers float
  near the ceiling.
- Decision: revision brief sent with acceptance tests for each item.
- Best-known candidate: hollow.glb r1 (live in the build, far better than the white slabs).
- Note: the builder's renders were lit by its own rig and blew out the openings, so the Critic judged geometry and COLOR_0
  statistics directly and said so. Re-render instructions were included in the revision.

## Round 1 — meadow-tree.glb (background forest)

- Candidate: 390 tris (budget 900), one object `meadow_tree`, one material, COLOR_0 present, height 1.003, origin at base centre.
- Verification (orchestrator): GLB parses with the expected single node; served 200 by the dev server; the
  `meadow-tree.glb not found` warning is gone from a fresh boot; in-engine the 46 instances render as narrow poplar-like
  spires that are visibly a different, plainer species from the hero oak, which was the point.
- **Not independently critiqued** — judged by the orchestrator against its spec only. Low risk (always seen at distance
  through fog, 390 tris, single instanced geometry), but this is a gap in the Gauntlet topology and is recorded as such.

## Round 2 — hollow.glb (interior revision)

- Builder re-export: 8318 tris, 2 materials, four named objects, bbox exactly 96.000 × 63.640 × 64.000.
- Builder's own acceptance-test numbers (to be checked by a fresh Critic, not accepted as evidence):
  modelled hex comb removed; wall inset std 5.01 (target ≥5); cross-section −26.7 % from y=10 to y=55 (target ≥15 %);
  ledge down/up luminance 0.38 (target ≤0.50); shell under a shelf 46.3 % darker (target ≥30 %); floor/ceiling 1.05;
  zero components under 4 triangles. Entrance deliberately NOT moved to model y=16 — the engine seats the floor at
  `baseY + 3.2`, so the flight line is model y≈12.8; the aperture was widened to span y 9.75–17.25 instead.
- A fresh Critic is re-reviewing against the same rubric with those exact acceptance tests.
- Critic identity: fresh-context Critic subagent (different session from round 1), same rubric, same acceptance tests.
- Critic verdict: **PASS**, confidence high. Weighted **86/100** (was 68). Scores: place/scale 4, form 4, baked light 4, spec 5, inside-out 5.
- Gate results: **G1-G5 all PASS**, each with independent numbers: 0 regular-hexagon components anywhere; wall inset std 6.53
  and cross-section variation 17.0 % (29 % across the full height range); entrance open span y 8.45-17.50 with the engine's
  y=12.8 line clear by 4.35 below / 4.70 above and >=3.25 lateral; ledge down/up luminance ratio 0.379 and shell 39.4 % darker
  under shelves; 0 components under 4 triangles, 8318 tris, 2 materials, proportions 0.00 % off.
- This is the first candidate in the run to meet the full pass rule (>=85 weighted, every critical dimension >=4, all gates PASS).
- Largest remaining gap (refinement, not a gate): no authored vertical light logic above the entrance - corr(luminance, y) = -0.053
  and no upper aperture is pierced, so the crown carries only AO. The bright ceiling in the renders is the render rig, not COLOR_0.
- Best-known candidate: hollow.glb r2, 86/100, PASS.

## Environment note — Blender crashed mid-revision (2026-08-06 ~13:15)

The Blender process died while the revision builder was welding the tree's limbs into the trunk (MCP returned
"Not connected to Blender", `pgrep -x Blender` empty). Nothing was lost on disk — `hollow-tree.glb` remained the
11:41 build and the flowers the 11:03 build — but the in-memory scene was gone. Relaunched with `open -a Blender`;
the addon auto-starts, so the MCP reconnected immediately with a fresh default scene.
Suspected cause: a large boolean union across 21 separate limb solids. The builder was told to export after each
milestone, to prefer extrusion/bridging over booleans, to run any boolean one limb at a time, and to fall back to the
flower job if the tree keeps crashing the solver.

## Completion (session of 2026-08-06)

- Final status: **PARTIAL — 1 PASS, 3 CONDITIONAL PASS, 1 orchestrator-verified only; run still ACTIVE**
- Final candidates:
  - `assets/models/hollow.glb` — **PASS**, 86/100, all 5 gates (fresh Critic, round 2)
  - `assets/models/hollow-tree.glb` — CONDITIONAL PASS, 81/100, all 5 gates (fresh Critic, round 2); weld pass queued
  - `assets/models/flower-{daisy,clover,harebell}.glb` — CONDITIONAL PASS, 81/100, all 5 gates (fresh Critic); fixes queued
  - `assets/models/meadow-tree.glb` — orchestrator-verified against spec only, **no independent Critic** (topology gap, disclosed)
  - `assets/models/queen.glb` — pre-existing, not reviewed this run
- Mandatory gates across all reviewed assets: every gate PASS in the latest round of each.
- Rounds completed: hollow-tree 2, flowers 1, hollow 2, meadow-tree 1.
- Role topology: Orchestrator + 6 specialist Builders (3 Blender, audio, weather, netcode) + 5 fresh-context Critics.
  Every decisive review used a fresh Critic that did not build the artifact and received renders/GLBs with no builder narrative.
  Mode: **FULL MULTI-AGENT** for the reviewed 3D assets. The three code systems (audio, weather, netcode) were **not** put
  through an independent Critic this session — they were verified by their own test suites plus orchestrator in-engine checks.
  That is a disclosed gap in the topology, not a pass.
- Strongest evidence: 289-ray passage test on the tree; 12 000-ray inside-out test and 5 measured acceptance tests on the interior;
  40/40 netcode suite plus a two-tab live-Firebase session with correct authority election; storm running at 60 fps in-engine.
- Remaining gaps: tree limbs unwelded (22 components); interior lacks vertical light logic above the entrance and has no pierced
  skylight; harebell stem pierces its bell; clover head lacks floret structure; meadow-tree never independently reviewed;
  audio/weather/netcode never independently reviewed.
- Unverified claims: smooth motion interpolation of a remote queen between two tabs (the preview pane pauses the hidden tab);
  the interior has not been seen in-engine from inside during play.
- Second Brain learning: project note updated; three inbox notes written (Firebase MCP active-project trap, `getWorldPosition`
  before parenting, stale ES-module cache in the preview pane); `tools/build-indexes.py` run.
- Resume condition: Blender revision builder finishes the tree weld and the flower fixes, then a fresh Critic re-reviews each.

## Round 1 — netcode (independent Critic, specification conformance)

- Critic identity: fresh-context Critic, read the code against the master prompt's authority model, ran both suites itself.
- Critic verdict: **REJECT**, confidence high. Weighted **62/100**. Scores: authority conformance 2, concurrency 4,
  failure handling 3, rules conformance 4, test integrity 3.
- Gates: G1 PASS (40/0 and 21/0, counted independently), G2 PASS (no `set` on a resource path — every bank write is a
  transaction), **G3 FAIL**, G4 PASS with listed exceptions, G5 PASS (all writes inside the five allowed subtrees, codes ≥8).
- **Largest gap — permanent dual world-simulation ownership.** `loop.js:65-68` stops rAF on `visibilitychange`, which stops
  `net.update` and therefore the 4 s presence heartbeat; the peer reaps the entry after 12 s and claims authority, while the
  hidden client never revokes its own flag because `livePresenceUids()` unconditionally re-inserts its own uid
  (`index.js:146`). Measured: after 15 s hidden, both clients report `isMine() === true`, with no self-healing until refocus.
  A 44 ms dual-owner window on join was also reproduced. Authority is per-client inference over eventually-consistent
  presence with no lease; the one transactional claim (`world/host`) is used only for lobby labels.
- **This invalidates my own earlier verification.** I had checked authority once in a settled two-tab state, saw exactly one
  owner, and reported it as correct. One settled sample cannot prove a single-owner invariant — the failure lives in the
  transitions. Recorded as a verification lesson, not just a code bug.
- Secondary: the whole authority + world-clock layer is **dead code with respect to the game** — nothing outside `src/net/`
  reads `net.authority` or `net.world`; season is the literal `'summer'` in `main.js`, flower regrowth is local, weather runs
  on client `Date.now()`. "The world advances while nobody plays" is a primitive, not a behaviour yet. Also: retry bounding and
  backoff exist only in the local driver, which is the only one the tests exercise; a reaped-and-returning client permanently
  loses its cosmetics; aggregate bandwidth is logged unasserted.
- Decision: REJECT -> revision brief sent with the Critic's acceptance test (a case that samples `isMine()` on both clients
  every 50 ms across a stall of 2x the stale window and passes only if zero samples show two owners).

## Resumed after an API session limit (2026-08-06 17:00)

Three agents were killed mid-work by the session limit. Their files survived; I verified each myself
with the acceptance tests rather than trusting the partial reports:

- **hollow-tree.glb — weld acceptance test PASSED.** Welding the trunk by position now yields **1 connected
  component** (target <=2, was 22). 7212 tris total, 5212 trunk (budgets 12000 / 6000), height 74.0 base 0,
  `entrance` at (-0.400, 16.000, 6.441) on +Z. Through-passage re-tested: 65 rays, **0 failures**.
- **flowers — re-exported, harebell fix confirmed visually.** daisy 165 / clover 144 / harebell 149 tris, `head`
  node in each, heights 4.603 / 3.900 / 6.300. The bells now hang from side branches; the green stripe across the
  bloom is gone; the clover head reads as a floret cluster. Unfinished: thin ribbon leaflets, a hairline sliver
  face on the harebell, and the bell colour overcorrected to near-white. Sent back.
  (Note: my own crude triangle-intersection re-test reported 79 "hits" above y=4.5, but it grouped faces by vertex
  colour and counted the legitimate peduncle-to-bell attachment. The render is decisive and the defect is gone —
  recording this so the number is not mistaken later for a regression.)
- **netcode — the authority fix landed and passes the acceptance test I set.** `47 passed, 1 failed`.
  New case: *never two owners at any sampled instant during the stall* — **0 dual-owner samples of 474 over 24 s**,
  plus 0 dual-owner samples in the handover case and the ticking client taking over. It honestly logs
  `129 of 474 samples had no owner (the gap between expiry and the next claim)`.
  Remaining failure: *the resumed client keeps its colour and pattern in the roster* — meta is republished and the
  peer returns to the roster, but the cosmetic fields do not survive the reap-and-return on the peer's view.

## Round 3 — hollow-tree.glb (weld)

- Critic identity: fresh-context Critic (third distinct session on this asset), same rubric.
- Critic verdict: **CONDITIONAL PASS**, confidence high. Weighted **90/100** (59 -> 81 -> 90).
  Scores: silhouette 4, form 4, colour 5, spec 5, in-engine 5.
- Gates: **G1-G5 all PASS.** Weld: 14 633 -> 2 606 verts, **1 connected component** (was 22), edge-use histogram
  `{2: 7818}` — 0 boundary edges, 0 non-manifold, watertight, positive volume. Passage: 289 rays, 0 failures, centre
  ray clear to z = -5.6 (12 units of depth). Spec: height 74.0000, base 0.00000, `entrance` 0.026 from the aperture
  mouth plane. 7 212 tris (5 212 trunk). Colour defects from round 2 confirmed fixed: bark now 6 481 unique values
  with only 0.02 % near max (was 25 % clamped), foliage 5 702 unique values (the mid-clump band is gone).
- **The condition that blocks a full PASS:** the black slit flagged in round 2 is not fixed — it has grown into a
  1-2 unit wide, 10.5 unit tall crevice at x 3.5-5.0, z 1.5-3.5 exposing the interior shell continuously from
  y=23.5 to y=34. It is the first surface hit from both the front and the side camera, and renders as a pure-black
  gash (743 px in front-entrance.png, 890 px in side.png) — a second, unauthored "hole" above the real entrance on a
  prop that is on screen constantly.
- Per the contract, CONDITIONAL PASS counts as rejection until the named condition is resolved and reverified.
- Secondary: entrance still only ~4 px at 160x120 from a 45° approach; the silhouette carries no hollow cue (the
  chamber's back wall makes the mask solid); the aperture is a 6.2 x 7.5 ellipse rather than the specified r=3.2
  circle (clear radius 2.77 — safe for a 1-unit body); +X branch stubs end in flat caps.
- Best-known candidate: hollow-tree.glb r3, 90/100.

## Round 2 — netcode (after the lease rewrite)

- Suites re-run by the orchestrator: `net-node` **49 passed / 0 failed**, `net-logic` **27 passed / 0 failed**.
- The acceptance test I set is green: *never two owners at any sampled instant during the stall* — 0 dual-owner
  samples of 472 over 24 s, the frozen client revokes its own claim (lease expires in 7501 ms), the ticking client
  takes over, and the resumed client keeps its cosmetics in the peer's view and roster.
- Authority is now a **server-timestamped lease** claimed by transaction, with presence/lease/reaping moved off the
  rAF loop onto `setInterval` — so a hidden tab can no longer hold ownership. Honest cost, logged by the suite:
  188 of 472 samples (~40 % of a 24 s stall) had *no* owner, the gap between lease expiry and the next claim.
- The Firebase driver now enforces the retry bound itself instead of delegating to the SDK; `spend` clamps at zero
  so a purchase cannot land a hair below zero and be rejected wholesale by the deployed rule.
- A real bug surfaced while writing the new tests: a never-drained flower read as **empty** rather than full, which
  would have started every meadow stripped bare.
- Still true and unchanged: all concurrency numbers come from the local driver; real RTDB contention across the
  internet is untested until three people are in a hive at once.

## World clock wired into the game (orchestrator, 2026-08-06 17:4x)

Closing the Critic's secondary gap "the authority and world-clock layer is dead code with respect to the game":

- **Season** now comes from `net.world.seasonPhase()` per frame instead of the literal `'summer'` in `main.js`.
  Verified live against Firebase: `window.hollowtree.season === 'spring'`, derived from the server epoch, identical
  on every client with no syncing (it is pure arithmetic over one shared timestamp).
- **Weather** is seeded once by the authority into `world/weather` with a seed derived from the hive code, and every
  client subscribes and follows via `setFromWorld`. Because the weather chain is infinite and deterministic from
  `(seed, startedAt)`, one write covers every future storm. Verified live: the published entry
  `{kind:'clear', intensity:0.4, seed:1137309528, startedAt:1786030091621, durationMs:600000}` came back through the
  subscription and the local weather adopted it, with no console errors.
- **Flower reserves** are the remaining piece — still local per client, so the meadow is not yet shared and does not
  regrow while nobody plays. Handed to a builder with the transactional API (`net.flowers.amount/drain/subscribe`)
  and its own verification page.
- Live database cleaned: both throwaway test hives (`RULECHECK1`, `RCWWC2TPJA`) deleted; `hives` is now empty.

## Round 2 — flowers

- Critic identity: fresh-context Critic (second distinct session on this set), same rubric, revision-specific gates.
- Critic verdict: **PASS**, confidence high. Weighted **86/100** (was 81). Scores: readability 4, form 4, colour 4, spec 5, instancing 5.
- Gates: **G1-G5 all PASS.** Notably the Critic rejected grouping by vertex colour for the intersection test and grouped by
  position-welded connected components instead (the files ship unwelded for flat shading, so raw-index islands are
  meaningless) — 36/21/13 authored parts. Exact Moller tri-tri test excluding shared-vertex pairs: **zero
  stem-through-bloom pairs on the harebell**; every intersection is an intentional join hidden inside a calyx.
  Degenerate check: 0 triangles under 1 % of median area in all three (the hairline sliver is gone). Budgets
  165/144/149. Heights exact. Palette measured on the file: harebell peak is exactly #b9cdf2, so the near-white
  wash-out is fixed; daisy underside is now warm tan, not grey.
- This is the **second candidate to meet the full pass rule** (>=85 weighted, every critical dimension >=4, all gates).
- Largest remaining gap (refinement): the harebell's five pedicels leave a vertical stem at 2.7-18.9 degrees from
  horizontal as straight prisms, so each plant reads as bells hung from right-angle booms rather than arching stalks.
- Secondary: clover leaflets are flat 2-tri kites with no midrib fold; the bell wall is a single straight taper with
  lobing only at the rim; the daisy is the only file pushed to pure white (45 verts at linear 1.0); leaves are
  zero-thickness sheets that rely on the engine material being DoubleSide.
- Best-known candidate: flower set r2, 86/100, PASS.

## Shared flower reserves — verification caught a Node-vs-browser gap

The builder delivered 30/0 in Node and correctly refused to claim it had seen the game render. I took that gate and
found the discrepancy: **the same page fails in the browser**, which is the shipping environment.

```
FAIL  shared depletion timed out after 20 s
FAIL  the transaction credits what it actually took  (no callback)
FAIL  the draining client sees the reduced reserve  (4.290 vs 3.500)
FAIL  the other client sees the same reduced reserve  (4.561 vs 3.500)
FAIL  contention timed out after 20 s
```

The drifting reserve readings (rather than a wrong-but-stable number) point at the derived value continuing to regrow
while the drain never commits — i.e. the transaction never resolves in the browser at all. Prime suspect is the local
driver's transport: two simulated clients inside one tab and `BroadcastChannel` not delivering to the instance that
posted. Sent back with the requirement to say plainly whether the defect is in the harness or in the shipping code —
because if the drain genuinely never resolves in a browser, the Node suite has been measuring something players never run.

The game itself boots and renders with `flowers.attachNet(net)` wired in `main.js`: meadow, flowers, welded tree,
background trees, frames advancing, no boot errors.

## Completion (session of 2026-08-06, second half)

- Final status: **2 PASS, 2 CONDITIONAL PASS, 1 orchestrator-verified only, 1 item in flight**
- Final candidates:
  - `hollow.glb` — **PASS**, 86/100, all gates (fresh Critic, round 2)
  - `flower-{daisy,clover,harebell}.glb` — **PASS**, 86/100, all gates (fresh Critic, round 2)
  - `hollow-tree.glb` — CONDITIONAL PASS, **90/100**, all gates (fresh Critic, round 3). The condition it named
    (the interior-exposing crevice) has since been removed and re-verified by me: 1 connected component, 0 boundary
    edges, 97-ray passage with 0 failures, height 74.0000, aperture now the specified r=3.2 circle. A fourth Critic
    pass would be needed to convert that into a formal PASS.
  - `meadow-tree.glb` — orchestrator-verified against spec only, **no independent Critic** (disclosed topology gap)
  - netcode — REJECT at 62/100 in round 1, rebuilt around a server-timestamped lease; suites now 49/0 and 27/0 with
    the Critic's own acceptance test green (0 dual-owner samples of 472 over a 24 s stall). **Not yet re-critiqued.**
  - audio, weather — still never independently critiqued (disclosed).
- In flight: shared flower reserves. 30/0 in Node, but **5 failures in the browser** — sent back with the requirement
  to identify whether the defect is in the harness or the shipping code.
- Rounds: hollow-tree 3, flowers 2, hollow 2, meadow-tree 1, netcode 1 (+1 rebuild pending review).
- Role topology: Orchestrator + 8 specialist Builders + 8 fresh-context Critics. Every decisive review used a fresh
  Critic that did not build the artifact.
- Verification lessons recorded to the vault this session: a stale `fps` counter on a stopped loop; one settled sample
  cannot prove a single-owner invariant; a green Node run says nothing about browser-only APIs.

## Correction — the "browser fails where Node passes" verdict was my measurement error

I reported that the shared-reserve harness failed five cases in the browser and sent that back to the builder as a
defect. It was not one. The rebuilt page probes its own environment first and prints:

```
INFO  tab is hidden; a 25 ms timer took 2984 ms — this tab is throttled ~126x by the browser,
      so every deadline below is stretched to match.
PASS  a second BroadcastChannel in this document hears the first  (same-document delivery works)
PASS  a peer's drain reaches the other client's subscription  (a=4.000 arrived 16358 ms after the drain was asked for)
```

The Browser preview pane reports `document.hidden === true` whenever it is not painting, and a hidden tab has its
timers throttled ~126x. Cross-client delivery worked the whole time — it just took 16 s of wall clock instead of
~100 ms, which blew every 20 s deadline in the original harness. My BroadcastChannel hypothesis was wrong too:
same-document delivery works, and the builder proved it rather than accepting my theory.

**Same family as the two earlier traps in this run** (a stale `fps` counter on a stopped loop; one settled sample
used to "prove" a single-owner invariant) — a measurement taken where the defect does not live. This time it cost a
false defect report to a builder. The rule to carry forward: **before treating a timing failure in the preview pane
as a product defect, check `document.hidden` and measure the actual timer skew** — and prefer harnesses that
self-report their environment, as this one now does.

## Flaky test found while re-verifying (2026-08-06 18:3x)

`net-node`'s *no rubber-banding or jitter between frames* flips under machine load:
three consecutive runs on this machine gave FAIL 0.628 m, FAIL 0.632 m, PASS 0.517 m against the same code.
Several subagents were compiling and rendering at the time. So the suite's headline number is load-sensitive:
"49 passed / 0 failed" is true on an idle machine and not reproducible on a busy one. That is a test-robustness
defect, not (on this evidence) a product defect — but it cuts both ways, because a threshold that trips on load
can also mask a real regression on a quiet run. Recorded for the netcode owner: the case should either measure
against simulated frame times rather than wall clock, or state a load-independent bound.

## Second correction — the "lost update" was also not a defect

I escalated `5.000 + 5.000 = 10.000 of 6` as a genuine double-spend, citing the harness's own annotation
("both commits inside one regrowDelay, so no regrowth was possible") as ruling out the innocent explanation.
**The annotation itself was wrong.** It computed the window from a record that, under throttling, had only received
the first client's echo, so it measured ~0 s where 16 s had actually elapsed. The second transaction detected the
conflict and retried correctly; by the time it committed, the flower had legitimately regrown.

Atomicity was then proved with a test no timing can explain away — regrowth switched off, three clients racing one
bloom under a 4 s timer clamp:

```
PASS  three queens on one frozen bloom split exactly what it held, no more
      (5.000 + 1.000 + 0.000 = 6.000 of 6 (15 asked, regrowth off))
PASS  with regrowth live, the takes stay inside what the flower could grow meanwhile
      (5.000 + 2.204 = 7.204 of at most 9.607 over a 12.0 s race)
```

The second FAIL (`no geometry or buffer rebuild`) was a static assertion string plus a browser-only cause: the
authored `flower-*.glb` files exist in the browser and not in the Node harness, so `adopt()` legitimately swapped
the geometry mid-case. Both fixed.

One real code finding did come out of it: the offline read path called `Date.now()` **per flower, 1050x per frame**;
now sampled once per frame, worst case 1.31 -> 0.40 ms/frame.

**Three iterations in a row I took a measurement from a throttled environment as the product's state** — first the
timeouts, then the drifting reserves, then this. Each time the builder was right to probe the environment before the
code. The durable rule: a harness must report the window it actually measured, not the one it assumed, and an
orchestrator must not treat a harness's own annotation as independent evidence.

## Shared flower reserves — landed (2026-08-06 19:xx)

Evidence accepted:
- **Atomicity where timing cannot explain it away:** regrowth switched off, three clients racing one bloom under a
  4 s timer clamp — `5.000 + 1.000 + 0.000 = 6.000 of 6` (15 asked). This is the assertion that matters, and it is
  now the harness's primary one.
- 40/0 at honest speed (r8); 38/0 under a 4 s clamp (r6); 24 green in the throttled preview pane including shared
  depletion agreeing across clients, peer delivery, the regrowth curve to three decimals, and a fresh meadow
  reading full (1050 of 1050).
- Game boots and renders with `flowers.attachNet(net)` wired; offline path unchanged.

Two real code findings came out of the harness work, both fixed: the offline read path called `Date.now()` per
flower (1050x per frame, 1.31 -> 0.40 ms/frame after sampling once per frame and amortising the refresh over frames),
and the amortising cursor's stranding risk got its own case (clock wound 60 s: 0 flowers left tracked, 0 short of full).

**Known limitation, not a product defect:** the harness still has assertions that compare two *derived,
time-dependent* values with absolute equality, so in a throttled tab they can differ by the regrowth accrued between
the two reads (last seen: 3.807 vs 3.843 — 0.036, exactly 0.12 s at 0.3/s). Tolerances need deriving at read time.
Recorded rather than chased further; the session had already spent three rounds on environment-versus-product
confusion and the product evidence above is independent of it.

## Shared flower reserves — r11, and a real defect the tolerance fix uncovered

Chasing the last "harness artifact" turned up a genuine product bug. Between a drain committing and its echo
returning, `hasEntry` was still 0 — which correctly means "nobody ever drained this flower", i.e. **full**. So a bloom
the queen had just stripped sprang back to 6.000 for a whole round trip and then wilted again: invisible at 50 ms,
glaring on a slow link. `pump()` now adopts its own commit as the record until the server's stamp overwrites it.

The builder's note on how it caught this is the more valuable half: **its first guard passed against the broken
code**, because the local driver emits inside its transaction so the echo always beats the promise and the branch
never executed. A guard that cannot fail is not a guard. It rebuilt the test with a driver whose drain resolves
before the subscription fires and demonstrated both directions:

```
pre-fix:   highest reading before the echo: 6.000  -> FAIL  the bloom sprang back to full
post-fix:  highest reading before the echo: 3.000  -> PASS  the bloom stayed drained
```

Final: **r11 = 43 passed, 0 failed**, three consecutive runs; 38/0 under a 4 s clamp at 200x throttle;
`net-node` 49/0 and `net-logic` 27/0 clean at idle. Cost 0.50 ms/frame with all 1050 flowers tracked.

**Correction to my own "known limitation" entry above.** I recorded the residual as "the harness is throttle
sensitive". The builder's framing is sharper and correct: every one of the last three failures had the same root
cause — a constant where a time-derived bound belonged. Two of those constants were the harness's own and one
produced a false accusation against the transaction. The durable rule is narrower and more useful:
**never compare a time-derived value against a fixed number.** Three separate bugs, one rule.

## Round 1 — audio and weather (independent Critic, closing a disclosed topology gap)

- Critic identity: fresh-context Critic. Ran both subsystems itself (Node + a three.js shim for weather, a stub
  AudioContext and stub fetch for audio) rather than reading only.
- Verdict: **REJECT**, confidence high. Weighted **audio 65 / weather 85**.
- Gates: G1 PASS (36 files, 36 credit rows, zero orphans either way, no duplicate hashes), G2 PASS (determinism
  proved three ways, including 108 000 lockstep `update()` frames over 3 h with 40 identical lightning strikes —
  a path the authors' own harness never tested), **G3 FAIL for audio** (10.18 B/frame from four `Object.keys()`
  calls in the hot path) / PASS for weather (2.35 B/frame, nothing retained), G4 PASS (every fetch failing, and
  Web Audio absent: module still constructs, 6000 frames complete, exactly one warning per file), G5 PASS
  (`setIndoor` verified on instance counts, not `visible`: rain 3584 -> 0, splash 112 -> 0, fog 4 -> 0, wind 1.68 -> 0).

**The finding that matters: the audio's headline behaviours are dead at the wiring, and the wiring is mine.**
- `swarmSize: 0` was hardcoded into the only `audio.update` call, so the whole swarm-scaling path and the two
  `bee-swarm` voices (static gain 0.0 by design) can never sound. "A big swarm is audibly big" — the master prompt's
  own words — was not true in any real session.
- `sky.timeOfDay` does not exist on `createSky`, so the day/night crossfade always got the 0.5 fallback, and
  `sky.update(dt, camera.position, elapsed)` put a Vector3 in the `timeOfDay` slot so sky time never advanced either.
- `setHornets` has no call site outside its own definition; `season` was only assigned inside `if (net)`.

Fixed by me this round: time of day is now derived from the world clock (`SKY.dayLengthMs`, 45 real minutes per
in-game day) and passed to both `sky.update` and `audio.update`, so the light moves and the ambience crossfades;
season is now computed offline too via `seasonAt(worldNow(), soloEpoch)`. Verified in-engine: season reads `spring`
with no session, the sun responds across the cycle (elevation 41.5 at night vs 98.1 at noon, intensity 1.75 vs 2.35)
and advances frame to frame, zero console errors on a fresh tab.

Not fixed, and honestly out of scope rather than broken: `swarmSize` and `setHornets` have no producer because the
swarm (M3) and hornets (M6) do not exist yet. The Critic could not know that. They must be connected the day those
systems land — recorded here so it is not forgotten.

Also open: weather reads `Date.now()` rather than the net layer's server-corrected clock (measured 28 % kind
disagreement at 3 minutes of client clock offset), and audio's fallback thunder scheduler stays live during `rain`
phases because `setDriven()` is only reached when a preset has non-zero lightning — so clients hear thunder that
nobody else hears and that no flash accompanies.

## Weather clock closed (orchestrator)

The Critic's third secondary gap is fixed: `createWeather` now takes an optional `now` function, defaulting to
`Date.now` so the module still stands alone, and `main.js` passes `worldNow` — the session's server-corrected clock
when a hive exists, this machine's otherwise. All six `Date.now()` reads inside `weather.js` route through it, so the
measured 28 % kind disagreement at 3 minutes of client clock offset can no longer happen between players.

Ordering trap worth recording: `createWeather` samples the clock **while constructing** (`schedule.startedAt = now()`),
and `worldNow` closes over `net`. With `let net` declared after the weather creation that is a temporal dead zone
throw at boot, not a silent fallback. `net` and `worldNow` are now declared before the systems that read the clock,
with a comment saying why.

Verified in-engine after the change: boots clean, weather constructed, season reads `spring` offline, sun elevation
moves between frames (96.2 -> 77.4) and the meadow renders. `net-logic` 27/0.

## Audio revision — and a fourth measurement lesson

Both Critic findings closed:

- **Thunder divergence:** `driven` now latches on the first `setWeather()` rather than waiting for a lightning event —
  the trap being that the `rain` preset carries `lightning: 0.0`, so the event never arrived and every client kept
  rolling its own thunder. The fallback scheduler stays for the genuinely undriven case (standalone harness, a scene
  without weather, a regression where the wiring is lost), where a storm bed with no thunder would be its own seam.
  Verified by me: `driven` false before any state, true once a rain phase begins, **0 client-local strikes over 300 s
  of rain and 300 s of storm**, `thunder()` still fires exactly one, and the undriven fallback still fires 26 over 300 s.
- **Per-frame allocation:** the four `Object.keys()` calls are hoisted (plus two more the builder found).

**The lesson is in how the second one was measured.** The Critic reported 10.18 B/frame from a `heapUsed`-delta
harness. The builder could not reproduce it and ran controls: a stub that provably cannot allocate measured
**3.375 B/frame**, and an *idle* loop calling `update()` zero times measured **3.211 B/frame**. The method's noise
floor scales with live-heap size and cannot resolve at this magnitude — most of the 10.18 was floor. Re-measured with
V8's sampling heap profiler after a 20 000-call warm-up: **0.009 B/frame** by the builder, 0.268 B/frame in my own
run, both far inside the >=1 B/frame bar.

So: a Critic's number is evidence about its instrument as much as about the artefact, and the right response to a
number you cannot reproduce is a control run, not an argument. Fourth time this session that the measurement, not the
code, was the thing that needed fixing — after the stale fps counter, the settled-state authority sample, and the
throttled-tab timeouts.

# ============================================================
# Gauntlet run 2 — five defects from real play
# ============================================================

- Run ID: 2026-08-08-playtest-fixes
- Status: ACTIVE
- Mode: FULL MULTI-AGENT
- Objective: Every one of the five defects Jurek hit in play is fixed and demonstrated in the running game.
- Artifact: `src/cinematic/*`, `src/ui/menu.js`, `src/nest/build-mode.js`, `src/nest/comb.js`, `src/config.comb.js`
- Reference mode: PROXY (the master prompt's own statements) + DIRECT for item 2 (the supplied music file)
- Pass rule: >= 85/100 weighted, every critical dimension >= 4/5, all gates PASS
- Budget: default (max 8 rounds)
- Approval boundaries: no deploy without Jurek's word; local edits only

## The five defects, as reported

1. Opening cinematic is broken by the 3D model — rebuild from scratch.
2. Opening cinematic has no music; `assets/audio/cutscene-music.mp3` exists and is unused there.
3. "Your Queen" colour/pattern does not actually apply, and Back does not work.
4. Build mode should be bound to Tab.
5. Cannot build: "must touch the comb" while no comb exists or is visible.

## Baseline evidence (orchestrator, measured before any change)

**Item 5 root cause found.** The touch rule itself is correct — on a fresh hive I placed a first cell
(ok), an adjacent cell (ok) and a distant one (`detached`), so the rule behaves as designed. The defect is
placement and discoverability:

- A placed cell renders (`comb_honey` instanceCount 1, visible) but lands at world (47.5, 22.6, -89.3)
  while the queen sits at (0, 16.5, -10.2) — roughly **80 units away**, on the far wall of a dark hall
  spanning x -48..48, z -25..-89.
- The first cell may be placed anywhere in a 320 x 44 x 4 lattice; every later cell must touch it; and
  nothing in the game points to where the comb is.
- So a player who places one cell out of sight is told "must touch the comb" everywhere else, with no way
  to find it. That is exactly the reported symptom.

**Design authority for the fix:** DESIGN-hollow.md, section 3, on the Landing: "This is the arrival room,
the deposit point, and where the first comb is seeded." The hive should therefore start with a seed cell
at the landing, visible on arrival — which removes the empty-comb trap entirely.

## Rubric v2 (this run)

| # | Dimension | Weight | Critical | Anchors |
|---|---|---:|---|---|
| 1 | Defect actually fixed | 35 | yes | Each of the five reported symptoms is gone, demonstrated by an in-engine measurement, not by reading the code |
| 2 | Fixed for the reported reason | 20 | yes | The fix addresses the cause the evidence identifies; no symptom masking, no disabling of the failing path |
| 3 | Cinematic craft | 20 | yes | Opening reads as an authored shot sequence: camera never clips geometry, never shows the inside of a mesh, subject stays framed, music starts with the shot and ducks out on skip |
| 4 | Player-facing clarity | 15 | no | The player can tell what to press and where to build without being told out of band |
| 5 | No regression | 10 | yes | Play mode, multiplayer sync, gather/deposit loop and frame rate all unchanged |

## Gates (binary)

- G1 Zero new console errors from menu -> cinematic -> play.
- G2 On a brand-new hive, the player can place a comb cell within 10 seconds of entering play, without prior knowledge.
- G3 Tab opens and closes build mode; Tab no longer moves browser focus.
- G4 "Your Queen" colour/pattern is visibly applied to the queen in play, and Back returns to the previous screen.
- G5 Cinematic plays `cutscene-music.mp3` and stops it cleanly on skip or end.
- G6 Frame rate in play mode within 10% of the pre-change baseline.

## Round 1 — topology

Three Builders on disjoint file sets; `src/main.js` reserved to the Orchestrator so no two agents edit the wiring.

- Builder A — cinematic rebuild + music: owns `src/cinematic/*`
- Builder B — Your Queen + Tab: owns `src/ui/menu.js`, `src/nest/build-mode.js`, `src/entities/queen.js`
- Builder C — comb seeding: owns `src/nest/comb.js`, `src/config.comb.js`

## Defect 6 (added mid-run by Jurek) — "sometimes the motion blur turns into a swirl"

**Cause, two parts, both in `src/render/post.js`:**

1. **No reprojection reset on a camera cut.** `prevViewProj` was seeded once at construction and
   then advanced every frame, with nothing resetting it when the camera moved discontinuously
   (cinematic cut, portal transit, respawn). On such a frame the reprojected velocity is enormous.
   `maxRadius` caps the radius but not the direction, so 8 taps along a huge rotational vector
   smear the whole frame. That is why it happened "sometimes" rather than constantly.
2. **Turning deliberately amplified it.** `turnGain: 0.55` raised blur strength with yaw rate — and
   a pure camera rotation is exactly the case where the reprojection field circulates, i.e. the
   vortex. The tuning maximised the artifact at the moment it was ugliest.

**Fix:** added `detectCut(dt)`, which flags a frame as a cut when the camera's translation exceeds
`cutSpeedRatio` x FLIGHT.maxSpeed or its rotation exceeds `cutTurnRate` rad/s. Both are *rates*, so a
slow frame reads identically to a fast one and legitimate full-speed flight cannot trip them
(the rule from the earlier false-failure lesson: never compare a time-derived value against a fixed
per-frame delta). On a cut the motion pass is skipped, the history is re-seeded and `motionDrive` is
zeroed so the blur does not ramp back in late. `turnGain` 0.55 -> 0.12 and `maxRadius` 0.026 -> 0.017
keep translation blur while cutting the rotational component. Added `post.resetMotionHistory()` for
deliberate cuts and `post.motionDebug()` so this is measurable. `camera.updateMatrixWorld()` moved
ahead of the uniform update, which it always should have preceded. `post` exposed on
`window.hollowtree` through a getter (it is reassigned to null if the stack throws).

**Verification (in-engine, play mode, synchronous `post.render` calls so a hidden-tab rAF stall
cannot distort the result):**

| Case | Cuts | Note |
|---|---|---|
| Yaw 6.0 rad/s (~344 deg/s) x 40 frames | 0 | max strength 0.124, speed blur retained |
| Translation 30 u/s x 40 frames | 0 | no false positive |
| 250-unit jump in one frame | 1 | uStrength on that frame = 0 |
| 180-degree snap in one frame | 1 | uStrength on that frame = 0 |
| Next steady frame | - | `cutThisFrame` false, blur resumes |

Console clean across menu -> cinematic -> play.

**Cross-finding that matters for defect 1:** during the opening cinematic `cutCount` reached 2, and 4
by the time play began. The opening therefore contains real camera discontinuities — those frames were
producing the full-screen smear Jurek reported. Defect 6 and defect 1 overlap; the rebuilt cinematic
should either avoid the cuts or call `post.resetMotionHistory()` at each deliberate one.

## Round 1 verification — what was already fixed vs what this round changed

Mtimes show `queen.js`, `build-mode.js`, `config.comb.js`, `comb.js`, `menu.js`, `opening.js`,
`director.js` and `intro.js` were all rewritten between 00:25 and 00:35 on 2026-08-08, i.e. the five
reported defects had already been implemented before this round started. Rather than rebuild them,
this round verified each one in the running game. Every claim below is a measurement, not a reading
of the source.

| # | Defect | Status | Evidence |
|---|---|---|---|
| 1 | Opening broken by the model | FIXED (pre-existing) | Authored shot sequence, ~28.5 s: comb foreground with rack focus, swarm-to-entrance, wide establishing, title card "a hive is built, not won", clean handoff to play. No geometry intersection in any captured frame. Skip works (space) and lands in a clean play state. |
| 2 | No music in the opening | FIXED (pre-existing) | `audio.music('cutscene')` wrapped and observed: called once, returned a live source on the first try. Buffer present in the library, 103.2 s, matching the file. Routed through the music bus, so master/music sliders apply. |
| 3 | Your Queen colour/pattern dead, Back dead | FIXED (pre-existing) | Pattern banded -> crowned repainted live (`queen_gold` #cfc9b1 -> #ffe89a, `queen_crownrim` #6a84ba -> #ffcf5e). Colour -> `style.color: "ember"`, persisted to `hollowtree.settings`, swatch marked `is-on`. Livery is worn by the queen in the cinematic and in play. Back moves the panel from `is-on` to off. |
| 4 | Build mode should be Tab | FIXED (pre-existing) + gap closed here | `BUILD_KEYS.toggle: 'Tab'`, `toggleAlt: 'KeyB'`, with a text-entry guard so the lobby code box still tabs. Verified: inside the hollow a Tab keydown opens build mode (`ht-build is-on`). |
| 5 | Cannot build, "must touch the comb", no comb | FIXED (pre-existing) | Fresh hive seeds 7 cells; `comb_seed` InstancedMesh count 7, visible; `seeded()` true; `nearestCell()` 22.5 u from arrival; placement on a seed neighbour returns ok; 5 cell types unlocked and affordable. |
| 6 | Motion blur swirl (raised this round) | FIXED this round | See the defect-6 section above. |

**Two real gaps found and closed in this round, both discoverability rather than logic:**

- **The build key was silent outside the hollow.** `canOpen` requires `portal.state.insideness > 0.5`,
  which is correct — build mode belongs inside — but `onKeyDown` bailed with no feedback, so pressing
  the build key on the meadow was indistinguishable from a broken binding. This is very likely part of
  what "still cannot build" meant. Added `opts.onRefused`, wired in `main.js` to a transient HUD line,
  "fly inside the hollow to build". Verified: the prompt is set on refusal and cleared 2.5 s later.
- **The build panel's key legend still read "B close"** after the toggle moved to Tab. Corrected.

**A correction to my own earlier reading, recorded because it nearly became a false defect report:** my
first colour test clicked `.ht-swatch` index 1 and concluded the colour picker was dead. There are 14
`.ht-swatch` nodes in the DOM — the first 8 belong to the lobby panel and the real ones are 8..13. The
picker was never broken; the selector was. Same failure family as the earlier time-derived-value
lesson: verify the probe before trusting what it reports.

**Portal latch, for future sessions.** `insideness` rises only through `state.latched`, set when the
queen is simultaneously `inAperture` and `beyondEntranceWall`. Measured directly on `nest.spec`, that
window is z in [-26, -28] on the entrance axis — three units. A player flying in crosses it over
several frames and latches normally. Teleporting a test queen past it never latches, which looks
exactly like "build mode can never open". It is a test artifact, not a bug. Drive entry on rAF, or
hold the queen inside the window for a few frames.

**Open, not fixed, found while verifying:** the seed comb renders *through the trunk* and is visible
from outside as a flat golden slab beside the entrance in the wide cinematic shots. The comb lattice is
built on flat wall planes while the trunk is round, so near the aperture the plane pokes out through the
bark. Cosmetic, but it is in the establishing shot of the opening. Not touched this round.

## Multiplayer and progression — verification (asked by Jurek)

**Headless suite:** `node work/net-node.test.mjs` -> **49 passed, 0 failed in 117.6 s, RESULT PASS**.
Covers presence, 10 Hz motion publish with interpolation (mean error 0.043 m, worst 0.351 m, buffer delay
136 ms), bandwidth (1.57 KB/s uplink per client projected on RTDB at 3 players), contended bank
(40/40 deposits committed, 14 transaction retries, no lost update), single-owner authority and handover,
frozen-owner revocation (0 dual-owner samples of 1772 over 90 s), ghost reaping, and offline progression
(20 h away credits exactly 8 h at 25 %, never credited twice). Note this runs on the **local in-memory
driver** — it proves the logic, not the network.

**Live two-client test over real Firebase** (`driver: "firebase"`, code MPTEST8899, two tabs with
distinct `ht.uid`):

| Check | Result |
|---|---|
| Both clients on one hive | yes — roster `["Jurek","Ryszard"]` on both |
| Exactly one authority | yes — A `isAuthority: true`, B `false`, `hostUid` agreed by both |
| Shared bank | A wrote pollen 37 / resin 11; B read the identical snapshot |
| Build debits correctly | honey store cost 2p+4r -> bank 37/11 -> 35/7 |
| Comb replicates | cell placed by A appeared on B at (42,13,1), `owner` = A's uid, `progress` 0.04, `doneCount` 7 + `buildingCount` 1 |

Roster convergence took ~25 s only because a backgrounded tab throttles its heartbeat; once the other
tab got frames it appeared immediately. Not a defect — an artifact of two tabs where only one can be
fronted at a time.

**Progression chain, end to end** (solo hive SOLOHONEY77, real Firebase, authority held):
place -> build completes in 6 s -> `doneCount` 7->8, honey capacity 0->25, `convertRate` 0->0.045/s ->
ripening runs: `stores.honey` 0 -> 0.225, nectar drained 0.202, bank nectar 30 -> 29.8. Honey lives in
`comb.stores.honey`, not in the resource bank — the HUD reads it from there.

**Three of my own measurements were wrong before they were right, all the same failure family — the probe,
not the game:**
- Looked for honey in `bank.snapshot().honey`; it lives in `comb.stores.honey`.
- Read "cell never finishes" while the pane was hidden; rAF was stalled, not the build. `buildSpeed()`
  is 1, so `buildTime` is the honest 6 s.
- Read "nobody owns the world" repeatedly; the lease renews from `net.update(dt)` in the game loop and is
  throttled on the **wall clock**, so a synchronous burst of `net.update` calls does not renew it and a
  hidden tab lets it lapse. Driving it on a real-time timer renewed it immediately.

**Real-world consequence worth keeping:** world simulation only runs on the lease holder. If every player
backgrounds the game, ripening and flower regrowth stop — by design, and the offline report credits 25 %
capped at 8 h on return.

## Round 2 — the comb slab, and a frame-rate number that is finally real

**The slab was never the hive's comb.** It is `PLACEHOLDER_comb_cells`, 135 instances, a free-standing
stage set the opening builds for its interior shots — parked out in the meadow, not in the hall. Nothing
switched it off, so from the cut to daylight onward it sat beside the trunk as a golden lattice in every
exterior shot, including the establishing shot and the title card.

Two wrong fixes preceded the right one, both recorded because each looked correct until it was rendered:

1. **Portal viewpoint.** `insideness` is derived from the queen, and the director parks her in the hall
   while flying the camera outside — so the hall itself was also being drawn from outside. Added
   `portal.setViewpoint(fn)`, set by the cinematic to its camera and released on finish, skip or dispose,
   plus `insideHall()` containment because `sample()` is a latch that only reads 1 for a body seen crossing
   the aperture — a camera that simply begins inside would never latch. This is a genuine fix and stays:
   measured 0 frames where the hall was drawn while the camera stood outside.
2. **Tying the set to `insideness`.** Wrong, and it removed the opening shot entirely: the set is in the
   meadow, so the test that culls the hall culls the set exactly when it is wanted. Reverted.
3. **A shot-name list.** Wrong about `launch`, whose camera is already outside; the slab survived.

The fix that holds is the one the file already documents: `FLASHES` fires a bloom at `T.burst.at` (15.4 s)
whose stated purpose is to mask "the frame where the interior shell is swapped for the world" — but nothing
performed the swap. The static set (`comb`, `cap`, `motes`; not `workers`, which is the swarm bursting out
and is the subject of those shots) is now hidden from that instant.

Verified: `anyOnAfter154: []` — the prop is never visible at or after the authored cut — and the wide
establishing shot that previously carried the slab renders clean.

**Frame rate, measured honestly at last.** Sampling per-frame deltas and discarding gaps >= 100 ms (those
are the harness hiding the pane, not the game): **median 16.3 ms / 61.3 fps, p95 18.5 ms / 54.1 fps** on the
`balanced` tier. Two independent bursts agreed. Small sample — 10 live frames each — so read it as
"vsync-locked, no obvious hitching", not as a benchmark.

# ============================================================
# Gauntlet run 3 — the hive must be legible without explanation
# ============================================================

- Run ID: 2026-08-08-hive-legibility
- Status: ACTIVE
- Mode: FULL MULTI-AGENT
- Objective: A player who has never been told anything can fly in, see where to build, understand what
  is needed and why, and place their first cell — and the opening sequence reads as authored, not broken.
- Reference mode: PROXY (master prompt + Jurek's own design direction, quoted below)
- Pass rule: >= 85/100 weighted, every critical dimension >= 4/5, all gates PASS
- Approval boundaries: local edits only; no deploy without Jurek's word

## Jurek's design direction (his words, treated as the spec)

"Boczne ściany w środku dalej mają jakiś border i dalej nie mogę budować. Podejrzewam że jest gdzieś jakiś
comb do którego muszę to podłączyć ale nigdzie go nie ma. Wszędzie mi pokazuje czerwono. Nie rozumiem
intuicyjnie tych napisów na ekranie (powinny może po prostu pokazywać jakie kwiaty/rośliny są potrzebne
albo powinny być po prostu łatwiejsze do zrozumienia). Może dodaj też tablicę z przepisami w ulu łatwą do
zrozumienia. Mój pomysł: na przeciwko wejścia do ulu (od środka) była ściana w której się buduje te combs
a pozostałe ściany były po prostu puste. Zróbmy tak że będzie jeden comb z napisem START od którego się
wszystko buduje."

## Already done this round (orchestrator, verified in-engine)

- **One build wall.** `hexgrid.isValid` now also requires the cell to lie on `buildWall`, computed as
  `(entranceWall + 2) % 4` — the wall you face flying in. Measured: of all lattice cells only wall 2
  accepts any (1152 cells); walls 0, 1 and 3 return nothing at all.
- **START comb, dead centre, at eye level.** `seedPlan` seeds from `grid.buildWallCenterS` at aperture
  height instead of hugging the aperture rim, which had put it *behind* the arriving queen — the whole
  "there is a comb somewhere but nowhere" complaint. Measured seed cells: 7, all at z -89.3, x -1.5..0.5,
  y 14.8..16.5. A `START` sprite label sits above it and hides itself once the player builds anything.
- **Route re-anchored.** `computeMouth` keyed off the aperture, which after the one-wall change matched
  no buildable cell, silently making every `routeDist` Infinity and permanently disabling the route-gated
  defensive cells. It now grows from the starting comb. Measured: all 7 seed cells at routeDist 0.
- **Legal-spot markers + readable status** (previous round): 19 markers drawn at the start comb; the aim
  status now reads "the entrance must stay clear" instead of the raw enum `blocked`.

## The gap that remains, measured

Aiming at the wall in front of the start comb now returns reason `cost` — the spot is legal and only the
stores are empty, which is correct. But **the start comb is invisible in play**: `comb_seed` reports count
7 and `visible: true`, yet renders as dark brown on dark brown. The hall's light is at the aperture, 64
units away. A marker the player cannot see is not a marker.

## Rubric v3

| # | Dimension | Weight | Critical | Anchors |
|---|---|---:|---|---|
| 1 | Findability | 25 | yes | From the moment of arrival the player can see where to build without being told; the start comb is legible at the distance it is first seen |
| 2 | Comprehensibility | 25 | yes | Every on-screen line names a concrete next action or a concrete resource; no raw enums, no jargon; a 14-year-old reads it once and knows what to do |
| 3 | Interior craft | 20 | yes | The build wall reads as the build wall; other walls are bare and clean; no seams, borders or z-fighting |
| 4 | Cinematic craft | 20 | yes | Reads as an authored shot sequence: no camera inside geometry, every shot has a framed subject, cuts intentional, clean handoff |
| 5 | No regression | 10 | yes | Build, gather, zones, multiplayer sync and frame rate unchanged |

## Gates

- G1 Zero console errors from menu through cinematic into play.
- G2 On a brand-new hive the start comb is visible from the aperture, measured, not asserted.
- G3 Every string shown in play names an action or a resource — no enum leaks.
- G4 A recipe reference is reachable in-hive and states cost, effect and unlock for every buildable cell.
- G5 Frame rate median within 10% of 61 fps on `balanced`.
- G6 `node work/net-node.test.mjs` still 49/49.

## Round 3 — fresh Critic verdict and what it caught

**Verdict: REJECT, 64/100.** All six gates passed; four of five critical dimensions scored 3/5,
against a bar of 4. Findability 3, Comprehensibility 3, Interior craft 3, Cinematic craft 3,
No regression 5.

**The finding that mattered, and that three of my own verification passes missed.** The zone
barrier is a cylinder centred on the hive at radius 46, but the hall runs back to z = -89.4,
i.e. 59.4 m from that centre. The starting comb sits at z = -84.49 — **8.49 m outside the first
ring**. The queen was hard-clamped at z = -76 and actively pushed away from the wall the game
tells her to build on (Critic measured -76 -> -74.26 with `depth 0.89`, `blocked` true
throughout). The "this ring is locked" line was therefore pinned to the screen the entire time
the player stood at their own comb, inside their own hive.

I missed this because every one of my build tests placed cells through `comb.place()` and moved
the queen by assignment. Not once did I fly her into that wall under physics. The lesson is the
same family as the earlier probe failures, one level up: **an API-level test of a spatial rule
proves the rule, not the reachability.** If a player has to physically get somewhere, the test
has to physically get there.

Fix: `zones.update(dt, flight, insideness)` stands the barrier down entirely while inside the
hollow — the rings gate the meadow and mean nothing indoors. Verified: queen parked at the comb
sits at z = -78.49 (48.5 m out, past the old clamp) with `blocked: false` and `depth: 0` across
22 samples.

**Also fixed this round, all from the Critic's list:**
- The panel printed `effects.capacity` under the label "room left in your stores" — it read
  `pollen 40` while the HUD read `18 /40`. The label was simply false. Added `comb.bankSnapshot()`
  and the panel now subtracts what is held.
- `post.setQuality` does not exist; `main.js` called it behind a `typeof` guard so the quality
  chips had never done anything. **My first fix for this broke the boot** — `setTier` takes an
  index into `POST.tiers`, not the settings name, so passing `'balanced'` clamped to NaN and took
  the whole game down. Mapped performance/balanced/high onto tiers 0/2/3.
- The `START` sprite had `depthTest: false`, so it drew through every wall and, 45 m behind the
  subject, straight over the hero queen in the opening. Now depth-tested and suppressed while
  `mode === 'cinematic'`, checked per frame rather than per recompute.

**Left open, with the Critic's evidence:** compressed cost notation in the build list (`6 2 2`);
the hall shell painting over the meadow at `insideness ~0.84` while the trailing camera is still
outside the bark; the seed comb subtending only 25 px from the aperture and the START label
disappearing after the first cell; interior art reading cold and flat next to the cinematic's
comb; `director.seek()` leaving `state.shot` empty for the first shot.
