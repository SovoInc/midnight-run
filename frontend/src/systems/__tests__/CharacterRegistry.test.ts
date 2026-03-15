import { describe, it, expect } from "vitest";
import { getCharacter } from "../CharacterRegistry";

describe("CharacterRegistry perks", () => {
  it("ninja has starter_shield perk with REGEN SHIELD label", () => {
    const ninja = getCharacter("ninja");
    expect(ninja.perk).toBe("starter_shield");
    expect(ninja.perkLabel).toBe("REGEN SHIELD");
  });

  it("knight has extra_hp perk with 4 HP + REGEN label", () => {
    const knight = getCharacter("knight");
    expect(knight.perk).toBe("extra_hp");
    expect(knight.perkLabel).toBe("4 HP + REGEN");
  });

  it("default character has no perk", () => {
    const def = getCharacter("default");
    expect(def.perk).toBe("none");
  });
});
