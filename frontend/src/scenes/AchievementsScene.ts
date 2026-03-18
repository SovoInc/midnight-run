import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { api, PlayerData } from "../api";
import { DEFINITIONS, PlayerProgress } from "../systems/AchievementManager";

interface AchievementsData {
  player: PlayerData;
  returnScene: string;
  returnData?: Record<string, unknown>;
}

export class AchievementsScene extends Phaser.Scene {
  private playerData!: PlayerData;
  private returnScene!: string;
  private returnData?: Record<string, unknown>;

  constructor() {
    super("AchievementsScene");
  }

  init(data: AchievementsData) {
    this.playerData = data.player;
    this.returnScene = data.returnScene;
    this.returnData = data.returnData;
  }

  async create() {
    const cx = GAME_WIDTH / 2;
    const stk = { stroke: "#000000", strokeThickness: 3 };
    const goBack = () => {
      this.scene.start(this.returnScene, this.returnData ?? { player: this.playerData });
    };

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12).setOrigin(0).setDepth(0);

    // Fixed header bar (won't scroll)
    const headerH = 40;
    this.add.rectangle(0, 0, GAME_WIDTH, headerH, 0x0a0a12).setOrigin(0).setDepth(10).setScrollFactor(0);
    this.add.text(cx, headerH / 2, "ACHIEVEMENTS", {
      fontFamily: '"Press Start 2P"', fontSize: "14px", color: "#ffdd44",
      stroke: "#7b2d8e", strokeThickness: 3,
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    const backBg = this.add.rectangle(36, headerH / 2, 56, 26, 0x7b2d8e)
      .setInteractive({ useHandCursor: true }).setDepth(10).setScrollFactor(0);
    this.add.text(36, headerH / 2, "BACK", {
      fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#ffffff", ...stk,
    }).setOrigin(0.5).setDepth(10).setScrollFactor(0);

    backBg.on("pointerover", () => backBg.setFillStyle(0xc850c0));
    backBg.on("pointerout", () => backBg.setFillStyle(0x7b2d8e));
    backBg.on("pointerdown", goBack);
    this.input.keyboard!.once("keydown-ESC", goBack);

    // Scrollable content
    let unlocked: Set<string> = new Set();
    try {
      const existing = await api.getPlayerAchievements(this.playerData.id);
      for (const a of existing) unlocked.add(a.achievement_key);
    } catch {
      // offline
    }

    let progress: PlayerProgress = {
      totalDistance: 0, totalOrbs: 0, totalDashes: 0, totalRuns: 0,
      bestScore: 0, bestDistance: 0, bestNearMisses: 0, bestWallsBroken: 0,
      maxSpeedReached: false, bestNoDamageDistance: 0,
    };
    try {
      const server = await api.getPlayerStats(this.playerData.id);
      progress = {
        totalRuns: server.total_runs,
        totalDistance: server.total_distance,
        totalOrbs: server.total_orbs,
        totalDashes: server.total_dashes,
        bestScore: server.best_score,
        bestDistance: server.best_distance,
        bestNearMisses: server.best_near_misses,
        bestWallsBroken: server.best_walls_broken,
        bestNoDamageDistance: server.best_no_damage_distance,
        maxSpeedReached: server.max_speed_reached,
      };
    } catch {
      // offline — show zeroes
    }

    for (const def of DEFINITIONS) {
      const prog = def.progress(progress);
      if (prog.current >= prog.target) unlocked.add(def.key);
    }

    const contentTop = headerH + 12;
    const countText = `${unlocked.size} / ${DEFINITIONS.length}`;
    this.add.text(cx, contentTop, countText, {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#aa88cc", ...stk,
    }).setOrigin(0.5);

    this.add.text(cx, contentTop + 18, `${progress.totalRuns} run${progress.totalRuns === 1 ? "" : "s"}`, {
      fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#7766aa", ...stk,
    }).setOrigin(0.5);

    const rowHeight = 44;
    const barWidth = GAME_WIDTH - 80;
    const barLeft = 40;
    const rowsTop = contentTop + 38;

    DEFINITIONS.forEach((def, i) => {
      const y = rowsTop + i * rowHeight;
      const prog = def.progress(progress);
      const ratio = Math.min(prog.current / prog.target, 1);
      const isUnlocked = unlocked.has(def.key) || ratio >= 1;

      this.add.rectangle(cx, y + 6, GAME_WIDTH - 30, rowHeight - 2, isUnlocked ? 0x1a1a2e : 0x0f0f1a, 0.7)
        .setOrigin(0.5);

      const icon = isUnlocked ? "\u2605" : "\u2606";
      const iconColor = isUnlocked ? "#ffdd44" : "#666688";
      const nameColor = isUnlocked ? "#ffffff" : "#bbbbcc";

      this.add.text(24, y - 4, icon, {
        fontFamily: '"Press Start 2P"', fontSize: "12px", color: iconColor, ...stk,
      }).setOrigin(0, 0.5);

      this.add.text(46, y - 4, def.name, {
        fontFamily: '"Press Start 2P"', fontSize: "9px", color: nameColor, ...stk,
      }).setOrigin(0, 0.5);

      if (isUnlocked) {
        this.add.text(46, y + 12, "Completed", {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#77cc77", ...stk,
        }).setOrigin(0, 0.5);
      } else {
        this.add.text(46, y + 10, def.hint, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#9999bb", ...stk,
        }).setOrigin(0, 0.5);

        const barY = y + 22;
        this.add.rectangle(barLeft, barY, barWidth, 6, 0x333344)
          .setOrigin(0, 0.5);

        if (ratio > 0) {
          const fillWidth = Math.max(barWidth * ratio, 2);
          const fillColor = ratio >= 1 ? 0x66aa66 : 0xc850c0;
          this.add.rectangle(barLeft, barY, fillWidth, 6, fillColor)
            .setOrigin(0, 0.5);
        }

        const progLabel = this.formatProgress(prog.current, prog.target);
        this.add.text(GAME_WIDTH - 16, y - 4, progLabel, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#aa88cc", ...stk,
        }).setOrigin(1, 0.5);
      }
    });

    // Enable scrolling if content overflows
    const contentBottom = rowsTop + DEFINITIONS.length * rowHeight + 16;
    if (contentBottom > GAME_HEIGHT) {
      const cam = this.cameras.main;
      cam.setBounds(0, 0, GAME_WIDTH, contentBottom);
      // Scroll starts below the fixed header
      cam.setScroll(0, 0);

      let scrollY = 0;
      const maxScroll = contentBottom - GAME_HEIGHT;
      this.input.on("wheel", (_p: unknown, _gx: unknown, _gy: unknown, _gz: unknown, _d: unknown, dy: number) => {
        scrollY = Phaser.Math.Clamp(scrollY + dy * 0.5, 0, maxScroll);
        cam.setScroll(0, scrollY);
      });

      // Touch drag scrolling
      let dragStartY = 0;
      let dragScrollY = 0;
      this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
        dragStartY = p.y;
        dragScrollY = scrollY;
      });
      this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
        if (!p.isDown) return;
        const delta = dragStartY - p.y;
        scrollY = Phaser.Math.Clamp(dragScrollY + delta, 0, maxScroll);
        cam.setScroll(0, scrollY);
      });
    }
  }

  private formatProgress(current: number, target: number): string {
    if (target === 1) return current >= 1 ? "1 / 1" : "0 / 1";
    if (target >= 1000) return `${Math.floor(current)} / ${target}`;
    return `${Math.floor(current)} / ${target}`;
  }
}
