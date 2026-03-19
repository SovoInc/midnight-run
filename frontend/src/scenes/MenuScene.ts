import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { api, getPlayerIdentifier, PlayerData, setAuthToken, shortenWalletAddress } from "../api";
import { resetInventory } from "../systems/CharacterStore";
import { drawMoon } from "../systems/ParallaxBackground";
import { getCharacter } from "../systems/CharacterRegistry";
import { getSelected } from "../systems/CharacterStore";
import {
  connectMidnightWallet,
  getMidnightWalletError,
  MIDNIGHT_NETWORK_ID,
} from "../midnight";

interface MenuBat {
  sprite: Phaser.GameObjects.Sprite;
  baseY: number;
  speedX: number;
  phase: number;
  drift: number;
}

export class MenuScene extends Phaser.Scene {
  private bats: MenuBat[] = [];
  private playerData: PlayerData | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private addressText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private connectBg!: Phaser.GameObjects.Rectangle;
  private connectLabel!: Phaser.GameObjects.Text;
  private runBg!: Phaser.GameObjects.Rectangle;
  private runLabel!: Phaser.GameObjects.Text;
  private achievementsBg!: Phaser.GameObjects.Rectangle;
  private achievementsLabel!: Phaser.GameObjects.Text;
  private scoresBg!: Phaser.GameObjects.Rectangle;
  private scoresLabel!: Phaser.GameObjects.Text;
  private logoutBg!: Phaser.GameObjects.Rectangle;
  private logoutLabel!: Phaser.GameObjects.Text;
  private isConnecting = false;
  private hasAttemptedAutoConnect = false;
  private isAutoConnecting = false;

  constructor() {
    super("MenuScene");
  }

  create() {
    const cx = GAME_WIDTH / 2;

    const scaleY = GAME_HEIGHT / 192;
    const tileW = Math.ceil(GAME_WIDTH / scaleY);
    const bg1 = this.add.tileSprite(0, 0, tileW, 192, "bg-back").setOrigin(0).setScale(scaleY);
    const bg2 = this.add.tileSprite(0, 0, tileW, 192, "bg-mid").setOrigin(0).setScale(scaleY);
    bg2.setAlpha(1);

    this.tweens.add({ targets: bg1, tilePositionX: 50, duration: 20000, repeat: -1, yoyo: true });
    this.tweens.add({ targets: bg2, tilePositionX: 100, duration: 15000, repeat: -1, yoyo: true });

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12, 0.6).setOrigin(0).setDepth(0);
    drawMoon(this, GAME_WIDTH * 0.78, GAME_HEIGHT * 0.18, 1);

    this.bats = [];
    const batConfigs = [
      { x: GAME_WIDTH * 0.10, y: GAME_HEIGHT * 0.12, scale: 0.85, speedX: -20 },
      { x: GAME_WIDTH * 0.30, y: GAME_HEIGHT * 0.24, scale: 0.70, speedX: 15 },
      { x: GAME_WIDTH * 0.50, y: GAME_HEIGHT * 0.08, scale: 1.0, speedX: -24 },
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
        .setDepth(4);
      sprite.play("anim-bat-sky");
      this.bats.push({
        sprite,
        baseY: cfg.y,
        speedX: cfg.speedX,
        phase: i * 1.4,
        drift: 6 + i * 2.5,
      });
    }

    const cy = GAME_HEIGHT / 2;
    const panelY = Math.min(cy + 30, GAME_HEIGHT - 210);
    const titleY = Math.max(44, panelY - 150);
    const heroY = panelY - 68;

