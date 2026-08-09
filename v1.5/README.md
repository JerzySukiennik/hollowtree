# Hollowtree

Co-op 3D bee game for 1–3 players. Every player is a queen: you fly a meadow in third person,
gather pollen, return to a shared nest inside a hollow tree, buy workers that follow you as a
swarm, and build hexagonal comb cells that decide what the hive can do.

The world is persistent — it lives in the cloud between sessions. Seasons shift what blooms,
flowers deplete and regrow, and hornets are survived by building, not by fighting.

## Stack

- three.js `0.169.0`, ES modules from CDN, **no build step** — open `index.html` and it runs.
- No physics engine. Flight is custom kinematics; collisions are sphere-vs-AABB.
- Firebase Realtime Database for the shared world (no Node server to start).
- All 3D assets modeled from scratch in Blender, exported to `assets/models/*.glb`.
- Performance target: stable 40 fps on a 2019 Intel MacBook Pro.

## Controls

| Input | Action |
|---|---|
| `W A S D` | fly |
| Mouse | look / steer |
| `Space` / `Shift` | up / down |
| `E` (hold) | gather pollen |
| `B` | build mode |
| `F3` | dev HUD |

## Layout

See `ARCHITECTURE.md` for the module contract.
