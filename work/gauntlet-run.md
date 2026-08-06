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
