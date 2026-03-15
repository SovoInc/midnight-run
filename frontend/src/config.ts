function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getViewportGameSize() {
  if (typeof window === "undefined") {
    return { width: 800, height: 450 };
  }

  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  const isPortrait = height > width;

  if (isPortrait) {
    return {
      width: clamp(width, 360, 540),
      height: clamp(height, 640, 960),
    };
  }

  return {
    width: clamp(width, 640, 960),
    height: clamp(height, 360, 600),
  };
}

const viewport = getViewportGameSize();

export const GAME_WIDTH = viewport.width;
export const GAME_HEIGHT = viewport.height;

export const TILE_SIZE = 16;
export const TILE_SCALE = 2;
export const SCALED_TILE = TILE_SIZE * TILE_SCALE;
export const GROUND_ROWS = Math.ceil((GAME_HEIGHT - Math.round(GAME_HEIGHT * 0.82)) / (TILE_SIZE * TILE_SCALE)) + 1;

export const PLAYER_X = Math.round(Math.max(72, GAME_WIDTH * 0.16));
export const GROUND_Y = Math.round(GAME_HEIGHT * 0.82);

export const BASE_SPEED = 205;
export const SPEED_GAIN = 62;
export const MAX_SPEED = 520;

export const JUMP_VELOCITY = -480;
export const DOUBLE_JUMP_VELOCITY = -400;
export const GRAVITY = 1100;
export const COYOTE_TIME = 120;
export const DASH_SPEED = 600;
export const DASH_DURATION = 250;
export const DASH_COOLDOWN = 800;
export const HIT_STUN_DURATION = 180;
export const HIT_INVULN_DURATION = 1200;
export const STARTING_HEALTH = 3;
export const HIT_BOUNCE_X = 0;
export const HIT_BOUNCE_Y = -180;

export const BASE_SPAWN_INTERVAL = 1780;
export const MIN_SPAWN_INTERVAL = 700;

export const NEAR_MISS_THRESHOLD = 20;
export const NEAR_MISS_BONUS = 50;

export const MERCY_DURATION = 5000;
export const MERCY_SPAWN_MULTIPLIER = 1.5;

export const ORB_SCORE_VALUE = 10;
export const DISTANCE_SCORE_MULTIPLIER = 1;

export const DOUBLE_JUMP_UNLOCK_DISTANCE = 500;

export const FRAME_WIDTH = 240;
export const FRAME_HEIGHT = 128;

export const PLAYER_SCALE = 2.5;

export const PLAYER_BODY_W = 14;
export const PLAYER_BODY_H = 34;
export const PLAYER_OFFSET_X = 111;
export const PLAYER_OFFSET_Y = 44;

export const ZONE_BLEND_DISTANCE = 12500;
export const MILESTONE_INTERVAL = 6250;
export const MILESTONE_SCORE_BONUS = 100;
