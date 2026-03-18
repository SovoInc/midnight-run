use actix_web::{web, HttpResponse};
use crate::db::Db;
use crate::models::*;
use crate::achievement_defs::ACHIEVEMENTS;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/achievements")
            .route("/public/list", web::get().to(public_list))
            .route("/wallet/{wallet}", web::get().to(wallet_achievements)),
    );
}

async fn public_list(db: web::Data<Db>, query: web::Query<Prc1ListQuery>) -> HttpResponse {
    let network_id = query.network_id.as_deref().unwrap_or("preview");
    let total = db.total_players(network_id).unwrap_or(0);

    let mut achievements: Vec<Prc1Achievement> = ACHIEVEMENTS.iter().filter(|a| {
        if let Some(ref cat) = query.category {
            if a.category != cat.as_str() { return false; }
        }
        if let Some(active) = query.is_active {
            if active != true { return false; }
        }
        true
    }).map(|a| {
        let count = db.achievement_unlock_count(a.name, network_id).unwrap_or(0);
        let pct = if total > 0 { Some((count as f64 / total as f64) * 100.0) } else { None };
        Prc1Achievement {
            name: a.name.to_string(),
            display_name: a.display_name.to_string(),
            description: a.description.to_string(),
            is_active: true,
            score: a.score,
            category: a.category.to_string(),
            percent_completed: pct,
        }
    }).collect();

    let _ = &mut achievements;

    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    HttpResponse::Ok().json(Prc1AchievementList {
        id: "midnight-run".into(),
        name: "Midnight Run".into(),
        version: "0.1.0".into(),
        block: 0,
        caip2: "midnight:mainnet".into(),
        time: now,
        achievements,
    })
}

async fn wallet_achievements(db: web::Data<Db>, path: web::Path<String>) -> HttpResponse {
    let wallet = path.into_inner();

    let resolved = match db.resolve_player_by_address(&wallet) {
        Ok(Some(r)) => r,
        Ok(None) => return HttpResponse::NotFound().json(serde_json::json!({ "error": "player not found" })),
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    let (player_id, alias, wallet_addr, _sessions) = resolved;

    let unlocked: std::collections::HashSet<String> = db.player_achievements(player_id)
        .unwrap_or_default()
        .into_iter()
        .map(|(key, _)| key)
        .collect();

    let unlocked_dates: std::collections::HashMap<String, String> = db.player_achievements(player_id)
        .unwrap_or_default()
        .into_iter()
        .collect();

    let mut achievements: Vec<Prc1PlayerAchievement> = Vec::new();

    for def in ACHIEVEMENTS {
        let is_completed = unlocked.contains(def.name);
        let completed_date = unlocked_dates.get(def.name).cloned();

        let completed_rate = def.total.map(|total| {
            let progress = match def.name {
                "first_steps" | "night_owl" | "untouchable" => db.player_aggregate(player_id, "max_distance").unwrap_or(0.0),
                "shadow_dancer" => db.player_aggregate(player_id, "dashes_used").unwrap_or(0.0),
                "orb_hoarder" => db.player_aggregate(player_id, "orbs_collected").unwrap_or(0.0),
                "close_call" => db.player_aggregate(player_id, "max_near_misses").unwrap_or(0.0),
                "marathon_runner" => db.player_aggregate(player_id, "distance").unwrap_or(0.0),
                "deathless_dash" => db.player_aggregate(player_id, "max_walls_broken").unwrap_or(0.0),
                _ => 0.0,
            };
            CompletedRate { progress: progress.min(total), total }
        });

        achievements.push(Prc1PlayerAchievement {
            name: def.name.to_string(),
            completed: is_completed,
            completed_date,
            completed_rate,
        });
    }

    let completed_count = unlocked.len() as i64;
    let now = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();

    HttpResponse::Ok().json(Prc1PlayerAchievements {
        block: 0,
        caip2: "midnight:mainnet".into(),
        time: now,
        wallet,
        user_name: wallet_addr.or(Some(alias)),
        completed: completed_count,
        achievements,
    })
}
