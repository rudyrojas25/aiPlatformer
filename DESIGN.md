# Game Design Document: Platform Improvement

## Game Overview

A 2D side-scrolling platformer with a central jetpack pickup/drop mechanic. The player navigates a single tile-based level, picking up a jetpack item to gain enhanced jump height and a hover ability, then dropping it when ground precision is needed. The game is built with Phaser 3.70.0 using Arcade Physics, rendered at 1440×900 in CANVAS mode with pixel-art scaling.

---

## Core Gameplay Loop

1. Player spawns on the left side of the level near a jetpack item on the ground.
2. Player moves right through platforming challenges (gaps, elevated platforms, water hazards).
3. Player can pick up the jetpack by standing near it and pressing S, granting a higher jump and hover ability.
4. While wearing the jetpack, horizontal movement is slower but vertical mobility is greatly increased — the player can hold W while falling to hover (slow descent).
5. Player can drop the jetpack by pressing S again while on the ground, restoring faster ground movement but losing hover.
6. Pressing R restarts the level at any time.

There is no win condition, score system, or enemy AI implemented in the current version. The game is a movement sandbox demonstrating the jetpack mechanic.

---

## Controls

| Action | Key |
|--------|-----|
| Move left | Left Arrow / A |
| Move right | Right Arrow / D |
| Jump | Up Arrow / W |
| Pick up / drop jetpack | S (must be on ground and overlapping jetpack) |
| Restart level | R |

The game uses both arrow keys and WASD simultaneously — they are not separate control schemes. Either set works at all times.

---

## Player Avatar

### Visual Representation

- **Sprite atlas:** `platformer_characters` (loaded from `tilemap-characters-packed.png` + `tilemap-characters-packed.json`)
- **Default frame:** `tile_0000.png` (a small humanoid character, ~24×24 source size, trimmed to ~22×24 in the atlas)
- **Flip behavior:** The player sprite is flipped horizontally using Phaser's `setFlip(true, false)` / `resetFlip()` to indicate facing direction, rather than using separate left/right frames.

### Animations

All animations are created in the Load scene and referenced by key string:

| Key | Frames | Frame Rate | Repeat | Description |
|-----|--------|------------|--------|-------------|
| `walk` | `tile_0000.png` → `tile_0001.png` | 15 fps | -1 (loop) | Two-frame walk cycle. `animationTimeScale` is set to 1.0 while moving, 0.5 while decelerating (slows the walk animation as the player drifts to a stop). |
| `idle` | `tile_0000.png` (single frame) | n/a | -1 (loop) | Static standing pose. |
| `jump` | `tile_0001.png` (single frame) | n/a | no repeat | Arms-up pose shown while airborne. |

The walk animation uses `generateFrameNames` with prefix `"tile_"`, start 0, end 1, suffix `".png"`, and `zeroPad: 4`.

---

## Jetpack Item

### Visual Representation

- **Standalone image:** `spaceMissiles_012.png` (a small rocket/missile sprite, loaded as key `'jetpack'`)
- **Scale:** 1.25× the image's native size
- **Render depth:** 1 (above the tilemap layer at default depth, below the player at depth 2)

### Behavior

- Spawns at world position (50, 350), near the player's start position.
- When the player has the jetpack equipped, the jetpack sprite tracks the player's position each frame via a `prerender` event callback (see "Jetpack Sync" below).
- When the player drops the jetpack, it stays at the player's current position and the player can pick it up again by overlapping it and pressing S on the ground.
- Pickup/drop uses a custom AABB overlap check (`collides(a, b)`), not Arcade Physics overlap.

### Jetpack Sync (Prerender Pattern)

The jetpack sprite must follow the player without one-frame positional lag. This is achieved by updating the jetpack's position in a `prerender` scene event rather than in `update()`:

- **X offset:** +5 pixels to the right of the player when facing right, -5 pixels (5 to the left) when facing left. The facing direction is stored in `this.facingLeft`.
- **Y offset:** -5 pixels above the player's Y position.
- **Rotation:** The jetpack's `angle` property is set to `player.body.velocity.x * 0.1`, tilting slightly in the direction of movement (same as the player's tilt when the jetpack is equipped).

---

## Player State Machine

The player has five states, tracked via `this.playerState`:

