# Midnight Wallet Login Integration Guide

This document records the Midnight wallet login work added to `midnight_runner` so the same pattern can be reused in another game.

## Scope

Implemented:
- Browser wallet connect using Midnight DApp Connector API
- Default network selection via environment variable, currently `preview`
- Backend player registration by wallet address with stable `player_id`
- Wallet address used as player identity for scores and records
- Menu login UX with manual connect and automatic reconnect on load
- A distinct `RECONNECTING WALLET...` state during automatic reconnect
- Legacy alias support kept on the backend for older records
- Auth tokens issued on wallet connect, required on all mutating endpoints
- Server-authoritative scoring, inventory, and achievement evaluation

Not implemented:
- Signed challenge / backend cryptographic proof of wallet ownership
- Wallet disconnect through the wallet extension itself
- Multi-wallet selection UI beyond preferring Midnight Lace if present

## External References

Primary docs used:
- `https://docs.midnight.network/api-reference/dapp-connector`
- `https://docs.midnight.network/guides/react-wallet-connect`

Important doc facts used in this integration:
- Wallets are injected under `window.midnight.{walletId}`
- Connect flow is `wallet.connect(networkId)`
- Address retrieval uses `getShieldedAddresses()`
- Connection status uses `getConnectionStatus()`
- `signData()` exists, but it signs with the `unshielded` key, not the shielded address

## High-Level Design

The implemented flow is intentionally simple:

1. Frontend connects to Midnight wallet in the browser.
2. Frontend reads the shielded wallet address.
3. Frontend posts that address to the game backend at `POST /api/wallet`.
4. Backend upserts a player row keyed by `wallet_address`.
5. Backend returns the `player_id`.
6. Frontend stores the returned player object in `localStorage` as `mr_player`.
7. Gameplay, scores, achievements, and leaderboard identity continue to use `player_id` internally.
8. Display identity prefers `wallet_address` over alias.

This means the wallet address becomes the canonical player identifier for records, while the database keeps the numeric `player_id` as the relational key.

## Files Involved

### Frontend

| File | Role |
|------|------|
| `frontend/src/midnight.ts` | Wallet detection, connect, address retrieval |
| `frontend/src/api.ts` | API client with auth token header injection |
| `frontend/src/scenes/MenuScene.ts` | Login UX, token storage/restore, auto-reconnect |
| `frontend/src/scenes/GameScene.ts` | Run session token fetch, raw data collection |
| `frontend/src/scenes/GameOverScene.ts` | Submit run to server, display server-computed results |
| `frontend/src/scenes/CharacterSelectScene.ts` | Fetch inventory from server on open |
| `frontend/src/scenes/LeaderboardScene.ts` | Display wallet-preferring identities |
| `frontend/src/systems/CharacterStore.ts` | Server-backed orb wallet and character unlocks |
| `frontend/src/systems/BoostStore.ts` | Server-backed boost inventory |
| `frontend/src/systems/AchievementManager.ts` | Load achievements for display (evaluation is server-side) |

### Backend

| File | Role |
|------|------|
| `server/src/internal_api.rs` | All endpoints, auth validation helper |
| `server/src/db.rs` | Schema, migrations, all DB methods |
| `server/src/models.rs` | Request/response types |
| `server/src/scoring.rs` | Score computation and run plausibility checks |
| `server/src/achievement_eval.rs` | Server-side achievement evaluation |
| `server/src/achievement_defs.rs` | Achievement metadata (names, descriptions, scores) |
| `server/src/achievements_api.rs` | PRC-1 achievement endpoints |
| `server/src/metrics_api.rs` | PRC-6 metrics/channel endpoints |

### Docs

| File | Role |
|------|------|
| `MIDNIGHT_LOGIN_INTEGRATION.md` | This guide |
| `CLAUDE.md` | Full server architecture reference |

## Frontend Integration

### 1. Install Midnight connector package

Dependency added:

```json
"@midnight-ntwrk/dapp-connector-api": "^4.0.1"
```

Also adjusted test env compatibility:

```json
"jsdom": "^26.1.0"
```

Reason:
- The local environment used Node `20.15.0`
- `jsdom@28.1.0` was not compatible with that runtime and broke Vitest worker startup

### 2. Add a Midnight wallet helper

`frontend/src/midnight.ts` centralizes wallet integration.

