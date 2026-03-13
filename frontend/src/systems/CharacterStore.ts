const WALLET_KEY = "mr_orb_wallet";
const UNLOCKS_KEY = "mr_char_unlocks";
const SELECTED_KEY = "mr_selected_char";

export function getOrbWallet(): number {
  try {
    return Number(localStorage.getItem(WALLET_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function addOrbs(n: number) {
  const current = getOrbWallet();
  localStorage.setItem(WALLET_KEY, String(current + n));
}

export function spendOrbs(n: number): boolean {
  const current = getOrbWallet();
  if (current < n) return false;
  localStorage.setItem(WALLET_KEY, String(current - n));
  return true;
}

export function getUnlocked(): string[] {
  try {
    const raw = localStorage.getItem(UNLOCKS_KEY);
    if (raw) {
      const list = JSON.parse(raw) as string[];
      if (!list.includes("default")) list.unshift("default");
      return list;
    }
  } catch { /* corrupt */ }
  return ["default"];
}

export function unlockCharacter(id: string) {
  const list = getUnlocked();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(UNLOCKS_KEY, JSON.stringify(list));
  }
}

export function getSelected(): string {
  try {
    return localStorage.getItem(SELECTED_KEY) || "default";
  } catch {
    return "default";
  }
}

export function setSelected(id: string) {
  localStorage.setItem(SELECTED_KEY, id);
}
