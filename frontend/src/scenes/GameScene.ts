import Phaser from "phaser";
import {
  GAME_WIDTH, GAME_HEIGHT, GROUND_Y,
  NEAR_MISS_THRESHOLD, NEAR_MISS_BONUS, ORB_SCORE_VALUE,
  DISTANCE_SCORE_MULTIPLIER, DOUBLE_JUMP_UNLOCK_DISTANCE,
  MILESTONE_SCORE_BONUS,
} from "../config";
import { getPlayerIdentifier, PlayerData, shortenWalletAddress } from "../api";
import { Player } from "../objects/Player";
import { PlatformManager } from "../objects/Platform";
import { ObstacleFactory, ObstacleSprite } from "../objects/Obstacle";
import { CollectibleManager } from "../objects/Collectible";
import { ParallaxBackground } from "../systems/ParallaxBackground";
import { DifficultyManager, ObstacleType } from "../systems/DifficultyManager";
import { AchievementManager, RunStats, loadProgress, saveProgress, updateProgress } from "../systems/AchievementManager";
import { sfx } from "../systems/SfxManager";
import { ZoneManager } from "../systems/ZoneManager";
import { addOrbs } from "../systems/CharacterStore";
import { getCharacter } from "../systems/CharacterRegistry";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private platforms!: PlatformManager;
  private obstacles!: ObstacleFactory;
  private collectibles!: CollectibleManager;
  private parallax!: ParallaxBackground;
  private difficulty!: DifficultyManager;
  private achievements!: AchievementManager;
  private zoneManager!: ZoneManager;
  private milestoneFlash!: Phaser.GameObjects.Rectangle;

  private playerData!: PlayerData;
  private characterId = "default";
  private activeBoosts: string[] = [];
  private magnetActive = false;
  private magnetTimer = 0;
  private speedBoostActive = false;
  private speedBoostText!: Phaser.GameObjects.Text;
  private magnetText!: Phaser.GameObjects.Text;
  private walletText!: Phaser.GameObjects.Text;
  private distance = 0;
  private score = 0;
  private orbsCollected = 0;
  private orbsRaw = 0;
  private nearMisses = 0;
  private dashesUsed = 0;
  private wallsBroken = 0;
  private startTime = 0;
  private spawnTimer = 0;
  private shieldActive = false;
  private shieldSpawned = false;
  private magnetSpawned = false;
  private lastPowerupDistance = 0;
  private runCount = 0;
  private isDead = false;
  private hasShieldPerk = false;
  private shieldRegenTimer = 0;
  private hasExtraHpPerk = false;
  private orbsSinceHeal = 0;

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
  private paused = false;
  private pauseOverlay?: Phaser.GameObjects.Container;
  private escKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("GameScene");
  }

  init(data: { player: PlayerData; characterId?: string; activeBoosts?: string[] }) {
    this.playerData = data.player;
    this.characterId = data.characterId || "default";
    this.activeBoosts = data.activeBoosts || [];
  }

  create() {
    this.distance = 0;
    this.score = 0;
    this.orbsCollected = 0;
    this.orbsRaw = 0;
    this.nearMisses = 0;
    this.dashesUsed = 0;
    this.wallsBroken = 0;
    this.spawnTimer = 1700;
    const charDef = getCharacter(this.characterId);
    this.hasShieldPerk = charDef.perk === "starter_shield";
    this.shieldActive = this.hasShieldPerk;
    this.shieldRegenTimer = 0;
    this.hasExtraHpPerk = charDef.perk === "extra_hp";
    this.orbsSinceHeal = 0;
    this.shieldSpawned = false;
    this.magnetSpawned = false;
    this.lastPowerupDistance = 0;
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
    this.speedBoostActive = this.activeBoosts.includes("speed_boost");
    this.magnetActive = this.activeBoosts.includes("orb_magnet");
    this.magnetTimer = this.magnetActive ? 60000 : 0;

    this.difficulty = new DifficultyManager();
    this.difficulty.reset(useMercy, this.speedBoostActive);
    this.zoneManager = new ZoneManager();

    this.achievements = new AchievementManager();
    this.achievements.init(this.playerData.id, this.playerData.network_id);

    this.player = new Player(this, this.characterId);
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
      (_, orb) => { this.collectOrb(orb as Phaser.GameObjects.Arc | Phaser.GameObjects.Polygon | Phaser.GameObjects.Star); },
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

    const hudBottom = GAME_HEIGHT - 10;
    const hudStyle = { fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#c850c0" };
    this.distText = this.add.text(GAME_WIDTH - 10, hudBottom, "0m", hudStyle)
      .setOrigin(1, 1).setScrollFactor(0).setDepth(100);
    this.scoreText = this.add.text(GAME_WIDTH - 10, hudBottom - 16, "0", { ...hudStyle, color: "#ffffff" })
      .setOrigin(1, 1).setScrollFactor(0).setDepth(100);
    this.orbText = this.add.text(10, hudBottom, "0 orbs", { ...hudStyle, color: "#e878e0" })
      .setOrigin(0, 1).setScrollFactor(0).setDepth(100);
    this.dashText = this.add.text(10, hudBottom - 16, "DOWN = ATTACK", {
      ...hudStyle,
      fontSize: "8px",
      color: "#88ccff",
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(100);
    this.shieldText = this.add.text(10, hudBottom - 32, "", {
      ...hudStyle,
      fontSize: "8px",
      color: "#66d9ff",
      stroke: "#0a2240",
      strokeThickness: 2,
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(100);

    this.speedBoostText = this.add.text(GAME_WIDTH - 10, hudBottom - 32, "", {
      ...hudStyle,
      fontSize: "8px",
      color: "#00e5ff",
      stroke: "#003344",
      strokeThickness: 2,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(100);

    this.magnetText = this.add.text(GAME_WIDTH - 10, hudBottom - 46, "", {
      ...hudStyle,
      fontSize: "8px",
      color: "#ff44ff",
      stroke: "#330033",
      strokeThickness: 2,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(100);

    const playerIdentifier = getPlayerIdentifier(this.playerData);
    const walletLabel = this.playerData.wallet_address
      ? shortenWalletAddress(playerIdentifier)
      : playerIdentifier;
    this.walletText = this.add.text(10, 12, walletLabel, {
      fontFamily: '"Press Start 2P"',
      fontSize: "8px",
      color: "#ffdd44",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(200);

    this.toastText = this.add.text(GAME_WIDTH / 2, 60, "", {
      fontFamily: '"Press Start 2P"', fontSize: "9px", color: "#ffdd44",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

    this.nearMissFlash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xc850c0, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(99);
    this.milestoneFlash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(98);

    const maxHp = getCharacter(this.characterId).perk === "extra_hp" ? 4 : 3;
    for (let i = 0; i < maxHp; i++) {
      const heart = this.add.image(18 + i * 22, hudBottom - 46, "heart")
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

    // Pause button
    this.paused = false;
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    const pauseBtn = this.add.text(GAME_WIDTH - 12, 14, "II", {
      fontFamily: '"Press Start 2P"', fontSize: "12px", color: "#ffffff",
      stroke: "#000000", strokeThickness: 3,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(200).setAlpha(0.5)
      .setInteractive({ useHandCursor: true });
    pauseBtn.on("pointerover", () => pauseBtn.setAlpha(1));
    pauseBtn.on("pointerout", () => pauseBtn.setAlpha(0.5));
    pauseBtn.on("pointerdown", () => this.togglePause());

    this.updateHearts();
    this.updateShieldVisuals();
    if (this.isMobile) {
      this.time.delayedCall(600, () => this.showToast("TAP JUMP & ATTACK"));
    } else {
      this.time.delayedCall(600, () => this.showToast("SPACE / UP TO JUMP"));
      this.time.delayedCall(2400, () => this.showToast("DOWN TO ATTACK"));
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
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.togglePause();
    }
    if (this.paused || this.isDead) return;

    if (this.player.hasFallenOffScreen()) {
      this.die();
      return;
    }

    if (!this.player.isAlive()) return;

    this.difficulty.update(delta, this.distance, this.orbsCollected);
    const speed = this.difficulty.getSpeed();
    this.distance += speed * (delta / 1000) * DISTANCE_SCORE_MULTIPLIER;

    // Zone progression
    this.zoneManager.update(this.distance);
    const palette = this.zoneManager.getBlendedPalette();
    this.parallax.applyZonePalette(palette);
    this.platforms.setTint(palette.platformTint);
    this.collectibles.setOrbStyle(palette.orbColor, palette.orbStroke);

    const zoneName = this.zoneManager.checkZoneEnter();
    if (zoneName) {
      this.showToast("ENTERING: " + zoneName);
      sfx.zoneEnter();
    }

    const milestone = this.zoneManager.checkMilestones(this.distance);
    if (milestone) {
      this.celebrateMilestone(milestone);
    }

    if (Phaser.Input.Keyboard.JustDown(this.jumpKey) || Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.doJump();
    }
    if (Phaser.Input.Keyboard.JustDown(this.dashKey)) {
      this.doDash();
    }

    this.player.updatePlayer(delta);
    this.updateShieldVisuals();

    // Shield regen for ninja perk
    if (this.shieldRegenTimer > 0) {
      this.shieldRegenTimer -= delta;
      if (this.shieldRegenTimer <= 0) {
        this.shieldRegenTimer = 0;
        this.shieldActive = true;
        this.updateHearts();
        sfx.shield();
        this.showToast("SHIELD REGENERATED!");
      }
    }
    this.parallax.update(speed, delta);
    this.platforms.update(speed, delta);
    this.obstacles.update(speed);
    this.collectibles.update(speed, delta);

    // Orb magnet effect
    if (this.magnetActive && this.magnetTimer > 0) {
      this.magnetTimer -= delta;
      if (this.magnetTimer <= 0) {
        this.magnetActive = false;
        this.magnetTimer = 0;
      } else {
        for (const child of this.collectibles.group.getChildren()) {
          if (!(child instanceof Phaser.GameObjects.Arc)) continue;
          const orb = child as Phaser.GameObjects.Arc;
          const dx = this.player.x - orb.x;
          const dy = this.player.y - orb.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200 && dist > 0) {
            const body = orb.body as Phaser.Physics.Arcade.Body;
            const strength = 1600 * (1 - dist / 200);
            body.setVelocity(
              body.velocity.x + (dx / dist) * strength * (delta / 1000),
              body.velocity.y + (dy / dist) * strength * (delta / 1000),
            );
          }
        }
      }
    }

    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      const screenTravelInterval = (GAME_WIDTH / speed) * 1000;
      this.spawnTimer = screenTravelInterval * Phaser.Math.FloatBetween(0.58, 0.9);
      this.spawnEncounter(speed);
    }

    const powerupClearance = this.distance - this.lastPowerupDistance > 600;

    if (!this.shieldSpawned && this.distance > 500 && powerupClearance && Math.random() < 0.001) {
      this.collectibles.spawnShield(speed);
      this.shieldSpawned = true;
      this.lastPowerupDistance = this.distance;
    }

    if (!this.magnetSpawned && !this.magnetActive && this.distance > 800 && powerupClearance && Math.random() < 0.0008) {
      this.collectibles.spawnMagnet(speed);
      this.magnetSpawned = true;
      this.lastPowerupDistance = this.distance;
    }

    this.checkNearMisses();
    this.updateScore();
    this.updateHUD();
    this.showProgressHints();
    this.updateToast(delta);
  }

  private togglePause() {
    if (this.isDead) return;
    if (this.paused) {
      this.paused = false;
      this.physics.resume();
      this.tweens.resumeAll();
      if (this.pauseOverlay) {
        this.pauseOverlay.destroy();
        this.pauseOverlay = undefined;
      }
    } else {
      this.paused = true;
      this.physics.pause();
      this.tweens.pauseAll();
      this.showPauseOverlay();
    }
  }

  private showPauseOverlay() {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.pauseOverlay = this.add.container(0, 0).setScrollFactor(0).setDepth(300);

    const dimBg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12, 0.7).setOrigin(0);
    this.pauseOverlay.add(dimBg);

    const title = this.add.text(cx, cy - 50, "PAUSED", {
      fontFamily: '"Press Start 2P"', fontSize: "18px", color: "#c850c0",
      stroke: "#7b2d8e", strokeThickness: 3,
    }).setOrigin(0.5);
    this.pauseOverlay.add(title);

    // Resume button
    const resumeBg = this.add.rectangle(cx, cy + 10, 160, 34, 0x7b2d8e)
      .setInteractive({ useHandCursor: true });
    const resumeLabel = this.add.text(cx, cy + 10, "RESUME", {
      fontFamily: '"Press Start 2P"', fontSize: "11px", color: "#ffffff",
    }).setOrigin(0.5);
    resumeBg.on("pointerover", () => resumeBg.setFillStyle(0xc850c0));
    resumeBg.on("pointerout", () => resumeBg.setFillStyle(0x7b2d8e));
    resumeBg.on("pointerdown", () => this.togglePause());
    this.pauseOverlay.add(resumeBg);
    this.pauseOverlay.add(resumeLabel);

    // Quit button
    const quitBg = this.add.rectangle(cx, cy + 55, 120, 26, 0x2a2a3e)
      .setInteractive({ useHandCursor: true });
    const quitLabel = this.add.text(cx, cy + 55, "QUIT", {
      fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#aaaacc",
    }).setOrigin(0.5);
    quitBg.on("pointerover", () => quitBg.setFillStyle(0x4a4a5e));
    quitBg.on("pointerout", () => quitBg.setFillStyle(0x2a2a3e));
    quitBg.on("pointerdown", () => {
      this.physics.resume();
      this.tweens.resumeAll();
      this.scene.start("MenuScene");
    });
    this.pauseOverlay.add(quitBg);
    this.pauseOverlay.add(quitLabel);
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
    const dashLabel = this.add.text(0, 0, "ATTACK", {
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
      if (this.hasShieldPerk) this.shieldRegenTimer = 30000;
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

  private collectOrb(orb: Phaser.GameObjects.Arc | Phaser.GameObjects.Polygon | Phaser.GameObjects.Star) {
    if (orb.getData("isMagnet")) {
      this.magnetActive = true;
      this.magnetTimer = 15000;
      sfx.shield();
      this.showToast("MAGNET PICKUP!");
      orb.destroy();
      return;
    }
    const isShield = orb instanceof Phaser.GameObjects.Polygon;
    if (isShield) {
      this.shieldActive = true;
      sfx.shield();
      this.showToast("SHIELD ACTIVE!");
    } else {
      const mult = this.zoneManager.getOrbMultiplier();
      this.orbsRaw += mult;
      this.orbsCollected = Math.floor(this.orbsRaw);
      sfx.orb();
      this.showFloatingOrbText(orb.x, orb.y, mult);

      if (this.hasExtraHpPerk) {
        this.orbsSinceHeal++;
        if (this.orbsSinceHeal >= 100) {
          this.orbsSinceHeal = 0;
          if (this.player.heal()) {
            this.updateHearts();
            sfx.shield();
            this.showToast("HP RESTORED!");
          }
        }
      }
    }
    orb.destroy();
  }

  private showFloatingOrbText(x: number, y: number, amount: number) {
    const label = "+" + amount;
    const txt = this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"',
      fontSize: amount > 1 ? "10px" : "8px",
      color: amount > 1 ? "#ffdd44" : "#e878e0",
      stroke: "#000000",
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(100);

    this.tweens.add({
      targets: txt,
      y: y - 40,
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: "Power2",
      onComplete: () => txt.destroy(),
    });
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
    this.score = Math.floor(this.distance * 0.04)
      + this.orbsCollected * ORB_SCORE_VALUE
      + this.nearMisses * NEAR_MISS_BONUS;
  }

  private updateHUD() {
    const dist = Math.floor(this.distance * 0.04) + "m";
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
      dashLabel = this.isMobile ? "TAP ATTACK" : "DOWN = ATTACK";
      dashColor = "#88ccff";
    } else {
      dashLabel = this.player.isDashReady() ? "ATTACK READY" : "ATTACK COOLING";
      dashColor = this.player.isDashReady() ? "#88ccff" : "#557799";
    }
    if (dashLabel !== this.lastDashText) { this.dashText.setText(dashLabel); this.lastDashText = dashLabel; }
    if (dashColor !== this.lastDashColor) { this.dashText.setColor(dashColor); this.lastDashColor = dashColor; }

    // Boost HUD indicators
    const boostRemaining = this.difficulty.getSpeedBoostRemaining();
    if (boostRemaining > 0) {
      const secs = Math.ceil(boostRemaining / 1000);
      this.speedBoostText.setText(`SPEED+ 0:${String(secs).padStart(2, "0")}`).setAlpha(1);
    } else if (this.speedBoostActive) {
      this.speedBoostActive = false;
      this.tweens.add({ targets: this.speedBoostText, alpha: 0, duration: 500 });
    }

    if (this.magnetActive && this.magnetTimer > 0) {
      const secs = Math.ceil(this.magnetTimer / 1000);
      this.magnetText.setText(`MAGNET 0:${String(secs).padStart(2, "0")}`).setAlpha(1);
    } else if (this.magnetText.alpha > 0 && !this.magnetActive) {
      this.tweens.add({ targets: this.magnetText, alpha: 0, duration: 500 });
    }
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
      this.showToast("ATTACK THROUGH WALLS");
    }
  }

  private celebrateMilestone(displayMeters: number) {
    this.score += MILESTONE_SCORE_BONUS;
    sfx.milestone();
    this.showToast(displayMeters + "m");

    // Screen flash
    this.milestoneFlash.setAlpha(0.15);
    this.tweens.killTweensOf(this.milestoneFlash);
    this.tweens.add({
      targets: this.milestoneFlash,
      alpha: 0,
      duration: 400,
    });
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
    const displayDistance = Math.floor(this.distance * 0.04);
    const runStats: RunStats = {
      distance: displayDistance,
      orbsCollected: this.orbsCollected,
      nearMisses: this.nearMisses,
      dashesUsed: this.dashesUsed,
      wallsBroken: this.wallsBroken,
      score: this.score,
      reachedMaxSpeed: this.difficulty.hasReachedMaxSpeed(),
      damageTaken: this.player.damageTaken,
    };

    const netId = this.playerData.network_id;
    const prev = loadProgress(netId);
    saveProgress(updateProgress(prev, runStats), netId);
    addOrbs(this.orbsCollected);

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
          characterId: this.characterId,
          score: this.score,
          distance: displayDistance,
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
