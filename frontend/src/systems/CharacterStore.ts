import { api, InventoryData } from "../api";

function selectedKey(): string {
  return _playerId ? `mr_selected_char_${_playerId}` : "mr_selected_char";
}

// In-memory cache of server inventory, loaded on init
let cachedInventory: InventoryData = {
  orb_balance: 0,
  unlocked_characters: ["default"],
  boost_speed: 0,
  boost_magnet: 0,
};

let _playerId = 0;

export async function initInventory(playerId: number): Promise<InventoryData> {
  _playerId = playerId;
  try {
    cachedInventory = await api.getInventory(playerId);
    if (!cachedInventory.unlocked_characters.includes("default")) {
      cachedInventory.unlocked_characters.unshift("default");
    }
  } catch {
    // offline — keep defaults
  }
  return cachedInventory;
}

export function getCachedInventory(): InventoryData {
  return cachedInventory;
}

export function getPlayerId(): number {
  return _playerId;
}

export function getOrbWallet(): number {
  return cachedInventory.orb_balance;
}

export function getUnlocked(): string[] {
  return cachedInventory.unlocked_characters;
}

export async function purchaseCharacter(characterId: string): Promise<boolean> {
  try {
    cachedInventory = await api.purchaseCharacter(_playerId, characterId);
    if (!cachedInventory.unlocked_characters.includes("default")) {
      cachedInventory.unlocked_characters.unshift("default");
    }
    return true;
  } catch {
    return false;
  }
}

export async function purchaseBoost(boostId: string): Promise<boolean> {
  try {
    cachedInventory = await api.purchaseBoost(_playerId, boostId);
    return true;
  } catch {
    return false;
  }
}

export async function consumeBoost(boostId: string): Promise<boolean> {
  try {
    cachedInventory = await api.consumeBoost(_playerId, boostId);
    return true;
  } catch {
    return false;
  }
}

export function updateCachedBalance(newBalance: number) {
  cachedInventory.orb_balance = newBalance;
}

export function resetInventory() {
  _playerId = 0;
  cachedInventory = {
    orb_balance: 0,
    unlocked_characters: ["default"],
    boost_speed: 0,
    boost_magnet: 0,
  };
}

export function getSelected(): string {
  try {
    return localStorage.getItem(selectedKey()) || "default";
  } catch {
    return "default";
  }
}

export function setSelected(id: string) {
  localStorage.setItem(selectedKey(), id);
}
