import {
  BASE_SPEED, SPEED_GAIN, MAX_SPEED,
  BASE_SPAWN_INTERVAL, MIN_SPAWN_INTERVAL,
  MERCY_DURATION, MERCY_SPAWN_MULTIPLIER,
} from "../config";

export type ObstacleType = "fire" | "saw" | "gap" | "lightning" | "wall";

const PHASE_1_TYPES: ObstacleType[] = ["fire", "gap"];
const PHASE_2_TYPES: ObstacleType[] = ["fire", "gap", "lightning", "saw"];
const PHASE_3_TYPES: ObstacleType[] = ["fire", "gap", "lightning", "saw", "wall"];

export class DifficultyManager {
  private distance = 0;
  private orbsCollected = 0;
  private mercyTimer = 0;
  private mercyActive = false;
  private reachedMaxSpeed = false;
  private boostTimer = 0;

  reset(useMercy: boolean, speedBoost = false) {
    this.distance = 0;
    this.orbsCollected = 0;
    this.reachedMaxSpeed = false;
    this.boostTimer = speedBoost ? 30000 : 0;
    if (useMercy) {
      this.mercyActive = true;
      this.mercyTimer = MERCY_DURATION;
    }
  }

  update(delta: number, currentDistance: number, currentOrbsCollected: number) {
    this.distance = currentDistance;
    this.orbsCollected = currentOrbsCollected;
    if (this.mercyActive) {
      this.mercyTimer -= delta;
      if (this.mercyTimer <= 0) this.mercyActive = false;
    }
    if (this.boostTimer > 0) {
      this.boostTimer -= delta;
      if (this.boostTimer < 0) this.boostTimer = 0;
    }
  }

  getSpeedBoostRemaining(): number {
    return this.boostTimer;
  }

  getSpeed(): number {
    const boost = this.boostTimer > 0 ? 80 * (this.boostTimer / 30000) : 0;
    const raw = BASE_SPEED + boost + SPEED_GAIN * Math.log(1 + this.orbsCollected / 4);
    const speed = Math.min(raw, MAX_SPEED);
    if (speed >= MAX_SPEED - 1) this.reachedMaxSpeed = true;
    return speed;
  }

  hasReachedMaxSpeed(): boolean {
    return this.reachedMaxSpeed;
  }

  getSpawnInterval(): number {
    const raw = BASE_SPAWN_INTERVAL - (this.distance / 2000) * (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
    const interval = Math.max(raw, MIN_SPAWN_INTERVAL);
    return this.mercyActive ? interval * MERCY_SPAWN_MULTIPLIER : interval;
  }

  getAvailableObstacles(): ObstacleType[] {
    if (this.distance < 450) return PHASE_1_TYPES;
    if (this.distance < 1400) return PHASE_2_TYPES;
    return PHASE_3_TYPES;
  }

  pickObstacle(): ObstacleType {
    const types = this.getAvailableObstacles();
    return types[Math.floor(Math.random() * types.length)];
  }
}
