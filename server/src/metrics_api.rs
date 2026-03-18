use actix_web::{web, HttpResponse};
use crate::db::Db;
use crate::models::*;
use crate::achievement_defs::ACHIEVEMENTS;

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/metrics")
            .route("", web::get().to(get_metadata))
            .route("/users/{address}", web::get().to(get_user_profile))
            .route("/{channel}", web::get().to(get_channel_rankings)),
    );
}

async fn get_metadata(db: web::Data<Db>, query: web::Query<ChannelQuery>) -> HttpResponse {
    let network_id = query.network_id.as_deref().unwrap_or("preview");
    let total = db.total_players(network_id).unwrap_or(0);

    let achievements: Vec<MetricAchievement> = ACHIEVEMENTS.iter().map(|a| {
        let unlock_count = db.achievement_unlock_count(a.name, network_id).unwrap_or(0);
        let pct = if total > 0 { Some((unlock_count as f64 / total as f64) * 100.0) } else { None };
        MetricAchievement {
            name: a.name.to_string(),
            display_name: a.display_name.to_string(),
            description: a.description.to_string(),
            is_active: true,
            score: a.score,
            category: a.category.to_string(),
            percent_completed: pct,
        }
    }).collect();

    let channels = vec![
        ChannelDef { id: "leaderboard".into(), name: "High Score".into(), description: "Best single-run score per player.".into(), score_unit: "Points".into(), sort_order: "DESC".into() },
        ChannelDef { id: "interactions".into(), name: "Runs Played".into(), description: "Total runs played per player.".into(), score_unit: "Runs Played".into(), sort_order: "DESC".into() },
        ChannelDef { id: "orbs_collected".into(), name: "Shadow Orbs".into(), description: "Total orbs collected across all runs.".into(), score_unit: "Shadow Orbs".into(), sort_order: "DESC".into() },
        ChannelDef { id: "distance".into(), name: "Total Distance".into(), description: "Total distance run across all runs.".into(), score_unit: "Meters".into(), sort_order: "DESC".into() },
        ChannelDef { id: "near_misses".into(), name: "Near Misses".into(), description: "Total near-miss events across all runs.".into(), score_unit: "Near Misses".into(), sort_order: "DESC".into() },
    ];

    HttpResponse::Ok().json(MetricsResponse {
        name: "Midnight Run".into(),
        description: "A cyberpunk endless runner where you play as The Blind Huntress, dashing through a neon-lit city at midnight.".into(),
        achievements,
        channels,
    })
}

async fn get_channel_rankings(
    db: web::Data<Db>,
    path: web::Path<String>,
    query: web::Query<ChannelQuery>,
) -> HttpResponse {
    let channel = path.into_inner();
    let now = chrono::Utc::now();
    let start = query.start_date.clone().unwrap_or_else(|| (now - chrono::Duration::days(365)).format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string());
    let end = query.end_date.clone().unwrap_or_else(|| now.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string());
    let limit = query.limit.unwrap_or(50).min(1000);
    let offset = query.offset.unwrap_or(0);
    let network_id = query.network_id.as_deref().unwrap_or("preview");

    let result = match channel.as_str() {
        "leaderboard" => db.channel_leaderboard(&start, &end, limit, offset, network_id),
        "interactions" => db.channel_interactions(&start, &end, limit, offset, network_id),
        "orbs_collected" | "distance" | "near_misses" => db.channel_cumulative(&channel, &start, &end, limit, offset, network_id),
        _ => return HttpResponse::NotFound().json(serde_json::json!({ "error": "unknown channel" })),
    };

    match result {
        Ok((total_players, total_score, rows)) => {
            let entries: Vec<RankEntry> = rows.into_iter().enumerate().map(|(i, (addr, name, score))| {
                RankEntry { rank: (offset + i as i64 + 1), address: addr, display_name: name, score }
            }).collect();
            HttpResponse::Ok().json(ChannelRankings {
                channel,
                start_date: Some(start),
                end_date: Some(end),
                total_players,
                total_score,
                entries,
            })
        }
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

async fn get_user_profile(
    db: web::Data<Db>,
    path: web::Path<String>,
    query: web::Query<UserQuery>,
) -> HttpResponse {
    let address = path.into_inner();

    let resolved = match db.resolve_player_by_address(&address) {
        Ok(Some(r)) => r,
        Ok(None) => return HttpResponse::NotFound().json(serde_json::json!({ "error": "player not found" })),
        Err(e) => return HttpResponse::InternalServerError().body(e.to_string()),
    };

    let (player_id, alias, wallet, sessions) = resolved;
    let canonical_address = wallet.clone().unwrap_or_else(|| format!("alias:{}", alias));

    let achievement_names: Vec<String> = db.player_achievements(player_id)
        .unwrap_or_default()
        .into_iter()
        .map(|(key, _)| key)
        .collect();

    let channels_data = if let Some(ref channel_ids) = query.channel {
        let mut map = serde_json::Map::new();
        for ch in channel_ids {
            let (score, rank) = match ch.as_str() {
                "leaderboard" => {
                    let s = db.player_aggregate(player_id, "max_score").unwrap_or(0.0);
                    let r = db.player_rank_in_channel(player_id, "leaderboard").unwrap_or(0);
                    (s, r)
                }
                "interactions" => {
                    let s = db.player_aggregate(player_id, "runs").unwrap_or(0.0);
                    (s, 0)
                }
                "orbs_collected" => (db.player_aggregate(player_id, "orbs_collected").unwrap_or(0.0), 0),
                "distance" => (db.player_aggregate(player_id, "distance").unwrap_or(0.0), 0),
                "near_misses" => (db.player_aggregate(player_id, "near_misses").unwrap_or(0.0), 0),
                _ => continue,
            };
            let runs = db.player_aggregate(player_id, "runs").unwrap_or(0.0) as i64;
            map.insert(ch.clone(), serde_json::json!({
                "stats": { "score": score, "rank": rank, "matchesPlayed": runs }
            }));
        }
        Some(serde_json::Value::Object(map))
    } else {
        None
    };

    HttpResponse::Ok().json(UserProfile {
        identity: Identity {
            address: canonical_address,
            delegated_from: sessions,
            display_name: wallet.or(Some(alias)),
        },
        achievements: achievement_names,
        channels: channels_data,
    })
}
