import Phaser from "phaser";
import { ZONE_BLEND_DISTANCE, MILESTONE_INTERVAL } from "../config";

export interface ZonePalette {
  backTint: number;
  midTint: number;
  frontTint: number;
  platformTint: number;
  moonTint: number;
  orbColor: number;
  orbStroke: number;
  starBrightness: number;
  orbMultiplier: number;
}

interface ZoneDef {
  name: string;
  threshold: number;
  palette: ZonePalette;
}

const ZONES: ZoneDef[] = [
  {
    name: "NEON CITY",
    threshold: 0,        // 0m
    palette: {
      backTint: 0xffffff,
      midTint: 0xffffff,
      frontTint: 0xffffff,
      platformTint: 0xffffff,
      moonTint: 0xffffff,
      orbColor: 0xc850c0,
      orbStroke: 0xe878e0,
      starBrightness: 0,
      orbMultiplier: 1,
    },
  },
  {
    name: "DEEP TUNNELS",
    threshold: 25000,    // 1000m
    palette: {
      backTint: 0x6644aa,
      midTint: 0x7755bb,
      frontTint: 0x8866cc,
      platformTint: 0x9977cc,
      moonTint: 0xccbbff,
      orbColor: 0x8844dd,
      orbStroke: 0xbb88ff,
      starBrightness: 0.3,
      orbMultiplier: 1.5,
    },
  },
  {
    name: "TOXIC SEWERS",
    threshold: 50000,    // 2000m
    palette: {
      backTint: 0x44aa44,
      midTint: 0x55bb33,
      frontTint: 0x66cc44,
      platformTint: 0x77bb55,
      moonTint: 0xbbffbb,
      orbColor: 0x44dd44,
      orbStroke: 0x88ff66,
      starBrightness: 0.5,
      orbMultiplier: 2,
    },
  },
  {
    name: "CRIMSON ABYSS",
    threshold: 75000,    // 3000m
    palette: {
      backTint: 0xcc4422,
      midTint: 0xdd5533,
      frontTint: 0xee6644,
      platformTint: 0xdd7744,
      moonTint: 0xffaa88,
      orbColor: 0xff4422,
      orbStroke: 0xff8855,
      starBrightness: 0.7,
      orbMultiplier: 2.5,
    },
  },
  {
    name: "THE VOID",
    threshold: 100000,   // 4000m
    palette: {
      backTint: 0x8899bb,
      midTint: 0x99aacc,
      frontTint: 0xaabbdd,
      platformTint: 0xbbccee,
      moonTint: 0xddeeff,
      orbColor: 0x6688cc,
      orbStroke: 0x99bbee,
      starBrightness: 1.0,
      orbMultiplier: 3,
    },
  },
];

export class ZoneManager {
  private currentZoneIndex = 0;
  private currentBlend = 0;
  private lastZoneIndex = -1;
  private lastBlend = -1;
  private cachedPalette: ZonePalette;
  private lastMilestone = 0;
  private zoneEntered = false;

  constructor() {
    this.cachedPalette = { ...ZONES[0].palette };
  }

  update(rawDistance: number) {
    let zoneIndex = 0;
    for (let i = ZONES.length - 1; i >= 0; i--) {
      if (rawDistance >= ZONES[i].threshold) {
        zoneIndex = i;
        break;
      }
    }

    let blend = 0;
    if (zoneIndex < ZONES.length - 1) {
      const zoneStart = ZONES[zoneIndex].threshold;
      const nextStart = ZONES[zoneIndex + 1].threshold;
      const blendStart = nextStart - ZONE_BLEND_DISTANCE;
      if (rawDistance >= blendStart) {
        blend = Math.min((rawDistance - blendStart) / ZONE_BLEND_DISTANCE, 1);
      }
    }

    // Dirty check
    const blendStep = Math.round(blend * 100);
    const lastBlendStep = Math.round(this.lastBlend * 100);
    if (zoneIndex === this.lastZoneIndex && blendStep === lastBlendStep) return;

    if (zoneIndex !== this.lastZoneIndex) {
      this.zoneEntered = zoneIndex > this.currentZoneIndex && zoneIndex > 0;
    }

    this.currentZoneIndex = zoneIndex;
    this.currentBlend = blend;
    this.lastZoneIndex = zoneIndex;
    this.lastBlend = blend;

    this.recomputePalette();
  }

  private recomputePalette() {
    const from = ZONES[this.currentZoneIndex].palette;
    if (this.currentBlend <= 0 || this.currentZoneIndex >= ZONES.length - 1) {
      this.cachedPalette = { ...from };
      return;
    }

    const to = ZONES[this.currentZoneIndex + 1].palette;
    const t = this.currentBlend;

    this.cachedPalette = {
      backTint: lerpColor(from.backTint, to.backTint, t),
      midTint: lerpColor(from.midTint, to.midTint, t),
      frontTint: lerpColor(from.frontTint, to.frontTint, t),
      platformTint: lerpColor(from.platformTint, to.platformTint, t),
      moonTint: lerpColor(from.moonTint, to.moonTint, t),
      orbColor: lerpColor(from.orbColor, to.orbColor, t),
      orbStroke: lerpColor(from.orbStroke, to.orbStroke, t),
      starBrightness: from.starBrightness + (to.starBrightness - from.starBrightness) * t,
      orbMultiplier: from.orbMultiplier,
    };
  }

  getBlendedPalette(): ZonePalette {
    return this.cachedPalette;
  }

  getOrbMultiplier(): number {
    return ZONES[this.currentZoneIndex].palette.orbMultiplier;
  }

  getZoneName(): string {
    return ZONES[this.currentZoneIndex].name;
  }

  checkZoneEnter(): string | null {
    if (this.zoneEntered) {
      this.zoneEntered = false;
      return ZONES[this.currentZoneIndex].name;
    }
    return null;
  }

  checkMilestones(rawDistance: number): number | null {
    const milestone = Math.floor(rawDistance / MILESTONE_INTERVAL) * MILESTONE_INTERVAL;
    if (milestone > this.lastMilestone && milestone > 0) {
      this.lastMilestone = milestone;
      return Math.floor(milestone * 0.04);
    }
    return null;
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const colorA = Phaser.Display.Color.IntegerToColor(a);
  const colorB = Phaser.Display.Color.IntegerToColor(b);
  const result = Phaser.Display.Color.Interpolate.ColorWithColor(colorA, colorB, 1, t);
  return Phaser.Display.Color.GetColor(Math.round(result.r), Math.round(result.g), Math.round(result.b));
}
