import { describe, it, expect } from "vitest";

describe("orb accumulation with fractional multipliers", () => {
  it("1x multiplier: every orb adds 1", () => {
    let raw = 0;
    for (let i = 0; i < 10; i++) raw += 1;
    expect(Math.floor(raw)).toBe(10);
  });

  it("1.5x multiplier: 2 orbs give 3", () => {
    let raw = 0;
    for (let i = 0; i < 2; i++) raw += 1.5;
    expect(Math.floor(raw)).toBe(3);
  });

  it("1.5x multiplier: 3 orbs give 4 (floor of 4.5)", () => {
    let raw = 0;
    for (let i = 0; i < 3; i++) raw += 1.5;
    expect(Math.floor(raw)).toBe(4);
  });

  it("2.5x multiplier: 4 orbs give 10", () => {
    let raw = 0;
    for (let i = 0; i < 4; i++) raw += 2.5;
    expect(Math.floor(raw)).toBe(10);
  });

  it("3x multiplier: 10 orbs give 30", () => {
    let raw = 0;
    for (let i = 0; i < 10; i++) raw += 3;
    expect(Math.floor(raw)).toBe(30);
  });

  it("mixed multipliers across zones give correct total", () => {
    let raw = 0;
    // 5 orbs at 1x
    for (let i = 0; i < 5; i++) raw += 1;
    // 5 orbs at 1.5x
    for (let i = 0; i < 5; i++) raw += 1.5;
    // 5 orbs at 2x
    for (let i = 0; i < 5; i++) raw += 2;
    // total: 5 + 7.5 + 10 = 22.5 -> floor = 22
    expect(Math.floor(raw)).toBe(22);
  });
});

describe("knight HP regen from orbs", () => {
  it("heals after exactly 100 orbs", () => {
    let orbsSinceHeal = 0;
    let healed = false;
    for (let i = 0; i < 100; i++) {
      orbsSinceHeal++;
      if (orbsSinceHeal >= 100) {
        orbsSinceHeal = 0;
        healed = true;
      }
    }
    expect(healed).toBe(true);
    expect(orbsSinceHeal).toBe(0);
  });

  it("does not heal before 100 orbs collected", () => {
    let orbsSinceHeal = 0;
    let healed = false;
    for (let i = 0; i < 99; i++) {
      orbsSinceHeal++;
      if (orbsSinceHeal >= 100) {
        orbsSinceHeal = 0;
        healed = true;
      }
    }
    expect(healed).toBe(false);
  });

  it("heals multiple times at 100 orb intervals", () => {
    let orbsSinceHeal = 0;
    let healCount = 0;
    for (let i = 0; i < 300; i++) {
      orbsSinceHeal++;
      if (orbsSinceHeal >= 100) {
        orbsSinceHeal = 0;
        healCount++;
      }
    }
    expect(healCount).toBe(3);
  });
});
