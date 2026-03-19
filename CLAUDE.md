# Midnight Run

Phaser 3 endless runner with a Rust/Actix-web backend and Midnight Lace wallet auth.

## Quick Start

```bash
# Server (port 3001)
cd server && cargo run

# Frontend dev server
cd frontend && npm run dev
```

## Architecture

- **`frontend/`** — Phaser 3 game (TypeScript, Vite)
- **`server/`** — Actix-web API + SQLite (Rust)

The server is the **source of truth** for scoring, achievements, inventory, and player state. The client shows a HUD estimate during gameplay but uses the server-computed values on game over.

## Server

### Auth

- `POST /api/wallet` registers/logs in a player via Midnight wallet address and returns an `auth_token`
- All mutating endpoints require `Authorization: Bearer <token>` header
- The token is validated against the `auth_tokens` table and must match the `player_id` in the request body
- Public read endpoints (leaderboard, top scores) don't require auth

### Score Flow

1. Client calls `POST /api/session/start` at run start — gets a one-time `session_token`
2. During gameplay, client tracks raw inputs (distance, orbs, near misses, dashes, walls broken)
3. On death, client calls `POST /api/run` with raw inputs + session token
4. Server **validates** plausibility (duration vs elapsed, max distance, rate caps, walls <= dashes)
5. Server **computes** score: `floor(raw_distance * 0.04) + orbs * 10 + near_misses * 50`
6. Server **evaluates** achievements against cumulative DB stats
7. Server **credits** orbs to `player_inventory`
8. Returns `RunResult` with authoritative score, distance, orb balance, and new achievements

### Inventory

- `GET /api/inventory?player_id=N` — orb balance, unlocked characters, boost counts
- `POST /api/inventory/purchase-character` — server validates cost and balance
- `POST /api/inventory/purchase-boost` — server validates cost and balance
- `POST /api/inventory/consume-boost` — decrements server-side

Character costs are defined server-side in `internal_api.rs` (`character_cost()`). The client never deducts orbs locally.

### DB Schema

Key tables: `players`, `scores`, `achievements`, `player_inventory`, `run_sessions`, `auth_tokens`, `session_wallets`.

Migrations use a conditional `ALTER TABLE` pattern — check if a column exists before adding it. See `db.rs::init_schema()`.

### Validation Thresholds (scoring.rs)

| Check | Formula |
|-------|---------|
| Duration | `claimed_duration <= session_elapsed + 2s` |
| Distance | `raw_distance <= MAX_SPEED(520) * duration * 1.1` |
| Near misses | `count <= duration * 1.5 + 5` |
| Dashes | `count <= duration * 2.5 + 5` |
| Walls | `walls_broken <= dashes_used` |

### Achievement Definitions

Defined in both `server/src/achievement_defs.rs` (display metadata) and `server/src/achievement_eval.rs` (evaluation logic). The 10 achievements mirror the client-side definitions. Cumulative checks query DB aggregates after the score row is inserted so the current run is included.

## Frontend

### Key Patterns

- `CharacterStore.ts` — in-memory cache of server inventory, fetched via `initInventory()` on store open
- `BoostStore.ts` — reads from cached inventory, all mutations go through server API
- `AchievementManager.ts` — only loads existing achievements for display; evaluation is server-side
- `GameScene.ts` — fetches session token on `create()`, passes raw data to GameOverScene on death
- `GameOverScene.ts` — calls `api.submitRun()`, uses server response for display, falls back to client values if offline

### localStorage Keys (all scoped to player)

| Key | Purpose |
|-----|---------|
| `mr_player` | Cached PlayerData JSON |
| `mr_auth_token` | Server auth token |
| `mr_selected_char_{playerId}` | Selected character (cosmetic) |
| `mr_progress_{playerId}_{networkId}` | Local progress cache |

## Tips

- Delete `midnight_runner.db` to reset all server state during development
- The legacy `POST /api/scores` endpoint still exists but requires auth; prefer `POST /api/run`
- When adding a new character, update both `CharacterRegistry.ts` (client) and `character_cost()` in `internal_api.rs` (server)
- When adding a new achievement, update `achievement_defs.rs`, `achievement_eval.rs`, and `AchievementManager.ts` DEFINITIONS
- When adding a new boost, update `BOOST_DEFS` in `BoostStore.ts` and `boost_cost()` in `internal_api.rs`
- Run `cargo build` in `server/` and `npx tsc --noEmit` in `frontend/` to verify before committing
- Tests: `npx vitest run` in `frontend/`
