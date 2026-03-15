import { describe, it, expect } from "vitest";
import {
  ZONE_BLEND_DISTANCE,
  MILESTONE_INTERVAL,
  MILESTONE_SCORE_BONUS,
} from "../config";

describe("zone/milestone config constants", () => {
  it("ZONE_BLEND_DISTANCE is 12500 (500m display)", () => {
    expect(ZONE_BLEND_DISTANCE).toBe(12500);
  });

  it("MILESTONE_INTERVAL is 6250 (250m display)", () => {
    expect(MILESTONE_INTERVAL).toBe(6250);
  });

  it("MILESTONE_SCORE_BONUS is 100", () => {
    expect(MILESTONE_SCORE_BONUS).toBe(100);
  });

  it("milestone display conversion: 6250 raw * 0.04 = 250m", () => {
    expect(Math.floor(MILESTONE_INTERVAL * 0.04)).toBe(250);
  });
});
