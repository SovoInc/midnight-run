import Phaser from "phaser";
import { CHARACTERS, getUniqueSheets, PlayerState } from "../systems/CharacterRegistry";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const bar = this.add.rectangle(cx, cy, 300, 20, 0x1a1a2e).setStrokeStyle(2, 0x7b2d8e);
    const fill = this.add.rectangle(cx - 148, cy, 0, 16, 0xc850c0).setOrigin(0, 0.5);
    this.load.on("progress", (v: number) => {
      fill.width = 296 * v;
    });
    this.load.on("complete", () => { bar.destroy(); fill.destroy(); });

    const base = import.meta.env.BASE_URL;

    // Load all character spritesheets
    for (const char of CHARACTERS) {
      const sheets = getUniqueSheets(char);
      for (const sheet of sheets) {
        const key = `${char.id}-${sheet}`;
        this.load.spritesheet(key, `${base}assets/player/${char.folder}/${sheet}.png`, {
          frameWidth: char.frameWidth,
          frameHeight: char.frameHeight,
        });
      }
    }

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
    // Create animations for all characters
    const states: PlayerState[] = ["idle", "run", "jump", "midair", "fall", "dash", "hit", "dead"];
    for (const char of CHARACTERS) {
      for (const state of states) {
        const anim = char.anims[state];
        const key = `${char.id}-anim-${state}`;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(`${char.id}-${anim.sheet}`, {
            start: anim.start,
            end: anim.end,
          }),
          frameRate: anim.rate,
          repeat: anim.repeat,
        });
      }
    }

    // Environment animations
    this.anims.create({ key: "anim-saw", frames: this.anims.generateFrameNumbers("saw", { start: 0, end: 15 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "anim-fire", frames: this.anims.generateFrameNumbers("fire-trap", { start: 0, end: 8 }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: "anim-lightning", frames: this.anims.generateFrameNumbers("lightning", { start: 0, end: 9 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "anim-toxic", frames: this.anims.generateFrameNumbers("toxic", { start: 0, end: 59 }), frameRate: 12, repeat: -1 });
    this.anims.create({ key: "anim-lava", frames: this.anims.generateFrameNumbers("lava", { start: 0, end: 15 }), frameRate: 8, repeat: -1 });
    this.anims.create({ key: "anim-bat-sky", frames: this.anims.generateFrameNumbers("bat-sky", { start: 0, end: 4 }), frameRate: 10, repeat: -1 });

    this.scene.start("MenuScene");
  }
}
