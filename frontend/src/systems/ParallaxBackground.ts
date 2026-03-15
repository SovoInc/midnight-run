import Phaser from "phaser";
import { BASE_SPEED, MAX_SPEED, GAME_WIDTH, GAME_HEIGHT } from "../config";
import { ZonePalette } from "./ZoneManager";

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

interface MoonParts {
  glows: Phaser.GameObjects.Arc[];
  body: Phaser.GameObjects.Arc;
}

interface Star {
  sprite: Phaser.GameObjects.Arc;
  baseAlpha: number;
  phase: number;
  speed: number;
}

export function drawMoon(scene: Phaser.Scene, mx: number, my: number, depth: number): MoonParts {
  const glows: Phaser.GameObjects.Arc[] = [];

  // Outer glow
  glows.push(scene.add.circle(mx, my, 60, 0xf6dd9c, 0.06).setScrollFactor(0).setDepth(depth));
  glows.push(scene.add.circle(mx, my, 44, 0xf6dd9c, 0.10).setScrollFactor(0).setDepth(depth));
  glows.push(scene.add.circle(mx, my, 30, 0xfceabb, 0.18).setScrollFactor(0).setDepth(depth));

  // Moon body
  const r = 22;
  const body = scene.add.circle(mx, my, r, 0xfff8e7, 1).setScrollFactor(0).setDepth(depth + 1);

  // Logo mark
  const logo = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);
  const sq = 4;
  const gap = 9;
  logo.fillStyle(0xc8c0a8, 0.5);
  logo.lineStyle(1, 0xb8b098, 0.6);
  for (let i = 0; i < 3; i++) {
    const sy = my - i * gap;
    logo.fillRect(mx - sq / 2, sy - sq / 2, sq, sq);
    logo.strokeRect(mx - sq / 2, sy - sq / 2, sq, sq);
  }

  // Clip logo to moon circle
  const moonMask = scene.add.graphics().setVisible(false);
  moonMask.fillCircle(mx, my, r);
  logo.setMask(moonMask.createGeometryMask());

  return { glows, body };
}

export class ParallaxBackground {
  private layers: Layer[] = [];
  private bats: Bat[] = [];
  private moonParts: MoonParts;
  private stars: Star[] = [];
  private elapsed = 0;

  constructor(scene: Phaser.Scene) {
    const scaleY = GAME_HEIGHT / 192;
    const tileW = Math.ceil(GAME_WIDTH / scaleY);
    const tileH = 192;

    const back = scene.add.tileSprite(0, 0, tileW, tileH, "bg-back")
      .setOrigin(0).setScale(scaleY).setScrollFactor(0).setDepth(-30);

    this.moonParts = drawMoon(scene, GAME_WIDTH * 0.78, GAME_HEIGHT * 0.2, -29);

    const mid = scene.add.tileSprite(0, 0, tileW, tileH, "bg-mid")
      .setOrigin(0).setScale(scaleY).setScrollFactor(0).setDepth(-20);

    const front = scene.add.tileSprite(0, 0, tileW, tileH, "bg-front")
      .setOrigin(0).setScale(scaleY).setScrollFactor(0).setDepth(-10);

    this.layers = [
      { sprite: back, speedFactor: 0.15 },
      { sprite: mid, speedFactor: 0.4 },
      { sprite: front, speedFactor: 0.7 },
    ];

    // Star field
    for (let i = 0; i < 35; i++) {
      const x = Phaser.Math.Between(10, GAME_WIDTH - 10);
      const y = Phaser.Math.Between(10, Math.round(GAME_HEIGHT * 0.6));
      const r = Phaser.Math.FloatBetween(0.8, 1.8);
      const star = scene.add.circle(x, y, r, 0xffffff, 0)
        .setScrollFactor(0).setDepth(-28);
      this.stars.push({
        sprite: star,
        baseAlpha: Phaser.Math.FloatBetween(0.4, 0.9),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        speed: Phaser.Math.FloatBetween(1.5, 3.5),
      });
    }

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
    this.elapsed += dt;
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

  applyZonePalette(palette: ZonePalette) {
    // Tint parallax layers
    this.layers[0].sprite.setTint(palette.backTint);
    this.layers[1].sprite.setTint(palette.midTint);
    this.layers[2].sprite.setTint(palette.frontTint);

    // Tint moon via fillColor (Shape/Arc doesn't support setTint)
    const col = Phaser.Display.Color.IntegerToColor(palette.moonTint);
    const r = col.red / 255;
    const g = col.green / 255;
    const b = col.blue / 255;
    for (const glow of this.moonParts.glows) {
      const base = Phaser.Display.Color.IntegerToColor(0xf6dd9c);
      glow.fillColor = Phaser.Display.Color.GetColor(
        Math.round(base.red * r), Math.round(base.green * g), Math.round(base.blue * b),
      );
    }
    const bodyBase = Phaser.Display.Color.IntegerToColor(0xfff8e7);
    this.moonParts.body.fillColor = Phaser.Display.Color.GetColor(
      Math.round(bodyBase.red * r), Math.round(bodyBase.green * g), Math.round(bodyBase.blue * b),
    );

    // Update stars
    for (const star of this.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(this.elapsed * star.speed + star.phase);
      star.sprite.setAlpha(star.baseAlpha * twinkle * palette.starBrightness);
    }
  }
}