    const title = this.add.text(cx, titleY, "MIDNIGHT RUN", {
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

    const selChar = getCharacter(getSelected());
    const player = this.add.sprite(cx, heroY, `${selChar.id}-${selChar.anims.idle.sheet}`).setScale(1.5).setDepth(5);
    player.play(`${selChar.id}-anim-idle`);

    this.add.rectangle(cx, panelY, 320, 118, 0x111426, 0.9)
      .setStrokeStyle(2, 0x7b2d8e)
      .setDepth(5);

    this.add.text(cx, panelY - 38, "MIDNIGHT WALLET LOGIN", {
      fontFamily: '"Press Start 2P"',
      fontSize: "10px",
      color: "#8866aa",
      align: "center",
    }).setOrigin(0.5).setDepth(5);

    this.statusText = this.add.text(cx, panelY - 14, "", {
      fontFamily: '"Press Start 2P"',
      fontSize: "8px",
      color: "#ffdd44",
      align: "center",
    }).setOrigin(0.5).setDepth(5);

    this.addressText = this.add.text(cx, panelY + 12, "", {
      fontFamily: '"Press Start 2P"',
      fontSize: "7px",
      color: "#ffffff",
      align: "center",
      wordWrap: { width: Math.min(280, GAME_WIDTH - 90), useAdvancedWrap: true },
      lineSpacing: 8,
    }).setOrigin(0.5).setDepth(5);

    this.hintText = this.add.text(cx, panelY + 44, "", {
      fontFamily: '"Press Start 2P"',
      fontSize: "7px",
      color: "#88ccff",
      align: "center",
      wordWrap: { width: Math.min(280, GAME_WIDTH - 90), useAdvancedWrap: true },
      lineSpacing: 8,
    }).setOrigin(0.5).setDepth(5);

    this.errorText = this.add.text(cx, panelY + 74, "", {
      fontFamily: '"Press Start 2P"',
      fontSize: "8px",
      color: "#ff6666",
      align: "center",
      wordWrap: { width: Math.min(300, GAME_WIDTH - 80), useAdvancedWrap: true },
    }).setOrigin(0.5).setDepth(5);

    const btnW = 210;
    const btnH = 34;
    const btnFont = "10px";
    const btnGap = 38;
    const btn1Y = panelY + 104;
    const btn2Y = btn1Y + btnGap;
    const btn3Y = btn2Y + btnGap;

    // Connect wallet button (visible when disconnected)
    this.connectBg = this.add.rectangle(cx, btn1Y, btnW, btnH, 0x7b2d8e)
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    this.connectLabel = this.add.text(cx, btn1Y, "", {
      fontFamily: '"Press Start 2P"',
      fontSize: btnFont,
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(5);

    this.connectBg.on("pointerover", () => {
      if (!this.isConnecting) this.connectBg.setFillStyle(0xc850c0);
    });
    this.connectBg.on("pointerout", () => this.refreshButtons());
    this.connectBg.on("pointerdown", () => void this.connectWallet());

    // Run button (slot 1 when connected)
    this.runBg = this.add.rectangle(cx, btn1Y, btnW, btnH, 0x7b2d8e)
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    this.runLabel = this.add.text(cx, btn1Y, "R U N", {
      fontFamily: '"Press Start 2P"',
      fontSize: btnFont,
      color: "#ffffff",
    }).setOrigin(0.5).setDepth(5);

    this.runBg.on("pointerover", () => {
      if (this.playerData) this.runBg.setFillStyle(0xc850c0);
    });
    this.runBg.on("pointerout", () => this.refreshButtons());
    this.runBg.on("pointerdown", () => this.startGame());

    // Row 2: Achievements + High Scores side by side
    const colBtnW = Math.floor((btnW - btnGap + btnH) / 2);
    const colGap = btnW - colBtnW * 2;
    const colL = cx - (colBtnW + colGap) / 2;
    const colR = cx + (colBtnW + colGap) / 2;

    this.achievementsBg = this.add.rectangle(colL, btn2Y, colBtnW, btnH, 0x2a2a3e)
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    this.achievementsLabel = this.add.text(colL, btn2Y, "ACHIEVEMENTS", {
      fontFamily: '"Press Start 2P"',
      fontSize: "8px",
      color: "#ffdd44",
    }).setOrigin(0.5).setDepth(5);

    this.achievementsBg.on("pointerover", () => this.achievementsBg?.setFillStyle(0x4a4a5e));
    this.achievementsBg.on("pointerout", () => this.achievementsBg?.setFillStyle(0x2a2a3e));
    this.achievementsBg.on("pointerdown", () => {
      if (this.playerData) {
        this.scene.start("AchievementsScene", {
          player: this.playerData,
          returnScene: "MenuScene",
        });
      }
    });

    this.scoresBg = this.add.rectangle(colR, btn2Y, colBtnW, btnH, 0x2a2a3e)
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    this.scoresLabel = this.add.text(colR, btn2Y, "HIGH SCORES", {
      fontFamily: '"Press Start 2P"',
      fontSize: "8px",
      color: "#aaaacc",
    }).setOrigin(0.5).setDepth(5);

    this.scoresBg.on("pointerover", () => this.scoresBg.setFillStyle(0x4a4a5e));
    this.scoresBg.on("pointerout", () => this.scoresBg.setFillStyle(0x2a2a3e));
    this.scoresBg.on("pointerdown", () => {
      if (this.playerData) {
        this.scene.start("LeaderboardScene", { player: this.playerData });
      }
    });

    // Logout button (slot 3 when connected)
    this.logoutBg = this.add.rectangle(cx, btn3Y, btnW, btnH, 0x5e2a2a)
      .setInteractive({ useHandCursor: true })
      .setDepth(5);
    this.logoutLabel = this.add.text(cx, btn3Y, "LOGOUT", {
      fontFamily: '"Press Start 2P"',
      fontSize: btnFont,
      color: "#ff8888",
    }).setOrigin(0.5).setDepth(5);

    this.logoutBg.on("pointerover", () => this.logoutBg.setFillStyle(0x7e3a3a));
    this.logoutBg.on("pointerout", () => this.logoutBg.setFillStyle(0x5e2a2a));
    this.logoutBg.on("pointerdown", () => this.disconnectWallet());

    const saved = this.loadSavedPlayer();
    if (saved) {
      this.playerData = saved;
    }

    this.input.keyboard?.on("keydown-ENTER", () => this.startGame());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());

    this.refreshWalletUi();

    // Auto-connect only if the user has a saved session (didn't logout)
    if (this.playerData) {
      this.time.delayedCall(0, () => {
        void this.autoConnectWallet();
      });
    }
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

  private loadSavedPlayer(): PlayerData | null {
    try {
      const raw = localStorage.getItem("mr_player");
      if (!raw) return null;
      const player = JSON.parse(raw) as PlayerData;
      const savedToken = localStorage.getItem("mr_auth_token");
      if (savedToken) {
        setAuthToken(savedToken);
        player.auth_token = savedToken;
      }
      return player;
    } catch {
      localStorage.removeItem("mr_player");
      localStorage.removeItem("mr_auth_token");
      return null;
    }
  }

  private refreshWalletUi() {
    const hasPlayer = Boolean(this.playerData);
    const isReconnecting = this.isAutoConnecting && !hasPlayer;

    if (hasPlayer) {
      this.statusText.setText("CONNECTED");
      this.statusText.setColor("#77cc77");
    } else if (isReconnecting) {
      this.statusText.setText("RECONNECTING WALLET...");
      this.statusText.setColor("#ffdd44");
    } else {
      this.statusText.setText("DISCONNECTED");
      this.statusText.setColor("#aa88cc");
    }

    if (hasPlayer && this.playerData) {
      const playerIdentifier = getPlayerIdentifier(this.playerData);
      this.addressText.setText(
        this.playerData.wallet_address ? shortenWalletAddress(playerIdentifier) : playerIdentifier,
      );
      this.addressText.setColor("#ffffff");
      this.hintText.setText(`Wallet address is your runner ID on ${MIDNIGHT_NETWORK_ID}.`);
    } else if (isReconnecting) {
      this.addressText.setText("Checking Midnight Lace and restoring your runner identity.");
      this.addressText.setColor("#88ccff");
      this.hintText.setText(`Expected network: ${MIDNIGHT_NETWORK_ID}.`);
      this.connectLabel.setText("RECONNECTING...");
    } else {
      this.addressText.setText("Connect Midnight Lace to use your wallet address for scores, achievements, and records.");
      this.addressText.setColor("#88ccff");
      this.hintText.setText(`Expected network: ${MIDNIGHT_NETWORK_ID}. No alias entry is needed.`);
      this.connectLabel.setText(this.isConnecting ? "CONNECTING..." : "CONNECT WALLET");
    }

    // Show connect button when disconnected, show run/achievements/logout when connected
    this.connectBg.setVisible(!hasPlayer);
    this.connectLabel.setVisible(!hasPlayer);
    this.runBg.setVisible(hasPlayer);
    this.runLabel.setVisible(hasPlayer);
    this.achievementsBg.setVisible(hasPlayer);
    this.achievementsLabel.setVisible(hasPlayer);
    this.scoresBg.setVisible(hasPlayer);
    this.scoresLabel.setVisible(hasPlayer);
    this.logoutBg.setVisible(hasPlayer);
    this.logoutLabel.setVisible(hasPlayer);

    this.refreshButtons();
  }

  private refreshButtons() {
    if (this.isConnecting) {
      this.connectBg.setFillStyle(0x3a3a52);
    } else {
      this.connectBg.setFillStyle(0x7b2d8e);
    }

    this.runBg.setFillStyle(0x7b2d8e);
    this.achievementsBg.setFillStyle(0x2a2a3e);
    this.scoresBg.setFillStyle(0x2a2a3e);
    this.logoutBg.setFillStyle(0x5e2a2a);
  }

  private async autoConnectWallet() {
    if (this.hasAttemptedAutoConnect) return;
    this.hasAttemptedAutoConnect = true;
    this.isAutoConnecting = true;
    this.refreshWalletUi();
    try {
      await this.connectWallet(true);
    } finally {
      this.isAutoConnecting = false;
      this.refreshWalletUi();
    }
  }

  private async connectWallet(isAutoConnect = false) {
    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.errorText.setText("");
    this.refreshWalletUi();

    try {
      const { address } = await connectMidnightWallet();
      const player = await api.registerWallet(address, MIDNIGHT_NETWORK_ID);
      if (player.auth_token) {
        setAuthToken(player.auth_token);
        localStorage.setItem("mr_auth_token", player.auth_token);
      }
      this.playerData = player;
      localStorage.setItem("mr_player", JSON.stringify(player));
      this.refreshWalletUi();
    } catch (error) {
      if (!isAutoConnect) {
        this.errorText.setText(getMidnightWalletError(error));
      }
      console.error(error);
    } finally {
      this.isConnecting = false;
      this.refreshWalletUi();
    }
  }

  private disconnectWallet() {
    this.playerData = null;
    localStorage.removeItem("mr_player");
    localStorage.removeItem("mr_auth_token");
    setAuthToken("");
    resetInventory();
    this.errorText.setText("");
    this.refreshWalletUi();
  }

  private startGame() {
    if (!this.playerData) {
      this.errorText.setText("connect your wallet first");
      return;
    }

    this.errorText.setText("");
    this.scene.start("CharacterSelectScene", { player: this.playerData });
  }

  private cleanup() {
    this.input.keyboard?.off("keydown-ENTER");
  }

  shutdown() {
    this.cleanup();
  }
}