Responsibilities:
- Import Midnight DApp connector types and global injection
- Choose default network from `VITE_MIDNIGHT_NETWORK_ID` or fallback to `preview`
- Detect available wallets from `window.midnight`
- Prefer `mnLace` when available
- Connect to the wallet
- Hint wallet permissions usage
- Validate active network via `getConnectionStatus()`
- Fetch the shielded address via `getShieldedAddresses()`
- Normalize wallet-related error messages for UI display

Core runtime contract:

```ts
const connectedApi = await wallet.connect(networkId);
const status = await connectedApi.getConnectionStatus();
const { shieldedAddress } = await connectedApi.getShieldedAddresses();
```

### 3. Replace alias entry UI with wallet connect UI

`frontend/src/scenes/MenuScene.ts` was refactored from alias text entry to wallet login.

Removed concepts:
- Alias text box
- Hidden mobile input
- Alias keyboard handling
- Alias validation rules

Added concepts:
- `CONNECT WALLET` button
- `SWITCH WALLET` button state after connection
- `FORGET WALLET` button
- Connected/disconnected/reconnecting status text
- Automatic reconnect attempt on scene load
- Stored player restore via `localStorage`

Menu states now behave like this:

- Initial load:
  - If auto-connect starts and no player is active, show `RECONNECTING WALLET...`
- Auto-connect success:
  - Show `CONNECTED`
  - Show wallet address
- Auto-connect failure:
  - Quietly fall back to disconnected state
- Manual connect failure:
  - Show user-facing error text

### 4. Add auto-connect on load

Current behavior:
- Menu scene schedules one automatic wallet reconnect attempt with `delayedCall(0, ...)`
- Auto-connect does not spam retries
- Auto-connect does not show an error if no wallet is found or the attempt fails
- Manual connect remains available

This is intentionally conservative. It restores a session when possible without trapping the user in repeated popup requests.

### 5. Extend frontend API client

`frontend/src/api.ts` now includes:

- `registerWallet(walletAddress)` -> `POST /api/wallet`
- `getPlayerIdentifier()` helper
- `truncateIdentifier()` helper

`ScoreEntry` was changed from alias-only to:

```ts
{
  rank: number;
  display_name: string;
  wallet_address: string | null;
  score: number;
  distance: number;
  player_id: number;
}
```

### 6. Update leaderboard display

Both `GameOverScene` and `LeaderboardScene` now render `display_name`, which prefers wallet address.

Because wallet addresses are long, the frontend truncates them for display.

Current display rule:
- Full value if short enough
- Otherwise `prefix...suffix`

## Backend Integration

### 1. Add wallet registration request type

`server/src/models.rs` now includes:

```rust
pub struct WalletRequest {
    pub wallet_address: String,
}
```

### 2. Add `/api/wallet` endpoint

`server/src/internal_api.rs` registers:

```rust
.route("/wallet", web::post().to(post_wallet))
```

Endpoint behavior:
- Accept JSON body with `wallet_address`
- Reject empty address with `400`
- Upsert player by `wallet_address`
- Return existing or new player record

Example request:

```http
POST /api/wallet
Content-Type: application/json

{"wallet_address":"mn_shielded1..."}
```

Example response:

```json
{
  "id": 182,
  "alias": "wallet:mn_shielded1...",
  "wallet_address": "mn_shielded1...",
  "created_at": ""
}
```

### 3. Upsert players by wallet address

`server/src/db.rs` added `upsert_wallet()`.

Implementation detail:
- Alias is still required by the schema
- Wallet-created players get a synthetic alias of `wallet:{wallet_address}`

This preserves compatibility with existing schema and older alias-based code without adding a migration.

### 4. Keep numeric `player_id` as the main relational key

No gameplay tables were rewritten.

The database still uses:
- `players.id` as PK
- `scores.player_id`
- `achievements.player_id`

Only the player registration and display identity changed.

This was the correct low-risk implementation because it avoids rewriting every table to use address strings directly.

### 5. Change score read models to prefer wallet identity

`top_scores()` and `player_scores()` now query:

```sql
COALESCE(p.wallet_address, p.alias)
```

The backend returns:
- `display_name`
- `wallet_address`
- `player_id`

This lets the frontend render wallet identities for new users while preserving alias users.

### 6. Keep legacy alias compatibility

Alias registration was not removed.

Still supported:
- `POST /api/alias`
- existing alias-only players
- PRC endpoints resolving `alias:{alias}`

This is useful if another game needs a staged rollout instead of a hard cutover.

## Metrics / Achievements API Adjustments

Because PRC endpoints also expose player identity, those responses were updated to prefer wallet addresses when present.

