import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Phaser before importing ZoneManager
vi.mock("phaser", () => ({
  default: {
    Display: {
      Color: {
        IntegerToColor: (color: number) => ({
          red: (color >> 16) & 0xff,
          green: (color >> 8) & 0xff,
          blue: color & 0xff,
        }),
        Interpolate: {
          ColorWithColor: (
            a: { red: number; green: number; blue: number },
            b: { red: number; green: number; blue: number },
            _length: number,
            t: number,
          ) => ({
            r: a.red + (b.red - a.red) * t,
            g: a.green + (b.green - a.green) * t,
            b: a.blue + (b.blue - a.blue) * t,
          }),
        },
        GetColor: (r: number, g: number, b: number) =>
          (r << 16) | (g << 8) | b,
      },
    },
  },
}));

import { ZoneManager } from "../ZoneManager";

describe("ZoneManager", () => {
  let zm: ZoneManager;

  beforeEach(() => {
    zm = new ZoneManager();
  });

  describe("zone selection", () => {
    it("starts in Neon City at distance 0", () => {
      zm.update(0);
      expect(zm.getZoneName()).toBe("NEON CITY");
    });

    it("stays in Neon City below threshold", () => {
      zm.update(24999);
      expect(zm.getZoneName()).toBe("NEON CITY");
    });

    it("enters Deep Tunnels at 25000 raw (1000m)", () => {
      zm.update(25000);
      expect(zm.getZoneName()).toBe("DEEP TUNNELS");
    });

    it("enters Toxic Sewers at 50000 raw (2000m)", () => {
      zm.update(50000);
      expect(zm.getZoneName()).toBe("TOXIC SEWERS");
    });

    it("enters Crimson Abyss at 75000 raw (3000m)", () => {
      zm.update(75000);
      expect(zm.getZoneName()).toBe("CRIMSON ABYSS");
    });

    it("enters The Void at 100000 raw (4000m)", () => {
      zm.update(100000);
      expect(zm.getZoneName()).toBe("THE VOID");
    });
  });

  describe("orb multipliers", () => {
    it("returns 1x in Neon City", () => {
      zm.update(0);
      expect(zm.getOrbMultiplier()).toBe(1);
    });

    it("returns 1.5x in Deep Tunnels", () => {
      zm.update(25000);
      expect(zm.getOrbMultiplier()).toBe(1.5);
    });

    it("returns 2x in Toxic Sewers", () => {
      zm.update(50000);
      expect(zm.getOrbMultiplier()).toBe(2);
    });

    it("returns 2.5x in Crimson Abyss", () => {
      zm.update(75000);
      expect(zm.getOrbMultiplier()).toBe(2.5);
    });

    it("returns 3x in The Void", () => {
      zm.update(100000);
      expect(zm.getOrbMultiplier()).toBe(3);
    });
  });

  describe("zone enter detection", () => {
    it("does not fire zone enter at start", () => {
      zm.update(0);
      expect(zm.checkZoneEnter()).toBeNull();
    });

    it("fires zone enter when crossing into Deep Tunnels", () => {
      zm.update(0);
      zm.update(25000);
      expect(zm.checkZoneEnter()).toBe("DEEP TUNNELS");
    });

    it("only fires once per zone transition", () => {
      zm.update(0);
      zm.update(25000);
      zm.checkZoneEnter(); // consume
      zm.update(25001);
      expect(zm.checkZoneEnter()).toBeNull();
    });

    it("fires for each new zone", () => {
      zm.update(0);
      zm.update(25000);
      expect(zm.checkZoneEnter()).toBe("DEEP TUNNELS");
      zm.update(50000);
      expect(zm.checkZoneEnter()).toBe("TOXIC SEWERS");
    });
  });

  describe("milestones", () => {
    it("does not fire milestone at distance 0", () => {
      expect(zm.checkMilestones(0)).toBeNull();
    });

    it("fires first milestone at 6250 raw (250m display)", () => {
      expect(zm.checkMilestones(6250)).toBe(250);
    });

    it("fires second milestone at 12500 raw (500m display)", () => {
      zm.checkMilestones(6250); // consume first
      expect(zm.checkMilestones(12500)).toBe(500);
    });

    it("does not re-fire same milestone", () => {
      zm.checkMilestones(6250);
      expect(zm.checkMilestones(6250)).toBeNull();
    });

    it("fires milestone at 1000m display (25000 raw)", () => {
      for (let d = 6250; d < 25000; d += 6250) {
        zm.checkMilestones(d);
      }
      expect(zm.checkMilestones(25000)).toBe(1000);
    });
  });

  describe("palette blending", () => {
    it("returns zone 0 palette with no tints at start", () => {
      zm.update(0);
      const p = zm.getBlendedPalette();
      expect(p.backTint).toBe(0xffffff);
      expect(p.platformTint).toBe(0xffffff);
      expect(p.starBrightness).toBe(0);
      expect(p.orbMultiplier).toBe(1);
    });

    it("returns blended palette in transition region", () => {
      // Blend starts at 25000 - 12500 = 12500, midpoint at 18750
      zm.update(18750);
      const p = zm.getBlendedPalette();
      expect(p.starBrightness).toBeGreaterThan(0);
      expect(p.starBrightness).toBeLessThan(0.3);
      // orbMultiplier stays at current zone (not interpolated)
      expect(p.orbMultiplier).toBe(1);
    });

    it("returns zone 1 palette after crossing threshold", () => {
      zm.update(25000);
      const p = zm.getBlendedPalette();
      expect(p.backTint).toBe(0x6644aa);
      expect(p.starBrightness).toBe(0.3);
      expect(p.orbMultiplier).toBe(1.5);
    });

    it("returns last zone palette at very high distance", () => {
      zm.update(200000);
      const p = zm.getBlendedPalette();
      expect(p.backTint).toBe(0x8899bb);
      expect(p.starBrightness).toBe(1.0);
      expect(p.orbMultiplier).toBe(3);
    });
  });

  describe("dirty check optimization", () => {
    it("palette stays consistent on repeated same-distance updates", () => {
      zm.update(5000);
      const p1 = zm.getBlendedPalette();
      zm.update(5000);
      const p2 = zm.getBlendedPalette();
      expect(p1.backTint).toBe(p2.backTint);
      expect(p1.starBrightness).toBe(p2.starBrightness);
    });
  });
});