| State | Entry Condition | Visual |
|-------|-----------------|--------|
| Idle | On ground, horizontal velocity = 0 | `idle` animation |
| Running | On ground, horizontal velocity ≠ 0 | `walk` animation |
| Jumping | Just pressed jump while on ground | `jump` animation, dust burst VFX |
| Falling | Vertical velocity > 0 (moving downward) | `jump` animation |
| Hovering | Has jetpack, falling, W key held | `jump` animation, hover VFX, flame VFX |

The current state is displayed as a debug label (12px white Arial text) that floats above the player's head, offset by (+15, -30) pixels from the player's position.

### State Transition Notes

- The state machine is informal — there is no transition table. States are set directly in the `update()` loop.
- Facing direction (`this.facingLeft`) is only updated while the player is on the ground, based on `flipX`. In the air, the last ground-facing direction is preserved.

---

## Physics

### World Configuration

| Parameter | Value |
|-----------|-------|
| Physics engine | Arcade Physics |
| Base gravity | 1500 px/s² (Y-axis, downward) |
| Gravity during hover | 750 px/s² (50% of base — achieved by multiplying world gravity by 0.5) |
| Game resolution | 1440 × 900 pixels |
| Pixel art mode | `render.pixelArt: true` (prevents blur when scaling) |

**Important:** The hover mechanic modifies `this.physics.world.gravity.y` globally (all bodies are affected). A reimplementation should consider using per-body gravity instead.

### Player Physics — Normal (No Jetpack)

| Parameter | Value | Unit |
|-----------|-------|------|
| Horizontal acceleration | 900 | px/s² |
| Horizontal drag | 500 | px/s² |
| Jump velocity | -380 | px/s (negative = upward) |
| Horizontal velocity cap | 450 | px/s |
| Walking particle frequency | 75 | ms between emissions |

### Player Physics — Jetpack Equipped

| Parameter | Value | Unit |
|-----------|-------|------|
| Horizontal acceleration | 280 | px/s² |
| Horizontal drag | 500 | px/s² |
| Jump velocity | -700 | px/s (negative = upward) |
| Horizontal velocity cap (air) | 300 | px/s |
| Walking particle frequency | 200 | ms between emissions |
| Player tilt angle | `velocity.x * 0.1` | degrees |

### Delta Normalization

**Critical implementation detail:** The current code multiplies acceleration and jump velocity by `delta / 17` (normalizing to 60fps). Phaser's Arcade Physics already applies the timestep internally, so this double-normalization means the physics values above produce different behavior than stated depending on framerate. A correct reimplementation should **not** multiply by `delta / 17` and instead pass the raw values directly to `setAccelerationX()` and `setVelocityY()`. The values listed above are the **intended** values; you will need to tune them if the original double-normalized behavior is the target.

### Collision

- The player collides with the tilemap ground layer (`"Ground-n-Platforms"`).
- Collision is enabled via `setCollisionByProperty({ collides: true })`, which reads the `collides` boolean property set on individual tiles in the Tiled editor.
- The player has `collideWorldBounds: true` — they cannot leave the world bounds.
- Ground detection for jumping uses `body.blocked.down` (not `body.touching.down`) — `blocked` is required for tilemap collisions, while `touching` only works for sprite-sprite contacts.

### Hover Mechanic

When the player has the jetpack and is falling (`velocity.y > 0`) while holding the W key:

1. World gravity is halved (1500 → 750), causing a slow descent.
2. The player state is set to Hovering.
3. When W is released or the player is no longer falling, gravity resets to 1500.

### Horizontal Velocity Clamping

- Without jetpack: horizontal velocity is clamped to [-450, 450] px/s each frame using `Phaser.Math.Clamp`.
- With jetpack (airborne): horizontal velocity is clamped to [-300, 300] px/s.

---

## Level Design

### Tilemap Specification

| Property | Value |
|----------|-------|
| File | `platformer-level-1.tmj` (Tiled JSON export) |
| Source | `platformer-level-1.tmx` (Tiled project file — edit this, then re-export to .tmj) |
| Grid | 48 tiles wide × 25 tiles tall |
| Tile size | 18 × 18 pixels |
| Total pixel dimensions | 864 × 450 pixels |
| Orientation | Orthogonal |
| Render order | Right-down |
| Tiled version | 1.10.2 |

### Tileset

