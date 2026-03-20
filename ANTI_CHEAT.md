# Anti-Cheat Architecture

## Overview

The Midnight Runner server uses a multi-layered approach to prevent score manipulation. No single layer is sufficient on its own — they work together to make cheating impractical.

## Layer 1: Authentication

- Players authenticate via Midnight wallet. The server validates the wallet address format (`mn_shield-addr_` prefix, alphanumeric body, 40-200 chars).
- On wallet registration, the server issues a **Bearer auth token** (UUID) stored in the `auth_tokens` table.
- Auth tokens **expire after 30 days**. Expired tokens are pruned on server startup.
- All run-submitting endpoints require a valid Bearer token matching the player ID.

## Layer 2: JWT Game Sessions

Before a run starts, the client must request a session from the server:

```
POST /api/session/start  { player_id }
```

The server:
1. Creates a session row in the `run_sessions` table (UUID primary key).
2. Returns a **JWT signed with `server_secret + wallet_address`** containing the session ID, player ID, and timestamps.

The JWT secret is randomly generated on each server restart, invalidating all prior session tokens.

### Why this matters

- An attacker cannot forge a session token without knowing both the server secret and the player's wallet address.
- Session tokens are bound to a specific player — they cannot be transferred.
- The `iat` (issued-at) claim establishes a wall-clock start time for plausibility checks.

## Layer 3: Client-Signed Run JWT

When submitting a run, the client does **not** send raw JSON. Instead:

1. The client constructs the run data (distance, orbs, near misses, dashes, etc.).
2. The client signs this data as a **JWT using the session token as the HMAC-SHA256 key**.
3. The client sends `{ session_token, run_token }` to the server.

The server:
1. Decodes `run_token` using `session_token` as the HMAC key — rejects if the signature is invalid.
2. Validates `session_token` using `server_secret + wallet_address` — rejects if forged or expired.
3. Cross-checks that the player ID matches between both tokens.

### Why this matters

- Tampering with any field in the run data invalidates the HMAC signature.
- The run data is cryptographically bound to the session that produced it.
- An attacker cannot mix-and-match sessions and run data.

## Layer 4: One-Time Session Use

Each session token can only be used **once**. The server tracks this in the database:

```sql
UPDATE run_sessions SET used = 1
WHERE token = ?1 AND player_id = ?2 AND used = 0
```

If the session was already consumed, the submission is rejected. This prevents replay attacks.

## Layer 5: Server-Side Score Computation

The client does **not** send the final score. The server computes it from raw metrics:

```
display_distance = floor(raw_distance * 0.04)
score = display_distance + orbs_collected * 10 + near_misses * 50
```

This means even if an attacker could submit arbitrary run data, they cannot inflate the score formula itself.

## Layer 6: Plausibility Validation

The server validates that submitted run metrics are physically possible:

| Check | Rule |
|-------|------|
| No negative values | All metrics >= 0 |
| Duration vs wall-clock | `duration <= session_elapsed + 10s` |
| Distance vs speed | `raw_distance <= MAX_SPEED * duration * 1.1` (520 px/s cap) |
| Near miss rate | `near_misses <= duration * 1.5 + 5` |
| Wall breaks vs dashes | `walls_broken <= dashes_used` |
| Dash rate | `dashes_used <= duration * 2.5 + 5` |

Submissions that violate any rule are rejected with HTTP 422.

## Layer 7: Rate Limiting

A per-IP rate limiter allows **300 requests per 60 seconds**. Beyond that, requests receive HTTP 429 with a `Retry-After` header. The rate limiter state is shared across all server worker threads.

## Attack Summary

| Attack | Prevention |
|--------|-----------|
| Submit fake runs via curl | Requires valid session JWT (can't forge without server secret + wallet) |
| Tamper with run data after signing | HMAC signature verification fails |
| Inflate the score directly | Server computes score from raw metrics, ignores client score |
| Replay a previous submission | Session is marked as used in DB |
| Claim impossible distance | Plausibility check: distance vs speed vs duration vs wall-clock |
| Claim impossible near misses | Rate-capped relative to duration |
| Spam the API | Per-IP rate limiting |
| Forge session tokens | Signed with random server secret + wallet address |
| Use another player's session | JWT contains player ID, cross-checked against auth token |
| Use expired auth tokens | 30-day TTL enforced on validation |
