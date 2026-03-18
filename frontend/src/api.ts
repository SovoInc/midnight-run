const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PlayerData {
  id: number;
  alias: string;
  wallet_address: string | null;
  network_id: string;
}

export interface ScoreEntry {
  rank: number;
  display_name: string;
  wallet_address: string | null;
  score: number;
  distance: number;
  player_id: number;
}

export interface RunData {
  player_id: number;
  score: number;
  distance: number;
  orbs_collected: number;
  near_misses: number;
  dashes_used: number;
  walls_broken: number;
  duration_secs: number;
}

export interface AchievementEntry {
  achievement_key: string;
  unlocked_at: string;
}

export interface PlayerStatsData {
  total_runs: number;
  total_distance: number;
  total_orbs: number;
  total_dashes: number;
  best_score: number;
  best_distance: number;
  best_near_misses: number;
  best_walls_broken: number;
  best_no_damage_distance: number;
  max_speed_reached: boolean;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function getPlayerIdentifier(player: Pick<PlayerData, "alias" | "wallet_address">): string {
  return player.wallet_address ?? player.alias;
}

export function shortenWalletAddress(value: string): string {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 3)}...${value.slice(-8)}`;
}

export function truncateIdentifier(value: string, maxLength = 18): string {
  if (value.length <= maxLength) {
    return value;
  }

  const sideLength = Math.max(4, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, sideLength)}...${value.slice(-sideLength)}`;
}

export function formatScoreIdentifier(entry: Pick<ScoreEntry, "display_name" | "wallet_address">, maxAliasLength = 18): string {
  if (entry.wallet_address) {
    return shortenWalletAddress(entry.display_name);
  }

  return truncateIdentifier(entry.display_name, maxAliasLength);
}

export const api = {
  registerAlias: (alias: string) => post<PlayerData>("/api/alias", { alias }),

  registerWallet: (walletAddress: string, networkId: string) =>
    post<PlayerData>("/api/wallet", { wallet_address: walletAddress, network_id: networkId }),

  submitScore: (data: RunData) => post<{ id: number }>("/api/scores", data),

  getTopScores: (limit = 20, networkId?: string) =>
    get<ScoreEntry[]>(`/api/scores/top?limit=${limit}${networkId ? `&network_id=${networkId}` : ""}`),

  getPlayerScores: (playerId: number) =>
    get<ScoreEntry[]>(`/api/scores/player/${playerId}`),

  unlockAchievement: (playerId: number, achievementKey: string) =>
    post<{ status: string }>("/api/achievements", {
      player_id: playerId,
      achievement_key: achievementKey,
    }),

  getPlayerAchievements: (playerId: number) =>
    get<AchievementEntry[]>(`/api/achievements/${playerId}`),

  getPlayerStats: (playerId: number) =>
    get<PlayerStatsData>(`/api/stats/player/${playerId}`),
};