| Property | Value |
|----------|-------|
| Name (in Tiled) | `kenny_tilemap_packed` |
| Image | `tilemap_packed.png` (360 × 162 pixels) |
| Tile count | 180 tiles |
| Columns | 20 |
| Tile size | 18 × 18 pixels |
| Margin / spacing | 0 / 0 |

### Tile Layer

- **Name:** `Ground-n-Platforms` (this string must match exactly in code)
- **Type:** Tile layer (no object layers in the current level)

### Tile Property Definitions

Tiles in the tileset have custom boolean properties set in the Tiled editor:

| Property | Tiles | Purpose |
|----------|-------|---------|
| `collides` | IDs: 0, 1, 2, 3, 20, 21, 22, 23, 34, 40, 41, 42, 43, 47, 48, 49, 50, 60, 61, 62, 63, 80, 81, 82, 83, 100, 101, 102, 103, 120, 121, 122, 123, 140, 141, 142, 143 | Solid collision tiles (ground, platforms, stone, brick, etc.) |
| `water` | IDs: 33, 53, 73 | Water tiles (non-collidable, visual only — no water physics implemented) |

### Level Layout (from top to bottom)

The level is a single scrolling level with platforms ascending from left to right:

- **Ground floor (rows 20-24):** A continuous ground structure spanning most of the width, with variations in surface material (grass tops on dirt, stone, brick). Gaps in the ground expose water tiles and pits.
- **Mid-level platforms (rows 7, 9, 10):** Small floating platforms made of grass-on-dirt tiles (IDs 49, 50, 51 — left edge, middle, right edge), placed at various heights for basic platforming.
- **Upper platforms (rows 15-16):** Wider platforms with stone/brick surfaces (IDs 22-24, 102-104, 122-124) providing higher routes.
- **Spawn area:** The player starts at world position (30, 345), near the left edge on the ground floor, next to the jetpack item at (50, 350).

The level scrolls horizontally via camera follow — the world is wider than the viewport.

---

## Art Assets

### Character Atlas

| File | `tilemap-characters-packed.png` |
|------|------|
| Size | 122 × 119 pixels |
| Atlas JSON | `tilemap-characters-packed.json` (TexturePacker format) |
| Atlas key | `"platformer_characters"` |
| Frame naming | `"tile_XXXX.png"` (4-digit zero-padded) |
| Source tile size | 24 × 24 pixels (pre-trim) |
| Trimmed | Yes — most frames are trimmed to remove transparent margins |
| Used frames | `tile_0000.png` (idle/walk frame 1), `tile_0001.png` (walk frame 2 / jump) |
| Source | Kenny Assets "Shape Characters" set |

The atlas contains many other character frames (`tile_0002` through `tile_0026`) representing different characters at various sizes. Only frames 0000 and 0001 are used by the current player.

### Tileset Image

| File | `tilemap_packed.png` |
|------|------|
| Size | 360 × 162 pixels |
| Grid | 20 columns × 9 rows = 180 tiles at 18×18px |
| Source | Kenny Assets "1-Bit Platformer Pack" |
| Loaded as | Image key `"tilemap_tiles"` AND spritesheet `"tilemap_sheet"` (frameWidth: 18, frameHeight: 18) |

### Particle Multi-Atlas

| File | `kenny-particles.json` + `kenny-particles-0.png` through `kenny-particles-4.png` |
|------|------|
| Atlas key | `"kenny-particles"` |
| Type | Multi-atlas (TexturePacker, spread across 5 PNG files) |
| Source | Kenny Assets "Particle Pack" |
| Used frames | `smoke_03.png`, `smoke_04.png`, `smoke_05.png`, `smoke_09.png` |

### Additional Images

| File | Atlas Key | Usage | Size |
|------|-----------|-------|------|
| `spaceMissiles_012.png` | `'jetpack'` | Jetpack item sprite | ~431 bytes (very small) |
| `explosion00.png` | `'flame1'` | Jetpack flame VFX (direct flame + hover glow) | ~112 KB |
| `explosion01.png` | `'flame2'` | Loaded but not used in current VFX | ~119 KB |

### Audio Files

| File | Size | Status |
|------|------|--------|
| `explosionCrunch_000.ogg` | ~28 KB | Intended for jetpack jump sound — **not wired up** (loading code commented out) |
| `spaceEngineLow_000.ogg` | ~100 KB | Intended for hover/engine sound — **not wired up** (loading code commented out) |
| `spaceEngineLow_004.ogg` | ~100 KB | Present in assets — **not loaded or used** |

