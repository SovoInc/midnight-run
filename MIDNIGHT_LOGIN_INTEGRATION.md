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

Not implemented:
- Signed challenge / backend cryptographic proof of wallet ownership
- Session tokens / cookies / JWTs
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

## Files Added / Changed

### Frontend

Added:
- `frontend/src/midnight.ts`

Changed:
- `frontend/src/api.ts`
- `frontend/src/scenes/MenuScene.ts`
- `frontend/src/scenes/GameOverScene.ts`
- `frontend/src/scenes/LeaderboardScene.ts`
- `frontend/package.json`
- `frontend/package-lock.json`

### Backend

Changed:
- `server/src/models.rs`
- `server/src/internal_api.rs`
- `server/src/db.rs`
- `server/src/achievements_api.rs`
- `server/src/metrics_api.rs`

### Docs

Changed:
- `README.md`

Added:
- `MIDNIGHT_LOGIN_INTEGRATION.md`

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

### Vite proxy setup

Current dev proxy already supports the API paths needed:

- `/api`
- `/metrics`
- `/achievements`

If another game uses a different frontend dev server, this proxy behavior must be reproduced or wallet registration will fail in local development.

## What To Copy Into Another Game

Minimum reusable pieces:

1. `frontend/src/midnight.ts`
2. Wallet registration client method in `frontend/src/api.ts`
3. Backend `POST /api/wallet` route
4. Backend `upsert_wallet()` DB function
5. Player display logic that prefers `wallet_address`
6. Menu/login UX changes

### Suggested order for another game

1. Add `@midnight-ntwrk/dapp-connector-api`
2. Add wallet helper module
3. Add backend `/api/wallet`
4. Add DB upsert by wallet address
5. Change frontend player bootstrap/login flow
6. Change leaderboard / records display to wallet-first
7. Add auto-reconnect
8. Test with a real Midnight wallet extension

## Recommended Adaptation Checklist

For another game, check these before shipping:

- Does the backend already have a `players` table?
- Is alias still required by schema?
- Are scores keyed by numeric player id or username?
- Do achievements/stats/leaderboards assume alias-only display?
- Does the frontend have a single login screen or several entry points?
- Is the game expected to support mobile web?
- Is the desired Midnight network `preview`, `preprod`, or another env-specific value?

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

## Security Note

This implementation is identity-by-wallet-address after browser wallet connect, not full cryptographic backend authentication.

That means:
- The browser wallet is still the source of the address used to register the player
- The backend does not yet verify a signed challenge proving key ownership
- This is acceptable for a low-friction game login flow, but it is not strong auth

If another game needs stronger guarantees, add:
- server-generated nonce/challenge
- wallet signature over that challenge
- backend verification using Midnight official verification primitives
- session issuance after verification

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
- Reconnect: automatic on menu load
- Display label: `wallet_address` if present, alias otherwise
- Network: env-configured, default `preview`

