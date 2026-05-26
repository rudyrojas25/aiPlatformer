// Platformer.js — Main game scene with all gameplay logic.
//
// Architecture overview:
// - init() sets physics constants and initial state
// - create() delegates to helper methods for each system (tilemap, player, jetpack, VFX, camera, input)
// - update() is kept short by delegating to focused helper methods
// - preRender() syncs the jetpack sprite to the player position each frame
//
// Player states (informal state machine):
//   Idle, Running, Jumping, Falling, Hovering
// States are set directly in update() rather than through a formal transition table.

class Platformer extends Phaser.Scene {
    constructor() {
        super({ key: "platformerScene" });
    }

    // ──────────────────────────────────────────────
    // INITIALIZATION
    // ──────────────────────────────────────────────

    init() {
        // Physics constants — normal (no jetpack) values
        this.ACCELERATION = 900;
        this.DRAG = 500;
        this.JUMP_VELOCITY = -380;
        this.MAX_SPEED = 450;
        this.WALK_PARTICLE_FREQ = 75;

        // Physics constants — jetpack equipped values
        this.JETPACK_ACCELERATION = 280;
        this.JETPACK_JUMP_VELOCITY = -700;
        this.JETPACK_MAX_SPEED = 300;
        this.JETPACK_PARTICLE_FREQ = 200;

        // World gravity
        this.BASE_GRAVITY = 1500;
        this.HOVER_GRAVITY = 750;
        this.physics.world.gravity.y = this.BASE_GRAVITY;

        // Player state tracking
        this.playerState = "Idle";
        this.hasJetpack = false;
        this.facingLeft = false;
    }

    // ──────────────────────────────────────────────
    // CREATE — delegates to setup helpers
    // ──────────────────────────────────────────────

    create() {
        // Disable the Arcade Physics debug display that was enabled in config.
        // Set drawDebug to false and clear the debug graphic.
        this.physics.world.drawDebug = false;
        this.physics.world.debugGraphic.clear();

        this.setupTilemap();
        this.setupPlayer();
        this.setupJetpack();
        this.setupCollisions();
        this.setupInput();
        this.setupVFX();
        this.setupCamera();
        this.setupDebugLabel();

        // Prerender event — fires each frame AFTER update() but BEFORE rendering.
        // Used to sync the jetpack sprite position so it doesn't lag one frame behind
        // the player. If we updated jetpack position in update(), there would be a
        // visible 1-frame offset because rendering happens after update().
        this.events.on("prerender", this.syncJetpackToPlayer, this);

        // Sound references
        this.jetpackJumpSfx = this.sound.add("jetpackJump");
        this.jetpackHoverSfx = this.sound.add("jetpackHover");
        this.hoverSoundPlaying = false;
    }

    // ──────────────────────────────────────────────
    // TILEMAP SETUP
    // ──────────────────────────────────────────────

    setupTilemap() {
        // Load the Tiled JSON tilemap — this reads the layer data and tile indices.
        this.map = this.add.tilemap("platformer-level-1");

        // Attach the tileset image to the tilemap.
        // The name "kenny_tilemap_packed" must match the tileset name in Tiled.
        const tileset = this.map.addTilesetImage(
            "kenny_tilemap_packed",
            "tilemap_tiles",
            18, 18, 0, 0
        );

        // Create the ground layer from the tilemap data.
        // The layer name "Ground-n-Platforms" must match Tiled exactly.
        this.groundLayer = this.map.createLayer("Ground-n-Platforms", tileset, 0, 0);

        // Enable collision on tiles that have the "collides: true" custom property
        // set in the Tiled editor. This reads the tile properties from the .tmj file.
        this.groundLayer.setCollisionByProperty({ collides: true });
    }

    // ──────────────────────────────────────────────
    // PLAYER SETUP
    // ──────────────────────────────────────────────

