import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { CHARACTERS, CharacterDef } from "../systems/CharacterRegistry";
import {
  getOrbWallet,
  getUnlocked,
  unlockCharacter,
  spendOrbs,
  getSelected,
  setSelected,
} from "../systems/CharacterStore";
import {
  getBoostInventory,
  buyBoost,
  consumeBoost,
  BOOST_DEFS,
  BoostId,
} from "../systems/BoostStore";
import { PlayerData } from "../api";

interface CardUI {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  sprite: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  costText: Phaser.GameObjects.Text;
  lockIcon: Phaser.GameObjects.Text;
  char: CharacterDef;
}

export class CharacterSelectScene extends Phaser.Scene {
  private playerData!: PlayerData;
  private cards: CardUI[] = [];
  private selectedId = "default";
  private walletText!: Phaser.GameObjects.Text;
  private activeBoosts: Set<BoostId> = new Set();
  private boostButtons: {
    id: BoostId;
    bg: Phaser.GameObjects.Rectangle;
    glow: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    statusText: Phaser.GameObjects.Text;
    buyBg: Phaser.GameObjects.Rectangle;
    buyLabel: Phaser.GameObjects.Text;
  }[] = [];

  constructor() {
    super("CharacterSelectScene");
  }

  init(data: { player: PlayerData }) {
    this.playerData = data.player;
  }

  create() {
    this.cards = [];
    this.selectedId = getSelected();
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    // Background
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0a12).setOrigin(0);

