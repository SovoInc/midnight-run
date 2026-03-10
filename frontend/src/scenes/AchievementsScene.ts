import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { api, PlayerData } from "../api";
import { DEFINITIONS, PlayerProgress, loadProgress, saveProgress } from "../systems/AchievementManager";

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

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12).setOrigin(0);

    this.add.text(cx, 25, "ACHIEVEMENTS", {
      fontFamily: '"Press Start 2P"', fontSize: "16px", color: "#ffdd44",
      stroke: "#7b2d8e", strokeThickness: 3,
    }).setOrigin(0.5);

    let unlocked: Set<string> = new Set();
    try {
      const existing = await api.getPlayerAchievements(this.playerData.id);
      for (const a of existing) unlocked.add(a.achievement_key);
    } catch {
      // offline
    }

    const local = loadProgress();
    let progress: PlayerProgress = local;
    try {
      const server = await api.getPlayerStats(this.playerData.id);
      progress = {
        totalRuns: Math.max(local.totalRuns, server.total_runs),
        totalDistance: Math.max(local.totalDistance, server.total_distance),
        totalOrbs: Math.max(local.totalOrbs, server.total_orbs),
        totalDashes: Math.max(local.totalDashes, server.total_dashes),
        bestScore: Math.max(local.bestScore, server.best_score),
        bestDistance: Math.max(local.bestDistance, server.best_distance),
        bestNearMisses: Math.max(local.bestNearMisses, server.best_near_misses),
        bestWallsBroken: Math.max(local.bestWallsBroken, server.best_walls_broken),
        bestNoDamageDistance: Math.max(local.bestNoDamageDistance, server.best_no_damage_distance),
        maxSpeedReached: local.maxSpeedReached || server.max_speed_reached,
      };
      saveProgress(progress);
    } catch {
      // offline — use local only
    }

    const stk = { stroke: "#000000", strokeThickness: 3 };

    const countText = `${unlocked.size} / ${DEFINITIONS.length}`;
    this.add.text(cx, 46, countText, {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#aa88cc", ...stk,
    }).setOrigin(0.5);

    this.add.text(cx, 62, `${progress.totalRuns} run${progress.totalRuns === 1 ? "" : "s"}`, {
      fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#7766aa", ...stk,
    }).setOrigin(0.5);

    const rowHeight = 44;
    const barWidth = GAME_WIDTH - 80;
    const barLeft = 40;

    DEFINITIONS.forEach((def, i) => {
      const y = 82 + i * rowHeight;
      const isUnlocked = unlocked.has(def.key);

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

      const prog = def.progress(progress);
      const ratio = Math.min(prog.current / prog.target, 1);

      if (isUnlocked) {
        this.add.text(46, y + 12, "Completed", {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#77cc77", ...stk,
        }).setOrigin(0, 0.5);
      } else {
        // Hint text
        this.add.text(46, y + 10, def.hint, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#9999bb", ...stk,
        }).setOrigin(0, 0.5);

        // Progress bar background
        const barY = y + 22;
        this.add.rectangle(barLeft, barY, barWidth, 6, 0x333344)
          .setOrigin(0, 0.5);

        // Progress bar fill
        if (ratio > 0) {
          const fillWidth = Math.max(barWidth * ratio, 2);
          const fillColor = ratio >= 1 ? 0x66aa66 : 0xc850c0;
          this.add.rectangle(barLeft, barY, fillWidth, 6, fillColor)
            .setOrigin(0, 0.5);
        }

        // Progress text
        const progLabel = this.formatProgress(prog.current, prog.target);
        this.add.text(GAME_WIDTH - 16, y - 4, progLabel, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#aa88cc", ...stk,
        }).setOrigin(1, 0.5);
      }
    });

    // Back button
    const backY = Math.max(82 + DEFINITIONS.length * rowHeight + 16, 420);
    const backBg = this.add.rectangle(cx, backY, 140, 30, 0x7b2d8e).setInteractive({ useHandCursor: true });
    this.add.text(cx, backY, "BACK", {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#ffffff", ...stk,
    }).setOrigin(0.5);

    backBg.on("pointerover", () => backBg.setFillStyle(0xc850c0));
    backBg.on("pointerout", () => backBg.setFillStyle(0x7b2d8e));
    backBg.on("pointerdown", () => {
      this.scene.start(this.returnScene, this.returnData ?? { player: this.playerData });
    });

    this.input.keyboard!.once("keydown-ESC", () => {
      this.scene.start(this.returnScene, this.returnData ?? { player: this.playerData });
    });
  }

  private formatProgress(current: number, target: number): string {
    if (target === 1) return current >= 1 ? "1 / 1" : "0 / 1";
    if (target >= 1000) return `${Math.floor(current)} / ${target}`;
    return `${Math.floor(current)} / ${target}`;
  }
}
