import { api } from "../api";

export interface AchievementProgress {
  current: number;
  target: number;
}

export interface PlayerProgress {
  totalDistance: number;
  totalOrbs: number;
  totalDashes: number;
  totalRuns: number;
  bestScore: number;
  bestDistance: number;
  bestNearMisses: number;
  bestWallsBroken: number;
  maxSpeedReached: boolean;
  bestNoDamageDistance: number;
}

export interface AchievementDef {
  key: string;
  name: string;
  hint: string;
  check: (stats: RunStats, cumulative: CumulativeStats) => boolean;
  progress: (p: PlayerProgress) => AchievementProgress;
}

export interface RunStats {
  distance: number;
  orbsCollected: number;
  nearMisses: number;
  dashesUsed: number;
  wallsBroken: number;
  score: number;
  reachedMaxSpeed: boolean;
  damageTaken: boolean;
}

export interface CumulativeStats {
  totalDistance: number;
  totalOrbs: number;
  totalDashes: number;
  totalRuns: number;
  bestScore: number;
  topTenThreshold: number;
}

export const DEFINITIONS: AchievementDef[] = [
  { key: "first_steps", name: "First Steps", hint: "Run 100m in a single run", check: (r) => r.distance >= 100, progress: (p) => ({ current: Math.min(p.bestDistance, 100), target: 100 }) },
  { key: "night_owl", name: "Night Owl", hint: "Run 1000m in a single run", check: (r) => r.distance >= 1000, progress: (p) => ({ current: Math.min(p.bestDistance, 1000), target: 1000 }) },
  { key: "shadow_dancer", name: "Shadow Dancer", hint: "Dash 50 times across all runs", check: (_, c) => c.totalDashes >= 50, progress: (p) => ({ current: Math.min(p.totalDashes, 50), target: 50 }) },
  { key: "untouchable", name: "Untouchable", hint: "Reach 500m without taking damage", check: (r) => r.distance >= 500 && !r.damageTaken, progress: (p) => ({ current: Math.min(p.bestNoDamageDistance, 500), target: 500 }) },
  { key: "orb_hoarder", name: "Orb Hoarder", hint: "Collect 500 orbs across all runs", check: (_, c) => c.totalOrbs >= 500, progress: (p) => ({ current: Math.min(p.totalOrbs, 500), target: 500 }) },
  { key: "close_call", name: "Close Call", hint: "Get 10 near misses in one run", check: (r) => r.nearMisses >= 10, progress: (p) => ({ current: Math.min(p.bestNearMisses, 10), target: 10 }) },
  { key: "speed_demon", name: "Speed Demon", hint: "Reach maximum speed", check: (r) => r.reachedMaxSpeed, progress: (p) => ({ current: p.maxSpeedReached ? 1 : 0, target: 1 }) },
  { key: "marathon_runner", name: "Marathon Runner", hint: "Run 5000m total across all runs", check: (_, c) => c.totalDistance >= 5000, progress: (p) => ({ current: Math.min(p.totalDistance, 5000), target: 5000 }) },
  { key: "deathless_dash", name: "Deathless Dash", hint: "Break 5 walls in a single run", check: (r) => r.wallsBroken >= 5, progress: (p) => ({ current: Math.min(p.bestWallsBroken, 5), target: 5 }) },
  { key: "midnight_legend", name: "Midnight Legend", hint: "Reach the top 10 leaderboard", check: (r, c) => r.score > 0 && r.score >= c.topTenThreshold, progress: (p) => ({ current: p.bestScore, target: Math.max(p.bestScore, 1) }) },
];

function progressKey(playerId?: number, networkId?: string): string {
  if (playerId && networkId) return `mr_progress_${playerId}_${networkId}`;
  if (playerId) return `mr_progress_${playerId}`;
  if (networkId) return `mr_progress_${networkId}`;
  return "mr_progress";
}

export function loadProgress(playerId?: number, networkId?: string): PlayerProgress {
  const defaults: PlayerProgress = {
    totalDistance: 0, totalOrbs: 0, totalDashes: 0, totalRuns: 0,
    bestScore: 0, bestDistance: 0, bestNearMisses: 0, bestWallsBroken: 0,
    maxSpeedReached: false, bestNoDamageDistance: 0,
  };
  try {
    const raw = localStorage.getItem(progressKey(playerId, networkId));
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* corrupt data */ }
  return defaults;
}

export function saveProgress(p: PlayerProgress, playerId?: number, networkId?: string) {
  localStorage.setItem(progressKey(playerId, networkId), JSON.stringify(p));
}

export function updateProgress(prev: PlayerProgress, run: RunStats): PlayerProgress {
  const noDmgDist = run.damageTaken ? 0 : run.distance;
  return {
    totalDistance: prev.totalDistance + run.distance,
    totalOrbs: prev.totalOrbs + run.orbsCollected,
    totalDashes: prev.totalDashes + run.dashesUsed,
    totalRuns: prev.totalRuns + 1,
    bestScore: Math.max(prev.bestScore, run.score),
    bestDistance: Math.max(prev.bestDistance, run.distance),
    bestNearMisses: Math.max(prev.bestNearMisses, run.nearMisses),
    bestWallsBroken: Math.max(prev.bestWallsBroken, run.wallsBroken),
    maxSpeedReached: prev.maxSpeedReached || run.reachedMaxSpeed,
    bestNoDamageDistance: Math.max(prev.bestNoDamageDistance, noDmgDist),
  };
}

export class AchievementManager {
  private unlocked: Set<string> = new Set();
  private toastQueue: string[] = [];

  async init(playerId: number, networkId?: string) {
    try {
      const existing = await api.getPlayerAchievements(playerId);
      for (const a of existing) this.unlocked.add(a.achievement_key);
    } catch {
      // offline-ok
    }
    // suppress unused warnings
    void networkId;
  }

  popToast(): string | null {
    return this.toastQueue.shift() || null;
  }

  getUnlocked(): string[] {
    return Array.from(this.unlocked);
  }
}
