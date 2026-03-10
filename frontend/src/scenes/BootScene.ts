import Phaser from "phaser";
import { FRAME_WIDTH, FRAME_HEIGHT } from "../config";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const bar = this.add.rectangle(cx, cy, 300, 20, 0x1a1a2e).setStrokeStyle(2, 0x7b2d8e);
    const fill = this.add.rectangle(cx - 148, cy, 4, 16, 0xc850c0);
    this.load.on("progress", (v: number) => {
      fill.width = 296 * v;
      fill.x = cx - 148 + fill.width / 2;
    });
    this.load.on("complete", () => { bar.destroy(); fill.destroy(); });

    const base = import.meta.env.BASE_URL;
    const fw = FRAME_WIDTH;
    const fh = FRAME_HEIGHT;

    this.load.spritesheet("player-idle", `${base}assets/player/idle.png`, { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet("player-run", `${base}assets/player/run.png`, { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet("player-jump", `${base}assets/player/jump.png`, { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet("player-midair", `${base}assets/player/midair.png`, { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet("player-fall", `${base}assets/player/fall.png`, { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet("player-dash", `${base}assets/player/dash.png`, { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet("player-hit", `${base}assets/player/hit.png`, { frameWidth: fw, frameHeight: fh });
    this.load.spritesheet("player-death", `${base}assets/player/death.png`, { frameWidth: fw, frameHeight: fh });

    this.load.image("bg-back", `${base}assets/backgrounds/bg-back.png`);
    this.load.image("bg-mid", `${base}assets/backgrounds/bg-mid.png`);
    this.load.image("bg-front", `${base}assets/backgrounds/bg-front.png`);
    this.load.spritesheet("bat-sky", `${base}assets/backgrounds/bat-fly.png`, {
      frameWidth: 32, frameHeight: 32,
    });

    this.load.spritesheet("dungeon-tiles", `${base}assets/environment/dungeon-tiles.png`, {
      frameWidth: 16, frameHeight: 16,
    });
    this.load.spritesheet("lava", `${base}assets/environment/lava.png`, { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet("saw", `${base}assets/environment/saw.png`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("fire-trap", `${base}assets/environment/fire-trap.png`, { frameWidth: 32, frameHeight: 64 });
    this.load.spritesheet("lightning", `${base}assets/environment/lightning.png`, { frameWidth: 96, frameHeight: 96 });
    this.load.spritesheet("toxic", `${base}assets/environment/toxic.png`, { frameWidth: 64, frameHeight: 64 });

    this.load.audio("music", `${base}assets/backgrounds/music.ogg`);
    this.load.image("heart", `${base}assets/ui/heart.png`);
  }

  create() {
    this.anims.create({ key: "anim-idle", frames: this.anims.generateFrameNumbers("player-idle", { start: 0, end: 11 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "anim-run", frames: this.anims.generateFrameNumbers("player-run", { start: 0, end: 7 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "anim-jump", frames: this.anims.generateFrameNumbers("player-jump", { start: 0, end: 3 }), frameRate: 10, repeat: 0 });
    this.anims.create({ key: "anim-midair", frames: this.anims.generateFrameNumbers("player-midair", { start: 0, end: 0 }), frameRate: 1, repeat: -1 });
    this.anims.create({ key: "anim-fall", frames: this.anims.generateFrameNumbers("player-fall", { start: 0, end: 3 }), frameRate: 10, repeat: 0 });
    this.anims.create({ key: "anim-dash", frames: this.anims.generateFrameNumbers("player-dash", { start: 0, end: 3 }), frameRate: 16, repeat: 0 });
    this.anims.create({ key: "anim-hit", frames: this.anims.generateFrameNumbers("player-hit", { start: 0, end: 0 }), frameRate: 1, repeat: 0 });
    this.anims.create({ key: "anim-death", frames: this.anims.generateFrameNumbers("player-death", { start: 0, end: 9 }), frameRate: 8, repeat: 0 });

    this.anims.create({ key: "anim-saw", frames: this.anims.generateFrameNumbers("saw", { start: 0, end: 15 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "anim-fire", frames: this.anims.generateFrameNumbers("fire-trap", { start: 0, end: 8 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "anim-lightning", frames: this.anims.generateFrameNumbers("lightning", { start: 0, end: 9 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "anim-toxic", frames: this.anims.generateFrameNumbers("toxic", { start: 0, end: 59 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "anim-lava", frames: this.anims.generateFrameNumbers("lava", { start: 0, end: 15 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "anim-bat-sky", frames: this.anims.generateFrameNumbers("bat-sky", { start: 0, end: 5 }), frameRate: 10, repeat: -1 });

    this.scene.start("MenuScene");
  }
}
