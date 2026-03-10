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

const PROGRESS_KEY = "mr_progress";

export function loadProgress(): PlayerProgress {
  const defaults: PlayerProgress = {
    totalDistance: 0, totalOrbs: 0, totalDashes: 0, totalRuns: 0,
    bestScore: 0, bestDistance: 0, bestNearMisses: 0, bestWallsBroken: 0,
    maxSpeedReached: false, bestNoDamageDistance: 0,
  };
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* corrupt data */ }
  return defaults;
}

export function saveProgress(p: PlayerProgress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
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
  private playerId = 0;
  private toastQueue: string[] = [];
  private cumulative: CumulativeStats = {
    totalDistance: 0, totalOrbs: 0, totalDashes: 0,
    totalRuns: 0, bestScore: 0, topTenThreshold: 0,
  };

  async init(playerId: number) {
    this.playerId = playerId;
    try {
      const existing = await api.getPlayerAchievements(playerId);
      for (const a of existing) this.unlocked.add(a.achievement_key);

      const top = await api.getTopScores(10);
      this.cumulative.topTenThreshold = top.length >= 10 ? top[top.length - 1].score : 0;

      const playerScores = await api.getPlayerScores(playerId);
      for (const s of playerScores) {
        this.cumulative.totalDistance += s.distance;
        this.cumulative.bestScore = Math.max(this.cumulative.bestScore, s.score);
      }
      this.cumulative.totalRuns = playerScores.length;
    } catch {
      // offline-ok
    }
  }

  updateCumulative(run: RunStats) {
    this.cumulative.totalDistance += run.distance;
    this.cumulative.totalOrbs += run.orbsCollected;
    this.cumulative.totalDashes += run.dashesUsed;
    this.cumulative.totalRuns++;
    this.cumulative.bestScore = Math.max(this.cumulative.bestScore, run.score);
  }

  async checkAll(run: RunStats): Promise<string[]> {
    this.updateCumulative(run);
    const newUnlocks: string[] = [];

    for (const def of DEFINITIONS) {
      if (this.unlocked.has(def.key)) continue;
      if (def.check(run, this.cumulative)) {
        this.unlocked.add(def.key);
        newUnlocks.push(def.name);
        this.toastQueue.push(def.name);
        try {
          await api.unlockAchievement(this.playerId, def.key);
        } catch {
          // persist later
        }
      }
    }
    return newUnlocks;
  }

  popToast(): string | null {
    return this.toastQueue.shift() || null;
  }

  getUnlocked(): string[] {
    return Array.from(this.unlocked);
  }
}