    // Title
    this.add
      .text(cx, cy - 185, "CHOOSE YOUR RUNNER", {
        fontFamily: '"Press Start 2P"',
        fontSize: "12px",
        color: "#c850c0",
        stroke: "#7b2d8e",
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    // Wallet
    this.walletText = this.add
      .text(cx, cy - 161, "", {
        fontFamily: '"Press Start 2P"',
        fontSize: "9px",
        color: "#e878e0",
      })
      .setOrigin(0.5);
    this.refreshWallet();

    // Character cards
    const unlocked = getUnlocked();
    const cardW = 120;
    const cardH = 160;
    const gap = 12;
    const totalW = CHARACTERS.length * cardW + (CHARACTERS.length - 1) * gap;
    const startX = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const cardY = cy - 55;

    for (let i = 0; i < CHARACTERS.length; i++) {
      const char = CHARACTERS[i];
      const x = startX + i * (cardW + gap);
      this.createCard(char, x, cardY, cardW, cardH, unlocked);
    }

    // Boost section
    this.activeBoosts.clear();
    this.boostButtons = [];
    const boostLabelY = cy + 45;
    this.add.text(cx, boostLabelY, "RUN BOOSTS", {
      fontFamily: '"Press Start 2P"',
      fontSize: "7px",
      color: "#6a6a8e",
    }).setOrigin(0.5);

    const boostY = cy + 70;
    const boostGap = 160;
    const boostStartX = cx - (boostGap * (BOOST_DEFS.length - 1)) / 2;

    for (let i = 0; i < BOOST_DEFS.length; i++) {
      const def = BOOST_DEFS[i];
      const bx = boostStartX + i * boostGap;
      this.createBoostToggle(def.id, def.name, def.cost, bx, boostY);
    }

    // START button
    const startBtnY = cy + 135;
    const startBg = this.add
      .rectangle(cx, startBtnY, 160, 36, 0x7b2d8e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, startBtnY, "S T A R T", {
        fontFamily: '"Press Start 2P"',
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    startBg.on("pointerover", () => startBg.setFillStyle(0xc850c0));
    startBg.on("pointerout", () => startBg.setFillStyle(0x7b2d8e));
    startBg.on("pointerdown", () => {
      setSelected(this.selectedId);
      const boosts: string[] = [];
      for (const id of this.activeBoosts) {
        if (consumeBoost(id)) boosts.push(id);
      }
      this.scene.start("GameScene", {
        player: this.playerData,
        characterId: this.selectedId,
        activeBoosts: boosts,
      });
    });

    // BACK button
    const backY = cy + 170;
    const backBg = this.add
      .rectangle(cx, backY, 120, 26, 0x2a2a3e)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(cx, backY, "BACK", {
        fontFamily: '"Press Start 2P"',
        fontSize: "8px",
        color: "#aaaacc",
      })
      .setOrigin(0.5);

    backBg.on("pointerover", () => backBg.setFillStyle(0x4a4a5e));
    backBg.on("pointerout", () => backBg.setFillStyle(0x2a2a3e));
    backBg.on("pointerdown", () => this.scene.start("MenuScene"));

    this.input.keyboard!.once("keydown-ESC", () =>
      this.scene.start("MenuScene"),
    );

    this.highlightSelected();
  }

  private createCard(
    char: CharacterDef,
    x: number,
    y: number,
    w: number,
    h: number,
    unlocked: string[],
  ) {
    const isUnlocked = unlocked.includes(char.id);
    const isMystery = char.mystery && !isUnlocked;
    const container = this.add.container(x, y);

    // Card background
    const bg = this.add.rectangle(0, 0, w, h, 0x1a1a2e).setStrokeStyle(
      2,
      0x3a3a5e,
    );
    container.add(bg);

    // Character sprite
    const textureKey = `${char.id}-${char.anims.idle.sheet}`;
    const sprite = this.add.sprite(0, -30, textureKey).setScale(
      Math.min(1.2, (80 / char.frameHeight) * 2),
    );
    const animKey = `${char.id}-anim-idle`;
    if (this.anims.exists(animKey)) {
      sprite.play(animKey);
    }

    if (isMystery) {
      sprite.setTint(0x111122);
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.6, to: 0.9 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
      });
    }
    container.add(sprite);

    // Name
    const displayName = isMystery ? "???" : char.name;
    const nameText = this.add
      .text(0, 26, displayName, {
        fontFamily: '"Press Start 2P"',
        fontSize: "8px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    container.add(nameText);

    // Cost badge
    let costLabel: string;
    if (char.cost === 0) {
      costLabel = "FREE";
    } else if (isMystery) {
      costLabel = "???";
    } else {
      costLabel = `${char.cost} orbs`;
    }
    const costColor = isUnlocked ? "#88ff88" : "#e878e0";
    const costText = this.add
      .text(0, 44, isUnlocked && char.cost > 0 ? "OWNED" : costLabel, {
        fontFamily: '"Press Start 2P"',
        fontSize: "7px",
        color: costColor,
      })
      .setOrigin(0.5);
    container.add(costText);

    // Perk label
    const perkText = isMystery ? "???" : char.perkLabel;
    if (perkText) {
      const perk = this.add
        .text(0, 60, perkText, {
          fontFamily: '"Press Start 2P"',
          fontSize: "6px",
          color: "#88ccff",
        })
        .setOrigin(0.5);
      container.add(perk);
    }

    // Lock icon
    const lockIcon = this.add
      .text(0, 74, isUnlocked ? "" : "UNLOCK", {
        fontFamily: '"Press Start 2P"',
        fontSize: "7px",
        color: "#ffdd44",
      })
      .setOrigin(0.5);
    container.add(lockIcon);

    // Make interactive
    bg.setInteractive({ useHandCursor: true });
    bg.on("pointerdown", () => this.onCardTap(char));

    const card: CardUI = {
      container,
      bg,
      sprite,
      nameText,
      costText,
      lockIcon,
      char,
    };
    this.cards.push(card);
  }

  private onCardTap(char: CharacterDef) {
    const unlocked = getUnlocked();
    const isUnlocked = unlocked.includes(char.id);

    if (isUnlocked) {
      this.selectedId = char.id;
      this.highlightSelected();
      return;
    }

    if (spendOrbs(char.cost)) {
      unlockCharacter(char.id);
      this.selectedId = char.id;
      this.refreshCard(char.id);
      this.refreshWallet();
      this.highlightSelected();
    } else {
      const card = this.cards.find((c) => c.char.id === char.id);
      if (card) {
        card.lockIcon.setText("NOT ENOUGH").setColor("#ff4444");
        this.time.delayedCall(1200, () => {
          if (!getUnlocked().includes(char.id)) {
            card.lockIcon.setText("UNLOCK").setColor("#ffdd44");
          }
        });
      }
    }
  }

  private refreshCard(charId: string) {
    const card = this.cards.find((c) => c.char.id === charId);
    if (!card) return;

    // Reveal mystery character
    card.sprite.clearTint();
    this.tweens.killTweensOf(card.sprite);
    card.sprite.setAlpha(1);
    card.nameText.setText(card.char.name);
    card.costText.setText("OWNED").setColor("#88ff88");
    card.lockIcon.setText("");
  }

  private highlightSelected() {
    for (const card of this.cards) {
      const isSelected = card.char.id === this.selectedId;
      const unlocked = getUnlocked().includes(card.char.id);
      card.bg.setStrokeStyle(
        isSelected ? 3 : 2,
        isSelected ? 0xc850c0 : 0x3a3a5e,
      );
      card.bg.setFillStyle(
        isSelected && unlocked ? 0x2a1a3e : 0x1a1a2e,
      );
    }
  }

  private createBoostToggle(id: BoostId, name: string, cost: number, x: number, y: number) {
    const inv = getBoostInventory();
    const count = inv[id];
    const btnW = 130;
    const btnH = 34;
    const accentColor = id === "speed_boost" ? 0x00e5ff : 0xff44ff;

    // Outer glow (hidden until active)
    const glow = this.add.rectangle(x, y, btnW + 6, btnH + 6, accentColor, 0)
      .setStrokeStyle(0, accentColor);

    const bg = this.add.rectangle(x, y, btnW, btnH, 0x1a1a2e)
      .setStrokeStyle(2, 0x3a3a5e)
      .setInteractive({ useHandCursor: true });

    const icon = id === "speed_boost" ? ">> " : "<> ";
    const label = this.add.text(x, y - 3, `${icon}${name} x${count}`, {
      fontFamily: '"Press Start 2P"', fontSize: "8px", color: "#6a6a8e",
    }).setOrigin(0.5);

    const statusText = this.add.text(x, y + 11, "", {
      fontFamily: '"Press Start 2P"', fontSize: "5px", color: "#4a4a6e",
    }).setOrigin(0.5);

    bg.on("pointerdown", () => {
      const currentInv = getBoostInventory();
      if (currentInv[id] <= 0) return;
      if (this.activeBoosts.has(id)) {
        this.activeBoosts.delete(id);
      } else {
        this.activeBoosts.add(id);
      }
      this.refreshBoostButtons();
    });

    // BUY button (right-aligned below toggle)
    const buyY = y + 26;
    const buyBg = this.add.rectangle(x, buyY, 72, 18, 0x2a2a3e)
      .setInteractive({ useHandCursor: true });
    const buyLabel = this.add.text(x, buyY, `BUY ${cost}`, {
      fontFamily: '"Press Start 2P"', fontSize: "6px", color: "#e878e0",
    }).setOrigin(0.5);

    buyBg.on("pointerover", () => buyBg.setFillStyle(0x4a4a5e));
    buyBg.on("pointerout", () => buyBg.setFillStyle(0x2a2a3e));
    buyBg.on("pointerdown", () => {
      if (buyBoost(id)) {
        this.refreshWallet();
        this.refreshBoostButtons();
      } else {
        buyLabel.setText("NO ORBS").setColor("#ff4444");
        this.time.delayedCall(1000, () => {
          buyLabel.setText(`BUY ${cost}`).setColor("#e878e0");
        });
      }
    });

    this.boostButtons.push({ id, bg, glow, label, statusText, buyBg, buyLabel });
    this.refreshSingleBoost(this.boostButtons[this.boostButtons.length - 1]);
  }

  private refreshSingleBoost(btn: (typeof this.boostButtons)[number]) {
    const inv = getBoostInventory();
    const count = inv[btn.id];
    const active = this.activeBoosts.has(btn.id);
    const accentColor = btn.id === "speed_boost" ? 0x00e5ff : 0xff44ff;
    const accentHex = btn.id === "speed_boost" ? "#00e5ff" : "#ff44ff";
    const icon = btn.id === "speed_boost" ? ">> " : "<> ";

    // Disable toggle if count is 0 and active
    if (count <= 0 && active) {
      this.activeBoosts.delete(btn.id);
    }
    const isActive = this.activeBoosts.has(btn.id);

    btn.label.setText(`${icon}${BOOST_DEFS.find((b) => b.id === btn.id)!.name} x${count}`);

    if (isActive) {
      btn.label.setColor("#ffffff");
      btn.bg.setFillStyle(btn.id === "speed_boost" ? 0x0a2a33 : 0x2a0a2a);
      btn.bg.setStrokeStyle(2, accentColor);
      btn.glow.setFillStyle(accentColor, 0.08);
      btn.glow.setStrokeStyle(3, accentColor, 0.6);
      btn.statusText.setText("ENABLED").setColor(accentHex);
      // Pulsing glow
      this.tweens.killTweensOf(btn.glow);
      this.tweens.add({
        targets: btn.glow,
        alpha: { from: 0.5, to: 1 },
        duration: 800,
        yoyo: true,
        repeat: -1,
      });
    } else {
      btn.label.setColor(count > 0 ? "#aaaacc" : "#4a4a6e");
      btn.bg.setFillStyle(0x1a1a2e);
      btn.bg.setStrokeStyle(2, 0x3a3a5e);
      btn.glow.setFillStyle(accentColor, 0);
      btn.glow.setStrokeStyle(0, accentColor, 0);
      btn.glow.setAlpha(1);
      this.tweens.killTweensOf(btn.glow);
      btn.statusText.setText(count > 0 ? "TAP TO ENABLE" : "").setColor("#4a4a6e");
    }
  }

  private refreshBoostButtons() {
    for (const btn of this.boostButtons) {
      this.refreshSingleBoost(btn);
    }
  }

  private refreshWallet() {
    this.walletText.setText(`${getOrbWallet()} orbs`);
  }
}
