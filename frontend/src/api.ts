const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PlayerData {
  id: number;
  alias: string;
  wallet_address: string | null;
}

export interface ScoreEntry {
  rank: number;
  alias: string;
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

export const api = {
  registerAlias: (alias: string) => post<PlayerData>("/api/alias", { alias }),

  submitScore: (data: RunData) => post<{ id: number }>("/api/scores", data),

  getTopScores: (limit = 20) => get<ScoreEntry[]>(`/api/scores/top?limit=${limit}`),

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