Changed behavior:
- `achievements_api.rs`: `user_name` prefers `wallet_address`
- `metrics_api.rs`: `display_name` prefers `wallet_address`
- channel queries already emitted canonical address-like output and were updated to use a wallet-preferred display label

## Network Configuration

Current default network:
- `preview`

Configured in frontend only:

```ts
export const MIDNIGHT_NETWORK_ID = import.meta.env.VITE_MIDNIGHT_NETWORK_ID ?? "preview";
```

For another game, this should remain environment-driven.

Recommended deployment pattern:

```bash
VITE_MIDNIGHT_NETWORK_ID=preview
```

Do not hard-code different networks in multiple UI locations. Keep one source of truth in the wallet helper and reference it in menu copy.

## Operational Notes

### Backend restart is required

A frontend build alone is not enough. After backend route changes, the Rust server must be restarted.

Observed failure mode:
- Frontend called `POST /api/wallet`
- Vite proxy was correct
- Running backend still returned `404`
- Root cause: old server process was still running

Fix:
- Restart the Rust server after changing backend routes

### Async session tokens and game timers

If the game creates a run session token asynchronously (fire-and-forget in the game scene's `create()`), the server's `created_at` timestamp can lag behind the game engine's internal timer by several seconds due to network round-trip. This means the client's reported `duration_secs` can exceed the server's `session_elapsed` calculation.

Use a generous tolerance (10+ seconds) on the duration-vs-session-elapsed check, or await the session token before starting the game timer. The other plausibility checks (max distance vs speed, action rate caps) are more reliable anti-cheat signals than timing precision.

### Wallet network migration

If a player connects with a wallet that was previously registered on a different network, the backend should update the player's `network_id` rather than creating a duplicate row. Query by `wallet_address` alone (not `wallet_address + network_id`) when looking up existing players.

### Auto-connect should respect logout

If auto-connect fires on every page load, the wallet extension popup will appear even after the user explicitly logged out. Gate auto-connect on having a saved player session in localStorage. If the user logged out (clearing `mr_player`), skip auto-connect entirely.

### Clear all client state on logout

On logout, clear:
- `mr_player` and `mr_auth_token` from localStorage
- In-memory auth token (so API calls stop authenticating)
- In-memory inventory cache (so a different player logging in doesn't see stale orbs/characters)

If any in-memory state survives logout, the next player to log in on the same browser session will see the previous player's cached data until a server fetch overwrites it.

### Vite proxy setup

Current dev proxy already supports the API paths needed:

- `/api`
- `/metrics`
- `/achievements`

If another game uses a different frontend dev server, this proxy behavior must be reproduced or wallet registration will fail in local development.

## What To Copy Into Another Game

Minimum reusable pieces:

1. `frontend/src/midnight.ts` — wallet detection, connect, address retrieval
2. Wallet registration + auth token client method in `frontend/src/api.ts`
3. Backend `POST /api/wallet` route with auth token issuance
4. Backend `upsert_wallet()` and `create_auth_token()` DB functions
5. Auth token validation helper for protected endpoints
6. Player display logic that prefers `wallet_address`
7. Menu/login UX changes with token storage and restore

If the game has scoring or economy:

8. Run session token flow (`POST /api/session/start` + `POST /api/run`)
9. Server-side score computation and validation
10. Server-side inventory table and purchase/consume endpoints
11. Server-side achievement evaluation

### Suggested implementation order

1. Add `@midnight-ntwrk/dapp-connector-api`
2. Add wallet helper module
3. Add backend `/api/wallet` with auth token issuance
4. Add DB upsert by wallet address + auth token table
5. Add auth validation helper, protect all mutating endpoints
6. Change frontend player bootstrap/login flow, store and send auth token
7. Add auto-reconnect with token restore
8. Move scoring to server (run sessions, validation, computation)
9. Move inventory to server (currency, unlocks, consumables)
10. Move achievement evaluation to server
11. Test with a real Midnight wallet extension

## Recommended Adaptation Checklist

For another game, check these before shipping:

- Does the backend already have a `players` table?
- Is alias still required by schema?
- Are scores keyed by numeric player id or username?
- Do achievements/stats/leaderboards assume alias-only display?
- Does the frontend have a single login screen or several entry points?
- Is the game expected to support mobile web?
- Is the desired Midnight network `preview`, `preprod`, or another env-specific value?
- Does the game have server-side score computation, or does it trust the client?
- Does the game have purchasable items or currency? If so, is the server authoritative?
- Are all mutating API endpoints protected by auth tokens?

## Verification Performed In This Repo

Verified successfully:
- `cargo check`
- `npm run build`
- `npm test`
- Live route check for `POST /api/wallet`

Manual verification still needed outside this environment:
- Real wallet extension installed in browser
- Actual popup approval flow
- Real account reconnect behavior across refreshes
- Real shielded address registration on selected network

## Security: Auth Tokens

### How it works

The wallet connect endpoint (`POST /api/wallet`) returns a UUID `auth_token` alongside the player record. The frontend should:

1. Store the token (e.g. `localStorage`)
2. Send it as `Authorization: Bearer <token>` on every API request
3. Restore it on page load alongside the saved player data

The backend should:

1. Generate the token on wallet registration/login
2. Store it in an `auth_tokens` table keyed by `player_id`
3. Validate the token on every mutating endpoint
4. Reject requests where the token's `player_id` does not match the request body's `player_id`

Public read endpoints (leaderboard, top scores, achievement lists) can remain open.

This prevents cross-player impersonation — a token for player A cannot modify player B's inventory or submit runs on their behalf.

### What auth tokens do NOT cover

The backend does not verify a signed challenge proving wallet key ownership. Anyone who can call `POST /api/wallet` with a wallet address gets a token for that address.

This is acceptable for a low-friction game login flow. If your game needs stronger guarantees, add:
- Server-generated nonce/challenge
- Wallet signature over that challenge
- Backend verification using Midnight verification primitives
- Session issuance only after verification

## Server-Authoritative Game State

### Why

If the client computes scores and manages inventory locally, anyone can POST fake scores or grant themselves unlimited orbs. The server must be the source of truth for anything that appears on a leaderboard or costs currency.

### Run sessions

Issue a one-time session token at run start. On death, the client submits raw inputs (not a computed score) with this token. The server should:

1. Validate the token hasn't been reused and belongs to the authenticated player
2. Check plausibility — duration vs wall-clock elapsed time, distance vs max theoretical speed, rate caps on actions like dashes and near misses
3. Compute the score deterministically from the raw inputs
4. Credit earned currency to the player's inventory
5. Evaluate achievements against cumulative DB stats (query after inserting the score row so the current run is included)
6. Return the authoritative score, currency balance, and newly unlocked achievements

The client can still show a HUD score estimate during gameplay for responsiveness. The game over screen should display the server-computed values.

### Server-side inventory

Store currency balance, unlocked items, and consumable counts in the database. The client should:

- Fetch inventory from the server when entering the store
- Send purchase/consume requests to the server (never deduct locally)
- Update its in-memory cache from the server response

Item costs must be defined server-side. If the client defines a different price than the server, the server's price wins.

### Keeping definitions in sync

If your game has achievements, they will exist in three places:

1. Server evaluation logic (which achievements to grant based on run stats)
2. Server metadata (names, descriptions, scores for PRC endpoints)
3. Client display definitions (names, hints, progress bars)

Keep these in sync. A mismatch means the client shows progress for an achievement the server will never grant, or vice versa.

Same applies to item costs and boost definitions — define them server-side as the authority, and keep client-side labels consistent.

### What stays in localStorage

Only cosmetic preferences (e.g. selected character) and offline caches belong in localStorage. The server should never trust localStorage-derived values for scoring, currency, or ownership.

## Known Constraint About Signed Challenges

Midnight DApp connector `signData()` signs with the `unshielded` key, while this game currently uses the `shieldedAddress` as the public player identifier.

That means a secure challenge flow needs an explicit identity design decision:
- either authenticate and identify users by unshielded address
- or authenticate with unshielded key and separately bind that key to the chosen public game identity

That work was investigated but not implemented in this repo.

## Recommended Default for Another Game

If the other game wants the same behavior with minimal risk, reuse this exact design:

- Public player identity: shielded wallet address
- Backend relational key: numeric `player_id`
- Browser login: Midnight wallet connect
- Auth: UUID token issued on wallet connect, sent as `Authorization: Bearer <token>`
- Reconnect: automatic on menu load only if saved session exists (skip after logout)
- Display label: `wallet_address` if present, alias otherwise
- Network: env-configured, default `preview`
- Scoring: server computes from raw inputs, client shows HUD estimate during play
- Economy: server stores balances, validates purchases, credits currency on run completion
- Achievements: server evaluates after score insertion, returns newly unlocked in run response

