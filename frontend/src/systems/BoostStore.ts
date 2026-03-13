import { spendOrbs } from "./CharacterStore";

const BOOSTS_KEY = "mr_boosts";

export interface BoostInventory {
  speed_boost: number;
  orb_magnet: number;
}

export type BoostId = keyof BoostInventory;

export const BOOST_DEFS: { id: BoostId; name: string; cost: number; description: string }[] = [
  { id: "speed_boost", name: "SPEED", cost: 50, description: "Start faster (+80 speed, decays over 30s)" },
  { id: "orb_magnet", name: "MAGNET", cost: 75, description: "Orbs gravitate toward you for 60s" },
];

function defaultInventory(): BoostInventory {
  return { speed_boost: 0, orb_magnet: 0 };
}

export function getBoostInventory(): BoostInventory {
  try {
    const raw = localStorage.getItem(BOOSTS_KEY);
    if (raw) return { ...defaultInventory(), ...JSON.parse(raw) };
  } catch { /* corrupt */ }
  return defaultInventory();
}

function saveInventory(inv: BoostInventory) {
  localStorage.setItem(BOOSTS_KEY, JSON.stringify(inv));
}

export function buyBoost(id: BoostId): boolean {
  const def = BOOST_DEFS.find((b) => b.id === id);
  if (!def) return false;
  if (!spendOrbs(def.cost)) return false;
  const inv = getBoostInventory();
  inv[id]++;
  saveInventory(inv);
  return true;
}

export function consumeBoost(id: BoostId): boolean {
  const inv = getBoostInventory();
  if (inv[id] <= 0) return false;
  inv[id]--;
  saveInventory(inv);
  return true;
}