    setupPlayer() {
        // Spawn the player at the starting position near the left edge of the level.
        const SPAWN_X = 30;
        const SPAWN_Y = 345;

        // Create a physics sprite using frame "tile_0000.png" from the character atlas.
        this.player = this.physics.add.sprite(
            SPAWN_X, SPAWN_Y, "platformer_characters", "tile_0000.png"
        );

        // Prevent the player from leaving the world bounds (they hit invisible walls).
        this.player.setCollideWorldBounds(true);

        // Place the player above the tilemap (depth 2) so they render on top of
        // the ground layer (depth 0) and jetpack (depth 1).
        this.player.setDepth(2);

        // Start playing the idle animation.
        this.player.anims.play("idle");

        // Store on the global my object for cross-scene access if needed.
        my.sprite.player = this.player;
    }

    // ──────────────────────────────────────────────
    // JETPACK SETUP
    // ──────────────────────────────────────────────

    setupJetpack() {
        // Spawn the jetpack item near the player's starting position.
        const JETPACK_X = 50;
        const JETPACK_Y = 350;

        // Create a non-physics sprite — the jetpack doesn't collide with anything.
        // It just sits in the world until the player picks it up.
        this.jetpack = this.add.sprite(JETPACK_X, JETPACK_Y, "jetpack");

        // Scale up to 1.25× as specified in the design doc.
        this.jetpack.setScale(1.25);

        // Render between the ground layer and the player.
        this.jetpack.setDepth(1);
    }

    // ──────────────────────────────────────────────
    // COLLISION SETUP
    // ──────────────────────────────────────────────

    setupCollisions() {
        // Make the player collide with the ground layer tiles.
        // This uses Arcade Physics collision — the player will be pushed out of
        // collidable tiles and body.blocked.down will be true when standing on them.
        this.physics.add.collider(this.player, this.groundLayer);
    }

    // ──────────────────────────────────────────────
    // INPUT SETUP
    // ──────────────────────────────────────────────

    setupInput() {
        // Grab references to the four directional keys we need.
        // Arrow keys and WASD are both active at all times — they are NOT separate
        // control schemes; either set works simultaneously.
        this.cursors = this.input.keyboard.createCursorKeys();

        // WASD keys — created individually so we can check them alongside arrows.
        this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
        this.aKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.sKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
        this.dKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);

        // R key — restarts the level at any time.
        this.rKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

