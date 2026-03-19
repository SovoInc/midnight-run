import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { api, formatScoreIdentifier, PlayerData, RunSubmission } from "../api";
import { getCharacter } from "../systems/CharacterRegistry";
import { updateCachedBalance } from "../systems/CharacterStore";

interface GameOverData {
  player: PlayerData;
  characterId: string;
  score: number;
  distance: number;
  rawDistance: number;
  orbsCollected: number;
  nearMisses: number;
  dashesUsed: number;
  wallsBroken: number;
  duration: number;
  reachedMaxSpeed: boolean;
  damageTaken: boolean;
  sessionToken: string;
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
    const cy = GAME_HEIGHT / 2;
    const d = this.runResult;

    // Show last frame of gameplay as background
    if (this.textures.exists("gameover-snapshot")) {
      this.add.image(0, 0, "gameover-snapshot").setOrigin(0).setDepth(-1);
    }
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12, 0.7).setOrigin(0);

    const charId = d.characterId || "default";
    const charDef = getCharacter(charId);
    const dead = this.add.sprite(cx, cy - 150, `${charId}-${charDef.anims.dead.sheet}`).setScale(1.5);
    dead.play(`${charId}-anim-dead`);

    this.add.text(cx, cy - 90, "GAME OVER", {
      fontFamily: '"Press Start 2P"', fontSize: "20px", color: "#c850c0",
      stroke: "#7b2d8e", strokeThickness: 3,
    }).setOrigin(0.5);

    const style = { fontFamily: '"Press Start 2P"', fontSize: "9px", color: "#aaaacc" };

    // Use client-computed values initially; overwrite with server values below
    let displayScore = d.score;
    let displayDistance = d.distance;
    let newAchievements: string[] = [];

    // Submit run to server
    if (d.sessionToken) {
      const submission: RunSubmission = {
        player_id: d.player.id,
        session_token: d.sessionToken,
        raw_distance: d.rawDistance,
        orbs_collected: d.orbsCollected,
        near_misses: d.nearMisses,
        dashes_used: d.dashesUsed,
        walls_broken: d.wallsBroken,
        duration_secs: d.duration,
        reached_max_speed: d.reachedMaxSpeed,
        damage_taken: d.damageTaken,
      };
      try {
        const result = await api.submitRun(submission);
        displayScore = result.score;
        displayDistance = result.distance;
        newAchievements = result.achievements_display;
        updateCachedBalance(result.orb_balance);
      } catch {
        // Offline or rejected — fall back to client values
      }
    } else {
      // No session token (offline) — legacy submit
      try {
        await api.submitScore({
          player_id: d.player.id,
          score: d.score,
          distance: d.distance,
          orbs_collected: d.orbsCollected,
          near_misses: d.nearMisses,
          dashes_used: d.dashesUsed,
          walls_broken: d.wallsBroken,
          duration_secs: d.duration,
        });
      } catch {
        // offline-ok
      }
    }

    this.add.text(cx, cy - 55, `SCORE: ${displayScore}`, { ...style, color: "#ffffff", fontSize: "14px" }).setOrigin(0.5);
    this.add.text(cx, cy - 30, `${displayDistance}m  |  ${d.orbsCollected} orbs  |  ${d.nearMisses} near misses`, style).setOrigin(0.5);
    this.add.text(cx, cy - 12, `${d.dashesUsed} dashes  |  ${d.wallsBroken} walls  |  ${d.duration.toFixed(1)}s`, style).setOrigin(0.5);

    // Show new achievements
    let dynamicY = cy + 15;
    if (newAchievements.length > 0) {
      this.add.text(cx, dynamicY, "ACHIEVEMENTS UNLOCKED:", {
        fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#ffdd44",
      }).setOrigin(0.5);
      dynamicY += 15;

      newAchievements.forEach((name, i) => {
        this.add.text(cx, dynamicY + i * 14, `★ ${name}`, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#ffdd44",
        }).setOrigin(0.5);
      });
      dynamicY += newAchievements.length * 14 + 15;
    }

    // Top scores
    try {
      const top = await api.getTopScores(5, d.player.network_id);

      this.add.text(cx, dynamicY, "LEADERBOARD", {
        fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#8866aa",
      }).setOrigin(0.5);

      top.forEach((entry, i) => {
        const color = entry.player_id === d.player.id ? "#c850c0" : "#6666aa";
        const displayName = formatScoreIdentifier(entry, 22);
        this.add.text(cx, dynamicY + 16 + i * 13, `${entry.rank}. ${displayName} - ${entry.score}`, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color,
        }).setOrigin(0.5);
      });
    } catch {
      // offline
    }

    // Buttons — uniform 2-column grid
    const btnW = 130;
    const btnH = 34;
    const btnGap = 38;
    const btnFont = "10px";
    const colL = cx - 70;
    const colR = cx + 70;
    const row1Y = cy + 140;
    const row2Y = row1Y + btnGap;

    const retryBg = this.add.rectangle(colL, row1Y, btnW, btnH, 0x7b2d8e).setInteractive({ useHandCursor: true });
    this.add.text(colL, row1Y, "RETRY", {
      fontFamily: '"Press Start 2P"', fontSize: btnFont, color: "#ffffff",
    }).setOrigin(0.5);
    retryBg.on("pointerover", () => retryBg.setFillStyle(0xc850c0));
    retryBg.on("pointerout", () => retryBg.setFillStyle(0x7b2d8e));
    retryBg.on("pointerdown", () => {
      this.scene.start("GameScene", { player: d.player, characterId: d.characterId });
    });

    const storeBg = this.add.rectangle(colR, row1Y, btnW, btnH, 0x2a2a3e).setInteractive({ useHandCursor: true });
    this.add.text(colR, row1Y, "STORE", {
      fontFamily: '"Press Start 2P"', fontSize: btnFont, color: "#e878e0",
    }).setOrigin(0.5);
    storeBg.on("pointerover", () => storeBg.setFillStyle(0x4a4a5e));
    storeBg.on("pointerout", () => storeBg.setFillStyle(0x2a2a3e));
    storeBg.on("pointerdown", () => {
      this.scene.start("CharacterSelectScene", { player: d.player });
    });

    const scoresBg = this.add.rectangle(colL, row2Y, btnW, btnH, 0x2a2a3e).setInteractive({ useHandCursor: true });
    this.add.text(colL, row2Y, "SCORES", {
      fontFamily: '"Press Start 2P"', fontSize: btnFont, color: "#aaaacc",
    }).setOrigin(0.5);
    scoresBg.on("pointerover", () => scoresBg.setFillStyle(0x4a4a5e));
    scoresBg.on("pointerout", () => scoresBg.setFillStyle(0x2a2a3e));
    scoresBg.on("pointerdown", () => {
      this.scene.start("LeaderboardScene", { player: d.player });
    });

    const achBg = this.add.rectangle(colR, row2Y, btnW, btnH, 0x2a2a3e).setInteractive({ useHandCursor: true });
    this.add.text(colR, row2Y, "ACHIEVEMENTS", {
      fontFamily: '"Press Start 2P"', fontSize: btnFont, color: "#ffdd44",
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
      this.scene.start("GameScene", { player: d.player, characterId: d.characterId });
    });
  }

}
