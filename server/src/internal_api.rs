use actix_web::{web, HttpRequest, HttpResponse};
use crate::db::Db;
use crate::models::*;
use crate::scoring;
use crate::achievement_eval;
use crate::session::AppState;

fn is_valid_wallet_address(addr: &str) -> bool {
    if addr.len() < 40 || addr.len() > 200 {
        return false;
    }
    if !addr.starts_with("mn_shield-addr_") {
        return false;
    }
    let body = &addr["mn_shield-addr_".len()..];
    body.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Extract and validate auth token from Authorization header.
/// Returns the authenticated player_id, or None if invalid/missing.
fn authenticate(req: &HttpRequest, db: &Db) -> Option<i64> {
    let header = req.headers().get("authorization")?.to_str().ok()?;
    let token = header.strip_prefix("Bearer ")?;
    db.validate_auth_token(token).ok()?
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api")
            .route("/alias", web::post().to(post_alias))
            .route("/wallet", web::post().to(post_wallet))
            .route("/session/start", web::post().to(post_session_start))
            .route("/run", web::post().to(post_run))
            .route("/scores", web::post().to(post_score))
            .route("/scores/top", web::get().to(get_top_scores))
            .route("/scores/player/{id}", web::get().to(get_player_scores))
            .route("/stats/player/{id}", web::get().to(get_player_stats))
            .route("/achievements/{player_id}", web::get().to(get_achievements))
            .route("/inventory", web::get().to(get_inventory))
            .route("/inventory/purchase-character", web::post().to(post_purchase_character))
            .route("/inventory/purchase-boost", web::post().to(post_purchase_boost))
            .route("/inventory/consume-boost", web::post().to(post_consume_boost)),
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
    if !is_valid_wallet_address(wallet_address) {
        return HttpResponse::BadRequest().body("invalid wallet address format");
    }
    let network_id = if body.network_id.is_empty() { "preview" } else { &body.network_id };

    match db.upsert_wallet(wallet_address, network_id) {
        Ok((id, alias, wallet, net)) => {
            let auth_token = db.create_auth_token(id).unwrap_or_default();
            HttpResponse::Ok().json(serde_json::json!({
                "id": id,
                "alias": alias,
                "wallet_address": wallet,
                "network_id": net,
                "created_at": "",
                "auth_token": auth_token,
            }))
        },
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn post_session_start(req: HttpRequest, db: web::Data<Db>, app: web::Data<AppState>, body: web::Json<SessionStartRequest>) -> HttpResponse {
    match authenticate(&req, &db) {
        Some(pid) if pid == body.player_id => {},
        _ => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "unauthorized" })),
    }

    let wallet = match db.player_wallet(body.player_id) {
        Ok(Some(w)) => w,
        Ok(None) => return HttpResponse::BadRequest().json(serde_json::json!({ "error": "player has no wallet" })),
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    let session_id = match db.create_run_session(body.player_id) {
        Ok(id) => id,
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    match app.create_session_token(&session_id, body.player_id, &wallet) {
        Ok(token) => HttpResponse::Ok().json(serde_json::json!({ "token": token })),
        Err(e) => HttpResponse::InternalServerError().body(e),
    }
}

async fn post_run(req: HttpRequest, db: web::Data<Db>, app: web::Data<AppState>, body: web::Json<RunSubmission>) -> HttpResponse {
    // 1. Decode the run JWT using the session token as HMAC key
    let run = match app.decode_run_token(&body.run_token, &body.session_token) {
        Ok(r) => r,
        Err(msg) => return HttpResponse::BadRequest().json(serde_json::json!({ "error": msg })),
    };

    // 2. Authenticate: Bearer token must match player_id inside the run
    match authenticate(&req, &db) {
        Some(pid) if pid == run.player_id => {},
        _ => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "unauthorized" })),
    }

    // 3. Look up wallet for session JWT verification
    let wallet = match db.player_wallet(run.player_id) {
        Ok(Some(w)) => w,
        Ok(None) => return HttpResponse::BadRequest().json(serde_json::json!({ "error": "player has no wallet" })),
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    // 4. Validate session JWT (signed with server_secret + wallet_address)
    let (session_id, session_pid, _elapsed_ms) =
        match app.validate_session_token(&body.session_token, &wallet) {
            Ok(v) => v,
            Err(msg) => return HttpResponse::BadRequest().json(serde_json::json!({ "error": msg })),
        };

    if session_pid != run.player_id {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "session/run player mismatch" }));
    }

    // 5. Consume DB session (one-time use) and get created_at for elapsed check
    let (valid, created_at) = match db.consume_run_session(&session_id, run.player_id) {
        Ok(r) => r,
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };
    if !valid {
        return HttpResponse::UnprocessableEntity().json(
            serde_json::json!({ "error": "invalid or reused session token" })
        );
    }

    // 6. Compute session elapsed time
    let session_elapsed = {
        let now = chrono::Utc::now().naive_utc();
        let created = chrono::NaiveDateTime::parse_from_str(&created_at, "%Y-%m-%d %H:%M:%S")
            .unwrap_or(now);
        (now - created).num_milliseconds() as f64 / 1000.0
    };

    // 7. Validate plausibility
    if let Err(e) = scoring::validate_run(
        run.raw_distance, run.orbs_collected, run.near_misses,
        run.dashes_used, run.walls_broken, run.duration_secs,
        session_elapsed,
    ) {
        return HttpResponse::UnprocessableEntity().json(
            serde_json::json!({ "error": e.reason })
        );
    }

    // 8. Compute score server-side
    let computed = scoring::compute_score(run.raw_distance, run.orbs_collected, run.near_misses);

    // 9. Insert score row
    let score_id = match db.insert_score(
        run.player_id, computed.score, computed.display_distance,
        run.orbs_collected, run.near_misses, run.dashes_used,
        run.walls_broken, run.duration_secs,
        run.raw_distance, run.damage_taken, run.reached_max_speed,
    ) {
        Ok(id) => id,
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    // 10. Evaluate achievements
    let network_id = {
        let conn = db.conn.lock().unwrap();
        conn.query_row(
            "SELECT network_id FROM players WHERE id = ?1",
            rusqlite::params![run.player_id],
            |r| r.get::<_, String>(0),
        ).unwrap_or_else(|_| "preview".to_string())
    };

    let run_input = achievement_eval::RunInput {
        raw_distance: run.raw_distance,
        display_distance: computed.display_distance,
        orbs_collected: run.orbs_collected,
        near_misses: run.near_misses,
        dashes_used: run.dashes_used,
        walls_broken: run.walls_broken,
        score: computed.score,
        reached_max_speed: run.reached_max_speed,
        damage_taken: run.damage_taken,
    };

    let achievements = achievement_eval::evaluate_achievements(&db, run.player_id, &run_input, &network_id);

    // 11. Credit orbs to player inventory
    let orb_balance = db.credit_orbs(run.player_id, run.orbs_collected).unwrap_or(0);

    // 12. Return result
    HttpResponse::Ok().json(RunResult {
        score_id,
        score: computed.score,
        distance: computed.display_distance,
        orb_balance,
        achievements_unlocked: achievements.iter().map(|(k, _)| k.clone()).collect(),
        achievements_display: achievements.iter().map(|(_, d)| d.clone()).collect(),
    })
}

