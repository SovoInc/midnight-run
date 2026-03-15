import { describe, it, expect, beforeEach } from "vitest";
import { getBoostInventory, BOOST_DEFS } from "../BoostStore";

describe("BoostStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("default inventory is all zeros", () => {
    const inv = getBoostInventory();
    expect(inv.speed_boost).toBe(0);
    expect(inv.orb_magnet).toBe(0);
  });

  it("has two boost definitions", () => {
    expect(BOOST_DEFS).toHaveLength(2);
  });

  it("speed boost costs 50", () => {
    const speed = BOOST_DEFS.find((b) => b.id === "speed_boost");
    expect(speed).toBeDefined();
    expect(speed!.cost).toBe(50);
  });

  it("magnet costs 75", () => {
    const magnet = BOOST_DEFS.find((b) => b.id === "orb_magnet");
    expect(magnet).toBeDefined();
    expect(magnet!.cost).toBe(75);
  });
});
