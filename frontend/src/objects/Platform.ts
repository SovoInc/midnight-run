import Phaser from "phaser";
import {
  GAME_WIDTH, GROUND_Y, TILE_SIZE, TILE_SCALE, SCALED_TILE, GROUND_ROWS,
} from "../config";

const SURFACE_FRAME = 0;
const FILL_FRAME = 10;

export class PlatformManager {
  private scene: Phaser.Scene;
  public group: Phaser.Physics.Arcade.StaticGroup;
  private columns: { x: number; sprites: Phaser.GameObjects.Sprite[]; body: Phaser.GameObjects.Rectangle | null }[] = [];
  private nextX = 0;
  private gapCountdown = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.group = scene.physics.add.staticGroup();

    for (let x = -SCALED_TILE; x < GAME_WIDTH + SCALED_TILE * 6; x += SCALED_TILE) {
      this.addColumn(x);
    }
    this.nextX = GAME_WIDTH + SCALED_TILE * 6;
  }

  private addColumn(x: number) {
    const sprites: Phaser.GameObjects.Sprite[] = [];

    for (let row = 0; row < GROUND_ROWS; row++) {
      const y = GROUND_Y + row * SCALED_TILE;
      const frame = row === 0 ? SURFACE_FRAME : FILL_FRAME;
      const tile = this.scene.add.sprite(x, y, "dungeon-tiles", frame)
        .setOrigin(0, 0)
        .setScale(TILE_SCALE)
        .setDepth(-5);
      sprites.push(tile);
    }

    const colliderHeight = GROUND_ROWS * SCALED_TILE;
    const hitbox = this.scene.add.rectangle(
      x + SCALED_TILE / 2,
      GROUND_Y + colliderHeight / 2,
      SCALED_TILE,
      colliderHeight,
    ).setOrigin(0.5, 0.5);
    hitbox.setVisible(false);

    this.scene.physics.add.existing(hitbox, true);
    this.group.add(hitbox);

    this.columns.push({ x, sprites, body: hitbox });
  }

  startGap(widthPx: number) {
    this.gapCountdown = Math.ceil(widthPx / SCALED_TILE);
  }

  update(speed: number, delta: number) {
    const dx = speed * (delta / 1000);
    this.nextX -= dx;

    for (let i = this.columns.length - 1; i >= 0; i--) {
      const col = this.columns[i];
      col.x -= dx;

      for (const s of col.sprites) {
        s.x = col.x;
      }

      if (col.body) {
        const newX = col.x + SCALED_TILE / 2;
        if (Math.abs(col.body.x - newX) > 0.5) {
          col.body.x = newX;
          const staticBody = col.body.body as Phaser.Physics.Arcade.StaticBody;
          staticBody.updateFromGameObject();
        }
      }

      if (col.x < -SCALED_TILE * 2) {
        for (const s of col.sprites) s.destroy();
        if (col.body) col.body.destroy();
        this.columns.splice(i, 1);
      }
    }

    while (this.nextX < GAME_WIDTH + SCALED_TILE * 6) {
      if (this.gapCountdown > 0) {
        this.gapCountdown--;
        this.addGapColumn(this.nextX);
      } else {
        this.addColumn(this.nextX);
      }
      this.nextX += SCALED_TILE;
    }
  }

  private addGapColumn(x: number) {
    const sprites: Phaser.GameObjects.Sprite[] = [];

    for (let row = 0; row < GROUND_ROWS; row++) {
      const y = GROUND_Y + row * SCALED_TILE;
      const lava = this.scene.add.sprite(x, y, "lava", 0)
        .setOrigin(0, 0)
        .setScale(TILE_SCALE)
        .setDepth(-4);
      lava.play("anim-lava");
      sprites.push(lava);
    }

    this.columns.push({ x, sprites, body: null });
  }
}
