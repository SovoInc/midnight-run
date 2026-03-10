import Phaser from "phaser";
import { BASE_SPEED, MAX_SPEED, GAME_WIDTH, GAME_HEIGHT } from "../config";

interface Layer {
  sprite: Phaser.GameObjects.TileSprite;
  speedFactor: number;
}

interface Bat {
  sprite: Phaser.GameObjects.Sprite;
  speedFactor: number;
  drift: number;
  baseY: number;
  phase: number;
  revealAt: number;
  maxAlpha: number;
}

export class ParallaxBackground {
  private layers: Layer[] = [];
  private bats: Bat[] = [];

  constructor(scene: Phaser.Scene) {
    const scaleY = GAME_HEIGHT / 192;

    const back = scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg-back")
      .setOrigin(0).setScale(scaleY).setScrollFactor(0).setDepth(-30);

    scene.add.circle(GAME_WIDTH * 0.78, GAME_HEIGHT * 0.2, 34, 0xf6dd9c, 0.14)
      .setScrollFactor(0)
      .setDepth(-29);
    scene.add.circle(GAME_WIDTH * 0.78, GAME_HEIGHT * 0.2, 22, 0xfff2bf, 0.9)
      .setScrollFactor(0)
      .setDepth(-28);

    const mid = scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg-mid")
      .setOrigin(0).setScale(scaleY).setScrollFactor(0).setDepth(-20).setAlpha(0.8);

    const front = scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg-front")
      .setOrigin(0).setScale(scaleY).setScrollFactor(0).setDepth(-10).setAlpha(0.6);

    this.layers = [
      { sprite: back, speedFactor: 0.15 },
      { sprite: mid, speedFactor: 0.4 },
      { sprite: front, speedFactor: 0.7 },
    ];

    const batConfigs = [
      { x: GAME_WIDTH * 0.68, y: GAME_HEIGHT * 0.18, scale: 1.1, speedFactor: 0.22, revealAt: 0.0, maxAlpha: 0.75 },
      { x: GAME_WIDTH * 0.88, y: GAME_HEIGHT * 0.27, scale: 0.9, speedFactor: 0.28, revealAt: 0.12, maxAlpha: 0.72 },
      { x: GAME_WIDTH * 1.08, y: GAME_HEIGHT * 0.14, scale: 0.75, speedFactor: 0.34, revealAt: 0.24, maxAlpha: 0.7 },
      { x: GAME_WIDTH * 1.22, y: GAME_HEIGHT * 0.22, scale: 0.95, speedFactor: 0.4, revealAt: 0.46, maxAlpha: 0.78 },
      { x: GAME_WIDTH * 1.36, y: GAME_HEIGHT * 0.12, scale: 0.7, speedFactor: 0.48, revealAt: 0.64, maxAlpha: 0.7 },
      { x: GAME_WIDTH * 1.52, y: GAME_HEIGHT * 0.3, scale: 0.82, speedFactor: 0.54, revealAt: 0.8, maxAlpha: 0.68 },
    ];

    this.bats = batConfigs.map((config, index) => {
      const sprite = scene.add.sprite(config.x, config.y, "bat-sky")
        .setScale(config.scale)
        .setFlipX(true)
        .setAlpha(0)
        .setScrollFactor(0)
        .setDepth(-18);
      sprite.play("anim-bat-sky");

      return {
        sprite,
        speedFactor: config.speedFactor,
        drift: 10 + index * 4,
        baseY: config.y,
        phase: index * 1.6,
        revealAt: config.revealAt,
        maxAlpha: config.maxAlpha,
      };
    });
  }

  update(gameSpeed: number, delta: number) {
    const dt = delta / 1000;
    const speedProgress = Phaser.Math.Clamp((gameSpeed - BASE_SPEED) / Math.max(MAX_SPEED - BASE_SPEED, 1), 0, 1);

    for (const layer of this.layers) {
      layer.sprite.tilePositionX += gameSpeed * layer.speedFactor * dt / (GAME_HEIGHT / 192);
    }

    for (const bat of this.bats) {
      const visibility = Phaser.Math.Clamp((speedProgress - bat.revealAt) / 0.18, 0, 1);
      bat.sprite.setAlpha(visibility * bat.maxAlpha);
      bat.sprite.x -= gameSpeed * bat.speedFactor * dt;
      bat.phase += dt * (2.2 + speedProgress * 1.6);
      bat.sprite.y = bat.baseY + Math.sin(bat.phase) * bat.drift;

      if (bat.sprite.x < -48) {
        bat.sprite.x = GAME_WIDTH + Phaser.Math.Between(40, 180);
        bat.baseY = Phaser.Math.Between(
          Math.round(GAME_HEIGHT * 0.12),
          Math.round(GAME_HEIGHT * 0.3),
        );
      }
    }
  }
}
