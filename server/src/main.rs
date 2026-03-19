mod achievement_defs;
mod achievement_eval;
mod achievements_api;
mod db;
mod internal_api;
mod metrics_api;
mod models;
mod scoring;

use actix_files::Files;
use actix_web::{web, App, HttpServer};
use db::Db;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let db_path = std::env::var("DB_PATH").unwrap_or_else(|_| "midnight_runner.db".into());

    let db = Db::new(&db_path).expect("Failed to open database");
    let db_data = web::Data::new(db);

    println!("Midnight Run starting on http://localhost:{port}");

    HttpServer::new(move || {
        App::new()
            .app_data(db_data.clone())
            .configure(internal_api::config)
            .configure(metrics_api::config)
            .configure(achievements_api::config)
            .service(Files::new("/", "./static").index_file("index.html"))
    })
    .bind(("127.0.0.1", port))?
    .run()
    .await
}
