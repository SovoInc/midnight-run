mod achievement_defs;
mod achievement_eval;
mod achievements_api;
mod db;
mod internal_api;
mod metrics_api;
mod models;
mod rate_limit;
mod scoring;
mod session;

use actix_files::Files;
use actix_web::{web, App, HttpServer};
use db::Db;
use rate_limit::RateLimiter;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let db_path = std::env::var("DB_PATH").unwrap_or_else(|_| "midnight_runner.db".into());

    let db = Db::new(&db_path).expect("Failed to open database");

    if let Ok(n) = db.prune_expired_tokens() {
        if n > 0 {
            println!("Pruned {n} expired auth tokens");
        }
    }

    let db_data = web::Data::new(db);

    let jwt_secret = format!("{}{}", uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
    let app_state = web::Data::new(session::AppState::new(jwt_secret));

    let rl_state = rate_limit::new_state();

    println!("Midnight Run starting on http://localhost:{port}");

    HttpServer::new(move || {
        App::new()
            .wrap(RateLimiter::new(rl_state.clone(), 300, 60))
            .app_data(db_data.clone())
            .app_data(app_state.clone())
            .configure(internal_api::config)
            .configure(metrics_api::config)
            .configure(achievements_api::config)
            .service(Files::new("/", "./static").index_file("index.html"))
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}