        // S key listener for jetpack pickup/drop.
        // Uses once=false so we can handle it in update() each frame.
        // We track whether S was just pressed (not held) using a flag.
        this.sJustPressed = false;
        this.sKey.on("down", () => {
            this.sJustPressed = true;
        });
    }

    // ──────────────────────────────────────────────
    // VFX SETUP — creates all particle emitters
    // ──────────────────────────────────────────────

    setupVFX() {
        this.createWalkingDust();
        this.createJetpackFlame();
        this.createFlameWash();
        this.createHoverGlow();
    }

    // Walking dust — smoke puffs behind the player's feet while running on ground.
    createWalkingDust() {
        my.vfx.walking = this.add.particles(0, 0, "kenny-particles", {
            frame: ["smoke_03.png", "smoke_09.png"],
            scale: { start: 0.03, end: 0.1 },
            lifespan: 250,
            gravityY: -50,
            frequency: this.WALK_PARTICLE_FREQ,
            alpha: { start: 1.0, end: 0.1 },
            follow: this.player,
            followOffset: {
                x: this.player.displayWidth / 2 - 10,
                y: this.player.displayHeight / 2 - 5
            },
            emitting: false,
            depth: -1   // Below the tilemap layer
        });
    }

    // Jetpack flame — direct downward flame when jumping with jetpack.
    createJetpackFlame() {
        my.vfx.flame = this.add.particles(0, 0, "flame1", {
            scale: { start: 0.03, end: 0.1 },
            lifespan: 250,
            gravityY: 50,
            frequency: 55,
            alpha: { start: 1.0, end: 0.1 },
            speedY: 120,
            follow: this.jetpack,
            followOffset: {
                x: this.jetpack.displayWidth / 2 - 10,
                y: this.jetpack.displayHeight / 2 - 5
            },
            emitting: false
        });
    }

    // Flame wash — lateral spread of exhaust hitting the ground beneath a hovering player.
    createFlameWash() {
        my.vfx.flameWash = this.add.particles(0, 0, "kenny-particles", {
            frame: ["smoke_04.png", "smoke_05.png"],
            scale: { start: 0.03, end: 0.1 },
            lifespan: 250,
            speedX: { min: -200, max: 200 },
            speedY: { min: -20, max: -5 },
            gravityY: -250,
            frequency: 55,
            alpha: { start: 1.0, end: 0.1 },
            follow: this.jetpack,
            followOffset: { x: 0, y: 0 },
            emitting: false
        });
    }

    // Hover glow — upward-pointing flame glow beneath the player at altitude.
    createHoverGlow() {
        my.vfx.hover = this.add.particles(0, 0, "flame1", {
            scale: { start: 0.04, end: 0.08 },
            lifespan: 70,
            gravityY: 500,
            frequency: 110,
            alpha: { start: 1.0, end: 0.1 },
            angle: { min: 80, max: 100 },
            speedY: 900,
            follow: this.jetpack,
            followOffset: {
                x: this.jetpack.displayWidth / 2 - 10,
                y: this.jetpack.displayHeight / 2 - 5
            },
            emitting: false
        });
    }

    // ──────────────────────────────────────────────
    // CAMERA SETUP
    // ──────────────────────────────────────────────

    setupCamera() {
        // Camera zoom of 2.0× — the 864×450 map is rendered at an effective
        // viewport of 432×225, scaled up to fill more of the 1440×900 screen.
        const SCALE = 2.0;

        this.cameras.main.setBounds(
            0, 0,
            this.map.widthInPixels,
            this.map.heightInPixels
        );

        // startFollow with roundPixels=true for crisp pixel-art rendering.
        // Lerp 0.25 gives a smooth trailing camera feel.
        // Dead zone of 50×50 means the camera won't scroll until the player
        // moves 25px from center in any direction.
        this.cameras.main.startFollow(this.player, true, 0.25, 0.25);
        this.cameras.main.setDeadzone(50, 50);
        this.cameras.main.setZoom(SCALE);
    }

    // ──────────────────────────────────────────────
    // DEBUG LABEL SETUP
    // ──────────────────────────────────────────────

    setupDebugLabel() {
        // Small text label that floats above the player showing their current state.
        // Useful for debugging the state machine — remove or hide for production.
        this.stateLabel = this.add.text(0, 0, "", {
            fontSize: "12px",
            fontFamily: "Arial",
            color: "#ffffff"
        });
        this.stateLabel.setDepth(10);
    }

    // ──────────────────────────────────────────────
    // UPDATE — main game loop, delegates to helpers
    // ──────────────────────────────────────────────

    update(time, delta) {
        // Check for level restart
        if (Phaser.Input.Keyboard.JustDown(this.rKey)) {
            this.scene.restart();
            return;
        }

        this.handleHorizontalMovement();
        this.handleJump();
        this.handleJetpackPickupDrop();
        this.syncJetpackInUpdate();   // Sync position for VFX emitter follow
        this.updatePlayerState();
        this.updateAnimations();
        this.updateVFX();
        this.updateDebugLabel();

        // Reset the S-key "just pressed" flag at the end of each frame
        this.sJustPressed = false;
    }

    // ──────────────────────────────────────────────
    // HORIZONTAL MOVEMENT
    // ──────────────────────────────────────────────

    handleHorizontalMovement() {
        // Combine arrow keys and WASD — either set works at all times.
        const moveLeft = this.cursors.left.isDown || this.aKey.isDown;
        const moveRight = this.cursors.right.isDown || this.dKey.isDown;

        if (moveLeft) {
            // Accelerate left — use jetpack acceleration if jetpack is equipped.
            const accel = this.hasJetpack ? this.JETPACK_ACCELERATION : this.ACCELERATION;
            this.player.setAccelerationX(-accel);

            // Flip sprite to face left
            this.player.setFlip(true, false);
            // Only update facing direction while on the ground.
            // In the air, the last ground-facing direction is preserved.
            if (this.player.body.blocked.down) {
                this.facingLeft = true;
            }
        } else if (moveRight) {
            const accel = this.hasJetpack ? this.JETPACK_ACCELERATION : this.ACCELERATION;
            this.player.setAccelerationX(accel);

            // Reset flip to face right
            this.player.resetFlip();
            if (this.player.body.blocked.down) {
                this.facingLeft = false;
            }
        } else {
            // No movement input — apply drag to decelerate smoothly.
            this.player.setAccelerationX(0);
            this.player.setDragX(this.DRAG);
        }

        // Clamp horizontal velocity to the speed cap.
        // Different caps for normal vs. jetpack (airborne).
        const speedCap = this.hasJetpack ? this.JETPACK_MAX_SPEED : this.MAX_SPEED;
        this.player.setVelocityX(
            Phaser.Math.Clamp(this.player.body.velocity.x, -speedCap, speedCap)
        );

        // When the jetpack is equipped, tilt the player sprite slightly
        // in the direction of horizontal movement — a subtle visual cue.
        if (this.hasJetpack) {
            this.player.angle = this.player.body.velocity.x * 0.1;
        } else {
            this.player.angle = 0;
        }
    }

    // ──────────────────────────────────────────────
    // JUMP & HOVER
    // ──────────────────────────────────────────────

    handleJump() {
        // Jump input — Up arrow or W key.
        const jumpPressed = Phaser.Input.Keyboard.JustDown(this.cursors.up)
            || Phaser.Input.Keyboard.JustDown(this.wKey);

        // IMPORTANT: Use body.blocked.down for tilemap collision detection.
        // body.touching.down only works for sprite-sprite contacts, not tilemap tiles.
        const onGround = this.player.body.blocked.down;

        if (jumpPressed && onGround) {
            // Apply jump velocity — higher jump with jetpack equipped.
            const jumpVel = this.hasJetpack
                ? this.JETPACK_JUMP_VELOCITY
                : this.JUMP_VELOCITY;
            this.player.setVelocityY(jumpVel);

            // Dust burst on jump — reuses the walking emitter with explode(3)
            // which emits 3 particles immediately as a one-shot effect.
            my.vfx.walking.explode(3);

            // Play jetpack jump sound if wearing the jetpack
            if (this.hasJetpack) {
                this.jetpackJumpSfx.play();
            }
        }

        // Hover mechanic — only available with jetpack.
        // When the player is falling (velocity.y > 0) and holding W/Up,
        // halve the world gravity to create a slow descent.
        if (this.hasJetpack && this.player.body.velocity.y > 0
            && (this.cursors.up.isDown || this.wKey.isDown)) {
            this.physics.world.gravity.y = this.HOVER_GRAVITY;
            this.playerState = "Hovering";

            // Start hover engine sound if not already playing
            if (!this.hoverSoundPlaying) {
                this.jetpackHoverSfx.play({ loop: true });
                this.hoverSoundPlaying = true;
            }
        } else {
            // Restore normal gravity when not hovering.
            // Note: modifying world gravity globally affects all physics bodies.
            // A better approach would use per-body gravity, but we follow the
            // design doc's specification here.
            this.physics.world.gravity.y = this.BASE_GRAVITY;

            // Stop hover sound if it was playing
            if (this.hoverSoundPlaying) {
                this.jetpackHoverSfx.stop();
                this.hoverSoundPlaying = false;
            }
        }
    }

    // ──────────────────────────────────────────────
    // JETPACK PICKUP / DROP
    // ──────────────────────────────────────────────

    handleJetpackPickupDrop() {
        // Only process on S key press (not hold).
        if (!this.sJustPressed) return;

        const onGround = this.player.body.blocked.down;

        if (this.hasJetpack && onGround) {
            // Drop the jetpack at the player's current position.
            this.hasJetpack = false;
            this.jetpack.setVisible(true);
            this.jetpack.setPosition(this.player.x, this.player.y);
        } else if (!this.hasJetpack && onGround) {
            // Pick up the jetpack — requires the player to be overlapping it.
            // Uses a custom AABB overlap check instead of Arcade Physics overlap,
            // because the jetpack is not a physics body.
            if (this.overlapsJetpack(this.player, this.jetpack)) {
                this.hasJetpack = true;
                this.jetpack.setVisible(false);
            }
        }
    }

    // Custom AABB (Axis-Aligned Bounding Box) overlap check.
    // Returns true if two sprites' bounding boxes overlap.
    // We use this instead of Arcade Physics overlap because the jetpack
    // is not a physics body — it's a regular sprite.
    overlapsJetpack(a, b) {
        // Calculate half-widths and half-heights for both sprites
        const aHalfW = a.displayWidth / 2;
        const aHalfH = a.displayHeight / 2;
        const bHalfW = b.displayWidth / 2;
        const bHalfH = b.displayHeight / 2;

        return Math.abs(a.x - b.x) < aHalfW + bHalfW
            && Math.abs(a.y - b.y) < aHalfH + bHalfH;
    }

    // ──────────────────────────────────────────────
    // PLAYER STATE MACHINE
    // ──────────────────────────────────────────────

    updatePlayerState() {
        const onGround = this.player.body.blocked.down;
        const vel = this.player.body.velocity;

        // Don't override the Hovering state (set in handleJump)
        if (this.playerState === "Hovering") return;

        if (onGround) {
            if (Math.abs(vel.x) > 10) {
                this.playerState = "Running";
            } else {
                this.playerState = "Idle";
            }
        } else if (vel.y < 0) {
            this.playerState = "Jumping";
        } else {
            this.playerState = "Falling";
        }
    }

    // ──────────────────────────────────────────────
    // ANIMATION UPDATES
    // ──────────────────────────────────────────────

    updateAnimations() {
        const onGround = this.player.body.blocked.down;

        switch (this.playerState) {
            case "Idle":
                if (this.player.anims.currentAnim?.key !== "idle") {
                    this.player.anims.play("idle");
                }
                break;

            case "Running":
                if (this.player.anims.currentAnim?.key !== "walk") {
                    this.player.anims.play("walk");
                }
                // Slow the walk animation as the player decelerates to a stop.
                // Full speed (1.0) while moving, half speed (0.5) while drifting.
                // Note: AnimationState uses a timeScale property, not a setTimeScale() method.
                this.player.anims.timeScale =
                    Math.abs(this.player.body.velocity.x) > 50 ? 1.0 : 0.5;
                break;

            case "Jumping":
            case "Falling":
            case "Hovering":
                // All airborne states use the jump animation (arms-up pose).
                if (this.player.anims.currentAnim?.key !== "jump") {
                    this.player.anims.play("jump");
                }
                break;
        }
    }

    // ──────────────────────────────────────────────
    // VFX UPDATES — start/stop emitters based on state
    // ──────────────────────────────────────────────

    updateVFX() {
        this.updateWalkingDust();
        this.updateJetpackFlame();
        this.updateFlameWashAndHover();
    }

    updateWalkingDust() {
        const onGround = this.player.body.blocked.down;
        const moving = Math.abs(this.player.body.velocity.x) > 10;

        if (onGround && moving) {
            // Start emitting walking dust particles.
            my.vfx.walking.start();
            // Adjust frequency: slower particle emission with jetpack equipped.
            my.vfx.walking.frequency = this.hasJetpack
                ? this.JETPACK_PARTICLE_FREQ
                : this.WALK_PARTICLE_FREQ;
        } else {
            my.vfx.walking.stop();
        }
    }

    updateJetpackFlame() {
        // Flame is active when the player has the jetpack and is moving upward
        // (just after jumping). Stop when upward velocity is too slow or hovering.
        const goingUp = this.player.body.velocity.y < -40;
        if (this.hasJetpack && goingUp) {
            my.vfx.flame.start();
        } else {
            my.vfx.flame.stop();
        }
    }

    updateFlameWashAndHover() {
        // Both flameWash and hover are only active when the player has the jetpack,
        // is falling, and W/Up is held (i.e., in Hovering state).
        const isHovering = this.playerState === "Hovering";

        if (!isHovering) {
            my.vfx.flameWash.stop();
            my.vfx.hover.stop();
            return;
        }

        // Scan downward from the player to find the ground surface.
        // This determines where the flame wash emitter should be positioned
        // (at the top of the nearest ground tile below).
        const groundY = this.scanForGround(this.player.x, this.player.y);

        if (groundY !== null) {
            // Distance from player to the ground surface below.
            const distToGround = groundY - this.player.y;

            // Flame wash: active when within 110 pixels of the ground.
            // Position the flame wash follow offset so particles emit
            // from the ground surface directly below.
            if (distToGround <= 110 && distToGround > 0) {
                my.vfx.flameWash.start();
                // The emitter follows the jetpack sprite; we set the Y offset
                // to place particles at the ground surface.
                my.vfx.flameWash.followOffset.y = distToGround;
            } else {
                my.vfx.flameWash.stop();
            }

            // Hover glow: active when more than 55 pixels above the ground.
            // Creates a visual distinction — close to ground → flame wash only;
            // high altitude → hover glow (and flame wash if within 110px).
            if (distToGround > 55) {
                my.vfx.hover.start();
            } else {
                my.vfx.hover.stop();
            }
        } else {
            // No ground found below — likely at the bottom of the level.
            my.vfx.flameWash.stop();
            my.vfx.hover.stop();
        }
    }

    // Scans downward from (startX, startY) in 10-pixel increments
    // looking for a collidable tile. Returns the top Y coordinate of
    // the found tile, or null if no ground is found (scans up to Y=900).
    scanForGround(startX, startY) {
        for (let y = startY; y <= 900; y += 10) {
            const tile = this.groundLayer.getTileAtWorldXY(startX, y);
            if (tile && tile.properties.collides) {
                return tile.getTop();   // World-space Y of the tile's top edge
            }
        }
        return null;
    }

    // ──────────────────────────────────────────────
    // JETPACK POSITION SYNC
    // ──────────────────────────────────────────────

    // Called in update() — positions the jetpack sprite so that VFX emitters
    // (which follow the jetpack) read the correct position during their own
    // update phase. Without this, particles would be 1 frame behind the player
    // because the prerender sync happens after particle updates.
    syncJetpackInUpdate() {
        if (!this.hasJetpack) return;
        const xOffset = this.facingLeft ? -5 : 5;
        this.jetpack.x = this.player.x + xOffset;
        this.jetpack.y = this.player.y - 5;
    }

    // Called from the prerender event — final position sync for rendering.
    // Also updates the jetpack's visual angle to match the player's tilt.
    // This ensures the rendered jetpack position is pixel-perfect with the
    // player's post-physics position.
    syncJetpackToPlayer() {
        // Only sync when the player has the jetpack equipped.
        // When dropped, the jetpack stays at its last position.
        if (!this.hasJetpack) return;

        // X offset: +5 when facing right, -5 when facing left.
        // This places the jetpack slightly behind the player's back.
        const xOffset = this.facingLeft ? -5 : 5;
        // Y offset: 5 pixels above the player.
        const yOffset = -5;

        this.jetpack.x = this.player.x + xOffset;
        this.jetpack.y = this.player.y + yOffset;

        // Tilt the jetpack slightly in the direction of movement,
        // matching the player's tilt when jetpack is equipped.
        this.jetpack.angle = this.player.body.velocity.x * 0.1;
    }

    // ──────────────────────────────────────────────
    // DEBUG LABEL UPDATE
    // ──────────────────────────────────────────────

    updateDebugLabel() {
        // Position the label above the player's head.
        this.stateLabel.x = this.player.x + 15;
        this.stateLabel.y = this.player.y - 30;
        this.stateLabel.setText(this.playerState);
    }
}

// Expose the Platformer class on the global window object so main.js can reference it.
// class declarations are block-scoped and NOT automatically added to window.
window.Platformer = Platformer;
