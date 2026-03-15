export type PlayerState = "idle" | "run" | "jump" | "midair" | "fall" | "dash" | "hit" | "dead";

export interface AnimDef {
  sheet: string;   // spritesheet filename without .png
  start: number;
  end: number;
  rate: number;
  repeat: number;  // -1 = loop, 0 = once
}

export type PerkId = "none" | "starter_shield" | "triple_jump" | "extra_hp";

export interface CharacterDef {
  id: string;
  name: string;
  folder: string;
  frameWidth: number;
  frameHeight: number;
  scale: number;
  bodyW: number;
  bodyH: number;
  offsetX: number;
  offsetY: number;
  cost: number;
  mystery: boolean;
  perk: PerkId;
  perkLabel: string;
  anims: Record<PlayerState, AnimDef>;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "default",
    name: "Runner",
    folder: "default",
    frameWidth: 240,
    frameHeight: 128,
    scale: 2.8,
    bodyW: 14,
    bodyH: 34,
    offsetX: 111,
    offsetY: 44,
    cost: 0,
    mystery: false,
    perk: "none",
    perkLabel: "",
    anims: {
      idle:   { sheet: "idle",   start: 0, end: 11, rate: 10, repeat: -1 },
      run:    { sheet: "run",    start: 0, end: 7,  rate: 12, repeat: -1 },
      jump:   { sheet: "jump",   start: 0, end: 3,  rate: 10, repeat: 0 },
      midair: { sheet: "midair", start: 0, end: 0,  rate: 1,  repeat: -1 },
      fall:   { sheet: "fall",   start: 0, end: 3,  rate: 10, repeat: 0 },
      dash:   { sheet: "dash",   start: 0, end: 3,  rate: 16, repeat: 0 },
      hit:    { sheet: "hit",    start: 0, end: 0,  rate: 1,  repeat: 0 },
      dead:   { sheet: "death",  start: 0, end: 9,  rate: 8,  repeat: 0 },
    },
  },
  {
    id: "ninja",
    name: "Ninja",
    folder: "ninja",
    frameWidth: 126,
    frameHeight: 126,
    scale: 2.6,
    bodyW: 14,
    bodyH: 34,
    offsetX: 54,
    offsetY: 51,
    cost: 500,
    mystery: false,
    perk: "starter_shield",
    perkLabel: "REGEN SHIELD",
    anims: {
      idle:   { sheet: "idle",  start: 0, end: 9,  rate: 10, repeat: -1 },
      run:    { sheet: "run",   start: 0, end: 7,  rate: 12, repeat: -1 },
      jump:   { sheet: "jump",  start: 0, end: 2,  rate: 10, repeat: 0 },
      midair: { sheet: "jump",  start: 2, end: 2,  rate: 1,  repeat: -1 },
      fall:   { sheet: "fall",  start: 0, end: 2,  rate: 10, repeat: 0 },
      dash:   { sheet: "attack", start: 0, end: 6,  rate: 28, repeat: 0 },
      hit:    { sheet: "hit",   start: 0, end: 2,  rate: 8,  repeat: 0 },
      dead:   { sheet: "death", start: 0, end: 10, rate: 8,  repeat: 0 },
    },
  },
  {
    id: "huntress",
    name: "Huntress",
    folder: "huntress",
    frameWidth: 150,
    frameHeight: 150,
    scale: 2.8,
    bodyW: 14,
    bodyH: 34,
    offsetX: 66,
    offsetY: 64,
    cost: 1500,
    mystery: false,
    perk: "triple_jump",
    perkLabel: "TRIPLE JUMP",
    anims: {
      idle:   { sheet: "idle",  start: 0, end: 7,  rate: 10, repeat: -1 },
      run:    { sheet: "run",   start: 0, end: 7,  rate: 12, repeat: -1 },
      jump:   { sheet: "jump",  start: 0, end: 1,  rate: 10, repeat: 0 },
      midair: { sheet: "jump",  start: 1, end: 1,  rate: 1,  repeat: -1 },
      fall:   { sheet: "fall",  start: 0, end: 1,  rate: 10, repeat: 0 },
      dash:   { sheet: "attack", start: 0, end: 4,  rate: 20, repeat: 0 },
      hit:    { sheet: "hit",   start: 0, end: 2,  rate: 8,  repeat: 0 },
      dead:   { sheet: "death", start: 0, end: 7,  rate: 8,  repeat: 0 },
    },
  },
  {
    id: "knight",
    name: "Knight",
    folder: "knight",
    frameWidth: 180,
    frameHeight: 180,
    scale: 1.8,
    bodyW: 14,
    bodyH: 34,
    offsetX: 80,
    offsetY: 82,
    cost: 5000,
    mystery: true,
    perk: "extra_hp",
    perkLabel: "4 HP + REGEN",
    anims: {
      idle:   { sheet: "idle",  start: 0, end: 10, rate: 10, repeat: -1 },
      run:    { sheet: "run",   start: 0, end: 7,  rate: 12, repeat: -1 },
      jump:   { sheet: "jump",  start: 0, end: 2,  rate: 10, repeat: 0 },
      midair: { sheet: "jump",  start: 2, end: 2,  rate: 1,  repeat: -1 },
      fall:   { sheet: "fall",  start: 0, end: 2,  rate: 10, repeat: 0 },
      dash:   { sheet: "attack", start: 0, end: 6,  rate: 28, repeat: 0 },
      hit:    { sheet: "hit",   start: 0, end: 3,  rate: 8,  repeat: 0 },
      dead:   { sheet: "death", start: 0, end: 10, rate: 8,  repeat: 0 },
    },
  },
];

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

/** Returns the set of unique spritesheet names a character uses */
export function getUniqueSheets(char: CharacterDef): string[] {
  const seen = new Set<string>();
  for (const anim of Object.values(char.anims)) {
    seen.add(anim.sheet);
  }
  return Array.from(seen);
}
