// Load.js — Preload scene that loads all game assets and creates player animations.
// This scene runs first, displays nothing visually, then immediately transitions
// to the Platformer scene once all assets are ready.

class Load extends Phaser.Scene {
    constructor() {
        super({ key: "loadScene" });
    }

    preload() {
        // Set the base path for all asset loading — all files are in ./assets/
        this.load.setPath("./assets/");

        // --- Character Atlas ---
        // TexturePacker-format atlas with the player character frames.
        // Atlas key: "platformer_characters"
        // Frame naming: "tile_XXXX.png" (4-digit zero-padded)
        // Only frames 0000 and 0001 are used for the player.
        this.load.atlas(
            "platformer_characters",
            "tilemap-characters-packed.png",
            "tilemap-characters-packed.json"
        );

        // --- Tilemap Assets ---
        // The tilemap image loaded as both a plain image AND a spritesheet.
        // "tilemap_tiles" — used by the tilemap renderer for drawing the level.
        // "tilemap_sheet" — 18×18 frame spritesheet, used if we need individual tile frames
        //   for decorative objects or future features like coins.
        this.load.image("tilemap_tiles", "tilemap_packed.png");
        this.load.spritesheet("tilemap_sheet", "tilemap_packed.png", {
            frameWidth: 18,
            frameHeight: 18
        });

        // The Tiled JSON export — contains layer data, tile indices, and custom properties.
        this.load.tilemapTiledJSON("platformer-level-1", "platformer-level-1.tmj");

        // --- Particle Multi-Atlas ---
        // Kenny particle pack spread across 5 PNG pages.
        // Used frames: smoke_03, smoke_04, smoke_05, smoke_09
        this.load.multiatlas("kenny-particles", "kenny-particles.json");

        // --- Jetpack and Flame Images ---
        // Jetpack item sprite (scaled to 1.25× in the Platformer scene)
        this.load.image("jetpack", "spaceMissiles_012.png");
        // Flame sprites for jetpack VFX — flame1 is actively used, flame2 is loaded but unused
        this.load.image("flame1", "explosion00.png");
        this.load.image("flame2", "explosion01.png");

        // --- Audio ---
        // Sound effects for jetpack interactions.
        // explosionCrunch: short burst sound for jetpack jump
        // spaceEngineLow: looping engine hum for hover
        this.load.audio("jetpackJump", "explosionCrunch_000.ogg");
        this.load.audio("jetpackHover", "spaceEngineLow_000.ogg");
    }

    create() {
        // Build the three player animations before transitioning.
        // These are created here so the Platformer scene can reference them by key string.
        this.createPlayerAnimations();

        // Immediately transition to the main game scene.
        // No loading screen or title screen — the game starts directly.
        this.scene.start("platformerScene");
    }

    // Creates the walk, idle, and jump animations for the player character.
    // All animations use frames from the "platformer_characters" atlas.
    createPlayerAnimations() {
        // Walk animation — two-frame loop at 15fps.
        // Uses generateFrameNames to pick "tile_0000.png" and "tile_0001.png"
        // with zeroPad: 4 to match the atlas frame naming convention.
        this.anims.create({
            key: "walk",
            frames: this.anims.generateFrameNames("platformer_characters", {
                prefix: "tile_",
                start: 0,
                end: 1,
                zeroPad: 4,
                suffix: ".png"
            }),
            frameRate: 15,
            repeat: -1
        });

        // Idle animation — single frame static pose (tile_0000).
        this.anims.create({
            key: "idle",
            frames: [
                { key: "platformer_characters", frame: "tile_0000.png" }
            ],
            frameRate: 15,
            repeat: -1
        });

        // Jump animation — single frame arms-up pose (tile_0001).
        // Does not repeat — plays once when the player leaves the ground.
        this.anims.create({
            key: "jump",
            frames: [
                { key: "platformer_characters", frame: "tile_0001.png" }
            ],
            frameRate: 15,
            repeat: 0
        });
    }

    update() {
        // No update logic needed — this scene transitions immediately in create().
    }
}

// Expose the Load class on the global window object so main.js can reference it.
// class declarations are block-scoped and NOT automatically added to window.
window.Load = Load;