---

## Visual Effects System

The game uses five particle emitters, all created in the Platformer scene's `create()` method and stored on the global `my.vfx` object. All emitters are stopped immediately after creation and started/stopped conditionally in `update()`.

### 1. Walking Dust (`my.vfx.walking`)

Emits smoke particles behind the player's feet while moving on the ground.

| Property | Value |
|----------|-------|
| Texture | `"kenny-particles"` multi-atlas |
| Frames | `smoke_03.png`, `smoke_09.png` |
| Scale | Start: 0.03, End: 0.1 |
| Lifespan | 250 ms |
| Gravity Y | -50 (particles drift upward slightly) |
| Frequency | 75 ms (normal) / 200 ms (jetpack equipped) |
| Alpha | Start: 1.0, End: 0.1 |
| Follow offset | X: `displayWidth/2 - 10`, Y: `displayHeight/2 - 5` (near the player's feet) |
| Render depth | -1 (below the tilemap) |

**Trigger:** Starts when the player moves horizontally while on the ground. Stops when the player stops moving or leaves the ground. On jump, emits a one-shot burst of 3 particles (`explode(3)`) for a dust puff effect.

### 2. Jetpack Flame (`my.vfx.flame`)

Direct downward flame from the jetpack when jumping with the jetpack equipped.

| Property | Value |
|----------|-------|
| Texture | `'flame1'` (standalone image) |
| Scale | Start: 0.03, End: 0.1 |
| Lifespan | 250 ms |
| Gravity Y | 50 (flame falls downward) |
| Frequency | 55 ms |
| Alpha | Start: 1.0, End: 0.1 |
| Speed Y | 120 px/s (downward) |
| Follow target | Jetpack sprite, offset X: `displayWidth/2 - 10`, Y: `displayHeight/2 - 5` |

**Trigger:** Starts when the player jumps while wearing the jetpack. Stops when the player's vertical velocity is greater than -40 px/s (i.e., no longer moving upward fast enough) and the player is not in the Hovering state.

### 3. Flame Wash (`my.vfx.flameWash`)

Lateral spread of particles on the ground surface below the hovering player, simulating exhaust hitting the ground.

| Property | Value |
|----------|-------|
| Texture | `"kenny-particles"` multi-atlas |
| Frames | `smoke_04.png`, `smoke_05.png` |
| Scale | Start: 0.03, End: 0.1 |
| Lifespan | 250 ms |
| Speed X | Random between -200 and 200 px/s |
| Speed Y | Random between -20 and -5 px/s |
| Gravity Y | -250 (particles rise from the ground) |
| Frequency | 55 ms |
| Alpha | Start: 1.0, End: 0.1 |
| Follow target | Dynamically positioned at the ground surface below the jetpack (see ground-scanning below) |

**Trigger:** Only active when the player has the jetpack, is falling, and W is held. The emitter's Y position is dynamically set to the top of the nearest ground tile below the player (see "Ground Scanning" below). Only starts when the player is within 110 pixels of the ground; stops when farther away.

**Ground scanning:** Each frame while hovering, the game scans downward from the player's Y position in 10-pixel increments (up to Y=900), checking each position for a collidable tile via `groundLayer.getTileAtWorldXY()`. When found, the tile's top edge (`tile.getTop()`) becomes the Y position for the flame wash emitter's follow offset.

### 4. Hover Glow (`my.vfx.hover`)

Upward-pointing flame glow beneath the player while hovering at altitude.

| Property | Value |
|----------|-------|
| Texture | `'flame1'` (standalone image) |
| Scale | Start: 0.04, End: 0.08 |
| Lifespan | 70 ms |
| Gravity Y | 500 (flame drops away quickly) |
| Frequency | 110 ms |
| Alpha | Start: 1.0, End: 0.1 |
| Angle | Random between 80° and 100° (nearly vertical) |
| Speed Y | 900 px/s (downward) |
| Follow target | Jetpack sprite, offset X: `displayWidth/2 - 10`, Y: `displayHeight/2 - 5` |

**Trigger:** Same conditions as flame wash (jetpack + falling + W held), but only starts when the player is more than 55 pixels above the ground. This creates a visual distinction: close to the ground → flame wash only; high altitude → hover glow (and flame wash if within 110px).

### 5. Jump Dust Burst

This is not a separate emitter — it reuses `my.vfx.walking` with the `explode(3)` method, which emits 3 particles immediately as a one-shot burst regardless of the emitter's running state. This creates a small dust puff at the player's feet on jump.

---

## Camera System

| Parameter | Value |
|-----------|-------|
| Bounds | (0, 0) to (map.widthInPixels, map.heightInPixels) |
| Follow target | Player sprite |
| Round pixels | true (second argument of `startFollow`) |
| Lerp | X: 0.25, Y: 0.25 (smooth camera follow with slight lag) |
| Dead zone | 50 × 50 pixels (player can move within this area without camera scrolling) |
| Zoom | 2.0× (matches `SCALE` constant — renders the 864×450 map at an effective viewport of 432×225, scaled up to fill more of the 1440×900 screen) |

---

## Rendering Order

| Depth | Object |
|-------|--------|
| -1 | Walking dust particles |
| 0 (default) | Tilemap ground layer |
| 1 | Jetpack sprite |
| 2 | Player sprite |

---

## Game Configuration (Phaser)

```js
{
    parent: 'phaser-game',
    type: Phaser.CANVAS,
    render: { pixelArt: true },
    physics: {
        default: 'arcade',
        arcade: {
            debug: true,  // set to false at runtime in Platformer.create()
            gravity: { x: 0, y: 0 }  // overridden in Platformer.init() to y: 1500
        }
    },
    width: 1440,
    height: 900,
    scene: [Load, Platformer]
}
```

The `arcade.debug` flag is set to `true` in config but immediately disabled and cleared in `Platformer.create()` by setting `this.physics.world.drawDebug = false` and clearing the debug graphic. A debug toggle (C key) is present but commented out.

---

## Scene Flow

### Load Scene (key: `"loadScene"`)

**preload():**
- Sets asset path to `"./assets/"`.
- Loads character atlas: `this.load.atlas("platformer_characters", "tilemap-characters-packed.png", "tilemap-characters-packed.json")`
- Loads tilemap image: `this.load.image("tilemap_tiles", "tilemap_packed.png")`
- Loads tilemap JSON: `this.load.tilemapTiledJSON("platformer-level-1", "platformer-level-1.tmj")`
- Loads tilemap as spritesheet: `this.load.spritesheet("tilemap_sheet", "tilemap_packed.png", { frameWidth: 18, frameHeight: 18 })`
- Loads particle multi-atlas: `this.load.multiatlas("kenny-particles", "kenny-particles.json")`
- Loads jetpack image: `this.load.image('jetpack', 'spaceMissiles_012.png')`
- Loads flame images: `this.load.image('flame1', 'explosion00.png')`, `this.load.image('flame2', 'explosion01.png')`

**create():**
- Creates the three player animations (walk, idle, jump).
- Immediately transitions to the platformer scene: `this.scene.start("platformerScene")`.

### Platformer Scene (key: `"platformerScene"`)

**init():** Sets all physics constants and gravity.

**create():** Sets up tilemap, player sprite, jetpack sprite, collision, input, particle emitters, camera, debug label, and prerender event.

**update(time, delta):** Handles all game logic — input processing, state machine updates, physics parameter swapping, VFX control, jetpack pickup.

**preRender():** Syncs jetpack sprite position to player (called each frame before rendering).

---

## Incomplete / Planned Features

These features are stubbed or commented out in the codebase:

- **Coin system:** `createFromObjects` and arcade physics conversion for coins are marked with TODO comments but not implemented. The tilemap has a `nextobjectid` of 47, suggesting objects were previously defined in Tiled but the object layer was removed.
- **Audio:** Sound effects for jetpack jump (`explosionCrunch_000.ogg`) and hover engine (`spaceEngineLow_000.ogg`) are present in assets but loading/playing code is commented out.
- **Debug toggle:** A C key listener to toggle Arcade Physics debug drawing is commented out.
- **Jetpack toggle debug:** An S key listener to toggle `hasJetpack` regardless of proximity is commented out.
- **Death animation:** Comments reference a Minecraft-style death animation (sprite launched in opposite direction with rotation) but it is not implemented.
- **Water interaction:** Water tiles have a `water` property in the tileset but no water physics or interaction code exists.
