use actix_web::{web, HttpResponse};
use crate::db::Db;
use crate::models::*;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/alias", web::post().to(post_alias))
            .route("/wallet", web::post().to(post_wallet))
            .route("/scores", web::post().to(post_score))
            .route("/scores/top", web::get().to(get_top_scores))
            .route("/scores/player/{id}", web::get().to(get_player_scores))
            .route("/stats/player/{id}", web::get().to(get_player_stats))
            .route("/achievements", web::post().to(post_achievement))
            .route("/achievements/{player_id}", web::get().to(get_achievements)),
    );
}

async fn post_alias(db: web::Data<Db>, body: web::Json<AliasRequest>) -> HttpResponse {
    match db.upsert_alias(&body.alias) {
        Ok((id, alias, wallet)) => HttpResponse::Ok().json(Player {
            id, alias, wallet_address: wallet, network_id: "preview".to_string(), created_at: String::new(),
        }),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn post_wallet(db: web::Data<Db>, body: web::Json<WalletRequest>) -> HttpResponse {
    let wallet_address = body.wallet_address.trim();
    if wallet_address.is_empty() {
        return HttpResponse::BadRequest().body("wallet_address is required");
    }
    let network_id = if body.network_id.is_empty() { "preview" } else { &body.network_id };

    match db.upsert_wallet(wallet_address, network_id) {
        Ok((id, alias, wallet, net)) => HttpResponse::Ok().json(Player {
            id, alias, wallet_address: wallet, network_id: net, created_at: String::new(),
        }),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn post_score(db: web::Data<Db>, body: web::Json<ScoreSubmission>) -> HttpResponse {
    match db.insert_score(
        body.player_id, body.score, body.distance,
        body.orbs_collected, body.near_misses, body.dashes_used,
        body.walls_broken, body.duration_secs,
    ) {
        Ok(id) => HttpResponse::Ok().json(serde_json::json!({ "id": id })),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn get_top_scores(db: web::Data<Db>, query: web::Query<LimitQuery>) -> HttpResponse {
    let limit = query.limit.unwrap_or(20).min(100);
    let network_id = query.network_id.as_deref().unwrap_or("preview");
    match db.top_scores(limit, network_id) {
        Ok(rows) => {
            let entries: Vec<ScoreEntry> = rows.into_iter().enumerate().map(|(i, (_, display_name, wallet_address, score, dist, pid))| {
                ScoreEntry {
                    rank: (i + 1) as i64,
                    display_name,
                    wallet_address,
                    score,
                    distance: dist,
                    player_id: pid,
                }
            }).collect();
            HttpResponse::Ok().json(entries)
        }
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn get_player_scores(db: web::Data<Db>, path: web::Path<i64>) -> HttpResponse {
    let player_id = path.into_inner();
    match db.player_scores(player_id) {
        Ok(rows) => {
            let entries: Vec<ScoreEntry> = rows.into_iter().enumerate().map(|(i, (_, display_name, wallet_address, score, dist, pid))| {
                ScoreEntry {
                    rank: (i + 1) as i64,
                    display_name,
                    wallet_address,
                    score,
                    distance: dist,
                    player_id: pid,
                }
            }).collect();
            HttpResponse::Ok().json(entries)
        }
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn get_player_stats(db: web::Data<Db>, path: web::Path<i64>) -> HttpResponse {
    let player_id = path.into_inner();
    match db.player_stats(player_id) {
        Ok((total_runs, total_distance, total_orbs, total_dashes,
            best_score, best_distance, best_near_misses, best_walls_broken,
            best_no_damage_distance, max_speed_reached)) => {
            HttpResponse::Ok().json(PlayerStats {
                total_runs, total_distance, total_orbs, total_dashes,
                best_score, best_distance, best_near_misses, best_walls_broken,
                best_no_damage_distance, max_speed_reached,
            })
        }
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn post_achievement(db: web::Data<Db>, body: web::Json<AchievementUnlock>) -> HttpResponse {
    match db.unlock_achievement(body.player_id, &body.achievement_key) {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn get_achievements(db: web::Data<Db>, path: web::Path<i64>) -> HttpResponse {
    let player_id = path.into_inner();
    match db.player_achievements(player_id) {
        Ok(rows) => {
            let entries: Vec<AchievementRecord> = rows.into_iter().map(|(key, at)| {
                AchievementRecord { achievement_key: key, unlocked_at: at }
            }).collect();
            HttpResponse::Ok().json(entries)
        }
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}
