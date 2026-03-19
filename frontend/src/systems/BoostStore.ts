import { getCachedInventory, purchaseBoost as serverPurchaseBoost, consumeBoost as serverConsumeBoost } from "./CharacterStore";

export interface BoostInventory {
  speed_boost: number;
  orb_magnet: number;
}

export type BoostId = keyof BoostInventory;

export const BOOST_DEFS: { id: BoostId; name: string; cost: number; description: string }[] = [
  { id: "speed_boost", name: "SPEED", cost: 50, description: "Start faster (+80 speed, decays over 30s)" },
  { id: "orb_magnet", name: "MAGNET", cost: 75, description: "Orbs gravitate toward you for 60s" },
];

export function getBoostInventory(): BoostInventory {
  const inv = getCachedInventory();
  return {
    speed_boost: inv.boost_speed,
    orb_magnet: inv.boost_magnet,
  };
}

export async function buyBoost(id: BoostId): Promise<boolean> {
  return serverPurchaseBoost(id);
}

export async function consumeBoost(id: BoostId): Promise<boolean> {
  return serverConsumeBoost(id);
}