/// Legacy endpoint kept for backward compatibility
async fn post_score(req: HttpRequest, db: web::Data<Db>, body: web::Json<ScoreSubmission>) -> HttpResponse {
    match authenticate(&req, &db) {
        Some(pid) if pid == body.player_id => {},
        _ => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "unauthorized" })),
    }
    match db.insert_score(
        body.player_id, body.score, body.distance,
        body.orbs_collected, body.near_misses, body.dashes_used,
        body.walls_broken, body.duration_secs,
        0.0, false, false,
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

async fn get_inventory(req: HttpRequest, db: web::Data<Db>, query: web::Query<InventoryQuery>) -> HttpResponse {
    let player_id = match query.player_id {
        Some(id) => id,
        None => return HttpResponse::BadRequest().body("player_id required"),
    };
    match authenticate(&req, &db) {
        Some(pid) if pid == player_id => {},
        _ => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "unauthorized" })),
    }
    match db.get_inventory(player_id) {
        Ok((orb_balance, unlocked_characters, boost_speed, boost_magnet)) => {
            HttpResponse::Ok().json(InventoryResponse {
                orb_balance, unlocked_characters, boost_speed, boost_magnet,
            })
        }
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

// Character costs must match CharacterRegistry.ts
fn character_cost(id: &str) -> Option<i64> {
    match id {
        "default" => Some(0),
        "ninja" => Some(500),
        "huntress" => Some(1500),
        "knight" => Some(5000),
        _ => None,
    }
}

fn boost_cost(id: &str) -> Option<i64> {
    match id {
        "speed_boost" => Some(50),
        "orb_magnet" => Some(75),
        _ => None,
    }
}

async fn post_purchase_character(req: HttpRequest, db: web::Data<Db>, body: web::Json<PurchaseCharacterRequest>) -> HttpResponse {
    match authenticate(&req, &db) {
        Some(pid) if pid == body.player_id => {},
        _ => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "unauthorized" })),
    }
    let cost = match character_cost(&body.character_id) {
        Some(c) => c,
        None => return HttpResponse::BadRequest().json(serde_json::json!({ "error": "unknown_character" })),
    };
    match db.purchase_character(body.player_id, &body.character_id, cost) {
        Ok(Ok(new_balance)) => {
            let (_, chars, boost_speed, boost_magnet) = db.get_inventory(body.player_id).unwrap();
            HttpResponse::Ok().json(InventoryResponse {
                orb_balance: new_balance, unlocked_characters: chars, boost_speed, boost_magnet,
            })
        }
        Ok(Err(reason)) => HttpResponse::UnprocessableEntity().json(serde_json::json!({ "error": reason })),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn post_purchase_boost(req: HttpRequest, db: web::Data<Db>, body: web::Json<PurchaseBoostRequest>) -> HttpResponse {
    match authenticate(&req, &db) {
        Some(pid) if pid == body.player_id => {},
        _ => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "unauthorized" })),
    }
    let cost = match boost_cost(&body.boost_id) {
        Some(c) => c,
        None => return HttpResponse::BadRequest().json(serde_json::json!({ "error": "unknown_boost" })),
    };
    match db.purchase_boost(body.player_id, &body.boost_id, cost) {
        Ok(Ok((new_balance, _))) => {
            let (_, chars, boost_speed, boost_magnet) = db.get_inventory(body.player_id).unwrap();
            HttpResponse::Ok().json(InventoryResponse {
                orb_balance: new_balance, unlocked_characters: chars, boost_speed, boost_magnet,
            })
        }
        Ok(Err(reason)) => HttpResponse::UnprocessableEntity().json(serde_json::json!({ "error": reason })),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn post_consume_boost(req: HttpRequest, db: web::Data<Db>, body: web::Json<ConsumeBoostRequest>) -> HttpResponse {
    match authenticate(&req, &db) {
        Some(pid) if pid == body.player_id => {},
        _ => return HttpResponse::Unauthorized().json(serde_json::json!({ "error": "unauthorized" })),
    }
    match db.consume_boost(body.player_id, &body.boost_id) {
        Ok(Ok(_)) => {
            let (orb_balance, chars, boost_speed, boost_magnet) = db.get_inventory(body.player_id).unwrap();
            HttpResponse::Ok().json(InventoryResponse {
                orb_balance, unlocked_characters: chars, boost_speed, boost_magnet,
            })
        }
        Ok(Err(reason)) => HttpResponse::UnprocessableEntity().json(serde_json::json!({ "error": reason })),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}
