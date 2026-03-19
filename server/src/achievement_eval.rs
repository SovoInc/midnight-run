use crate::achievement_defs::ACHIEVEMENTS;
use crate::db::Db;

pub struct RunInput {
    pub raw_distance: f64,
    pub display_distance: i64,
    pub orbs_collected: i64,
    pub near_misses: i64,
    pub dashes_used: i64,
    pub walls_broken: i64,
    pub score: i64,
    pub reached_max_speed: bool,
    pub damage_taken: bool,
}

/// Evaluates which achievements are newly unlocked by this run.
/// Must be called *after* the score row is inserted so cumulative queries include this run.
pub fn evaluate_achievements(
    db: &Db,
    player_id: i64,
    run: &RunInput,
    network_id: &str,
) -> Vec<(String, String)> {
    let already_unlocked = db.player_achievements(player_id).unwrap_or_default();
    let unlocked_keys: std::collections::HashSet<String> =
        already_unlocked.into_iter().map(|(k, _)| k).collect();

    let mut newly_unlocked: Vec<(String, String)> = Vec::new();

    for def in ACHIEVEMENTS {
        if unlocked_keys.contains(def.name) {
            continue;
        }

        let earned = match def.name {
            "first_steps" => run.display_distance >= 100,
            "night_owl" => run.display_distance >= 1000,
            "shadow_dancer" => {
                let total: f64 = db.player_aggregate(player_id, "dashes_used").unwrap_or(0.0);
                total as i64 >= 50
            }
            "untouchable" => run.display_distance >= 500 && !run.damage_taken,
            "orb_hoarder" => {
                let total: f64 = db.player_aggregate(player_id, "orbs_collected").unwrap_or(0.0);
                total as i64 >= 500
            }
            "close_call" => run.near_misses >= 10,
            "speed_demon" => run.reached_max_speed,
            "marathon_runner" => {
                let total: f64 = db.player_aggregate(player_id, "distance").unwrap_or(0.0);
                total as i64 >= 5000
            }
            "deathless_dash" => run.walls_broken >= 5,
            "midnight_legend" => {
                let top = db.top_scores(10, network_id).unwrap_or_default();
                let threshold = if top.len() >= 10 {
                    top.last().map(|r| r.3).unwrap_or(0)
                } else {
                    0
                };
                run.score > 0 && run.score >= threshold
            }
            _ => false,
        };

        if earned {
            let _ = db.unlock_achievement(player_id, def.name);
            newly_unlocked.push((def.name.to_string(), def.display_name.to_string()));
        }
    }

    newly_unlocked
}
