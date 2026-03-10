import Phaser from "phaser";
import { GAME_WIDTH, GROUND_Y } from "../config";
import { ObstacleType } from "../systems/DifficultyManager";

export interface ObstacleSprite extends Phaser.Physics.Arcade.Sprite {
  obstacleType: ObstacleType;
  scored: boolean;
}

export class ObstacleFactory {
  private scene: Phaser.Scene;
  public group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.group = scene.physics.add.group({ allowGravity: false });
  }

  spawn(type: ObstacleType, speed: number, offsetX = 0): ObstacleSprite | null {
    const x = GAME_WIDTH + 60 + offsetX;

    let sprite: Phaser.Physics.Arcade.Sprite;

    switch (type) {
      case "fire": {
        sprite = this.scene.physics.add.sprite(x, GROUND_Y - 32, "fire-trap");
        sprite.play("anim-fire");
        sprite.setOrigin(0.5, 1);
        sprite.setY(GROUND_Y);
        sprite.setSize(18, 40).setOffset(7, 20);
        sprite.setScale(1.8);
        break;
      }
      case "saw": {
        const floatHigh = Math.random() > 0.5;
        const baseY = floatHigh ? GROUND_Y - 80 : GROUND_Y - 40;
        sprite = this.scene.physics.add.sprite(x, baseY, "saw");
        sprite.play("anim-saw");
        sprite.setSize(36, 36).setOffset(14, 14);
        sprite.setScale(1.0);
        this.scene.tweens.add({
          targets: sprite,
          y: baseY + (floatHigh ? 30 : -30),
          duration: 1000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
      }
      case "lightning": {
        sprite = this.scene.physics.add.sprite(x, GROUND_Y - 48, "lightning");
        sprite.play("anim-lightning");
        sprite.setOrigin(0.5, 1);
        sprite.setY(GROUND_Y);
        sprite.setSize(24, 50).setOffset(36, 34);
        sprite.setScale(1.0);
        break;
      }
      case "wall": {
        sprite = this.scene.physics.add.sprite(x, GROUND_Y, "toxic");
        sprite.setFrame(0);
        sprite.setOrigin(0.5, 1);
        sprite.setY(GROUND_Y);
        sprite.setSize(28, 48).setOffset(18, 12);
        sprite.setScale(1.8);
        break;
      }
      case "gap":
        return null;
      default:
        return null;
    }

    sprite.setDepth(5);
    (sprite.body as Phaser.Physics.Arcade.Body).allowGravity = false;
    sprite.setVelocityX(-speed);
    this.group.add(sprite);

    const obs = sprite as ObstacleSprite;
    obs.obstacleType = type;
    obs.scored = false;
    return obs;
  }

  update(speed: number) {
    for (const child of [...this.group.getChildren()]) {
      const s = child as Phaser.Physics.Arcade.Sprite;
      s.setVelocityX(-speed);
      if (s.x < -100) {
        this.scene.tweens.killTweensOf(s);
        s.destroy();
      }
    }
  }

  stopAll() {
    for (const child of [...this.group.getChildren()]) {
      const s = child as Phaser.Physics.Arcade.Sprite;
      s.setVelocity(0, 0);
      s.anims?.pause();
      this.scene.tweens.killTweensOf(s);
    }
  }
}
