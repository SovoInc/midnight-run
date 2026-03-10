import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { api, PlayerData } from "../api";
import { drawMoon } from "../systems/ParallaxBackground";

interface MenuBat {
  sprite: Phaser.GameObjects.Sprite;
  baseY: number;
  speedX: number;
  phase: number;
  drift: number;
}

export class MenuScene extends Phaser.Scene {
  private aliasValue = "";
  private aliasText!: Phaser.GameObjects.Text;
  private aliasBox!: Phaser.GameObjects.Rectangle;
  private errorText!: Phaser.GameObjects.Text;
  private aliasHintText!: Phaser.GameObjects.Text;
  private keyboardHandler?: (event: KeyboardEvent) => void;
  private caretTimer?: Phaser.Time.TimerEvent;
  private caretVisible = true;
  private bats: MenuBat[] = [];
  private hiddenInput?: HTMLInputElement;

  constructor() {
    super("MenuScene");
  }

  create() {
    const cx = GAME_WIDTH / 2;

    const bg1 = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg-back").setOrigin(0).setScale(GAME_HEIGHT / 192);
    const bg2 = this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, "bg-mid").setOrigin(0).setScale(GAME_HEIGHT / 192);
    bg2.setAlpha(0.7);

    this.tweens.add({ targets: bg1, tilePositionX: 50, duration: 20000, repeat: -1, yoyo: true });
    this.tweens.add({ targets: bg2, tilePositionX: 100, duration: 15000, repeat: -1, yoyo: true });

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12, 0.6).setOrigin(0).setDepth(0);

    // Moon (above overlay)
    drawMoon(this, GAME_WIDTH * 0.78, GAME_HEIGHT * 0.18, 1);

    // Bats (above overlay)
    this.bats = [];
    const batConfigs = [
      { x: GAME_WIDTH * 0.10, y: GAME_HEIGHT * 0.12, scale: 0.85, speedX: -20 },
      { x: GAME_WIDTH * 0.30, y: GAME_HEIGHT * 0.24, scale: 0.70, speedX: 15 },
      { x: GAME_WIDTH * 0.50, y: GAME_HEIGHT * 0.08, scale: 1.0,  speedX: -24 },
      { x: GAME_WIDTH * 0.65, y: GAME_HEIGHT * 0.20, scale: 0.75, speedX: 17 },
      { x: GAME_WIDTH * 0.80, y: GAME_HEIGHT * 0.15, scale: 0.90, speedX: -22 },
      { x: GAME_WIDTH * 0.95, y: GAME_HEIGHT * 0.28, scale: 0.65, speedX: 13 },
      { x: GAME_WIDTH * 1.10, y: GAME_HEIGHT * 0.10, scale: 0.80, speedX: -19 },
      { x: GAME_WIDTH * 1.25, y: GAME_HEIGHT * 0.22, scale: 0.95, speedX: 21 },
    ];
    for (let i = 0; i < batConfigs.length; i++) {
      const cfg = batConfigs[i];
      const sprite = this.add.sprite(cfg.x, cfg.y, "bat-sky")
        .setScale(cfg.scale)
        .setFlipX(cfg.speedX > 0)
        .setAlpha(0.65)
        .setDepth(1);
      sprite.play("anim-bat-sky");
      this.bats.push({
        sprite,
        baseY: cfg.y,
        speedX: cfg.speedX,
        phase: i * 1.4,
        drift: 6 + i * 2.5,
      });
    }

    const title = this.add.text(cx, 80, "MIDNIGHT RUN", {
      fontFamily: '"Press Start 2P"',
      fontSize: "32px",
      color: "#c850c0",
      align: "center",
      stroke: "#7b2d8e",
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);

    this.tweens.add({
      targets: title,
      alpha: { from: 0.7, to: 1 },
      duration: 1500,
      repeat: -1,
      yoyo: true,
    });

    const player = this.add.sprite(cx, 230, "player-idle").setScale(1.5).setDepth(5);
    player.play("anim-idle");

    this.add.text(cx, 300, "Enter your alias", {
      fontFamily: '"Press Start 2P"',
      fontSize: "10px",
      color: "#8866aa",
    }).setOrigin(0.5).setDepth(5);

    this.aliasHintText = this.add.text(cx, 338, "TAP BOX TO TYPE ALIAS", {
      fontFamily: '"Press Start 2P"',
      fontSize: "8px",
      color: "#88ccff",
      align: "center",
      lineSpacing: 8,
    }).setOrigin(0.5).setDepth(5);

    this.aliasBox = this.add.rectangle(cx, 305, 240, 34, 0x1a1a2e)
      .setStrokeStyle(2, 0x7b2d8e)
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    this.aliasBox.on("pointerdown", () => {
      this.pulseAliasBox();
      this.focusHiddenInput();
    });

    // Hidden DOM input to trigger mobile keyboard
    this.hiddenInput = document.createElement("input");
    this.hiddenInput.type = "text";
    this.hiddenInput.maxLength = 20;
    this.hiddenInput.autocapitalize = "off";
    this.hiddenInput.autocomplete = "off";
    this.hiddenInput.setAttribute("autocorrect", "off");
    Object.assign(this.hiddenInput.style, {
      position: "fixed",
      left: "0",
      top: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      zIndex: "-1",
      border: "none",
      outline: "none",
      background: "transparent",
      caretColor: "transparent",
      fontSize: "16px", // prevents iOS zoom on focus
    });
    document.body.appendChild(this.hiddenInput);
    this.hiddenInput.value = this.aliasValue;
    this.hiddenInput.addEventListener("input", () => this.syncFromHiddenInput());
    this.hiddenInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.startGame();
    });

    this.aliasText = this.add.text(cx, 305, "", {
      fontFamily: '"Press Start 2P"',
      fontSize: "10px",
      color: "#c850c0",
      align: "center",
    }).setOrigin(0.5).setDepth(5);

    this.errorText = this.add.text(cx, 380, "", {
      fontFamily: '"Press Start 2P"',
      fontSize: "8px",
      color: "#ff4444",
    }).setOrigin(0.5).setDepth(5);

    const btnBg = this.add.rectangle(cx, 405, 160, 36, 0x7b2d8e).setInteractive({ useHandCursor: true }).setDepth(5);
    this.add.text(cx, 405, "R U N", {
      fontFamily: '"Press Start 2P"',
      fontSize: "14px",
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(5);

    btnBg.on("pointerover", () => btnBg.setFillStyle(0xc850c0));
    btnBg.on("pointerout", () => btnBg.setFillStyle(0x7b2d8e));
    btnBg.on("pointerdown", () => this.startGame());

    const saved = localStorage.getItem("mr_player");
    if (saved) {
      const data = JSON.parse(saved) as PlayerData;
      this.aliasValue = data.alias;

      const achBg = this.add.rectangle(cx, 440, 180, 26, 0x2a2a3e).setInteractive({ useHandCursor: true }).setDepth(5);
      this.add.text(cx, 440, "ACHIEVEMENTS", {
        fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#ffdd44",
      }).setOrigin(0.5).setDepth(5);

      achBg.on("pointerover", () => achBg.setFillStyle(0x4a4a5e));
      achBg.on("pointerout", () => achBg.setFillStyle(0x2a2a3e));
      achBg.on("pointerdown", () => {
        this.cleanup();
        this.scene.start("AchievementsScene", {
          player: data,
          returnScene: "MenuScene",
        });
      });
    }

    this.keyboardHandler = (event: KeyboardEvent) => this.handleKeydown(event);
    this.input.keyboard!.on("keydown", this.keyboardHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());

    this.caretTimer = this.time.addEvent({
      delay: 450,
      loop: true,
      callback: () => {
        this.caretVisible = !this.caretVisible;
        this.refreshAliasText();
      },
    });

    this.refreshAliasText();
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;
    for (const bat of this.bats) {
      bat.sprite.x += bat.speedX * dt;
      bat.phase += dt * 2.4;
      bat.sprite.y = bat.baseY + Math.sin(bat.phase) * bat.drift;
      if (bat.speedX < 0 && bat.sprite.x < -40) {
        bat.sprite.x = GAME_WIDTH + Phaser.Math.Between(20, 120);
        bat.baseY = Phaser.Math.Between(
          Math.round(GAME_HEIGHT * 0.08),
          Math.round(GAME_HEIGHT * 0.28),
        );
      } else if (bat.speedX > 0 && bat.sprite.x > GAME_WIDTH + 40) {
        bat.sprite.x = -Phaser.Math.Between(20, 120);
        bat.baseY = Phaser.Math.Between(
          Math.round(GAME_HEIGHT * 0.08),
          Math.round(GAME_HEIGHT * 0.28),
        );
      }
    }
  }

  private handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      this.startGame();
      return;
    }

    if (event.key === "Backspace") {
      this.aliasValue = this.aliasValue.slice(0, -1);
      if (this.hiddenInput) this.hiddenInput.value = this.aliasValue;
      this.errorText.setText("");
      this.refreshAliasText();
      return;
    }

    if (event.key.length === 1 && this.aliasValue.length < 20 && /^[a-zA-Z0-9 _-]$/.test(event.key)) {
      this.aliasValue += event.key;
      if (this.hiddenInput) this.hiddenInput.value = this.aliasValue;
      this.errorText.setText("");
      this.refreshAliasText();
    }
  }

  private refreshAliasText() {
    const hasAlias = this.aliasValue.length > 0;
    const caret = this.caretVisible ? "_" : "";
    const display = hasAlias ? this.aliasValue + caret : "alias" + caret;
    this.aliasText.setText(display);
    this.aliasText.setColor(hasAlias ? "#c850c0" : "#6666aa");
  }

  private focusHiddenInput() {
    if (this.hiddenInput) {
      this.hiddenInput.value = this.aliasValue;
      this.hiddenInput.focus();
    }
  }

  private syncFromHiddenInput() {
    if (!this.hiddenInput) return;
    const raw = this.hiddenInput.value.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 20);
    this.hiddenInput.value = raw;
    this.aliasValue = raw;
    this.errorText.setText("");
    this.refreshAliasText();
  }

  private pulseAliasBox() {
    this.aliasBox.setStrokeStyle(2, 0xc850c0);
    this.aliasHintText.setText("TAP HERE TO TYPE\nTHEN TAP RUN");
    this.time.delayedCall(180, () => {
      this.aliasBox.setStrokeStyle(2, 0x7b2d8e);
    });
  }

  private async startGame() {
    const alias = this.aliasValue.trim();
    if (!alias) {
      this.errorText.setText("enter an alias first");
      return;
    }
    if (alias.length < 2) {
      this.errorText.setText("at least 2 characters");
      return;
    }

    try {
      this.hiddenInput?.blur();
      const player = await api.registerAlias(alias);
      localStorage.setItem("mr_player", JSON.stringify(player));
      this.cleanup();
      this.scene.start("GameScene", { player });
    } catch (err) {
      this.errorText.setText("server error - try again");
      console.error(err);
    }
  }

  private cleanup() {
    if (this.keyboardHandler) {
      this.input.keyboard?.off("keydown", this.keyboardHandler);
      this.keyboardHandler = undefined;
    }
    if (this.caretTimer) {
      this.caretTimer.remove(false);
      this.caretTimer = undefined;
    }
    if (this.hiddenInput) {
      this.hiddenInput.remove();
      this.hiddenInput = undefined;
    }
  }

  shutdown() {
    this.cleanup();
  }
}
