import Phaser from "phaser";
import {
  GAME_WIDTH, GAME_HEIGHT, GROUND_Y,
  NEAR_MISS_THRESHOLD, NEAR_MISS_BONUS, ORB_SCORE_VALUE,
  DISTANCE_SCORE_MULTIPLIER, DOUBLE_JUMP_UNLOCK_DISTANCE,
} from "../config";
import { PlayerData } from "../api";
import { Player } from "../objects/Player";
import { PlatformManager } from "../objects/Platform";
import { ObstacleFactory, ObstacleSprite } from "../objects/Obstacle";
import { CollectibleManager } from "../objects/Collectible";
import { ParallaxBackground } from "../systems/ParallaxBackground";
import { DifficultyManager, ObstacleType } from "../systems/DifficultyManager";
import { AchievementManager, RunStats, loadProgress, saveProgress, updateProgress } from "../systems/AchievementManager";
import { sfx } from "../systems/SfxManager";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private platforms!: PlatformManager;
  private obstacles!: ObstacleFactory;
  private collectibles!: CollectibleManager;
  private parallax!: ParallaxBackground;
  private difficulty!: DifficultyManager;
  private achievements!: AchievementManager;

  private playerData!: PlayerData;
  private distance = 0;
  private score = 0;
  private orbsCollected = 0;
  private nearMisses = 0;
  private dashesUsed = 0;
  private wallsBroken = 0;
  private startTime = 0;
  private spawnTimer = 0;
  private shieldActive = false;
  private shieldSpawned = false;
  private runCount = 0;
  private isDead = false;

  private distText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private orbText!: Phaser.GameObjects.Text;
  private dashText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer = 0;
  private lastDistText = "";
  private lastScoreText = "";
  private lastOrbText = "";
  private lastDashText = "";
  private lastDashColor = "";
  private lastShieldText = "";
  private nearMissFlash!: Phaser.GameObjects.Rectangle;
  private heartIcons: Phaser.GameObjects.Image[] = [];
  private shieldAura!: Phaser.GameObjects.Ellipse;

  private jumpKey!: Phaser.Input.Keyboard.Key;
  private upKey!: Phaser.Input.Keyboard.Key;
  private dashKey!: Phaser.Input.Keyboard.Key;
  private pointerHandler?: (pointer: Phaser.Input.Pointer) => void;
  private doubleJumpHintShown = false;
  private dashHintShown = false;
  private isMobile = false;
  private jumpBtn?: Phaser.GameObjects.Container;
  private dashBtn?: Phaser.GameObjects.Container;

  constructor() {
    super("GameScene");
  }

  init(data: { player: PlayerData }) {
    this.playerData = data.player;
  }

  create() {
    this.distance = 0;
    this.score = 0;
    this.orbsCollected = 0;
    this.nearMisses = 0;
    this.dashesUsed = 0;
    this.wallsBroken = 0;
    this.spawnTimer = 1700;
    this.shieldActive = false;
    this.shieldSpawned = false;
    this.isDead = false;
    this.doubleJumpHintShown = false;
    this.dashHintShown = false;
    this.heartIcons = [];
    this.startTime = this.time.now;

    this.runCount++;
    const useMercy = this.runCount > 1;

    this.parallax = new ParallaxBackground(this);
    this.platforms = new PlatformManager(this);
    this.obstacles = new ObstacleFactory(this);
    this.collectibles = new CollectibleManager(this);
    this.difficulty = new DifficultyManager();
    this.difficulty.reset(useMercy);

    this.achievements = new AchievementManager();
    this.achievements.init(this.playerData.id);

    this.player = new Player(this);
    this.player.startRun();

    this.physics.add.collider(
      this.player as unknown as Phaser.Physics.Arcade.Sprite,
      this.platforms.group,
    );

    this.physics.add.overlap(
      this.player as unknown as Phaser.Physics.Arcade.Sprite,
      this.obstacles.group,
      (_, obs) => { this.handleObstacleHit(obs as unknown as ObstacleSprite); },
    );

    this.physics.add.overlap(
      this.player as unknown as Phaser.Physics.Arcade.Sprite,
      this.collectibles.group,
      (_, orb) => { this.collectOrb(orb as Phaser.GameObjects.Arc); },
    );

    this.jumpKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.dashKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);

    this.isMobile = !this.sys.game.device.os.desktop;

    if (this.isMobile) {
      this.createTouchControls();
    } else {
      this.pointerHandler = (pointer: Phaser.Input.Pointer) => {
        if (pointer.y > GAME_HEIGHT * 0.6) {
          this.doDash();
        } else {
          this.doJump();
        }
      };
      this.input.on("pointerdown", this.pointerHandler);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupInputs());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanupInputs());

    const hudStyle = { fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#c850c0" };
    this.distText = this.add.text(GAME_WIDTH - 10, 10, "0m", hudStyle)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.scoreText = this.add.text(GAME_WIDTH - 10, 26, "0", { ...hudStyle, color: "#ffffff" })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.orbText = this.add.text(10, 10, "0 orbs", { ...hudStyle, color: "#e878e0" })
      .setOrigin(0).setScrollFactor(0).setDepth(100);
    this.dashText = this.add.text(10, 28, "DOWN = DASH", {
      ...hudStyle,
      fontSize: "8px",
      color: "#88ccff",
    }).setOrigin(0).setScrollFactor(0).setDepth(100);
    this.shieldText = this.add.text(10, 66, "", {
      ...hudStyle,
      fontSize: "8px",
      color: "#66d9ff",
      stroke: "#0a2240",
      strokeThickness: 2,
    }).setOrigin(0).setScrollFactor(0).setDepth(100);

    this.toastText = this.add.text(GAME_WIDTH / 2, 60, "", {
      fontFamily: '"Press Start 2P"', fontSize: "9px", color: "#ffdd44",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

    this.nearMissFlash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xc850c0, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(99);

    for (let i = 0; i < 3; i++) {
      const heart = this.add.image(18 + i * 22, 50, "heart")
        .setOrigin(0, 0.5)
        .setScale(0.8)
        .setScrollFactor(0)
        .setDepth(100);
      this.heartIcons.push(heart);
    }

    this.shieldAura = this.add.ellipse(this.player.x, this.player.y - 6, 58, 88, 0x66d9ff, 0.12)
      .setStrokeStyle(4, 0x8de6ff, 0.95)
      .setDepth(9)
      .setVisible(false);
    this.tweens.add({
      targets: this.shieldAura,
      scaleX: { from: 0.94, to: 1.05 },
      scaleY: { from: 0.94, to: 1.08 },
      alpha: { from: 0.45, to: 0.85 },
      duration: 550,
      yoyo: true,
      repeat: -1,
    });

    this.updateHearts();
    this.updateShieldVisuals();
    if (this.isMobile) {
      this.time.delayedCall(600, () => this.showToast("TAP JUMP & DASH"));
    } else {
      this.time.delayedCall(600, () => this.showToast("SPACE / UP TO JUMP"));
      this.time.delayedCall(2400, () => this.showToast("DOWN TO DASH"));
    }

    if (!this.registry.get("musicPlaying")) {
      try {
        const music = this.sound.add("music", { loop: true, volume: 0.3 });
        music.play();
        this.registry.set("musicPlaying", true);
      } catch (_) { /* audio may not load */ }
    }
  }

  update(_time: number, delta: number) {
    if (this.isDead) return;

    if (this.player.hasFallenOffScreen()) {
      this.die();
      return;
    }

    if (!this.player.isAlive()) return;

    this.difficulty.update(delta, this.distance, this.orbsCollected);
    const speed = this.difficulty.getSpeed();
    this.distance += speed * (delta / 1000) * DISTANCE_SCORE_MULTIPLIER;

    if (Phaser.Input.Keyboard.JustDown(this.jumpKey) || Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.doJump();
    }
    if (Phaser.Input.Keyboard.JustDown(this.dashKey)) {
      this.doDash();
    }

    this.player.updatePlayer(delta);
    this.updateShieldVisuals();
    this.parallax.update(speed, delta);
    this.platforms.update(speed, delta);
    this.obstacles.update(speed);
    this.collectibles.update(speed, delta);

    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      const screenTravelInterval = (GAME_WIDTH / speed) * 1000;
      this.spawnTimer = screenTravelInterval * Phaser.Math.FloatBetween(0.58, 0.9);
      this.spawnEncounter(speed);
    }

    if (!this.shieldSpawned && this.distance > 500 && Math.random() < 0.001) {
      this.collectibles.spawnShield(speed);
      this.shieldSpawned = true;
    }

    this.checkNearMisses();
    this.updateScore();
    this.updateHUD();
    this.showProgressHints();
    this.updateToast(delta);
  }

  private cleanupInputs() {
    if (this.pointerHandler) {
      this.input.off("pointerdown", this.pointerHandler);
      this.pointerHandler = undefined;
    }
  }

  private createTouchControls() {
    const btnW = 100;
    const btnH = 56;
    const pad = 16;
    const y = GAME_HEIGHT - btnH / 2 - pad;

    // Jump button - left side
    const jumpBg = this.add.rectangle(0, 0, btnW, btnH, 0x7b2d8e, 0.5)
      .setStrokeStyle(2, 0xc850c0, 0.7);
    const jumpLabel = this.add.text(0, 0, "JUMP", {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#ffffff",
    }).setOrigin(0.5);
    this.jumpBtn = this.add.container(btnW / 2 + pad, y, [jumpBg, jumpLabel])
      .setScrollFactor(0).setDepth(200).setAlpha(0.7);
    jumpBg.setInteractive();
    jumpBg.on("pointerdown", () => {
      this.doJump();
      this.jumpBtn?.setAlpha(1);
    });
    jumpBg.on("pointerup", () => this.jumpBtn?.setAlpha(0.7));
    jumpBg.on("pointerout", () => this.jumpBtn?.setAlpha(0.7));

    // Dash button - right side
    const dashBg = this.add.rectangle(0, 0, btnW, btnH, 0x2d5e8e, 0.5)
      .setStrokeStyle(2, 0x88ccff, 0.7);
    const dashLabel = this.add.text(0, 0, "DASH", {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#ffffff",
    }).setOrigin(0.5);
    this.dashBtn = this.add.container(GAME_WIDTH - btnW / 2 - pad, y, [dashBg, dashLabel])
      .setScrollFactor(0).setDepth(200).setAlpha(0.7);
    dashBg.setInteractive();
    dashBg.on("pointerdown", () => {
      this.doDash();
      this.dashBtn?.setAlpha(1);
    });
    dashBg.on("pointerup", () => this.dashBtn?.setAlpha(0.7));
    dashBg.on("pointerout", () => this.dashBtn?.setAlpha(0.7));
  }

  private doJump() {
    if (this.player.jump(this.distance)) {
      if (this.player.didDoubleJump()) {
        sfx.doubleJump();
      } else {
        sfx.jump();
      }
    }
  }

  private doDash() {
    if (this.player.dash()) {
      this.dashesUsed++;
      sfx.dash();
    }
  }

  private handleObstacleHit(obs: ObstacleSprite) {
    if (obs.obstacleType === "wall" && this.player.isDashActive()) {
      this.wallsBroken++;
      obs.destroy();
      sfx.wallBreak();
      this.showToast("WALL BROKEN!");
      return;
    }

    if (this.player.isDashActive()) return;

    if (this.shieldActive) {
      this.shieldActive = false;
      obs.destroy();
      sfx.shield();
      this.updateHearts();
      this.showToast("SHIELD!");
      return;
    }

    const hit = this.player.takeDamage();
    if (!hit.damaged) return;

    this.cameras.main.shake(200, 0.01);
    this.updateHearts();

    if (hit.defeated) {
      sfx.die();
      this.die();
      return;
    }

    sfx.hit();
    obs.destroy();
    this.showToast(`${hit.remainingHealth} HP LEFT`);
  }

  private collectOrb(orb: Phaser.GameObjects.Arc | Phaser.GameObjects.Polygon) {
    const isShield = orb instanceof Phaser.GameObjects.Polygon;
    if (isShield) {
      this.shieldActive = true;
      sfx.shield();
      this.showToast("SHIELD ACTIVE!");
    } else {
      this.orbsCollected++;
      sfx.orb();
    }
    orb.destroy();
  }

  private spawnEncounter(speed: number) {
    const laneLow = GROUND_Y - 54;
    const laneMid = GROUND_Y - 112;
    const laneHigh = GROUND_Y - 172;
    const rewardStart = GAME_WIDTH + 56;

    if (Math.random() < 0.28) {
      const patternRoll = Math.random();
      if (patternRoll < 0.34) {
        this.collectibles.spawnLine(rewardStart, laneMid, 7);
      } else if (patternRoll < 0.67) {
        this.collectibles.spawnWave(rewardStart, laneMid, 8, 34, 28);
      } else {
        this.collectibles.spawnStair(rewardStart, laneLow, 6, 38, -20);
      }
      return;
    }

    const firstType = this.difficulty.pickObstacle();

    if (firstType === "gap") {
      const gapWidth = 88 + Math.random() * 56;
      this.platforms.startGap(gapWidth);
      this.collectibles.spawnGapTrail(GAME_WIDTH + 12, gapWidth);
      if (this.distance < 250) this.showToast("JUMP THE GAPS");
      return;
    }

    const spawned = this.obstacles.spawn(firstType, speed);

    switch (firstType) {
      case "fire":
        this.collectibles.spawnArc(rewardStart, 210, laneLow, laneHigh, 7);
        break;
      case "lightning":
        this.collectibles.spawnStair(rewardStart, laneHigh, 6, 36, 16);
        break;
      case "saw": {
        const sawHigh = !!spawned && spawned.y < GROUND_Y - 60;
        if (sawHigh) {
          this.collectibles.spawnLine(rewardStart, laneLow, 6);
        } else {
          this.collectibles.spawnWave(rewardStart, laneHigh, 7, 34, 16);
        }
        break;
      }
      case "wall":
        this.collectibles.spawnLine(rewardStart + 40, laneLow, 5, 34);
        break;
      default:
        break;
    }

    if (this.distance < 1400 || Math.random() < 0.82) return;

    const options = this.difficulty.getAvailableObstacles()
      .filter((type) => type !== "gap" && type !== "wall" && type !== firstType);
    const secondType = Phaser.Utils.Array.GetRandom(options) as ObstacleType;
    this.obstacles.spawn(secondType, speed, GAME_WIDTH * 0.38);
  }

  private checkNearMisses() {
    for (const child of this.obstacles.group.getChildren()) {
      const obs = child as ObstacleSprite;
      if (obs.scored) continue;

      if (obs.x < this.player.x - 10 && obs.x > this.player.x - 40) {
        const dy = Math.abs(obs.y - this.player.y);
        const dx = Math.abs(obs.x - this.player.x);
        if (dy < 60 && dx < NEAR_MISS_THRESHOLD + 20) {
          obs.scored = true;
          this.nearMisses++;
          this.score += NEAR_MISS_BONUS;
          this.nearMissFlash.setAlpha(0.15);
          this.tweens.killTweensOf(this.nearMissFlash);
          this.tweens.add({
            targets: this.nearMissFlash,
            alpha: 0,
            duration: 300,
          });
          sfx.nearMiss();
          this.showToast("NEAR MISS! +" + NEAR_MISS_BONUS);
        }
      }
    }
  }

  private updateScore() {
    this.score = Math.floor(this.distance)
      + this.orbsCollected * ORB_SCORE_VALUE
      + this.nearMisses * NEAR_MISS_BONUS;
  }

  private updateHUD() {
    const dist = Math.floor(this.distance) + "m";
    if (dist !== this.lastDistText) { this.distText.setText(dist); this.lastDistText = dist; }

    const sc = String(this.score);
    if (sc !== this.lastScoreText) { this.scoreText.setText(sc); this.lastScoreText = sc; }

    const orb = this.orbsCollected + " orbs";
    if (orb !== this.lastOrbText) { this.orbText.setText(orb); this.lastOrbText = orb; }

    const shield = this.shieldActive ? "SHIELD ON" : "";
    if (shield !== this.lastShieldText) { this.shieldText.setText(shield); this.lastShieldText = shield; }

    let dashLabel: string;
    let dashColor: string;
    if (this.dashesUsed === 0) {
      dashLabel = this.isMobile ? "TAP DASH" : "DOWN = DASH";
      dashColor = "#88ccff";
    } else {
      dashLabel = this.player.isDashReady() ? "DASH READY" : "DASH COOLING";
      dashColor = this.player.isDashReady() ? "#88ccff" : "#557799";
    }
    if (dashLabel !== this.lastDashText) { this.dashText.setText(dashLabel); this.lastDashText = dashLabel; }
    if (dashColor !== this.lastDashColor) { this.dashText.setColor(dashColor); this.lastDashColor = dashColor; }
  }

  private updateHearts() {
    const health = this.player.getHealth();
    this.heartIcons.forEach((heart, index) => {
      heart.setAlpha(index < health ? 1 : 0.2);
      heart.setTint(this.shieldActive ? 0x88ccff : 0xffffff);
    });
  }

  private updateShieldVisuals() {
    if (!this.shieldAura) return;

    this.shieldAura.setPosition(this.player.x, this.player.y - 8);
    this.shieldAura.setVisible(this.shieldActive);
  }

  private showProgressHints() {
    if (!this.doubleJumpHintShown && this.distance >= DOUBLE_JUMP_UNLOCK_DISTANCE) {
      this.doubleJumpHintShown = true;
      this.showToast("DOUBLE JUMP ONLINE");
    }

    if (!this.dashHintShown && this.distance >= 700) {
      this.dashHintShown = true;
      this.showToast("DASH THROUGH WALLS");
    }
  }

  private showToast(msg: string) {
    this.toastText.setText(msg).setAlpha(1);
    this.toastTimer = 1500;
  }

  private updateToast(delta: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= delta;
      if (this.toastTimer <= 0) {
        this.tweens.killTweensOf(this.toastText);
        this.tweens.add({ targets: this.toastText, alpha: 0, duration: 300 });
      }
    }

    const toast = this.achievements.popToast();
    if (toast) this.showToast("UNLOCKED: " + toast);
  }

  private async die() {
    if (this.isDead) return;
    this.isDead = true;
    this.player.die();
    this.obstacles.stopAll();
    this.collectibles.stopAll();

    const duration = (this.time.now - this.startTime) / 1000;
    const runStats: RunStats = {
      distance: Math.floor(this.distance),
      orbsCollected: this.orbsCollected,
      nearMisses: this.nearMisses,
      dashesUsed: this.dashesUsed,
      wallsBroken: this.wallsBroken,
      score: this.score,
      reachedMaxSpeed: this.difficulty.hasReachedMaxSpeed(),
      damageTaken: this.player.damageTaken,
    };

    const prev = loadProgress();
    saveProgress(updateProgress(prev, runStats));

    const newAchievements = await this.achievements.checkAll(runStats);

    this.time.delayedCall(1500, () => {
      // Snapshot the current frame as a texture for the game over background
      if (this.textures.exists("gameover-snapshot")) {
        this.textures.remove("gameover-snapshot");
      }
      this.renderer.snapshot((image) => {
        this.textures.addImage("gameover-snapshot", image as HTMLImageElement);
        this.scene.start("GameOverScene", {
          player: this.playerData,
          score: this.score,
          distance: Math.floor(this.distance),
          orbsCollected: this.orbsCollected,
          nearMisses: this.nearMisses,
          dashesUsed: this.dashesUsed,
          wallsBroken: this.wallsBroken,
          duration,
          newAchievements,
        });
      });
    });
  }
}
