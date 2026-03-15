import { describe, it, expect } from "vitest";
import { sfx } from "../SfxManager";

describe("SfxManager", () => {
  it("has milestone sound method", () => {
    expect(typeof sfx.milestone).toBe("function");
  });

  it("has zoneEnter sound method", () => {
    expect(typeof sfx.zoneEnter).toBe("function");
  });

  it("has all original sound methods", () => {
    expect(typeof sfx.jump).toBe("function");
    expect(typeof sfx.doubleJump).toBe("function");
    expect(typeof sfx.orb).toBe("function");
    expect(typeof sfx.hit).toBe("function");
    expect(typeof sfx.dash).toBe("function");
    expect(typeof sfx.wallBreak).toBe("function");
    expect(typeof sfx.shield).toBe("function");
    expect(typeof sfx.die).toBe("function");
    expect(typeof sfx.nearMiss).toBe("function");
  });
});
