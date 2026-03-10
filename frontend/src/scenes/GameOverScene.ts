import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { api, PlayerData, RunData } from "../api";

interface GameOverData {
  player: PlayerData;
  score: number;
  distance: number;
  orbsCollected: number;
  nearMisses: number;
  dashesUsed: number;
  wallsBroken: number;
  duration: number;
  newAchievements: string[];
}

export class GameOverScene extends Phaser.Scene {
  private runResult!: GameOverData;

  constructor() {
    super("GameOverScene");
  }

  init(data: GameOverData) {
    this.runResult = data;
  }

  async create() {
    const cx = GAME_WIDTH / 2;
    const d = this.runResult;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12, 0.85).setOrigin(0);

    const dead = this.add.sprite(cx, 80, "player-death").setScale(1.5);
    dead.play("anim-death");

    this.add.text(cx, 140, "GAME OVER", {
      fontFamily: '"Press Start 2P"', fontSize: "20px", color: "#c850c0",
      stroke: "#7b2d8e", strokeThickness: 3,
    }).setOrigin(0.5);

    const style = { fontFamily: '"Press Start 2P"', fontSize: "9px", color: "#aaaacc" };

    this.add.text(cx, 175, `SCORE: ${d.score}`, { ...style, color: "#ffffff", fontSize: "14px" }).setOrigin(0.5);
    this.add.text(cx, 200, `${d.distance}m  |  ${d.orbsCollected} orbs  |  ${d.nearMisses} near misses`, style).setOrigin(0.5);
    this.add.text(cx, 218, `${d.dashesUsed} dashes  |  ${d.wallsBroken} walls  |  ${d.duration.toFixed(1)}s`, style).setOrigin(0.5);

    // Submit score
    const runData: RunData = {
      player_id: d.player.id,
      score: d.score,
      distance: d.distance,
      orbs_collected: d.orbsCollected,
      near_misses: d.nearMisses,
      dashes_used: d.dashesUsed,
      walls_broken: d.wallsBroken,
      duration_secs: d.duration,
    };

    try {
      await api.submitScore(runData);
    } catch {
      // offline-ok
    }

    // Show new achievements
    if (d.newAchievements.length > 0) {
      this.add.text(cx, 245, "ACHIEVEMENTS UNLOCKED:", {
        fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#ffdd44",
      }).setOrigin(0.5);

      d.newAchievements.forEach((name, i) => {
        this.add.text(cx, 260 + i * 14, `★ ${name}`, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#ffdd44",
        }).setOrigin(0.5);
      });
    }

    // Top scores
    try {
      const top = await api.getTopScores(5);
      const startY = d.newAchievements.length > 0 ? 260 + d.newAchievements.length * 14 + 15 : 250;

      this.add.text(cx, startY, "LEADERBOARD", {
        fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#8866aa",
      }).setOrigin(0.5);

      top.forEach((entry, i) => {
        const color = entry.player_id === d.player.id ? "#c850c0" : "#6666aa";
        this.add.text(cx, startY + 16 + i * 13, `${entry.rank}. ${entry.alias} - ${entry.score}`, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color,
        }).setOrigin(0.5);
      });
    } catch {
      // offline
    }

    // Buttons
    const retryY = 388;
    const retryBg = this.add.rectangle(cx - 70, retryY, 120, 30, 0x7b2d8e).setInteractive({ useHandCursor: true });
    this.add.text(cx - 70, retryY, "RETRY", {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#ffffff",
    }).setOrigin(0.5);

    retryBg.on("pointerover", () => retryBg.setFillStyle(0xc850c0));
    retryBg.on("pointerout", () => retryBg.setFillStyle(0x7b2d8e));
    retryBg.on("pointerdown", () => {
      this.scene.start("GameScene", { player: d.player });
    });

    const lbBg = this.add.rectangle(cx + 70, retryY, 120, 30, 0x2a2a5e).setInteractive({ useHandCursor: true });
    this.add.text(cx + 70, retryY, "SCORES", {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#aaaacc",
    }).setOrigin(0.5);

    lbBg.on("pointerover", () => lbBg.setFillStyle(0x4a4a7e));
    lbBg.on("pointerout", () => lbBg.setFillStyle(0x2a2a5e));
    lbBg.on("pointerdown", () => {
      this.scene.start("LeaderboardScene", { player: d.player });
    });

    const achY = retryY + 38;
    const achBg = this.add.rectangle(cx, achY, 200, 26, 0x2a2a3e).setInteractive({ useHandCursor: true });
    this.add.text(cx, achY, "ACHIEVEMENTS", {
      fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#ffdd44",
    }).setOrigin(0.5);

    achBg.on("pointerover", () => achBg.setFillStyle(0x4a4a5e));
    achBg.on("pointerout", () => achBg.setFillStyle(0x2a2a3e));
    achBg.on("pointerdown", () => {
      this.scene.start("AchievementsScene", {
        player: d.player,
        returnScene: "GameOverScene",
        returnData: d,
      });
    });

    this.input.keyboard!.once("keydown-SPACE", () => {
      this.scene.start("GameScene", { player: d.player });
    });
  }
}
