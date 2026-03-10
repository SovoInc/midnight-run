# Midnight Runner

Side-scrolling endless runner built with Phaser 3 and a Rust/SQLite backend for scores, achievements, and the Midnight Platform API (PRC-6 / PRC-1).

## Prerequisites

- **Node.js** >= 18
- **Rust** >= 1.75 (with `cargo`)

## Quick Start

```bash
# 1 — Start the backend (runs on :3001)
cd server
cargo run --release

# 2 — In another terminal, start the frontend (runs on :5173)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** and enter an alias to play.

## Controls

| Key | Action |
|-----|--------|
| **Space** / **Up** / tap top half of screen | Jump (double-jump unlocks at 500m) |
| **Down** / tap bottom half of screen | Dash (invulnerable, breaks walls) |

## Project Structure

```
midnight_runner/
├── frontend/            Phaser 3 + TypeScript + Vite
│   ├── src/
│   │   ├── scenes/      Boot, Menu, Game, GameOver, Leaderboard
│   │   ├── objects/     Player, Platform, Obstacle, Collectible
│   │   ├── systems/     Parallax, Difficulty, Achievements
│   │   ├── assets/      Sprites, backgrounds, environment, audio
│   │   ├── config.ts    All tunable game constants
│   │   ├── api.ts       Backend client
│   │   └── main.ts      Phaser bootstrap
│   └── package.json
├── server/              Rust (Actix-web) + SQLite
│   ├── src/
│   │   ├── main.rs
│   │   ├── db.rs
│   │   ├── models.rs
│   │   ├── achievement_defs.rs
│   │   ├── internal_api.rs      /api/*  — game client endpoints
│   │   ├── metrics_api.rs       /metrics/*  — PRC-6 platform API
│   │   └── achievements_api.rs  /achievements/*  — PRC-1 API
│   └── Cargo.toml
└── CREDITS.md
```

## API

| Endpoint | Description |
|----------|-------------|
| `POST /api/register` | Register/login by alias |
| `POST /api/scores` | Submit a run |
| `GET /api/scores/top?limit=N` | Leaderboard |
| `GET /achievements/public/list` | All achievement definitions (PRC-1) |
| `GET /achievements/wallet/:id` | Player achievement progress (PRC-1) |
| `GET /metrics/app` | App metadata (PRC-6) |
| `GET /metrics/channels` | Ranking channels (PRC-6) |

## Build for Production

```bash
# Frontend
cd frontend
npm run build          # outputs to dist/

# Server
cd server
cargo build --release  # binary at target/release/midnight-runner-server
```

Serve `frontend/dist/` with any static file server and point the backend at port 3001 (or adjust the Vite proxy in `vite.config.ts`).
