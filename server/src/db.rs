use rusqlite::{Connection, Result, params};
use std::sync::Mutex;

pub struct Db {
    pub conn: Mutex<Connection>,
}

impl Db {
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

            CREATE INDEX IF NOT EXISTS idx_scores_ranking ON scores(score DESC);
            CREATE INDEX IF NOT EXISTS idx_scores_created ON scores(created_at);
            CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
            CREATE INDEX IF NOT EXISTS idx_achievements_player ON achievements(player_id);
            CREATE INDEX IF NOT EXISTS idx_session_wallets_player ON session_wallets(main_player_id);
            ",
        )?;
        Ok(())
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

    pub fn insert_score(
        &self, player_id: i64, score: i64, distance: i64,
        orbs: i64, near_misses: i64, dashes: i64, walls: i64, duration: f64,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO scores (player_id, score, distance, orbs_collected, near_misses, dashes_used, walls_broken, duration_secs) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![player_id, score, distance, orbs, near_misses, dashes, walls, duration],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn top_scores(&self, limit: i64) -> Result<Vec<(i64, String, i64, i64, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, p.alias, s.score, s.distance, s.player_id
             FROM scores s JOIN players p ON s.player_id = p.id
             ORDER BY s.score DESC LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![limit], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn player_scores(&self, player_id: i64) -> Result<Vec<(i64, String, i64, i64, i64)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, p.alias, s.score, s.distance, s.player_id
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.player_id = ?1 ORDER BY s.score DESC LIMIT 20",
        )?;
        let rows = stmt.query_map(params![player_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
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

    pub fn total_players(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM players", [], |r| r.get(0))?;
        Ok(count)
    }

    pub fn achievement_unlock_count(&self, key: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT player_id) FROM achievements WHERE achievement_key = ?1",
            params![key], |r| r.get(0),
        )?;
        Ok(count)
    }

    pub fn channel_leaderboard(
        &self, start: &str, end: &str, limit: i64, offset: i64,
    ) -> Result<(i64, f64, Vec<(String, Option<String>, f64)>)> {
        let conn = self.conn.lock().unwrap();
        let total_players: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT player_id) FROM scores WHERE created_at >= ?1 AND created_at <= ?2",
            params![start, end], |r| r.get(0),
        )?;
        let total_score: f64 = conn.query_row(
            "SELECT COALESCE(SUM(best), 0) FROM (SELECT MAX(score) as best FROM scores WHERE created_at >= ?1 AND created_at <= ?2 GROUP BY player_id)",
            params![start, end], |r| r.get(0),
        )?;
        let mut stmt = conn.prepare(
            "SELECT COALESCE(p.wallet_address, 'alias:' || p.alias), p.alias, MAX(s.score) as best
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.created_at >= ?1 AND s.created_at <= ?2
             GROUP BY s.player_id ORDER BY best DESC LIMIT ?3 OFFSET ?4",
        )?;
        let rows = stmt.query_map(params![start, end, limit, offset], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, f64>(2)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok((total_players, total_score, rows))
    }

    pub fn channel_cumulative(
        &self, column: &str, start: &str, end: &str, limit: i64, offset: i64,
    ) -> Result<(i64, f64, Vec<(String, Option<String>, f64)>)> {
        let conn = self.conn.lock().unwrap();
        let col = match column {
            "orbs_collected" | "distance" | "near_misses" | "dashes_used" | "walls_broken" => column,
            _ => return Ok((0, 0.0, vec![])),
        };
        let q_total_players = format!(
            "SELECT COUNT(DISTINCT player_id) FROM scores WHERE created_at >= ?1 AND created_at <= ?2"
        );
        let total_players: i64 = conn.query_row(&q_total_players, params![start, end], |r| r.get(0))?;

        let q_total_score = format!(
            "SELECT COALESCE(SUM({}), 0) FROM scores WHERE created_at >= ?1 AND created_at <= ?2", col
        );
        let total_score: f64 = conn.query_row(&q_total_score, params![start, end], |r| r.get(0))?;

        let q = format!(
            "SELECT COALESCE(p.wallet_address, 'alias:' || p.alias), p.alias, SUM(s.{}) as total
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.created_at >= ?1 AND s.created_at <= ?2
             GROUP BY s.player_id ORDER BY total DESC LIMIT ?3 OFFSET ?4", col
        );
        let mut stmt = conn.prepare(&q)?;
        let rows = stmt.query_map(params![start, end, limit, offset], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, f64>(2)?))
        })?.collect::<Result<Vec<_>>>()?;
        Ok((total_players, total_score, rows))
    }

    pub fn channel_interactions(
        &self, start: &str, end: &str, limit: i64, offset: i64,
    ) -> Result<(i64, f64, Vec<(String, Option<String>, f64)>)> {
        let conn = self.conn.lock().unwrap();
        let total_players: i64 = conn.query_row(
            "SELECT COUNT(DISTINCT player_id) FROM scores WHERE created_at >= ?1 AND created_at <= ?2",
            params![start, end], |r| r.get(0),
        )?;
        let total_score: f64 = conn.query_row(
            "SELECT CAST(COUNT(*) AS REAL) FROM scores WHERE created_at >= ?1 AND created_at <= ?2",
            params![start, end], |r| r.get(0),
        )?;
        let mut stmt = conn.prepare(
            "SELECT COALESCE(p.wallet_address, 'alias:' || p.alias), p.alias, CAST(COUNT(*) AS REAL) as runs
             FROM scores s JOIN players p ON s.player_id = p.id
             WHERE s.created_at >= ?1 AND s.created_at <= ?2
             GROUP BY s.player_id ORDER BY runs DESC LIMIT ?3 OFFSET ?4",
        )?;
        let rows = stmt.query_map(params![start, end, limit, offset], |row| {
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

        // best no-damage distance: max distance among runs where damage_taken would be 0
        // We don't store damage_taken directly, but we can approximate:
        // a run with 0 near_misses and full health isn't trackable, so use a dedicated query
        // For now, use the best distance from localStorage merge on the frontend side
        let best_no_damage_distance: i64 = 0;

        // max speed reached isn't stored in DB either
        let max_speed_reached = false;

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
