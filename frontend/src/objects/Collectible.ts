import Phaser from "phaser";
import { GAME_WIDTH, GROUND_Y } from "../config";

export class CollectibleManager {
  private scene: Phaser.Scene;
  public group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.group = scene.physics.add.group({ allowGravity: false });
  }

  update(speed: number, delta: number) {
    for (const child of [...this.group.getChildren()]) {
      const body = (child as any).body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(-speed);
      if (body.x < -50) {
        this.scene.tweens.killTweensOf(child);
        child.destroy();
      }
    }
  }

  spawnLine(startX: number, y: number, count: number, stepX = 38) {
    for (let i = 0; i < count; i++) {
      this.spawnOrbAt(startX + i * stepX, y);
    }
  }

  spawnArc(startX: number, widthPx: number, lowY: number, peakY: number, count = 7) {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      const x = startX + t * widthPx;
      const arch = 1 - Math.abs(0.5 - t) * 2;
      const y = Phaser.Math.Linear(lowY, peakY, arch);
      this.spawnOrbAt(x, y);
    }
  }

  spawnWave(startX: number, centerY: number, count: number, stepX = 34, amplitude = 34) {
    for (let i = 0; i < count; i++) {
      const y = centerY + Math.sin(i * 0.75) * amplitude;
      this.spawnOrbAt(startX + i * stepX, y);
    }
  }

  spawnStair(startX: number, startY: number, count: number, stepX = 38, stepY = -18) {
    for (let i = 0; i < count; i++) {
      this.spawnOrbAt(startX + i * stepX, startY + i * stepY);
    }
  }

  spawnGapTrail(startX: number, widthPx: number) {
    const width = Math.max(widthPx - 30, 36);
    this.spawnArc(startX + 12, width, GROUND_Y - 62, GROUND_Y - 130, Math.max(5, Math.round(widthPx / 24)));
  }

  spawnBonusLine(startX: number, baseY: number, count: number, stepX = 38) {
    this.spawnWave(startX, baseY, count, stepX, 18);
  }

  private spawnOrbAt(x: number, y: number) {
    const orb = this.scene.add.circle(x, y, 7, 0xc850c0, 0.9);
    orb.setStrokeStyle(2, 0xe878e0);
    this.scene.physics.add.existing(orb);
    (orb.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    (orb.body as Phaser.Physics.Arcade.Body).setCircle(7);
    this.group.add(orb);

    this.scene.tweens.add({
      targets: orb,
      scaleX: { from: 0.8, to: 1.2 },
      scaleY: { from: 0.8, to: 1.2 },
      alpha: { from: 0.7, to: 1 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });
  }

  spawnShield(_speed: number) {
    const x = GAME_WIDTH + 30;
    const y = GROUND_Y - 60;

    const shield = this.scene.add.polygon(x, y, [
      0, -12, 10, -6, 10, 6, 0, 12, -10, 6, -10, -6,
    ], 0x4488ff, 0.7);
    shield.setStrokeStyle(2, 0x88ccff);
    this.scene.physics.add.existing(shield);
    (shield.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    (shield.body as Phaser.Physics.Arcade.Body).setSize(20, 24);
    this.group.add(shield);

    this.scene.tweens.add({
      targets: shield,
      alpha: { from: 0.5, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  stopAll() {
    for (const child of [...this.group.getChildren()]) {
      const body = (child as any).body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      this.scene.tweens.killTweensOf(child);
    }
  }
}
