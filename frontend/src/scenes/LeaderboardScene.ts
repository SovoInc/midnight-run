import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { api, PlayerData } from "../api";

export class LeaderboardScene extends Phaser.Scene {
  private playerData!: PlayerData;

  constructor() {
    super("LeaderboardScene");
  }

  init(data: { player: PlayerData }) {
    this.playerData = data.player;
  }

  async create() {
    const cx = GAME_WIDTH / 2;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12).setOrigin(0);

    this.add.text(cx, 25, "LEADERBOARD", {
      fontFamily: '"Press Start 2P"', fontSize: "16px", color: "#c850c0",
      stroke: "#7b2d8e", strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(cx, 55, "RANK     PLAYER          SCORE    DIST", {
      fontFamily: '"Press Start 2P"', fontSize: "7px", color: "#6666aa",
    }).setOrigin(0.5);

    try {
      const scores = await api.getTopScores(20);

      scores.forEach((entry, i) => {
        const y = 75 + i * 16;
        const isMe = entry.player_id === this.playerData.id;
        const color = isMe ? "#c850c0" : "#aaaacc";
        const bg = isMe ? 0x1a1a3e : undefined;

        if (bg) {
          this.add.rectangle(cx, y, GAME_WIDTH - 40, 14, bg).setOrigin(0.5);
        }

        const rank = String(entry.rank).padStart(2, " ");
        const alias = entry.alias.padEnd(16, " ").substring(0, 16);
        const score = String(entry.score).padStart(8, " ");
        const dist = String(entry.distance).padStart(6, " ") + "m";

        this.add.text(cx, y, `${rank}   ${alias}${score}  ${dist}`, {
          fontFamily: '"Press Start 2P"', fontSize: "7px", color,
        }).setOrigin(0.5);
      });

      if (scores.length === 0) {
        this.add.text(cx, 150, "No scores yet. Be the first!", {
          fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#6666aa",
        }).setOrigin(0.5);
      }
    } catch {
      this.add.text(cx, 150, "Could not load scores", {
        fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#ff4444",
      }).setOrigin(0.5);
    }

    const backBg = this.add.rectangle(cx, 420, 140, 30, 0x7b2d8e).setInteractive({ useHandCursor: true });
    this.add.text(cx, 420, "BACK", {
      fontFamily: '"Press Start 2P"', fontSize: "10px", color: "#ffffff",
    }).setOrigin(0.5);

    backBg.on("pointerover", () => backBg.setFillStyle(0xc850c0));
    backBg.on("pointerout", () => backBg.setFillStyle(0x7b2d8e));
    backBg.on("pointerdown", () => {
      this.scene.start("MenuScene");
    });

    this.input.keyboard!.once("keydown-ESC", () => {
      this.scene.start("MenuScene");
    });
  }
}
