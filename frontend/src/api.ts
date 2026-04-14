const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PlayerData {
  id: number;
  alias: string;
  wallet_address: string | null;
  network_id: string;
  auth_token?: string;
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

export interface RunSubmission {
  player_id: number;
  raw_distance: number;
  orbs_collected: number;
  near_misses: number;
  dashes_used: number;
  walls_broken: number;
  duration_secs: number;
  reached_max_speed: boolean;
  damage_taken: boolean;
}

export interface RunResult {
  score_id: number;
  score: number;
  distance: number;
  orb_balance: number;
  achievements_unlocked: string[];
  achievements_display: string[];
}

export interface InventoryData {
  orb_balance: number;
  unlocked_characters: string[];
  boost_speed: number;
  boost_magnet: number;
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

let _authToken = "";

export function setAuthToken(token: string) {
  _authToken = token;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (_authToken) h["Authorization"] = `Bearer ${_authToken}`;
  return h;
}

function base64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signRunJWT(payload: RunSubmission, secret: string): Promise<string> {
  const header = base64url('{"alg":"HS256","typ":"JWT"}');
  const body = base64url(JSON.stringify(payload));
  const message = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return `${message}.${base64url(sig)}`;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const h: Record<string, string> = {};
  if (_authToken) h["Authorization"] = `Bearer ${_authToken}`;
  const res = await fetch(`${BASE}${path}`, { headers: h });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function getPlayerIdentifier(player: Pick<PlayerData, "alias" | "wallet_address">): string {
  return player.wallet_address ?? player.alias;
}

export function shortenWalletAddress(value: string): string {
  if (value.length <= 24) {
    return value;
  }

  return `${value.slice(0, 16)}...${value.slice(-8)}`;
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

  startSession: (playerId: number) =>
    post<{ token: string }>("/api/session/start", { player_id: playerId }),

  submitRun: async (data: RunSubmission, sessionToken: string): Promise<RunResult> => {
    const runToken = await signRunJWT(data, sessionToken);
    return post<RunResult>("/api/run", { session_token: sessionToken, run_token: runToken });
  },

  submitScore: (data: RunData) => post<{ id: number }>("/api/scores", data),

  getTopScores: (limit = 20, networkId?: string) =>
    get<ScoreEntry[]>(`/api/scores/top?limit=${limit}${networkId ? `&network_id=${networkId}` : ""}`),

  getPlayerScores: (playerId: number) =>
    get<ScoreEntry[]>(`/api/scores/player/${playerId}`),

  getPlayerAchievements: (playerId: number) =>
    get<AchievementEntry[]>(`/api/achievements/${playerId}`),

  getPlayerStats: (playerId: number) =>
    get<PlayerStatsData>(`/api/stats/player/${playerId}`),

  getInventory: (playerId: number) =>
    get<InventoryData>(`/api/inventory?player_id=${playerId}`),

  purchaseCharacter: (playerId: number, characterId: string) =>
    post<InventoryData>("/api/inventory/purchase-character", { player_id: playerId, character_id: characterId }),

  purchaseBoost: (playerId: number, boostId: string) =>
    post<InventoryData>("/api/inventory/purchase-boost", { player_id: playerId, boost_id: boostId }),

  consumeBoost: (playerId: number, boostId: string) =>
    post<InventoryData>("/api/inventory/consume-boost", { player_id: playerId, boost_id: boostId }),
};
