use rusqlite::{Connection, Result, params};
use std::sync::Mutex;
use uuid::Uuid;

pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
    fn wallet_alias(wallet_address: &str) -> String {
        format!("wallet:{wallet_address}")
    }

    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let db = Db { conn: Mutex::new(conn) };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alias TEXT UNIQUE NOT NULL,
                wallet_address TEXT UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS session_wallets (
                session_address TEXT PRIMARY KEY,
                main_player_id INTEGER NOT NULL REFERENCES players(id),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL REFERENCES players(id),
                score INTEGER NOT NULL,
                distance INTEGER NOT NULL,
                orbs_collected INTEGER NOT NULL DEFAULT 0,
                near_misses INTEGER NOT NULL DEFAULT 0,
                dashes_used INTEGER NOT NULL DEFAULT 0,
                walls_broken INTEGER NOT NULL DEFAULT 0,
                duration_secs REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL REFERENCES players(id),
                achievement_key TEXT NOT NULL,
                unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(player_id, achievement_key)
            );

            CREATE TABLE IF NOT EXISTS player_inventory (
                player_id INTEGER PRIMARY KEY REFERENCES players(id),
                orb_balance INTEGER NOT NULL DEFAULT 0,
                unlocked_characters TEXT NOT NULL DEFAULT '',
                boost_speed INTEGER NOT NULL DEFAULT 0,
                boost_magnet INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
                token TEXT PRIMARY KEY,
                player_id INTEGER NOT NULL REFERENCES players(id),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS run_sessions (
                token TEXT PRIMARY KEY,
                player_id INTEGER NOT NULL REFERENCES players(id),
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                used INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_scores_ranking ON scores(score DESC);
            CREATE INDEX IF NOT EXISTS idx_scores_created ON scores(created_at);
            CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
            CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);
            CREATE INDEX IF NOT EXISTS idx_session_wallets_player ON session_wallets(main_player_id);
            ",
        )?;

        // Migration: add network_id to players
        let has_network_id: bool = conn.prepare("SELECT network_id FROM players LIMIT 0")
            .is_ok();
        if !has_network_id {
            conn.execute_batch(
                "ALTER TABLE players ADD COLUMN network_id TEXT NOT NULL DEFAULT 'legacy';
                 CREATE UNIQUE INDEX IF NOT EXISTS idx_players_wallet_network ON players(wallet_address, network_id);",
            )?;
        }

        // One-time migration: re-tag pre-network players as legacy.
        // The network_id column was added with DEFAULT 'preview' (or 'legacy'),
        // but players created before the network-aware registration flow should be
        // on 'legacy'. We detect this via a migration flag stored in a pragma.
        let migrated: String = conn.query_row(
            "SELECT COALESCE((SELECT value FROM _migrations WHERE key = 'legacy_retag'), '')",
            [],
            |r| r.get(0),
        ).unwrap_or_default();
        if migrated.is_empty() {
            conn.execute_batch("CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY, value TEXT NOT NULL)")?;
            conn.execute(
                "UPDATE players SET network_id = 'legacy' WHERE network_id = 'preview'",
                [],
            )?;
            conn.execute(
                "INSERT OR REPLACE INTO _migrations (key, value) VALUES ('legacy_retag', 'done')",
                [],
            )?;
        }

        // Migration: add raw_distance, damage_taken, reached_max_speed to scores
        let has_raw_distance: bool = conn.prepare("SELECT raw_distance FROM scores LIMIT 0").is_ok();
        if !has_raw_distance {
            conn.execute_batch(
                "ALTER TABLE scores ADD COLUMN raw_distance REAL NOT NULL DEFAULT 0;
                 ALTER TABLE scores ADD COLUMN damage_taken INTEGER NOT NULL DEFAULT 0;
                 ALTER TABLE scores ADD COLUMN reached_max_speed INTEGER NOT NULL DEFAULT 0;",
            )?;
        }

        Ok(())
    }

    pub fn create_run_session(&self, player_id: i64) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let token = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO run_sessions (token, player_id) VALUES (?1, ?2)",
            params![token, player_id],
        )?;
        Ok(token)
    }

    /// Atomically marks a run session as used. Returns (valid, created_at).
    pub fn consume_run_session(&self, token: &str, player_id: i64) -> Result<(bool, String)> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT player_id, created_at, used FROM run_sessions WHERE token = ?1",
            params![token],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)),
        );
        match result {
            Ok((pid, created_at, used)) => {
                if pid != player_id || used != 0 {
                    return Ok((false, String::new()));
                }
                conn.execute(
                    "UPDATE run_sessions SET used = 1 WHERE token = ?1",
                    params![token],
                )?;
                Ok((true, created_at))
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok((false, String::new())),
            Err(e) => Err(e),
        }
    }

    /// Create an auth token for a player. Returns the token string.
    pub fn create_auth_token(&self, player_id: i64) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        let token = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO auth_tokens (token, player_id) VALUES (?1, ?2)",
            params![token, player_id],
        )?;
        Ok(token)
    }

    /// Validate an auth token. Returns Some(player_id) if valid.
    pub fn validate_auth_token(&self, token: &str) -> Result<Option<i64>> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT player_id FROM auth_tokens WHERE token = ?1",
            params![token],
            |r| r.get::<_, i64>(0),
        );
        match result {
            Ok(pid) => Ok(Some(pid)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn delete_auth_tokens(&self, player_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM auth_tokens WHERE player_id = ?1", params![player_id])?;
        Ok(())
    }

    /// Ensure inventory row exists for player, return (orb_balance, unlocked_characters, boost_speed, boost_magnet)
    pub fn get_inventory(&self, player_id: i64) -> Result<(i64, Vec<String>, i64, i64)> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO player_inventory (player_id) VALUES (?1)",
            params![player_id],
        )?;
        let row = conn.query_row(
            "SELECT orb_balance, unlocked_characters, boost_speed, boost_magnet FROM player_inventory WHERE player_id = ?1",
            params![player_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)?)),
        )?;
        let mut chars: Vec<String> = serde_json::from_str(&row.1).unwrap_or_default();
        if !chars.contains(&"default".to_string()) {
            chars.insert(0, "default".to_string());
        }
        Ok((row.0, chars, row.2, row.3))
    }

    /// Credit orbs to a player's balance. Returns new balance.
    pub fn credit_orbs(&self, player_id: i64, amount: i64) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO player_inventory (player_id) VALUES (?1)",
            params![player_id],
        )?;
        conn.execute(
            "UPDATE player_inventory SET orb_balance = orb_balance + ?2 WHERE player_id = ?1",
            params![player_id, amount],
        )?;
        let balance: i64 = conn.query_row(
            "SELECT orb_balance FROM player_inventory WHERE player_id = ?1",
            params![player_id], |r| r.get(0),
        )?;
        Ok(balance)
    }

    /// Purchase a character. Returns Ok(new_balance) or Err if insufficient orbs or already owned.
    pub fn purchase_character(&self, player_id: i64, character_id: &str, cost: i64) -> Result<std::result::Result<i64, String>> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO player_inventory (player_id) VALUES (?1)",
            params![player_id],
        )?;
        let (balance, chars_json): (i64, String) = conn.query_row(
            "SELECT orb_balance, unlocked_characters FROM player_inventory WHERE player_id = ?1",
            params![player_id], |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let mut chars: Vec<String> = serde_json::from_str(&chars_json).unwrap_or_else(|_| vec!["default".to_string()]);
        if chars.contains(&character_id.to_string()) {
            return Ok(Err("already_owned".to_string()));
        }
        if balance < cost {
            return Ok(Err("insufficient_orbs".to_string()));
        }
        chars.push(character_id.to_string());
        let new_json = serde_json::to_string(&chars).unwrap();
        let new_balance = balance - cost;
        conn.execute(
            "UPDATE player_inventory SET orb_balance = ?2, unlocked_characters = ?3 WHERE player_id = ?1",
            params![player_id, new_balance, new_json],
        )?;
        Ok(Ok(new_balance))
    }

    /// Purchase a boost. Returns Ok(new_balance) or Err if insufficient orbs.
    pub fn purchase_boost(&self, player_id: i64, boost_id: &str, cost: i64) -> Result<std::result::Result<(i64, i64), String>> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO player_inventory (player_id) VALUES (?1)",
            params![player_id],
        )?;
        let col = match boost_id {
            "speed_boost" => "boost_speed",
            "orb_magnet" => "boost_magnet",
            _ => return Ok(Err("unknown_boost".to_string())),
        };
        let balance: i64 = conn.query_row(
            "SELECT orb_balance FROM player_inventory WHERE player_id = ?1",
            params![player_id], |r| r.get(0),
        )?;
        if balance < cost {
            return Ok(Err("insufficient_orbs".to_string()));
        }
        let new_balance = balance - cost;
        let q = format!("UPDATE player_inventory SET orb_balance = ?2, {} = {} + 1 WHERE player_id = ?1", col, col);
        conn.execute(&q, params![player_id, new_balance])?;
        let count: i64 = conn.query_row(
            &format!("SELECT {} FROM player_inventory WHERE player_id = ?1", col),
            params![player_id], |r| r.get(0),
        )?;
        Ok(Ok((new_balance, count)))
    }

    /// Consume a boost. Returns Ok(new_count) or Err if none available.
    pub fn consume_boost(&self, player_id: i64, boost_id: &str) -> Result<std::result::Result<i64, String>> {
        let conn = self.conn.lock().unwrap();
        let col = match boost_id {
            "speed_boost" => "boost_speed",
            "orb_magnet" => "boost_magnet",
            _ => return Ok(Err("unknown_boost".to_string())),
        };
        let count: i64 = conn.query_row(
            &format!("SELECT COALESCE({}, 0) FROM player_inventory WHERE player_id = ?1", col),
            params![player_id], |r| r.get(0),
        ).unwrap_or(0);
        if count <= 0 {
            return Ok(Err("no_boosts".to_string()));
        }
        let q = format!("UPDATE player_inventory SET {} = {} - 1 WHERE player_id = ?1", col, col);
        conn.execute(&q, params![player_id])?;
        Ok(Ok(count - 1))
    }

    pub fn upsert_alias(&self, alias: &str) -> Result<(i64, String, Option<String>)> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO players (alias) VALUES (?1)",
            params![alias],
        )?;
        let mut stmt = conn.prepare(
            "SELECT id, alias, wallet_address FROM players WHERE alias = ?1",
        )?;
        let row = stmt.query_row(params![alias], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })?;
        Ok(row)
    }

    pub fn upsert_wallet(&self, wallet_address: &str, network_id: &str) -> Result<(i64, String, Option<String>, String)> {
        let conn = self.conn.lock().unwrap();
        let alias = Self::wallet_alias(wallet_address);
        conn.execute(
            "INSERT OR IGNORE INTO players (alias, wallet_address, network_id) VALUES (?1, ?2, ?3)",
            params![alias, wallet_address, network_id],
        )?;
        // Update network_id if wallet already existed with a different one
        conn.execute(
            "UPDATE players SET network_id = ?2 WHERE wallet_address = ?1",
            params![wallet_address, network_id],
        )?;
        let mut stmt = conn.prepare(
            "SELECT id, alias, wallet_address, network_id FROM players WHERE wallet_address = ?1",
        )?;
        let row = stmt.query_row(params![wallet_address], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        Ok(row)
    }

    pub fn insert_score(
        &self, player_id: i64, score: i64, distance: i64,
        orbs: i64, near_misses: i64, dashes: i64, walls: i64, duration: f64,
        raw_distance: f64, damage_taken: bool, reached_max_speed: bool,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO scores (player_id, score, distance, orbs_collected, near_misses, dashes_used, walls_broken, duration_secs, raw_distance, damage_taken, reached_max_speed) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![player_id, score, distance, orbs, near_misses, dashes, walls, duration, raw_distance, damage_taken as i64, reached_max_speed as i64],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn top_scores(&self, limit: i64, network_id: &str) -> Result<Vec<(i64, String, Option<String>, i64, i64, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, COALESCE(p.wallet_address, p.alias), p.wallet_address, s.score, s.distance, s.player_id
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE p.network_id = ?2
             ORDER BY s.score DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit, network_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn player_scores(&self, player_id: i64) -> Result<Vec<(i64, String, Option<String>, i64, i64, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, COALESCE(p.wallet_address, p.alias), p.wallet_address, s.score, s.distance, s.player_id
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.player_id = ?1 ORDER BY s.score DESC LIMIT 20",
        )?;
        let rows = stmt.query_map(params![player_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn unlock_achievement(&self, player_id: i64, key: &str) -> Result<String> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO achievements (player_id, achievement_key) VALUES (?1, ?2)",
            params![player_id, key],
        )?;
        Ok("ok".to_string())
    }

    pub fn player_achievements(&self, player_id: i64) -> Result<Vec<(String, String)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT achievement_key, unlocked_at FROM achievements WHERE player_id = ?1",
        )?;
        let rows = stmt.query_map(params![player_id], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn total_players(&self, network_id: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM players WHERE network_id = ?1",
            params![network_id], |r| r.get(0),
        )?;
        Ok(count)
    }

    pub fn achievement_unlock_count(&self, key: &str, network_id: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT a.player_id) FROM achievements a JOIN players p ON a.player_id = p.id WHERE a.achievement_key = ?1 AND p.network_id = ?2",
            params![key, network_id], |r| r.get(0),
        )?;
        Ok(count)
    }

    pub fn channel_leaderboard(
        &self, start: &str, end: &str, limit: i64, offset: i64, network_id: &str,
    ) -> Result<(i64, f64, Vec<(String, Option<String>, f64)>)> {
        let conn = self.conn.lock().unwrap();
        let total_players: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.player_id) FROM scores s JOIN players p ON s.player_id = p.id WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?3",
            params![start, end, network_id], |r| r.get(0),
        )?;
        let total_score: f64 = conn.query_row(
            "SELECT COALESCE(SUM(best), 0) FROM (SELECT MAX(s.score) as best FROM scores s JOIN players p ON s.player_id = p.id WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?3 GROUP BY s.player_id)",
            params![start, end, network_id], |r| r.get(0),
        )?;
        let mut stmt = conn.prepare(
            "SELECT COALESCE(p.wallet_address, 'alias:' || p.alias), COALESCE(p.wallet_address, p.alias), MAX(s.score) as best
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?5
             GROUP BY s.player_id ORDER BY best DESC LIMIT ?3 OFFSET ?4",
        )?;
        let rows = stmt.query_map(params![start, end, limit, offset, network_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, f64>(2)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok((total_players, total_score, rows))
    }

    pub fn channel_cumulative(
        &self, column: &str, start: &str, end: &str, limit: i64, offset: i64, network_id: &str,
    ) -> Result<(i64, f64, Vec<(String, Option<String>, f64)>)> {
        let conn = self.conn.lock().unwrap();
        let col = match column {
            "orbs_collected" | "distance" | "near_misses" | "dashes_used" | "walls_broken" => column,
            _ => return Ok((0, 0.0, vec![])),
        };
        let total_players: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.player_id) FROM scores s JOIN players p ON s.player_id = p.id WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?3",
            params![start, end, network_id], |r| r.get(0),
        )?;

        let q_total_score = format!(
            "SELECT COALESCE(SUM(s.{}), 0) FROM scores s JOIN players p ON s.player_id = p.id WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?3", col
        );
        let total_score: f64 = conn.query_row(&q_total_score, params![start, end, network_id], |r| r.get(0))?;

        let q = format!(
            "SELECT COALESCE(p.wallet_address, 'alias:' || p.alias), COALESCE(p.wallet_address, p.alias), SUM(s.{}) as total
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?5
             GROUP BY s.player_id ORDER BY total DESC LIMIT ?3 OFFSET ?4", col
        );
        let mut stmt = conn.prepare(&q)?;
        let rows = stmt.query_map(params![start, end, limit, offset, network_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, f64>(2)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok((total_players, total_score, rows))
    }

    pub fn channel_interactions(
        &self, start: &str, end: &str, limit: i64, offset: i64, network_id: &str,
    ) -> Result<(i64, f64, Vec<(String, Option<String>, f64)>)> {
        let conn = self.conn.lock().unwrap();
        let total_players: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT s.player_id) FROM scores s JOIN players p ON s.player_id = p.id WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?3",
            params![start, end, network_id], |r| r.get(0),
        )?;
        let total_score: f64 = conn.query_row(
            "SELECT CAST(COUNT(*) AS REAL) FROM scores s JOIN players p ON s.player_id = p.id WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?3",
            params![start, end, network_id], |r| r.get(0),
        )?;
        let mut stmt = conn.prepare(
            "SELECT COALESCE(p.wallet_address, 'alias:' || p.alias), COALESCE(p.wallet_address, p.alias), CAST(COUNT(*) AS REAL) as runs
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.created_at >= ?1 AND s.created_at <= ?2 AND p.network_id = ?5
             GROUP BY s.player_id ORDER BY runs DESC LIMIT ?3 OFFSET ?4",
        )?;
        let rows = stmt.query_map(params![start, end, limit, offset, network_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, f64>(2)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok((total_players, total_score, rows))
    }

    pub fn resolve_player_by_address(&self, address: &str) -> Result<Option<(i64, String, Option<String>, Vec<String>)>> {
        let conn = self.conn.lock().unwrap();

        // Try wallet_address first
        let maybe = conn.query_row(
            "SELECT id, alias, wallet_address FROM players WHERE wallet_address = ?1",
            params![address],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?)),
        );
        if let Ok((id, alias, wallet)) = maybe {
            let mut stmt = conn.prepare("SELECT session_address FROM session_wallets WHERE main_player_id = ?1")?;
            let sessions: Vec<String> = stmt.query_map(params![id], |r| r.get(0))?.collect::<Result<Vec<_>>>()?;
            return Ok(Some((id, alias, wallet, sessions)));
        }

        // Try session wallet
        let maybe_session = conn.query_row(
            "SELECT main_player_id FROM session_wallets WHERE session_address = ?1",
            params![address],
            |row| row.get::<_, i64>(0),
        );
        if let Ok(pid) = maybe_session {
            let (alias, wallet): (String, Option<String>) = conn.query_row(
                "SELECT alias, wallet_address FROM players WHERE id = ?1",
                params![pid], |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            let mut stmt = conn.prepare("SELECT session_address FROM session_wallets WHERE main_player_id = ?1")?;
            let sessions: Vec<String> = stmt.query_map(params![pid], |r| r.get(0))?.collect::<Result<Vec<_>>>()?;
            return Ok(Some((pid, alias, wallet, sessions)));
        }

        // Try alias-based address
        if let Some(alias) = address.strip_prefix("alias:") {
            let maybe_alias = conn.query_row(
                "SELECT id, alias, wallet_address FROM players WHERE alias = ?1",
                params![alias],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?)),
            );
            if let Ok((id, alias, wallet)) = maybe_alias {
                let mut stmt = conn.prepare("SELECT session_address FROM session_wallets WHERE main_player_id = ?1")?;
                let sessions: Vec<String> = stmt.query_map(params![id], |r| r.get(0))?.collect::<Result<Vec<_>>>()?;
                return Ok(Some((id, alias, wallet, sessions)));
            }
        }

        Ok(None)
    }

    pub fn player_aggregate(&self, player_id: i64, column: &str) -> Result<f64> {
        let conn = self.conn.lock().unwrap();
        let col = match column {
            "orbs_collected" | "distance" | "near_misses" | "dashes_used" | "walls_broken" => column,
            "score" => "score",
            "runs" => return {
                let c: f64 = conn.query_row(
                    "SELECT CAST(COUNT(*) AS REAL) FROM scores WHERE player_id = ?1",
                    params![player_id], |r| r.get(0),
                )?;
                Ok(c)
            },
            "max_score" => return {
                let c: f64 = conn.query_row(
                    "SELECT COALESCE(MAX(score), 0) FROM scores WHERE player_id = ?1",
                    params![player_id], |r| r.get(0),
                )?;
                Ok(c)
            },
            "max_distance" => return {
                let c: f64 = conn.query_row(
                    "SELECT COALESCE(MAX(distance), 0) FROM scores WHERE player_id = ?1",
                    params![player_id], |r| r.get(0),
                )?;
                Ok(c)
            },
            "max_near_misses" => return {
                let c: f64 = conn.query_row(
                    "SELECT COALESCE(MAX(near_misses), 0) FROM scores WHERE player_id = ?1",
                    params![player_id], |r| r.get(0),
                )?;
                Ok(c)
            },
            "max_walls_broken" => return {
                let c: f64 = conn.query_row(
                    "SELECT COALESCE(MAX(walls_broken), 0) FROM scores WHERE player_id = ?1",
                    params![player_id], |r| r.get(0),
                )?;
                Ok(c)
            },
            _ => return Ok(0.0),
        };
        let q = format!("SELECT COALESCE(SUM({}), 0) FROM scores WHERE player_id = ?1", col);
        let v: f64 = conn.query_row(&q, params![player_id], |r| r.get(0))?;
        Ok(v)
    }

    pub fn player_stats(&self, player_id: i64) -> Result<(i64, i64, i64, i64, i64, i64, i64, i64, i64, bool)> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT
                COUNT(*) as total_runs,
                COALESCE(SUM(distance), 0) as total_distance,
                COALESCE(SUM(orbs_collected), 0) as total_orbs,
                COALESCE(SUM(dashes_used), 0) as total_dashes,
                COALESCE(MAX(score), 0) as best_score,
                COALESCE(MAX(distance), 0) as best_distance,
                COALESCE(MAX(near_misses), 0) as best_near_misses,
                COALESCE(MAX(walls_broken), 0) as best_walls_broken
             FROM scores WHERE player_id = ?1"
        )?;
        let (total_runs, total_distance, total_orbs, total_dashes,
             best_score, best_distance, best_near_misses, best_walls_broken): (i64, i64, i64, i64, i64, i64, i64, i64) =
            stmt.query_row(params![player_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                    row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?))
            })?;

        let best_no_damage_distance: i64 = conn.query_row(
            "SELECT COALESCE(MAX(distance), 0) FROM scores WHERE player_id = ?1 AND damage_taken = 0",
            params![player_id], |r| r.get(0),
        )?;

        let max_speed_reached: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM scores WHERE player_id = ?1 AND reached_max_speed = 1)",
            params![player_id], |r| r.get::<_, bool>(0),
        )?;

        Ok((total_runs, total_distance, total_orbs, total_dashes,
            best_score, best_distance, best_near_misses, best_walls_broken,
            best_no_damage_distance, max_speed_reached))
    }

    pub fn player_rank_in_channel(&self, player_id: i64, channel: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        match channel {
            "leaderboard" => {
                let score: f64 = conn.query_row(
                    "SELECT COALESCE(MAX(score), 0) FROM scores WHERE player_id = ?1",
                    params![player_id], |r| r.get(0),
                )?;
                let rank: i64 = conn.query_row(
                    "SELECT COUNT(DISTINCT player_id) + 1 FROM scores s2 WHERE (SELECT MAX(score) FROM scores WHERE player_id = s2.player_id) > ?1",
                    params![score], |r| r.get(0),
                )?;
                Ok(rank)
            }
            _ => Ok(0),
        }
    }
}
