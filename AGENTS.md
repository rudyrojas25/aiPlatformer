# AGENTS.md — AI Platformer (Phaser 3)

## Project Status

Fully implemented per `DESIGN.md`. Three source files loaded as global `<script>` tags in `index.html` (no bundler, no npm). Open `index.html` via Live Server in VS Code to run.

## Running the Game

No build step — open `index.html` in a browser via a local server (e.g., `python3 -m http.server`). Phaser 3.70.0 is bundled locally at `lib/phaser.js`. All scripts are loaded via `<script>` tags in `index.html` (no bundler, no npm).

## Architecture

- **No module system.** All scripts are global-scope `<script>` includes. Order in `index.html` matters: `phaser.js` → `Load.js` → `Platformer.js` → `main.js`.
- **Two Phaser scenes:** `Load` (key `"loadScene"`) → `Platformer` (key `"platformerScene"`). Load handles preload + animation creation, then immediately transitions.
- **Global object `my`:** Used as a namespace for cross-scene state (e.g., `my.vfx` for particle emitters, `my.sprite` for player). Define it in `main.js` before scene instantiation.
- **Phaser config:** `{ parent: 'phaser-game', type: Phaser.CANVAS, render: { pixelArt: true }, width: 1440, height: 900 }`.

## Critical Gotchas from DESIGN.md

### Delta Normalization Bug
The design doc calls out a **double-normalization bug**: multiplying acceleration/jump values by `delta / 17` on top of Phaser's built-in timestep. **Do not** multiply by `delta / 17` — pass raw values to `setAccelerationX()` and `setVelocityY()`. Physics values in DESIGN.md are the *intended* values; tuning will be needed if matching the (buggy) original behavior is required.

### Global Gravity Modification for Hover
Hover halves `this.physics.world.gravity.y` (1500 → 750), affecting **all** physics bodies globally. Consider per-body gravity instead.

### Ground Detection: `blocked` vs `touching`
Use `body.blocked.down` for tilemap collision detection — `body.touching.down` only works for sprite-sprite contacts, not tilemap tiles.

### Tilemap Collision
Uses `setCollisionByProperty({ collides: true })` — tiles must have a `collides: boolean` custom property set in the Tiled editor. Layer name must be exactly `"Ground-n-Platforms"`.

### Jetpack Position Sync
The jetpack sprite must track the player **without one-frame lag**. Use a `prerender` scene event (not `update()`) to sync position. Offsets: X ±5 from player (sign depends on `facingLeft`), Y -5 above player.

### Animation Frame Naming
Character atlas frames are named `"tile_XXXX.png"` (4-digit zero-padded). Use `generateFrameNames` with `prefix: "tile_"`, `start: 0`, `end: 1`, `suffix: ".png"`, `zeroPad: 4`.

## Physics Constants

| State | Accel (px/s²) | Drag | Jump Vel | Speed Cap |
|-------|---------------|------|----------|-----------|
| Normal | 900 | 500 | -380 | ±450 |
| Jetpack | 280 | 500 | -700 | ±300 (air) |

Base gravity: 1500 px/s². Hover gravity: 750 px/s².

## Asset Keys

| Key | Source File | Type |
|-----|-------------|------|
| `platformer_characters` | `tilemap-characters-packed.png` + `.json` | Atlas |
| `tilemap_tiles` | `tilemap_packed.png` | Image |
| `tilemap_sheet` | `tilemap_packed.png` | Spritesheet (18×18) |
| `platformer-level-1` | `platformer-level-1.tmj` | Tilemap (Tiled JSON) |
| `kenny-particles` | `kenny-particles.json` + 5 PNGs | Multi-atlas |
| `jetpack` | `spaceMissiles_012.png` | Image |
| `flame1` | `explosion00.png` | Image |
| `flame2` | `explosion01.png` | Image (unused) |

## Incomplete / Commented-Out Features

- Coin system (TODO, `createFromObjects`)
- Audio: `explosionCrunch_000.ogg` and `spaceEngineLow_000.ogg` present but loading code commented out
- Debug toggle (C key) commented out
- Water tiles have a `water` property but no interaction code
- Death animation mentioned but not implemented

## Tilemap Details

- Edit `platformer-level-1.tmx` in Tiled, then re-export to `.tmj` (JSON format)
- Grid: 48×25 tiles, 18×18px each, total 864×450px
- Tileset: 20 columns × 9 rows = 180 tiles, named `kenny_tilemap_packed`
- Camera zoom: 2.0×, lerp 0.25, dead zone 50×50

## Rendering Depth Order

| Depth | Object |
|-------|--------|
| -1 | Walking dust particles |
| 0 | Tilemap ground layer |
| 1 | Jetpack sprite |
| 2 | Player sprite |

## Player State Machine

Informal (no transition table) — states set directly in `update()`: Idle, Running, Jumping, Falling, Hovering. Facing direction (`facingLeft`) only updates on ground; preserved in air.

## VFX System

Five particle emitters stored on `my.vfx`: `walking`, `flame`, `flameWash`, `hover`. All created in `create()`, stopped immediately, then started/stopped conditionally in `update()`. Jump dust burst reuses `walking` emitter via `explode(3)`. Ground scanning for flame wash uses `groundLayer.getTileAtWorldXY()` in 10px increments downward.
