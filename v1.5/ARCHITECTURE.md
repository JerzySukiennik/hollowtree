# Hollowtree — architecture contract

Read this before touching any file. It defines module boundaries so parallel agents never
edit the same file. Code, comments and commits in English. No build step: ES modules + importmap.

## Hard rules

- three.js `0.169.0` via importmap (`three`, `three/addons/`). No bundler, no npm install.
- **No physics engine.** Flight is custom kinematics; collisions are sphere-vs-AABB.
- All bees render through `InstancedMesh` (one instance per bee type). Never one `Mesh` per bee.
- Target: stable 40 fps on a 2019 Intel MacBook Pro (Radeon Pro 5500M). Budget every feature against it.
- Models are authored in Blender (MCP) and exported to `assets/models/*.glb`. Never generate geometry at runtime for characters/props.
- No comments in shipped code beyond a one-line file header.

## Module map (one owner per file)

| File | Responsibility |
|---|---|
| `index.html` | importmap, canvas, loading overlay. |
| `src/config.js` | ALL tuning constants. Single source of truth; other modules import, never hardcode. |
| `src/main.js` | Bootstrap: creates renderer/scene, wires modules, owns the frame loop. |
| `src/core/loop.js` | Fixed-step accumulator + rAF driver, exposes `onFixed`/`onRender`. |
| `src/core/input.js` | Keyboard/mouse/pointer-lock/gamepad → normalized `InputState`. |
| `src/core/assets.js` | GLTF/texture loading, cache, progress reporting. |
| `src/world/sky.js` | Sky dome, sun, fog, seasonal light colour. |
| `src/world/terrain.js` | Meadow ground mesh, height sampling `getHeight(x,z)`, static AABB colliders. |
| `src/world/grass.js` | Instanced grass + ground clutter, LOD + distance culling, wind. |
| `src/camera/rig.js` | TPP spring-follow camera, banking, FOV kick, collision push-out. |
| `src/entities/flight.js` | Queen flight kinematics: accel, drag, banking, hover bob. Pure state, no rendering. |
| `src/entities/queen.js` | Queen visual: glb, wing blur, animation state driven by `flight.js`. |
| `src/render/post.js` | Post stack: bloom, DOF, tone mapping. Must degrade gracefully. |

Later milestones add `src/entities/{flowers,swarm,hornets}.js`, `src/nest/*`, `src/net/*`,
`src/ui/*`, `src/audio/*`. Do not create them before their milestone.

## Interfaces (stable — do not change signatures without telling the orchestrator)

```js
// core/input.js
export const input = { forward, strafe, lift, yaw, pitch, boost, gather, build, pointerLocked }
export function initInput(domElement)

// world/terrain.js
export function createTerrain(scene) -> { mesh, getHeight(x, z), colliders: AABB[] }

// entities/flight.js
export function createFlight(terrain) -> {
  position: Vector3, velocity: Vector3, quaternion: Quaternion,
  bank: number, speed: number,
  update(dt, input, cameraYaw)
}

// camera/rig.js
export function createCameraRig(camera, target) -> { update(dt, input, flightState) }

// entities/queen.js
export function createQueen(scene, assets) -> { object3D, update(dt, flightState) }
```

## Quality bar (Gauntlet Loop)

Every component is judged by an independent Critic against: *"looks and sounds like a
commercially released stylized low-poly studio game, not a game jam prototype."*
Not "it runs without errors". See the master prompt for per-layer criteria.

## Blender MCP is a single shared connection

Only ONE agent may drive Blender at a time. Modeling tasks are serialized by the orchestrator.
Always render the finished asset and show it before anything is built on top of it.
