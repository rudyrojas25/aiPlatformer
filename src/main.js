// main.js — Entry point for the AI Platformer game.
// Sets up the Phaser game configuration and global state object.
// This file must be loaded LAST in index.html so that Load and Platformer
// scene classes are already defined on the global scope.

// Global namespace object shared across scenes.
// Scenes store references to sprites, VFX emitters, and other state here
// so they can be accessed across scene transitions if needed.
// Using window.my so it's accessible from all <script> tags (class/const are block-scoped).
window.my = {
    sprite: {},   // Player and other sprite references
    vfx: {}       // Particle emitter references
};

// Phaser game configuration — matches the DESIGN.md specification.
// - CANVAS renderer for pixel-art sharpness (no WebGL anti-aliasing)
// - pixelArt: true prevents texture blur when sprites are scaled up
// - Arcade Physics with gravity set in Platformer.init(), not here
// - Debug is enabled in config but disabled at runtime in Platformer.create()
const config = {
    parent: "phaser-game",
    type: Phaser.CANVAS,
    render: {
        pixelArt: true
    },
    physics: {
        default: "arcade",
        arcade: {
            debug: true,
            gravity: { x: 0, y: 0 }
        }
    },
    width: 1440,
    height: 900,
    scene: [window.Load, window.Platformer]
};

// Create the Phaser game instance — this boots the scene manager
// and begins with the Load scene.
const game = new Phaser.Game(config);
